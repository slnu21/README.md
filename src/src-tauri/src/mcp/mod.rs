//! 에이전트 브리지 — MCP stdio 서버.
//!
//! **새 exe 를 만들지 않는다**(ADR 0002). `md-reader.exe mcp` 로 부르면 창을 띄우지 않고 이
//! 루프만 돈다. MSIX 에서는 `readme.exe` 별칭이 같은 exe 로 해석되므로 시작 메뉴 항목이 늘지
//! 않는다 — Atlas 가 exe 를 늘렸다가 항목 셋으로 리뷰를 잃은 자리다.
//!
//! 릴리스 빌드는 `windows_subsystem = "windows"` 라 콘솔이 없다. 그래도 **부모가 파이프를
//! 물려주면 stdin/stdout 은 그대로 산다**(2026-09-06 프로브 실측) — MCP 클라이언트가 정확히
//! 그렇게 띄운다. 사람이 터미널에서 직접 부르는 경우는 이 단위의 대상이 아니다.
//!
//! **stdout 은 프로토콜 전용이다.** 진단 한 줄이라도 섞이면 클라이언트의 JSON 파서가 깨진다.

pub mod jsonrpc;
pub mod outline;
pub mod tools;

use jsonrpc::Incoming;
use serde_json::{json, Value};
use std::io::{BufRead, Write};

const SERVER_NAME: &str = "readme-md";
const SERVER_VERSION: &str = env!("CARGO_PKG_VERSION");

/// 우리가 아는 프로토콜 판. 클라이언트가 이 중 하나를 요청하면 **그대로** 돌려주고,
/// 모르는 판이면 가장 최신을 제안한다(스펙이 정한 협상 방식).
const SUPPORTED_PROTOCOLS: [&str; 3] = ["2025-06-18", "2025-03-26", "2024-11-05"];

/// 이 프로세스를 MCP 서버로 띄워야 하는가.
///
/// **별칭 이름으로 가르지 않는다.** `readme.exe` 는 앱을 여는 이름이기도 하므로 모드는
/// 서브커맨드로만 정한다 — 그래서 `argv[0]` 을 해석할 일이 아예 없다(.NET 이라면 호스트가
/// `argv[0]` 을 덮어써서 이 판정이 조용히 틀렸을 자리다).
pub fn is_requested<I: IntoIterator<Item = String>>(args: I) -> bool {
    args.into_iter()
        .skip(1)
        .find(|a| !a.starts_with('-'))
        .is_some_and(|a| a.eq_ignore_ascii_case("mcp"))
}

/// stdio 루프. EOF 면 0 을 돌려준다.
pub fn run_stdio() -> i32 {
    // DB 는 앱과 **같은 파일**이다. 패키지 신원이 있으면 OS 가 컨테이너로 돌려주고, 없으면
    // `%APPDATA%` 그대로다 — 어느 쪽이든 앱이 여는 그 파일이다(`app_paths` 주석 참고).
    let conn = open_workspace_db();

    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    let mut line = String::new();
    loop {
        line.clear();
        match stdin.lock().read_line(&mut line) {
            Ok(0) => return 0, // EOF — 클라이언트가 닫았다
            Ok(_) => {}
            Err(_) => return 1,
        }
        let Some(response) = respond(&conn, &line) else {
            continue; // 알림·빈 줄 — 응답하지 않는다
        };
        if writeln!(stdout, "{response}").is_err() || stdout.flush().is_err() {
            return 1;
        }
    }
}

fn open_workspace_db() -> Result<rusqlite::Connection, String> {
    let dir = crate::app_paths::standalone_data_dir()?;
    let path = dir.join(crate::db::DB_FILE);
    if !path.is_file() {
        // 스키마를 여기서 만들지 않는다 — 마이그레이션은 앱이 주인이다.
        return Err(format!(
            "워크스페이스 DB가 아직 없습니다({}). README.md 앱을 한 번 실행해 폴더를 가져오세요.",
            path.display()
        ));
    }
    crate::db::open_at(&path)
}

/// 한 줄 → 보낼 응답(없으면 None). 순수하게 유지해 테스트가 프로토콜을 고정한다.
fn respond(conn: &Result<rusqlite::Connection, String>, line: &str) -> Option<String> {
    let out = match jsonrpc::parse(line) {
        Incoming::Blank | Incoming::Notification { .. } => return None,
        Incoming::Malformed => jsonrpc::failure(Value::Null, jsonrpc::PARSE_ERROR, "JSON 파싱 실패"),
        Incoming::Unsupported => {
            jsonrpc::failure(Value::Null, jsonrpc::INVALID_REQUEST, "배치 요청은 지원하지 않습니다")
        }
        Incoming::Request { id, method, params } => match dispatch(conn, &method, &params) {
            Ok(result) => jsonrpc::success(id, result),
            Err((code, message)) => jsonrpc::failure(id, code, &message),
        },
    };
    Some(out.to_string())
}

fn dispatch(
    conn: &Result<rusqlite::Connection, String>,
    method: &str,
    params: &Value,
) -> Result<Value, (i64, String)> {
    match method {
        "initialize" => {
            // 패널이 "붙었다"를 보여 줄 유일한 근거다 — 서버는 별도 프로세스라 앱이 달리 알 길이 없다.
            // 실패해도 무시한다(연결 자체를 막을 이유가 없다).
            if let Ok(c) = conn {
                let _ = c.execute(
                    "INSERT INTO settings (key, value) VALUES ('agentLastConnectedAt', ?1)
                     ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    rusqlite::params![crate::db::now_ms().to_string()],
                );
            }
            Ok(json!({
            "protocolVersion": negotiate(params.get("protocolVersion").and_then(Value::as_str)),
            "capabilities": { "tools": {} },
            "serverInfo": { "name": SERVER_NAME, "version": SERVER_VERSION },
            }))
        }
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({ "tools": tools::catalog() })),
        "tools/call" => {
            let name = params
                .get("name")
                .and_then(Value::as_str)
                .ok_or((jsonrpc::INVALID_PARAMS, "name 인자가 필요합니다".to_string()))?;
            let args = params.get("arguments").cloned().unwrap_or_else(|| json!({}));
            // **도구 실패는 JSON-RPC 오류가 아니다** — 모델이 읽고 스스로 고칠 수 있도록
            // isError 를 단 결과로 돌려준다(스펙 권고).
            let outcome = conn
                .as_ref()
                .map_err(|e| e.clone())
                .and_then(|c| tools::call(c, name, &args));
            Ok(match outcome {
                Ok(value) => tool_text(value.to_string(), false),
                Err(message) => tool_text(message, true),
            })
        }
        other => Err((jsonrpc::METHOD_NOT_FOUND, format!("지원하지 않는 메서드입니다: {other}"))),
    }
}

fn tool_text(text: String, is_error: bool) -> Value {
    json!({ "content": [{ "type": "text", "text": text }], "isError": is_error })
}

fn negotiate(requested: Option<&str>) -> &str {
    match requested {
        Some(v) if SUPPORTED_PROTOCOLS.contains(&v) => {
            SUPPORTED_PROTOCOLS.iter().find(|s| **s == v).unwrap()
        }
        _ => SUPPORTED_PROTOCOLS[0],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn no_db() -> Result<rusqlite::Connection, String> {
        Err("DB 없음".to_string())
    }

    #[test]
    fn mcp_subcommand_selects_server_mode() {
        let argv = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert!(is_requested(argv(&["md-reader.exe", "mcp"])));
        assert!(is_requested(argv(&["readme.exe", "MCP"])));
        assert!(is_requested(argv(&["md-reader.exe", "--verbose", "mcp"])));
    }

    #[test]
    fn everything_else_opens_the_app() {
        let argv = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert!(!is_requested(argv(&["md-reader.exe"])));
        assert!(!is_requested(argv(&["md-reader.exe", r"C:\a\b.md"])));
        // 별칭으로 불려도 서브커맨드가 없으면 앱이다 — 이름으로 가르지 않는다.
        assert!(!is_requested(argv(&["readme.exe"])));
    }

    #[test]
    fn notifications_get_no_response() {
        assert!(respond(&no_db(), r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#).is_none());
        assert!(respond(&no_db(), "   ").is_none());
    }

    #[test]
    fn malformed_line_answers_with_null_id() {
        let out = respond(&no_db(), "{oops").unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["id"], Value::Null);
        assert_eq!(v["error"]["code"], jsonrpc::PARSE_ERROR);
    }

    #[test]
    fn initialize_echoes_a_known_protocol_and_declares_tools() {
        let req = r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}"#;
        let v: Value = serde_json::from_str(&respond(&no_db(), req).unwrap()).unwrap();
        assert_eq!(v["result"]["protocolVersion"], "2024-11-05");
        assert!(v["result"]["capabilities"]["tools"].is_object());
        assert_eq!(v["result"]["serverInfo"]["name"], SERVER_NAME);
    }

    #[test]
    fn unknown_protocol_gets_our_newest() {
        assert_eq!(negotiate(Some("1999-01-01")), SUPPORTED_PROTOCOLS[0]);
        assert_eq!(negotiate(None), SUPPORTED_PROTOCOLS[0]);
        assert_eq!(negotiate(Some("2025-03-26")), "2025-03-26");
    }

    #[test]
    fn tools_list_works_without_a_database() {
        // 목록은 DB 와 무관해야 한다 — 앱을 한 번도 안 켠 사용자도 연결은 성공해야 붙었는지 안다.
        let req = r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#;
        let v: Value = serde_json::from_str(&respond(&no_db(), req).unwrap()).unwrap();
        assert_eq!(v["result"]["tools"].as_array().unwrap().len(), 6);
    }

    #[test]
    fn tool_failure_is_a_result_not_a_protocol_error() {
        // 모델이 읽고 고칠 수 있어야 하므로 error 가 아니라 isError 결과다.
        let req = r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_workspace","arguments":{}}}"#;
        let v: Value = serde_json::from_str(&respond(&no_db(), req).unwrap()).unwrap();
        assert!(v.get("error").is_none());
        assert_eq!(v["result"]["isError"], true);
        assert!(v["result"]["content"][0]["text"].as_str().unwrap().contains("DB 없음"));
    }

    #[test]
    fn unknown_method_is_a_protocol_error() {
        let req = r#"{"jsonrpc":"2.0","id":4,"method":"resources/list"}"#;
        let v: Value = serde_json::from_str(&respond(&no_db(), req).unwrap()).unwrap();
        assert_eq!(v["error"]["code"], jsonrpc::METHOD_NOT_FOUND);
    }

    #[test]
    fn batch_requests_are_refused_without_guessing_an_id() {
        let out = respond(&no_db(), r#"[{"jsonrpc":"2.0","id":1,"method":"ping"}]"#).unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["id"], Value::Null);
        assert_eq!(v["error"]["code"], jsonrpc::INVALID_REQUEST);
    }
}
