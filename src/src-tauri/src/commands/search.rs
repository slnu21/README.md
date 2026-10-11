//! 워크스페이스 전역 전문검색(SQLite FTS5). 가져오기/감시 변경 시 인덱싱, bm25 랭킹 질의.
//! 스니펫 하이라이트는 HTML 대신 센티넬 문자(STX/ETX)로 표시 → 프런트에서 텍스트 분해(인젝션 차단).
use crate::db::{now_ms, Db};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::path::Path;
use tauri::{AppHandle, Emitter, State};

const INDEX_EXTS: [&str; 4] = ["md", "markdown", "mdx", "txt"];
const MAX_INDEX_SIZE: i64 = 2 * 1024 * 1024;
const SKIP_DIRS: [&str; 6] = ["node_modules", ".git", "target", "dist", ".vs", ".idea"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    real_path: String,
    name: String,
    snippet: String,
}

fn basename(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string())
}

fn is_indexable(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| INDEX_EXTS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

/// 사용자 질의 → 안전한 FTS5 MATCH 식. 토큰을 영숫자/밑줄만 남겨 연산자/구문오류 차단,
/// 암묵 AND, 마지막 토큰은 접두 검색(*). 빈 질의면 None.
pub(crate) fn build_match(raw: &str) -> Option<String> {
    let tokens: Vec<String> = raw
        .split_whitespace()
        .map(|t| t.chars().filter(|c| c.is_alphanumeric() || *c == '_').collect::<String>())
        .filter(|t| !t.is_empty())
        .collect();
    if tokens.is_empty() {
        return None;
    }
    let last = tokens.len() - 1;
    let parts: Vec<String> = tokens
        .iter()
        .enumerate()
        .map(|(i, t)| if i == last { format!("{t}*") } else { t.clone() })
        .collect();
    Some(parts.join(" "))
}

/// `path` 가 `root` 자신이거나 그 하위면 root 기준 상대 경로를 돌려준다(자기 자신이면 "").
///
/// 왜 직접 쓰나: SQL `LIKE 'root%'` 만으로는 두 가지가 틀린다 — ① `C:\a` 가 형제 폴더
/// `C:\ab\x.md` 까지 잡는다(구분자 경계를 요구하지 않는다) ② 실제 경로에 들어 있는 `%`·`_`
/// 가 SQL 와일드카드로 먹는다(Windows 는 `\` 가 구분자라 ESCAPE 지정도 깨끗하지 않다).
/// 그래서 LIKE 는 **거친 필터**로만 쓰고(와일드카드는 더 많이 잡을 뿐 덜 잡지 않으므로 안전)
/// 최종 판정은 여기서 한다. 구분자 종류와 ASCII 대소문자는 무시한다(Windows).
pub(crate) fn rel_under<'a>(path: &'a str, root: &str) -> Option<&'a str> {
    let root = root.trim_end_matches(['/', '\\']);
    if root.is_empty() {
        return None;
    }
    let (pb, rb) = (path.as_bytes(), root.as_bytes());
    if pb.len() < rb.len() {
        return None;
    }
    // ASCII 소문자화·구분자 통일은 바이트 길이를 바꾸지 않으므로 비ASCII(한글 경로)도 안전하다.
    let norm = |x: u8| if x == b'\\' { b'/' } else { x.to_ascii_lowercase() };
    if (0..rb.len()).any(|i| norm(pb[i]) != norm(rb[i])) {
        return None;
    }
    if pb.len() == rb.len() {
        return Some("");
    }
    let rest = &path[rb.len()..];
    match rest.chars().next() {
        Some(c) if c == '/' || c == '\\' => Some(&rest[c.len_utf8()..]),
        _ => None, // 형제 접두어(C:\ab vs C:\a)
    }
}

pub(crate) fn under_root(path: &str, root: &str) -> bool {
    rel_under(path, root).is_some()
}

/// 경로 비교용 키(구분자 통일 + ASCII 소문자화). 인덱스에 남은 문자열은 walk 가 만든 것과
/// 감시기(notify)가 준 것이 섞여 있어 대소문자·구분자가 어긋날 수 있다 — 그걸 같게 본다.
fn norm_key(s: &str) -> String {
    s.chars()
        .map(|c| if c == '\\' { '/' } else { c.to_ascii_lowercase() })
        .collect()
}

/// `root` 하위로 인덱스에 남아 있는 경로들. LIKE 는 거친 필터, 판정은 `under_root`.
/// file_meta 만 본다 — v4 부터 색인 행은 전부 메타의 짝이다(file_index 를 LIKE 로 훑으면 전체 스캔).
fn indexed_under(conn: &Connection, root: &str) -> Result<Vec<String>, String> {
    let like = format!("{}%", root.trim_end_matches(['/', '\\']));
    let mut stmt = conn
        .prepare("SELECT real_path FROM file_meta WHERE real_path LIKE ?1")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![like], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        let p = r.map_err(|e| e.to_string())?;
        if under_root(&p, root) {
            out.push(p);
        }
    }
    Ok(out)
}

/// 색인이 들고 있는 (mtime, 내용). 기록을 뜨기 직전에만 쓴다.
/// **rowid 로 찾는다** — `file_index.real_path` 는 UNINDEXED 라 경로로 찾으면 전체 스캔이다(v4).
fn last_indexed(conn: &Connection, path: &str) -> Option<(i64, String)> {
    conn.query_row(
        "SELECT m.mtime, f.content FROM file_meta m JOIN file_index f ON f.rowid = m.fts_rowid
         WHERE m.real_path = ?1",
        params![path],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )
    .optional()
    .ok()
    .flatten()
}

/// 이 경로의 색인 행 rowid(file_meta 가 짝으로 들고 있는 것).
fn fts_rowid_of(conn: &Connection, path: &str) -> Result<Option<i64>, String> {
    conn.query_row("SELECT fts_rowid FROM file_meta WHERE real_path = ?1", params![path], |r| r.get(0))
        .optional()
        .map(Option::flatten)
        .map_err(|e| e.to_string())
}

pub(crate) fn remove_path(conn: &Connection, path: &str) -> Result<(), String> {
    // 문서가 사라진다 — 색인이 들고 있던 마지막 내용을 여기서 한 판 떠 둔다. 지워진 문서야말로
    // 되돌리고 싶은 것이고, 색인이 비워지면 우리에게 남는 사본이 없다(commands/history.rs).
    // 실패는 무시 — 기록 하나 때문에 색인 정리를 실패시킬 이유가 없다.
    if let Some((last_mtime, last_text)) = last_indexed(conn, path) {
        let _ = crate::commands::history::capture(conn, path, &last_text, last_mtime);
    }
    if let Some(rowid) = fts_rowid_of(conn, path)? {
        conn.execute("DELETE FROM file_index WHERE rowid = ?1", params![rowid])
            .map_err(|e| e.to_string())?;
    }
    conn.execute("DELETE FROM file_meta WHERE real_path = ?1", params![path])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 단일 파일 인덱싱. mtime/size 동일하면 skip. 접근 불가/과대/바이너리는 인덱스에서 제거.
/// 반환: 실제로 (재)인덱싱했으면 true.
pub(crate) fn index_file(conn: &Connection, path: &str) -> Result<bool, String> {
    let meta = match std::fs::metadata(path) {
        Ok(m) => m,
        Err(_) => {
            remove_path(conn, path)?;
            return Ok(false);
        }
    };
    let size = meta.len() as i64;
    if size > MAX_INDEX_SIZE {
        remove_path(conn, path)?;
        return Ok(false);
    }
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    let prev: Option<(i64, i64, Option<i64>)> = conn
        .query_row(
            "SELECT mtime, size, fts_rowid FROM file_meta WHERE real_path = ?1",
            params![path],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    // 짝 색인 행이 없는 메타(v4 이전에 어긋난 것)는 같은 mtime 이어도 다시 색인한다.
    if let Some((pm, ps, Some(_))) = prev {
        if pm == mtime && ps == size {
            return Ok(false);
        }
    }

    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => {
            remove_path(conn, path)?;
            return Ok(false);
        }
    };
    // **덮기 직전이 마지막 기회다.** 남이 쓴 변경은 우리가 가로챌 수 없으므로, 색인이 들고
    // 있던 옛 내용이 새 내용으로 덮이기 전에 한 판 떠 둔다(commands/history.rs).
    if let Some((last_mtime, last_text)) = last_indexed(conn, path) {
        let _ = crate::commands::history::capture(conn, path, &last_text, last_mtime);
    }
    if let Some(rowid) = prev.and_then(|p| p.2) {
        conn.execute("DELETE FROM file_index WHERE rowid = ?1", params![rowid])
            .map_err(|e| e.to_string())?;
    }
    conn.execute(
        "INSERT INTO file_index (real_path, content) VALUES (?1, ?2)",
        params![path, content],
    )
    .map_err(|e| e.to_string())?;
    let rowid = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO file_meta (real_path, mtime, size, indexed_at, fts_rowid) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(real_path) DO UPDATE SET mtime=excluded.mtime, size=excluded.size,
           indexed_at=excluded.indexed_at, fts_rowid=excluded.fts_rowid",
        params![path, mtime, size, now_ms(), rowid],
    )
    .map_err(|e| e.to_string())?;
    Ok(true)
}

/// 폴더 재귀 walk 인덱싱(스택 기반). 숨김/무거운 디렉터리·비대상 확장자·과대 파일 skip.
///
/// walk 하면서 만난 인덱스 대상 경로를 모아 두었다가, 끝나고 **인덱스에만 남아 있는 경로를
/// 지운다**(prune). `index_file` 은 mtime/size 가 같으면 skip 하는 증분이라 추가·수정만 반영하고,
/// 앱이 꺼져 있는 동안 지워진 파일은 영영 검색 결과에 남아 있었다. 디스크는 어차피 한 번 훑으므로
/// 별도 stat 없이 여기서 함께 정리한다.
///
/// 반환: (인덱싱한 수, 정리한 수).
pub(crate) fn index_folder(conn: &Connection, root: &Path) -> Result<(u32, u32), String> {
    let root_s = root.to_string_lossy().into_owned();
    // 이 루트를 **처음** 가져오는가. 처음이면 그 안의 문서는 전부 이미 있던 것이므로 받은
    // 문서함에 올리지 않는다 — 폴더를 가져오자마자 수백 건이 뜨면 신호가 아니라 소음이다.
    // 반대로 이미 아는 루트를 다시 훑는 것(부팅 재색인)이면 바뀐 것은 알림 대상이 맞다:
    // **앱이 꺼져 있는 동안 에이전트가 써 놓은 것**이 정확히 그 경우다.
    let fresh_root = indexed_under(conn, &root_s)?.is_empty();
    // **커밋을 묶는다** — 자동 커밋이면 파일 하나에 문장 서넛 = WAL fsync 서넛이다. 다만 한 덩어리로
    // 끝까지 묶으면 그동안 포그라운드 쓰기(앱 저장의 mark_seen 등)가 busy_timeout 까지 기다리므로
    // BATCH 개마다 끊는다. 중간에 실패하면 Transaction 이 drop 되며 그 묶음만 되돌린다.
    const BATCH: u32 = 200;
    let mut tx = Some(conn.unchecked_transaction().map_err(|e| e.to_string())?);
    let mut count = 0u32;
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.filter_map(|e| e.ok()) {
            let p = entry.path();
            let fname = p
                .file_name()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default();
            if fname.starts_with('.') {
                continue;
            }
            if p.is_dir() {
                if !SKIP_DIRS.contains(&fname.as_str()) {
                    stack.push(p);
                }
            } else if is_indexable(&p) {
                let ps = p.to_string_lossy().into_owned();
                if index_file(conn, &ps).unwrap_or(false) {
                    count += 1;
                    if fresh_root {
                        let _ = crate::commands::inbox::mark_seen(conn, &ps, None);
                    }
                    if count.is_multiple_of(BATCH) {
                        if let Some(t) = tx.take() {
                            t.commit().map_err(|e| e.to_string())?;
                        }
                        tx = Some(conn.unchecked_transaction().map_err(|e| e.to_string())?);
                    }
                }
                seen.insert(norm_key(&ps));
            }
        }
    }

    // prune — walk 에서 못 본 경로(삭제됨·확장자 변경·이제 skip 대상 폴더 아래)를 인덱스에서 뺀다.
    let mut removed = 0u32;
    for stale in indexed_under(conn, &root_s)? {
        if !seen.contains(&norm_key(&stale)) {
            remove_path(conn, &stale)?;
            removed += 1;
        }
    }
    if let Some(t) = tx.take() {
        t.commit().map_err(|e| e.to_string())?;
    }
    Ok((count, removed))
}

/// 전역 검색 질의. bm25 랭킹, 스니펫은 센티넬 문자로 매치 강조, 선택적 경로 prefix 필터.
#[tauri::command]
pub fn search_query(
    state: State<Db>,
    query: String,
    limit: Option<u32>,
    path_prefix: Option<String>,
) -> Result<Vec<SearchHit>, String> {
    let match_expr = match build_match(&query) {
        Some(m) => m,
        None => return Ok(Vec::new()),
    };
    let like = path_prefix.map(|p| format!("{p}%"));
    let lim = limit.unwrap_or(50) as i64;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let rows = match_rows(&conn, &match_expr, like.as_deref(), lim)?;
    Ok(rows
        .into_iter()
        .map(|(real_path, snippet)| {
            let name = basename(&real_path);
            SearchHit { real_path, name, snippet }
        })
        .collect())
}

/// FTS MATCH 질의의 알맹이 — 프런트 커맨드와 **MCP 모드**가 공유한다(`(경로, 스니펫)` 목록).
/// 스니펫 하이라이트는 여기서도 센티넬 문자(STX/ETX)다 — 표시 계층이 알아서 푼다.
pub(crate) fn match_rows(
    conn: &Connection,
    match_expr: &str,
    like: Option<&str>,
    limit: i64,
) -> Result<Vec<(String, String)>, String> {
    // **`ORDER BY rank` 이지 `ORDER BY bm25(file_index)` 가 아니다.** 순서는 같다(rank 의 기본값이
    // bm25). 그런데 bm25() 로 정렬하면 SQLite 가 정렬하므로 맞은 행 *전부*의 snippet() 을 먼저
    // 만들고(문서를 다시 토큰화한다) 나서 LIMIT 으로 자른다. rank 는 FTS5 가 안에서 정렬·LIMIT 해
    // snippet() 이 LIMIT 개에만 돈다 — 흔한 낱말 5천 문서에서 74~121ms → 8~9ms
    // (docs/design/performance.md). 두 단계 질의(rowid IN …)는 바깥 MATCH 를 rowid 마다 다시 돌려 더 느렸다.
    let mut stmt = conn
        .prepare(
            "SELECT real_path, snippet(file_index, 1, char(2), char(3), '…', 12) AS snip
             FROM file_index
             WHERE file_index MATCH ?1 AND (?2 IS NULL OR real_path LIKE ?2)
             ORDER BY rank LIMIT ?3",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![match_expr, like, limit], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// 폴더 인덱싱(백그라운드 스레드 + 별도 연결). 완료 시 `index-done` emit.
#[tauri::command]
pub fn search_index_folder(app: AppHandle, path: String) -> Result<(), String> {
    std::thread::spawn(move || {
        let conn = match crate::db::open_side_conn(&app) {
            Ok(c) => c,
            Err(_) => return,
        };
        let (count, removed) =
            index_folder(&conn, &std::path::PathBuf::from(&path)).unwrap_or((0, 0));
        let _ = app.emit(
            "index-done",
            serde_json::json!({ "root": path, "count": count, "removed": removed }),
        );
    });
    Ok(())
}

/// 단일 파일 재인덱싱(감시 훅/수동).
#[tauri::command]
pub fn search_reindex_path(state: State<Db>, path: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    index_file(&conn, &path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rel_under_boundaries() {
        // 자기 자신
        assert_eq!(rel_under(r"C:\w", r"C:\w"), Some(""));
        assert_eq!(rel_under(r"C:\w\", r"C:\w"), Some(""));
        // 하위
        assert_eq!(rel_under(r"C:\w\a.md", r"C:\w"), Some("a.md"));
        assert_eq!(rel_under(r"C:\w\sub\a.md", r"C:\w"), Some(r"sub\a.md"));
        // root 후행 구분자
        assert_eq!(rel_under(r"C:\w\a.md", r"C:\w\"), Some("a.md"));
        // 형제 접두어 — LIKE 'C:\w%' 는 여기서 틀린다
        assert_eq!(rel_under(r"C:\wx\a.md", r"C:\w"), None);
        assert_eq!(rel_under(r"C:\workspace\a.md", r"C:\work"), None);
        // 구분자 혼용 · ASCII 대소문자
        assert_eq!(rel_under("C:/w/a.md", r"C:\w"), Some("a.md"));
        assert_eq!(rel_under(r"c:\W\a.md", r"C:\w"), Some("a.md"));
        // 한글 경로(비ASCII 바이트 정렬)
        assert_eq!(rel_under(r"C:\작업\문서.md", r"C:\작업"), Some("문서.md"));
        assert_eq!(rel_under(r"C:\작업실\문서.md", r"C:\작업"), None);
        // 빈 root · 짧은 path
        assert_eq!(rel_under(r"C:\w\a.md", ""), None);
        assert_eq!(rel_under(r"C:\w\a.md", "/"), None);
        assert_eq!(rel_under(r"C:\w", r"C:\w\sub"), None);
    }

    #[test]
    fn under_root_matches_rel_under() {
        assert!(under_root(r"C:\w\a.md", r"C:\w"));
        assert!(under_root(r"C:\w", r"C:\w"));
        assert!(!under_root(r"C:\wx\a.md", r"C:\w"));
        assert!(!under_root(r"D:\w\a.md", r"C:\w"));
    }

    #[test]
    fn norm_key_unifies_separator_and_case() {
        assert_eq!(norm_key(r"C:\W\A.MD"), "c:/w/a.md");
        assert_eq!(norm_key("c:/w/a.md"), "c:/w/a.md");
        // 비ASCII 는 그대로(한글에 대소문자 개념이 없다)
        assert_eq!(norm_key(r"C:\작업\문서.md"), "c:/작업/문서.md");
    }

    #[test]
    fn build_match_sanitizes() {
        assert_eq!(build_match("hello world"), Some("hello world*".into()));
        assert_eq!(build_match("  "), None);
        // FTS5 연산자 문자는 걸러진다(구문 오류 차단)
        assert_eq!(build_match("a\"b OR* c"), Some("ab OR c*".into()));
    }

    // ── v4: 색인 행을 rowid 로 찾는다 ────────────────────────────────────────────────────────

    fn db() -> Connection {
        let mut c = Connection::open_in_memory().unwrap();
        crate::db::migrate_for_test(&mut c).unwrap();
        c
    }

    /// 테스트마다 따로 쓰는 임시 폴더(병렬 실행에서 서로 안 밟게 이름에 테스트명).
    fn tmp(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("readme-search-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    /// 경로로 센 색인 행 수 — 테스트에서만 전체 스캔을 허락한다.
    fn index_rows(c: &Connection, path: &str) -> i64 {
        c.query_row("SELECT count(*) FROM file_index WHERE real_path = ?1", params![path], |r| r.get(0))
            .unwrap()
    }

    fn meta_rowid(c: &Connection, path: &str) -> Option<i64> {
        fts_rowid_of(c, path).unwrap()
    }

    #[test]
    fn v4_upgrade_links_existing_rows_and_drops_orphans() {
        let mut c = Connection::open_in_memory().unwrap();
        crate::db::migrate_to_for_test(&mut c, 3).unwrap();
        // v3 시절 상태: 정상 2 · 같은 경로 중복 1 · 메타 없는 색인 행 1 · 색인 행 없는 메타 1
        c.execute_batch(
            "INSERT INTO file_index(rowid, real_path, content) VALUES
               (1, 'C:\\w\\a.md', 'alpha old'), (2, 'C:\\w\\b.md', 'beta'),
               (3, 'C:\\w\\a.md', 'alpha new'), (4, 'C:\\w\\orphan.md', 'alpha orphan');
             INSERT INTO file_meta(real_path, mtime, size, indexed_at) VALUES
               ('C:\\w\\a.md', 10, 9, 0), ('C:\\w\\b.md', 20, 4, 0), ('C:\\w\\lost.md', 30, 5, 0);",
        )
        .unwrap();
        crate::db::migrate_for_test(&mut c).unwrap();

        assert_eq!(meta_rowid(&c, r"C:\w\a.md"), Some(3), "중복이면 가장 최근(큰 rowid) 행과 짝짓는다");
        assert_eq!(meta_rowid(&c, r"C:\w\b.md"), Some(2));
        assert_eq!(meta_rowid(&c, r"C:\w\lost.md"), None);
        // 짝 없는 행(옛 중복·고아)은 지워져 검색에 영영 남지 않는다.
        let left: i64 = c.query_row("SELECT count(*) FROM file_index", [], |r| r.get(0)).unwrap();
        assert_eq!(left, 2);
        let hits = match_rows(&c, "alpha*", None, 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].0, r"C:\w\a.md");
        // 기록이 쓰는 "옛 내용"도 짝 행에서 나온다.
        assert_eq!(last_indexed(&c, r"C:\w\a.md"), Some((10, "alpha new".into())));
    }

    #[test]
    fn reindex_replaces_the_row_by_rowid_and_still_snapshots_the_old_text() {
        let c = db();
        let d = tmp("reindex");
        let f = d.join("a.md");
        let fs = f.to_string_lossy().into_owned();
        std::fs::write(&f, "first version").unwrap();
        assert!(index_file(&c, &fs).unwrap());
        meta_rowid(&c, &fs).expect("색인하면 짝 rowid 가 적힌다");

        std::fs::write(&f, "second version, longer").unwrap();
        assert!(index_file(&c, &fs).unwrap());
        // rowid 는 같을 수도 있다(FTS5 는 지운 뒤 max+1 을 다시 쓴다) — 짝이 맞는지만 본다.
        let r2 = meta_rowid(&c, &fs).unwrap();
        let at: String = c.query_row("SELECT real_path FROM file_index WHERE rowid = ?1", params![r2], |r| r.get(0)).unwrap();
        assert_eq!(at, fs);
        assert_eq!(index_rows(&c, &fs), 1, "옛 행이 남아 있으면 검색에 두 번 뜬다");
        assert!(match_rows(&c, "first*", None, 10).unwrap().is_empty());
        assert_eq!(match_rows(&c, "second*", None, 10).unwrap().len(), 1);
        let snap: String = c
            .query_row("SELECT content FROM doc_snapshot WHERE real_path = ?1", params![fs], |r| r.get(0))
            .unwrap();
        assert_eq!(snap, "first version", "덮기 직전 옛 내용을 기록에 떠야 한다");

        remove_path(&c, &fs).unwrap();
        assert_eq!(index_rows(&c, &fs), 0);
        assert_eq!(meta_rowid(&c, &fs), None);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn meta_without_an_index_row_is_indexed_again() {
        let c = db();
        let d = tmp("lostrow");
        let f = d.join("a.md");
        let fs = f.to_string_lossy().into_owned();
        std::fs::write(&f, "content").unwrap();
        assert!(index_file(&c, &fs).unwrap());
        assert!(!index_file(&c, &fs).unwrap(), "그대로면 건너뛴다");
        // v4 이전에 어긋난 상태(메타는 있는데 색인 행이 없다)를 흉내 낸다.
        c.execute("UPDATE file_meta SET fts_rowid = NULL WHERE real_path = ?1", params![fs]).unwrap();
        c.execute("DELETE FROM file_index", []).unwrap();
        assert!(index_file(&c, &fs).unwrap(), "mtime 이 같아도 짝이 없으면 다시 색인해야 한다");
        assert_eq!(match_rows(&c, "content*", None, 10).unwrap().len(), 1);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn index_folder_commits_every_batch_and_the_tail() {
        // 묶음 경계를 넘는 수(200 + 나머지)를 진짜 파일 DB 에 색인하고, **다른 연결**에서 본다 —
        // 마지막 묶음 커밋을 빠뜨리면 이 연결에서는 보이고 남에게는 안 보인다.
        let d = tmp("batch");
        let ws = d.join("ws");
        std::fs::create_dir_all(ws.join("sub")).unwrap();
        for i in 0..450 {
            let dir = if i % 2 == 0 { ws.clone() } else { ws.join("sub") };
            std::fs::write(dir.join(format!("n{i}.md")), format!("note number{i} shared")).unwrap();
        }
        let dbp = d.join("t.db");
        let mut c = crate::db::open_at(&dbp).unwrap();
        crate::db::migrate_for_test(&mut c).unwrap();
        assert_eq!(index_folder(&c, &ws).unwrap(), (450, 0));

        let other = crate::db::open_at(&dbp).unwrap();
        let n: i64 = other.query_row("SELECT count(*) FROM file_meta", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 450);
        assert_eq!(match_rows(&other, "number449*", None, 10).unwrap().len(), 1);
        // 하나 지우고 다시 훑으면 정리(prune)된다.
        std::fs::remove_file(ws.join("n0.md")).unwrap();
        assert_eq!(index_folder(&c, &ws).unwrap(), (0, 1));
        assert!(match_rows(&other, "number0", None, 10).unwrap().is_empty());
        drop((c, other));
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn search_ranks_by_relevance_and_honours_the_limit() {
        let c = db();
        for (i, body) in ["apple", "apple apple apple banana", "banana", "apple banana"].iter().enumerate() {
            c.execute(
                "INSERT INTO file_index(real_path, content) VALUES (?1, ?2)",
                params![format!("C:\\w\\{i}.md"), body],
            )
            .unwrap();
        }
        let hits = match_rows(&c, "apple", None, 2).unwrap();
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].0, r"C:\w\1.md", "많이 맞은 문서가 먼저(rank = bm25)");
        assert!(hits[0].1.contains('\u{2}'), "스니펫에 강조 센티넬");
        let scoped = match_rows(&c, "banana", Some(r"C:\w\2%"), 10).unwrap();
        assert_eq!(scoped.len(), 1);
    }
}

/// 파일/폴더 인덱스 제거(삭제·언임포트). path 자신 + 하위 모두 제거.
/// 하위 판정은 `under_root` — LIKE 만 쓰면 형제 접두어(`C:\a` → `C:\ab\x.md`)까지 지운다.
#[tauri::command]
pub fn search_remove_path(state: State<Db>, path: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    for p in indexed_under(&conn, &path)? {
        remove_path(&conn, &p)?;
    }
    // 인덱스에 없더라도 file_meta 만 남은 경우를 위해 자기 자신은 한 번 더.
    remove_path(&conn, &path)
}
