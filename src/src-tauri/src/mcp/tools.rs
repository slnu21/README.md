//! MCP 도구 표면.
//!
//! **파일시스템이 이미 하는 일은 주지 않는다**(ADR 0002). 에이전트는 이미 md 를 읽고 쓰고
//! grep 한다 — 여기 있는 것은 전부 *이 앱만 아는 것*이다: FTS5 색인 · 헤딩 아웃라인 ·
//! 워크스페이스 가상 배치. `write_doc`·`create_doc`·`delete` 는 **일부러 없다**(값은 0 이고
//! 프롬프트 인젝션 표면만 는다).
//!
//! 도구 이름·인자·설명은 **모델이 읽는 API 표면**이라 코드 식별자와 같은 취급으로 영어다.
//! 반면 **오류 문구는 사람에게 그대로 옮겨지므로 한국어 / 영어 두 벌**이다("한국어 / English: 값").
//! 에이전트가 사용자 언어로 다시 말해 주지만, 옮기지 않고 그대로 보여 주는 클라이언트도 있다
//! (2026-10-11 실사용 기록 — 한국어 한 벌이면 영어 사용자에게 그대로 보인다).

use crate::commands::search::{build_match, match_rows_with_rowid, rel_under, under_root};
use crate::commands::workspace::{insert_node, load_nodes, Node};
use crate::scope::Scope;
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
            "description": "Full-text search across the README.md workspace, ranked by relevance (SQLite FTS5). Prefer this over grep: it is pre-indexed, ranked, and already scoped to the folders the user added to their workspace. Each hit carries `line`, the 1-based line of its first match — pass it to read_section as fromLine instead of reading the whole file. With no hits, `hint` says how many documents were searched.",
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
            "description": "Open a document in the user's README.md window so they can read it right now, optionally scrolled to a line (point the user at the exact section you mean). Launches the app if it is not running. Requires the user to enable control tools in Settings.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Absolute path to an existing .md/.markdown/.mdx/.txt file." },
                    "beside": { "type": "boolean", "description": "Open in the side panel and keep the current document focused. Ignored on a cold start." },
                    "line": { "type": "integer", "minimum": 1, "description": "1-based line to scroll to, as returned by outline/read_section. Omit to open at the top." }
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
            "{name} 은(는) 꺼져 있습니다 — README.md 설정 > 에이전트 연결에서 [문서 배치·열기 허용]을 켜 주세요 / {name} is off — turn on [Allow placing and opening documents] in README.md Settings > Agent bridge"
        )),
        "place_doc" => place_doc(conn, args),
        "open_in_app" => open_in_app(args),
        other => Err(format!("알 수 없는 도구입니다 / Unknown tool: {other}")),
    }
}

fn str_arg<'a>(args: &'a Value, key: &str) -> Option<&'a str> {
    args.get(key).and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty())
}

fn usize_arg(args: &Value, key: &str) -> Option<usize> {
    args.get(key).and_then(Value::as_u64).map(|n| n as usize)
}

fn search_docs(conn: &Connection, scope: &Scope, args: &Value) -> Result<Value, String> {
    let query = str_arg(args, "query").ok_or("query 인자가 필요합니다 / query is required")?;
    if scope.is_empty() {
        return Err("워크스페이스가 비어 있습니다 — 앱에서 폴더를 먼저 가져오세요 / The workspace is empty — add a folder in the README.md app first".into());
    }
    let root = str_arg(args, "root");
    if let Some(r) = root {
        if !scope.overlaps(r) {
            return Err(outside_scope(r));
        }
    }
    let limit = usize_arg(args, "limit").unwrap_or(20).clamp(1, 50);

    let Some(match_expr) = build_match(query) else {
        return Ok(json!({ "hits": [], "hint": no_hits_hint(conn, scope, root) }));
    };
    // LIKE 는 거친 필터일 뿐이고(형제 접두어를 잡는다) 최종 판정은 스코프가 한다.
    // 걸러 낼 것을 감안해 넉넉히 가져온 뒤 자른다.
    // **구분자는 색인에 들어 있는 모양(OS 것)으로 맞춘다** — 에이전트는 `C:/repo/docs` 처럼 `/` 로 묻는 일이 흔한데,
    // 그대로 LIKE 에 넣으면 `C:\repo\…` 행이 하나도 안 걸려 스코프 판정까지 가 보지도 못하고 0건이었다
    // (2026-10-11 실구동에서 찾음 · under_root 는 구분자를 무시하므로 뒤 판정은 원래 맞았다).
    let like = root.map(|r| format!("{}%", r.trim_end_matches(['/', '\\']).replace('/', std::path::MAIN_SEPARATOR_STR)));
    let rows = match_rows_with_rowid(conn, &match_expr, like.as_deref(), (limit * 5).min(300) as i64)?;

    let hits: Vec<Value> = rows
        .into_iter()
        // root 는 스코프를 품는 상위 폴더일 수도 있다(Scope::overlaps) — 그래서 둘 다 본다.
        .filter(|(_, path, _)| scope.allows(path) && root.is_none_or(|r| under_root(path, r)))
        .take(limit)
        .map(|(rowid, path, snippet)| {
            let name = Path::new(&path)
                .file_name()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_else(|| path.clone());
            let mut hit = json!({
                "path": path,
                "name": name,
                "snippet": clean_snippet(&snippet),
            });
            // 맞은 줄 — 에이전트가 문서를 통째로 읽지 않고 바로 read_section(fromLine) 으로 간다(실사용 1.1 후보).
            let content: Option<String> =
                conn.query_row("SELECT content FROM file_index WHERE rowid = ?1", [rowid], |r| r.get(0)).ok();
            if let Some(line) = content.and_then(|c| hit_line(&c, &snippet)) {
                hit["line"] = json!(line);
            }
            hit
        })
        .collect();
    if hits.is_empty() {
        return Ok(json!({ "hits": hits, "hint": no_hits_hint(conn, scope, root) }));
    }
    Ok(json!({ "hits": hits }))
}

/// 스니펫이 가리키는 첫 맞은 자리의 줄 번호(1부터). 스니펫 글은 원문을 그대로 자른 것이라 앞 문맥 +
/// 첫 하이라이트까지를 원문에서 찾으면 그 자리다. 앞 문맥이 안 맞으면(드묾) 하이라이트 낱말만으로 찾는다.
fn hit_line(content: &str, snippet: &str) -> Option<usize> {
    let open = snippet.find(SENTINELS[0])?;
    let close = snippet[open..].find(SENTINELS[1])? + open;
    let lead = snippet[..open].trim_start_matches('…');
    let term = &snippet[open + SENTINELS[0].len_utf8()..close];
    if term.is_empty() {
        return None;
    }
    let with_lead = format!("{lead}{term}");
    let at = match content.find(&with_lead) {
        Some(i) => i + lead.len(),
        None => content.find(term)?,
    };
    Some(content[..at].matches('\n').count() + 1)
}

/// 0건일 때 다음 수 — "없다"만 들은 에이전트는 같은 질의를 되풀이하거나 grep 으로 돌아간다(실사용 1.1 후보).
/// 범위 안에 문서가 몇 개인지 알려 주면 "낱말이 틀렸다"와 "범위가 비었다"를 가를 수 있다.
fn no_hits_hint(conn: &Connection, scope: &Scope, root: Option<&str>) -> String {
    let docs = conn
        .prepare("SELECT real_path FROM file_meta")
        .and_then(|mut st| {
            let rows = st.query_map([], |r| r.get::<_, String>(0))?;
            Ok(rows
                .filter_map(Result::ok)
                .filter(|p| scope.allows(p) && root.is_none_or(|r| under_root(p, r)))
                .count())
        })
        .unwrap_or(0);
    if docs == 0 {
        return "이 범위에는 색인된 문서가 없습니다 — root 를 빼거나, 사용자에게 README.md 를 한 번 열어 색인해 달라고 하세요 / \
                No indexed documents in this range — drop root, or ask the user to open README.md once so it can index"
            .into();
    }
    format!(
        "문서 {docs}개에서 찾았지만 맞는 곳이 없습니다 — 낱말을 줄이거나 바꿔 보세요(낱말은 모두 들어 있어야 하고 마지막 낱말만 \
         앞부분 일치) / No match in {docs} documents — try fewer or different words (all words must appear; only the last one is a prefix)"
    )
}

/// 스코프 밖 경로 오류. **다음 행동을 함께 준다** — "밖이다"만 들은 에이전트는 거기서 멈추거나
/// 같은 호출을 되풀이한다(2026-10-11 실사용 기록). 길은 둘: 사람이 그 폴더를 넣거나, 제어 도구가
/// 켜져 있으면 `place_doc` 이 그 파일을 들인다(들인 파일은 곧 스코프 안이다).
fn outside_scope(path: &str) -> String {
    format!(
        "워크스페이스 밖 경로입니다 — 사용자가 README.md 에 넣은 폴더·파일만 읽습니다. 그 폴더를 워크스페이스에 넣어 달라고 하거나, \
         제어 도구가 켜져 있으면 place_doc 으로 이 파일을 들이세요 / Outside the workspace — only folders and files the user added \
         in README.md are readable. Ask the user to add its folder, or, if control tools are on, call place_doc on this file: {path}"
    )
}

/// FTS5 스니펫 정리 — 하이라이트 센티넬을 떼고, 줄바꿈(CRLF 포함)과 연속 공백을 한 칸으로.
/// 색인은 원문을 그대로 들고 있어 Windows 문서는 `\r\n` 이 스니펫에 그대로 섞여 나왔다(실사용 기록).
fn clean_snippet(raw: &str) -> String {
    raw.replace(SENTINELS, "").split_whitespace().collect::<Vec<_>>().join(" ")
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
    let path = str_arg(args, "path").ok_or("path 인자가 필요합니다 / path is required")?;
    if !scope.allows(path) {
        return Err(outside_scope(path));
    }
    let p = Path::new(path);
    if !is_readable(p) {
        return Err(format!("읽을 수 있는 문서가 아닙니다 / Not a readable document (.md/.markdown/.mdx/.txt): {path}"));
    }
    let meta = std::fs::metadata(p).map_err(|e| format!("파일을 열 수 없습니다 / Cannot open the file: {e}"))?;
    if meta.len() > MAX_READ_BYTES {
        return Err(format!("파일이 너무 큽니다 / File too large: {} bytes (limit {MAX_READ_BYTES})", meta.len()));
    }
    let text = std::fs::read_to_string(p).map_err(|e| format!("파일을 읽을 수 없습니다 / Cannot read the file: {e}"))?;
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
            .ok_or_else(|| format!("그런 제목이 없습니다 — outline 으로 제목을 확인하세요 / No such heading — check the headings with outline: {heading}"))?
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
    let path = str_arg(args, "path").ok_or("path 인자가 필요합니다 / path is required")?;
    let p = Path::new(path);
    if !is_readable(p) {
        return Err(format!("읽을 수 있는 문서가 아닙니다 / Not a readable document (.md/.markdown/.mdx/.txt): {path}"));
    }
    if !p.is_file() {
        return Err(format!("그런 파일이 없습니다 / No such file: {path}"));
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
        "그런 폴더가 없습니다 / No such folder: {want} (있는 폴더 / existing: {})",
        if known.is_empty() { "없음 / none".to_string() } else { known.join(", ") }
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
    let line = line_arg(args)?;
    let exe = std::env::current_exe().map_err(|e| format!("실행 파일 경로를 알 수 없습니다 / Cannot locate the executable: {e}"))?;

    let mut cmd = Command::new(exe);
    cmd.args(launch_args(&path, beside, line));
    // **표준 입출력을 물려주면 안 된다** — 앱이 우리 MCP 파이프를 붙든 채로 살아 있게 된다.
    cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    cmd.spawn().map_err(|e| format!("앱을 띄우지 못했습니다 / Could not launch the app: {e}"))?;
    // 이미 떠 있으면 single-instance 가 경로를 기존 창으로 넘기고 이 프로세스는 곧 끝난다.
    Ok(json!({ "opened": path, "beside": beside, "line": line }))
}

/// `line` 인자 — 없으면 None, 있으면 1 이상의 정수여야 한다. 문자열 숫자도 받는다(모델이 흔히 그렇게 보낸다).
fn line_arg(args: &Value) -> Result<Option<u32>, String> {
    let Some(v) = args.get("line").filter(|v| !v.is_null()) else {
        return Ok(None);
    };
    let n = v
        .as_u64()
        .or_else(|| v.as_str().and_then(|s| s.trim().parse::<u64>().ok()))
        .filter(|&n| n >= 1 && n <= u32::MAX as u64)
        .ok_or_else(|| format!("line 은 1 이상의 정수여야 합니다(outline 의 줄 번호): {v}"))?;
    Ok(Some(n as u32))
}

/// 앱을 다시 띄울 인자. 줄은 **한 토큰**(`--line=N`)으로 붙인다 — 두 토큰이면 숫자가 따로 떨어져
/// 경로 후보로 읽힐 수 있다(argv 에서 첫 "존재하는 파일"을 고르므로 `120` 이라는 파일이 있으면 틀린다).
fn launch_args(path: &str, beside: bool, line: Option<u32>) -> Vec<String> {
    let mut v = Vec::new();
    if beside {
        v.push("--beside".to_string());
    }
    if let Some(n) = line {
        v.push(format!("{}{n}", crate::LINE_FLAG));
    }
    v.push(path.to_string());
    v
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
    fn open_line_is_one_token_and_round_trips() {
        let a = launch_args(r"C:\d\r.md", true, Some(214));
        assert_eq!(a, vec!["--beside", "--line=214", r"C:\d\r.md"]);
        // 앱 쪽 파서가 같은 토큰을 읽는다.
        let argv = std::iter::once("exe".to_string()).chain(a);
        assert_eq!(crate::line_from_args(argv), Some(214));
        assert_eq!(launch_args("x.md", false, None), vec!["x.md"]);
    }

    #[test]
    fn line_arg_validates() {
        assert_eq!(line_arg(&json!({})).unwrap(), None);
        assert_eq!(line_arg(&json!({ "line": null })).unwrap(), None);
        assert_eq!(line_arg(&json!({ "line": 7 })).unwrap(), Some(7));
        assert_eq!(line_arg(&json!({ "line": " 12 " })).unwrap(), Some(12));
        for bad in [json!(0), json!(-3), json!(1.5), json!("abc"), json!(true)] {
            let e = line_arg(&json!({ "line": bad })).unwrap_err();
            assert!(e.contains("line"), "{e}");
        }
    }

    #[test]
    fn scope_error_says_what_to_do_next() {
        // 실사용 기록(2026-10-11): "밖이다"만 들은 에이전트는 다음 수를 모른다.
        let e = outside_scope(r"C:\repo\docs\design\x.md");
        assert!(e.contains("place_doc"), "{e}");
        assert!(e.contains("Outside the workspace") && e.contains("워크스페이스 밖"), "두 언어: {e}");
        assert!(e.ends_with(r"C:\repo\docs\design\x.md"), "경로는 끝에 한 번: {e}");
    }

    #[test]
    fn search_root_may_be_a_parent_of_the_workspace_but_results_stay_in_scope() {
        // 실사용 기록(2026-10-11): 사용자가 넣은 것은 저장소의 docs\blog 뿐인데 에이전트는 저장소 docs 로 묻는다.
        let mut c = Connection::open_in_memory().unwrap();
        crate::db::migrate_for_test(&mut c).unwrap();
        insert_node(&c, "r1", &None, "imported_folder", "blog", &Some(r"C:\repo\docs\blog".into())).unwrap();
        for (p, body) in [
            (r"C:\repo\docs\blog\post.md", "설치 안내 install"),
            (r"C:\repo\docs\design\plan.md", "설치 계획 install"), // 같은 폴더 밑이지만 스코프 밖
            (r"C:\elsewhere\x.md", "설치 install"),
        ] {
            c.execute("INSERT INTO file_index (real_path, content) VALUES (?1, ?2)", params![p, body]).unwrap();
        }
        let scope = Scope::load(&c).unwrap();
        let hits = |root: Option<&str>| -> Result<Vec<String>, String> {
            let mut args = json!({ "query": "install" });
            if let Some(r) = root {
                args["root"] = json!(r);
            }
            let v = search_docs(&c, &scope, &args)?;
            Ok(v["hits"].as_array().unwrap().iter().map(|h| h["path"].as_str().unwrap().to_string()).collect())
        };
        assert_eq!(hits(Some(r"C:\repo\docs")).unwrap(), vec![r"C:\repo\docs\blog\post.md".to_string()]);
        assert_eq!(hits(Some(r"C:\repo\docs\blog")).unwrap().len(), 1);
        // 에이전트는 `/` 로 묻는 일이 흔하다 — 색인의 `\` 경로와 LIKE 가 어긋나 0건이던 것(실구동에서 찾음).
        assert_eq!(hits(Some("C:/repo/docs")).unwrap(), vec![r"C:\repo\docs\blog\post.md".to_string()]);
        assert_eq!(hits(Some("C:/repo/docs/blog/")).unwrap().len(), 1);
        assert_eq!(hits(None).unwrap().len(), 1);
        assert!(hits(Some(r"C:\elsewhere")).unwrap_err().contains("place_doc"), "스코프와 안 겹치는 범위는 여전히 거부");
    }

    #[test]
    fn hit_line_finds_the_first_highlight() {
        let content = "# 제목\r\n\r\n설치는 나중에.\r\n\r\n## 설치\r\n앱을 설치 한다\r\n";
        // FTS5 스니펫은 원문을 자른 것 — 앞 문맥이 있으면 같은 낱말이 앞에 또 있어도 그 자리다.
        assert_eq!(hit_line(content, "…## 설치\r\n앱을 \u{2}설치\u{3} 한다"), Some(6));
        assert_eq!(hit_line(content, "\u{2}설치\u{3}는 나중에"), Some(3));
        // 앞 문맥이 원문과 안 맞으면 낱말로만.
        assert_eq!(hit_line(content, "…엉뚱한 \u{2}설치\u{3}"), Some(3));
        assert_eq!(hit_line(content, "하이라이트 없음"), None);
        assert_eq!(hit_line(content, "\u{2}없는말\u{3}"), None);
    }

    #[test]
    fn hits_carry_a_line_and_zero_hits_carry_a_hint() {
        let mut c = Connection::open_in_memory().unwrap();
        crate::db::migrate_for_test(&mut c).unwrap();
        insert_node(&c, "r1", &None, "imported_folder", "w", &Some(r"C:\w".into())).unwrap();
        let docs = [
            (r"C:\w\a.md", "# 보고\n\n첫 문단.\n\n## 근거\n\nP95 지연은 91ms 다.\n"),
            (r"C:\w\b.md", "다른 문서\n"),
            (r"C:\other\c.md", "지연 지연\n"),
        ];
        for (i, (p, body)) in docs.iter().enumerate() {
            let rowid = i as i64 + 1;
            c.execute("INSERT INTO file_index (rowid, real_path, content) VALUES (?1, ?2, ?3)", params![rowid, p, body]).unwrap();
            c.execute(
                "INSERT INTO file_meta (real_path, mtime, size, indexed_at, fts_rowid) VALUES (?1, 0, 0, 0, ?2)",
                params![p, rowid],
            )
            .unwrap();
        }
        let scope = Scope::load(&c).unwrap();
        let v = search_docs(&c, &scope, &json!({ "query": "지연" })).unwrap();
        let hits = v["hits"].as_array().unwrap();
        assert_eq!(hits.len(), 1, "스코프 밖 c.md 는 안 나온다");
        assert_eq!(hits[0]["line"], json!(7));
        assert!(v.get("hint").is_none());

        let v = search_docs(&c, &scope, &json!({ "query": "없는낱말" })).unwrap();
        assert!(v["hits"].as_array().unwrap().is_empty());
        let hint = v["hint"].as_str().unwrap();
        assert!(hint.contains("문서 2개") && hint.contains("2 documents"), "스코프 안 문서만 센다: {hint}");

        let v = search_docs(&c, &scope, &json!({ "query": "보고", "root": r"C:\w\sub" })).unwrap();
        assert!(v["hint"].as_str().unwrap().contains("No indexed documents"));
    }

    #[test]
    fn snippet_drops_sentinels_and_crlf() {
        let raw = "\u{2}# 주간\u{3} 요약\r\n\r\n## 요약\r\n\t에이전트가…";
        assert_eq!(clean_snippet(raw), "# 주간 요약 ## 요약 에이전트가…");
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
