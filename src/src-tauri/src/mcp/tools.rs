//! MCP 도구 표면.
//!
//! **파일시스템이 이미 하는 일은 주지 않는다**(ADR 0002). 에이전트는 이미 md 를 읽고 쓰고
//! grep 한다 — 여기 있는 것은 전부 *이 앱만 아는 것*이다: FTS5 색인 · 헤딩 아웃라인 ·
//! 워크스페이스 가상 배치. `write_doc`·`create_doc`·`delete` 는 **일부러 없다**(값은 0 이고
//! 프롬프트 인젝션 표면만 는다).
//!
//! 도구 이름·인자·설명은 **모델이 읽는 API 표면**이라 코드 식별자와 같은 취급으로 영어다.
//! 반면 사용자에게 그대로 보이는 **오류 문구는 한국어**다.

use crate::commands::search::{build_match, match_rows, rel_under, under_root};
use crate::commands::workspace::{load_nodes, Node};
use crate::mcp::outline;
use rusqlite::Connection;
use serde_json::{json, Value};
use std::path::Path;

/// 읽어 줄 확장자. 색인 대상(`search.rs` `INDEX_EXTS`)과 같은 집합.
const READABLE_EXTS: [&str; 4] = ["md", "markdown", "mdx", "txt"];
/// 파일 하나를 메모리에 올릴 때의 상한.
const MAX_READ_BYTES: u64 = 4 * 1024 * 1024;
/// 도구 응답에 실어 보낼 본문 길이 상한(문자). 넘으면 잘라 내고 그 사실을 알린다.
const MAX_OUTPUT_CHARS: usize = 60_000;
/// 스니펫 하이라이트 센티넬(STX/ETX) — 제어문자라 응답에서는 떼어 낸다.
const SENTINELS: [char; 2] = ['\u{2}', '\u{3}'];

/// 에이전트가 볼 수 있는 범위 = 사용자가 워크스페이스에 넣어 둔 것.
///
/// 전역 검색은 머신 전체 색인을 조회하므로(`search.rs`) 스코프를 안 걸면 사용자의 **무관한
/// 문서까지** 에이전트에게 샌다. 그래서 모든 경로 인자는 여기를 통과해야 한다.
#[derive(Debug, Default)]
pub struct Scope {
    /// 가져온 폴더의 실제 경로 — 그 하위 전부가 허용된다.
    pub roots: Vec<String>,
    /// 개별 파일 참조 — 그 파일만 허용된다.
    pub files: Vec<String>,
}

impl Scope {
    pub fn load(conn: &Connection) -> Result<Scope, String> {
        let mut scope = Scope::default();
        for n in load_nodes(conn)? {
            match (n.kind.as_str(), n.real_path) {
                ("imported_folder", Some(p)) => scope.roots.push(p),
                ("file_ref", Some(p)) => scope.files.push(p),
                _ => {}
            }
        }
        Ok(scope)
    }

    /// 순수 판정 — 경로 비교는 `search.rs` 의 것을 그대로 쓴다(구분자·대소문자 무시,
    /// 형제 접두어 `C:\a` vs `C:\ab` 를 안 잡는다).
    pub fn allows(&self, path: &str) -> bool {
        self.roots.iter().any(|r| under_root(path, r))
            || self.files.iter().any(|f| rel_under(path, f) == Some(""))
    }

    pub fn is_empty(&self) -> bool {
        self.roots.is_empty() && self.files.is_empty()
    }
}

/// `tools/list` 응답의 도구 목록.
pub fn catalog() -> Value {
    json!([
        {
            "name": "search_docs",
            "description": "Full-text search across the README.md workspace, ranked by relevance (SQLite FTS5). Prefer this over grep: it is pre-indexed, ranked, and already scoped to the folders the user added to their workspace.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "Search words. Implicit AND; the last word is a prefix match." },
                    "root": { "type": "string", "description": "Optional absolute path to restrict the search to. Must be inside the workspace." },
                    "limit": { "type": "integer", "description": "Max hits (default 20, max 50)." }
                },
                "required": ["query"]
            }
        },
        {
            "name": "outline",
            "description": "List the headings of a markdown document with their line numbers. Call this before read_section to decide what to read, instead of loading a whole large document.",
            "inputSchema": {
                "type": "object",
                "properties": { "path": { "type": "string", "description": "Absolute path to a document inside the workspace." } },
                "required": ["path"]
            }
        },
        {
            "name": "read_section",
            "description": "Read one section of a markdown document by heading, or an explicit line range. A heading returns that heading through the end of its section, including nested sub-sections. Omit both to read the whole file.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Absolute path to a document inside the workspace." },
                    "heading": { "type": "string", "description": "Heading text. Exact match first, then case-insensitive substring." },
                    "fromLine": { "type": "integer", "description": "1-based start line, used when heading is omitted." },
                    "toLine": { "type": "integer", "description": "1-based end line, inclusive." }
                },
                "required": ["path"]
            }
        },
        {
            "name": "list_workspace",
            "description": "Return the workspace tree: virtual folders the user arranged by hand, file references, and imported folder roots. This layout exists only inside README.md and is not visible on disk. Children of an imported folder are NOT listed here; search under its path instead.",
            "inputSchema": { "type": "object", "properties": {} }
        }
    ])
}

pub fn call(conn: &Connection, name: &str, args: &Value) -> Result<Value, String> {
    let scope = Scope::load(conn)?;
    match name {
        "search_docs" => search_docs(conn, &scope, args),
        "outline" => outline_tool(&scope, args),
        "read_section" => read_section(&scope, args),
        "list_workspace" => list_workspace(conn),
        other => Err(format!("알 수 없는 도구입니다: {other}")),
    }
}

fn str_arg<'a>(args: &'a Value, key: &str) -> Option<&'a str> {
    args.get(key).and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty())
}

fn usize_arg(args: &Value, key: &str) -> Option<usize> {
    args.get(key).and_then(Value::as_u64).map(|n| n as usize)
}

fn search_docs(conn: &Connection, scope: &Scope, args: &Value) -> Result<Value, String> {
    let query = str_arg(args, "query").ok_or("query 인자가 필요합니다")?;
    if scope.is_empty() {
        return Err("워크스페이스가 비어 있습니다 — 앱에서 폴더를 먼저 가져오세요".into());
    }
    let root = str_arg(args, "root");
    if let Some(r) = root {
        if !scope.allows(r) {
            return Err(format!("워크스페이스 밖 경로입니다: {r}"));
        }
    }
    let limit = usize_arg(args, "limit").unwrap_or(20).clamp(1, 50);

    let Some(match_expr) = build_match(query) else {
        return Ok(json!({ "hits": [] }));
    };
    // LIKE 는 거친 필터일 뿐이고(형제 접두어를 잡는다) 최종 판정은 스코프가 한다.
    // 걸러 낼 것을 감안해 넉넉히 가져온 뒤 자른다.
    let like = root.map(|r| format!("{}%", r.trim_end_matches(['/', '\\'])));
    let rows = match_rows(conn, &match_expr, like.as_deref(), (limit * 5).min(300) as i64)?;

    let hits: Vec<Value> = rows
        .into_iter()
        .filter(|(path, _)| match root {
            Some(r) => under_root(path, r),
            None => scope.allows(path),
        })
        .take(limit)
        .map(|(path, snippet)| {
            let name = Path::new(&path)
                .file_name()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_else(|| path.clone());
            json!({
                "path": path,
                "name": name,
                "snippet": snippet.replace(SENTINELS, ""),
            })
        })
        .collect();
    Ok(json!({ "hits": hits }))
}

/// 스코프·확장자·크기를 확인하고 파일을 읽는다.
fn read_doc(scope: &Scope, args: &Value) -> Result<(String, String), String> {
    let path = str_arg(args, "path").ok_or("path 인자가 필요합니다")?;
    if !scope.allows(path) {
        return Err(format!("워크스페이스 밖 경로입니다: {path}"));
    }
    let p = Path::new(path);
    let ext_ok = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| READABLE_EXTS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false);
    if !ext_ok {
        return Err(format!("읽을 수 있는 문서가 아닙니다(.md/.markdown/.mdx/.txt): {path}"));
    }
    let meta = std::fs::metadata(p).map_err(|e| format!("파일을 열 수 없습니다: {e}"))?;
    if meta.len() > MAX_READ_BYTES {
        return Err(format!("파일이 너무 큽니다({} bytes) — 상한 {MAX_READ_BYTES}", meta.len()));
    }
    let text = std::fs::read_to_string(p).map_err(|e| format!("파일을 읽을 수 없습니다: {e}"))?;
    // 편집기와 같은 기준으로 줄을 세기 위해 줄끝을 통일한다(`lib/tauri.ts` `readFile` 과 같은 이유).
    Ok((path.to_string(), text.replace("\r\n", "\n").replace('\r', "\n")))
}

fn outline_tool(scope: &Scope, args: &Value) -> Result<Value, String> {
    let (path, text) = read_doc(scope, args)?;
    let items: Vec<Value> = outline::headings(&text)
        .into_iter()
        .map(|h| json!({ "level": h.level, "text": h.text, "line": h.line }))
        .collect();
    Ok(json!({ "path": path, "lines": text.lines().count(), "headings": items }))
}

fn read_section(scope: &Scope, args: &Value) -> Result<Value, String> {
    let (path, text) = read_doc(scope, args)?;
    let total = text.lines().count();

    let (from, to) = if let Some(heading) = str_arg(args, "heading") {
        outline::section_range(&text, heading)
            .ok_or_else(|| format!("그런 제목이 없습니다: {heading}"))?
    } else {
        let from = usize_arg(args, "fromLine").unwrap_or(1).max(1);
        let to = usize_arg(args, "toLine").unwrap_or(total);
        (from, to)
    };

    let body = outline::slice_lines(&text, from, to);
    let (body, truncated) = if body.chars().count() > MAX_OUTPUT_CHARS {
        (body.chars().take(MAX_OUTPUT_CHARS).collect::<String>(), true)
    } else {
        (body, false)
    };
    Ok(json!({
        "path": path,
        "fromLine": from,
        "toLine": to.min(total),
        "totalLines": total,
        "truncated": truncated,
        "text": body,
    }))
}

fn list_workspace(conn: &Connection) -> Result<Value, String> {
    let nodes = load_nodes(conn)?;
    Ok(json!({ "tree": subtree(&nodes, None) }))
}

/// 평평한 노드 목록을 트리로. `sort_order` 는 이미 SQL 이 정렬해 두었다.
fn subtree(nodes: &[Node], parent: Option<&str>) -> Value {
    let children: Vec<Value> = nodes
        .iter()
        .filter(|n| n.parent_id.as_deref() == parent)
        .map(|n| {
            let mut obj = json!({
                "id": n.id,
                "kind": n.kind,
                "name": n.name,
                "children": subtree(nodes, Some(&n.id)),
            });
            if let Some(p) = &n.real_path {
                obj["path"] = json!(p);
            }
            if n.kind == "imported_folder" {
                // 가져온 폴더의 하위는 DB 에 없다(렌더마다 디스크에서 파생한다 — D1).
                // 이 표식이 없으면 에이전트가 "빈 폴더" 로 읽는다.
                obj["childrenFromDisk"] = json!(true);
            }
            obj
        })
        .collect();
    Value::Array(children)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scope() -> Scope {
        Scope {
            roots: vec![r"C:\work\docs".into()],
            files: vec![r"C:\notes\one.md".into()],
        }
    }

    #[test]
    fn allows_paths_under_an_imported_root() {
        assert!(scope().allows(r"C:\work\docs\a\b.md"));
        assert!(scope().allows(r"C:\work\docs"));
    }

    #[test]
    fn rejects_sibling_prefix() {
        // `C:\work\docs` 가 `C:\work\docsets` 를 잡으면 스코프가 새는 것이다.
        assert!(!scope().allows(r"C:\work\docsets\x.md"));
    }

    #[test]
    fn separator_and_case_do_not_matter() {
        assert!(scope().allows(r"c:/WORK/Docs/a.md"));
    }

    #[test]
    fn file_ref_allows_only_that_file() {
        assert!(scope().allows(r"C:\notes\one.md"));
        assert!(!scope().allows(r"C:\notes\two.md"));
    }

    #[test]
    fn empty_scope_allows_nothing() {
        assert!(!Scope::default().allows(r"C:\anything.md"));
        assert!(Scope::default().is_empty());
    }

    #[test]
    fn catalog_is_read_only() {
        // 쓰기 도구가 실수로 섞여 들어오는 것을 막는다 — ADR 0002 의 계약이다.
        let cat = catalog();
        let names: Vec<String> = cat
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap().to_string())
            .collect();
        assert_eq!(names, vec!["search_docs", "outline", "read_section", "list_workspace"]);
        let text = cat.to_string();
        for forbidden in ["write_doc", "create_doc", "delete_doc", "place_doc", "open_in_app"] {
            assert!(!text.contains(forbidden), "{forbidden} 는 이 단위에 없어야 한다");
        }
    }

    #[test]
    fn every_tool_declares_an_object_schema() {
        for t in catalog().as_array().unwrap() {
            assert_eq!(t["inputSchema"]["type"], "object", "{} 스키마", t["name"]);
            assert!(t["description"].as_str().is_some_and(|d| d.len() > 20));
        }
    }
}
