//! MCP stdio 전송의 최소 JSON-RPC 2.0 계층.
//!
//! **SDK 크레이트를 안 쓴 이유** — 이 서버가 실제로 다루는 것은 `initialize` · `tools/list` ·
//! `tools/call` · 알림 무시가 전부다. SDK 를 들이면 의존성 트리와 THIRD-PARTY-NOTICES 가 커지고
//! (이 저장소는 permissive 화이트리스트를 유지한다) 판올림마다 흔들린다. `serde_json` 은 이미 있다.
//!
//! 전송은 **줄 단위 JSON** 이다 — LSP 의 `Content-Length` 프레이밍이 아니다.

use serde_json::{json, Value};

pub const PARSE_ERROR: i64 = -32700;
pub const INVALID_REQUEST: i64 = -32600;
pub const METHOD_NOT_FOUND: i64 = -32601;
pub const INVALID_PARAMS: i64 = -32602;

/// 들어온 한 줄을 해석한 결과.
#[derive(Debug, PartialEq)]
pub enum Incoming {
    /// 응답이 필요한 요청.
    Request { id: Value, method: String, params: Value },
    /// **응답하면 안 되는** 알림(id 없음). `notifications/initialized` 등.
    Notification { method: String },
    /// JSON 이 깨졌다 — id 를 모르므로 null id 로 에러를 돌려준다.
    Malformed,
    /// 배치(배열)는 지원하지 않는다. id 를 못 고르므로 null id 로 거절한다.
    Unsupported,
    /// 빈 줄 — 무시한다.
    Blank,
}

/// 한 줄을 해석한다. 응답 생성은 호출부의 몫이다(여기는 순수).
pub fn parse(line: &str) -> Incoming {
    // 선행 BOM 을 흘려보낸다. JSON 이 아니지만(RFC 8259) 스트림 앞머리에 실제로 붙어 온다 —
    // .NET 의 `Process.StandardInput` 은 첫 쓰기에 인코딩 프리앰블을 흘린다(실측: 첫 줄만 깨졌다).
    // 여기서 안 걷어내면 **`initialize` 한 줄이 깨져 연결 자체가 성립하지 않는다**.
    let trimmed = line.trim_start_matches('\u{feff}').trim();
    if trimmed.is_empty() {
        return Incoming::Blank;
    }
    let value: Value = match serde_json::from_str(trimmed) {
        Ok(v) => v,
        Err(_) => return Incoming::Malformed,
    };
    if value.is_array() {
        return Incoming::Unsupported;
    }
    let method = match value.get("method").and_then(Value::as_str) {
        Some(m) => m.to_string(),
        None => return Incoming::Malformed,
    };
    let params = value.get("params").cloned().unwrap_or(Value::Null);
    // id 가 없으면 알림 — JSON-RPC 2.0 은 알림에 응답하는 것을 금지한다.
    match value.get("id") {
        Some(id) if !id.is_null() => Incoming::Request { id: id.clone(), method, params },
        _ => Incoming::Notification { method },
    }
}

pub fn success(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

pub fn failure(id: Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_carries_id_method_params() {
        let got = parse(r#"{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"a":1}}"#);
        assert_eq!(
            got,
            Incoming::Request { id: json!(1), method: "tools/list".into(), params: json!({"a":1}) }
        );
    }

    #[test]
    fn missing_params_becomes_null() {
        match parse(r#"{"jsonrpc":"2.0","id":"x","method":"ping"}"#) {
            Incoming::Request { params, .. } => assert_eq!(params, Value::Null),
            other => panic!("요청이어야 한다: {other:?}"),
        }
    }

    #[test]
    fn notification_has_no_id() {
        assert_eq!(
            parse(r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#),
            Incoming::Notification { method: "notifications/initialized".into() }
        );
    }

    #[test]
    fn null_id_is_a_notification_not_a_request() {
        // id:null 에 응답하면 클라이언트가 짝을 못 맞춘다.
        assert_eq!(
            parse(r#"{"jsonrpc":"2.0","id":null,"method":"notifications/cancelled"}"#),
            Incoming::Notification { method: "notifications/cancelled".into() }
        );
    }

    #[test]
    fn leading_bom_is_tolerated() {
        // 이걸 안 걷어내면 첫 줄(= initialize)만 깨져 연결이 통째로 실패한다.
        let got = parse("\u{feff}{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}");
        assert_eq!(got, Incoming::Request { id: json!(1), method: "ping".into(), params: Value::Null });
    }

    #[test]
    fn broken_json_and_blank_and_batch() {
        assert_eq!(parse("{not json"), Incoming::Malformed);
        assert_eq!(parse("   "), Incoming::Blank);
        assert_eq!(parse(r#"[{"jsonrpc":"2.0","id":1,"method":"ping"}]"#), Incoming::Unsupported);
    }

    #[test]
    fn method_is_required() {
        assert_eq!(parse(r#"{"jsonrpc":"2.0","id":1}"#), Incoming::Malformed);
    }

    #[test]
    fn envelopes_keep_the_id_type() {
        assert_eq!(
            success(json!("abc"), json!({"ok":true})),
            json!({"jsonrpc":"2.0","id":"abc","result":{"ok":true}})
        );
        assert_eq!(
            failure(json!(7), METHOD_NOT_FOUND, "없음"),
            json!({"jsonrpc":"2.0","id":7,"error":{"code":-32601,"message":"없음"}})
        );
    }
}
