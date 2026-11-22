//! #111 through the real binary: one managed checkbox line per task file, editable in any
//! Markdown editor and in Obsidian Tasks, and the same task in the CLI, MCP and on disk.

mod common;

use common::VaultFixture;
use serde_json::{json, Value as Json};

// ---------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------

fn run(f: &VaultFixture, args: &[&str]) -> (String, String, i32) {
    let out = f.cmd().args(args).output().expect("run shards");
    (
        String::from_utf8_lossy(&out.stdout).into_owned(),
        String::from_utf8_lossy(&out.stderr).into_owned(),
        out.status.code().unwrap_or(-1),
    )
}

fn ok(f: &VaultFixture, args: &[&str]) -> String {
    let (stdout, stderr, code) = run(f, args);
    assert_eq!(code, 0, "args={args:?} stderr={stderr}");
    stdout.trim_end().to_string()
}

fn new_task(f: &VaultFixture, args: &[&str]) -> String {
    let mut argv = vec!["--quiet", "task", "new"];
    argv.extend_from_slice(args);
    ok(f, &argv)
}

fn get(f: &VaultFixture, id: &str) -> Json {
    serde_json::from_str(&ok(f, &["--json", "task", "get", id])).expect("task get --json")
}

fn list_ids(f: &VaultFixture, args: &[&str]) -> Vec<String> {
    let mut argv = vec!["--quiet", "task", "list", "--limit", "-1"];
    argv.extend_from_slice(args);
    ok(f, &argv).lines().map(str::to_string).collect()
}

fn task_file(f: &VaultFixture, id: &str) -> String {
    f.files()
        .into_iter()
        .find(|p| p.ends_with(&format!("{id}.md")))
        .unwrap_or_else(|| panic!("no file for {id}"))
}

fn path_of(f: &VaultFixture, id: &str) -> String {
    task_file(f, id)
}

/// The body of a task file, everything after the closing frontmatter fence.
fn body_of(text: &str) -> String {
    text.rsplit("---\n").next().unwrap_or_default().to_string()
}

/// One MCP `tools/call` against the fixture's vault, returning the `result` object.
fn mcp(f: &VaultFixture, name: &str, arguments: Json) -> Json {
    let line = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": name, "arguments": arguments},
    })
    .to_string();
    let out = f
        .cmd()
        .arg("mcp")
        .write_stdin(format!("{line}\n"))
        .output()
        .expect("run the mcp server");
    let text = String::from_utf8_lossy(&out.stdout);
    let frame: Json = serde_json::from_str(text.lines().next().expect("one frame")).expect("json");
    frame["result"].clone()
}

fn mcp_ok(f: &VaultFixture, name: &str, arguments: Json) -> Json {
    let result = mcp(f, name, arguments);
    assert!(
        result.get("isError").is_none(),
        "unexpected error from {name}: {}",
        result["content"][0]["text"]
    );
    result["structuredContent"].clone()
}

// ---------------------------------------------------------------------------------------
// the line exists, first in the body
// ---------------------------------------------------------------------------------------

#[test]
fn a_new_task_carries_the_managed_line_as_the_body_first_line() {
    let f = VaultFixture::new();
    let id = new_task(&f, &["Ship it", "--due", "2026-11-05"]);
    let text = f.read(&path_of(&f, &id));
    let body = body_of(&text);
    let first = body.trim_start().lines().next().unwrap_or_default();
    assert_eq!(
        first,
        format!("- [ ] Ship it 📅 2026-11-05 🆔 {id}"),
        "body:\n{body}"
    );
    // The frontmatter record is unchanged by the line.
    assert!(text.contains("title: Ship it"), "{text}");
    assert!(text.contains("due: 2026-11-05"), "{text}");
}

#[test]
fn a_checklist_line_without_an_id_is_not_treated_as_a_task() {
    let f = VaultFixture::new();
    let id = new_task(&f, &["Real task"]);
    let path = path_of(&f, &id);
    let text = f
        .read(&path)
        .replace("- [ ] Real task", "- [ ] buy milk\n- [ ] Real task");
    f.write(&path, &text);
    // Still one task, still its own title: a plain checklist item in the body is body text.
    assert_eq!(get(&f, &id)["title"], json!("Real task"));
    assert_eq!(list_ids(&f, &[]), vec![id]);
}

// ---------------------------------------------------------------------------------------
// an editor's save reaches every surface
// ---------------------------------------------------------------------------------------

#[test]
fn an_editor_rename_reaches_the_cli_and_mcp() {
    let f = VaultFixture::new();
    let id = new_task(&f, &["First title"]);
    let path = path_of(&f, &id);
    let edited = f
        .read(&path)
        .replace("- [ ] First title", "- [ ] Renamed in the editor");
    f.write(&path, &edited);

    assert_eq!(get(&f, &id)["title"], json!("Renamed in the editor"));
    let mcp_task = mcp_ok(&f, "shards_task_get", json!({"id": id}));
    assert_eq!(mcp_task["title"], json!("Renamed in the editor"));
    // Nothing rewrote the file: a read is a read.
    assert_eq!(f.read(&path), edited);
}

#[test]
fn an_obsidian_reschedule_reaches_the_due_filter_and_mcp() {
    let f = VaultFixture::new();
    let id = new_task(&f, &["Water plants", "--due", "2026-11-05"]);
    let path = path_of(&f, &id);
    let edited = f.read(&path).replace("📅 2026-11-05", "📅 2026-12-01");
    f.write(&path, &edited);

    assert_eq!(get(&f, &id)["due"], json!("2026-12-01"));
    assert_eq!(
        list_ids(&f, &["--due-after", "2026-11-20"]),
        vec![id.clone()]
    );
    assert!(list_ids(&f, &["--due-before", "2026-11-20"]).is_empty());
    let mcp_task = mcp_ok(&f, "shards_task_list", json!({}));
    let rows = mcp_task.as_array().cloned().unwrap_or_default();
    if let Some(row) = rows.iter().find(|r| r["id"] == json!(id)) {
        assert_eq!(row["due"], json!("2026-12-01"));
    }
}

#[test]
fn ticking_the_box_in_an_editor_completes_the_task_and_the_next_finish_moves_it() {
    let f = VaultFixture::new();
    let id = new_task(&f, &["Post the invoice"]);
    let path = path_of(&f, &id);
    let edited = f
        .read(&path)
        .replace("- [ ] Post the invoice", "- [x] Post the invoice");
    f.write(&path, &edited);

    // Done on every surface, straight away — the file has not moved yet.
    assert_eq!(list_ids(&f, &["--status", "done"]), vec![id.clone()]);
    assert!(list_ids(&f, &["--status", "open"]).is_empty());
    let mcp_task = mcp_ok(&f, "shards_task_get", json!({"id": id}));
    assert_eq!(mcp_task["status"], json!("done"));

    // The first Shards write heals the folder and re-canonicalises the line.
    ok(&f, &["--quiet", "task", "finish", &id]);
    assert_eq!(path_of(&f, &id), format!("tasks/done/{id}.md"));
    let text = f.read(&path_of(&f, &id));
    assert!(body_of(&text).contains("- [x] Post the invoice"), "{text}");
    assert!(!body_of(&text).contains("- [ ]"), "{text}");
}

// ---------------------------------------------------------------------------------------
// what survives a round trip
// ---------------------------------------------------------------------------------------

#[test]
fn unrelated_markdown_and_unknown_frontmatter_survive_an_editor_round_trip() {
    let f = VaultFixture::new();
    let id = new_task(
        &f,
        &[
            "Ship it",
            "--body",
            "Intro prose.\n\n## Notes\n\n- a bullet",
        ],
    );
    let path = path_of(&f, &id);
    // An editor renames the task and leaves a foreign key behind.
    let text = f
        .read(&path)
        .replace("- [ ] Ship it", "- [ ] Ship it today")
        .replace(
            "blocked_by: []\n",
            "blocked_by: []\nobsidian_note: keep me\n",
        );
    f.write(&path, &text);

    // A Shards write of an unrelated field keeps both.
    ok(
        &f,
        &["--quiet", "task", "update", &id, "--priority", "high"],
    );
    let after = f.read(&path);
    assert!(after.contains("obsidian_note: keep me"), "{after}");
    assert!(after.contains("title: Ship it today"), "{after}");
    assert!(after.contains("priority: high"), "{after}");
    assert!(
        after.contains("Intro prose.\n\n## Notes\n\n- a bullet"),
        "{after}"
    );
    assert_eq!(
        body_of(&after)
            .trim_start()
            .lines()
            .next()
            .unwrap_or_default(),
        format!("- [ ] Ship it today 🆔 {id}")
    );
}

#[test]
fn a_legacy_task_file_gains_its_line_on_the_first_shards_write() {
    let f = VaultFixture::new();
    f.write(
        "tasks/open/t-LGCY.md",
        "---\nid: t-LGCY\ntype: task\ntitle: Legacy\ntags: []\nowner: null\ncreated: 2026-09-05 08:45:38.869914+00:00\nupdated: 2026-09-05 08:45:38.869914+00:00\nrelated: []\nstatus: open\npriority: low\nclaimed_by: null\nproject: null\nblocks: []\nblocked_by: []\n---\n\nOriginal body.\n",
    );
    // Readable before the migration, with no line anywhere.
    assert_eq!(get(&f, "t-LGCY")["title"], json!("Legacy"));
    assert!(!f.read("tasks/open/t-LGCY.md").contains("🆔"));

    ok(
        &f,
        &["--quiet", "task", "update", "t-LGCY", "--priority", "high"],
    );
    let text = f.read("tasks/open/t-LGCY.md");
    assert_eq!(
        body_of(&text)
            .trim_start()
            .lines()
            .next()
            .unwrap_or_default(),
        "- [ ] Legacy 🆔 t-LGCY"
    );
    // The user's own body is untouched.
    assert!(text.contains("\nOriginal body.\n"), "{text}");
    assert!(text.contains("priority: high"), "{text}");
}

// ---------------------------------------------------------------------------------------
// a partial save is never a deletion
// ---------------------------------------------------------------------------------------

#[test]
fn a_malformed_save_never_deletes_a_task_or_another_file() {
    let f = VaultFixture::new();
    let keep = new_task(&f, &["Keep me"]);
    let broken = new_task(&f, &["Half written"]);
    let path = format!("tasks/open/{broken}.md");
    // A truncated save: the frontmatter never closed.
    let truncated = format!("---\nid: {broken}\ntype: task\ntitle: Half wi");
    f.write(&path, &truncated);
    let before: Vec<String> = f.files();

    // Unreadable, so it is not listed and not addressable — and nothing is removed.
    assert_eq!(list_ids(&f, &[]), vec![keep.clone()]);
    let (_, _, code) = run(&f, &["task", "get", &broken]);
    assert_ne!(code, 0, "an unreadable task is not found");
    assert_eq!(f.read(&path), truncated);
    assert_eq!(f.files(), before);

    // A sibling delete is a local operator verb and touches exactly one file.
    ok(&f, &["--quiet", "task", "delete", &keep, "--force"]);
    let mut expected = before.clone();
    expected.retain(|p| !p.ends_with(&format!("{keep}.md")));
    assert_eq!(f.files(), expected);
    assert_eq!(f.read(&path), truncated);
}

// ---------------------------------------------------------------------------------------
// the watch sweep heals the folder and migrates legacy files
// ---------------------------------------------------------------------------------------

#[test]
fn a_watch_sweep_moves_a_ticked_task_and_gives_a_legacy_file_its_line() {
    let f = VaultFixture::new();
    let ticked = new_task(&f, &["Ticked in Obsidian"]);
    let path = path_of(&f, &ticked);
    let edited = f
        .read(&path)
        .replace("- [ ] Ticked in Obsidian", "- [x] Ticked in Obsidian");
    f.write(&path, &edited);

    // A legacy file: one task per file, frontmatter only, no line at all.
    f.write(
        "tasks/open/t-LGCY.md",
        "---\nid: t-LGCY\ntype: task\ntitle: Legacy\ntags: []\nowner: null\ncreated: 2026-09-05 08:45:38.869914+00:00\nupdated: 2026-09-05 08:45:38.869914+00:00\nrelated: []\nstatus: open\npriority: low\nclaimed_by: null\nproject: null\nblocks: []\nblocked_by: []\n---\n\nOriginal body.\n",
    );

    let out = f
        .cmd()
        .args(["watch", "--once", "--no-index"])
        .output()
        .expect("run a watch sweep");
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );

    // The tick became a real completion: frontmatter status and the folder both say done.
    assert_eq!(path_of(&f, &ticked), format!("tasks/done/{ticked}.md"));
    let done = f.read(&format!("tasks/done/{ticked}.md"));
    assert!(done.contains("status: done"), "{done}");
    assert!(
        body_of(&done).contains("- [x] Ticked in Obsidian"),
        "{done}"
    );

    // The legacy file did not move, but it gained the line and kept its body.
    let legacy = f.read("tasks/open/t-LGCY.md");
    assert_eq!(
        body_of(&legacy)
            .trim_start()
            .lines()
            .next()
            .unwrap_or_default(),
        "- [ ] Legacy 🆔 t-LGCY"
    );
    assert!(legacy.contains("\nOriginal body.\n"), "{legacy}");
    // Idempotent: a second sweep rewrites nothing.
    let before = f.read("tasks/open/t-LGCY.md");
    let out = f
        .cmd()
        .args(["watch", "--once", "--no-index"])
        .output()
        .expect("run a second sweep");
    assert!(out.status.success());
    assert_eq!(f.read("tasks/open/t-LGCY.md"), before);
}

#[test]
fn a_recurring_task_ticked_in_an_editor_advances_once() {
    let f = VaultFixture::new();
    let id = new_task(
        &f,
        &[
            "Water plants",
            "--due",
            "2026-11-05T08:00",
            "--recur",
            "FREQ=DAILY",
        ],
    );
    let path = path_of(&f, &id);
    let edited = f
        .read(&path)
        .replace("- [ ] Water plants", "- [x] Water plants");
    f.write(&path, &edited);

    // The tick is the completion: the series has already moved on every surface, and the task
    // is still open. A read never writes, so the file is untouched until a writer sees it.
    assert!(list_ids(&f, &["--status", "done"]).is_empty());
    assert_eq!(list_ids(&f, &["--status", "open"]), vec![id.clone()]);
    let task = get(&f, &id);
    assert!(task["completed"].is_string(), "{task}");
    let advanced = task["due"].as_str().expect("next due").to_string();
    assert_ne!(advanced, "2026-11-05T08:00");
    assert_eq!(f.read(&path), edited, "a read is a read");

    // The first writer commits that one step and leaves the line unchecked for the new date.
    let out = f
        .cmd()
        .args(["watch", "--once", "--no-index"])
        .output()
        .expect("run a watch sweep");
    assert!(out.status.success());
    let text = f.read(&path);
    assert!(body_of(&text).contains("- [ ] Water plants"), "{text}");
    assert!(text.contains(&format!("due: {advanced}")), "{text}");
    assert!(text.contains("completed: "), "{text}");

    // Already committed: a second sweep writes nothing, so one tick is one occurrence.
    let before = f.read(&path);
    let out = f
        .cmd()
        .args(["watch", "--once", "--no-index"])
        .output()
        .expect("run a second sweep");
    assert!(out.status.success());
    assert_eq!(f.read(&path), before, "one next occurrence, not two");
}

#[test]
fn a_finish_after_an_editor_tick_commits_the_same_single_occurrence() {
    let f = VaultFixture::new();
    let id = new_task(
        &f,
        &[
            "Water plants",
            "--due",
            "2026-11-05T08:00",
            "--recur",
            "FREQ=DAILY",
        ],
    );
    let path = path_of(&f, &id);
    f.write(
        &path,
        &f.read(&path)
            .replace("- [ ] Water plants", "- [x] Water plants"),
    );
    let ticked = get(&f, &id)["due"].as_str().expect("next due").to_string();

    let report: Json =
        serde_json::from_str(&ok(&f, &["--json", "task", "finish", &id])).expect("finish json");
    assert_eq!(report["next_due"], json!(ticked));
    assert_eq!(report["status"], json!("open"));
    let text = f.read(&path);
    assert_eq!(text.matches("completed: ").count(), 1, "{text}");
    assert!(text.contains(&format!("due: {ticked}")), "{text}");
}

#[test]
fn a_frontmatter_hand_edit_outranks_an_untouched_line() {
    let f = VaultFixture::new();
    let id = new_task(&f, &["Ship it", "--due", "2026-11-05"]);
    let path = path_of(&f, &id);
    // A hand edit to the record, leaving the managed line exactly as Shards wrote it.
    let hand = f
        .read(&path)
        .replace("due: 2026-11-05", "due: 2026-12-25")
        .replace("title: Ship it", "title: Ship it now");
    f.write(&path, &hand);

    // The frontmatter is the record (R4): its value wins, and no line edit is invented.
    let task = get(&f, &id);
    assert_eq!(task["title"], json!("Ship it now"));
    assert_eq!(task["due"], json!("2026-12-25"));

    // The next Shards write re-renders the line from it, so the two agree again.
    ok(
        &f,
        &["--quiet", "task", "update", &id, "--priority", "high"],
    );
    let text = f.read(&path);
    assert!(
        body_of(&text).contains("- [ ] Ship it now 📅 2026-12-25 🆔"),
        "{text}"
    );
}
