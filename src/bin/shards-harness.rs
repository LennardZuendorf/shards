//! Local cooperative guard and in-process MCP entrypoint.
#![forbid(unsafe_code)]
#![deny(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::todo,
    clippy::string_slice
)]
mod harness;
use clap::Parser;
use harness::{
    hosts, json,
    reader::Reader,
    runtime::{self, Dependencies},
    state,
};
use serde_json::{json, Value};
use std::{
    io::Read,
    path::{Path, PathBuf},
    process::ExitCode,
};
#[derive(Parser)]
struct Options {
    #[arg(long, value_parser=["claude","codex"])]
    host: Option<String>,
    #[arg(long, conflicts_with_all=["host","operator_exception"])]
    mcp: bool,
    #[arg(long, requires = "reason", conflicts_with = "host")]
    operator_exception: Option<String>,
    #[arg(long, requires = "operator_exception")]
    reason: Option<String>,
}
fn state_root() -> Result<PathBuf, String> {
    let base = std::env::var_os("XDG_RUNTIME_DIR")
        .map(PathBuf::from)
        .or_else(|| dirs::home_dir().map(|p| p.join(".local/state")))
        .ok_or("cannot determine private state root")?;
    // Keep every configured component visible to the store's NOFOLLOW traversal.
    let base = if base.is_absolute() {
        base
    } else {
        std::env::current_dir()
            .map_err(|e| e.to_string())?
            .join(base)
    };
    Ok(base.join("shards/harness"))
}
fn package_root() -> Result<PathBuf, String> {
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    let root = executable
        .parent()
        .and_then(Path::parent)
        .ok_or("cannot determine package root")?;
    if root.join("skills/using-shards/SKILL.md").is_file() {
        return Ok(root.into());
    }
    // A source build uses the bundled source skills; distributed packages use bin/ above.
    Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("plugins/shards"))
}
fn execute(options: Options) -> Result<i32, String> {
    if let Some(request) = options.operator_exception {
        let grant = state::grant_exception(
            &state_root()?,
            &request,
            options.reason.as_deref().ok_or("missing reason")?,
        )?;
        println!(
            "{}",
            json!({"request_id":grant.request_id,"reason":grant.reason,"host":grant.scope.host,"session_id":grant.scope.session_id,"delegated_agent_id":grant.scope.delegated_agent_id,"turn_id":grant.scope.turn_id,"project":grant.scope.project,"config_path":grant.scope.config_path,"tool_name":grant.scope.tool_name,"tool_input_sha256":grant.scope.tool_input_sha256,"native_approvals":"unchanged"})
        );
        return Ok(0);
    }
    if options.mcp {
        if let Some((_, enrollment)) =
            runtime::find_enrollment(&std::env::current_dir().map_err(|e| e.to_string())?)?
        {
            if enrollment.enabled {
                Reader::load(&enrollment.config_path).check_ambient(&enrollment.config_path)?;
            }
        }
        return Ok(shards::mcp::serve_stdio_code());
    }
    let host = options.host.ok_or("--host is required for hook mode")?;
    let mut raw = String::new();
    std::io::stdin()
        .take(1_048_577)
        .read_to_string(&mut raw)
        .map_err(|e| e.to_string())?;
    let mut payload = None;
    let output = (|| {
        if raw.len() > 1_048_576 {
            return Err("hook input exceeds 1 MiB".into());
        }
        let value = json::strict_json(&raw)?;
        payload = Some(value.clone());
        let event = hosts::normalize_event(&host, &value)?;
        let selected = runtime::find_enrollment(Path::new(&event.cwd))
            .ok()
            .flatten()
            .map(|(_, e)| e.config_path)
            .unwrap_or_else(|| shards::config::resolve_config_path(None));
        let dependencies = Dependencies {
            state_root: state_root()?,
            reader: Reader::load(&selected),
            package: package_root()?,
            executable: std::env::current_exe().map_err(|e| e.to_string())?,
        };
        hosts::encode_result(&host, &runtime::run_event(&event, &dependencies))
    })();
    match output {
        Ok(output) => println!("{output}"),
        Err(error) => {
            eprintln!("Shards harness payload failure: {error}");
            let known_nonpre = payload
                .as_ref()
                .and_then(|p| p.get("hook_event_name"))
                .and_then(Value::as_str)
                .is_some_and(|v| v != "PreToolUse");
            if known_nonpre {
                println!("{{}}");
            } else {
                println!(
                    "{}",
                    json!({"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Malformed Shards hook input; repair hook payload before work"}})
                );
            }
        }
    }
    Ok(0)
}
fn main() -> ExitCode {
    match execute(Options::parse()) {
        Ok(code) => ExitCode::from(u8::try_from(code).unwrap_or(1)),
        Err(error) => {
            eprintln!("Shards harness: {error}");
            ExitCode::FAILURE
        }
    }
}
