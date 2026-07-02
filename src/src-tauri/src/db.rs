//! SQLite 연결·마이그레이션·FTS5 인덱스.
//! 워크스페이스/노드/즐겨찾기/최근/설정 + 파일 내용 FTS5. 스키마: docs/design/data-model.md
//! 프런트는 SQL 직접 접근 금지 — commands/workspace.rs · commands/search.rs 커맨드만 사용.
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// 전역 DB 연결(포그라운드). rusqlite Connection 은 !Sync 이므로 Mutex 로 감싼다.
pub struct Db(pub Mutex<Connection>);

/// 스키마 마이그레이션(append-only). 각 원소 = 한 버전. PRAGMA user_version 으로 적용 위치 추적.
/// 기존 스텝은 절대 수정 금지 — 확장은 배열 끝에 새 버전 추가.
const MIGRATIONS: &[&str] = &[
    // v1 — 워크스페이스/노드/즐겨찾기/최근/설정 + FTS5 인덱스 + 인덱스 메타
    r#"
    CREATE TABLE workspace (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );
    CREATE TABLE node (
      id            TEXT PRIMARY KEY,
      workspace_id  TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
      parent_id     TEXT REFERENCES node(id) ON DELETE CASCADE,
      kind          TEXT NOT NULL CHECK (kind IN ('virtual_folder','file_ref','imported_folder')),
      name          TEXT NOT NULL,
      real_path     TEXT,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL
    );
    CREATE INDEX idx_node_parent ON node(workspace_id, parent_id, sort_order);
    CREATE TABLE favorite (
      real_path  TEXT PRIMARY KEY,
      added_at   INTEGER NOT NULL
    );
    CREATE TABLE recent (
      real_path  TEXT PRIMARY KEY,
      opened_at  INTEGER NOT NULL
    );
    CREATE INDEX idx_recent_opened ON recent(opened_at DESC);
    CREATE TABLE settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE file_index USING fts5(
      real_path UNINDEXED,
      content,
      tokenize = 'unicode61 remove_diacritics 2'
    );
    CREATE TABLE file_meta (
      real_path   TEXT PRIMARY KEY,
      mtime       INTEGER NOT NULL,
      size        INTEGER NOT NULL,
      indexed_at  INTEGER NOT NULL
    );
    INSERT INTO workspace (id, name, created_at) VALUES ('default', 'Workspace', 0);
    "#,
];

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("md-reader.db"))
}

/// 연결 열기 + PRAGMA(WAL/외래키/바쁨 대기). 포그라운드/백그라운드 공용.
fn open_conn(app: &AppHandle) -> Result<Connection, String> {
    let conn = Connection::open(db_path(app)?).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;",
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

/// 부팅 초기화: 연결 + 마이그레이션. lib.rs setup 에서 1회 호출 후 .manage(Db) 로 주입.
pub fn init(app: &AppHandle) -> Result<Db, String> {
    let mut conn = open_conn(app)?;
    migrate(&mut conn)?;
    Ok(Db(Mutex::new(conn)))
}

/// 백그라운드 인덱서 전용 별도 연결(WAL 덕에 포그라운드와 동시 사용 가능).
pub fn open_side_conn(app: &AppHandle) -> Result<Connection, String> {
    open_conn(app)
}

fn migrate(conn: &mut Connection) -> Result<(), String> {
    let current: i64 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let target = MIGRATIONS.len() as i64;
    for v in current..target {
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch(MIGRATIONS[v as usize]).map_err(|e| e.to_string())?;
        // user_version 은 파라미터 바인딩 불가 → 정수 포맷(루프 인덱스라 안전).
        tx.execute_batch(&format!("PRAGMA user_version = {};", v + 1))
            .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 밀리초 단위 현재 시각(epoch). created_at/opened_at 등에 사용.
pub fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    // 마이그레이션 전체 적용 + FTS5(bundled) 런타임 동작 + 기본 워크스페이스 확인.
    #[test]
    fn migration_and_fts5() {
        let mut conn = Connection::open_in_memory().expect("open");
        conn.execute_batch("PRAGMA foreign_keys=ON;").expect("pragma");
        migrate(&mut conn).expect("migrate (FTS5 미지원이면 여기서 실패)");

        // user_version 이 마이그레이션 수만큼 올라갔는지
        let v: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(v, MIGRATIONS.len() as i64);

        // 기본 워크스페이스 1행
        let w: i64 = conn
            .query_row("SELECT count(*) FROM workspace", [], |r| r.get(0))
            .unwrap();
        assert_eq!(w, 1);

        // FTS5 삽입 + MATCH 질의
        conn.execute(
            "INSERT INTO file_index(real_path, content) VALUES ('a.md', 'hello markdown world')",
            [],
        )
        .unwrap();
        let hit: i64 = conn
            .query_row(
                "SELECT count(*) FROM file_index WHERE file_index MATCH 'markdown'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(hit, 1);

        // 재적용(멱등) — 이미 최신이면 no-op
        migrate(&mut conn).expect("re-migrate idempotent");
    }
}
