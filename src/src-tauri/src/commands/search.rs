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
fn build_match(raw: &str) -> Option<String> {
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
fn indexed_under(conn: &Connection, root: &str) -> Result<Vec<String>, String> {
    let like = format!("{}%", root.trim_end_matches(['/', '\\']));
    let mut stmt = conn
        .prepare(
            "SELECT real_path FROM file_meta WHERE real_path LIKE ?1
             UNION SELECT real_path FROM file_index WHERE real_path LIKE ?1",
        )
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

pub(crate) fn remove_path(conn: &Connection, path: &str) -> Result<(), String> {
    conn.execute("DELETE FROM file_index WHERE real_path = ?1", params![path])
        .map_err(|e| e.to_string())?;
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

    let prev: Option<(i64, i64)> = conn
        .query_row(
            "SELECT mtime, size FROM file_meta WHERE real_path = ?1",
            params![path],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some((pm, ps)) = prev {
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
    conn.execute("DELETE FROM file_index WHERE real_path = ?1", params![path])
        .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO file_index (real_path, content) VALUES (?1, ?2)",
        params![path, content],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO file_meta (real_path, mtime, size, indexed_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(real_path) DO UPDATE SET mtime=excluded.mtime, size=excluded.size, indexed_at=excluded.indexed_at",
        params![path, mtime, size, now_ms()],
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
fn index_folder(conn: &Connection, root: &Path) -> Result<(u32, u32), String> {
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
                }
                seen.insert(norm_key(&ps));
            }
        }
    }

    // prune — walk 에서 못 본 경로(삭제됨·확장자 변경·이제 skip 대상 폴더 아래)를 인덱스에서 뺀다.
    let root_s = root.to_string_lossy();
    let mut removed = 0u32;
    for stale in indexed_under(conn, root_s.as_ref())? {
        if !seen.contains(&norm_key(&stale)) {
            remove_path(conn, &stale)?;
            removed += 1;
        }
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
    let mut stmt = conn
        .prepare(
            "SELECT real_path, snippet(file_index, 1, char(2), char(3), '…', 12) AS snip
             FROM file_index
             WHERE file_index MATCH ?1 AND (?2 IS NULL OR real_path LIKE ?2)
             ORDER BY bm25(file_index) LIMIT ?3",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![match_expr, like, lim], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        let (real_path, snippet) = row.map_err(|e| e.to_string())?;
        let name = basename(&real_path);
        out.push(SearchHit { real_path, name, snippet });
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
