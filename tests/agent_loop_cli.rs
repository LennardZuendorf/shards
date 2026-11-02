//! The bounded agent run, end to end (issue #12, slice 2).
//!
//! Every other suite proves one verb. This one proves that the verbs compose into a loop with a
//! stop condition: `task next --claim` -> work -> `task finish --outcome`, the three exits, the
//! handoff window, drain, and stale-claim recovery. It drives the real binary throughout.

mod common;

use common::VaultFixture;
use serde_json::Value as Json;

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

fn json(text: &str) -> Json {
    serde_json::from_str(text.trim()).expect("valid json")
}

fn task_path(f: &VaultFixture, id: &str) -> String {
    f.files()
        .into_iter()
        .find(|p| p.ends_with(&format!("{id}.md")))
        .unwrap_or_else(|| panic!("no file for {id}"))
}

fn bytes(f: &VaultFixture, id: &str) -> String {
    f.read(&task_path(f, id))
}

fn text(value: &str) -> Json {
    Json::String(value.to_string())
}

/// `[core].agent` in `DEFAULT_CONFIG` — the acting identity unless `--owner` overrides it.
const ME: &str = "test-agent";
/// The other identity in the fleet.
const PEER: &str = "peer-agent";

#[test]
fn the_bounded_agent_loop_runs_end_to_end() {
    let f = VaultFixture::new();

    // 1. Three tasks: `first` ready, `second` blocked by it, `third` already claimed by a peer.
    let first = new_task(&f, &["first"]);
    let second = new_task(&f, &["second", "--blocked-by", &first]);
    let third = new_task(&f, &["third"]);
    ok(&f, &["--owner", PEER, "task", "claim", &third]);

    // 2. Selection can only offer the ready, unclaimed one.
    let picked = json(&ok(&f, &["--json", "task", "next"]));
    assert_eq!(picked["id"], text(&first), "next must pick the ready task");

    // 3. The strict claim gate is exit 5 and writes nothing — prove the bytes did not move.
    let before = bytes(&f, &second);
    let (_, stderr, code) = run(&f, &["--json", "task", "claim", &second, "--strict"]);
    assert_eq!(
        code, 5,
        "a strict claim on blocked work is exit 5: {stderr}"
    );
    assert_eq!(json(&stderr)["kind"], text("blocked"));
    assert_eq!(bytes(&f, &second), before, "a refused claim writes nothing");

    // 4. Finishing the blocker reports what it unblocked; it does not write the blocked file.
    let done = json(&ok(
        &f,
        &[
            "--json",
            "task",
            "finish",
            &first,
            "--outcome",
            "produced the input",
        ],
    ));
    assert_eq!(done["status"], text("done"));
    assert_eq!(done["unblocked"], Json::Array(vec![text(&second)]));

    // 5. The loop's entry call takes the now-ready task in the same invocation.
    let claimed = json(&ok(&f, &["--json", "task", "next", "--claim"]));
    assert_eq!(claimed["id"], text(&second));
    assert_eq!(claimed["claimed_by"], text(ME));
    assert_eq!(claimed["status"], text("claimed"));

    // 6. A finish leaves `claimed_by` set — the current contract, pinned so it cannot drift
    //    silently (`src/domain/tasks.rs:1280`).
    let done = json(&ok(
        &f,
        &["--json", "task", "finish", &second, "--outcome", "built it"],
    ));
    assert_eq!(done["status"], text("done"));
    let after = json(&ok(&f, &["--json", "task", "get", &second]));
    assert_eq!(after["status"], text("done"));
    assert_eq!(
        after["claimed_by"],
        text(ME),
        "finish must not clear claimed_by"
    );

    // 7. Handoff is two writes: assignment first, release second. The window in between is
    //    pinned — the task is already assigned to the peer and still held by us.
    let fourth = new_task(&f, &["fourth"]);
    ok(&f, &["task", "claim", &fourth]);
    ok(&f, &["task", "update", &fourth, "--owner", PEER]);
    let window = json(&ok(&f, &["--json", "task", "get", &fourth]));
    assert_eq!(window["owner"], text(PEER));
    assert_eq!(
        window["claimed_by"],
        text(ME),
        "still held during the window"
    );
    assert_eq!(window["status"], text("claimed"));
    ok(&f, &["task", "release", &fourth]);
    let handed_off = json(&ok(&f, &["--json", "task", "get", &fourth]));
    assert_eq!(handed_off["owner"], text(PEER));
    assert_eq!(handed_off["claimed_by"], Json::Null);
    assert_eq!(handed_off["status"], text("open"));
    ok(&f, &["--owner", PEER, "task", "claim", &fourth]);
    assert!(bytes(&f, &fourth).contains(&format!("claimed_by: {PEER}")));

    // 8. Drain: exit 3 with the pinned line, because the queue is empty — not a failure.
    let (_, stderr, code) = run(&f, &["task", "next"]);
    assert_eq!(code, 3);
    assert_eq!(stderr.trim_end(), "no ready task");

    // 9. Recovery from an abandoned claim: a peer's release is exit 4, and `--force` is the
    //    CLI-only override that clears it.
    let fifth = new_task(&f, &["fifth"]);
    ok(&f, &["task", "claim", &fifth]);
    let (_, stderr, code) = run(&f, &["--json", "--owner", PEER, "task", "release", &fifth]);
    assert_eq!(code, 4, "a peer cannot release our claim: {stderr}");
    assert_eq!(json(&stderr)["kind"], text("claim_conflict"));
    assert!(bytes(&f, &fifth).contains(&format!("claimed_by: {ME}")));
    ok(&f, &["--owner", PEER, "task", "release", &fifth, "--force"]);
    let recovered = json(&ok(&f, &["--json", "task", "get", &fifth]));
    assert_eq!(recovered["claimed_by"], Json::Null);
    assert_eq!(recovered["status"], text("open"));
}
