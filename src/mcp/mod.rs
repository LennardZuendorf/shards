//! The stdio MCP server: JSON-RPC 2.0 over newline-delimited stdin/stdout.
//!
//! Forty tools over the same domain seams the CLI calls, an instructions block built
//! once from the config, and a hand-rolled protocol loop — no MCP crate, no async runtime, and
//! nothing that can make a tool failure kill the process.

pub mod errors;
pub mod instructions;
pub mod proto;
pub mod schema;
pub mod tools;

use std::io::{BufRead, Write};
use std::path::PathBuf;

use crate::config::Config;
use crate::error::ShardsError;

/// The server name every client sees.
pub const SERVER_NAME: &str = "shards";

/// The 40 registered tools, in registration order (final.md §10).
pub const TOOL_NAMES: [&str; 40] = [
    "shards_note_get",
    "shards_note_list",
    "shards_task_get",
    "shards_task_list",
    "shards_search",
    "shards_health",
    "shards_recent_activity",
    "shards_build_context",
    "shards_graph",
    "shards_project",
    "shards_session_start",
    "shards_note_new",
    "shards_note_append",
    "shards_task_new",
    "shards_task_append",
    "shards_note_update",
    "shards_note_adopt",
    "shards_note_claim",
    "shards_note_release",
    "shards_task_claim",
    "shards_task_release",
    "shards_task_finish",
    "shards_task_update",
    "shards_task_cancel",
    "shards_memory_new",
    "shards_memory_append",
    "shards_memory_update",
    "shards_memory_get",
    "shards_memory_list",
    "shards_memory_recall",
    "shards_scratch_set",
    "shards_scratch_append",
    "shards_scratch_get",
    "shards_scratch_list",
    "shards_asset_get",
    "shards_asset_list",
    "shards_asset_attach",
    "shards_task_block",
    "shards_task_unblock",
    "shards_task_next",
];

/// The only tool carrying `destructiveHint: true`. Pinned by the plugin-bundle test.
pub const DESTRUCTIVE_TOOLS: [&str; 1] = ["shards_task_cancel"];

/// The MCP protocol version this server speaks.
pub const PROTOCOL_VERSION: &str = "2025-06-18";

/// Serve the stdio MCP loop and report the process exit status.
pub fn serve_stdio() -> std::process::ExitCode {
    std::process::ExitCode::from(u8::try_from(serve_stdio_code()).unwrap_or(1))
}

/// The same loop, as an `i32`, for the `shards-mcp` shim, which takes no flags and resolves
/// its config through `$SHARDS_CONFIG_PATH`. `shards mcp` passes the parsed globals instead.
pub fn serve_stdio_code() -> i32 {
    serve(
        &mut std::io::stdin().lock(),
        &mut std::io::stdout(),
        None,
        None,
    )
}

/// The loop itself: one request line in, at most one response line out.
///
/// Nothing here can fail the process. A malformed line is a JSON-RPC error frame, an unknown
/// method is `-32601`, and a domain failure is a successful call carrying `isError`.
pub fn serve(
    input: &mut impl BufRead,
    output: &mut impl Write,
    config: Option<PathBuf>,
    vault: Option<PathBuf>,
) -> i32 {
    let server = tools::Server::new(config, vault);
    let mut line = String::new();
    loop {
        line.clear();
        match input.read_line(&mut line) {
            Ok(0) | Err(_) => return 0,
            Ok(_) => {}
        }
        let Some(parsed) = proto::parse(&line) else {
            continue;
        };
        let response = match parsed {
            proto::Parsed::Error(frame) => Some(frame),
            proto::Parsed::Request(request) => handle(&server, &request),
        };
        if let Some(frame) = response {
            if output.write_all(proto::frame(&frame).as_bytes()).is_err() {
                return 0;
            }
            let _ = output.flush();
        }
    }
}

/// Answer one request, or `None` when the frame is a notification.
fn handle(server: &tools::Server, request: &proto::Request) -> Option<serde_json::Value> {
    let id = request.reply_id();
    let result = match request.method.as_str() {
        "initialize" => Ok(initialize_result(server)),
        "notifications/initialized" => return None,
        "ping" => Ok(serde_json::json!({})),
        "tools/list" => Ok(serde_json::json!({"tools": schema::tools_list()})),
        "tools/call" => call_result(server, &request.params),
        _ if request.method.starts_with("notifications/") => return None,
        other => Err(proto::failure(
            &id,
            proto::METHOD_NOT_FOUND,
            &format!("method not found: {other}"),
        )),
    };
    if request.is_notification() {
        return None;
    }
    Some(match result {
        Ok(value) => proto::success(&id, value),
        Err(frame) => reframe(frame, &id),
    })
}

/// A protocol-level failure built against a placeholder id, re-stamped with the real one.
fn reframe(mut frame: serde_json::Value, id: &serde_json::Value) -> serde_json::Value {
    if let Some(map) = frame.as_object_mut() {
        map.insert("id".to_string(), id.clone());
    }
    frame
}

/// The `initialize` result: protocol version, capabilities, identity, instructions.
fn initialize_result(server: &tools::Server) -> serde_json::Value {
    serde_json::json!({
        "protocolVersion": PROTOCOL_VERSION,
        "capabilities": {"tools": {"listChanged": false}},
        "serverInfo": {"name": SERVER_NAME, "version": crate::VERSION},
        "instructions": server.instructions(),
    })
}

/// `tools/call`: dispatch by name, then render success or the error envelope.
fn call_result(
    server: &tools::Server,
    params: &serde_json::Value,
) -> std::result::Result<serde_json::Value, serde_json::Value> {
    let Some(name) = params.get("name").and_then(|v| v.as_str()) else {
        return Err(proto::failure(
            &serde_json::Value::Null,
            proto::INVALID_PARAMS,
            "invalid params: tools/call needs a tool name",
        ));
    };
    let empty = serde_json::json!({});
    let arguments = match params.get("arguments") {
        None | Some(serde_json::Value::Null) => empty,
        Some(value @ serde_json::Value::Object(_)) => value.clone(),
        Some(_) => {
            return Err(proto::failure(
                &serde_json::Value::Null,
                proto::INVALID_PARAMS,
                "invalid params: arguments must be an object",
            ))
        }
    };
    Ok(match server.call(name, &arguments) {
        Ok(outcome) => errors::success(&outcome.value, outcome.list),
        Err(e) => errors::failure(&e),
    })
}

/// The instructions block, built once at startup. Pure, and at most
/// [`instructions::BUDGET_BYTES`] UTF-8 bytes.
pub fn build_instructions(cfg: Option<&Config>) -> String {
    instructions::build(cfg)
}

/// The JSON error payload an MCP `ToolError` carries as its message.
pub fn tool_error(e: &ShardsError) -> String {
    errors::envelope_text(e)
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;

    #[test]
    fn the_tool_table_is_forty_unique_names() {
        let mut sorted = TOOL_NAMES.to_vec();
        sorted.sort();
        sorted.dedup();
        assert_eq!(sorted.len(), 40);
        assert_eq!(TOOL_NAMES.first(), Some(&"shards_note_get"));
        assert_eq!(TOOL_NAMES.last(), Some(&"shards_task_next"));
    }

    #[test]
    fn no_tool_name_contains_a_withheld_substring() {
        for name in TOOL_NAMES {
            for banned in [
                "delete", "daemon", "reindex", "status", "forget", "remove", "clear",
            ] {
                assert!(!name.contains(banned), "{name} contains {banned}");
            }
        }
    }

    #[test]
    fn destructive_is_exactly_task_cancel() {
        assert_eq!(DESTRUCTIVE_TOOLS, ["shards_task_cancel"]);
        assert!(TOOL_NAMES.contains(&"shards_task_cancel"));
    }

    #[test]
    fn tool_error_is_the_cli_envelope() {
        let payload = tool_error(&ShardsError::NoteNotFound("x".into()));
        assert!(payload.contains("\"kind\":\"not_found\""));
        assert!(payload.contains("\"message\":\"note not found: x\""));
    }
}
