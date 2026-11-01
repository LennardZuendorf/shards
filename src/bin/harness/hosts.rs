//! Observed host transports. Payloads never grant approval authority.
use super::json::strict_json;
use serde_json::{json, Value};
use std::path::Path;

#[derive(Clone, Debug, PartialEq)]
pub struct NormalizedEvent {
    pub host: String,
    pub event_kind: String,
    pub session_id: String,
    pub cwd: String,
    pub agent_id: Option<String>,
    pub agent_type: Option<String>,
    pub turn_id: Option<String>,
    pub call_id: Option<String>,
    pub source: Option<String>,
    pub tool_name: Option<String>,
    pub tool_input: Option<Value>,
    pub tool_result: Option<Value>,
    pub tool_error: Option<Value>,
    pub mcp_server: Option<Value>,
    pub stop_hook_active: bool,
}
#[derive(Clone, Debug, PartialEq)]
pub struct HookResult {
    pub action: String,
    pub event_kind: String,
    pub reason: String,
    pub context: String,
}
impl HookResult {
    pub fn new(action: &str, event_kind: &str) -> Self {
        Self {
            action: action.into(),
            event_kind: event_kind.into(),
            reason: String::new(),
            context: String::new(),
        }
    }
    pub fn reason(mut self, reason: &str) -> Self {
        self.reason = reason.into();
        self
    }
    pub fn context(mut self, context: &str) -> Self {
        self.context = context.into();
        self
    }
}
fn host_ok(host: &str) -> Result<(), String> {
    if matches!(host, "claude" | "codex") {
        Ok(())
    } else {
        Err("unsupported host".into())
    }
}
fn string(value: &Value, name: &str) -> Result<String, String> {
    value
        .as_str()
        .filter(|s| !s.trim().is_empty() && !s.contains('\0'))
        .map(str::to_owned)
        .ok_or_else(|| format!("{name} must be a nonempty string without NUL"))
}
fn optional(payload: &Value, name: &str) -> Result<Option<String>, String> {
    payload.get(name).map(|v| string(v, name)).transpose()
}
fn tool_event(kind: &str) -> bool {
    matches!(kind, "PreToolUse" | "PostToolUse" | "PostToolUseFailure")
}
fn stop_event(kind: &str) -> bool {
    matches!(kind, "Stop" | "SubagentStop")
}
fn event_ok(kind: &str) -> bool {
    tool_event(kind)
        || stop_event(kind)
        || matches!(
            kind,
            "SessionStart"
                | "SubagentStart"
                | "SessionEnd"
                | "PreCompact"
                | "PostCompact"
                | "StopFailure"
                | "UserPromptSubmit"
        )
}
fn parsed(value: &Value) -> Result<Value, String> {
    strict_json(value.as_str().ok_or("expected JSON string")?)
        .map_err(|e| format!("invalid JSON result: {e}"))
}
fn mcp_result(host: &str, response: &Value) -> Result<Value, String> {
    let data = if host == "claude" {
        parsed(response)?
    } else {
        if !response.is_object() || response.get("structured_content").is_some() {
            return Err("expected hook MCP object with structuredContent".into());
        }
        if response
            .get("isError")
            .is_some_and(|v| v != &Value::Bool(false))
        {
            return Err("MCP error cannot be successful evidence".into());
        }
        let data = response
            .get("structuredContent")
            .cloned()
            .unwrap_or(Value::Null);
        let content = response
            .get("content")
            .and_then(Value::as_array)
            .filter(|a| a.len() == 1)
            .ok_or("expected one MCP JSON text result")?;
        let block = &content[0];
        if block.get("type").and_then(Value::as_str) != Some("text") {
            return Err("expected MCP text result".into());
        }
        if parsed(&block["text"])? != data {
            return Err("MCP content and structuredContent disagree".into());
        }
        data
    };
    let obj = data
        .as_object()
        .filter(|o| !o.is_empty())
        .ok_or("MCP success must contain a nonempty result object")?;
    if ["error", "isError", "kind", "structured_content", "content"]
        .iter()
        .any(|k| obj.contains_key(*k))
    {
        return Err("error or nested envelope cannot be lifecycle evidence".into());
    }
    Ok(data)
}
pub fn normalize_event(host: &str, payload: &Value) -> Result<NormalizedEvent, String> {
    host_ok(host)?;
    if !payload.is_object() {
        return Err("hook payload must be an object".into());
    }
    let kind = string(&payload["hook_event_name"], "hook_event_name")?;
    if !event_ok(&kind) {
        return Err("unsupported hook event".into());
    }
    let session_id = string(&payload["session_id"], "session_id")?;
    let cwd = string(&payload["cwd"], "cwd")?;
    if !Path::new(&cwd).is_absolute() {
        return Err("cwd must be absolute".into());
    }
    let agent_id = optional(payload, "agent_id")?;
    let agent_type = optional(payload, "agent_type")?;
    if (agent_type.is_some() || matches!(kind.as_str(), "SubagentStart" | "SubagentStop"))
        && agent_id.is_none()
    {
        return Err("delegate event requires agent_id".into());
    }
    let turn_field = if host == "claude" {
        "prompt_id"
    } else {
        "turn_id"
    };
    let turn_id = optional(payload, turn_field)?;
    if (tool_event(&kind) || stop_event(&kind)) && turn_id.is_none() {
        return Err(format!("{kind} requires {turn_field}"));
    }
    let source = optional(payload, "source")?;
    if kind == "SessionStart" && source.is_none() {
        return Err("SessionStart requires source".into());
    }
    let (mut call_id, mut tool_name, mut tool_input, mut tool_result, mut tool_error) =
        (None, None, None, None, None);
    if tool_event(&kind) {
        call_id = Some(string(&payload["tool_use_id"], "tool_use_id")?);
        let name = string(&payload["tool_name"], "tool_name")?;
        let args = payload
            .get("tool_input")
            .filter(|v| v.is_object())
            .ok_or("tool_input must be an object")?
            .clone();
        if kind == "PostToolUseFailure" {
            let error = string(&payload["error"], "error")?;
            tool_error = Some(if error.trim_start().starts_with('{') {
                strict_json(&error)?
            } else {
                Value::String(error)
            });
        } else if kind == "PostToolUse" {
            if payload.get("error").is_some() || payload.get("tool_response").is_none() {
                return Err("successful hook requires tool_response without error".into());
            }
            let result = if name.starts_with("mcp__") {
                mcp_result(host, &payload["tool_response"])?
            } else {
                payload["tool_response"].clone()
            };
            if matches!(
                name.as_str(),
                "mcp__shards__shards_task_claim"
                    | "mcp__shards__shards_task_append"
                    | "mcp__shards__shards_task_release"
                    | "mcp__shards__shards_task_finish"
                    | "mcp__shards__shards_task_cancel"
            ) {
                if result["type"] != "task" {
                    return Err("lifecycle result must be a task".into());
                }
                let id = string(&result["id"], "result.id")?;
                if args["task_id"].as_str() != Some(&id) {
                    return Err("lifecycle task id differs from tool_input".into());
                }
                string(&result["status"], "result.status")?;
                if !result["claimed_by"].is_null() {
                    string(&result["claimed_by"], "result.claimed_by")?;
                }
            }
            tool_result = Some(result);
        }
        tool_name = Some(name);
        tool_input = Some(args);
    }
    let mcp_server = payload.get("mcp_server").cloned();
    if let Some(ref descriptor) = mcp_server {
        if !descriptor.is_object() {
            return Err("mcp_server must be an object".into());
        }
        string(&descriptor["name"], "mcp_server.name")?;
        string(&descriptor["source"], "mcp_server.source")?;
    }
    let stop_hook_active = match payload.get("stop_hook_active") {
        Some(Value::Bool(b)) => *b,
        None if !stop_event(&kind) => false,
        _ => return Err("stop event requires boolean stop_hook_active".into()),
    };
    Ok(NormalizedEvent {
        host: host.into(),
        event_kind: kind,
        session_id,
        cwd,
        agent_id,
        agent_type,
        turn_id,
        call_id,
        source,
        tool_name,
        tool_input,
        tool_result,
        tool_error,
        mcp_server,
        stop_hook_active,
    })
}
pub fn encode_result(host: &str, result: &HookResult) -> Result<Value, String> {
    host_ok(host)?;
    if !event_ok(&result.event_kind) {
        return Err("unsupported hook result".into());
    }
    match (result.action.as_str(), result.event_kind.as_str()) {
        ("allow", _) => Ok(json!({})),
        ("deny", "PreToolUse") => Ok(
            json!({"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":string(&json!(result.reason),"reason")?}}),
        ),
        ("continue", kind) if stop_event(kind) => {
            Ok(json!({"decision":"block","reason":string(&json!(result.reason),"reason")?}))
        }
        ("inject-context", "SessionStart") => Ok(
            json!({"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":string(&json!(result.context),"context")?}}),
        ),
        _ => Err("unsupported action for hook event".into()),
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;
    fn fixture(host: &str, suffix: &str) -> Value {
        let version = if host == "claude" {
            "2.1.314"
        } else {
            "0.165.0-alpha.1.2"
        };
        let path = format!(
            "{}/plugins/shards/tests/fixtures/observed/{host}-{version}-{suffix}.json",
            env!("CARGO_MANIFEST_DIR")
        );
        strict_json(&std::fs::read_to_string(path).unwrap()).unwrap()
    }
    #[test]
    fn all_observed_hooks_preserve_identity() {
        for host in ["claude", "codex"] {
            for suffix in [
                "session-start",
                "session-resume",
                "session-fork",
                "pre-tool-bash",
                "post-claim",
                "post-append",
                "stop-first",
                "stop-continued",
                "subagent-start",
                "subagent-pre-tool",
                "subagent-stop-first",
                "subagent-stop-continued",
            ] {
                let raw = fixture(host, suffix);
                let event = normalize_event(host, &raw).unwrap();
                assert_eq!(event.host, host);
                assert_eq!(event.session_id, raw["session_id"]);
                assert_eq!(event.event_kind, raw["hook_event_name"]);
                assert_eq!(event.agent_id.as_deref(), raw["agent_id"].as_str());
                assert_eq!(event.call_id.as_deref(), raw["tool_use_id"].as_str());
                assert_eq!(event.source.as_deref(), raw["source"].as_str());
                assert_eq!(
                    event.turn_id.as_deref(),
                    raw[if host == "claude" {
                        "prompt_id"
                    } else {
                        "turn_id"
                    }]
                    .as_str()
                );
                assert_eq!(
                    event.stop_hook_active,
                    raw["stop_hook_active"].as_bool().unwrap_or(false)
                );
            }
        }
    }
    #[test]
    fn successful_lifecycle_results_are_task_data() {
        for (host, id) in [("claude", "t-1ZP9"), ("codex", "t-12K6")] {
            for suffix in ["post-claim", "post-append"] {
                let event = normalize_event(host, &fixture(host, suffix)).unwrap();
                let result = event.tool_result.unwrap();
                assert_eq!(result["id"], id);
                assert_eq!(result["status"], "claimed");
                assert_eq!(result["claimed_by"], "probe-agent");
                assert!(result.get("body").is_none());
                assert!(event.tool_error.is_none());
            }
        }
    }
    #[test]
    fn failure_never_becomes_success() {
        let event = normalize_event("claude", &fixture("claude", "post-failure")).unwrap();
        assert!(event.tool_result.is_none());
        assert_eq!(event.tool_error.unwrap()["kind"], "not_found");
        assert!(normalize_event("codex", &fixture("codex", "stream-mcp-error")).is_err());
    }
    #[test]
    fn namespaces_and_descriptors_are_preserved() {
        let mut raw = fixture("claude", "post-claim");
        raw["tool_name"] = json!("mcp__unrelated__shards_task_claim");
        raw["mcp_server"] = json!({"name":"unrelated","source":"dynamic"});
        let event = normalize_event("claude", &raw).unwrap();
        raw["mcp_server"]["name"] = json!("changed");
        assert_eq!(
            event.tool_name.as_deref(),
            Some("mcp__unrelated__shards_task_claim")
        );
        assert_eq!(
            event.mcp_server.unwrap(),
            json!({"name":"unrelated","source":"dynamic"})
        );
    }
    #[test]
    fn missing_and_mistyped_identity_is_rejected() {
        for host in ["claude", "codex"] {
            for (key, value) in [
                ("session_id", Value::Null),
                ("session_id", json!("")),
                ("agent_id", json!("")),
                ("agent_id", json!(3)),
                ("cwd", json!("relative")),
                ("tool_use_id", Value::Null),
                ("tool_input", json!([])),
                ("tool_name", Value::Null),
                (
                    if host == "claude" {
                        "prompt_id"
                    } else {
                        "turn_id"
                    },
                    Value::Null,
                ),
            ] {
                let mut raw = fixture(host, "subagent-pre-tool");
                raw[key] = value;
                assert!(normalize_event(host, &raw).is_err(), "{host} {key}");
            }
            let mut raw = fixture(host, "subagent-start");
            raw.as_object_mut().unwrap().remove("agent_id");
            assert!(normalize_event(host, &raw).is_err());
        }
    }
    #[test]
    fn invalid_mcp_results_cannot_create_evidence() {
        for host in ["claude", "codex"] {
            let raw = fixture(host, "post-claim");
            let mut invalid = vec![
                Value::Null,
                json!([]),
                json!(1),
                json!(true),
                json!("not json"),
                json!("{}"),
                json!("[]"),
                json!("{\"id\":\"one\",\"id\":\"two\"}"),
                json!("{\"id\":\"x\",\"n\":NaN}"),
            ];
            if host == "codex" {
                for (key, value) in [
                    ("isError", json!(true)),
                    ("isError", json!("false")),
                    ("structuredContent", json!([])),
                    ("content", json!([])),
                    (
                        "content",
                        json!([{"type":"text","text":"{\"id\":\"a\",\"id\":\"b\"}"}]),
                    ),
                ] {
                    let mut response = raw["tool_response"].clone();
                    response[key] = value;
                    invalid.push(response);
                }
                invalid.push(json!({"content":raw["tool_response"]["content"],"structured_content":raw["tool_response"]["structuredContent"]}));
                let mut response = raw["tool_response"].clone();
                response["structuredContent"]["id"] = json!("t-other");
                invalid.push(response);
            } else {
                invalid.push(json!("{\"content\":[],\"isError\":true}"));
                invalid.push(json!("{\"kind\":\"not_found\",\"message\":\"failure\"}"));
            }
            for response in invalid {
                let mut bad = raw.clone();
                bad["tool_response"] = response;
                assert!(normalize_event(host, &bad).is_err(), "{host} {bad}");
            }
        }
    }
    #[test]
    fn lifecycle_id_must_match_arguments() {
        for host in ["claude", "codex"] {
            let mut raw = fixture(host, "post-claim");
            raw["tool_input"]["task_id"] = json!("t-other");
            assert!(normalize_event(host, &raw).is_err());
        }
    }
    #[test]
    fn stop_boolean_is_never_coerced() {
        let mut raw = fixture("claude", "stop-first");
        raw["stop_hook_active"] = json!("false");
        assert!(normalize_event("claude", &raw).is_err());
        raw.as_object_mut().unwrap().remove("stop_hook_active");
        assert!(normalize_event("claude", &raw).is_err());
    }
    #[test]
    fn allow_preserves_native_permissions() {
        for host in ["claude", "codex"] {
            for kind in ["PreToolUse", "Stop", "SessionStart"] {
                assert_eq!(
                    encode_result(host, &HookResult::new("allow", kind)).unwrap(),
                    json!({})
                );
            }
        }
    }
    #[test]
    fn denial_and_continuation_match_observed_shapes() {
        for host in ["claude", "codex"] {
            assert_eq!(
                encode_result(
                    host,
                    &HookResult::new("deny", "PreToolUse").reason("Record start")
                )
                .unwrap(),
                json!({"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Record start"}})
            );
            for kind in ["Stop", "SubagentStop"] {
                assert_eq!(
                    encode_result(
                        host,
                        &HookResult::new("continue", kind).reason("Record checkpoint")
                    )
                    .unwrap(),
                    json!({"decision":"block","reason":"Record checkpoint"})
                );
            }
        }
    }
    #[test]
    fn startup_context_matches_observed_shape() {
        for host in ["claude", "codex"] {
            assert_eq!(
                encode_result(
                    host,
                    &HookResult::new("inject-context", "SessionStart").context("Use Shards.")
                )
                .unwrap(),
                json!({"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Use Shards."}})
            );
        }
    }
    #[test]
    fn unsupported_outputs_cannot_escalate_permissions() {
        for host in ["claude", "codex"] {
            for (action, kind) in [
                ("deny", "PostToolUse"),
                ("continue", "PreToolUse"),
                ("inject-context", "Stop"),
                ("approve", "PreToolUse"),
            ] {
                assert!(encode_result(
                    host,
                    &HookResult::new(action, kind).reason("x").context("x")
                )
                .is_err());
            }
        }
        assert!(normalize_event("unknown", &fixture("claude", "session-start")).is_err());
    }
}
