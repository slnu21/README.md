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
fn index_folder(conn: &Connection, root: &Path) -> Result<u32, String> {
    let mut count = 0u32;
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
                if index_file(conn, &p.to_string_lossy()).unwrap_or(false) {
                    count += 1;
                }
            }
        }
    }
    Ok(count)
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
        let count = index_folder(&conn, &std::path::PathBuf::from(&path)).unwrap_or(0);
        let _ = app.emit("index-done", serde_json::json!({ "root": path, "count": count }));
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

/// 파일/폴더 인덱스 제거(삭제·언임포트). path 자신 + 하위(prefix) 모두 제거.
#[tauri::command]
pub fn search_remove_path(state: State<Db>, path: String) -> Result<(), String> {
    let like = format!("{path}%");
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM file_index WHERE real_path = ?1 OR real_path LIKE ?2",
        params![path, like],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM file_meta WHERE real_path = ?1 OR real_path LIKE ?2",
        params![path, like],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
