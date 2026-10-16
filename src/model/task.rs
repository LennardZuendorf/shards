//! The `Task` view, its field order, and the status/priority tables.

use chrono::{DateTime, NaiveDate, Utc};

use crate::domain::recur::{deadline_from_value, Due};
use crate::domain::select::{FromMeta, SortKey, SortValue, Sortable};
use crate::fm::{Meta, Value};
use crate::model::common::{meta_str, meta_time, FieldOrder};

/// The four task statuses.
pub const TASK_STATUSES: [&str; 4] = ["open", "claimed", "done", "cancelled"];
/// The four writable priorities, most urgent first (Todoist P1..P4). Reads stay free-form.
pub const TASK_PRIORITIES: [&str; 4] = ["urgent", "high", "normal", "low"];
/// The bucket an unknown or absent priority sorts into.
pub const PRIORITY_UNRANKED: i64 = 4;

/// The two statuses that end a task's life.
pub const TERMINAL_STATUSES: [&str; 2] = ["done", "cancelled"];

/// Task key order on disk and in JSON.
pub const TASK_FIELDS: FieldOrder = FieldOrder(&[
    "id",
    "type",
    "title",
    "tags",
    "owner",
    "created",
    "updated",
    "related",
    "status",
    "priority",
    "claimed_by",
    "project",
    "blocks",
    "blocked_by",
    "due",
    "deadline",
    "recur",
    "recur_from",
    "parent",
    "section",
    "order",
    "completed",
]);

/// The fourteen v1 keys a new task always carries. The eight task-model-v2 keys after them
/// are written only when set and removed when cleared, so a v1 file never changes shape.
pub const TASK_V1_FIELD_COUNT: usize = 14;

/// The sort rank of a priority label: urgent 0, high 1, normal 2, low 3, anything else 4.
pub fn priority_rank(priority: Option<&str>) -> i64 {
    match priority {
        Some("urgent") => 0,
        Some("high") => 1,
        Some("normal") => 2,
        Some("low") => 3,
        _ => PRIORITY_UNRANKED,
    }
}

/// Whether a status ends a task's life. Reads stay tolerant; only these two are terminal.
pub fn is_terminal(status: &str) -> bool {
    TERMINAL_STATUSES.contains(&status)
}

/// A validated task.
#[derive(Clone, Debug)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub tags: Vec<String>,
    pub owner: Option<String>,
    pub created: Option<DateTime<Utc>>,
    pub updated: Option<DateTime<Utc>>,
    pub related: Vec<String>,
    pub status: String,
    pub priority: Option<String>,
    pub claimed_by: Option<String>,
    pub project: Option<String>,
    pub blocks: Vec<String>,
    pub blocked_by: Vec<String>,
    /// task-model-v2. Every v2 field is optional and read tolerantly: a hand-edited value of
    /// the wrong shape reads as absent (and round-trips untouched) rather than hiding the task.
    pub due: Option<Due>,
    pub deadline: Option<NaiveDate>,
    pub recur: Option<String>,
    pub recur_from: Option<String>,
    pub parent: Option<String>,
    pub section: Option<String>,
    pub order: Option<f64>,
    pub completed: Option<DateTime<Utc>>,
    pub meta: Meta,
}

/// A scalar read as text for a tolerant v2 field: `section: 2026` is the section "2026".
fn scalar_text(meta: &Meta, key: &str) -> Option<String> {
    meta.get(key)
        .and_then(Value::as_scalar_text)
        .filter(|s| !s.is_empty())
}

/// A numeric `order`, integer or float; anything else reads as absent.
fn order_value(meta: &Meta) -> Option<f64> {
    match meta.get("order")? {
        Value::Int(i) => Some(*i as f64),
        Value::Float(f) if f.is_finite() => Some(*f),
        Value::Str(s) => s.trim().parse::<f64>().ok().filter(|f| f.is_finite()),
        _ => None,
    }
}

/// A `str | None` field: absent or explicitly null is `None`, a plain string is `Some`,
/// anything else fails validation.
fn optional_text(meta: &Meta, key: &str) -> Option<Option<String>> {
    match meta.get(key) {
        None | Some(Value::Null) => Some(None),
        Some(Value::Str(s)) => Some(Some(s.clone())),
        Some(_) => None,
    }
}

/// A `list[str]` field: absent or null is `[]`, a list of strings is itself, anything else
/// fails validation.
fn string_list(meta: &Meta, key: &str) -> Option<Vec<String>> {
    match meta.get(key) {
        None | Some(Value::Null) => Some(Vec::new()),
        Some(Value::List(items)) => {
            let mut out = Vec::with_capacity(items.len());
            for item in items {
                out.push(item.as_str()?.to_string());
            }
            Some(out)
        }
        Some(_) => None,
    }
}

impl FromMeta for Task {
    fn from_meta(meta: &Meta) -> Option<Task> {
        let id = meta_str(meta, "id")?;
        if !id.starts_with("t-") {
            return None;
        }
        // `type` is pinned to the literal "task" — a note filed under tasks/ is not a task.
        if meta_str(meta, "type") != Some("task") {
            return None;
        }
        let title = meta_str(meta, "title")?.to_string();
        // `created` and `updated` are required datetimes; a naive value reads as UTC.
        let created = meta_time(meta, "created")?;
        let updated = meta_time(meta, "updated")?;
        let status = match meta.get("status") {
            None | Some(Value::Null) => "open".to_string(),
            Some(Value::Str(s)) if TASK_STATUSES.contains(&s.as_str()) => s.clone(),
            Some(_) => return None,
        };
        Some(Task {
            id: id.to_string(),
            title,
            tags: string_list(meta, "tags")?,
            owner: optional_text(meta, "owner")?,
            created: Some(created),
            updated: Some(updated),
            related: string_list(meta, "related")?,
            status,
            // Free-form on read (map/core.md §9.14); constrained only at the write boundary.
            priority: optional_text(meta, "priority")?,
            claimed_by: optional_text(meta, "claimed_by")?,
            project: optional_text(meta, "project")?,
            blocks: string_list(meta, "blocks")?,
            blocked_by: string_list(meta, "blocked_by")?,
            due: meta.get("due").and_then(Due::from_value),
            deadline: meta.get("deadline").and_then(deadline_from_value),
            recur: scalar_text(meta, "recur"),
            recur_from: scalar_text(meta, "recur_from"),
            parent: scalar_text(meta, "parent"),
            section: scalar_text(meta, "section"),
            order: order_value(meta),
            completed: meta_time(meta, "completed"),
            meta: meta.clone(),
        })
    }
}

impl Sortable for Task {
    fn sort_value(&self, key: SortKey) -> SortValue {
        match key {
            SortKey::Title => SortValue::Text(self.title.clone()),
            SortKey::Created => SortValue::Time(self.created),
            SortKey::Priority => SortValue::Rank(priority_rank(self.priority.as_deref())),
            SortKey::Due => SortValue::Due(self.due),
            SortKey::Order => SortValue::Order(self.order),
            _ => SortValue::Time(self.updated),
        }
    }
}

#[cfg(test)]
#[allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]
mod tests {
    use super::*;
    use crate::fm::parse_meta;

    const FULL: &str = "id: t-A1\ntype: task\ntitle: Ship it\ntags:\n  - x\nowner: alice\n\
                        created: 2026-01-01T00:00:00Z\nupdated: 2026-01-02T00:00:00Z\n\
                        related: []\nstatus: open\npriority: high\nclaimed_by: null\n\
                        project: n-P\nblocks: []\nblocked_by:\n  - t-B2\n";

    fn task(yaml: &str) -> Option<Task> {
        Task::from_meta(&parse_meta(yaml).unwrap())
    }

    #[test]
    fn a_complete_task_validates() {
        let t = task(FULL).unwrap();
        assert_eq!(t.id, "t-A1");
        assert_eq!(t.title, "Ship it");
        assert_eq!(t.tags, ["x"]);
        assert_eq!(t.owner.as_deref(), Some("alice"));
        assert_eq!(t.status, "open");
        assert_eq!(t.priority.as_deref(), Some("high"));
        assert_eq!(t.claimed_by, None);
        assert_eq!(t.project.as_deref(), Some("n-P"));
        assert_eq!(t.blocked_by, ["t-B2"]);
        assert!(t.blocks.is_empty());
        assert!(t.created.is_some() && t.updated.is_some());
    }

    #[test]
    fn admission_requires_a_t_prefixed_id_and_a_task_type() {
        assert!(task(&FULL.replace("id: t-A1", "id: n-A1")).is_none());
        assert!(task(&FULL.replace("type: task", "type: note")).is_none());
        assert!(task(&FULL.replace("type: task\n", "")).is_none());
    }

    #[test]
    fn required_scalars_are_required() {
        assert!(task(&FULL.replace("title: Ship it\n", "")).is_none());
        assert!(task(&FULL.replace("created: 2026-01-01T00:00:00Z\n", "")).is_none());
        assert!(task(&FULL.replace("updated: 2026-01-02T00:00:00Z\n", "")).is_none());
    }

    #[test]
    fn an_unknown_status_fails_but_an_absent_one_defaults_to_open() {
        assert!(task(&FULL.replace("status: open", "status: wat")).is_none());
        let t = task(&FULL.replace("status: open\n", "")).unwrap();
        assert_eq!(t.status, "open");
        for s in TASK_STATUSES {
            let t = task(&FULL.replace("status: open", &format!("status: {s}"))).unwrap();
            assert_eq!(t.status, s);
        }
    }

    #[test]
    fn priority_is_free_form_on_read() {
        let t = task(&FULL.replace("priority: high", "priority: critical")).unwrap();
        assert_eq!(t.priority.as_deref(), Some("critical"));
        assert_eq!(priority_rank(t.priority.as_deref()), PRIORITY_UNRANKED);
        let t = task(&FULL.replace("priority: high", "priority: null")).unwrap();
        assert_eq!(t.priority, None);
    }

    #[test]
    fn a_wrong_typed_field_fails_validation() {
        assert!(task(&FULL.replace("owner: alice", "owner: 3")).is_none());
        assert!(task(&FULL.replace("blocks: []", "blocks: nope")).is_none());
        assert!(task(&FULL.replace("tags:\n  - x", "tags: 7")).is_none());
    }

    #[test]
    fn the_rank_table_puts_unknowns_in_the_trailing_bucket() {
        assert_eq!(priority_rank(Some("urgent")), 0);
        assert_eq!(priority_rank(Some("high")), 1);
        assert_eq!(priority_rank(Some("normal")), 2);
        assert_eq!(priority_rank(Some("low")), 3);
        assert_eq!(priority_rank(Some("critical")), 4);
        assert_eq!(priority_rank(None), 4);
        // The writable vocabulary is listed in rank order.
        for (rank, p) in TASK_PRIORITIES.iter().enumerate() {
            assert_eq!(priority_rank(Some(p)), rank as i64);
        }
    }

    #[test]
    fn terminal_covers_exactly_done_and_cancelled() {
        assert!(is_terminal("done"));
        assert!(is_terminal("cancelled"));
        assert!(!is_terminal("open"));
        assert!(!is_terminal("claimed"));
    }

    #[test]
    fn sort_values_follow_the_key() {
        let t = task(FULL).unwrap();
        assert_eq!(
            t.sort_value(SortKey::Title),
            SortValue::Text("Ship it".into())
        );
        assert_eq!(t.sort_value(SortKey::Priority), SortValue::Rank(1));
        assert_eq!(t.sort_value(SortKey::Due), SortValue::Due(None));
        assert_eq!(t.sort_value(SortKey::Order), SortValue::Order(None));
        assert_eq!(t.sort_value(SortKey::Created), SortValue::Time(t.created));
        assert_eq!(t.sort_value(SortKey::Updated), SortValue::Time(t.updated));
    }

    #[test]
    fn the_field_order_is_the_fourteen_v1_keys_then_the_eight_v2_keys() {
        assert_eq!(
            TASK_FIELDS.fields(),
            [
                "id",
                "type",
                "title",
                "tags",
                "owner",
                "created",
                "updated",
                "related",
                "status",
                "priority",
                "claimed_by",
                "project",
                "blocks",
                "blocked_by",
                "due",
                "deadline",
                "recur",
                "recur_from",
                "parent",
                "section",
                "order",
                "completed"
            ]
        );
        assert_eq!(TASK_FIELDS.fields().len(), TASK_V1_FIELD_COUNT + 8);
        assert!(!TASK_FIELDS.is_known("extra"));
    }

    #[test]
    fn v2_fields_read_from_typed_and_quoted_scalars() {
        let yaml = format!(
            "{FULL}due: 2026-10-20T09:30\ndeadline: \"2026-10-31\"\nrecur: FREQ=WEEKLY;BYDAY=MO\n\
             recur_from: completion\nparent: t-P1\nsection: 2026\norder: 3\n\
             completed: 2026-10-15T08:00:00Z\n"
        );
        let t = task(&yaml).unwrap();
        assert_eq!(t.due.unwrap().to_string(), "2026-10-20T09:30");
        assert_eq!(t.deadline.unwrap().to_string(), "2026-10-31");
        assert_eq!(t.recur.as_deref(), Some("FREQ=WEEKLY;BYDAY=MO"));
        assert_eq!(t.recur_from.as_deref(), Some("completion"));
        assert_eq!(t.parent.as_deref(), Some("t-P1"));
        assert_eq!(t.section.as_deref(), Some("2026"));
        assert_eq!(t.order, Some(3.0));
        assert!(t.completed.is_some());
        assert_eq!(t.sort_value(SortKey::Order), SortValue::Order(Some(3.0)));
    }

    #[test]
    fn a_malformed_v2_field_reads_as_absent_and_never_hides_the_task() {
        let yaml = format!("{FULL}due: someday\ndeadline: 7\norder: high\nsection: null\n");
        let t = task(&yaml).unwrap();
        assert_eq!(t.due, None);
        assert_eq!(t.deadline, None);
        assert_eq!(t.order, None);
        assert_eq!(t.section, None);
        // The raw values still round-trip in the map.
        assert_eq!(t.meta["due"], Value::str("someday"));
    }

    #[test]
    fn a_v1_task_has_no_v2_values() {
        let t = task(FULL).unwrap();
        assert!(t.due.is_none() && t.deadline.is_none() && t.recur.is_none());
        assert!(t.parent.is_none() && t.section.is_none() && t.order.is_none());
        assert!(t.completed.is_none() && t.recur_from.is_none());
    }
}
