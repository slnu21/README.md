//! 받은 문서함 — 에이전트(또는 다른 프로그램)가 만지고 간 문서를 사람이 알아채게 한다.
//!
//! 색인이 이미 파일마다 mtime 을 들고 있으므로(`file_meta`), 새로 필요한 것은 **사용자가 그
//! 문서를 마지막으로 본 시점의 mtime**(`doc_seen`) 하나뿐이다. 둘을 비교하면 "내가 본 뒤로
//! 바뀐 것"이 그대로 나온다 — 앱이 꺼져 있는 동안 바뀐 것도 부팅 재색인이 mtime 을 올려 주므로
//! 함께 잡힌다(그게 사실 제일 중요한 경우다: 밤새 에이전트가 써 놓은 것).
//!
//! **앱이 쓴 것은 들어오면 안 된다** — 내가 방금 저장한 문서가 받은 문서함에 뜨면 신호가 죽는다.
//! 그래서 `fs_ops` 의 쓰기 커맨드가 저장 직후 본 것으로 표시한다.

use crate::db::{now_ms, Db};
use crate::scope::Scope;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::path::Path;
use tauri::State;

/// 스코프로 거르기 전에 훑어 볼 최대 행 수. 안 본 문서는 보통 몇 건이라 넉넉하다.
const CANDIDATE_CAP: i64 = 500;
/// 프런트로 보낼 최대 항목 수(목록 + 트리 점 표시에 함께 쓴다).
const ITEM_CAP: usize = 200;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxItem {
    real_path: String,
    name: String,
    mtime: i64,
    /// 한 번도 본 적 없는 문서(= 새로 생겼다). 화면에서 '새 문서'와 '변경됨'을 가른다.
    is_new: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxSnapshot {
    items: Vec<InboxItem>,
    /// 스코프까지 거른 실제 개수(배지 숫자). `items` 는 상한에서 잘릴 수 있다.
    total: usize,
}

fn basename(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string())
}

/// 파일의 현재 mtime(ms).
///
/// **디스크를 먼저 본다.** 색인이 아는 값은 방금 저장한 파일에 대해 낡아 있다(감시기가 아직
/// 재색인하기 전이다). 낡은 값으로 '본 것' 표시를 하면 곧이어 재색인이 새 mtime 을 넣으면서
/// **내가 방금 저장한 문서가 받은 문서함에 뜬다**. 디스크 stat 한 번이면 늘 맞다.
fn current_mtime(conn: &Connection, path: &str) -> i64 {
    let on_disk = std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64);
    on_disk.unwrap_or_else(|| {
        conn.query_row("SELECT mtime FROM file_meta WHERE real_path = ?1", params![path], |r| r.get(0))
            .optional()
            .ok()
            .flatten()
            .unwrap_or(0)
    })
}

/// 본 것으로 표시한다. `mtime` 을 안 주면 지금 값을 읽는다.
///
/// 색인(`search.rs`)과 쓰기 커맨드(`fs_ops.rs`)도 부르므로 `pub(crate)` 다.
pub(crate) fn mark_seen(conn: &Connection, path: &str, mtime: Option<i64>) -> Result<(), String> {
    let m = mtime.unwrap_or_else(|| current_mtime(conn, path));
    conn.execute(
        "INSERT INTO doc_seen (real_path, seen_mtime, seen_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(real_path) DO UPDATE SET seen_mtime = excluded.seen_mtime, seen_at = excluded.seen_at",
        params![path, m, now_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 본 뒤로 바뀐 문서 목록(최신 순). 워크스페이스 밖은 뺀다 — 색인에는 예전에 가져왔다가 뺀
/// 폴더의 경로가 남아 있을 수 있고, 그것까지 보여 주면 받은 문서함이 신호가 아니라 소음이 된다.
#[tauri::command]
pub fn inbox_list(state: State<Db>) -> Result<InboxSnapshot, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let scope = Scope::load(&conn)?;
    let mut stmt = conn
        .prepare(
            "SELECT fm.real_path, fm.mtime, ds.real_path IS NULL
             FROM file_meta fm
             LEFT JOIN doc_seen ds ON ds.real_path = fm.real_path
             WHERE ds.real_path IS NULL OR fm.mtime > ds.seen_mtime
             ORDER BY fm.mtime DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![CANDIDATE_CAP], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, bool>(2)?))
        })
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    let mut total = 0usize;
    for row in rows {
        let (real_path, mtime, is_new) = row.map_err(|e| e.to_string())?;
        if !scope.allows(&real_path) {
            continue;
        }
        total += 1;
        if items.len() < ITEM_CAP {
            let name = basename(&real_path);
            items.push(InboxItem { real_path, name, is_new, mtime });
        }
    }
    Ok(InboxSnapshot { items, total })
}

/// 문서 하나를 본 것으로. 문서를 열 때 프런트가 부른다.
#[tauri::command]
pub fn inbox_mark_seen(state: State<Db>, path: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    mark_seen(&conn, &path, None)
}

/// 전부 본 것으로([모두 읽음]). 색인이 아는 모든 문서의 현재 mtime 을 그대로 박는다.
#[tauri::command]
pub fn inbox_mark_all_seen(state: State<Db>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    // `WHERE true` 는 장식이 아니다 — SQLite 는 `INSERT ... SELECT ... ON CONFLICT` 에서
    // `ON` 을 조인으로 읽어 파싱에 실패한다. SELECT 뒤에 WHERE 가 있어야 갈린다(문서가 정한 회피법).
    conn.execute(
        "INSERT INTO doc_seen (real_path, seen_mtime, seen_at)
         SELECT real_path, mtime, ?1 FROM file_meta WHERE true
         ON CONFLICT(real_path) DO UPDATE SET seen_mtime = excluded.seen_mtime, seen_at = excluded.seen_at",
        params![now_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 스키마는 실제 마이그레이션을 그대로 태운다 — 손으로 베낀 표는 언젠가 어긋난다.
    fn db() -> Connection {
        let mut c = Connection::open_in_memory().unwrap();
        crate::db::migrate_for_test(&mut c).unwrap();
        c
    }

    fn index_row(c: &Connection, path: &str, mtime: i64) {
        c.execute(
            "INSERT INTO file_meta (real_path, mtime, size, indexed_at) VALUES (?1, ?2, 1, 0)
             ON CONFLICT(real_path) DO UPDATE SET mtime = excluded.mtime",
            params![path, mtime],
        )
        .unwrap();
    }

    fn unseen(c: &Connection) -> Vec<String> {
        let mut stmt = c
            .prepare(
                "SELECT fm.real_path FROM file_meta fm
                 LEFT JOIN doc_seen ds ON ds.real_path = fm.real_path
                 WHERE ds.real_path IS NULL OR fm.mtime > ds.seen_mtime
                 ORDER BY fm.mtime DESC",
            )
            .unwrap();
        let rows = stmt.query_map([], |r| r.get::<_, String>(0)).unwrap();
        rows.map(|r| r.unwrap()).collect()
    }

    #[test]
    fn a_file_we_have_never_seen_is_in_the_inbox() {
        let c = db();
        index_row(&c, r"C:\w\a.md", 100);
        assert_eq!(unseen(&c), vec![r"C:\w\a.md"]);
    }

    #[test]
    fn marking_seen_clears_it_until_it_changes_again() {
        let c = db();
        index_row(&c, r"C:\w\a.md", 100);
        mark_seen(&c, r"C:\w\a.md", None).unwrap();
        assert!(unseen(&c).is_empty());

        index_row(&c, r"C:\w\a.md", 200); // 에이전트가 다시 고쳤다
        assert_eq!(unseen(&c), vec![r"C:\w\a.md"]);
    }

    #[test]
    fn seen_uses_the_mtime_we_were_given_not_the_wall_clock() {
        // 저장 커맨드가 "방금 쓴 그 mtime" 을 박아야 감시기 재색인과 값이 맞아 안 뜬다.
        let c = db();
        index_row(&c, r"C:\w\a.md", 300);
        mark_seen(&c, r"C:\w\a.md", Some(300)).unwrap();
        assert!(unseen(&c).is_empty());
        mark_seen(&c, r"C:\w\a.md", Some(299)).unwrap(); // 더 옛날로 표시하면 다시 뜬다
        assert_eq!(unseen(&c), vec![r"C:\w\a.md"]);
    }

    #[test]
    fn mark_all_seen_covers_everything_the_index_knows() {
        let c = db();
        index_row(&c, r"C:\w\a.md", 100);
        index_row(&c, r"C:\w\b.md", 150);
        c.execute(
            "INSERT INTO doc_seen (real_path, seen_mtime, seen_at)
             SELECT real_path, mtime, 1 FROM file_meta WHERE true
             ON CONFLICT(real_path) DO UPDATE SET seen_mtime = excluded.seen_mtime",
            [],
        )
        .unwrap();
        assert!(unseen(&c).is_empty());
    }

    #[test]
    fn migration_treats_everything_already_indexed_as_seen() {
        // 이게 없으면 판올림 첫 실행에 받은 문서함이 수천 건으로 터진다.
        let mut c = Connection::open_in_memory().unwrap();
        // v1 만 적용된 상태를 만든 뒤 파일을 넣고, v2 를 태운다.
        crate::db::migrate_to_for_test(&mut c, 1).unwrap();
        index_row(&c, r"C:\w\old.md", 100);
        crate::db::migrate_for_test(&mut c).unwrap();
        assert!(unseen(&c).is_empty(), "기존 색인은 전부 본 것으로 쳐야 한다");

        index_row(&c, r"C:\w\new.md", 200);
        assert_eq!(unseen(&c), vec![r"C:\w\new.md"], "판올림 이후 것만 뜬다");
    }
}
