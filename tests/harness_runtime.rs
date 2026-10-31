//! Native policy tests use real core mutations and isolated hook subprocesses.
#![allow(dead_code)]
#[path = "../src/bin/harness/mod.rs"]
mod harness;
use harness::{
    hosts::{HookResult, NormalizedEvent},
    reader::Reader,
    runtime::{self, Dependencies},
    state,
};
use serde_json::{json, Value};
use shards::domain::{tasks, AppendOpts};
use std::{
    fs,
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
};
use tempfile::TempDir;
const START: &str = "Intent: implement the example.\nApproach: inspect and test changes.";
const CP:&str="State: continuing\nChanged: implementation.\nChecked: tests passed.\nRemaining: review.\nNext: review the patch.";
struct Fixture {
    _tmp: TempDir,
    project: PathBuf,
    config: PathBuf,
    deps: Dependencies,
    task: String,
}
impl Fixture {
    fn new() -> Self {
        let tmp = tempfile::tempdir().unwrap();
        let root = shards::storage::realpath(tmp.path());
        let project = root.join("project");
        let vault = root.join("vault");
        fs::create_dir_all(&project).unwrap();
        fs::create_dir(&vault).unwrap();
        let config = root.join("config.toml");
        let text = format!("[core]\nvault_path = {:?}\nagent = 'worker'\n", vault);
        fs::write(&config, &text).unwrap();
        fs::write(
            project.join(".shards-harness.json"),
            json!({"version":1,"enabled":true,"config_path":config}).to_string(),
        )
        .unwrap();
        let table = text.parse::<toml::Table>().unwrap();
        let cfg = shards::config::from_table(&table, Some(&vault))
            .unwrap()
            .with_agent(Some("worker"));
        let task = tasks::create(
            &cfg,
            "Example",
            tasks::NewTask {
                owner: Some("worker".into()),
                ..Default::default()
            },
        )
        .unwrap()
        .id;
        let deps = Dependencies {
            state_root: root.join("state"),
            executable: PathBuf::from(env!("CARGO_BIN_EXE_shards-harness")),
            reader: Reader {
                selected: Ok(cfg.clone()),
                ambient: Ok(cfg),
            },
            package: PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("plugins/shards"),
        };
        Self {
            _tmp: tmp,
            project,
            config,
            deps,
            task,
        }
    }
    fn event(&self, kind: &str, name: &str, args: Value, call: &str) -> NormalizedEvent {
        NormalizedEvent {
            host: "codex".into(),
            event_kind: kind.into(),
            session_id: "s".into(),
            cwd: self.project.to_string_lossy().into_owned(),
            agent_id: None,
            agent_type: None,
            turn_id: Some("turn".into()),
            call_id: Some(call.into()),
            source: None,
            tool_name: Some(name.into()),
            tool_input: Some(args),
            tool_result: None,
            tool_error: None,
            mcp_server: None,
            stop_hook_active: false,
        }
    }
    fn run(&self, kind: &str, name: &str, args: Value, call: &str) -> HookResult {
        runtime::run_event(&self.event(kind, name, args, call), &self.deps)
    }
    fn work(&self, call: &str) -> HookResult {
        self.run("PreToolUse", "Edit", json!({"path":"code.rs"}), call)
    }
    fn task_result(&self) -> Value {
        let t = tasks::get(self.deps.reader.config().unwrap(), &self.task).unwrap();
        json!({"type":"task","id":self.task,"status":t.item.status,"claimed_by":t.item.claimed_by})
    }
    fn post(&self, verb: &str, args: Value, call: &str) -> HookResult {
        let mut e = self.event(
            "PostToolUse",
            &format!("mcp__shards__shards_{verb}"),
            args,
            call,
        );
        e.tool_result = Some(self.task_result());
        runtime::run_event(&e, &self.deps)
    }
    fn claim(&self, call: &str) {
        let args = json!({"task_id":self.task,"strict":true});
        assert_eq!(
            self.run(
                "PreToolUse",
                "mcp__shards__shards_task_claim",
                args.clone(),
                call
            )
            .action,
            "allow"
        );
        tasks::claim(
            self.deps.reader.config().unwrap(),
            &self.task,
            "worker",
            true,
        )
        .unwrap();
        self.post("task_claim", args, call);
    }
    fn append(&self, text: &str, call: &str) {
        let args = json!({"task_id":self.task,"text":text});
        assert_eq!(
            self.run(
                "PreToolUse",
                "mcp__shards__shards_task_append",
                args.clone(),
                call
            )
            .action,
            "allow"
        );
        tasks::append(
            self.deps.reader.config().unwrap(),
            &self.task,
            text,
            AppendOpts::default(),
        )
        .unwrap();
        self.post("task_append", args, call);
    }
    fn start(&self) {
        self.claim("claim");
        self.append(START, "start");
    }
    fn receipt(&self) -> state::Receipt {
        let key = state::SessionKey::new(
            self.deps.reader.config().unwrap().vault().into(),
            "codex".into(),
            "s".into(),
            None,
        )
        .unwrap();
        state::load_receipt(&self.deps.state_root, &key)
            .unwrap()
            .unwrap()
    }
    fn lifecycle(&self, verb: &str, call: &str) {
        let args = json!({"task_id":self.task});
        assert_eq!(
            self.run(
                "PreToolUse",
                &format!("mcp__shards__shards_{verb}"),
                args.clone(),
                call
            )
            .action,
            "allow"
        );
        match verb {
            "task_release" => {
                tasks::release(
                    self.deps.reader.config().unwrap(),
                    &self.task,
                    "worker",
                    false,
                )
                .unwrap();
            }
            "task_finish" => {
                tasks::terminate(
                    self.deps.reader.config().unwrap(),
                    &self.task,
                    tasks::Terminal::Finish,
                    Some("verified tests"),
                    None,
                )
                .unwrap();
            }
            "task_cancel" => {
                tasks::terminate(
                    self.deps.reader.config().unwrap(),
                    &self.task,
                    tasks::Terminal::Cancel,
                    Some("cancelled explicitly"),
                    None,
                )
                .unwrap();
            }
            _ => panic!("bad fixture verb"),
        };
        self.post(verb, args, call);
    }
    fn hook(&self, raw: &str, extra: &[(&str, &str)], mcp: bool) -> std::process::Output {
        let mut cmd = Command::new(env!("CARGO_BIN_EXE_shards-harness"));
        for (key, _) in std::env::vars() {
            if key.starts_with("SHARDS_") || key.starts_with("MESH_") {
                cmd.env_remove(key);
            }
        }
        cmd.env("SHARDS_CONFIG_PATH", &self.config)
            .env("XDG_RUNTIME_DIR", self._tmp.path().join("runtime"))
            .current_dir(&self.project)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        for (k, v) in extra {
            cmd.env(k, v);
        }
        if mcp {
            cmd.arg("--mcp");
        } else {
            cmd.args(["--host", "codex"]);
        }
        let mut child = cmd.spawn().unwrap();
        child
            .stdin
            .take()
            .unwrap()
            .write_all(raw.as_bytes())
            .unwrap();
        child.wait_with_output().unwrap()
    }
}
#[test]
fn work_without_start_is_denied() {
    let f = Fixture::new();
    assert_eq!(f.work("a").action, "deny");
}
#[test]
fn unenrolled_and_disabled_are_passthrough() {
    let f = Fixture::new();
    fs::remove_file(f.project.join(".shards-harness.json")).unwrap();
    assert_eq!(f.work("a").action, "allow");
    fs::write(
        f.project.join(".shards-harness.json"),
        json!({"version":1,"enabled":false,"config_path":f.config}).to_string(),
    )
    .unwrap();
    assert_eq!(f.work("a").action, "allow");
}
#[test]
fn startup_has_skill_and_canonical_context() {
    let f = Fixture::new();
    let r = f.run("SessionStart", "", json!({}), "a");
    assert_eq!(r.action, "inject-context");
    assert!(r.context.contains("# using-shards"));
    assert!(r.context.contains("worker"));
    assert!(r.context.contains(&f.task));
}
#[test]
fn claim_needs_verified_start_before_work() {
    let f = Fixture::new();
    f.claim("claim");
    assert_eq!(f.work("a").action, "deny");
    f.append(START, "start");
    assert_eq!(f.work("a").action, "allow");
    assert_eq!(f.receipt().work_sequence, 1);
}
#[test]
fn absent_or_reused_body_occurrence_cannot_start() {
    let f = Fixture::new();
    f.claim("claim");
    for call in ["fake", "fake2"] {
        let args = json!({"task_id":f.task,"text":START});
        f.run(
            "PreToolUse",
            "mcp__shards__shards_task_append",
            args.clone(),
            call,
        );
        f.post("task_append", args, call);
        assert_eq!(f.work("a").action, "deny");
    }
    tasks::append(
        f.deps.reader.config().unwrap(),
        &f.task,
        START,
        AppendOpts::default(),
    )
    .unwrap();
    let args = json!({"task_id":f.task,"text":START});
    f.run(
        "PreToolUse",
        "mcp__shards__shards_task_append",
        args.clone(),
        "reused",
    );
    f.post("task_append", args, "reused");
    assert_eq!(f.work("a").action, "deny");
}
#[test]
fn stop_continues_once_per_dirty_sequence_and_generic_prose_does_not_clean() {
    let f = Fixture::new();
    f.start();
    f.work("a");
    f.append("Progress: investigating.", "progress");
    assert_eq!(f.run("Stop", "", json!({}), "stop").action, "continue");
    assert_eq!(f.run("Stop", "", json!({}), "stop").action, "allow");
    f.work("b");
    let mut event = f.event("Stop", "", json!({}), "stop2");
    event.stop_hook_active = true;
    assert_eq!(runtime::run_event(&event, &f.deps).action, "allow");
    f.append(CP, "cp");
    assert_eq!(f.run("Stop", "", json!({}), "stop3").action, "allow");
}
#[test]
fn namespaces_and_skill_orientation_are_exact() {
    let f = Fixture::new();
    assert_eq!(
        f.run(
            "PreToolUse",
            "mcp__other__shards_task_claim",
            json!({"task_id":f.task}),
            "x"
        )
        .action,
        "deny"
    );
    for (name, args) in [
        ("mcp__shards__shards_task_get", json!({})),
        ("Skill", json!({"skill":"shards:using-shards"})),
        (
            "Read",
            json!({"file_path":f.deps.package.join("skills/using-shards/SKILL.md")}),
        ),
        ("Bash", json!({"command":"shards --version"})),
    ] {
        assert_eq!(f.run("PreToolUse", name, args, "orient").action, "allow");
    }
    assert_eq!(
        f.run(
            "PreToolUse",
            "Bash",
            json!({"command":"shards --version && touch unsafe"}),
            "x"
        )
        .action,
        "deny"
    );
}
#[test]
fn released_claim_is_rechecked_and_release_resume_changes_generation() {
    let f = Fixture::new();
    f.start();
    f.work("a");
    assert_eq!(
        f.run(
            "PreToolUse",
            "mcp__shards__shards_task_release",
            json!({"task_id":f.task}),
            "dirty"
        )
        .action,
        "deny"
    );
    f.append(CP, "cp");
    f.lifecycle("task_release", "release");
    assert!(f.receipt().retired);
    f.claim("claim2");
    assert_eq!(f.receipt().generation, 2);
    assert_eq!(f.work("b").action, "deny");
    f.append(START, "start2");
    tasks::release(f.deps.reader.config().unwrap(), &f.task, "worker", false).unwrap();
    assert_eq!(f.work("c").action, "deny");
}
#[test]
fn delayed_checkpoint_never_cleans_newer_work() {
    let f = Fixture::new();
    f.start();
    f.work("a");
    let args = json!({"task_id":f.task,"text":CP});
    f.run(
        "PreToolUse",
        "mcp__shards__shards_task_append",
        args.clone(),
        "late",
    );
    f.work("b");
    tasks::append(
        f.deps.reader.config().unwrap(),
        &f.task,
        CP,
        AppendOpts::default(),
    )
    .unwrap();
    f.post("task_append", args, "late");
    assert_eq!(f.receipt().work_sequence, 2);
    assert_eq!(f.receipt().checkpoint_sequence, 1);
    assert_eq!(f.run("Stop", "", json!({}), "stop").action, "continue");
}
#[test]
fn invalid_checkpoint_forms_and_duplicate_fields_do_not_clean() {
    for text in [
        "State: nonsense\nChanged: x\nChecked: x\nRemaining: x\nNext: x",
        "State: continuing\nChanged:\nChecked:\nRemaining:\nNext:",
        "State: continuing\nState: completed\nChanged: x\nChecked: x\nRemaining: x\nNext: x",
    ] {
        let f = Fixture::new();
        f.start();
        f.work("a");
        f.append(text, "cp");
        assert_eq!(f.receipt().checkpoint_sequence, 0);
    }
}
#[test]
fn checkpoint_cannot_substitute_for_initial_intent_or_punctuation() {
    for text in [CP, "Intent: ...\nApproach: !!!"] {
        let f = Fixture::new();
        f.claim("c");
        f.append(text, "start");
        assert_eq!(f.work("a").action, "deny");
    }
}
#[test]
fn fork_and_delegate_cannot_inherit_binding_or_claim_coordinator() {
    let f = Fixture::new();
    f.start();
    let mut e = f.event("PreToolUse", "Edit", json!({}), "x");
    e.session_id = "fork".into();
    assert_eq!(runtime::run_event(&e, &f.deps).action, "deny");
    e.session_id = "s".into();
    e.agent_id = Some("child".into());
    assert_eq!(runtime::run_event(&e, &f.deps).action, "deny");
    e.tool_name = Some("mcp__shards__shards_task_claim".into());
    e.tool_input = Some(json!({"task_id":f.task,"strict":true}));
    assert_eq!(runtime::run_event(&e, &f.deps).action, "deny");
}
#[test]
fn another_same_actor_session_cannot_bind() {
    let f = Fixture::new();
    f.start();
    let args = json!({"task_id":f.task,"strict":true});
    let mut pre = f.event(
        "PreToolUse",
        "mcp__shards__shards_task_claim",
        args.clone(),
        "claim2",
    );
    pre.session_id = "other".into();
    runtime::run_event(&pre, &f.deps);
    pre.event_kind = "PostToolUse".into();
    pre.tool_result = Some(f.task_result());
    runtime::run_event(&pre, &f.deps);
    pre.event_kind = "PreToolUse".into();
    pre.tool_name = Some("Edit".into());
    assert_eq!(runtime::run_event(&pre, &f.deps).action, "deny");
}
#[test]
fn unbound_repair_is_limited_and_does_not_start() {
    let f = Fixture::new();
    for tags in ["+needs-input", "-agent-error"] {
        assert_eq!(
            f.run(
                "PreToolUse",
                "mcp__shards__shards_task_update",
                json!({"task_id":f.task,"tags":tags}),
                "repair"
            )
            .action,
            "allow"
        );
    }
    for args in [
        json!({"task_id":f.task,"tags":"+other"}),
        json!({"task_id":f.task,"title":"x","tags":"+needs-input"}),
    ] {
        assert_eq!(
            f.run("PreToolUse", "mcp__shards__shards_task_update", args, "bad")
                .action,
            "deny"
        );
    }
    f.append(START, "repair");
    assert_eq!(f.work("a").action, "deny");
}
#[test]
fn finish_cancel_and_waiting_release_require_checkpoint_and_retire() {
    for (verb, phase) in [
        ("task_finish", "completed"),
        ("task_cancel", "handoff"),
        ("task_release", "waiting"),
    ] {
        let f = Fixture::new();
        f.start();
        f.work("a");
        assert_eq!(
            f.run(
                "PreToolUse",
                &format!("mcp__shards__shards_{verb}"),
                json!({"task_id":f.task}),
                "bad"
            )
            .action,
            "deny"
        );
        f.append(&CP.replace("continuing", phase), "cp");
        if verb == "task_release" {
            tasks::update(
                f.deps.reader.config().unwrap(),
                &f.task,
                tasks::UpdateTask {
                    tags: Some("+needs-input".into()),
                    ..Default::default()
                },
            )
            .unwrap();
        }
        f.lifecycle(verb, "life");
        assert!(f.receipt().retired);
        assert_eq!(
            f.receipt().phase,
            if verb == "task_release" {
                "waiting"
            } else if verb == "task_finish" || verb == "task_cancel" {
                "completed"
            } else {
                phase
            }
        );
    }
}
#[test]
fn external_terminal_blocks_work_then_exact_handoff_retires() {
    let f = Fixture::new();
    f.start();
    f.work("a");
    tasks::terminate(
        f.deps.reader.config().unwrap(),
        &f.task,
        tasks::Terminal::Finish,
        Some("external"),
        None,
    )
    .unwrap();
    assert_eq!(f.work("b").action, "deny");
    assert!(!f.receipt().retired);
    f.append(&CP.replace("continuing", "handoff"), "observed");
    assert!(f.receipt().retired);
    assert_eq!(f.receipt().phase, "handoff");
}
#[test]
fn postclaim_without_pre_cannot_bind() {
    let f = Fixture::new();
    tasks::claim(f.deps.reader.config().unwrap(), &f.task, "worker", true).unwrap();
    f.post(
        "task_claim",
        json!({"task_id":f.task,"strict":true}),
        "missing",
    );
    assert_eq!(f.work("a").action, "deny");
}
#[test]
fn literal_search_and_grants_follow_distinct_policy_paths() {
    let f = Fixture::new();
    for cmd in [
        "rg --operator-exception .",
        "cat shards-harness --operator-exception",
        "test --operator-exception = value",
    ] {
        assert_eq!(
            f.run("PreToolUse", "Bash", json!({"command":cmd}), "x")
                .action,
            "deny"
        );
    }
    f.start();
    for cmd in [
        "rg --operator-exception .",
        "cat shards-harness --operator-exception",
        "test --operator-exception = value",
    ] {
        assert_eq!(
            f.run("PreToolUse", "Bash", json!({"command":cmd}), cmd)
                .action,
            "allow"
        );
    }
    for cmd in [
        "shards-harness --operator-exception x",
        "env A=b command /tmp/shards-harness --operator-exception=x",
        "bash -lc 'exec shards-harness --operator-exception x'",
    ] {
        assert_eq!(
            f.run("PreToolUse", "Bash", json!({"command":cmd}), "grant")
                .action,
            "deny"
        );
    }
}
#[test]
fn malformed_enrollment_blocks_work_but_orientation_can_repair() {
    let f = Fixture::new();
    fs::write(f.project.join(".shards-harness.json"), "null").unwrap();
    assert_eq!(f.work("a").action, "deny");
    assert_eq!(
        f.run("PreToolUse", "Skill", json!({"skill":"shards"}), "repair")
            .action,
        "allow"
    );
}
#[test]
fn unavailable_reader_allows_skill_and_exact_one_use_exception() {
    let mut f = Fixture::new();
    f.deps.reader.selected = Err("unavailable".into());
    assert_eq!(
        f.run("PreToolUse", "Skill", json!({"skill":"using-shards"}), "s")
            .action,
        "allow"
    );
    assert_eq!(f.work("a").action, "deny");
    let scope = state::ExceptionScope {
        project: f.project.clone(),
        config_path: f.config.clone(),
        host: "codex".into(),
        session_id: "s".into(),
        delegated_agent_id: None,
        turn_id: "turn".into(),
        tool_name: "Edit".into(),
        tool_input_sha256: harness::json::digest(&json!({"path":"code.rs"})).unwrap(),
    };
    let request = state::request_exception(&f.deps.state_root, &scope).unwrap();
    state::grant_exception(
        &f.deps.state_root,
        &request.request_id,
        "approved exact repair",
    )
    .unwrap();
    let mut other = f.event("PreToolUse", "Edit", json!({"path":"different"}), "a");
    assert_eq!(runtime::run_event(&other, &f.deps).action, "deny");
    other.tool_input = Some(json!({"path":"code.rs"}));
    assert_eq!(runtime::run_event(&other, &f.deps).action, "allow");
    assert_eq!(runtime::run_event(&other, &f.deps).action, "deny");
}
#[test]
fn duplicate_stdin_fails_closed_and_nonpre_malformed_yields() {
    let f = Fixture::new();
    for raw in [
        "{\"hook_event_name\":\"PreToolUse\",\"hook_event_name\":\"Stop\"}",
        "null",
        "[]",
    ] {
        let out = f.hook(raw, &[], false);
        assert!(out.status.success());
        let value: Value = serde_json::from_slice(&out.stdout).unwrap();
        assert_eq!(value["hookSpecificOutput"]["permissionDecision"], "deny");
    }
    let out = f.hook("{\"hook_event_name\":\"Stop\"}", &[], false);
    assert_eq!(
        serde_json::from_slice::<Value>(&out.stdout).unwrap(),
        json!({})
    );
}
#[test]
fn mcp_runs_in_process_and_ambient_disagreement_is_rejected() {
    let f = Fixture::new();
    let requests="{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{}}\n{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\",\"params\":{}}\n";
    let out = f.hook(requests, &[], true);
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    let lines: Vec<Value> = String::from_utf8(out.stdout)
        .unwrap()
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect();
    assert_eq!(lines[1]["result"]["tools"].as_array().unwrap().len(), 40);
    let other = f._tmp.path().join("other");
    fs::create_dir(&other).unwrap();
    let out = f.hook(requests, &[("SHARDS_VAULT", other.to_str().unwrap())], true);
    assert!(!out.status.success());
    assert!(String::from_utf8_lossy(&out.stderr).contains("contexts differ"));
    fs::remove_file(f.project.join(".shards-harness.json")).unwrap();
    assert!(f.hook(requests, &[], true).status.success());
}
#[test]
fn recurrence_retires_one_occurrence_and_preserves_unfinished_task() {
    let f = Fixture::new();
    tasks::update(
        f.deps.reader.config().unwrap(),
        &f.task,
        tasks::UpdateTask {
            due: Some("2026-01-01".into()),
            recur: Some("FREQ=DAILY".into()),
            ..Default::default()
        },
    )
    .unwrap();
    f.start();
    f.work("a");
    f.append(&CP.replace("continuing", "completed"), "cp");
    f.lifecycle("task_finish", "finish");
    assert!(f.receipt().retired);
    let task = tasks::get(f.deps.reader.config().unwrap(), &f.task).unwrap();
    assert_eq!(task.item.status, "open");
    assert_eq!(task.item.claimed_by, None);
    assert!(task.body.contains(START));
    assert!(task.body.contains("Checked: tests passed."));
}
#[test]
fn delayed_old_append_and_release_cannot_modify_resumed_generation() {
    let f = Fixture::new();
    f.start();
    f.work("a");
    let old = json!({"task_id":f.task,"text":CP});
    f.run(
        "PreToolUse",
        "mcp__shards__shards_task_append",
        old.clone(),
        "lateappend",
    );
    f.append(CP, "cp");
    let release = json!({"task_id":f.task});
    f.run(
        "PreToolUse",
        "mcp__shards__shards_task_release",
        release.clone(),
        "laterelease",
    );
    f.lifecycle("task_release", "release");
    f.claim("claim2");
    f.append(START, "start2");
    let before = f.receipt();
    f.post("task_append", old, "lateappend");
    f.post("task_release", release, "laterelease");
    assert_eq!(before, f.receipt());
}
#[test]
fn strict_claim_and_delegated_creation_validate_exact_arguments() {
    let f = Fixture::new();
    for args in [
        json!({"task_id":f.task}),
        json!({"task_id":f.task,"strict":1}),
        json!({"task_id":f.task,"strict":true,"claimer":null}),
        json!({"task_id":f.task,"strict":true,"claimer":"other"}),
    ] {
        assert_eq!(
            f.run(
                "PreToolUse",
                "mcp__shards__shards_task_claim",
                args,
                "claim"
            )
            .action,
            "deny"
        );
    }
    let mut event = f.event(
        "PreToolUse",
        "mcp__shards__shards_task_new",
        json!({"title":"child","parent":""}),
        "new",
    );
    event.agent_id = Some("child".into());
    assert_eq!(runtime::run_event(&event, &f.deps).action, "deny");
    event.tool_input = Some(json!({"title":"child","parent":f.task}));
    assert_eq!(runtime::run_event(&event, &f.deps).action, "allow");
}
#[test]
fn claude_plugin_descriptor_is_exact_and_parent_boundary_is_respected() {
    let f = Fixture::new();
    let mut event = f.event(
        "PreToolUse",
        "mcp__plugin_shards_shards__shards_task_get",
        json!({}),
        "read",
    );
    event.host = "claude".into();
    for server in [
        json!({"name":"plugin:shards:shards","source":"plugin"}),
        json!({"name":"plugin:shards:shards","source":"dynamic"}),
        json!({"name":"plugin:shards:shards","source":"plugin","extra":true}),
    ] {
        event.mcp_server = Some(server.clone());
        assert_eq!(
            runtime::run_event(&event, &f.deps).action,
            if server == json!({"name":"plugin:shards:shards","source":"plugin"}) {
                "allow"
            } else {
                "deny"
            }
        );
    }
    let child = f.project.join("child");
    fs::create_dir(&child).unwrap();
    fs::create_dir(child.join(".git")).unwrap();
    assert!(runtime::find_enrollment(&child).unwrap().is_none());
}
#[test]
fn append_failure_or_changed_text_never_creates_start_proof() {
    let f = Fixture::new();
    f.claim("claim");
    let args = json!({"task_id":f.task,"text":START});
    f.run(
        "PreToolUse",
        "mcp__shards__shards_task_append",
        args.clone(),
        "failed",
    );
    tasks::append(
        f.deps.reader.config().unwrap(),
        &f.task,
        START,
        AppendOpts::default(),
    )
    .unwrap();
    let mut event = f.event(
        "PostToolUseFailure",
        "mcp__shards__shards_task_append",
        args,
        "failed",
    );
    event.tool_error = Some(json!({"message":"failure"}));
    runtime::run_event(&event, &f.deps);
    assert_eq!(f.work("a").action, "deny");
    let other = json!({"task_id":f.task,"text":"Intent: changed.\nApproach: different."});
    f.post("task_append", other, "failed");
    assert_eq!(f.work("a").action, "deny");
}
#[test]
fn scratch_names_must_capture_real_session_and_bound_tags_are_limited() {
    let f = Fixture::new();
    assert_eq!(
        f.run(
            "PreToolUse",
            "mcp__shards__shards_scratch_set",
            json!({"name":"other"}),
            "scratch"
        )
        .action,
        "deny"
    );
    assert_eq!(
        f.run(
            "PreToolUse",
            "mcp__shards__shards_scratch_set",
            json!({"name":"session-s"}),
            "scratch"
        )
        .action,
        "allow"
    );
    f.claim("claim");
    assert_eq!(
        f.run(
            "PreToolUse",
            "mcp__shards__shards_task_update",
            json!({"task_id":f.task,"tags":"+needs-input"}),
            "tag"
        )
        .action,
        "allow"
    );
    assert_eq!(
        f.run(
            "PreToolUse",
            "mcp__shards__shards_task_update",
            json!({"task_id":f.task,"title":"change"}),
            "bad"
        )
        .action,
        "deny"
    );
    assert_eq!(f.work("a").action, "deny");
}
fn pad_receipt(f: &Fixture, count: usize, label: &str) {
    let current = f.receipt();
    state::update_receipt(
        &f.deps.state_root,
        &current.key,
        &|r| {
            let mut next = r.clone();
            for index in next.seen_event_ids.len()..count {
                next.seen_event_ids.push(format!("{label}-{index}"));
            }
            Ok(next)
        },
        &f.task,
        current.generation,
        None,
    )
    .unwrap();
}
#[test]
fn last_work_failed_checkpoint_and_old_callbacks_preserve_recovery() {
    let f = Fixture::new();
    f.start();
    pad_receipt(&f, 4093, "prior");
    assert_eq!(f.work("last").action, "allow");
    let before = f.receipt();
    assert_eq!(before.seen_event_ids.len(), 4094);
    assert_eq!(f.work("excess").action, "deny");
    let args = json!({"task_id":f.task,"text":CP});
    f.run(
        "PreToolUse",
        "mcp__shards__shards_task_append",
        args.clone(),
        "failed",
    );
    f.run(
        "PostToolUseFailure",
        "mcp__shards__shards_task_append",
        args.clone(),
        "failed",
    );
    assert_eq!(before, f.receipt());
    f.append(CP, "real");
    f.lifecycle("task_release", "release");
    f.claim("nextclaim");
    f.append(START, "nextstart");
    let next = f.receipt();
    f.post("task_append", args, "failed");
    assert_eq!(f.work("last").action, "deny");
    assert_eq!(next, f.receipt());
}
#[test]
fn same_generation_overlapping_callbacks_preserve_current_checkpoint_slot() {
    let f = Fixture::new();
    f.start();
    for (index, count) in [4096, 4094, 4096].into_iter().enumerate() {
        let generation = index + 1;
        if index > 0 {
            f.claim(&format!("claim-{generation}"));
            f.append(START, &format!("start-{generation}"));
        }
        assert_eq!(f.work(&format!("one-{generation}")).action, "allow");
        let mut pending = Vec::new();
        for number in 0..4 {
            let text = format!("{CP} stale-{generation}-{number}");
            let args = json!({"task_id":f.task,"text":text});
            let call = format!("delayed-{generation}-{number}");
            assert_eq!(
                f.run(
                    "PreToolUse",
                    "mcp__shards__shards_task_append",
                    args.clone(),
                    &call
                )
                .action,
                "allow"
            );
            tasks::append(
                f.deps.reader.config().unwrap(),
                &f.task,
                &text,
                AppendOpts::default(),
            )
            .unwrap();
            pending.push((args, call));
        }
        let prior = if index == 1 {
            f.work("intermediate");
            f.append(CP, "intermediatecp");
            2
        } else {
            0
        };
        assert_eq!(f.work(&format!("two-{generation}")).action, "allow");
        pad_receipt(&f, count, &format!("padding-{generation}"));
        let work = f.receipt().work_sequence;
        for (args, call) in pending.iter().chain(pending.iter()) {
            f.post("task_append", args.clone(), call);
            let receipt = f.receipt();
            assert_eq!(receipt.work_sequence, work);
            assert!(receipt.checkpoint_sequence <= prior.max(1));
            assert!(receipt.seen_event_ids.len() <= 4096);
        }
        f.append(CP, &format!("current-{generation}"));
        let clean = f.receipt();
        assert_eq!(clean.work_sequence, clean.checkpoint_sequence);
        for (args, call) in pending {
            f.post("task_append", args, &call);
        }
        assert_eq!(clean, f.receipt());
        f.lifecycle("task_release", &format!("release-{generation}"));
        assert!(f.receipt().retired);
    }
    f.claim("nextclaim");
    assert_eq!(f.receipt().generation, 4);
}
#[test]
fn legacy_full_receipt_can_checkpoint_release_finish_terminal_and_rebind() {
    let mut f = Fixture::new();
    f.start();
    for (index, outcome) in ["release", "finish", "observed"].into_iter().enumerate() {
        let generation = index + 1;
        if index > 0 {
            f.task = tasks::create(
                f.deps.reader.config().unwrap(),
                "Next",
                tasks::NewTask::default(),
            )
            .unwrap()
            .id;
            f.claim(&format!("claim-{generation}"));
            f.append(START, &format!("start-{generation}"));
        }
        f.work(&format!("work-{generation}"));
        pad_receipt(&f, 4096, &format!("legacy-{generation}"));
        let before = f.receipt();
        assert_eq!(f.work(&format!("over-{generation}")).action, "deny");
        assert_eq!(before, f.receipt());
        if outcome == "observed" {
            tasks::terminate(
                f.deps.reader.config().unwrap(),
                &f.task,
                tasks::Terminal::Finish,
                Some("external"),
                None,
            )
            .unwrap();
            f.append(
                &CP.replace("continuing", "handoff"),
                &format!("cp-{generation}"),
            );
        } else {
            let phase = if outcome == "finish" {
                "completed"
            } else {
                "continuing"
            };
            f.append(
                &CP.replace("continuing", phase),
                &format!("cp-{generation}"),
            );
            let clean = f.receipt();
            assert_eq!(
                f.run(
                    "PreToolUse",
                    "mcp__shards__shards_task_append",
                    json!({"task_id":f.task,"text":CP}),
                    &format!("extra-{generation}")
                )
                .action,
                "deny"
            );
            assert_eq!(clean, f.receipt());
            f.lifecycle(
                if outcome == "finish" {
                    "task_finish"
                } else {
                    "task_release"
                },
                &format!("end-{generation}"),
            );
        }
        assert!(f.receipt().retired);
        assert!(f.receipt().seen_event_ids.len() <= 4098);
    }
    f.task = tasks::create(
        f.deps.reader.config().unwrap(),
        "Final",
        tasks::NewTask::default(),
    )
    .unwrap()
    .id;
    f.claim("finalclaim");
    assert_eq!(f.receipt().generation, 4);
    assert_eq!(f.receipt().seen_event_ids.len(), 1);
}
#[test]
fn finish_rejects_clean_continuing_checkpoint() {
    let f = Fixture::new();
    f.start();
    f.work("a");
    f.append(CP, "cp");
    assert_eq!(
        f.run(
            "PreToolUse",
            "mcp__shards__shards_task_finish",
            json!({"task_id":f.task}),
            "finish"
        )
        .action,
        "deny"
    );
    assert_eq!(
        tasks::get(f.deps.reader.config().unwrap(), &f.task)
            .unwrap()
            .item
            .status,
        "claimed"
    );
}
