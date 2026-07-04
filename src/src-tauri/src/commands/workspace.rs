//! 워크스페이스 영속화 커맨드(SQLite). 노드 트리(가상 폴더/파일 참조/가져온 폴더 루트),
//! 즐겨찾기, 최근, 설정. imported_folder 의 자식은 저장하지 않고 프런트가 디스크에서 파생(D1).
//! SQLite 가 단일 소스오브트루스 — 프런트는 이 커맨드 성공 후 store 를 갱신.
use crate::db::{now_ms, Db};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::State;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    id: String,
    parent_id: Option<String>,
    kind: String,
    name: String,
    real_path: Option<String>,
    sort_order: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    nodes: Vec<Node>,
    favorites: Vec<String>,
    recent: Vec<String>,
}

fn basename(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string())
}

fn load_nodes(conn: &Connection) -> Result<Vec<Node>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, parent_id, kind, name, real_path, sort_order
             FROM node WHERE workspace_id = 'default' ORDER BY sort_order",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Node {
                id: r.get(0)?,
                parent_id: r.get(1)?,
                kind: r.get(2)?,
                name: r.get(3)?,
                real_path: r.get(4)?,
                sort_order: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn load_col(conn: &Connection, sql: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn next_order(conn: &Connection, parent_id: &Option<String>) -> Result<i64, String> {
    let max: Option<i64> = match parent_id {
        Some(p) => conn
            .query_row(
                "SELECT MAX(sort_order) FROM node WHERE workspace_id='default' AND parent_id = ?1",
                params![p],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?,
        None => conn
            .query_row(
                "SELECT MAX(sort_order) FROM node WHERE workspace_id='default' AND parent_id IS NULL",
                [],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?,
    };
    Ok(max.unwrap_or(-1) + 1)
}

/// 후보(candidate)가 조상(ancestor)의 하위인지(부모 체인 상향 순회). 이동 사이클 방지용.
fn is_descendant(conn: &Connection, candidate: &str, ancestor: &str) -> Result<bool, String> {
    let mut cur = candidate.to_string();
    for _ in 0..1000 {
        let parent: Option<String> = conn
            .query_row("SELECT parent_id FROM node WHERE id = ?1", params![cur], |r| {
                r.get::<_, Option<String>>(0)
            })
            .optional()
            .map_err(|e| e.to_string())?
            .flatten();
        match parent {
            Some(p) => {
                if p == ancestor {
                    return Ok(true);
                }
                cur = p;
            }
            None => return Ok(false),
        }
    }
    Ok(false)
}

fn insert_node(
    conn: &Connection,
    id: &str,
    parent_id: &Option<String>,
    kind: &str,
    name: &str,
    real_path: &Option<String>,
) -> Result<i64, String> {
    let order = next_order(conn, parent_id)?;
    conn.execute(
        "INSERT INTO node (id, workspace_id, parent_id, kind, name, real_path, sort_order, created_at)
         VALUES (?1, 'default', ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, parent_id, kind, name, real_path, order, now_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(order)
}

#[tauri::command]
pub fn ws_load(state: State<Db>) -> Result<WorkspaceSnapshot, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    Ok(WorkspaceSnapshot {
        nodes: load_nodes(&conn)?,
        favorites: load_col(&conn, "SELECT real_path FROM favorite ORDER BY added_at")?,
        recent: load_col(&conn, "SELECT real_path FROM recent ORDER BY opened_at DESC LIMIT 50")?,
    })
}

#[tauri::command]
pub fn ws_create_folder(
    state: State<Db>,
    id: String,
    parent_id: Option<String>,
    name: String,
) -> Result<Node, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let order = insert_node(&conn, &id, &parent_id, "virtual_folder", &name, &None)?;
    Ok(Node { id, parent_id, kind: "virtual_folder".into(), name, real_path: None, sort_order: order })
}

#[tauri::command]
pub fn ws_add_file_ref(
    state: State<Db>,
    id: String,
    parent_id: Option<String>,
    real_path: String,
) -> Result<Node, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let name = basename(&real_path);
    let rp = Some(real_path);
    let order = insert_node(&conn, &id, &parent_id, "file_ref", &name, &rp)?;
    Ok(Node { id, parent_id, kind: "file_ref".into(), name, real_path: rp, sort_order: order })
}

#[tauri::command]
pub fn ws_import_folder(
    state: State<Db>,
    id: String,
    parent_id: Option<String>,
    real_path: String,
) -> Result<Node, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let name = basename(&real_path);
    let rp = Some(real_path);
    let order = insert_node(&conn, &id, &parent_id, "imported_folder", &name, &rp)?;
    Ok(Node { id, parent_id, kind: "imported_folder".into(), name, real_path: rp, sort_order: order })
}

#[tauri::command]
pub fn ws_rename(state: State<Db>, id: String, name: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE node SET name = ?1 WHERE id = ?2", params![name, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn ws_delete(state: State<Db>, id: String) -> Result<(), String> {
    // 자식은 FK ON DELETE CASCADE 로 함께 삭제.
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM node WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn ws_move(
    state: State<Db>,
    id: String,
    new_parent_id: Option<String>,
    new_sort_order: i64,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(ref np) = new_parent_id {
        if np == &id || is_descendant(&conn, np, &id)? {
            return Err("자기 자신 또는 하위로 이동할 수 없습니다".into());
        }
    }
    conn.execute(
        "UPDATE node SET parent_id = ?1, sort_order = ?2 WHERE id = ?3",
        params![new_parent_id, new_sort_order, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 형제 노드 재정렬 — ordered_ids 순서대로 sort_order 를 0..n 으로 원자적 재번호.
/// (ws_move 는 절대값만 받고 형제 재번호를 안 하므로, 드래그 재정렬은 이 커맨드로.)
#[tauri::command]
pub fn ws_reorder(state: State<Db>, ordered_ids: Vec<String>) -> Result<(), String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for (i, id) in ordered_ids.iter().enumerate() {
        tx.execute(
            "UPDATE node SET sort_order = ?1 WHERE id = ?2",
            params![i as i64, id],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn ws_toggle_favorite(state: State<Db>, real_path: String) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let exists = conn
        .query_row("SELECT 1 FROM favorite WHERE real_path = ?1", params![real_path], |_| Ok(true))
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(false);
    if exists {
        conn.execute("DELETE FROM favorite WHERE real_path = ?1", params![real_path])
            .map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        conn.execute(
            "INSERT INTO favorite (real_path, added_at) VALUES (?1, ?2)",
            params![real_path, now_ms()],
        )
        .map_err(|e| e.to_string())?;
        Ok(true)
    }
}

#[tauri::command]
pub fn ws_touch_recent(state: State<Db>, real_path: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO recent (real_path, opened_at) VALUES (?1, ?2)
         ON CONFLICT(real_path) DO UPDATE SET opened_at = excluded.opened_at",
        params![real_path, now_ms()],
    )
    .map_err(|e| e.to_string())?;
    // 최근 50개만 유지.
    conn.execute(
        "DELETE FROM recent WHERE real_path NOT IN
         (SELECT real_path FROM recent ORDER BY opened_at DESC LIMIT 50)",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn ws_export(state: State<Db>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let nodes = load_nodes(&conn)?;
    serde_json::to_string_pretty(&nodes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ws_import(state: State<Db>, json: String) -> Result<(), String> {
    let nodes: Vec<Node> = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    // 자기참조 FK: 부모/자식 삽입 순서와 무관하게 커밋 시점에 검증.
    tx.execute_batch("PRAGMA defer_foreign_keys = ON;")
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM node WHERE workspace_id = 'default'", [])
        .map_err(|e| e.to_string())?;
    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO node (id, workspace_id, parent_id, kind, name, real_path, sort_order, created_at)
                 VALUES (?1, 'default', ?2, ?3, ?4, ?5, ?6, ?7)",
            )
            .map_err(|e| e.to_string())?;
        for n in &nodes {
            stmt.execute(params![n.id, n.parent_id, n.kind, n.name, n.real_path, n.sort_order, now_ms()])
                .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn settings_get_all(state: State<Db>) -> Result<Vec<(String, String)>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT key, value FROM settings").map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[tauri::command]
pub fn settings_set(state: State<Db>, key: String, value: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
