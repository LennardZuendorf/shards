//! task-model-v2 through the real binary: the new fields, clearing, list filters and sorts,
//! recurring finish, reopen, validation exits and the MCP surface.

mod common;

use chrono::{Datelike, Duration, Local, NaiveDate, Weekday};
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

fn today() -> NaiveDate {
    Local::now().date_naive()
}

fn day(offset: i64) -> NaiveDate {
    today() + Duration::days(offset)
}

fn ymd(date: NaiveDate) -> String {
    date.format("%Y-%m-%d").to_string()
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
        "unexpected error: {}",
        result["content"][0]["text"]
    );
    result["structuredContent"].clone()
}

fn tools(f: &VaultFixture) -> Vec<Json> {
    let line = json!({"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}).to_string();
    let out = f
        .cmd()
        .arg("mcp")
        .write_stdin(format!("{line}\n"))
        .output()
        .expect("run the mcp server");
    let frame: Json = serde_json::from_str(
        String::from_utf8_lossy(&out.stdout)
            .lines()
            .next()
            .expect("frame"),
    )
    .expect("json");
    frame["result"]["tools"].as_array().cloned().expect("tools")
}

// ---------------------------------------------------------------------------------------
// create, update, clear
// ---------------------------------------------------------------------------------------

#[test]
fn new_writes_every_v2_field_and_get_returns_them_in_canonical_order() {
    let f = VaultFixture::new();
    let parent = new_task(&f, &["Parent"]);
    let id = new_task(
        &f,
        &[
            "Weekly review",
            "--priority",
            "urgent",
            "--due",
            "2026-11-02T09:30",
            "--deadline",
            "2026-11-06",
            "--recur",
            "freq=weekly;byday=fr,mo",
            "--recur-from",
            "completion",
            "--parent",
            &parent,
            "--section",
            "Rituals",
            "--order",
            "1.5",
        ],
    );
    let text = f.read(&task_file(&f, &id));
    assert!(text.contains("\npriority: urgent\n"), "{text}");
    // Floating calendar values are written plain, exactly as given.
    assert!(text.contains("\ndue: 2026-11-02T09:30\n"), "{text}");
    assert!(text.contains("\ndeadline: 2026-11-06\n"), "{text}");
    assert!(
        text.contains("\nrecur: FREQ=WEEKLY;BYDAY=MO,FR\n"),
        "{text}"
    );

    let task = get(&f, &id);
    let keys: Vec<&str> = task
        .as_object()
        .expect("object")
        .keys()
        .map(String::as_str)
        .collect();
    let v2_start = keys.iter().position(|k| *k == "due").expect("due key");
    assert_eq!(
        keys[v2_start..v2_start + 7],
        [
            "due",
            "deadline",
            "recur",
            "recur_from",
            "parent",
            "section",
            "order"
        ]
    );
    assert_eq!(task["due"], json!("2026-11-02T09:30"));
    assert_eq!(task["deadline"], json!("2026-11-06"));
    assert_eq!(task["recur_from"], json!("completion"));
    assert_eq!(task["parent"], json!(parent));
    assert_eq!(task["section"], json!("Rituals"));
    assert_eq!(task["order"], json!(1.5));
    assert!(task.get("completed").is_none());

    // The human block shows the v2 lines after the fourteen v1 lines.
    let human = ok(&f, &["task", "get", &id, "--meta-only"]);
    assert!(human.contains("\ndue: 2026-11-02T09:30\n"), "{human}");
    assert!(human.contains("\norder: 1.5\n"), "{human}");
}

#[test]
fn a_task_without_v2_fields_keeps_the_v1_shape() {
    let f = VaultFixture::new();
    let id = new_task(&f, &["Plain"]);
    let task = get(&f, &id);
    for key in [
        "due",
        "deadline",
        "recur",
        "recur_from",
        "parent",
        "section",
        "order",
        "completed",
    ] {
        assert!(task.get(key).is_none(), "{key} leaked into {task}");
    }
    let human = ok(&f, &["task", "get", &id, "--meta-only"]);
    assert_eq!(human.lines().count(), 15, "{human}");
}

#[test]
fn update_sets_and_an_empty_string_clears() {
    let f = VaultFixture::new();
    let parent = new_task(&f, &["Parent"]);
    let id = new_task(&f, &["Child", "--project", "n-PROJ", "--priority", "high"]);
    ok(
        &f,
        &[
            "task",
            "update",
            &id,
            "--due",
            "2026-12-24",
            "--deadline",
            "2026-12-31",
            "--recur",
            "FREQ=YEARLY",
            "--parent",
            &parent,
            "--section",
            "Later",
            "--order",
            "-2",
        ],
    );
    let task = get(&f, &id);
    assert_eq!(task["due"], json!("2026-12-24"));
    assert_eq!(task["parent"], json!(parent));
    assert_eq!(task["order"], json!(-2));

    ok(
        &f,
        &[
            "task",
            "update",
            &id,
            "--due",
            "",
            "--deadline",
            "",
            "--recur",
            "",
            "--parent",
            "",
            "--section",
            "",
            "--order",
            "",
            "--priority",
            "",
            "--project",
            "",
        ],
    );
    let task = get(&f, &id);
    for key in ["due", "deadline", "recur", "parent", "section", "order"] {
        assert!(task.get(key).is_none(), "{key} survived the clear: {task}");
    }
    // v1 keys are always present, so clearing writes null.
    assert_eq!(task["priority"], Json::Null);
    assert_eq!(task["project"], Json::Null);
    let text = f.read(&task_file(&f, &id));
    assert!(!text.contains("due:"), "{text}");
}

#[test]
fn a_blank_relation_on_create_is_an_error_never_a_silent_drop() {
    // shards#39: `--parent ''` exited 0 and wrote no parent at all — a subtask became a root
    // task — and `--project ''` wrote an empty string. A capture must not lose a relation.
    let f = VaultFixture::new();
    for (flag, noun, needs) in [
        ("--parent", "parent", "needs a task id"),
        ("--project", "project", "needs a note id"),
    ] {
        for value in ["", "   "] {
            let (_, stderr, code) = run(&f, &["task", "new", "T", flag, value]);
            assert_eq!(code, 2, "{flag} {value:?}: {stderr}");
            assert_eq!(
                stderr.trim_end(),
                format!("invalid {noun}: '{value}' ({needs})"),
                "{flag} {value:?}"
            );
        }
    }
    // The `--json` envelope keeps its one shape and reuses the existing kind.
    let (_, stderr, code) = run(&f, &["--json", "task", "new", "T", "--parent", ""]);
    assert_eq!(code, 2, "{stderr}");
    let payload: Json = serde_json::from_str(stderr.trim_end()).expect("json envelope");
    assert_eq!(payload["kind"], "validation", "{payload}");
    assert_eq!(payload["message"], "invalid parent: '' (needs a task id)");
    assert!(
        f.files().is_empty(),
        "a rejected capture wrote {:?}",
        f.files()
    );
}

#[test]
fn invalid_values_exit_two_and_write_nothing() {
    let f = VaultFixture::new();
    for (args, prefix) in [
        (
            vec!["task", "new", "T", "--recur", "FREQ=HOURLY"],
            "invalid recur: ",
        ),
        (
            vec!["task", "new", "T", "--recur", "FREQ=DAILY;COUNT=3"],
            "invalid recur: ",
        ),
        (
            vec!["task", "new", "T", "--recur", "FREQ=DAILY;BYDAY=MO"],
            "invalid recur: ",
        ),
        (
            vec!["task", "new", "T", "--due", "tomorrow"],
            "invalid due: ",
        ),
        (
            vec!["task", "new", "T", "--due", "2026-11-02 09:30"],
            "invalid due: ",
        ),
        (
            vec!["task", "new", "T", "--deadline", "2026-11-02T09:30"],
            "invalid deadline: ",
        ),
        (
            vec!["task", "new", "T", "--recur-from", "later"],
            "invalid recur_from: ",
        ),
        (
            vec!["task", "new", "T", "--parent", "t-NOPE"],
            "invalid parent: ",
        ),
        (
            vec!["task", "new", "T", "--order", "first"],
            "invalid order: ",
        ),
        (
            vec!["task", "list", "--due-before", "next week"],
            "invalid --due-before: ",
        ),
    ] {
        let (_, stderr, code) = run(&f, &args);
        assert_eq!(code, 2, "{args:?} {stderr}");
        assert!(stderr.starts_with(prefix), "{args:?} {stderr}");
    }
    assert!(f.files().is_empty(), "{:?}", f.files());
}

#[test]
fn an_invalid_recur_on_update_is_rejected_and_the_file_is_untouched() {
    let f = VaultFixture::new();
    let id = new_task(&f, &["T"]);
    let before = f.read(&task_file(&f, &id));
    let (_, stderr, code) = run(
        &f,
        &["task", "update", &id, "--recur", "FREQ=WEEKLY;BYMONTHDAY=1"],
    );
    assert_eq!(code, 2);
    assert!(stderr.starts_with("invalid recur: "), "{stderr}");
    assert_eq!(f.read(&task_file(&f, &id)), before);
}

#[test]
fn parent_rejects_self_and_cycles() {
    let f = VaultFixture::new();
    let a = new_task(&f, &["A"]);
    let b = new_task(&f, &["B", "--parent", &a]);
    let (_, stderr, code) = run(&f, &["task", "update", &a, "--parent", &a]);
    assert_eq!(code, 2, "{stderr}");
    let (_, stderr, code) = run(&f, &["task", "update", &a, "--parent", &b]);
    assert_eq!(code, 2);
    assert_eq!(
        stderr.trim_end(),
        format!("parent cycle: {a} -> {b} -> {a}")
    );
}

// ---------------------------------------------------------------------------------------
// list filters and sorts
// ---------------------------------------------------------------------------------------

#[test]
fn list_filters_by_due_window_overdue_parent_and_section() {
    let f = VaultFixture::new();
    let parent = new_task(&f, &["Parent"]);
    let overdue = new_task(
        &f,
        &["Overdue", "--due", &ymd(day(-2)), "--parent", &parent],
    );
    let due_today = new_task(&f, &["Today", "--due", &format!("{}T23:59", ymd(day(0)))]);
    // A timed due earlier today is overdue once its minute has passed (the app's rule too).
    let earlier_today = new_task(
        &f,
        &["Earlier today", "--due", &format!("{}T00:00", ymd(day(0)))],
    );
    let later = new_task(&f, &["Later", "--due", &ymd(day(7)), "--section", "Next"]);
    let done_past = new_task(
        &f,
        &["Done past", "--due", &ymd(day(-5)), "--section", "Next"],
    );
    ok(&f, &["task", "finish", &done_past]);

    let mut expected_overdue = vec![overdue.clone(), earlier_today.clone()];
    let now = Local::now().naive_local();
    if now.format("%H:%M").to_string() == "23:59" {
        // The minute the "later today" due itself turns overdue.
        expected_overdue.push(due_today.clone());
    }
    assert_eq!(
        list_ids(&f, &["--overdue", "--sort", "due"]),
        expected_overdue
    );
    assert_eq!(
        list_ids(&f, &["--has-due", "--sort", "due"]),
        [
            done_past.clone(),
            overdue.clone(),
            earlier_today.clone(),
            due_today.clone(),
            later.clone()
        ]
    );
    assert_eq!(
        list_ids(&f, &["--due-before", &ymd(day(0)), "--sort", "due"]),
        [done_past.clone(), overdue.clone()]
    );
    assert_eq!(
        list_ids(&f, &["--due-after", &ymd(day(0))]),
        [later.as_str()]
    );
    assert_eq!(
        list_ids(
            &f,
            &[
                "--due-after",
                &ymd(day(-3)),
                "--due-before",
                &ymd(day(1)),
                "--sort",
                "due"
            ]
        ),
        [overdue.clone(), earlier_today.clone(), due_today.clone()]
    );
    assert_eq!(list_ids(&f, &["--parent", &parent]), [overdue.as_str()]);
    assert_eq!(
        list_ids(&f, &["--section", "Next", "--sort", "due"]),
        [done_past, later]
    );
    // --overdue composes with the limit after filtering, never before.
    // The newest row is the finished one, so a limit applied before the filter would be empty.
    assert_eq!(
        ok(
            &f,
            &[
                "--quiet",
                "task",
                "list",
                "--overdue",
                "--limit",
                "1",
                "--sort",
                "due"
            ]
        ),
        overdue
    );
}

#[test]
fn sort_by_due_puts_undated_last_and_sort_by_order_ranks_manually() {
    let f = VaultFixture::new();
    let undated = new_task(&f, &["Undated", "--order", "1"]);
    let soon = new_task(&f, &["Soon", "--due", &ymd(day(1)), "--order", "3"]);
    let sooner = new_task(&f, &["Sooner", "--due", &ymd(day(0)), "--order", "2.5"]);
    let unranked = new_task(&f, &["Unranked", "--due", &ymd(day(9))]);
    assert_eq!(
        list_ids(&f, &["--sort", "due"]),
        [
            sooner.clone(),
            soon.clone(),
            unranked.clone(),
            undated.clone()
        ]
    );
    assert_eq!(
        list_ids(&f, &["--sort", "order"]),
        [undated, sooner, soon, unranked]
    );
}

#[test]
fn priority_sorts_urgent_high_normal_low_then_unset() {
    let f = VaultFixture::new();
    let unset = new_task(&f, &["unset"]);
    let low = new_task(&f, &["low", "--priority", "low"]);
    let normal = new_task(&f, &["normal", "--priority", "normal"]);
    let high = new_task(&f, &["high", "--priority", "high"]);
    let urgent = new_task(&f, &["urgent", "--priority", "urgent"]);
    assert_eq!(
        list_ids(&f, &["--sort", "priority"]),
        [urgent.clone(), high, normal, low, unset]
    );
    assert_eq!(ok(&f, &["--quiet", "task", "next"]), urgent);
}

// ---------------------------------------------------------------------------------------
// recurring finish and reopen
// ---------------------------------------------------------------------------------------

#[test]
fn finishing_a_recurring_task_advances_due_and_deadline_and_keeps_it_open() {
    let f = VaultFixture::new();
    let past = day(-10);
    let id = new_task(
        &f,
        &[
            "Standup notes",
            "--due",
            &format!("{}T09:00", ymd(past)),
            "--deadline",
            &ymd(past + Duration::days(1)),
            "--recur",
            "FREQ=WEEKLY;BYDAY=MO,TH",
            "--body",
            "Template body.",
        ],
    );
    ok(&f, &["--owner", "alice", "task", "claim", &id]);
    let (stdout, stderr, code) = run(&f, &["--json", "task", "finish", &id, "--outcome", "x"]);
    assert_eq!(code, 0, "{stderr}");
    let report: Json = serde_json::from_str(stdout.trim()).expect("finish --json");
    assert_eq!(report["status"], json!("open"));
    let next_due = report["next_due"].as_str().expect("next_due").to_string();
    assert!(stderr.contains("next due"), "{stderr}");
    assert!(stderr.contains("outcome text is not recorded"), "{stderr}");

    // The next occurrence is after today, on a listed weekday, at the same wall-clock time.
    let next = NaiveDate::parse_from_str(&next_due[..10], "%Y-%m-%d").expect("date");
    assert!(next > today(), "{next_due}");
    assert!(next <= today() + Duration::days(7), "{next_due}");
    assert!(
        matches!(next.weekday(), Weekday::Mon | Weekday::Thu),
        "{next_due}"
    );
    assert!(next_due.ends_with("T09:00"), "{next_due}");

    let task = get(&f, &id);
    assert_eq!(task["due"], json!(next_due));
    assert_eq!(task["status"], json!("open"));
    assert_eq!(task["claimed_by"], Json::Null);
    assert!(task["completed"]
        .as_str()
        .expect("completed")
        .ends_with('Z'));
    // The deadline moved by the same number of days as the due date.
    let delta = next - past;
    assert_eq!(
        task["deadline"],
        json!(ymd(past + Duration::days(1) + delta))
    );
    // Same file, still in open/, body untouched.
    assert_eq!(task_file(&f, &id), format!("tasks/open/{id}.md"));
    assert_eq!(task["body"], json!("Template body."));
}

#[test]
fn a_completion_anchored_daily_repeat_restarts_from_today() {
    let f = VaultFixture::new();
    let id = new_task(
        &f,
        &[
            "Stretch",
            "--due",
            &ymd(day(-30)),
            "--recur",
            "FREQ=DAILY;INTERVAL=2",
            "--recur-from",
            "completion",
        ],
    );
    let out: Json =
        serde_json::from_str(&ok(&f, &["--json", "task", "finish", &id])).expect("json");
    assert_eq!(out["next_due"], json!(ymd(day(2))));
}

/// Finish `id` `times` times and collect each reported `next_due`.
fn finish_times(f: &VaultFixture, id: &str, times: usize) -> Vec<String> {
    (0..times)
        .map(|_| {
            let out: Json = serde_json::from_str(&ok(f, &["--json", "task", "finish", id]))
                .expect("finish --json");
            out["next_due"].as_str().expect("next_due").to_string()
        })
        .collect()
}

#[test]
fn a_monthly_repeat_on_day_31_survives_a_short_month() {
    let f = VaultFixture::new();
    // Far-future dates, so the series (not today) decides every step.
    let id = new_task(
        &f,
        &["Invoice", "--due", "2095-01-31", "--recur", "FREQ=MONTHLY"],
    );
    assert_eq!(
        finish_times(&f, &id, 4),
        ["2095-02-28", "2095-03-31", "2095-04-30", "2095-05-31"]
    );
    // The clamp pinned the series day into the stored rule.
    assert_eq!(get(&f, &id)["recur"], json!("FREQ=MONTHLY;BYMONTHDAY=31"));
}

#[test]
fn a_yearly_repeat_on_feb_29_returns_in_the_next_leap_year() {
    let f = VaultFixture::new();
    let id = new_task(
        &f,
        &["Leap day", "--due", "2092-02-29", "--recur", "FREQ=YEARLY"],
    );
    assert_eq!(
        finish_times(&f, &id, 4),
        ["2093-02-28", "2094-02-28", "2095-02-28", "2096-02-29"]
    );
    assert_eq!(
        get(&f, &id)["recur"],
        json!("FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29")
    );
}

#[test]
fn a_hand_edited_invalid_recur_never_blocks_a_finish() {
    let f = VaultFixture::new();
    let id = new_task(
        &f,
        &[
            "Water plants",
            "--due",
            "2090-01-01",
            "--recur",
            "FREQ=DAILY",
        ],
    );
    let rel = task_file(&f, &id);
    let text = f
        .read(&rel)
        .replace("recur: FREQ=DAILY", "recur: every day");
    assert!(text.contains("recur: every day"), "{text}");
    f.write(&rel, &text);

    let (stdout, stderr, code) = run(&f, &["--json", "task", "finish", &id]);
    assert_eq!(code, 0, "{stderr}");
    let report: Json = serde_json::from_str(stdout.trim()).expect("finish --json");
    assert_eq!(report["status"], json!("done"));
    assert!(report.get("next_due").is_none(), "{report}");
    let warning = report["warnings"][0].as_str().expect("warning").to_string();
    // The original spelling is quoted, not an uppercased copy.
    assert!(warning.contains("'every day'"), "{warning}");
    assert!(warning.contains("closed instead of repeating"), "{warning}");
    assert!(
        stderr.contains("warning: invalid recur: 'every day'"),
        "{stderr}"
    );
    assert_eq!(task_file(&f, &id), format!("tasks/done/{id}.md"));

    // The MCP surface reports the same warning.
    let other = new_task(
        &f,
        &["Feed cat", "--due", "2090-01-01", "--recur", "FREQ=DAILY"],
    );
    let rel = task_file(&f, &other);
    f.write(
        &rel,
        &f.read(&rel)
            .replace("recur: FREQ=DAILY", "recur: FREQ=HOURLY"),
    );
    let finished = mcp_ok(&f, "shards_task_finish", json!({"task_id": other}));
    assert_eq!(finished["status"], json!("done"));
    assert!(finished["warnings"][0]
        .as_str()
        .unwrap_or_default()
        .contains("unsupported FREQ 'HOURLY'"));
}

#[test]
fn expected_due_makes_a_retried_recurring_finish_a_no_op() {
    let f = VaultFixture::new();
    let id = new_task(
        &f,
        &[
            "Journal",
            "--due",
            "2090-01-01T07:00",
            "--recur",
            "FREQ=DAILY",
        ],
    );
    let first: Json = serde_json::from_str(&ok(
        &f,
        &[
            "--json",
            "task",
            "finish",
            &id,
            "--expected-due",
            "2090-01-01T07:00",
        ],
    ))
    .expect("json");
    assert_eq!(first["next_due"], json!("2090-01-02T07:00"));
    assert!(first.get("warnings").is_none(), "{first}");
    let before = f.read(&task_file(&f, &id));

    // The same call again: the due it names is gone, so nothing is written.
    let (stdout, stderr, code) = run(
        &f,
        &[
            "--json",
            "task",
            "finish",
            &id,
            "--expected-due",
            "2090-01-01T07:00",
        ],
    );
    assert_eq!(code, 0, "{stderr}");
    let retry: Json = serde_json::from_str(stdout.trim()).expect("json");
    assert_eq!(retry["next_due"], json!("2090-01-02T07:00"));
    assert_eq!(retry["status"], json!("open"));
    assert!(retry["warnings"][0]
        .as_str()
        .unwrap_or_default()
        .contains("nothing changed"));
    assert_eq!(
        f.read(&task_file(&f, &id)),
        before,
        "the file was rewritten"
    );

    // MCP: a stale expected_due is a no-op, the current one advances.
    let stale = mcp_ok(
        &f,
        "shards_task_finish",
        json!({"task_id": id, "expected_due": "2090-01-01T07:00"}),
    );
    assert_eq!(stale["next_due"], json!("2090-01-02T07:00"));
    assert!(stale["warnings"].is_array(), "{stale}");
    let fresh = mcp_ok(
        &f,
        "shards_task_finish",
        json!({"task_id": id, "expected_due": "2090-01-02T07:00"}),
    );
    assert_eq!(fresh["next_due"], json!("2090-01-03T07:00"));

    // A malformed precondition is a validation error and writes nothing.
    let (_, stderr, code) = run(&f, &["task", "finish", &id, "--expected-due", "soon"]);
    assert_eq!(code, 2, "{stderr}");
    // A one-off task ignores the precondition: finishing it is idempotent anyway.
    let once = new_task(&f, &["Once", "--due", "2090-05-05"]);
    let done: Json = serde_json::from_str(&ok(
        &f,
        &[
            "--json",
            "task",
            "finish",
            &once,
            "--expected-due",
            "2090-01-01",
        ],
    ))
    .expect("json");
    assert_eq!(done["status"], json!("done"));
}

#[test]
fn reopen_moves_a_done_task_back_and_clears_completed() {
    let f = VaultFixture::new();
    let id = new_task(&f, &["One-off"]);
    ok(&f, &["--owner", "alice", "task", "claim", &id]);
    ok(&f, &["task", "finish", &id]);
    let done = get(&f, &id);
    assert_eq!(done["status"], json!("done"));
    assert!(done["completed"].is_string());
    assert_eq!(task_file(&f, &id), format!("tasks/done/{id}.md"));

    assert_eq!(
        ok(&f, &["task", "update", &id, "--status", "open"]),
        format!("updated {id}")
    );
    let task = get(&f, &id);
    assert_eq!(task["status"], json!("open"));
    assert!(task.get("completed").is_none(), "{task}");
    assert_eq!(task["claimed_by"], Json::Null);
    assert_eq!(task_file(&f, &id), format!("tasks/open/{id}.md"));
    assert!(list_ids(&f, &["--available"]).contains(&id));

    let (_, stderr, code) = run(&f, &["task", "update", &id, "--status", "done"]);
    assert_eq!(code, 2);
    assert!(stderr.contains("only 'open' reopens"), "{stderr}");
}

// ---------------------------------------------------------------------------------------
// MCP
// ---------------------------------------------------------------------------------------

#[test]
fn the_mcp_schemas_carry_the_v2_parameters() {
    let f = VaultFixture::new();
    let all = tools(&f);
    let find = |name: &str| -> Json {
        all.iter()
            .find(|t| t["name"] == json!(name))
            .cloned()
            .unwrap_or_else(|| panic!("no tool {name}"))
    };
    let props = |name: &str| find(name)["inputSchema"]["properties"].clone();

    let new = props("shards_task_new");
    for key in [
        "due",
        "deadline",
        "recur",
        "recur_from",
        "parent",
        "section",
        "order",
    ] {
        let description = new[key]["description"].as_str().unwrap_or_default();
        assert!(!description.is_empty(), "shards_task_new.{key}");
    }
    assert_eq!(
        new["priority"]["enum"],
        json!(["urgent", "high", "normal", "low"])
    );
    assert_eq!(new["recur_from"]["enum"], json!(["due", "completion"]));

    let update = props("shards_task_update");
    for key in [
        "status",
        "due",
        "deadline",
        "recur",
        "recur_from",
        "parent",
        "section",
        "order",
    ] {
        assert!(
            update[key]["description"].is_string(),
            "shards_task_update.{key}"
        );
    }
    assert_eq!(update["status"]["enum"], json!(["open"]));

    let list = props("shards_task_list");
    for key in [
        "due_before",
        "due_after",
        "overdue",
        "has_due",
        "parent",
        "section",
    ] {
        assert!(
            list[key]["description"].is_string(),
            "shards_task_list.{key}"
        );
    }
    assert!(list["sort"]["description"]
        .as_str()
        .unwrap_or_default()
        .contains("'due'"));
    // A recurring finish is not idempotent, so the hint says so.
    assert_eq!(
        find("shards_task_finish")["annotations"]["idempotentHint"],
        json!(false)
    );
}

#[test]
fn mcp_round_trips_v2_fields_filters_and_a_recurring_finish() {
    let f = VaultFixture::new();
    let created = mcp_ok(
        &f,
        "shards_task_new",
        json!({
            "title": "Pay rent",
            "priority": "urgent",
            "due": ymd(day(-3)),
            "deadline": ymd(day(-1)),
            "recur": "FREQ=MONTHLY;BYMONTHDAY=1",
            "section": "Bills",
            "order": 4,
        }),
    );
    let id = created["id"].as_str().expect("id").to_string();
    assert_eq!(created["recur"], json!("FREQ=MONTHLY;BYMONTHDAY=1"));
    assert_eq!(created["order"], json!(4));

    let rows = mcp_ok(
        &f,
        "shards_task_list",
        json!({"overdue": true, "section": "Bills"}),
    );
    assert_eq!(rows["result"][0]["id"], json!(id));

    let finished = mcp_ok(&f, "shards_task_finish", json!({"task_id": id}));
    assert_eq!(finished["status"], json!("open"));
    let next = finished["next_due"].as_str().expect("next_due");
    assert!(next.ends_with("-01"), "{next}");
    assert_eq!(finished["due"], json!(next));
    assert!(finished.get("warnings").is_none(), "{finished}");

    let cleared = mcp_ok(
        &f,
        "shards_task_update",
        json!({"task_id": id, "recur": "", "order": "", "section": ""}),
    );
    assert!(cleared.get("recur").is_none(), "{cleared}");
    assert!(cleared.get("order").is_none(), "{cleared}");
    assert!(cleared.get("section").is_none(), "{cleared}");

    let bad = mcp(
        &f,
        "shards_task_update",
        json!({"task_id": id, "recur": "FREQ=SECONDLY"}),
    );
    assert_eq!(bad["isError"], json!(true));
    let envelope: Json =
        serde_json::from_str(bad["content"][0]["text"].as_str().expect("text")).expect("json");
    assert!(envelope["message"]
        .as_str()
        .unwrap_or_default()
        .starts_with("invalid recur: "));
}
