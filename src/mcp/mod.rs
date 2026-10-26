//! The stdio MCP server: JSON-RPC 2.0 over newline-delimited stdin/stdout.
//!
//! Forty-two tools over the same domain seams the CLI calls, an instructions block built
//! once from the config, and a hand-rolled protocol loop — no MCP crate, no async runtime, and
//! nothing that can make a tool failure kill the process. A client may mount a subset of the
//! table through a [`ToolProfile`] (`shards mcp --tools memory`), so one server can be handed to
//! a session that is only allowed to remember.

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

/// The 42 registered tools, in registration order (final.md §10).
pub const TOOL_NAMES: [&str; 42] = [
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
    "shards_memory_supersede",
    "shards_memory_forget",
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

/// The tools carrying `destructiveHint: true`. Pinned by the plugin-bundle test: cancelling a
/// task and forgetting a memory are the only two writes an agent cannot undo.
pub const DESTRUCTIVE_TOOLS: [&str; 2] = ["shards_task_cancel", "shards_memory_forget"];

/// The eight memory tools, in registration order: the whole of the `memory` profile.
pub const MEMORY_TOOLS: [&str; 8] = [
    "shards_memory_new",
    "shards_memory_append",
    "shards_memory_update",
    "shards_memory_supersede",
    "shards_memory_forget",
    "shards_memory_get",
    "shards_memory_list",
    "shards_memory_recall",
];

/// The env var the flagless `shards-mcp` shim reads its profile from.
pub const ENV_TOOLS: &str = "SHARDS_MCP_TOOLS";

/// The subset of the table one client mounts.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ToolProfile {
    /// Every registered tool. The default.
    #[default]
    All,
    /// The eight memory tools and nothing else — a session that may remember, not act.
    Memory,
}

impl ToolProfile {
    /// Every profile name, in the order help lists them.
    pub const NAMES: [&'static str; 2] = ["all", "memory"];

    /// Parse a profile name from `--tools` or `$SHARDS_MCP_TOOLS`; `None` is an unknown name.
    pub fn parse(name: &str) -> Option<ToolProfile> {
        match name.trim().to_ascii_lowercase().as_str() {
            "all" => Some(ToolProfile::All),
            "memory" => Some(ToolProfile::Memory),
            _ => None,
        }
    }

    /// Whether this profile mounts `tool`. A tool outside the profile is unknown to the client,
    /// so `tools/list` hides it and `tools/call` refuses it.
    pub fn mounts(self, tool: &str) -> bool {
        match self {
            ToolProfile::All => true,
            ToolProfile::Memory => MEMORY_TOOLS.contains(&tool),
        }
    }
}

/// The MCP protocol version this server speaks.
pub const PROTOCOL_VERSION: &str = "2025-06-18";

/// Serve the stdio MCP loop and report the process exit status.
pub fn serve_stdio() -> std::process::ExitCode {
    std::process::ExitCode::from(u8::try_from(serve_stdio_code()).unwrap_or(1))
}

/// The same loop, as an `i32`, for the `shards-mcp` shim, which takes no flags: it resolves its
/// config through `$SHARDS_CONFIG_PATH` and its tool profile through `$SHARDS_MCP_TOOLS`.
/// `shards mcp` passes the parsed globals and `--tools` instead.
pub fn serve_stdio_code() -> i32 {
    let profile = match std::env::var(ENV_TOOLS) {
        Err(_) => ToolProfile::All,
        Ok(raw) => match ToolProfile::parse(&raw) {
            Some(profile) => profile,
            None => {
                eprintln!(
                    "shards-mcp: unknown tool profile `{raw}` (expected one of: {})",
                    ToolProfile::NAMES.join(", ")
                );
                return 2;
            }
        },
    };
    serve(
        &mut std::io::stdin().lock(),
        &mut std::io::stdout(),
        None,
        None,
        profile,
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
    profile: ToolProfile,
) -> i32 {
    let server = tools::Server::with_profile(config, vault, profile);
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
        "tools/list" => Ok(serde_json::json!({
            "tools": schema::tools_list(server.profile())
        })),
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

/// The instructions block, built once at startup. Pure, and at most 2048 UTF-8 bytes.
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
    fn the_tool_table_is_forty_two_unique_names() {
        let mut sorted = TOOL_NAMES.to_vec();
        sorted.sort();
        sorted.dedup();
        assert_eq!(sorted.len(), 42);
        assert_eq!(TOOL_NAMES.first(), Some(&"shards_note_get"));
        assert_eq!(TOOL_NAMES.last(), Some(&"shards_task_next"));
    }

    #[test]
    fn no_tool_name_contains_a_withheld_substring() {
        // `forget` is deliberately absent: memory forget is the one removal an agent may run,
        // and it is announced rather than smuggled in.
        for name in TOOL_NAMES {
            for banned in ["delete", "daemon", "reindex", "status", "remove", "clear"] {
                assert!(!name.contains(banned), "{name} contains {banned}");
            }
        }
    }

    #[test]
    fn destructive_is_exactly_cancel_and_memory_forget() {
        assert_eq!(
            DESTRUCTIVE_TOOLS,
            ["shards_task_cancel", "shards_memory_forget"]
        );
        for name in DESTRUCTIVE_TOOLS {
            assert!(TOOL_NAMES.contains(&name));
        }
    }

    #[test]
    fn the_memory_profile_is_exactly_the_memory_family() {
        assert_eq!(MEMORY_TOOLS.len(), 8);
        for tool in MEMORY_TOOLS {
            assert!(TOOL_NAMES.contains(&tool), "{tool} is not registered");
            assert!(tool.starts_with("shards_memory_"), "{tool}");
            assert!(ToolProfile::Memory.mounts(tool), "{tool}");
        }
        let family = TOOL_NAMES
            .into_iter()
            .filter(|name| name.starts_with("shards_memory_"))
            .collect::<Vec<_>>();
        assert_eq!(family, MEMORY_TOOLS.to_vec());
        assert!(!ToolProfile::Memory.mounts("shards_task_list"));
        assert!(ToolProfile::All.mounts("shards_task_list"));
    }

    #[test]
    fn profile_names_parse_and_round_trip() {
        assert_eq!(ToolProfile::parse("all"), Some(ToolProfile::All));
        assert_eq!(ToolProfile::parse(" Memory "), Some(ToolProfile::Memory));
        assert_eq!(ToolProfile::parse("tasks"), None);
        assert_eq!(ToolProfile::default(), ToolProfile::All);
        for name in ToolProfile::NAMES {
            assert!(ToolProfile::parse(name).is_some(), "{name}");
        }
    }

    #[test]
    fn tool_error_is_the_cli_envelope() {
        let payload = tool_error(&ShardsError::NoteNotFound("x".into()));
        assert!(payload.contains("\"kind\":\"not_found\""));
        assert!(payload.contains("\"message\":\"note not found: x\""));
    }
}
