//! The managed checkbox line: the one place outside Shards that may edit a task.
//!
//! A task stays one Markdown file with frontmatter as its record (R4). The first line of its
//! body is a single managed task line in the Obsidian Tasks emoji format, so a plain editor or
//! Obsidian Tasks can rename, reschedule and complete the task:
//!
//! ```text
//! - [ ] Ship it 🔁 FREQ=WEEKLY 📅 2026-11-05 🆔 t-1S4Z
//! ```
//!
//! The line carries exactly four editor-owned values — the checkbox, the title, `📅` due and
//! `🔁` recur — plus the `🆔` id that says which task it belongs to. Everything else (priority,
//! tags, owner, project, deadline, parent, blocks) lives in the frontmatter only.
//!
//! Reads never write. [`reconcile`] applies the line onto the parsed frontmatter in memory, and
//! [`canonical_body`] re-emits the line from the frontmatter on every write, so the line is back
//! in canonical form the moment Shards touches the file. A line whose id differs from the
//! frontmatter id is not managed — frontmatter identity always wins.

use chrono::{DateTime, NaiveDate, TimeZone, Utc};

use crate::domain::recur::{self, Due, Rule};
use crate::fm::{Meta, Value};
use crate::model::common::{meta_str, meta_time, ts_value};
use crate::timefmt::{now_utc, today_local};

/// Due date signifier (Obsidian Tasks `📅`).
pub const DUE_MARK: &str = "📅";
/// Recurrence signifier (Obsidian Tasks `🔁`).
pub const RECUR_MARK: &str = "🔁";
/// Completion date signifier (Obsidian Tasks `✅`).
pub const DONE_MARK: &str = "✅";
/// Identity signifier (Obsidian Tasks `🆔`), always last on the line.
pub const ID_MARK: &str = "🆔";

/// A parsed managed line.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Line {
    /// The description: the task title.
    pub title: String,
    /// The checkbox is `[x]`.
    pub checked: bool,
    /// The checkbox is `[-]` (Obsidian Tasks' cancelled state).
    pub cancelled: bool,
    /// The `📅` value, when it parses as a calendar value.
    pub due: Option<Due>,
    /// The `🔁` value exactly as written, unvalidated.
    pub recur: Option<String>,
    /// The `✅` date, when it parses as a bare date.
    pub done_on: Option<NaiveDate>,
    /// The `🆔` value.
    pub id: String,
    /// Signifier pairs this module does not own, preserved verbatim.
    pub extra: String,
}

/// The Obsidian Tasks signifiers this module recognises. Anything else on the line is text.
///
/// A whitelist, not "any one-character token": a title may start with an ordinary emoji
/// (`🚀 Launch`), and reading that as a signifier would move a word of the title into the tail.
pub const SIGNIFIERS: [&str; 13] = [
    "📅", "⏳", "🛫", "➕", "✅", "❌", "🔁", "🆔", "⛔", "🔺", "⏫", "🔼", "🔽",
];

/// Whether `token` is one of the Obsidian Tasks signifiers rather than a word of the title.
fn is_signifier(token: &str) -> bool {
    SIGNIFIERS.contains(&token)
}

/// Whether `id` has the shape this module will write back into a line.
fn plausibly_ours(id: &str) -> bool {
    id.strip_prefix("t-")
        .is_some_and(|rest| !rest.is_empty() && rest.chars().all(|c| c.is_ascii_alphanumeric()))
}

/// Parse one line of a body. Returns `None` when the text is not a task line at all.
///
/// The id is only checked for shape here; [`managed`] is what pins it to a task.
pub fn parse(text: &str) -> Option<Line> {
    let line = text.trim_end();
    let (rest, checked, cancelled) = if let Some(rest) = line.strip_prefix("- [ ] ") {
        (rest, false, false)
    } else if let Some(rest) = line
        .strip_prefix("- [x] ")
        .or_else(|| line.strip_prefix("- [X] "))
    {
        (rest, true, false)
    } else if let Some(rest) = line.strip_prefix("- [-] ") {
        (rest, false, true)
    } else if let Some(rest) = line.strip_prefix("- [ ]") {
        (rest, false, false)
    } else {
        return None;
    };
    let (before_id, id) = rest.rsplit_once(&format!(" {ID_MARK} "))?;
    let id = id.trim();
    if !plausibly_ours(id) {
        return None;
    }
    let mut title: Vec<&str> = Vec::new();
    let mut due = None;
    let mut recur = None;
    let mut done_on = None;
    let mut extra = String::new();
    let mut tokens = before_id.split_whitespace();
    let mut in_metadata = false;
    while let Some(token) = tokens.next() {
        if !is_signifier(token) {
            if in_metadata {
                extra.push_str(token);
                extra.push(' ');
            } else {
                title.push(token);
            }
            continue;
        }
        in_metadata = true;
        let Some(value) = tokens.next() else { break };
        match token {
            DUE_MARK => due = Due::parse(value).ok(),
            RECUR_MARK => recur = Some(value.to_string()),
            DONE_MARK => done_on = NaiveDate::parse_from_str(value, "%Y-%m-%d").ok(),
            // A repeated `🆔` is another identity claim, not unknown metadata: the last one on
            // the line is the id (already read above), and it must never be re-emitted twice.
            ID_MARK => {}
            other => {
                extra.push_str(other);
                extra.push(' ');
                extra.push_str(value);
                extra.push(' ');
            }
        }
    }
    Some(Line {
        title: title.join(" "),
        checked,
        cancelled,
        due,
        recur,
        done_on,
        id: id.to_string(),
        extra: extra.trim().to_string(),
    })
}

/// The managed line for `id`, when the body's first line is one.
pub fn managed(body: &str, id: &str) -> Option<Line> {
    let first = body.lines().next()?;
    let line = parse(first)?;
    (line.id == id).then_some(line)
}

/// `body` and, when its first line is the managed line for `id`, that line and the remainder.
pub fn split<'a>(body: &'a str, id: &str) -> (Option<Line>, &'a str) {
    let Some(line) = managed(body, id) else {
        return (None, body);
    };
    let rest = body
        .split_once('\n')
        .map(|(_, tail)| tail)
        .unwrap_or_default();
    (Some(line), rest)
}

/// `body` with `line` as its first line, replacing a managed line if one is already there.
pub fn with_line(body: &str, id: &str, line: &str) -> String {
    let (_, rest) = split(body, id);
    if rest.is_empty() {
        line.to_string()
    } else {
        format!("{line}\n{rest}")
    }
}

/// `body` without its managed line — the user's own Markdown, which is what a surface shows.
pub fn without_line(body: &str, id: &str) -> String {
    split(body, id).1.trim_start_matches('\n').to_string()
}

/// Render the line a task's frontmatter says it should carry. `None` when the meta is not a task.
///
/// `extra` is the unowned signifier tail carried over from the line the file had, so an
/// editor's unknown metadata survives a Shards write.
pub fn render(meta: &Meta, extra: &str) -> Option<String> {
    let id = meta_str(meta, "id")?;
    if !plausibly_ours(id) {
        return None;
    }
    let title = meta_str(meta, "title")?;
    let status = meta_str(meta, "status").unwrap_or("open");
    let checkbox = match status {
        "done" => "x",
        "cancelled" => "-",
        _ => " ",
    };
    let mut out = format!("- [{checkbox}] {title}");
    if let Some(rule) = meta_str(meta, "recur").and_then(|raw| Rule::parse(raw).ok()) {
        out.push(' ');
        out.push_str(RECUR_MARK);
        out.push(' ');
        out.push_str(&rule.to_string());
    }
    if let Some(due) = meta.get("due").and_then(Due::from_value) {
        out.push(' ');
        out.push_str(DUE_MARK);
        out.push(' ');
        out.push_str(&due.to_string());
    }
    if checkbox != " " {
        if let Some(at) = meta_time(meta, "completed") {
            out.push(' ');
            out.push_str(DONE_MARK);
            out.push(' ');
            out.push_str(&at.date_naive().to_string());
        }
    }
    if !extra.is_empty() {
        out.push(' ');
        out.push_str(extra);
    }
    out.push(' ');
    out.push_str(ID_MARK);
    out.push(' ');
    out.push_str(id);
    Some(out)
}

/// The body Shards writes: the frontmatter's own line at the top, every other byte untouched.
///
/// This is the single place the line is produced, so no verb can write a stale one.
pub fn canonical_body(meta: &Meta, body: &str) -> String {
    canonical(meta, body).1
}

/// The line a task's frontmatter says it should carry, and the body that would carry it.
///
/// `None` for the line when the meta is not a task. The body is returned unchanged when there is
/// no line to write, so a caller can compare it with what is on disk to decide whether a write
/// is needed at all.
pub fn canonical(meta: &Meta, body: &str) -> (Option<String>, String) {
    let Some(id) = meta_str(meta, "id") else {
        return (None, body.to_string());
    };
    let (existing, rest) = split(body, id);
    let extra = existing
        .as_ref()
        .map(|line| line.extra.clone())
        .unwrap_or_default();
    match render(meta, &extra) {
        Some(line) => {
            let out = with_line(body, id, &line);
            (Some(line), out)
        }
        None => (None, rest.to_string()),
    }
}

/// A stable 64-bit FNV-1a digest of a line, in lower-case hex.
///
/// Stored as `line_digest` on every task Shards writes. Comparing it with the digest of the line
/// on disk tells a read which side changed since Shards last wrote the file: a different digest
/// means an editor rewrote the line, an equal one means the frontmatter is what moved. It is a
/// change detector, not a security boundary.
pub fn digest(line: &str) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in line.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{hash:016x}")
}

/// The instant an editor's `✅` date denotes: that date at midnight UTC, or now.
pub fn tick_instant(date: Option<NaiveDate>) -> DateTime<Utc> {
    date.and_then(|d| d.and_hms_opt(0, 0, 0))
        .and_then(|naive| Utc.from_local_datetime(&naive).single())
        .unwrap_or_else(now_utc)
}

/// Advance a recurring task by exactly one occurrence for a completion an editor recorded.
///
/// Returns `false` — and touches nothing — for a task with no readable rule, so a malformed
/// `recur` never blocks a completion and never invents a date. Otherwise this is the same step
/// `finish` takes for a series: the due date moves, a pinned rule and the deadline follow it, and
/// the task stays open with the completion stamped. The managed line is then re-rendered
/// unchecked from the moved frontmatter, so the tick cannot be consumed a second time.
pub fn advance_on_tick(meta: &mut Meta, at: DateTime<Utc>) -> bool {
    let Some(rule) = meta
        .get("recur")
        .and_then(Value::as_scalar_text)
        .and_then(|raw| Rule::parse(&raw).ok())
    else {
        return false;
    };
    let current = meta.get("due").and_then(Due::from_value);
    let from_completion = meta_str(meta, "recur_from") == Some("completion");
    let Ok(step) = recur::advance(&rule, from_completion, current, today_local()) else {
        return false;
    };
    meta.insert("due".into(), step.due.to_value());
    if let Some(pinned) = &step.rule {
        meta.insert("recur".into(), Value::str(pinned.to_string()));
    }
    if let Some(deadline) = meta.get("deadline").and_then(recur::deadline_from_value) {
        let moved = recur::shift_days(deadline, step.delta_days);
        meta.insert("deadline".into(), recur::date_value(moved));
    }
    meta.insert("status".into(), Value::str("open"));
    meta.insert("claimed_by".into(), Value::Null);
    meta.insert("completed".into(), ts_value(&at));
    meta.insert("updated".into(), ts_value(&at));
    true
}

/// Apply an editor's line onto the frontmatter, field by field. Returns whether anything moved.
///
/// Only the four editor-owned fields are touched. A field the line does not carry — no `📅`, no
/// `🔁` — is a deliberate clear by the editor, except for an unparseable `🔁`, which is ignored
/// so a typo cannot wipe a recurrence.
pub fn reconcile(meta: &mut Meta, line: &Line) -> bool {
    let mut changed = false;

    if !line.title.is_empty() && meta_str(meta, "title") != Some(line.title.as_str()) {
        meta.insert("title".into(), Value::str(line.title.clone()));
        changed = true;
    }

    if line.due != meta.get("due").and_then(Due::from_value) {
        match line.due {
            Some(due) => {
                meta.insert("due".into(), due.to_value());
            }
            None => {
                meta.shift_remove("due");
            }
        }
        changed = true;
    }

    if let Some(raw) = line.recur.as_deref() {
        if let Ok(rule) = Rule::parse(raw) {
            let canonical = rule.to_string();
            if meta_str(meta, "recur") != Some(canonical.as_str()) {
                meta.insert("recur".into(), Value::str(canonical));
                changed = true;
            }
        }
    } else if meta.get("recur").is_some() {
        meta.shift_remove("recur");
        meta.shift_remove("recur_from");
        changed = true;
    }

    let recurring = meta
        .get("recur")
        .and_then(Value::as_str)
        .and_then(|raw| Rule::parse(raw).ok())
        .is_some();
    let status = meta_str(meta, "status").unwrap_or("open").to_string();
    if line.cancelled {
        if status != "cancelled" {
            meta.insert("status".into(), Value::str("cancelled"));
            changed = true;
        }
    } else if line.checked {
        if recurring {
            if meta.get("completed").is_none() {
                meta.insert("completed".into(), ts_value(&tick_instant(line.done_on)));
                changed = true;
            }
        } else if status != "done" {
            meta.insert("status".into(), Value::str("done"));
            meta.insert("completed".into(), ts_value(&tick_instant(line.done_on)));
            changed = true;
        }
    } else if matches!(status.as_str(), "done" | "cancelled") {
        meta.insert("status".into(), Value::str("open"));
        meta.shift_remove("completed");
        changed = true;
    }

    changed
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;
    use crate::fm::Meta;

    fn meta(pairs: &[(&str, &str)]) -> Meta {
        let mut out = Meta::new();
        for (key, value) in pairs {
            out.insert((*key).to_string(), Value::str(*value));
        }
        out
    }

    fn open_task() -> Meta {
        meta(&[
            ("id", "t-1S4Z"),
            ("type", "task"),
            ("title", "Ship it"),
            ("status", "open"),
        ])
    }

    #[test]
    fn a_task_renders_its_line_with_the_id_last() {
        let mut task = open_task();
        task.insert("due".into(), Due::parse("2026-11-05").unwrap().to_value());
        task.insert("recur".into(), Value::str("FREQ=WEEKLY;BYDAY=MO"));
        let line = render(&task, "").expect("a task renders");
        assert_eq!(
            line,
            "- [ ] Ship it 🔁 FREQ=WEEKLY;BYDAY=MO 📅 2026-11-05 🆔 t-1S4Z"
        );
    }

    #[test]
    fn a_done_task_renders_a_checked_box_and_its_done_date() {
        let mut task = open_task();
        task.insert("status".into(), Value::str("done"));
        task.insert("completed".into(), ts_value(&tick_instant(None)));
        let line = render(&task, "").expect("a task renders");
        assert!(line.starts_with("- [x] Ship it"), "{line}");
        assert!(line.contains(DONE_MARK), "{line}");
    }

    #[test]
    fn the_line_digest_is_stable_and_changes_with_the_line() {
        assert_eq!(digest("- [ ] A 🆔 t-1"), digest("- [ ] A 🆔 t-1"));
        assert_ne!(digest("- [ ] A 🆔 t-1"), digest("- [x] A 🆔 t-1"));
        assert_ne!(digest("- [ ] A 🆔 t-1"), digest("- [ ] A 🆔 t-2"));
        assert_eq!(digest("").len(), 16);
    }

    #[test]
    fn an_ordinary_emoji_in_the_title_is_not_a_signifier() {
        let line = parse("- [ ] 🚀 Launch the site 🆔 t-1S4Z").expect("parses");
        assert_eq!(line.title, "🚀 Launch the site");
        assert_eq!(line.extra, "");
        let mut task = open_task();
        task.insert("title".into(), Value::str(line.title.clone()));
        assert_eq!(
            render(&task, &line.extra).as_deref(),
            Some("- [ ] 🚀 Launch the site 🆔 t-1S4Z")
        );
    }

    #[test]
    fn a_duplicated_id_on_the_line_is_never_rendered_twice() {
        let body = "- [x] Ship it 📅 2026-11-05 🆔 t-1S4Z 🆔 t-1S4Z";
        let parsed = parse(body).expect("parses");
        assert_eq!(parsed.id, "t-1S4Z");
        assert_eq!(parsed.extra, "", "an owned mark is never unknown metadata");
        let mut task = open_task();
        task.insert("due".into(), Due::parse("2026-11-05").unwrap().to_value());
        assert_eq!(
            canonical_body(&task, body),
            "- [ ] Ship it 📅 2026-11-05 🆔 t-1S4Z"
        );
    }

    #[test]
    fn canonical_reports_the_line_it_would_write() {
        let mut task = open_task();
        task.insert("due".into(), Due::parse("2026-11-05").unwrap().to_value());
        let (line, body) = canonical(&task, "Body");
        assert_eq!(
            line.as_deref(),
            Some("- [ ] Ship it 📅 2026-11-05 🆔 t-1S4Z")
        );
        assert_eq!(body, "- [ ] Ship it 📅 2026-11-05 🆔 t-1S4Z\nBody");
    }

    #[test]
    fn a_ticked_recurring_task_advances_exactly_one_occurrence() {
        let mut task = open_task();
        task.insert("due".into(), Due::parse("2026-11-05").unwrap().to_value());
        task.insert("recur".into(), Value::str("FREQ=DAILY"));
        let at = tick_instant(None);
        assert!(advance_on_tick(&mut task, at));
        let next = task
            .get("due")
            .and_then(Due::from_value)
            .expect("a due date");
        assert_ne!(next, Due::parse("2026-11-05").unwrap(), "the series moved");
        assert_eq!(meta_str(&task, "status"), Some("open"));
        assert_eq!(task.get("completed"), Some(&ts_value(&at)));
        // The rendered line is unchecked and carries the new date: the tick cannot repeat.
        let line = render(&task, "").expect("a task renders");
        assert!(line.starts_with("- [ ] Ship it"), "{line}");
        assert!(line.contains(&next.to_string()), "{line}");
    }

    #[test]
    fn a_task_with_no_rule_never_advances_on_a_tick() {
        let mut task = open_task();
        task.insert("due".into(), Due::parse("2026-11-05").unwrap().to_value());
        assert!(!advance_on_tick(&mut task, tick_instant(None)));
        assert_eq!(
            task.get("due").and_then(Due::from_value),
            Due::parse("2026-11-05").ok()
        );
    }

    #[test]
    fn a_line_round_trips_through_render_and_parse() {
        let mut task = open_task();
        task.insert(
            "due".into(),
            Due::parse("2026-11-05T09:30").unwrap().to_value(),
        );
        let line = render(&task, "⏳ 2026-11-01").expect("a task renders");
        let parsed = parse(&line).expect("it parses");
        assert_eq!(parsed.id, "t-1S4Z");
        assert_eq!(parsed.title, "Ship it");
        assert!(!parsed.checked);
        assert_eq!(parsed.due, Due::parse("2026-11-05T09:30").ok());
        assert_eq!(parsed.extra, "⏳ 2026-11-01");
    }

    #[test]
    fn a_checklist_item_without_an_id_is_not_a_managed_line() {
        assert!(parse("- [ ] buy milk").is_none());
        assert!(parse("- [ ] buy milk 🆔 n-1234").is_none());
        assert!(managed("- [ ] buy milk", "t-1S4Z").is_none());
    }

    #[test]
    fn a_line_for_another_task_is_not_this_tasks_line() {
        let body = "- [ ] Ship it 🆔 t-OTHR\n\nOriginal body.";
        assert!(managed(body, "t-1S4Z").is_none());
        assert!(managed(body, "t-OTHR").is_some());
    }

    #[test]
    fn an_external_rename_reaches_the_frontmatter() {
        let mut task = open_task();
        let line = parse("- [x] Shipped it 📅 2026-12-01 🆔 t-1S4Z").expect("parses");
        assert!(reconcile(&mut task, &line));
        assert_eq!(meta_str(&task, "title"), Some("Shipped it"));
        assert_eq!(meta_str(&task, "status"), Some("done"));
        assert_eq!(
            task.get("due").and_then(Due::from_value),
            Due::parse("2026-12-01").ok()
        );
    }

    #[test]
    fn clearing_due_and_recur_on_the_line_clears_them_in_frontmatter() {
        let mut task = open_task();
        task.insert("due".into(), Due::parse("2026-11-05").unwrap().to_value());
        task.insert("recur".into(), Value::str("FREQ=DAILY"));
        task.insert("recur_from".into(), Value::str("due"));
        let line = parse("- [ ] Ship it 🆔 t-1S4Z").expect("parses");
        assert!(reconcile(&mut task, &line));
        assert!(task.get("due").is_none());
        assert!(task.get("recur").is_none());
        assert!(task.get("recur_from").is_none());
    }

    #[test]
    fn a_typo_in_the_rule_does_not_wipe_the_recurrence() {
        let mut task = open_task();
        task.insert("recur".into(), Value::str("FREQ=DAILY"));
        let line = parse("- [ ] Ship it 🔁 every day 🆔 t-1S4Z").expect("parses");
        reconcile(&mut task, &line);
        assert_eq!(meta_str(&task, "recur"), Some("FREQ=DAILY"));
    }

    #[test]
    fn a_checked_recurring_task_keeps_its_status_and_records_the_completion() {
        let mut task = open_task();
        task.insert("recur".into(), Value::str("FREQ=DAILY"));
        let line = parse("- [x] Ship it 🔁 FREQ=DAILY 📅 2026-11-05 🆔 t-1S4Z").expect("parses");
        assert!(reconcile(&mut task, &line));
        assert_eq!(meta_str(&task, "status"), Some("open"));
        assert!(task.get("completed").is_some());
    }

    #[test]
    fn an_unchecked_line_reopens_a_finished_task() {
        let mut task = open_task();
        task.insert("status".into(), Value::str("done"));
        task.insert("completed".into(), ts_value(&tick_instant(None)));
        let line = parse("- [ ] Ship it 🆔 t-1S4Z").expect("parses");
        assert!(reconcile(&mut task, &line));
        assert_eq!(meta_str(&task, "status"), Some("open"));
        assert!(task.get("completed").is_none());
    }

    #[test]
    fn canonical_body_puts_the_line_first_and_keeps_every_other_byte() {
        let mut task = open_task();
        task.insert("due".into(), Due::parse("2026-11-05").unwrap().to_value());
        let body = "## Outcome\n\nShipped.\n";
        let out = canonical_body(&task, body);
        assert_eq!(
            out,
            "- [ ] Ship it 📅 2026-11-05 🆔 t-1S4Z\n## Outcome\n\nShipped.\n"
        );
        assert_eq!(without_line(&out, "t-1S4Z"), body);
    }

    #[test]
    fn canonical_body_replaces_a_stale_line_instead_of_duplicating_it() {
        let mut task = open_task();
        task.insert("title".into(), Value::str("Ship it now"));
        let body = "- [ ] Ship it 🆔 t-1S4Z\n\nOriginal body.";
        let out = canonical_body(&task, body);
        assert_eq!(out, "- [ ] Ship it now 🆔 t-1S4Z\n\nOriginal body.");
        assert_eq!(out.matches(ID_MARK).count(), 1);
    }

    #[test]
    fn canonical_body_leaves_a_foreign_body_alone() {
        let task = open_task();
        let body = "- [ ] buy milk 🆔 n-Y62G\n- [ ] something else";
        assert_eq!(
            canonical_body(&task, body),
            format!("- [ ] Ship it 🆔 t-1S4Z\n{body}")
        );
    }
}
