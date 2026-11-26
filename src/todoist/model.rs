//! The Todoist wire shapes, their mapping onto the vault's task fields, and the field report.
//!
//! Slice 1 is a read-only pull: every value here travels from Todoist into Markdown and never
//! back. A property the vault cannot represent is named in [`Desired::unsupported`] instead of
//! being dropped, because that list is the input to the write-back slice.

use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value as Json};

use crate::domain::recur::Due;
use crate::ids::sha256_hex;
use crate::timefmt::local_minute;

/// `GET /api/v1/projects`.
#[derive(Clone, Debug, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
}

/// `GET /api/v1/sections`.
#[derive(Clone, Debug, Deserialize)]
pub struct Section {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub project_id: Option<String>,
}

/// The `due` object: a date, an optional zoned datetime, and the recurrence flag.
#[derive(Clone, Debug, Default, Deserialize)]
pub struct DueIn {
    #[serde(default)]
    pub date: Option<String>,
    #[serde(default)]
    pub datetime: Option<String>,
    #[serde(default)]
    pub timezone: Option<String>,
    #[serde(default)]
    pub string: Option<String>,
    #[serde(default)]
    pub is_recurring: bool,
}

/// The `deadline` object: a date only.
#[derive(Clone, Debug, Default, Deserialize)]
pub struct DeadlineIn {
    #[serde(default)]
    pub date: Option<String>,
}

/// One `GET /api/v1/tasks` row. Unknown keys are kept in `extra` so the field report can name
/// every property the vault has no home for, including ones Todoist adds later.
#[derive(Clone, Debug, Deserialize)]
pub struct TaskIn {
    pub id: String,
    pub content: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub project_id: String,
    #[serde(default)]
    pub section_id: Option<String>,
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub labels: Vec<String>,
    #[serde(default)]
    pub priority: u8,
    #[serde(default)]
    pub due: Option<DueIn>,
    #[serde(default)]
    pub deadline: Option<DeadlineIn>,
    #[serde(default)]
    pub completed_at: Option<String>,
    #[serde(default)]
    pub is_completed: bool,
    #[serde(flatten)]
    pub extra: Map<String, Json>,
}

/// The vault-representable state of one Todoist task. Serialised to JSON and hashed, this is
/// both the desired state and the comparison baseline: the digest of what the last pull wrote
/// lives on disk as `todoist_digest`, so a re-pull can tell "unchanged" from "Todoist moved"
/// from "the vault moved".
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Snapshot {
    pub title: String,
    pub body: String,
    pub tags: Vec<String>,
    pub priority: String,
    pub due: String,
    pub deadline: String,
    pub section: String,
    pub project: String,
    pub parent: String,
    /// `open` or `done`. `claimed` is deliberately not a value: a local claim is local state,
    /// not a Todoist field, so it must not make a task divergent.
    pub state: String,
}

impl Snapshot {
    /// The digest stored as `todoist_digest`.
    pub fn digest(&self) -> String {
        let wire = serde_json::to_string(self).unwrap_or_default();
        sha256_hex(wire.as_bytes())
    }
}

/// One Todoist task mapped onto vault fields, plus everything that could not be mapped.
#[derive(Clone, Debug)]
pub struct Desired {
    pub todoist_id: String,
    pub project_name: String,
    pub snapshot: Snapshot,
    /// When Todoist says the task is complete: the completion instant to stamp, if any.
    pub completed_at: Option<DateTime<Utc>>,
    pub unsupported: Vec<String>,
}

impl Desired {
    pub fn digest(&self) -> String {
        self.snapshot.digest()
    }
}

/// Todoist priority 1..4 is P1..P4; the vault spells them urgent/high/normal/low.
pub fn priority_label(priority: u8) -> &'static str {
    match priority {
        1 => "urgent",
        2 => "high",
        3 => "normal",
        _ => "low",
    }
}

/// Properties that are consumed by the mapping and therefore never reported.
///
/// This is an allow-list of what [`desired`] actually writes. Anything else a task carries is
/// named in the field report — including keys Todoist adds that the vault has no home for
/// (`url`, `added_at`, `added_by_uid`, `assigned_by_uid`, `user_id`).
const MAPPED_KEYS: [&str; 12] = [
    "id",
    "content",
    "description",
    "project_id",
    "section_id",
    "parent_id",
    "labels",
    "priority",
    "due",
    "deadline",
    "completed_at",
    "is_completed",
];

/// Whether a JSON value carries information (null and empty containers do not).
fn has_value(value: &Json) -> bool {
    match value {
        Json::Null => false,
        Json::String(s) => !s.is_empty(),
        Json::Array(items) => !items.is_empty(),
        Json::Object(map) => !map.is_empty(),
        _ => true,
    }
}

/// A date from Todoist in the vault's canonical `YYYY-MM-DD`, or `None`.
fn calendar_date(raw: &str) -> Option<String> {
    let date = raw.get(..10)?;
    Due::parse(date).ok().map(|due| due.date.to_string())
}

/// The vault `due`: a date, or the local wall-clock minute of a zoned datetime.
fn due_value(due: &DueIn, unsupported: &mut Vec<String>) -> Option<String> {
    if let Some(datetime) = due.datetime.as_deref().filter(|s| !s.is_empty()) {
        match DateTime::parse_from_rfc3339(datetime) {
            Ok(dt) => return Some(local_minute(dt.with_timezone(&Utc))),
            Err(_) => unsupported.push("due.datetime".to_string()),
        }
    }
    match due.date.as_deref().filter(|s| !s.is_empty()) {
        Some(raw) => {
            let value = calendar_date(raw);
            if value.is_none() {
                unsupported.push("due.date".to_string());
            }
            value
        }
        None => None,
    }
}

/// Everything the vault cannot represent on this task, deduplicated and sorted.
fn unsupported_fields(task: &TaskIn) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    if let Some(due) = &task.due {
        if due.is_recurring {
            out.push("recurrence".to_string());
        }
        if due
            .timezone
            .as_deref()
            .is_some_and(|tz| !tz.trim().is_empty())
        {
            out.push("due.timezone".to_string());
        }
        if let Some(raw) = due.datetime.as_deref().filter(|s| !s.is_empty()) {
            if DateTime::parse_from_rfc3339(raw).is_err() {
                out.push("due.datetime".to_string());
            }
        }
        if due
            .date
            .as_deref()
            .is_some_and(|d| calendar_date(d).is_none())
        {
            out.push("due.date".to_string());
        }
    }
    if let Some(deadline) = &task.deadline {
        if deadline
            .date
            .as_deref()
            .is_some_and(|d| calendar_date(d).is_none())
        {
            out.push("deadline".to_string());
        }
    }
    if !(1..=4).contains(&task.priority) {
        out.push("priority".to_string());
    }
    for (key, value) in &task.extra {
        if !MAPPED_KEYS.contains(&key.as_str()) && has_value(value) {
            out.push(key.clone());
        }
    }
    out.sort();
    out.dedup();
    out
}

/// Map one Todoist task onto the vault's fields.
///
/// `project_name` is already resolved by the caller; `section_name` and `parent_vault` are the
/// resolved targets, `None` when Todoist has no section or the task is top-level.
pub fn desired(
    task: &TaskIn,
    project_name: &str,
    section_name: Option<&str>,
    parent_vault: Option<&str>,
) -> Desired {
    let mut unsupported = unsupported_fields(task);
    let due = task
        .due
        .as_ref()
        .and_then(|due| due_value(due, &mut unsupported));
    let deadline = task.deadline.as_ref().and_then(|deadline| {
        deadline
            .date
            .as_deref()
            .filter(|s| !s.is_empty())
            .and_then(calendar_date)
    });
    let priority = priority_label(task.priority);
    let mut tags: Vec<String> = task
        .labels
        .iter()
        .map(|label| label.trim().to_string())
        .filter(|label| !label.is_empty())
        .collect();
    tags.sort();
    tags.dedup();
    let completed_at = if task.is_completed || task.completed_at.is_some() {
        task.completed_at
            .as_deref()
            .and_then(|raw| DateTime::parse_from_rfc3339(raw).ok())
            .map(|dt| dt.with_timezone(&Utc))
    } else {
        None
    };
    let done = task.is_completed || completed_at.is_some();
    let snapshot = Snapshot {
        title: task.content.trim().to_string(),
        // The body is written behind the managed line and read back with
        // `taskline::without_line`, which drops the separating newline and any leading blank
        // lines. Hashing the raw description made the stored digest disagree with the file the
        // pull had just written, so normalise it here, once, for both the write and the digest.
        body: task.description.trim_start_matches('\n').to_string(),
        tags,
        priority: priority.to_string(),
        due: due.unwrap_or_default(),
        deadline: deadline.unwrap_or_default(),
        section: section_name.unwrap_or_default().to_string(),
        project: project_name.to_string(),
        parent: parent_vault.unwrap_or_default().to_string(),
        state: if done { "done" } else { "open" }.to_string(),
    };
    unsupported.sort();
    unsupported.dedup();
    Desired {
        todoist_id: task.id.clone(),
        project_name: project_name.to_string(),
        snapshot,
        completed_at,
        unsupported,
    }
}

/// A lookup table from Todoist id to name, for sections and projects.
pub fn names(rows: &[(String, String)]) -> BTreeMap<String, String> {
    rows.iter().cloned().collect()
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;

    fn task() -> TaskIn {
        serde_json::from_value(serde_json::json!({
            "id": "42",
            "content": "Ship it",
            "description": "the body",
            "project_id": "p1",
            "labels": ["b", "a"],
            "priority": 1,
            "due": {"date": "2026-11-05"},
            "completed_at": null,
            "is_completed": false
        }))
        .unwrap()
    }

    #[test]
    fn a_full_task_maps_onto_the_vault_fields() {
        let d = desired(&task(), "Work", Some("Today"), Some("t-AB12"));
        assert_eq!(d.snapshot.title, "Ship it");
        assert_eq!(d.snapshot.body, "the body");
        assert_eq!(d.snapshot.tags, ["a", "b"]);
        assert_eq!(d.snapshot.priority, "urgent");
        assert_eq!(d.snapshot.due, "2026-11-05");
        assert_eq!(d.snapshot.section, "Today");
        assert_eq!(d.snapshot.project, "Work");
        assert_eq!(d.snapshot.parent, "t-AB12");
        assert_eq!(d.snapshot.state, "open");
        assert!(d.unsupported.is_empty());
    }

    #[test]
    fn recurrence_timezone_and_duration_are_reported_not_guessed() {
        let raw = serde_json::json!({
            "id": "42",
            "content": "Repeat",
            "project_id": "p1",
            "priority": 4,
            "due": {"date": "2026-11-05", "datetime": "2026-11-05T09:00:00Z",
                    "timezone": "Europe/Berlin", "is_recurring": true},
            "duration": {"amount": 30, "unit": "minute"}
        });
        let t: TaskIn = serde_json::from_value(raw).unwrap();
        let d = desired(&t, "Work", None, None);
        let utc = DateTime::parse_from_rfc3339("2026-11-05T09:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        assert_eq!(d.snapshot.due, local_minute(utc));
        assert!(d.unsupported.contains(&"recurrence".to_string()));
        assert!(d.unsupported.contains(&"due.timezone".to_string()));
        assert!(d.unsupported.contains(&"duration".to_string()));
    }

    #[test]
    fn completion_is_a_state_and_never_a_priority() {
        let mut t = task();
        t.priority = 0;
        t.is_completed = true;
        let d = desired(&t, "Work", None, None);
        assert_eq!(d.snapshot.state, "done");
        assert_eq!(d.snapshot.priority, "low");
        assert!(d.unsupported.contains(&"priority".to_string()));
    }

    #[test]
    fn the_digest_changes_with_a_mapped_field_and_not_with_the_id() {
        let a = desired(&task(), "Work", None, None);
        let mut other = task();
        other.content = "Renamed".to_string();
        let b = desired(&other, "Work", None, None);
        assert_ne!(a.digest(), b.digest());
        let mut same = task();
        same.id = "99".to_string();
        assert_eq!(a.digest(), desired(&same, "Work", None, None).digest());
    }
}
