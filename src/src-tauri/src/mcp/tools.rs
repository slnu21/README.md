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
use crate::commands::workspace::{insert_node, load_nodes, Node};
use crate::mcp::outline;
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::path::Path;
use std::process::{Command, Stdio};

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

/// 제어 도구 허용 여부를 담는 설정 키. **앱 설정(SQLite)이 진실원**이라 서버를 다시 띄우지
/// 않아도 토글이 즉시 먹는다 — 매 호출마다 읽는다.
const CONTROL_SETTING_KEY: &str = "agentControlEnabled";

/// 사용자가 설정에서 제어 도구를 켰는가. 기본은 **꺼짐** — 상태를 보고 끌 수 없는 원격 제어는
/// 열지 않는다는 것이 ADR 0002 의 약속이다.
fn control_enabled(conn: &Connection) -> bool {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![CONTROL_SETTING_KEY],
        |r| r.get::<_, String>(0),
    )
    .ok()
    .is_some_and(|v| v == "1" || v.eq_ignore_ascii_case("true"))
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
            "name": "place_doc",
            "description": "Add a document to the user's README.md workspace as a reference, so it shows up in their sidebar. The file is NOT moved or copied - only a reference is added. Use this after writing a document the user should notice. Requires the user to enable control tools in Settings.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Absolute path to an existing .md/.markdown/.mdx/.txt file." },
                    "folder": { "type": "string", "description": "Target virtual folder, by name or id (see list_workspace). Omit to place at the top level." }
                },
                "required": ["path"]
            }
        },
        {
            "name": "open_in_app",
            "description": "Open a document in the user's README.md window so they can read it right now. Launches the app if it is not running. Requires the user to enable control tools in Settings.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Absolute path to an existing .md/.markdown/.mdx/.txt file." },
                    "beside": { "type": "boolean", "description": "Open in the side panel and keep the current document focused. Ignored on a cold start." }
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
        "place_doc" | "open_in_app" if !control_enabled(conn) => Err(format!(
            "{name} 은(는) 꺼져 있습니다 — README.md 설정 > 에이전트 연결에서 [문서 배치·열기 허용]을 켜 주세요"
        )),
        "place_doc" => place_doc(conn, args),
        "open_in_app" => open_in_app(args),
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

/// 확장자만 본다(존재 여부는 호출부가 따로 본다).
fn is_readable(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| READABLE_EXTS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

/// 스코프·확장자·크기를 확인하고 파일을 읽는다.
fn read_doc(scope: &Scope, args: &Value) -> Result<(String, String), String> {
    let path = str_arg(args, "path").ok_or("path 인자가 필요합니다")?;
    if !scope.allows(path) {
        return Err(format!("워크스페이스 밖 경로입니다: {path}"));
    }
    let p = Path::new(path);
    if !is_readable(p) {
        return Err(format!("읽을 수 있는 문서가 아닙니다(.md/.markdown/.mdx/.txt): {path}"));
    }
    let meta = std::fs::metadata(p).map_err(|e| format!("파일을 열 수 없습니다: {e}"))?;
    if meta.len() > MAX_READ_BYTES {
        return Err(format!("파일이 너무 큽니다({} bytes) — 상한 {MAX_READ_BYTES}", meta.len()));
    }
    let text = std::fs::read_to_string(p).map_err(|e| format!("파일을 읽을 수 없습니다: {e}"))?;
    // BOM 제거 + 줄끝 통일. BOM 을 안 떼면 첫 헤딩을 조용히 놓친다(outline::normalize 주석).
    Ok((path.to_string(), outline::normalize(&text)))
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

/// 제어 도구가 받는 경로 — **존재하는 읽을 수 있는 문서**인지만 본다.
///
/// **스코프를 걸지 않는다.** 워크스페이스 *밖* 문서를 들이는 것이 이 도구들의 목적이기
/// 때문이다(에이전트가 방금 쓴 보고서는 아직 어느 루트에도 없다). 대신 사용자가 설정에서
/// 켰을 때만 동작하고, 패널이 그 뜻을 그대로 적어 둔다.
fn existing_doc(args: &Value) -> Result<String, String> {
    let path = str_arg(args, "path").ok_or("path 인자가 필요합니다")?;
    let p = Path::new(path);
    if !is_readable(p) {
        return Err(format!("읽을 수 있는 문서가 아닙니다(.md/.markdown/.mdx/.txt): {path}"));
    }
    if !p.is_file() {
        return Err(format!("그런 파일이 없습니다: {path}"));
    }
    Ok(path.to_string())
}

/// 노드 id. 프런트가 `crypto.randomUUID()` 로 만드는 것과 **같은 모양**이라야 섞여도 티가 안 난다.
/// 난수는 SQLite 것을 쓴다 — 새 크레이트를 안 들이려고(`rand` 는 이 한 줄 때문에 과하다).
fn new_node_id(conn: &Connection) -> Result<String, String> {
    let hex: String = conn
        .query_row("SELECT lower(hex(randomblob(16)))", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    // 8-4-4-4-12. 판·변형 비트까지 흉내 내지는 않는다(우리에겐 불투명 문자열이다).
    Ok(format!(
        "{}-{}-{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32]
    ))
}

/// `folder` 인자(id 또는 이름) → 부모 노드 id. 없으면 최상위(None).
fn resolve_folder(nodes: &[Node], folder: Option<&str>) -> Result<Option<String>, String> {
    let Some(want) = folder else { return Ok(None) };
    if let Some(n) = nodes.iter().find(|n| n.id == want && n.kind == "virtual_folder") {
        return Ok(Some(n.id.clone()));
    }
    if let Some(n) = nodes
        .iter()
        .find(|n| n.kind == "virtual_folder" && n.name.eq_ignore_ascii_case(want))
    {
        return Ok(Some(n.id.clone()));
    }
    let known: Vec<&str> = nodes
        .iter()
        .filter(|n| n.kind == "virtual_folder")
        .map(|n| n.name.as_str())
        .collect();
    Err(format!(
        "그런 폴더가 없습니다: {want} (있는 폴더: {})",
        if known.is_empty() { "없음".to_string() } else { known.join(", ") }
    ))
}

fn place_doc(conn: &Connection, args: &Value) -> Result<Value, String> {
    let path = existing_doc(args)?;
    let nodes = load_nodes(conn)?;
    let parent = resolve_folder(&nodes, str_arg(args, "folder"))?;

    // 에이전트는 재시도한다 — 같은 부모 아래 같은 문서면 새로 만들지 않고 있던 것을 돌려준다.
    if let Some(existing) = nodes.iter().find(|n| {
        n.kind == "file_ref"
            && n.parent_id == parent
            && n.real_path.as_deref().is_some_and(|p| rel_under(p, &path) == Some(""))
    }) {
        return Ok(json!({ "id": existing.id, "name": existing.name, "created": false }));
    }

    let name = Path::new(&path)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.clone());
    let id = new_node_id(conn)?;
    insert_node(conn, &id, &parent, "file_ref", &name, &Some(path.clone()))?;
    Ok(json!({ "id": id, "name": name, "path": path, "created": true }))
}

fn open_in_app(args: &Value) -> Result<Value, String> {
    let path = existing_doc(args)?;
    let beside = args.get("beside").and_then(Value::as_bool).unwrap_or(false);
    let exe = std::env::current_exe().map_err(|e| format!("실행 파일 경로를 알 수 없습니다: {e}"))?;

    let mut cmd = Command::new(exe);
    if beside {
        cmd.arg("--beside");
    }
    cmd.arg(&path);
    // **표준 입출력을 물려주면 안 된다** — 앱이 우리 MCP 파이프를 붙든 채로 살아 있게 된다.
    cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    cmd.spawn().map_err(|e| format!("앱을 띄우지 못했습니다: {e}"))?;
    // 이미 떠 있으면 single-instance 가 경로를 기존 창으로 넘기고 이 프로세스는 곧 끝난다.
    Ok(json!({ "opened": path, "beside": beside }))
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
    fn catalog_never_grows_a_write_tool() {
        // 문서를 고치거나 지우는 도구는 없다 — ADR 0002 의 계약이다.
        let cat = catalog();
        let names: Vec<String> = cat
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap().to_string())
            .collect();
        assert_eq!(
            names,
            vec![
                "search_docs",
                "outline",
                "read_section",
                "place_doc",
                "open_in_app",
                "list_workspace"
            ]
        );
        let text = cat.to_string();
        for forbidden in ["write_doc", "create_doc", "delete_doc", "edit_doc", "move_doc"] {
            assert!(!text.contains(forbidden), "{forbidden} 는 있으면 안 된다");
        }
    }

    #[test]
    fn control_tools_say_they_need_the_setting() {
        // 에이전트가 왜 거부당했는지 스스로 알아야 사용자에게 "설정에서 켜세요"라고 말해 준다.
        for t in catalog().as_array().unwrap() {
            let name = t["name"].as_str().unwrap();
            if name == "place_doc" || name == "open_in_app" {
                let d = t["description"].as_str().unwrap();
                assert!(d.contains("Settings"), "{name} 설명에 설정 안내가 없다");
            }
        }
    }

    fn folders() -> Vec<Node> {
        let mk = |id: &str, kind: &str, name: &str| Node {
            id: id.into(),
            parent_id: None,
            kind: kind.into(),
            name: name.into(),
            real_path: None,
            sort_order: 0,
        };
        vec![mk("f-1", "virtual_folder", "보고서"), mk("f-2", "virtual_folder", "Notes")]
    }

    #[test]
    fn folder_resolves_by_id_then_by_name() {
        assert_eq!(resolve_folder(&folders(), Some("f-1")).unwrap(), Some("f-1".into()));
        assert_eq!(resolve_folder(&folders(), Some("보고서")).unwrap(), Some("f-1".into()));
        assert_eq!(resolve_folder(&folders(), Some("notes")).unwrap(), Some("f-2".into()));
    }

    #[test]
    fn no_folder_means_top_level() {
        assert_eq!(resolve_folder(&folders(), None).unwrap(), None);
    }

    #[test]
    fn unknown_folder_lists_what_exists() {
        // 에이전트가 스스로 고칠 수 있게 있는 이름을 함께 준다.
        let err = resolve_folder(&folders(), Some("없는폴더")).unwrap_err();
        assert!(err.contains("보고서") && err.contains("Notes"), "{err}");
    }

    fn memory_db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);")
            .unwrap();
        c
    }

    #[test]
    fn control_is_off_until_the_user_turns_it_on() {
        let c = memory_db();
        assert!(!control_enabled(&c), "설정이 없으면 꺼짐이어야 한다");
        c.execute("INSERT INTO settings VALUES (?1, '0')", params![CONTROL_SETTING_KEY]).unwrap();
        assert!(!control_enabled(&c));
        c.execute("UPDATE settings SET value='1' WHERE key=?1", params![CONTROL_SETTING_KEY]).unwrap();
        assert!(control_enabled(&c));
    }

    #[test]
    fn node_id_looks_like_the_ones_the_frontend_makes() {
        let c = Connection::open_in_memory().unwrap();
        let id = new_node_id(&c).unwrap();
        let parts: Vec<&str> = id.split('-').collect();
        assert_eq!(parts.iter().map(|p| p.len()).collect::<Vec<_>>(), vec![8, 4, 4, 4, 12]);
        assert!(id.chars().all(|ch| ch.is_ascii_hexdigit() || ch == '-'), "{id}");
        assert_ne!(id, new_node_id(&c).unwrap(), "매번 달라야 한다");
    }

    #[test]
    fn every_tool_declares_an_object_schema() {
        for t in catalog().as_array().unwrap() {
            assert_eq!(t["inputSchema"]["type"], "object", "{} 스키마", t["name"]);
            assert!(t["description"].as_str().is_some_and(|d| d.len() > 20));
        }
    }
}
