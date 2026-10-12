//! 표시 펜 저장(ADR 0003) — 형광펜·밑줄·점 표시·세로줄과 메모.
//!
//! 표시는 **스냅샷 원문의 글자 범위**를 기억한다. 다는 순간 지금 판을 고정하고(`history::pin`),
//! "지금 판에서 어디냐"는 저장하지 않는다 — 프런트가 열 때마다 diff 로 옮긴다(`app/lib/annot`).
//! 여기서는 받은 값을 **좁힌다**: 열거값만 · 범위는 그 판 안 · 범위의 글이 `quote` 와 같아야 한다.
//! 마지막 검사가 경합을 막는다 — 미리보기를 그린 뒤 디스크가 바뀌었으면 오프셋이 다른 글을 가리킨다.

use crate::commands::history;
use crate::db::{now_ms, Db};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

const RANGE_STYLES: [&str; 5] = ["highlight", "underline", "wavy", "strike", "circle"];
const POINT_STYLES: [&str; 4] = ["star", "question", "exclaim", "check"];
const BLOCK_STYLES: [&str; 1] = ["bar"];
const COLORS: [&str; 5] = ["yellow", "orange", "pink", "green", "blue"];
/// 앞뒤 문맥은 프런트가 32자를 쓴다 — 넉넉히 받고 그 이상은 거절.
const MAX_CONTEXT: usize = 256;
const MAX_NOTE: usize = 10_000;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Annotation {
    pub id: String,
    pub path: String,
    pub snapshot_id: i64,
    pub kind: String,
    pub style: String,
    pub color: String,
    pub src_start: i64,
    pub src_end: i64,
    pub quote: String,
    pub prefix: String,
    pub suffix: String,
    pub note: Option<String>,
    pub resolved: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NewAnnotation {
    pub id: String,
    pub path: String,
    pub kind: String,
    pub style: String,
    pub color: String,
    pub src_start: i64,
    pub src_end: i64,
    pub quote: String,
    pub prefix: String,
    pub suffix: String,
    pub note: Option<String>,
}

#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationPatch {
    pub style: Option<String>,
    pub color: Option<String>,
    /// `Some(None)` 은 메모 지우기 — JSON `null` 과 키 없음을 가르려고 이중 Option.
    #[serde(default, deserialize_with = "double_option")]
    pub note: Option<Option<String>>,
    pub resolved: Option<bool>,
}

fn double_option<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Option<Option<String>>, D::Error> {
    Option::<String>::deserialize(d).map(Some)
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotText {
    pub id: i64,
    pub content: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationSet {
    pub annotations: Vec<Annotation>,
    /// 표시들이 가리키는 판의 원문(중복 없이). 프런트가 지금 판으로 옮길 때 쓴다.
    pub snapshots: Vec<SnapshotText>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Added {
    pub annotation: Annotation,
    pub snapshot: SnapshotText,
}

/// 표시의 위치 기준 — BOM 없음 · 줄끝 LF (`app/lib/annot/relocate.ts canonicalText` 와 같은 규칙).
pub(crate) fn canonical(text: &str) -> String {
    text.strip_prefix('\u{feff}').unwrap_or(text).replace("\r\n", "\n").replace('\r', "\n")
}

fn styles_for(kind: &str) -> Option<&'static [&'static str]> {
    match kind {
        "range" => Some(&RANGE_STYLES),
        "point" => Some(&POINT_STYLES),
        "block" => Some(&BLOCK_STYLES),
        _ => None,
    }
}

fn check_style(kind: &str, style: &str) -> Result<(), String> {
    let ok = styles_for(kind).ok_or_else(|| format!("모르는 표시 종류 / Unknown kind: {kind}"))?;
    if !ok.contains(&style) {
        return Err(format!("이 종류에 없는 펜 / Pen not allowed for {kind}: {style}"));
    }
    Ok(())
}

fn check_color(color: &str) -> Result<(), String> {
    if !COLORS.contains(&color) {
        return Err(format!("모르는 색 / Unknown color: {color}"));
    }
    Ok(())
}

fn check_note(note: &Option<String>) -> Result<(), String> {
    if note.as_ref().is_some_and(|n| n.chars().count() > MAX_NOTE) {
        return Err("메모가 너무 깁니다 / Note too long".into());
    }
    Ok(())
}

/// 받은 표시를 그 판에 대해 검사한다. 오프셋은 UTF-16 단위(JS 문자열 위치)다.
fn validate(a: &NewAnnotation, snapshot: &str) -> Result<(), String> {
    if a.id.is_empty() || a.id.len() > 64 || !a.id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("잘못된 id / Bad id".into());
    }
    check_style(&a.kind, &a.style)?;
    check_color(&a.color)?;
    check_note(&a.note)?;
    if a.prefix.chars().count() > MAX_CONTEXT || a.suffix.chars().count() > MAX_CONTEXT {
        return Err("문맥이 너무 깁니다 / Context too long".into());
    }
    let units: Vec<u16> = canonical(snapshot).encode_utf16().collect();
    let (s, e) = (a.src_start, a.src_end);
    if s < 0 || e < s || e as usize > units.len() {
        return Err("범위가 문서 밖입니다 / Range outside the document".into());
    }
    if a.kind == "range" && s == e {
        return Err("빈 범위 / Empty range".into());
    }
    let slice = String::from_utf16(&units[s as usize..e as usize]).map_err(|_| "범위가 글자 중간에서 잘렸습니다 / Range splits a character".to_string())?;
    if slice != a.quote {
        return Err("문서가 방금 바뀌었습니다 — 다시 열고 표시하세요 / The document just changed — reopen it and try again".into());
    }
    Ok(())
}

fn row_to_annotation(r: &rusqlite::Row) -> rusqlite::Result<Annotation> {
    Ok(Annotation {
        id: r.get(0)?,
        path: r.get(1)?,
        snapshot_id: r.get(2)?,
        kind: r.get(3)?,
        style: r.get(4)?,
        color: r.get(5)?,
        src_start: r.get(6)?,
        src_end: r.get(7)?,
        quote: r.get(8)?,
        prefix: r.get(9)?,
        suffix: r.get(10)?,
        note: r.get(11)?,
        resolved: r.get::<_, i64>(12)? != 0,
        created_at: r.get(13)?,
        updated_at: r.get(14)?,
    })
}

const COLS: &str = "id, real_path, snapshot_id, kind, style, color, src_start, src_end, quote, prefix, suffix, note, resolved, created_at, updated_at";

fn get(conn: &Connection, id: &str) -> Result<Option<Annotation>, String> {
    conn.query_row(&format!("SELECT {COLS} FROM annotation WHERE id = ?1"), params![id], row_to_annotation)
        .optional()
        .map_err(|e| e.to_string())
}

/// 지금 판을 고정하고 표시 하나를 넣는다. 한 트랜잭션 — 고정한 판과 표시가 함께 생기거나 함께 없다.
pub(crate) fn add(conn: &Connection, a: &NewAnnotation) -> Result<Added, String> {
    conn.execute_batch("BEGIN IMMEDIATE").map_err(|e| e.to_string())?;
    let r = (|| {
        let (snapshot_id, content) = history::pin(conn, &a.path)?;
        validate(a, &content)?;
        let now = now_ms();
        conn.execute(
            &format!("INSERT INTO annotation ({COLS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0, ?13, ?13)"),
            params![a.id, a.path, snapshot_id, a.kind, a.style, a.color, a.src_start, a.src_end, a.quote, a.prefix, a.suffix, a.note, now],
        )
        .map_err(|e| e.to_string())?;
        // 표시를 넣은 *뒤*에 정리 — 새 판은 이제 참조가 있어 안 지워진다.
        history::prune(conn, &a.path)?;
        let annotation = get(conn, &a.id)?.ok_or("표시를 넣지 못했습니다 / Failed to add")?;
        Ok(Added { annotation, snapshot: SnapshotText { id: snapshot_id, content } })
    })();
    match r {
        Ok(v) => {
            conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
            Ok(v)
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}

pub(crate) fn list(conn: &Connection, path: &str) -> Result<AnnotationSet, String> {
    let mut stmt = conn
        .prepare(&format!("SELECT {COLS} FROM annotation WHERE real_path = ?1 ORDER BY src_start, created_at"))
        .map_err(|e| e.to_string())?;
    let annotations: Vec<Annotation> = stmt
        .query_map(params![path], row_to_annotation)
        .map_err(|e| e.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;
    let mut ids: Vec<i64> = annotations.iter().map(|a| a.snapshot_id).collect();
    ids.sort_unstable();
    ids.dedup();
    let mut snapshots = Vec::with_capacity(ids.len());
    for id in ids {
        let content: String = conn
            .query_row("SELECT content FROM doc_snapshot WHERE id = ?1", params![id], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        snapshots.push(SnapshotText { id, content });
    }
    Ok(AnnotationSet { annotations, snapshots })
}

pub(crate) fn update(conn: &Connection, id: &str, p: &AnnotationPatch) -> Result<Annotation, String> {
    let cur = get(conn, id)?.ok_or("그 표시가 없습니다 / No such annotation")?;
    let style = p.style.clone().unwrap_or(cur.style);
    let color = p.color.clone().unwrap_or(cur.color);
    let note = p.note.clone().unwrap_or(cur.note);
    let resolved = p.resolved.unwrap_or(cur.resolved);
    check_style(&cur.kind, &style)?;
    check_color(&color)?;
    check_note(&note)?;
    conn.execute(
        "UPDATE annotation SET style = ?2, color = ?3, note = ?4, resolved = ?5, updated_at = ?6 WHERE id = ?1",
        params![id, style, color, note, resolved as i64, now_ms()],
    )
    .map_err(|e| e.to_string())?;
    get(conn, id)?.ok_or_else(|| "그 표시가 없습니다 / No such annotation".into())
}

pub(crate) fn delete(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM annotation WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn annot_add(state: State<Db>, annotation: NewAnnotation) -> Result<Added, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    add(&conn, &annotation)
}

#[tauri::command]
pub fn annot_list(state: State<Db>, path: String) -> Result<AnnotationSet, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    list(&conn, &path)
}

#[tauri::command]
pub fn annot_update(state: State<Db>, id: String, patch: AnnotationPatch) -> Result<Annotation, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    update(&conn, &id, &patch)
}

#[tauri::command]
pub fn annot_delete(state: State<Db>, id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    delete(&conn, &id)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Tmp(std::path::PathBuf);
    impl Drop for Tmp {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn setup(body: &str) -> (Connection, Tmp, String) {
        let mut c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        crate::db::migrate_for_test(&mut c).unwrap();
        let dir = std::env::temp_dir().join(format!("annot-test-{}-{}", std::process::id(), now_ms() ^ (body.len() as i64 * 7919)));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("doc.md");
        std::fs::write(&path, body).unwrap();
        (c, Tmp(dir), path.to_string_lossy().into_owned())
    }

    fn new_ann(path: &str, id: &str, text: &str, needle: &str) -> NewAnnotation {
        let canon = canonical(text);
        let byte = canon.find(needle).unwrap();
        let s = canon[..byte].encode_utf16().count() as i64;
        let e = s + needle.encode_utf16().count() as i64;
        NewAnnotation {
            id: id.into(),
            path: path.into(),
            kind: "range".into(),
            style: "highlight".into(),
            color: "yellow".into(),
            src_start: s,
            src_end: e,
            quote: needle.into(),
            prefix: String::new(),
            suffix: String::new(),
            note: Some("근거?".into()),
        }
    }

    fn snapshot_count(c: &Connection) -> i64 {
        c.query_row("SELECT count(*) FROM doc_snapshot", [], |r| r.get(0)).unwrap()
    }

    #[test]
    fn adding_pins_the_current_version_and_reuses_it() {
        let body = "\u{feff}# 보고\r\n\r\n근거가 부족하다 😀 끝.\r\n";
        let (c, _t, path) = setup(body);
        let a = add(&c, &new_ann(&path, "a1", body, "근거가 부족하다")).unwrap();
        assert_eq!(a.snapshot.content, body, "판 원문은 디스크 그대로(정규화는 위치 계산에서)");
        // 같은 판에 하나 더 — 판을 새로 뜨지 않는다. 이모지 뒤 글자: UTF-16 오프셋이 맞아야 한다.
        let b = add(&c, &new_ann(&path, "a2", body, "끝")).unwrap();
        assert_eq!(b.annotation.snapshot_id, a.annotation.snapshot_id);
        assert_eq!(snapshot_count(&c), 1);
        let set = list(&c, &path).unwrap();
        assert_eq!(set.annotations.len(), 2);
        assert_eq!(set.snapshots.len(), 1);
    }

    #[test]
    fn pinning_ignores_the_coalescing_window() {
        // 방금 기록이 떠졌어도(합치기 창 안) 지금 판은 따로 고정해야 한다.
        let body = "v2 내용\n";
        let (c, _t, path) = setup(body);
        history::capture(&c, &path, "v1 내용\n", 1).unwrap();
        add(&c, &new_ann(&path, "a1", body, "v2")).unwrap();
        assert_eq!(snapshot_count(&c), 2);
    }

    #[test]
    fn a_stale_offset_is_refused_and_nothing_is_left_behind() {
        let body = "지금 디스크의 글\n";
        let (c, _t, path) = setup(body);
        let mut a = new_ann(&path, "a1", body, "디스크");
        a.quote = "다른 글".into(); // 미리보기를 그린 뒤 디스크가 바뀐 경우
        let err = add(&c, &a).unwrap_err();
        assert!(err.contains("just changed"), "{err}");
        assert_eq!(snapshot_count(&c), 0, "실패하면 고정한 판도 함께 되돌린다");
    }

    #[test]
    fn values_are_narrowed_to_known_ones() {
        let body = "글자\n";
        let (c, _t, path) = setup(body);
        let base = || new_ann(&path, "a1", body, "글자");
        let mut a = base();
        a.style = "bar".into();
        assert!(add(&c, &a).unwrap_err().contains("not allowed"));
        let mut a = base();
        a.color = "#ff0000".into();
        assert!(add(&c, &a).unwrap_err().contains("Unknown color"));
        let mut a = base();
        a.kind = "freehand".into();
        assert!(add(&c, &a).unwrap_err().contains("Unknown kind"));
        let mut a = base();
        a.id = "a1; DROP".into();
        assert!(add(&c, &a).unwrap_err().contains("Bad id"));
        let mut a = base();
        a.src_end = 99;
        assert!(add(&c, &a).unwrap_err().contains("outside"));
        let mut a = base();
        a.kind = "point".into();
        a.style = "star".into();
        assert!(add(&c, &a).is_ok(), "점 표시는 점 펜으로");
    }

    #[test]
    fn referenced_versions_survive_pruning() {
        // 이 설계에서 가장 중요한 한 줄 — 바쁜 문서에서 바탕 판이 조용히 지워지면 안 된다.
        let body = "칠할 문장.\n";
        let (c, _t, path) = setup(body);
        let added = add(&c, &new_ann(&path, "a1", body, "칠할 문장")).unwrap();
        let pinned = added.snapshot.id;
        for i in 0..40 {
            c.execute("UPDATE doc_snapshot SET taken_at = taken_at - 3600000", []).unwrap();
            history::capture(&c, &path, &format!("판 {i}"), 10_000 + i).unwrap();
        }
        let alive: i64 = c.query_row("SELECT count(*) FROM doc_snapshot WHERE id = ?1", params![pinned], |r| r.get(0)).unwrap();
        assert_eq!(alive, 1, "참조된 판이 정리됐다");
        let per_path: i64 = c.query_row("SELECT count(*) FROM doc_snapshot WHERE real_path = ?1", params![path], |r| r.get(0)).unwrap();
        assert!(per_path <= 31, "나머지는 여전히 상한을 지킨다: {per_path}");

        // 참조가 없어지면 다시 정리 대상.
        delete(&c, "a1").unwrap();
        c.execute("UPDATE doc_snapshot SET taken_at = taken_at - 3600000", []).unwrap();
        history::capture(&c, &path, "마지막 판", 99_999).unwrap();
        let alive: i64 = c.query_row("SELECT count(*) FROM doc_snapshot WHERE id = ?1", params![pinned], |r| r.get(0)).unwrap();
        assert_eq!(alive, 0);
    }

    #[test]
    fn an_old_prune_that_ignores_annotations_fails_instead_of_deleting() {
        // 1.0 의 정리(참조를 모른다)가 v5 DB 에서 돌면 — 외래 키가 바탕 판을 지킨다.
        let body = "칠할 문장.\n";
        let (c, _t, path) = setup(body);
        let added = add(&c, &new_ann(&path, "a1", body, "칠할 문장")).unwrap();
        let old_prune = c.execute("DELETE FROM doc_snapshot WHERE real_path = ?1", params![path]);
        assert!(old_prune.is_err(), "외래 키가 없으면 바탕 판이 지워진다");
        let alive: i64 = c.query_row("SELECT count(*) FROM doc_snapshot WHERE id = ?1", params![added.snapshot.id], |r| r.get(0)).unwrap();
        assert_eq!(alive, 1);
    }

    #[test]
    fn update_and_delete() {
        let body = "글자 하나\n";
        let (c, _t, path) = setup(body);
        add(&c, &new_ann(&path, "a1", body, "글자")).unwrap();
        let u = update(&c, "a1", &AnnotationPatch { resolved: Some(true), color: Some("green".into()), ..Default::default() }).unwrap();
        assert!(u.resolved);
        assert_eq!(u.color, "green");
        assert_eq!(u.note.as_deref(), Some("근거?"), "건드리지 않은 메모는 그대로");
        let u = update(&c, "a1", &AnnotationPatch { note: Some(None), ..Default::default() }).unwrap();
        assert_eq!(u.note, None, "null 은 메모 지우기");
        assert!(update(&c, "a1", &AnnotationPatch { style: Some("star".into()), ..Default::default() }).is_err(), "범위 표시를 점 펜으로 못 바꾼다");
        delete(&c, "a1").unwrap();
        assert!(list(&c, &path).unwrap().annotations.is_empty());
    }

    #[test]
    fn patch_json_distinguishes_null_from_missing() {
        let p: AnnotationPatch = serde_json::from_str(r#"{"note":null}"#).unwrap();
        assert_eq!(p.note, Some(None));
        let p: AnnotationPatch = serde_json::from_str(r#"{"resolved":true}"#).unwrap();
        assert_eq!(p.note, None);
    }

    #[test]
    fn large_documents_cannot_be_annotated() {
        let body = "x".repeat(1024 * 1024 + 1);
        let (c, _t, path) = setup(&body);
        let mut a = new_ann(&path, "a1", "xx", "xx");
        a.path = path.clone();
        assert!(add(&c, &a).unwrap_err().contains("1 MB"));
    }
}
