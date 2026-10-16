//! The app acts as the configured human `[core].me`, never as `[core].agent` / `$SHARDS_AGENT`.
//!
//! `adopt_configured_identity` sets a process-wide env var, so this file is its own test binary
//! and holds exactly one test: no other test can observe the variable.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use serde_json::{json, Value};
use shards_host::{adopt_configured_identity, Host};

fn call(host: &Host, tool: &str, args: Value) -> Value {
    match host.call(tool, &args) {
        Ok(v) => v["value"].clone(),
        Err(e) => panic!("{tool} failed: {e:?}"),
    }
}

#[test]
fn every_core_write_is_stamped_with_me_not_the_agent() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("vault");
    std::fs::create_dir_all(&root).unwrap();
    let root = std::fs::canonicalize(&root).unwrap();
    let cfg = dir.path().join("config.toml");
    std::fs::write(
        &cfg,
        format!(
            "[core]\nvault_path = \"{}\"\nagent = \"claude-agent\"\nme = \"lennard\"\n\n\
             [tasks]\ncollections = [\"lennard\", \"claude-agent\"]\n",
            root.display()
        ),
    )
    .unwrap();

    // A harness may export an agent identity; the app must still act as `me`.
    std::env::set_var("SHARDS_AGENT", "claude-agent");
    assert_eq!(
        adopt_configured_identity(Some(&cfg)).as_deref(),
        Some("lennard")
    );
    let host = Host::new(Some(cfg.clone()), Some(root.clone()));

    let task = call(&host, "shards_task_new", json!({ "title": "Book flights" }));
    assert_eq!(task["owner"], "lennard", "new task owner: {task}");
    let id = task["id"].as_str().unwrap().to_string();

    let claimed = call(&host, "shards_task_claim", json!({ "task_id": id }));
    assert_eq!(claimed["claimed_by"], "lennard", "claim: {claimed}");

    call(
        &host,
        "shards_task_finish",
        json!({ "task_id": id, "outcome": "Booked." }),
    );
    let done = std::fs::read_to_string(root.join("tasks/done").join(format!("{id}.md"))).unwrap();
    assert!(
        done.contains("lennard") && !done.contains("claude-agent"),
        "the outcome must be stamped by me:\n{done}"
    );

    // No `me` configured: the agent identity stays in charge and the env is not touched.
    let bare = dir.path().join("bare.toml");
    std::fs::write(
        &bare,
        format!("[core]\nvault_path = \"{}\"\n", root.display()),
    )
    .unwrap();
    assert_eq!(adopt_configured_identity(Some(&bare)), None);
    assert_eq!(std::env::var("SHARDS_AGENT").unwrap(), "lennard");
}
