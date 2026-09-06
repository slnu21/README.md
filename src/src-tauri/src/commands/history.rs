//! 문서 기록(로컬 스냅샷) — "AI 가 내 문서를 덮어썼다"를 되돌릴 수 있게 한다.
//!
//! **되돌리려면 바뀌기 *전* 내용이 있어야 하는데, 우리는 남의 쓰기를 가로챌 수 없다.**
//! 그런데 색인이 이미 파일 내용을 통째로 들고 있다(`file_index.content`). 그래서 **재색인이
//! 옛 내용을 새 내용으로 덮기 직전**이 마지막이자 확실한 기회다 — 거기서 한 벌 떠 둔다.
//! 앱이 직접 저장할 때도 덮어쓰기 전에 같은 함수를 부른다(그쪽은 디스크에서 바로 읽는다).
//!
//! 두 경로가 같은 판을 두 번 뜨지 않도록 **(경로, mtime) 로 중복을 막는다**. 그리고 타자
//! 치는 동안(자동저장) 스냅샷이 쏟아지지 않도록 **합치기 창**을 둔다 — 마지막 스냅샷이
//! 아직 어리면 건너뛴다. 밤새 에이전트가 덮어쓴 경우는 마지막 스냅샷이 몇 시간 전이라
//! 창에 걸리지 않는다(정확히 지키고 싶은 경우가 그것이다).

use crate::db::{now_ms, Db};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::State;

/// 이 시간 안에 이미 뜬 판이 있으면 건너뛴다. 자동저장 한 번마다 한 판씩 쌓이는 것을 막는다.
const COALESCE_MS: i64 = 60_000;
/// 문서 하나가 남기는 최대 판 수(오래된 것부터 버린다).
const MAX_PER_PATH: i64 = 30;
/// 저장소 전체 상한. 문서 수가 많아도 무한정 자라지 않게 한다.
const MAX_TOTAL: i64 = 2_000;
/// 이보다 큰 내용은 안 뜬다 — 기록 하나가 DB 를 삼키면 안 된다.
const MAX_CONTENT_BYTES: usize = 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    id: i64,
    /// 그 내용이 디스크에 있던 시각(파일 mtime). 목록에 보여 주는 값이다.
    mtime: i64,
    /// 우리가 떠 둔 시각.
    taken_at: i64,
    bytes: i64,
}

/// 한 판 뜬다. 이미 같은 (경로, mtime) 이 있거나 합치기 창 안이면 조용히 건너뛴다.
///
/// 색인(`search.rs`)과 저장(`fs_ops.rs`)이 부르므로 `pub(crate)` 다. 실패는 호출부에서
/// 무시한다 — 기록 하나 때문에 저장이나 색인을 실패시킬 이유가 없다.
pub(crate) fn capture(
    conn: &Connection,
    path: &str,
    content: &str,
    mtime: i64,
) -> Result<bool, String> {
    if content.len() > MAX_CONTENT_BYTES {
        return Ok(false);
    }
    let dup: Option<i64> = conn
        .query_row(
            "SELECT id FROM doc_snapshot WHERE real_path = ?1 AND mtime = ?2",
            params![path, mtime],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if dup.is_some() {
        return Ok(false);
    }

    let newest: Option<i64> = conn
        .query_row(
            "SELECT taken_at FROM doc_snapshot WHERE real_path = ?1 ORDER BY taken_at DESC LIMIT 1",
            params![path],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let now = now_ms();
    if newest.is_some_and(|t| now - t < COALESCE_MS) {
        return Ok(false);
    }

    conn.execute(
        "INSERT INTO doc_snapshot (real_path, mtime, taken_at, content) VALUES (?1, ?2, ?3, ?4)",
        params![path, mtime, now, content],
    )
    .map_err(|e| e.to_string())?;
    prune(conn, path)?;
    Ok(true)
}

/// 문서별 상한 + 저장소 전체 상한. 둘 다 오래된 것부터 버린다.
fn prune(conn: &Connection, path: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM doc_snapshot WHERE real_path = ?1 AND id NOT IN
           (SELECT id FROM doc_snapshot WHERE real_path = ?1 ORDER BY taken_at DESC LIMIT ?2)",
        params![path, MAX_PER_PATH],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM doc_snapshot WHERE id NOT IN
           (SELECT id FROM doc_snapshot ORDER BY taken_at DESC LIMIT ?1)",
        params![MAX_TOTAL],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 디스크의 현재 내용을 한 판 뜬다(덮어쓰기 직전에 부른다).
pub(crate) fn capture_from_disk(conn: &Connection, path: &str) -> Result<bool, String> {
    let meta = match std::fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return Ok(false), // 아직 없는 파일(새로 만들기) — 뜰 것이 없다
    };
    if meta.len() as usize > MAX_CONTENT_BYTES {
        return Ok(false);
    }
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    match std::fs::read_to_string(path) {
        Ok(c) => capture(conn, path, &c, mtime),
        Err(_) => Ok(false), // 바이너리·읽기 실패 — 건너뛴다
    }
}

/// 이 문서의 판 목록(최신 순). 내용은 안 실어 보낸다 — 목록만으로도 충분하고 무겁다.
#[tauri::command]
pub fn history_list(state: State<Db>, path: String) -> Result<Vec<HistoryEntry>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, mtime, taken_at, length(content) FROM doc_snapshot
             WHERE real_path = ?1 ORDER BY taken_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![path], |r| {
            Ok(HistoryEntry { id: r.get(0)?, mtime: r.get(1)?, taken_at: r.get(2)?, bytes: r.get(3)? })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// 한 판의 내용(미리보기).
#[tauri::command]
pub fn history_get(state: State<Db>, id: i64) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.query_row("SELECT content FROM doc_snapshot WHERE id = ?1", params![id], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "그 기록이 없습니다".to_string())
}

/// 그 판으로 되돌린다. 되돌린 내용을 돌려주므로 프런트가 열린 탭을 그대로 갱신한다.
///
/// **되돌리기 자체도 되돌릴 수 있어야 한다** — 덮어쓰기 전에 지금 내용을 한 판 뜬다.
/// 합치기 창을 무시하고 강제로 뜬다(여기서 못 뜨면 지금 내용이 영영 사라진다).
#[tauri::command]
pub fn history_restore(state: State<Db>, id: i64) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let (path, content): (String, String) = conn
        .query_row("SELECT real_path, content FROM doc_snapshot WHERE id = ?1", params![id], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "그 기록이 없습니다".to_string())?;

    force_capture_current(&conn, &path)?;
    std::fs::write(&path, &content).map_err(|e| e.to_string())?;
    // 내가 되돌린 것이다 — 받은 문서함에 뜨면 안 된다.
    let _ = crate::commands::inbox::mark_seen(&conn, &path, None);
    Ok(content)
}

/// 합치기 창을 건너뛰고 지금 내용을 반드시 한 판 뜬다(되돌리기 직전 전용).
fn force_capture_current(conn: &Connection, path: &str) -> Result<(), String> {
    let Ok(text) = std::fs::read_to_string(path) else {
        return Ok(()); // 파일이 없다(지워진 문서를 되살리는 중) — 뜰 것이 없다
    };
    if text.len() > MAX_CONTENT_BYTES {
        return Ok(());
    }
    let mtime = std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let dup: Option<i64> = conn
        .query_row(
            "SELECT id FROM doc_snapshot WHERE real_path = ?1 AND mtime = ?2",
            params![path, mtime],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if dup.is_some() {
        return Ok(());
    }
    conn.execute(
        "INSERT INTO doc_snapshot (real_path, mtime, taken_at, content) VALUES (?1, ?2, ?3, ?4)",
        params![path, mtime, now_ms(), text],
    )
    .map_err(|e| e.to_string())?;
    prune(conn, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let mut c = Connection::open_in_memory().unwrap();
        crate::db::migrate_for_test(&mut c).unwrap();
        c
    }

    fn ids(c: &Connection, path: &str) -> Vec<i64> {
        let mut s = c
            .prepare("SELECT id FROM doc_snapshot WHERE real_path = ?1 ORDER BY taken_at DESC")
            .unwrap();
        let rows = s.query_map(params![path], |r| r.get::<_, i64>(0)).unwrap();
        rows.map(|r| r.unwrap()).collect()
    }

    /// 합치기 창을 피하려고 taken_at 을 과거로 밀어 둔다(시간을 기다리지 않고 검사하기 위해).
    fn age_all(c: &Connection, ms: i64) {
        c.execute("UPDATE doc_snapshot SET taken_at = taken_at - ?1", params![ms]).unwrap();
    }

    #[test]
    fn captures_the_content_that_is_about_to_be_replaced() {
        let c = db();
        assert!(capture(&c, r"C:\w\a.md", "예전 내용", 100).unwrap());
        assert_eq!(ids(&c, r"C:\w\a.md").len(), 1);
    }

    #[test]
    fn the_same_version_is_never_captured_twice() {
        // 저장 경로와 색인 경로가 같은 판을 두 번 뜨는 것을 막는다.
        let c = db();
        assert!(capture(&c, r"C:\w\a.md", "내용", 100).unwrap());
        assert!(!capture(&c, r"C:\w\a.md", "내용", 100).unwrap());
        assert_eq!(ids(&c, r"C:\w\a.md").len(), 1);
    }

    #[test]
    fn rapid_changes_are_coalesced() {
        // 자동저장이 도는 동안 판이 쏟아지면 기록이 쓸모없어진다.
        let c = db();
        assert!(capture(&c, r"C:\w\a.md", "v1", 100).unwrap());
        assert!(!capture(&c, r"C:\w\a.md", "v2", 200).unwrap(), "창 안이면 건너뛴다");
        age_all(&c, COALESCE_MS + 1);
        assert!(capture(&c, r"C:\w\a.md", "v3", 300).unwrap(), "창을 지나면 다시 뜬다");
        assert_eq!(ids(&c, r"C:\w\a.md").len(), 2);
    }

    #[test]
    fn an_overnight_change_is_never_coalesced_away() {
        // 지키고 싶은 바로 그 경우 — 마지막 판이 몇 시간 전이면 창에 안 걸린다.
        let c = db();
        capture(&c, r"C:\w\a.md", "내가 저녁에 쓴 것", 100).unwrap();
        age_all(&c, 8 * 60 * 60 * 1000);
        assert!(capture(&c, r"C:\w\a.md", "에이전트가 덮기 직전", 200).unwrap());
        assert_eq!(ids(&c, r"C:\w\a.md").len(), 2);
    }

    #[test]
    fn per_path_cap_drops_the_oldest() {
        let c = db();
        for i in 0..(MAX_PER_PATH + 5) {
            capture(&c, r"C:\w\a.md", &format!("v{i}"), 1000 + i).unwrap();
            age_all(&c, COALESCE_MS + 1); // 매번 창을 지나게 한다
        }
        assert_eq!(ids(&c, r"C:\w\a.md").len() as i64, MAX_PER_PATH);
    }

    #[test]
    fn oversized_content_is_skipped() {
        let c = db();
        let big = "x".repeat(MAX_CONTENT_BYTES + 1);
        assert!(!capture(&c, r"C:\w\a.md", &big, 100).unwrap());
        assert!(ids(&c, r"C:\w\a.md").is_empty());
    }

    #[test]
    fn other_documents_are_not_pruned_by_a_busy_one() {
        let c = db();
        capture(&c, r"C:\w\quiet.md", "한 번만 바뀐 문서", 1).unwrap();
        age_all(&c, COALESCE_MS + 1);
        for i in 0..(MAX_PER_PATH + 5) {
            capture(&c, r"C:\w\busy.md", &format!("v{i}"), 1000 + i).unwrap();
            age_all(&c, COALESCE_MS + 1);
        }
        assert_eq!(ids(&c, r"C:\w\quiet.md").len(), 1, "조용한 문서의 기록이 밀려나면 안 된다");
    }
}
