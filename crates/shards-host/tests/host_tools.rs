//! Every `host_*` tool against a throwaway vault. The vault and config are always passed
//! explicitly, so no test can touch a real `~/.shards` vault or follow `$SHARDS_VAULT`.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::path::{Path, PathBuf};

use serde_json::{json, Value};
use shards_host::{CallError, Host, HOST_TOOLS};

struct Vault {
    _dir: tempfile::TempDir,
    root: PathBuf,
    host: Host,
}

fn vault() -> Vault {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("vault");
    std::fs::create_dir_all(&root).unwrap();
    let root = std::fs::canonicalize(&root).unwrap();
    let cfg = dir.path().join("config.toml");
    std::fs::write(
        &cfg,
        format!(
            r##"[core]
vault_path = "{}"
agent = "lennard"
me = "lennard"

[tasks]
collections = ["lennard", "claude-code", "ops-agent", "maya"]

[[members]]
id = "lennard"
kind = "human"
name = "Lennard"
color = "#7c3aed"

[[members]]
id = "claude-code"
kind = "agent"
name = "Claude Code"
"##,
            root.display()
        ),
    )
    .unwrap();
    let host = Host::new(Some(cfg), Some(root.clone()));
    Vault {
        _dir: dir,
        root,
        host,
    }
}

impl Vault {
    fn ok(&self, tool: &str, args: Value) -> Value {
        match self.host.call(tool, &args) {
            Ok(v) => v,
            Err(e) => panic!("{tool} failed: {e:?}"),
        }
    }

    fn value(&self, tool: &str, args: Value) -> Value {
        self.ok(tool, args)["value"].clone()
    }

    /// The parsed core error envelope of a failing call.
    fn err(&self, tool: &str, args: Value) -> Value {
        match self.host.call(tool, &args) {
            Ok(v) => panic!("{tool} unexpectedly succeeded: {v}"),
            Err(CallError::Domain { message }) => serde_json::from_str(&message).unwrap(),
            Err(other) => panic!("{tool}: unexpected error kind {other:?}"),
        }
    }

    fn task(&self, title: &str, extra: Value) -> String {
        let mut args = json!({ "title": title });
        for (k, v) in extra.as_object().unwrap() {
            args[k] = v.clone();
        }
        self.value("shards_task_new", args)["id"]
            .as_str()
            .unwrap()
            .to_string()
    }

    fn abs(&self, rel: &str) -> PathBuf {
        self.root.join(rel)
    }
}

fn read(path: &Path) -> String {
    std::fs::read_to_string(path).unwrap()
}

#[test]
fn every_host_result_is_wrapped_like_the_agent_tools() {
    let v = vault();
    let health = v.ok("shards_health", json!({}));
    assert!(health.get("value").is_some() && health.get("list").is_some());
    let status = v.ok("host_status", json!({}));
    assert_eq!(status["list"], json!(false));
    let members = v.ok("host_members", json!({}));
    assert_eq!(members["list"], json!(true));
    assert_eq!(HOST_TOOLS.len(), 16);
}

#[test]
fn unknown_host_tool_is_a_domain_error() {
    let v = vault();
    let env = v.err("host_nope", json!({}));
    assert_eq!(env["message"], json!("unknown tool: 'host_nope'"));
}

#[test]
fn task_delete_returns_the_exact_bytes_and_restore_round_trips() {
    let v = vault();
    let id = v.task(
        "Ship it",
        json!({ "body": "see [[nothing]]", "priority": "urgent" }),
    );
    let path = v.abs(&format!("tasks/open/{id}.md"));
    let before = read(&path);

    let del = v.value("host_task_delete", json!({ "id": id }));
    assert_eq!(del["id"], json!(id));
    assert_eq!(del["path"], json!(format!("tasks/open/{id}.md")));
    assert_eq!(del["content"], json!(before));
    assert!(!path.exists());
    assert_eq!(
        v.err("shards_task_get", json!({ "id": id }))["kind"],
        json!("not_found")
    );

    let restored = v.value(
        "host_restore",
        json!({ "path": del["path"], "content": del["content"] }),
    );
    assert_eq!(restored["path"], del["path"]);
    assert_eq!(read(&path), before, "restore writes the same bytes back");
    let got = v.value("shards_task_get", json!({ "id": id }));
    assert_eq!(got["title"], json!("Ship it"));
}

#[test]
fn note_memory_and_scratch_deletes_round_trip() {
    let v = vault();
    let note = v.value(
        "shards_note_new",
        json!({ "title": "Design doc", "body": "hello" }),
    );
    let nid = note["id"].as_str().unwrap().to_string();
    let del = v.value("host_note_delete", json!({ "id": nid }));
    assert_eq!(del["id"], json!(nid));
    assert!(del["content"].as_str().unwrap().contains("hello"));
    v.value(
        "host_restore",
        json!({ "path": del["path"], "content": del["content"] }),
    );
    assert_eq!(
        v.value("shards_note_get", json!({ "id": nid }))["body"],
        json!("hello")
    );

    let mem = v.value(
        "shards_memory_new",
        json!({ "title": "Prefers dark mode", "body": "always", "owner": "claude-code" }),
    );
    let mid = mem["id"].as_str().unwrap().to_string();
    let del = v.value("host_memory_forget", json!({ "id": mid }));
    assert_eq!(del["id"], json!(mid));
    assert!(del["path"].as_str().unwrap().starts_with("memories/"));
    v.value(
        "host_restore",
        json!({ "path": del["path"], "content": del["content"] }),
    );
    assert_eq!(
        v.value("shards_memory_get", json!({ "target": mid }))["id"],
        json!(mid)
    );

    v.value(
        "shards_scratch_set",
        json!({ "name": "Plan", "body": "step 1", "agent": "ops-agent" }),
    );
    let del = v.value(
        "host_scratch_clear",
        json!({ "name": "Plan", "agent": "ops-agent" }),
    );
    assert_eq!(del["id"], json!("plan"));
    assert_eq!(del["agent"], json!("ops-agent"));
    assert_eq!(del["path"], json!("scratch/ops-agent/plan.md"));
    assert!(!v.abs("scratch/ops-agent/plan.md").exists());
    v.value(
        "host_restore",
        json!({ "path": del["path"], "content": del["content"] }),
    );
    let back = v.value(
        "shards_scratch_get",
        json!({ "name": "plan", "agent": "ops-agent" }),
    );
    assert_eq!(back["body"], json!("step 1"));
}

#[test]
fn scratch_clear_defaults_to_me() {
    let v = vault();
    v.value(
        "shards_scratch_set",
        json!({ "name": "mine", "body": "x", "agent": "lennard" }),
    );
    let del = v.value("host_scratch_clear", json!({ "name": "mine" }));
    assert_eq!(del["agent"], json!("lennard"));
    assert_eq!(del["path"], json!("scratch/lennard/mine.md"));
}

#[test]
fn delete_of_a_missing_entity_is_not_found() {
    let v = vault();
    assert_eq!(
        v.err("host_task_delete", json!({ "id": "t-NOPE" }))["kind"],
        json!("not_found")
    );
    assert_eq!(
        v.err("host_note_delete", json!({ "id": "n-NOPE" }))["kind"],
        json!("not_found")
    );
    assert_eq!(
        v.err("host_task_delete", json!({}))["kind"],
        json!("validation")
    );
}

#[test]
fn restore_refuses_to_overwrite() {
    let v = vault();
    let id = v.task("Keep me", json!({}));
    let rel = format!("tasks/open/{id}.md");
    let before = read(&v.abs(&rel));
    let env = v.err(
        "host_restore",
        json!({ "path": rel, "content": format!("---\nid: {id}\n---\n") }),
    );
    assert_eq!(env["kind"], json!("validation"));
    assert!(env["message"]
        .as_str()
        .unwrap()
        .starts_with("refusing to overwrite"));
    assert_eq!(read(&v.abs(&rel)), before);
}

#[test]
fn restore_refuses_every_path_escape() {
    let v = vault();
    let outside = v.root.parent().unwrap().join("escaped.md");
    for bad in [
        "../escaped.md".to_string(),
        "tasks/../../escaped.md".to_string(),
        outside.display().to_string(),
        "/etc/shards-escape.md".to_string(),
        "tasks/open/.hidden.md".to_string(),
        "tasks/.locks/t-X.md".to_string(),
        "./tasks/open/t-X.md".to_string(),
        "outside-any-space.md".to_string(),
    ] {
        let env = v.err("host_restore", json!({ "path": bad, "content": "x" }));
        assert_eq!(env["kind"], json!("validation"), "{bad}: {env}");
    }
    assert!(!outside.exists());
    let env = v.err(
        "host_restore",
        json!({ "path": "notes/x.txt", "content": "x" }),
    );
    assert!(env["message"].as_str().unwrap().contains("Markdown"));
    assert_eq!(
        v.err("host_restore", json!({ "path": "notes/x.md" }))["kind"],
        json!("validation")
    );
}

#[test]
fn restore_only_accepts_a_path_a_delete_can_return() {
    let v = vault();
    let task = |id: &str| format!("---\nid: {id}\ntype: task\ntitle: Lost\nstatus: open\n---\n");
    let refused = [
        // The tasks root itself: the open/done walk never sees it, so the task would vanish.
        ("tasks/t-LOST.md", task("t-LOST")),
        ("tasks/open/sub/t-DEEP.md", task("t-DEEP")),
        ("tasks/archive/t-ARCH.md", task("t-ARCH")),
        ("tasks/open/notes.md", task("t-NOTE")),
        // The frontmatter id must name the file.
        ("tasks/open/t-AAA.md", task("t-BBB")),
        (
            "tasks/open/t-NOID.md",
            "---\ntitle: no id\n---\n".to_string(),
        ),
        ("memories/readme.md", "---\ntitle: plain\n---\n".to_string()),
        ("memories/m-ONE.md", "---\nid: m-TWO\n---\n".to_string()),
        ("notes/readme.md", "# plain markdown\n".to_string()),
        ("notes/n-ONE.md", "---\nid: n-TWO\n---\n".to_string()),
        ("scratch/loose.md", "x".to_string()),
        ("scratch/ops-agent/deep/plan.md", "x".to_string()),
        ("assets/a-123.md", "x".to_string()),
    ];
    for (path, content) in &refused {
        let env = v.err("host_restore", json!({ "path": path, "content": content }));
        assert_eq!(env["kind"], json!("validation"), "{path}: {env}");
        assert!(!v.abs(path).exists(), "{path} must not be written");
    }

    let accepted = [
        ("tasks/open/t-OK1.md", task("t-OK1")),
        ("tasks/done/t-OK2.md", task("t-OK2")),
        (
            "memories/m-OK3.md",
            "---\nid: m-OK3\ntitle: x\n---\n".to_string(),
        ),
        (
            "notes/projects/foreign-stem.md",
            "---\nid: n-OK4\ntype: note\ntitle: Adopted\n---\n".to_string(),
        ),
        ("notes/n-OK5.md", "---\nid: n-OK5\n---\n".to_string()),
        ("scratch/ops-agent/plan.md", "step 1".to_string()),
    ];
    for (path, content) in &accepted {
        v.value("host_restore", json!({ "path": path, "content": content }));
        assert_eq!(&read(&v.abs(path)), content, "{path}");
    }
}

#[cfg(unix)]
#[test]
fn restore_never_writes_through_a_symlink() {
    let v = vault();
    let outside = v.root.parent().unwrap().join("outside");
    std::fs::create_dir_all(&outside).unwrap();
    std::fs::create_dir_all(v.abs("notes")).unwrap();

    // A symlinked directory inside a space that points out of the vault.
    std::os::unix::fs::symlink(&outside, v.abs("notes/linked")).unwrap();
    let env = v.err(
        "host_restore",
        json!({ "path": "notes/linked/n-SYM.md", "content": "---\nid: n-SYM\n---\n" }),
    );
    assert_eq!(env["kind"], json!("validation"), "{env}");

    // A dangling symlink whose target is outside the vault.
    let target = outside.join("n-DANGLE.md");
    std::os::unix::fs::symlink(&target, v.abs("notes/n-DANGLE.md")).unwrap();
    let env = v.err(
        "host_restore",
        json!({ "path": "notes/n-DANGLE.md", "content": "---\nid: n-DANGLE\n---\n" }),
    );
    assert_eq!(env["kind"], json!("validation"), "{env}");

    // A dangling symlink whose target is inside the vault is refused too: no clobber.
    std::os::unix::fs::symlink(v.abs("notes/n-REAL.md"), v.abs("notes/n-INLINK.md")).unwrap();
    let env = v.err(
        "host_restore",
        json!({ "path": "notes/n-INLINK.md", "content": "---\nid: n-INLINK\n---\n" }),
    );
    assert_eq!(env["kind"], json!("validation"), "{env}");
    assert!(!v.abs("notes/n-REAL.md").exists());

    assert_eq!(
        std::fs::read_dir(&outside).unwrap().count(),
        0,
        "nothing may be written outside the vault"
    );
}

#[test]
fn agent_mcp_never_dispatches_a_host_tool() {
    let v = vault();
    let dir = tempfile::tempdir().unwrap();
    let cfg = dir.path().join("config.toml");
    std::fs::write(
        &cfg,
        format!("[core]\nvault_path = \"{}\"\n", v.root.display()),
    )
    .unwrap();
    let server = shards::mcp::tools::Server::new(Some(cfg), Some(v.root.clone()));
    let id = v.task("Do not delete me", json!({}));
    for tool in HOST_TOOLS {
        assert!(
            shards::mcp::schema::find(tool).is_none(),
            "{tool} is in the agent schema"
        );
        let args = json!({
            "id": id, "path": "notes/n-MCP.md", "content": "---\nid: n-MCP\n---\n",
            "name": "x", "body": "x",
        });
        let err = server.call(tool, &args).unwrap_err();
        let env: Value = serde_json::from_str(&shards::mcp::tool_error(&err)).unwrap();
        assert!(
            env["message"].as_str().unwrap().contains("unknown tool"),
            "{tool}: {env}"
        );
    }
    assert!(v.abs(&format!("tasks/open/{id}.md")).exists());
    assert!(!v.abs("notes/n-MCP.md").exists());
}

#[test]
fn restore_accepts_an_absolute_path_inside_a_space() {
    let v = vault();
    let target = v.abs("notes/n-ABS1.md");
    v.value(
        "host_restore",
        json!({ "path": target.display().to_string(), "content": "---\nid: n-ABS1\ntype: note\ntitle: Abs\n---\n" }),
    );
    assert!(target.exists());
}

#[test]
fn set_body_keeps_frontmatter_and_bumps_updated() {
    let v = vault();
    let id = v.task(
        "Body edit",
        json!({ "body": "old", "due": "2026-10-20", "section": "Now", "priority": "high" }),
    );
    let before = v.value("shards_task_get", json!({ "id": id }));
    std::thread::sleep(std::time::Duration::from_millis(5));
    let out = v.value(
        "host_task_set_body",
        json!({ "id": id, "body": "new body\n\n- [ ] step" }),
    );
    assert_eq!(out["id"], json!(id));
    let after = v.value("shards_task_get", json!({ "id": id }));
    assert_eq!(after["body"], json!("new body\n\n- [ ] step"));
    assert_eq!(out["updated"], after["updated"]);
    assert_ne!(after["updated"], before["updated"]);
    for key in [
        "title", "due", "section", "priority", "status", "owner", "created",
    ] {
        assert_eq!(after[key], before[key], "{key} survives a body edit");
    }

    // An identical body is a byte-for-byte no-op.
    let path = v.abs(&format!("tasks/open/{id}.md"));
    let bytes = read(&path);
    v.value(
        "host_task_set_body",
        json!({ "id": id, "body": "new body\n\n- [ ] step" }),
    );
    assert_eq!(read(&path), bytes);

    // Clearing a body is a real edit.
    v.value("host_task_set_body", json!({ "id": id, "body": "" }));
    assert_eq!(
        v.value("shards_task_get", json!({ "id": id }))["body"],
        json!("")
    );
}

#[test]
fn note_and_memory_set_body() {
    let v = vault();
    let target = v.value("shards_note_new", json!({ "title": "Target note" }));
    let note = v.value(
        "shards_note_new",
        json!({ "title": "Linker", "body": "x", "tags": ["a"] }),
    );
    let nid = note["id"].as_str().unwrap();
    v.value(
        "host_note_set_body",
        json!({ "id": nid, "body": "links [[Target note]]" }),
    );
    let got = v.value("shards_note_get", json!({ "id": nid }));
    assert_eq!(got["body"], json!("links [[Target note]]"));
    assert_eq!(got["tags"], json!(["a"]));
    assert_eq!(
        got["related"],
        json!([target["id"]]),
        "wikilinks re-resolve"
    );

    let mem = v.value(
        "shards_memory_new",
        json!({ "title": "M", "body": "x", "importance": 5, "kind": "insight" }),
    );
    let mid = mem["id"].as_str().unwrap();
    v.value(
        "host_memory_set_body",
        json!({ "id": mid, "body": "rewritten" }),
    );
    let got = v.value("shards_memory_get", json!({ "target": mid }));
    assert_eq!(got["body"], json!("rewritten"));
    assert_eq!(got["importance"], json!(5));
    assert_eq!(got["kind"], json!("insight"));
    // The DECISIONS.md alias answers too.
    v.value(
        "host_memory_update_body",
        json!({ "id": mid, "body": "again" }),
    );
    assert_eq!(
        v.value("shards_memory_get", json!({ "target": mid }))["body"],
        json!("again")
    );
    assert_eq!(
        v.err("host_memory_set_body", json!({ "id": mid }))["kind"],
        json!("validation")
    );
}

#[test]
fn status_shape() {
    let v = vault();
    v.task("One", json!({}));
    v.value("shards_note_new", json!({ "title": "N" }));
    let s = v.value("host_status", json!({}));
    assert_eq!(s["vault"], json!(v.root.display().to_string()));
    assert_eq!(s["me"], json!("lennard"));
    assert!(s["config_path"].as_str().unwrap().ends_with("config.toml"));
    assert!(s["version"].as_str().is_some());
    assert_eq!(s["counts"]["tasks"], json!(1));
    assert_eq!(s["counts"]["notes"], json!(1));
    assert_eq!(s["counts"]["memories"], json!(0));
    for space in ["notes", "tasks", "memories", "scratch", "assets"] {
        assert!(s["spaces"][space].as_str().is_some(), "{space} root");
    }
}

#[test]
fn members_shape_merges_config_roster_and_vault() {
    let v = vault();
    let t = v.task("Agent work", json!({ "owner": "maya" }));
    v.value(
        "shards_task_claim",
        json!({ "task_id": t, "claimer": "ops-agent" }),
    );
    v.value(
        "shards_memory_new",
        json!({ "title": "Learned", "body": "x", "owner": "claude-code" }),
    );
    v.value(
        "shards_scratch_set",
        json!({ "name": "n", "body": "x", "agent": "ops-agent" }),
    );
    let members = v.value("host_members", json!({}));
    let rows = members.as_array().unwrap();
    let ids: Vec<&str> = rows.iter().map(|m| m["id"].as_str().unwrap()).collect();
    assert_eq!(ids, ["lennard", "claude-code", "ops-agent", "maya"]);
    let by = |id: &str| rows.iter().find(|m| m["id"] == json!(id)).unwrap().clone();
    assert_eq!(
        by("lennard"),
        json!({"id": "lennard", "kind": "human", "name": "Lennard", "color": "#7c3aed"})
    );
    assert_eq!(by("claude-code")["kind"], json!("agent"));
    assert_eq!(by("claude-code")["name"], json!("Claude Code"));
    assert_eq!(by("ops-agent")["kind"], json!("agent"));
    assert_eq!(by("maya")["kind"], json!("human"));
    assert_eq!(by("maya")["color"], json!(null));
}

#[test]
fn projects_shape_counts_and_orders_sections() {
    let v = vault();
    let p = v.value(
        "shards_note_new",
        json!({ "title": "Shards Launch", "note_type": "project" }),
    );
    let pid = p["id"].as_str().unwrap().to_string();
    v.task(
        "a",
        json!({ "project": pid, "section": "Later", "order": 3.0 }),
    );
    v.task(
        "b",
        json!({ "project": pid, "section": "Now", "order": 1.0 }),
    );
    v.task(
        "c",
        json!({ "project": pid, "section": "Next", "order": 2.0 }),
    );
    let done = v.task("d", json!({ "project": pid, "section": "Now" }));
    v.value("shards_task_finish", json!({ "task_id": done }));
    v.task("e", json!({ "project": "n-GHOST" }));
    v.task("inbox", json!({}));

    let projects = v.value("host_projects", json!({}));
    let rows = projects.as_array().unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!(
        rows[0],
        json!({
            "id": pid,
            "title": "Shards Launch",
            "slug": "shards-launch",
            "color": null,
            "sections": ["Now", "Next", "Later"],
            "stored_sections": [],
            "open_count": 3,
            "archived": false,
        })
    );
    assert_eq!(rows[1]["id"], json!("n-GHOST"));
    assert_eq!(rows[1]["title"], json!("n-GHOST"));
    assert_eq!(rows[1]["open_count"], json!(1));
    assert_eq!(rows[1]["sections"], json!([]));
}

#[test]
fn dashboard_is_an_object_with_the_four_panes() {
    let v = vault();
    let t = v.task("Ready one", json!({}));
    let d = v.value("host_dashboard", json!({}));
    for key in ["agents", "tasks", "activity", "health"] {
        assert!(d.get(key).is_some(), "{key}");
    }
    let ready: Vec<&str> = d["tasks"]["ready"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| r["id"].as_str().unwrap())
        .collect();
    assert!(ready.contains(&t.as_str()));
}

#[test]
fn a_missing_config_is_a_per_call_error_not_a_panic() {
    let dir = tempfile::tempdir().unwrap();
    let host = Host::new(Some(dir.path().join("nope.toml")), None);
    for tool in HOST_TOOLS {
        match host.call(
            tool,
            &json!({ "id": "t-X", "name": "x", "path": "x.md", "content": "", "body": "" }),
        ) {
            Err(CallError::Domain { message }) => {
                let env: Value = serde_json::from_str(&message).unwrap();
                assert!(env["kind"].as_str().is_some(), "{tool}: {env}");
            }
            other => panic!("{tool}: expected a domain error, got {other:?}"),
        }
    }
}

// ---------------------------------------------------------------------------------------
// host_project_update
// ---------------------------------------------------------------------------------------

fn project(v: &Vault, title: &str) -> String {
    v.value(
        "shards_note_new",
        json!({ "title": title, "note_type": "project" }),
    )["id"]
        .as_str()
        .unwrap()
        .to_string()
}

fn project_row(v: &Vault, id: &str) -> Value {
    v.value("host_projects", json!({}))
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["id"] == json!(id))
        .cloned()
        .unwrap()
}

#[test]
fn project_update_probe_is_a_missing_id_error_and_writes_nothing() {
    let v = vault();
    let pid = project(&v, "P");
    let before = read(&v.root.join(format!("notes/projects/{pid}.md")));
    let env = v.err("host_project_update", json!({}));
    let message = env["message"].as_str().unwrap();
    assert!(message.contains("id"), "{message}");
    assert!(!message.contains("unknown tool"), "{message}");
    assert_eq!(
        read(&v.root.join(format!("notes/projects/{pid}.md"))),
        before
    );
}

#[test]
fn project_update_sets_title_color_archived_and_sections_in_frontmatter() {
    let v = vault();
    let pid = project(&v, "Launch");
    v.task("t", json!({ "project": pid, "section": "Build" }));
    let row = v.value(
        "host_project_update",
        json!({ "id": pid, "title": "Launch 2", "color": "Teal", "archived": true,
                "sections": ["Plan", " Build ", "Plan", "Ship"] }),
    );
    assert_eq!(row["title"], json!("Launch 2"));
    assert_eq!(row["color"], json!("teal"));
    assert_eq!(row["archived"], json!(true));
    assert_eq!(row["sections"], json!(["Plan", "Build", "Ship"]));
    assert_eq!(row["renamed_tasks"], json!([]));
    let text = read(&v.root.join(format!("notes/projects/{pid}.md")));
    assert!(text.contains("title: Launch 2"), "{text}");
    assert!(text.contains("color: teal"), "{text}");
    assert!(text.contains("archived: true"), "{text}");
    assert!(text.contains("sections:"), "{text}");
    // host_projects reads the same back; an empty stored section survives.
    assert_eq!(
        project_row(&v, &pid)["sections"],
        json!(["Plan", "Build", "Ship"])
    );

    // Unarchive and clear the color remove the keys.
    let row = v.value(
        "host_project_update",
        json!({ "id": pid, "archived": false, "color": "" }),
    );
    assert_eq!(row["archived"], json!(false));
    assert_eq!(row["color"], json!(null));
    let text = read(&v.root.join(format!("notes/projects/{pid}.md")));
    assert!(
        !text.contains("archived:") && !text.contains("color:"),
        "{text}"
    );
}

#[test]
fn project_update_stored_order_wins_and_task_only_sections_follow() {
    let v = vault();
    let pid = project(&v, "P");
    v.task(
        "a",
        json!({ "project": pid, "section": "Zeta", "order": 1.0 }),
    );
    v.task(
        "b",
        json!({ "project": pid, "section": "Alpha", "order": 2.0 }),
    );
    v.value(
        "host_project_update",
        json!({ "id": pid, "sections": ["Alpha", "Empty"] }),
    );
    assert_eq!(
        project_row(&v, &pid)["sections"],
        json!(["Alpha", "Empty", "Zeta"])
    );
    // The stored part alone, so the app can tell a pinned order from a derived one.
    assert_eq!(
        project_row(&v, &pid)["stored_sections"],
        json!(["Alpha", "Empty"])
    );
}

#[test]
fn project_update_renames_a_section_on_every_task_of_the_project_only() {
    let v = vault();
    let pid = project(&v, "P");
    let other = project(&v, "Other");
    let a = v.task(
        "a",
        json!({ "project": pid, "section": "Doing", "order": 1.0 }),
    );
    let b = v.task(
        "b",
        json!({ "project": pid, "section": "Later", "order": 2.0 }),
    );
    let done = v.task("c", json!({ "project": pid, "section": "Doing" }));
    v.value("shards_task_finish", json!({ "task_id": done }));
    let foreign = v.task("d", json!({ "project": other, "section": "Doing" }));

    let row = v.value(
        "host_project_update",
        json!({ "id": pid, "renames": { "Doing": "In progress" } }),
    );
    let mut renamed: Vec<String> = row["renamed_tasks"]
        .as_array()
        .unwrap()
        .iter()
        .map(|x| x.as_str().unwrap().to_string())
        .collect();
    renamed.sort();
    let mut want = vec![a.clone(), done.clone()];
    want.sort();
    assert_eq!(renamed, want);
    // No stored list existed: the current order is stored with the rename applied.
    assert_eq!(row["sections"], json!(["In progress", "Later"]));
    let section = |id: &str| v.value("shards_task_get", json!({ "id": id }))["section"].clone();
    assert_eq!(section(&a), json!("In progress"));
    assert_eq!(section(&done), json!("In progress"));
    assert_eq!(section(&b), json!("Later"));
    assert_eq!(section(&foreign), json!("Doing"));

    // Renaming to "" removes the section: tasks lose it, the stored list drops it.
    let row = v.value(
        "host_project_update",
        json!({ "id": pid, "renames": { "Later": "" } }),
    );
    assert_eq!(row["renamed_tasks"], json!([b]));
    assert_eq!(row["sections"], json!(["In progress"]));
    assert_eq!(section(&b), json!(null));
}

#[test]
fn project_update_validates_everything_before_writing() {
    let v = vault();
    let pid = project(&v, "P");
    let note = v.value("shards_note_new", json!({ "title": "Plain" }))["id"]
        .as_str()
        .unwrap()
        .to_string();
    let path = v.root.join(format!("notes/projects/{pid}.md"));
    let before = read(&path);
    for bad in [
        json!({ "id": pid, "color": "chartreuse-ish" }),
        json!({ "id": pid, "color": "#12345" }),
        json!({ "id": pid, "title": "   " }),
        json!({ "id": pid, "archived": "yes" }),
        json!({ "id": pid, "sections": "A" }),
        json!({ "id": pid, "sections": ["ok", "bad\nname"] }),
        json!({ "id": pid, "renames": { "A": 1 } }),
        json!({ "id": pid, "title": "New", "color": "nope" }),
    ] {
        v.err("host_project_update", bad);
    }
    assert_eq!(read(&path), before);
    let env = v.err("host_project_update", json!({ "id": note, "title": "X" }));
    assert!(env["message"].as_str().unwrap().contains("not a project"));
    v.err(
        "host_project_update",
        json!({ "id": "n-NOPE", "title": "X" }),
    );
    // Hex colors pass.
    let row = v.value(
        "host_project_update",
        json!({ "id": pid, "color": "#0EA5E9" }),
    );
    assert_eq!(row["color"], json!("#0ea5e9"));
}

// ---------------------------------------------------------------------------------------
// shards_scratch_list scope (regression: `{}` returned [] while the app listed 4 pads)
// ---------------------------------------------------------------------------------------

/// Root cause: `{}` lists only the acting identity's own namespace (`[core].me` in the app,
/// `$SHARDS_AGENT` / `[core].agent` over MCP). The human `lennard` owns no scratch, so `[]`
/// is that namespace, not a lost read; the app lists `all_agents: true`. The tool
/// description now says so; this pins all three scopes.
#[test]
fn scratch_list_defaults_to_the_acting_identity_and_all_agents_lists_every_pad() {
    let v = vault();
    for (agent, name) in [
        ("claude-code", "pr-checklist"),
        ("claude-code", "current-session"),
        ("ops-agent", "key-rotation"),
        ("ops-agent", "scrape-run"),
    ] {
        v.value(
            "shards_scratch_set",
            json!({ "agent": agent, "name": name, "body": "x" }),
        );
    }
    let names = |value: Value| -> Vec<String> {
        let mut out: Vec<String> = value
            .as_array()
            .unwrap()
            .iter()
            .map(|r| {
                format!(
                    "{}/{}",
                    r["agent"].as_str().unwrap(),
                    r["name"].as_str().unwrap()
                )
            })
            .collect();
        out.sort();
        out
    };
    // The acting identity (lennard) has no pads.
    assert_eq!(
        names(v.value("shards_scratch_list", json!({}))),
        Vec::<String>::new()
    );
    assert_eq!(
        names(v.value("shards_scratch_list", json!({ "agent": "claude-code" }))),
        ["claude-code/current-session", "claude-code/pr-checklist"]
    );
    assert_eq!(
        names(v.value("shards_scratch_list", json!({ "all_agents": true }))).len(),
        4
    );
    // `host_status` counts the same 4 the app shows.
    assert_eq!(
        v.value("host_status", json!({}))["counts"]["scratch"],
        json!(4)
    );
}

// ---------------------------------------------------------------------------------------
// notes browser (desktop-app/32) and Obsidian detection (desktop-app/33)
// ---------------------------------------------------------------------------------------

fn notes_root(v: &Vault) -> PathBuf {
    let s = v.value("host_status", json!({}));
    PathBuf::from(s["spaces"]["notes"].as_str().unwrap())
}

#[test]
fn notes_browse_lists_shards_and_foreign_files_and_skips_other_spaces() {
    let v = vault();
    let note = v.value("shards_note_new", json!({ "title": "Release plan" }));
    let note_id = note["id"].as_str().unwrap().to_string();
    v.task("A task", json!({}));
    let root = notes_root(&v);
    std::fs::create_dir_all(root.join("Daily")).unwrap();
    std::fs::write(
        root.join("Daily/2026-10-14 standup.md"),
        "# Standup\n\nSee [[Release plan]].\n",
    )
    .unwrap();
    std::fs::write(
        root.join("Plain.md"),
        "---\ntitle: Plain title\ntags: [alpha, beta]\n---\n\nBody text\n",
    )
    .unwrap();
    std::fs::create_dir_all(root.join(".obsidian")).unwrap();
    std::fs::write(root.join(".obsidian/hidden.md"), "# hidden\n").unwrap();
    std::fs::create_dir_all(root.join("scripts/node_modules/glob")).unwrap();
    std::fs::write(root.join("scripts/node_modules/glob/README.md"), "# glob\n").unwrap();

    let out = v.ok("host_notes_browse", json!({}));
    assert_eq!(out["list"], json!(true));
    let rows = out["value"].as_array().unwrap();
    let titles: Vec<&str> = rows.iter().map(|r| r["title"].as_str().unwrap()).collect();
    assert_eq!(rows.len(), 3, "titles: {titles:?}");
    assert!(titles.contains(&"Release plan"));
    assert!(
        titles.contains(&"2026-10-14 standup"),
        "a foreign file is titled by its stem"
    );
    assert!(titles.contains(&"Plain title"), "frontmatter title wins");

    let shards = rows.iter().find(|r| r["title"] == "Release plan").unwrap();
    assert_eq!(shards["id"], json!(note_id));
    let daily = rows
        .iter()
        .find(|r| r["title"] == "2026-10-14 standup")
        .unwrap();
    assert_eq!(daily["id"], Value::Null);
    assert_eq!(daily["folder"], json!("Daily"));
    let abs = daily["abs_path"].as_str().unwrap();
    assert!(Path::new(abs).is_absolute() && abs.ends_with("Daily/2026-10-14 standup.md"));
    assert!(daily["modified"].as_str().unwrap().ends_with('Z'));
    let plain = rows.iter().find(|r| r["title"] == "Plain title").unwrap();
    assert_eq!(plain["tags"], json!(["alpha", "beta"]));
    assert_eq!(plain["folder"], json!(""));
}

#[test]
fn notes_browse_is_newest_first() {
    let v = vault();
    let root = notes_root(&v);
    std::fs::create_dir_all(&root).unwrap();
    std::fs::write(root.join("old.md"), "old\n").unwrap();
    std::fs::write(root.join("new.md"), "new\n").unwrap();
    let past = std::time::SystemTime::now() - std::time::Duration::from_secs(3600);
    std::fs::File::options()
        .write(true)
        .open(root.join("old.md"))
        .unwrap()
        .set_modified(past)
        .unwrap();
    let rows = v.value("host_notes_browse", json!({}));
    let titles: Vec<&str> = rows
        .as_array()
        .unwrap()
        .iter()
        .map(|r| r["title"].as_str().unwrap())
        .collect();
    assert_eq!(titles, ["new", "old"]);
}

#[test]
fn note_read_returns_body_for_any_listed_file() {
    let v = vault();
    let root = notes_root(&v);
    std::fs::create_dir_all(root.join("Daily")).unwrap();
    std::fs::write(
        root.join("Daily/log.md"),
        "---\ntags: [x]\n---\n\n# Log\n\nhello\n",
    )
    .unwrap();
    let rows = v.value("host_notes_browse", json!({}));
    let path = rows[0]["path"].as_str().unwrap().to_string();
    let read = v.value("host_note_read", json!({ "path": path }));
    assert_eq!(read["title"], json!("log"));
    assert_eq!(read["tags"], json!(["x"]));
    assert!(read["body"].as_str().unwrap().contains("hello"));
    assert!(!read["body"].as_str().unwrap().contains("tags:"));
    // Absolute form resolves too.
    let abs = rows[0]["abs_path"].as_str().unwrap().to_string();
    assert_eq!(
        v.value("host_note_read", json!({ "path": abs }))["path"],
        json!(path)
    );
}

#[test]
fn note_read_refuses_anything_the_browser_does_not_list() {
    let v = vault();
    let task = v.task("Secret task", json!({}));
    let task_path = v.value("shards_task_get", json!({ "id": task }))["path"]
        .as_str()
        .unwrap()
        .to_string();
    let root = notes_root(&v);
    std::fs::create_dir_all(root.join(".obsidian")).unwrap();
    std::fs::write(root.join(".obsidian/x.md"), "x\n").unwrap();
    std::fs::write(v.root.parent().unwrap().join("outside.md"), "x\n").unwrap();
    for bad in [
        task_path.as_str(),
        ".obsidian/x.md",
        "../outside.md",
        "missing.md",
        "",
    ] {
        let e = v.err("host_note_read", json!({ "path": bad }));
        assert!(
            e["kind"] == "not_found" || e["kind"] == "validation",
            "{bad}: {e}"
        );
    }
}

#[test]
fn status_reports_the_obsidian_vault_at_or_above_the_vault() {
    let v = vault();
    assert_eq!(
        v.value("host_status", json!({}))["obsidian_vault"],
        Value::Null
    );
    let parent = v.root.parent().unwrap().to_path_buf();
    std::fs::create_dir_all(parent.join(".obsidian")).unwrap();
    assert_eq!(
        v.value("host_status", json!({}))["obsidian_vault"],
        json!(parent.display().to_string())
    );
    std::fs::create_dir_all(v.root.join(".obsidian")).unwrap();
    assert_eq!(
        v.value("host_status", json!({}))["obsidian_vault"],
        json!(v.root.display().to_string())
    );
}
