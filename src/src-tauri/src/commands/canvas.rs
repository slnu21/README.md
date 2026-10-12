//! 캔버스 카드 정보(ADR 0004 3절) — file 노드 카드에 보일 제목 · 아웃라인 · 첫 문단.
//!
//! **본문을 렌더하지 않는다** — 카드는 읽으러 가는 길이다. 내용은 **색인에서** 꺼낸다(파일을 매번 읽지 않는다,
//! 색인에 없으면 디스크에서 — 1MB 까지). 헤딩은 브리지 `outline` 과 같은 Rust 파서(펜스·frontmatter·BOM).
//! 경로 후보는 프런트(`app/lib/canvas/paths.ts`)가 정한다 — 여기선 **처음으로 있는 것**을 고를 뿐이라 규칙이 한 벌이다.

use crate::db::Db;
use crate::mcp::outline;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::State;

const MAX_BYTES: u64 = 1024 * 1024;
const MAX_OUTLINE: usize = 12;
const EXCERPT_CHARS: usize = 220;

#[derive(Deserialize)]
pub struct CardQuery {
    /// 노드의 `file` 값(그대로 돌려준다 — 프런트가 짝을 맞춘다).
    pub file: String,
    pub candidates: Vec<String>,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OutlineItem {
    pub level: u8,
    pub text: String,
    pub line: usize,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CardInfo {
    pub file: String,
    /// 찾은 절대 경로(없으면 None — 카드는 "파일 없음"으로 남는다).
    pub path: Option<String>,
    pub title: String,
    pub outline: Vec<OutlineItem>,
    pub excerpt: String,
}

/// 첫 문단 — frontmatter·헤딩·펜스·표·목록 기호를 건너뛴 첫 글 덩어리(한 줄로).
pub(crate) fn excerpt(src: &str) -> String {
    let lines: Vec<&str> = src.lines().collect();
    let mut fence: Option<(char, usize)> = None;
    let mut para: Vec<String> = Vec::new();
    for l in lines.iter().skip(outline::skip_frontmatter(&lines)) {
        if let Some((fc, fl)) = fence {
            let t = l.trim_start();
            if t.chars().take_while(|c| *c == fc).count() >= fl && t.trim_start_matches(fc).trim().is_empty() {
                fence = None;
            }
            continue;
        }
        if let Some(m) = outline::fence_marker(l) {
            if !para.is_empty() {
                break;
            }
            fence = Some(m);
            continue;
        }
        let t = l.trim();
        if t.is_empty() {
            if !para.is_empty() {
                break;
            }
            continue;
        }
        if t.starts_with('#') || t.starts_with('|') || t.starts_with("<!--") || t.chars().all(|c| matches!(c, '-' | '=' | '*' | '_' | ' ')) {
            if !para.is_empty() {
                break;
            }
            continue;
        }
        let t = t.trim_start_matches(['>', ' ']).trim_start_matches("- ").trim_start_matches("* ");
        para.push(t.replace(['*', '`'], ""));
    }
    let one = para.join(" ");
    if one.chars().count() > EXCERPT_CHARS {
        let cut: String = one.chars().take(EXCERPT_CHARS - 1).collect();
        format!("{cut}…")
    } else {
        one
    }
}

fn file_name_title(path: &str) -> String {
    let name = Path::new(path).file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| path.to_string());
    match name.rfind('.') {
        Some(i) if i > 0 => name[..i].to_string(),
        _ => name,
    }
}

/// 색인에 있으면 거기서, 없으면 디스크에서.
fn content_of(conn: &Connection, path: &str) -> Option<String> {
    let indexed: Option<String> = conn
        .query_row(
            "SELECT f.content FROM file_meta m JOIN file_index f ON f.rowid = m.fts_rowid WHERE m.real_path = ?1",
            params![path],
            |r| r.get(0),
        )
        .optional()
        .ok()
        .flatten();
    if indexed.is_some() {
        return indexed;
    }
    let meta = std::fs::metadata(path).ok()?;
    if meta.len() > MAX_BYTES {
        return None;
    }
    std::fs::read_to_string(path).ok()
}

pub(crate) fn card(conn: &Connection, q: &CardQuery) -> CardInfo {
    let found = q.candidates.iter().find(|c| Path::new(c).is_file()).cloned();
    let Some(path) = found else {
        return CardInfo { file: q.file.clone(), path: None, title: file_name_title(&q.file), outline: vec![], excerpt: String::new() };
    };
    let text = content_of(conn, &path).map(|t| outline::normalize(&t)).unwrap_or_default();
    let hs = outline::headings(&text);
    let title = hs.iter().find(|h| h.level == 1).map(|h| h.text.clone()).unwrap_or_else(|| file_name_title(&path));
    CardInfo {
        file: q.file.clone(),
        path: Some(path),
        title,
        outline: hs.into_iter().filter(|h| h.level <= 3).take(MAX_OUTLINE).map(|h| OutlineItem { level: h.level, text: h.text, line: h.line }).collect(),
        excerpt: excerpt(&text),
    }
}

/// 볼트 루트 — 캔버스 위로 `.obsidian` 폴더가 있는 가장 가까운 조상(없으면 None). 옵시디언 경로는 거기 기준이다.
pub(crate) fn vault_root(canvas_path: &str) -> Option<String> {
    let mut dir = Path::new(canvas_path).parent();
    while let Some(d) = dir {
        if d.join(".obsidian").is_dir() {
            return Some(d.to_string_lossy().into_owned());
        }
        dir = d.parent();
    }
    None
}

#[tauri::command]
pub fn canvas_cards(state: State<Db>, items: Vec<CardQuery>) -> Result<Vec<CardInfo>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    Ok(items.iter().map(|q| card(&conn, q)).collect())
}

#[tauri::command]
pub fn canvas_vault_root(path: String) -> Option<String> {
    vault_root(&path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn excerpt_skips_frontmatter_headings_fences_and_tables() {
        let src = "---\ntitle: x\n---\n# 보고\n\n```sh\n# 주석\n```\n\n| a | b |\n|---|---|\n\n> **첫 문단**은 여기서\n이어진다 `코드`.\n\n둘째 문단.\n";
        assert_eq!(excerpt(src), "첫 문단은 여기서 이어진다 코드.");
        let long = format!("{}\n", "가".repeat(400));
        assert_eq!(excerpt(&long).chars().count(), EXCERPT_CHARS);
    }

    #[test]
    fn card_picks_the_first_existing_candidate_and_reads_the_outline() {
        let dir = std::env::temp_dir().join(format!("canvas-card-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("notes")).unwrap();
        let doc = dir.join("notes").join("plan.md");
        std::fs::write(&doc, "\u{feff}# 계획\r\n\r\n목표를 적는다.\r\n\r\n## 목표\r\n### 세부\r\n#### 너무 깊음\r\n").unwrap();
        let mut c = Connection::open_in_memory().unwrap();
        crate::db::migrate_for_test(&mut c).unwrap();
        let q = CardQuery {
            file: "notes/plan.md".into(),
            candidates: vec![dir.join("nope.md").to_string_lossy().into_owned(), doc.to_string_lossy().into_owned()],
        };
        let info = card(&c, &q);
        assert_eq!(info.path.as_deref(), Some(doc.to_string_lossy().as_ref()));
        assert_eq!(info.title, "계획", "BOM 이 첫 헤딩을 가리면 안 된다");
        assert_eq!(info.outline.iter().map(|o| o.level).collect::<Vec<_>>(), vec![1, 2, 3]);
        assert_eq!(info.outline[1].line, 5);
        assert_eq!(info.excerpt, "목표를 적는다.");

        let missing = card(&c, &CardQuery { file: "gone/old-name.md".into(), candidates: vec![dir.join("gone.md").to_string_lossy().into_owned()] });
        assert_eq!((missing.path, missing.title.as_str()), (None, "old-name"));

        std::fs::create_dir_all(dir.join(".obsidian")).unwrap();
        assert_eq!(vault_root(&dir.join("maps").join("m.canvas").to_string_lossy()).as_deref(), Some(dir.to_string_lossy().as_ref()));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
