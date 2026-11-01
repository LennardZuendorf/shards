//! Whole-process native hooks retain observed envelopes and ambient configuration.
use serde_json::{json, Value};
use std::{
    fs,
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
};
use tempfile::TempDir;

struct Fixture {
    _temp: TempDir,
    root: PathBuf,
    project: PathBuf,
    vault: PathBuf,
    config: PathBuf,
}
impl Fixture {
    fn new() -> Self {
        let temp = tempfile::tempdir().unwrap();
        let root = shards::storage::realpath(temp.path());
        let project = root.join("project");
        let vault = root.join("vault");
        fs::create_dir(&project).unwrap();
        fs::create_dir(&vault).unwrap();
        let config = root.join("config.toml");
        fs::write(
            &config,
            format!("[core]\nvault_path = {}\nagent = 'worker'\n", json!(vault)),
        )
        .unwrap();
        fs::write(
            project.join(".shards-harness.json"),
            json!({"version":1,"enabled":true,"config_path":config}).to_string(),
        )
        .unwrap();
        Self {
            _temp: temp,
            root,
            project,
            vault,
            config,
        }
    }
    fn command(&self, binary: &str) -> Command {
        let mut command = Command::new(binary);
        for (name, _) in std::env::vars_os() {
            if name.to_string_lossy().starts_with("SHARDS_")
                || name.to_string_lossy().starts_with("MESH_")
            {
                command.env_remove(name);
            }
        }
        command
            .current_dir(&self.project)
            .env("SHARDS_CONFIG_PATH", &self.config)
            .env("XDG_RUNTIME_DIR", self.root.join("runtime"));
        command
    }
    fn cli(&self, args: &[&str], actor: Option<&str>) -> Value {
        let mut command = self.command(env!("CARGO_BIN_EXE_shards"));
        command.arg("--json").args(args);
        if let Some(actor) = actor {
            command.env("SHARDS_AGENT", actor);
        }
        let output = command.output().unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        serde_json::from_slice(&output.stdout).unwrap()
    }
    fn event(
        &self,
        host: &str,
        kind: &str,
        name: &str,
        args: Value,
        call: &str,
        result: Option<Value>,
    ) -> Value {
        let mut value = json!({"hook_event_name":kind,"session_id":"whole-process","cwd":self.project,"tool_use_id":call,"tool_name":name,"tool_input":args});
        value[if host == "claude" {
            "prompt_id"
        } else {
            "turn_id"
        }] = json!("turn");
        if host == "claude" {
            value["mcp_server"] = json!({"name":"shards","source":"dynamic"});
        }
        if let Some(result) = result {
            value["tool_response"] = if host == "claude" {
                json!(result.to_string())
            } else {
                json!({"structuredContent":result,"content":[{"type":"text","text":result.to_string()}]})
            };
        }
        value
    }
    fn hook(&self, host: &str, event: &Value, actor: Option<&str>) -> Value {
        let mut command = self.command(env!("CARGO_BIN_EXE_shards-harness"));
        command
            .args(["--host", host])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if let Some(actor) = actor {
            command.env("SHARDS_AGENT", actor);
        }
        let mut process = command.spawn().unwrap();
        process
            .stdin
            .take()
            .unwrap()
            .write_all(event.to_string().as_bytes())
            .unwrap();
        let output = process.wait_with_output().unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        serde_json::from_slice(&output.stdout).unwrap()
    }
    fn call(&self, host: &str, verb: &str, args: Value, call: &str, actor: Option<&str>) {
        let name = format!("mcp__shards__shards_{verb}");
        assert_eq!(
            self.hook(
                host,
                &self.event(host, "PreToolUse", &name, args.clone(), call, None),
                actor
            ),
            json!({})
        );
        // Drive the actual MCP producer. CLI claim/append summaries have a
        // different schema and cannot stand in for MCP lifecycle evidence.
        let mut command = self.command(env!("CARGO_BIN_EXE_shards-harness"));
        command
            .arg("--mcp")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if let Some(actor) = actor {
            command.env("SHARDS_AGENT", actor);
        }
        let requests = [
            json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{}}}),
            json!({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":format!("shards_{verb}"),"arguments":args}}),
        ];
        let mut process = command.spawn().unwrap();
        let input = requests
            .iter()
            .map(Value::to_string)
            .collect::<Vec<_>>()
            .join("\n")
            + "\n";
        process
            .stdin
            .take()
            .unwrap()
            .write_all(input.as_bytes())
            .unwrap();
        let output = process.wait_with_output().unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        let frames = String::from_utf8(output.stdout)
            .unwrap()
            .lines()
            .map(|line| serde_json::from_str::<Value>(line).unwrap())
            .collect::<Vec<_>>();
        let result = &frames.iter().find(|frame| frame["id"] == 2).unwrap()["result"];
        assert_ne!(result["isError"], true, "{result}");
        let result = result["structuredContent"].clone();
        assert_eq!(
            self.hook(
                host,
                &self.event(host, "PostToolUse", &name, args, call, Some(result)),
                actor
            ),
            json!({})
        );
    }
}

#[test]
fn whole_process_both_observed_envelope_profiles_require_real_start_and_checkpoint() {
    for host in ["claude", "codex"] {
        let f = Fixture::new();
        let id = f.cli(&["task", "new", "Native envelope acceptance"], None)["id"]
            .as_str()
            .unwrap()
            .to_owned();
        let work = |call| {
            f.event(
                host,
                "PreToolUse",
                "Edit",
                json!({"file_path":"example.rs"}),
                call,
                None,
            )
        };
        assert_eq!(
            f.hook(host, &work("before"), None)["hookSpecificOutput"]["permissionDecision"],
            "deny"
        );
        f.call(
            host,
            "task_claim",
            json!({"task_id":id,"strict":true}),
            "claim",
            None,
        );
        assert_eq!(
            f.hook(host, &work("claimed"), None)["hookSpecificOutput"]["permissionDecision"],
            "deny"
        );
        let start = "Intent: verify native host envelopes.\nApproach: exercise the actual binary.";
        f.call(
            host,
            "task_append",
            json!({"task_id":id,"text":start}),
            "start",
            None,
        );
        assert_eq!(f.hook(host, &work("work"), None), json!({}));
        let mut stop = json!({"hook_event_name":"Stop","session_id":"whole-process","cwd":f.project,"stop_hook_active":false});
        stop[if host == "claude" {
            "prompt_id"
        } else {
            "turn_id"
        }] = json!("turn");
        assert_eq!(f.hook(host, &stop, None)["decision"], "block");
        stop["stop_hook_active"] = json!(true);
        assert_eq!(f.hook(host, &stop, None), json!({}));
        let cp="State: continuing\nChanged: exercised native envelopes.\nChecked: both profiles reached guards.\nRemaining: operator review.\nNext: operator reviews.";
        f.call(
            host,
            "task_append",
            json!({"task_id":id,"text":cp}),
            "checkpoint",
            None,
        );
        assert_eq!(f.hook(host, &stop, None), json!({}));
        let task = f.cli(&["task", "get", &id, "--full"], None);
        assert_eq!(task["status"], "claimed");
        assert!(task["body"].as_str().unwrap().contains(cp));
    }
}

#[test]
fn native_actor_override_is_shared_by_hook_and_actual_task_claim() {
    let f = Fixture::new();
    let actor = Some("native-worker");
    let id = f.cli(&["task", "new", "Actor override"], actor)["id"]
        .as_str()
        .unwrap()
        .to_owned();
    f.call(
        "codex",
        "task_claim",
        json!({"task_id":id,"strict":true}),
        "claim",
        actor,
    );
    let start = "Intent: check actor override.\nApproach: read canonical task claim.";
    f.call(
        "codex",
        "task_append",
        json!({"task_id":id,"text":start}),
        "start",
        actor,
    );
    assert_eq!(
        f.cli(&["task", "get", &id], actor)["claimed_by"],
        "native-worker"
    );
    let event = f.event("codex", "PreToolUse", "Edit", json!({}), "work", None);
    assert_eq!(f.hook("codex", &event, actor), json!({}));
    assert_eq!(
        f.hook("codex", &event, None)["hookSpecificOutput"]["permissionDecision"],
        "deny"
    );
}

#[test]
fn native_mcp_preserves_ambient_vault_override_after_coherence_check() {
    let f = Fixture::new();
    let id = f.cli(&["task", "new", "Only in selected vault"], None)["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let other = f.root.join("other-vault");
    fs::create_dir(&other).unwrap();
    let ambient = f.root.join("ambient.toml");
    fs::write(
        &ambient,
        format!("[core]\nvault_path = {}\nagent = 'worker'\n", json!(other)),
    )
    .unwrap();
    let requests = [
        json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{}}}),
        json!({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"shards_task_get","arguments":{"id":id}}}),
    ];
    let mut process = f
        .command(env!("CARGO_BIN_EXE_shards-harness"))
        .arg("--mcp")
        .env("SHARDS_CONFIG_PATH", ambient)
        .env("SHARDS_VAULT", &f.vault)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let input = requests
        .iter()
        .map(Value::to_string)
        .collect::<Vec<_>>()
        .join("\n")
        + "\n";
    process
        .stdin
        .take()
        .unwrap()
        .write_all(input.as_bytes())
        .unwrap();
    let output = process.wait_with_output().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let frames = String::from_utf8(output.stdout)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str::<Value>(line).unwrap())
        .collect::<Vec<_>>();
    let result = &frames.iter().find(|frame| frame["id"] == 2).unwrap()["result"];
    assert_ne!(result["isError"], true, "{result}");
    assert_eq!(result["structuredContent"]["id"], id);
}

fn hook_with_command(mut command: Command, event: &Value) -> std::process::Output {
    let mut child = command
        .args(["--host", "codex"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(event.to_string().as_bytes())
        .unwrap();
    child.wait_with_output().unwrap()
}
fn runtime_symlink_is_refused(component: usize) {
    use std::os::unix::fs::symlink;
    let f = Fixture::new();
    let outside = f.root.join("outside");
    fs::create_dir(&outside).unwrap();
    let runtime = f.root.join("runtime");
    let link = match component {
        0 => runtime.clone(),
        1 => {
            fs::create_dir(&runtime).unwrap();
            runtime.join("shards")
        }
        2 => {
            fs::create_dir_all(runtime.join("shards")).unwrap();
            runtime.join("shards/harness")
        }
        _ => panic!("invalid test component"),
    };
    symlink(&outside, &link).unwrap();
    let event = f.event(
        "codex",
        "PreToolUse",
        "exec_command",
        json!({"cmd":"pwd"}),
        "blocked",
        None,
    );
    let output = hook_with_command(f.command(env!("CARGO_BIN_EXE_shards-harness")), &event);
    assert!(output.status.success());
    let value: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(value["hookSpecificOutput"]["permissionDecision"], "deny");
    assert!(
        String::from_utf8_lossy(&output.stderr).contains("cannot open private runtime directory"),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(
        fs::read_dir(&outside).unwrap().count(),
        0,
        "runtime state escaped through {link:?}"
    );
    let repair = f.event(
        "codex",
        "PreToolUse",
        "Skill",
        json!({"skill":"using-shards"}),
        "repair",
        None,
    );
    assert_eq!(f.hook("codex", &repair, None), json!({}));
    assert_eq!(fs::read_dir(&outside).unwrap().count(), 0);
}
#[test]
fn native_runtime_base_symlink_is_refused() {
    runtime_symlink_is_refused(0);
}
#[test]
fn native_runtime_nested_symlink_is_refused() {
    runtime_symlink_is_refused(1);
}
#[test]
fn native_runtime_final_symlink_is_refused() {
    runtime_symlink_is_refused(2);
}

fn emitted_recovery_uses_running_executable(packaged: bool) {
    let f = Fixture::new();
    let executable = if packaged {
        let root = f.root.join("package");
        fs::create_dir_all(root.join("bin")).unwrap();
        fs::create_dir_all(root.join("skills/using-shards")).unwrap();
        fs::write(
            root.join("skills/using-shards/SKILL.md"),
            "# packaged skill\n",
        )
        .unwrap();
        let binary = root.join("bin/shards-harness");
        fs::copy(env!("CARGO_BIN_EXE_shards-harness"), &binary).unwrap();
        binary
    } else {
        PathBuf::from(env!("CARGO_BIN_EXE_shards-harness"))
    };
    let event = f.event(
        "codex",
        "PreToolUse",
        "exec_command",
        json!({"cmd":"pwd"}),
        "recover",
        None,
    );
    let output = hook_with_command(f.command(executable.to_str().unwrap()), &event);
    assert!(output.status.success());
    let value: Value = serde_json::from_slice(&output.stdout).unwrap();
    let reason = value["hookSpecificOutput"]["permissionDecisionReason"]
        .as_str()
        .unwrap();
    let recovery = reason
        .split("the operator can run: '")
        .nth(1)
        .expect("recovery command");
    let (command, remainder) = recovery.split_once("' --operator-exception ").unwrap();
    assert_eq!(
        fs::canonicalize(command).unwrap(),
        fs::canonicalize(&executable).unwrap()
    );
    assert!(
        std::os::unix::fs::PermissionsExt::mode(&fs::metadata(command).unwrap().permissions())
            & 0o111
            != 0
    );
    let request = remainder.split_whitespace().next().unwrap();
    let granted = f
        .command(command)
        .args([
            "--operator-exception",
            request,
            "--reason",
            "approved isolated repair",
        ])
        .output()
        .unwrap();
    assert!(
        granted.status.success(),
        "{}",
        String::from_utf8_lossy(&granted.stderr)
    );
    assert_eq!(
        serde_json::from_slice::<Value>(&granted.stdout).unwrap()["native_approvals"],
        "unchanged"
    );
    let allowed = hook_with_command(f.command(command), &event);
    assert_eq!(
        serde_json::from_slice::<Value>(&allowed.stdout).unwrap(),
        json!({})
    );
    let consumed = hook_with_command(f.command(command), &event);
    assert_eq!(
        serde_json::from_slice::<Value>(&consumed.stdout).unwrap()["hookSpecificOutput"]
            ["permissionDecision"],
        "deny"
    );
}
#[test]
fn native_source_recovery_uses_actual_runnable_executable() {
    emitted_recovery_uses_running_executable(false);
}
#[test]
fn native_packaged_recovery_uses_actual_runnable_executable() {
    emitted_recovery_uses_running_executable(true);
}
