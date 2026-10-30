//! Task lifecycle verbs.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use chrono::{NaiveDate, NaiveDateTime};

use crate::config::Config;
use crate::domain::recur::{self, Due, Rule};
use crate::domain::{deps, validate_owner, AppendOpts, Filter};
use crate::error::{Result, ShardsError};
use crate::fm::{read_doc, read_meta_only, write_doc, Doc, Meta, Row, Value, View};
use crate::ids::generate_id;
use crate::model::common::{meta_str, meta_strings, optional_str, ts_value};
use crate::model::task::{is_terminal, Task, TASK_PRIORITIES, TASK_STATUSES};
use crate::model::{ordered, TASK_FIELDS};
use crate::spaces::Space;
use crate::storage::{create_lock, entity_lock, hold, iter_md, safe_resolve};
use crate::text::{
    append_to_end, append_under_section, edit_distance, format_block, format_stamp, slugify,
};
use crate::timefmt::{iso_seconds_z, iso_z, now_local, now_utc, today_local};

/// The two folders a task can live in, walked in this order and never recursively.
pub const TASK_SUBDIRS: [&str; 2] = ["open", "done"];

/// The heading `finish` writes.
pub const OUTCOME_HEADING: &str = "## Outcome";
/// The heading `cancel` writes.
pub const CANCELLED_HEADING: &str = "## Cancelled";

/// Which slice of the task list a caller wants.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum Availability {
    #[default]
    Any,
    /// `status == open && claimed_by == null` — the Python meaning, dependency-blind.
    Available,
    /// Available and unblocked.
    Ready,
    /// Open or claimed with at least one unsatisfied blocker.
    Blocked,
}

/// The two terminal transitions.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Terminal {
    Finish,
    Cancel,
}

impl Terminal {
    /// The section heading this transition appends under.
    pub fn heading(self) -> &'static str {
        match self {
            Terminal::Finish => OUTCOME_HEADING,
            Terminal::Cancel => CANCELLED_HEADING,
        }
    }

    /// The status this transition writes.
    pub fn status(self) -> &'static str {
        match self {
            Terminal::Finish => "done",
            Terminal::Cancel => "cancelled",
        }
    }

    /// The mutation verb the CLI reports.
    pub fn verb(self) -> &'static str {
        match self {
            Terminal::Finish => "finished",
            Terminal::Cancel => "cancelled",
        }
    }

    /// The verb for a status already on disk, so a no-op reports the state it found.
    pub fn verb_for(status: &str) -> Option<&'static str> {
        match status {
            "done" => Some(Terminal::Finish.verb()),
            "cancelled" => Some(Terminal::Cancel.verb()),
            _ => None,
        }
    }
}

/// What `task new` was asked to create.
///
/// The task-model-v2 values arrive as raw text and are validated before any lock or write;
/// an empty string is the same as absent.
#[derive(Clone, Debug, Default)]
pub struct NewTask {
    pub priority: Option<String>,
    pub tags: Vec<String>,
    pub owner: Option<String>,
    pub body: String,
    pub project: Option<String>,
    pub blocks: Vec<String>,
    pub blocked_by: Vec<String>,
    /// `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`, floating local time.
    pub due: Option<String>,
    /// `YYYY-MM-DD`.
    pub deadline: Option<String>,
    /// An RRULE subset string; stored in canonical spelling.
    pub recur: Option<String>,
    /// `due` | `completion`.
    pub recur_from: Option<String>,
    /// An existing task id.
    pub parent: Option<String>,
    pub section: Option<String>,
    pub order: Option<f64>,
}

/// What `task update` was asked to change.
///
/// `None` keeps a field. For `priority`, `project` and every v2 text field, `Some("")`
/// clears it: v1 keys become `null`, v2 keys are removed. `order: Some(None)` clears the rank.
#[derive(Clone, Debug, Default)]
pub struct UpdateTask {
    pub priority: Option<String>,
    pub tags: Option<String>,
    pub title: Option<String>,
    pub project: Option<String>,
    pub owner: Option<String>,
    pub blocks: Option<Vec<String>>,
    pub blocked_by: Option<Vec<String>>,
    /// Only `open` is accepted: it reopens a done or cancelled task (moving it back to
    /// `open/`, clearing `completed` and any stale claim) and clears `completed` on an open one.
    pub status: Option<String>,
    pub due: Option<String>,
    pub deadline: Option<String>,
    pub recur: Option<String>,
    pub recur_from: Option<String>,
    pub parent: Option<String>,
    pub section: Option<String>,
    pub order: Option<Option<f64>>,
}

/// What a `finish`/`cancel` reports.
#[derive(Clone, Debug)]
pub struct Terminated {
    pub task: Task,
    /// Dependents that became ready — a report; nothing is written to them.
    pub unblocked: Vec<String>,
    /// Set when a recurring task was advanced instead of closed, or when an `expected_due`
    /// precondition found it already advanced (then it is the current `due`).
    pub next_due: Option<String>,
    /// Things the caller should know that did not stop the call: a stored `recur` that does
    /// not parse (the task was closed instead), or a precondition that turned the call into a
    /// no-op.
    pub warnings: Vec<String>,
}

/// Task-only date predicates for `task list`, applied before the shared select so a limit
/// cannot defeat them. `before`/`after` compare on the calendar day of `due`; `overdue` also
/// reads a timed `due` against the local wall clock.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct DueFilter {
    /// `due` strictly before this date.
    pub before: Option<NaiveDate>,
    /// `due` strictly after this date.
    pub after: Option<NaiveDate>,
    /// Not done or cancelled, with `due` before now (local time): a date-only `due` before
    /// today, or a timed `due` whose moment has passed — earlier today counts.
    pub overdue: bool,
    /// Has any `due`.
    pub has_due: bool,
}

impl DueFilter {
    fn is_empty(&self) -> bool {
        *self == DueFilter::default()
    }

    fn matches(&self, meta: &Meta, now: NaiveDateTime) -> bool {
        if self.is_empty() {
            return true;
        }
        let Some(due) = meta.get("due").and_then(Due::from_value) else {
            return false;
        };
        if self.before.is_some_and(|d| due.date >= d) {
            return false;
        }
        if self.after.is_some_and(|d| due.date <= d) {
            return false;
        }
        if self.overdue
            && (is_terminal(meta_str(meta, "status").unwrap_or("open")) || !is_past(due, now))
        {
            return false;
        }
        true
    }
}

/// A date-only `due` is past from the next day on; a timed one once its minute is behind
/// `now` (the rule the app's due chips use).
fn is_past(due: Due, now: NaiveDateTime) -> bool {
    match due.time {
        None => due.date < now.date(),
        Some(time) => due.date.and_time(time) < now,
    }
}

/// One validated frontmatter edit: `Some` sets the key, `None` removes it.
type Edit = (&'static str, Option<Value>);

// ---------------------------------------------------------------------------------------
// paths, scanning and validation
// ---------------------------------------------------------------------------------------

/// The tasks space root, or the disabled-space validation error.
pub(crate) fn root(cfg: &Config) -> Result<&Path> {
    cfg.root(Space::Tasks)
}

/// `tasks/open` or `tasks/done`.
pub(crate) fn folder(cfg: &Config, sub: &str) -> Result<PathBuf> {
    Ok(root(cfg)?.join(sub))
}

/// Every task file, `open/` then `done/`, non-recursively — the canonical scope.
pub(crate) fn task_files(cfg: &Config) -> Vec<PathBuf> {
    let Ok(base) = root(cfg) else {
        return Vec::new();
    };
    let mut out: Vec<PathBuf> = Vec::new();
    for sub in TASK_SUBDIRS {
        out.extend(iter_md(&base.join(sub), false, &[]));
    }
    out
}

/// Id-only resolution: the file in `open/` or `done/` whose stem is exactly `id`.
///
/// A title slug never resolves a task. A corrupt sibling never blocks a different id, because
/// a non-matching file is never read.
pub(crate) fn resolve(cfg: &Config, id: &str) -> Result<PathBuf> {
    // `task_files` degrades to `[]` when the space is disabled so cross-space scans survive;
    // a verb addressing the space must still fail validation rather than report not-found.
    root(cfg)?;
    root(cfg)?;
    for path in task_files(cfg) {
        if path.file_stem().and_then(|s| s.to_str()) == Some(id) {
            return safe_resolve(&cfg.spaces, &path);
        }
    }
    Err(not_found(cfg, id))
}

/// `TaskNotFound` with up to five near-miss ids attached.
pub(crate) fn not_found(cfg: &Config, id: &str) -> ShardsError {
    ShardsError::TaskNotFound(id.to_string()).with_candidates(near_ids(cfg, id))
}

/// The five ids closest to `target` by edit distance over their slugs.
fn near_ids(cfg: &Config, target: &str) -> Vec<String> {
    let want = slugify(target);
    let mut scored: Vec<(usize, String)> = task_files(cfg)
        .into_iter()
        .filter_map(|p| {
            p.file_stem()
                .and_then(|s| s.to_str())
                .map(|s| (edit_distance(&want, &slugify(s)), s.to_string()))
        })
        .collect();
    scored.sort_by(|a, b| a.1.cmp(&b.1));
    scored.sort_by_key(|(d, _)| *d);
    scored.into_iter().take(5).map(|(_, id)| id).collect()
}

/// Whether any task file already carries this id.
pub(crate) fn id_taken(cfg: &Config, candidate: &str) -> bool {
    task_files(cfg)
        .iter()
        .any(|p| p.file_stem().and_then(|s| s.to_str()) == Some(candidate))
}

/// A validated view, or not-found — the corrupt-entity rule, in one place.
pub(crate) fn validated(meta: &Meta, id: &str) -> Result<Task> {
    use crate::domain::FromMeta;
    Task::from_meta(meta).ok_or_else(|| ShardsError::TaskNotFound(id.to_string()))
}

/// `invalid priority: 'x' (use urgent, high, normal, low)` — checked before any lock or write.
pub fn validate_priority(priority: Option<&str>) -> Result<()> {
    match priority {
        None => Ok(()),
        Some(p) if TASK_PRIORITIES.contains(&p) => Ok(()),
        Some(p) => Err(ShardsError::Validation(format!(
            "invalid priority: '{p}' (use {})",
            TASK_PRIORITIES.join(", ")
        ))),
    }
}

/// `unknown status: x (use open, claimed, done, cancelled)` — trims, drops empties,
/// order-preserving dedupe, and names every offender.
pub fn parse_status_csv(value: &str) -> Result<Option<Vec<String>>> {
    let statuses = crate::domain::select::parse_csv(value);
    if statuses.is_empty() {
        return Ok(None);
    }
    let unknown: Vec<&str> = statuses
        .iter()
        .filter(|s| !TASK_STATUSES.contains(&s.as_str()))
        .map(String::as_str)
        .collect();
    if !unknown.is_empty() {
        return Err(ShardsError::Validation(format!(
            "unknown status: {} (use {})",
            unknown.join(", "),
            TASK_STATUSES.join(", ")
        )));
    }
    Ok(Some(statuses))
}

/// The raw text of a v2 field: `None` keeps, `Some("")` clears (an edit removing the key).
/// A create-time value: present and non-blank, else unset.
fn set(value: &Option<String>) -> Option<&str> {
    value.as_deref().filter(|s| !s.trim().is_empty())
}

fn text_edit(value: Option<&str>) -> Option<Option<&str>> {
    value.map(|v| {
        let t = v.trim();
        (!t.is_empty()).then_some(t)
    })
}

/// Validate every v2 value except `parent` (which needs the graph) into edits, before any
/// lock or write. Shared by `create` (where "" means unset) and `update` (where "" clears).
#[allow(clippy::too_many_arguments)]
fn v2_edits(
    due: Option<&str>,
    deadline: Option<&str>,
    recur: Option<&str>,
    recur_from: Option<&str>,
    section: Option<&str>,
    order: Option<Option<f64>>,
) -> Result<Vec<Edit>> {
    let mut edits: Vec<Edit> = Vec::new();
    if let Some(value) = text_edit(due) {
        edits.push(("due", value.map(Due::parse).transpose()?.map(Due::to_value)));
    }
    if let Some(value) = text_edit(deadline) {
        let date = value.map(recur::parse_deadline).transpose()?;
        edits.push(("deadline", date.map(recur::date_value)));
    }
    if let Some(value) = text_edit(recur) {
        let rule = value.map(Rule::parse).transpose()?;
        edits.push(("recur", rule.map(|r| Value::str(r.to_string()))));
    }
    if let Some(value) = text_edit(recur_from) {
        if let Some(v) = value {
            recur::validate_recur_from(v)?;
        }
        edits.push(("recur_from", value.map(Value::str)));
    }
    if let Some(value) = text_edit(section) {
        edits.push(("section", value.map(Value::str)));
    }
    if let Some(value) = order {
        edits.push(("order", value.map(order_value).transpose()?));
    }
    Ok(edits)
}

/// A finite rank as a frontmatter number: an integral value stays an integer on disk.
fn order_value(order: f64) -> Result<Value> {
    if !order.is_finite() {
        return Err(ShardsError::Validation(format!(
            "invalid order: '{order}' (use a finite number)"
        )));
    }
    // 2^53: every integer up to here is exactly representable, so the cast is lossless.
    const EXACT: f64 = 9_007_199_254_740_992.0;
    if order.fract() == 0.0 && order.abs() < EXACT {
        #[allow(clippy::cast_possible_truncation)]
        let int = order as i64;
        return Ok(Value::Int(int));
    }
    Ok(Value::Float(order))
}

/// Parse an `--order` flag value: a finite number, or "" to clear.
pub fn parse_order(value: &str) -> Result<Option<f64>> {
    let text = value.trim();
    if text.is_empty() {
        return Ok(None);
    }
    text.parse::<f64>()
        .ok()
        .filter(|f| f.is_finite())
        .map(Some)
        .ok_or_else(|| {
            ShardsError::Validation(format!("invalid order: '{text}' (use a finite number)"))
        })
}

/// `parent` must name an existing task, never the task itself, and never close a cycle.
fn validate_parent(rows: &[Row], id: Option<&str>, parent: &str) -> Result<()> {
    if id == Some(parent) {
        return Err(ShardsError::Validation(format!(
            "invalid parent: '{parent}' (a task cannot be its own parent)"
        )));
    }
    let parents: HashMap<&str, Option<&str>> = rows
        .iter()
        .filter_map(|r| {
            let rid = meta_str(&r.meta, "id").filter(|i| i.starts_with("t-"))?;
            Some((rid, meta_str(&r.meta, "parent")))
        })
        .collect();
    if !parents.contains_key(parent) {
        return Err(ShardsError::Validation(format!(
            "invalid parent: '{parent}' (no such task)"
        )));
    }
    let Some(id) = id else {
        return Ok(());
    };
    // Walk up from the proposed parent; reaching `id` means the edit closes a loop. The step
    // bound also ends a walk through a pre-existing hand-made cycle.
    let mut chain: Vec<&str> = vec![id, parent];
    let mut cursor = parents.get(parent).copied().flatten();
    for _ in 0..=parents.len() {
        let Some(next) = cursor else {
            return Ok(());
        };
        chain.push(next);
        if next == id {
            return Err(ShardsError::Validation(format!(
                "parent cycle: {}",
                chain.join(" -> ")
            )));
        }
        cursor = parents.get(next).copied().flatten();
    }
    Ok(())
}

/// Apply validated edits to a frontmatter map in place. A removal keeps the relative order
/// of every other key (IndexMap `shift_remove`, never `swap_remove`).
fn apply_edits(meta: &mut Meta, edits: Vec<Edit>) {
    for (key, value) in edits {
        match value {
            Some(v) => {
                meta.insert(key.to_string(), v);
            }
            None => {
                meta.shift_remove(key);
            }
        }
    }
}

/// Write a document to `path` under the sandbox.
pub(crate) fn persist(cfg: &Config, path: &Path, doc: &Doc) -> Result<()> {
    write_doc(&cfg.spaces, path, &ordered(&TASK_FIELDS, doc))
}

/// Move a terminal file into `done/` when it is not already there, creating the folder.
///
/// `finish`/`cancel` write in place and then move, so a crash between the two strands a
/// terminal file in `open/`; the idempotent branch calls this and heals it.
fn move_if_needed(src: &Path, dest: &Path) -> Result<()> {
    if src == dest {
        return Ok(());
    }
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::rename(src, dest)?;
    Ok(())
}

// ---------------------------------------------------------------------------------------
// verbs
// ---------------------------------------------------------------------------------------

pub fn create(cfg: &Config, title: &str, o: NewTask) -> Result<Task> {
    // Every validation runs before any lock or write.
    validate_owner(cfg, o.owner.as_deref())?;
    validate_priority(o.priority.as_deref())?;
    // On create an empty value is simply unset, so only non-empty values become edits.
    let v2 = v2_edits(
        set(&o.due),
        set(&o.deadline),
        set(&o.recur),
        set(&o.recur_from),
        set(&o.section),
        o.order.map(Some),
    )?;

    let existing = rows(cfg);
    let parent = set(&o.parent).map(str::trim);
    if let Some(parent) = parent {
        validate_parent(&existing, None, parent)?;
    }
    let now = now_utc();
    let related = crate::domain::resolve_wikilinks(cfg, &o.body);
    let open_dir = folder(cfg, "open")?;

    let task = {
        // The allocator lock spans id allocation AND the write.
        let _guard = hold(&create_lock(root(cfg)?))?;
        let id = generate_id("t-", &iso_z(&now), title, &|c| id_taken(cfg, c));

        // A new node plus its proposed edges must not close a cycle.
        deps::check_acyclic(
            &with_lists(&existing, &id, &o.blocks, &o.blocked_by),
            &proposed_edges(&id, &o.blocks, &o.blocked_by),
        )?;

        let mut meta = Meta::new();
        meta.insert("id".into(), Value::str(&id));
        meta.insert("type".into(), Value::str("task"));
        meta.insert("title".into(), Value::str(title));
        meta.insert("tags".into(), Value::strings(o.tags.clone()));
        meta.insert(
            "owner".into(),
            optional_str(crate::domain::effective_owner(cfg, o.owner.as_deref()).as_deref()),
        );
        meta.insert("created".into(), ts_value(&now));
        meta.insert("updated".into(), ts_value(&now));
        meta.insert("related".into(), Value::strings(related));
        meta.insert("status".into(), Value::str("open"));
        meta.insert("priority".into(), optional_str(o.priority.as_deref()));
        meta.insert("claimed_by".into(), Value::Null);
        meta.insert("project".into(), optional_str(o.project.as_deref()));
        meta.insert("blocks".into(), Value::strings(o.blocks.clone()));
        meta.insert("blocked_by".into(), Value::strings(o.blocked_by.clone()));
        // v2 keys exist only when set; TASK_FIELDS orders them on write.
        let mut v2 = v2.clone();
        if let Some(parent) = parent {
            v2.push(("parent", Some(Value::str(parent))));
        }
        apply_edits(&mut meta, v2);
        let meta = TASK_FIELDS.reorder(&meta);

        let task = validated(&meta, &id)?;
        // A new task always lands in open/, regardless of its blockers.
        let path = safe_resolve(&cfg.spaces, &open_dir.join(format!("{id}.md")))?;
        persist(cfg, &path, &Doc::new(meta, o.body.clone()))?;
        task
    };

    // Best-effort mirrors: the authoritative side is already durable.
    deps::apply_mirrors(
        cfg,
        deps::mirror_edits(&task.id, &[], &o.blocks, &[], &o.blocked_by),
    );
    Ok(task)
}

pub fn update(cfg: &Config, id: &str, o: UpdateTask) -> Result<Task> {
    validate_owner(cfg, o.owner.as_deref())?;
    // An empty priority clears it; anything else must be in the vocabulary.
    let priority = o.priority.as_deref().map(str::trim);
    validate_priority(priority.filter(|p| !p.is_empty()))?;
    if let Some(status) = o.status.as_deref().map(str::trim) {
        if status != "open" {
            return Err(ShardsError::Validation(format!(
                "invalid status for update: '{status}' (only 'open' reopens a task; use task claim, finish or cancel)"
            )));
        }
    }
    let mut edits = v2_edits(
        o.due.as_deref(),
        o.deadline.as_deref(),
        o.recur.as_deref(),
        o.recur_from.as_deref(),
        o.section.as_deref(),
        o.order,
    )?;

    let before = rows(cfg);
    if let Some(parent) = text_edit(o.parent.as_deref()) {
        if let Some(p) = parent {
            validate_parent(&before, Some(id), p)?;
        }
        edits.push(("parent", parent.map(Value::str)));
    }
    let (old_blocks, old_blocked_by) = node_lists(&before, id);
    let new_blocks = o.blocks.clone().unwrap_or_else(|| old_blocks.clone());
    let new_blocked_by = o
        .blocked_by
        .clone()
        .unwrap_or_else(|| old_blocked_by.clone());
    let edges_change = o.blocks.is_some() || o.blocked_by.is_some();
    if edges_change {
        deps::check_acyclic(
            &with_lists(&before, id, &new_blocks, &new_blocked_by),
            &proposed_edges(id, &new_blocks, &new_blocked_by),
        )?;
    }

    let task = {
        let _guard = hold(&entity_lock(root(cfg)?, id)?)?;
        // Resolution happens again inside the lock (the TOCTOU rule).
        let path = resolve(cfg, id)?;
        let mut doc = read_doc(&path).ok_or_else(|| ShardsError::TaskNotFound(id.to_string()))?;
        // The map is mutated in place, so unknown keys and absent optionals round-trip.
        if let Some(p) = priority {
            doc.meta.insert(
                "priority".into(),
                optional_str(Some(p).filter(|p| !p.is_empty())),
            );
        }
        if let Some(t) = &o.title {
            doc.meta.insert("title".into(), Value::str(t));
        }
        if let Some(p) = o.project.as_deref().map(str::trim) {
            doc.meta.insert(
                "project".into(),
                optional_str(Some(p).filter(|p| !p.is_empty())),
            );
        }
        if let Some(owner) = o
            .owner
            .as_deref()
            .filter(|owner| !crate::domain::is_blank(owner))
        {
            doc.meta.insert("owner".into(), Value::str(owner));
        }
        if let Some(spec) = &o.tags {
            let existing = meta_strings(&doc.meta, "tags");
            let applied = crate::domain::apply_tag_spec(&existing, spec)?;
            doc.meta.insert("tags".into(), Value::strings(applied));
        }
        if let Some(list) = &o.blocks {
            doc.meta
                .insert("blocks".into(), Value::strings(list.clone()));
        }
        if let Some(list) = &o.blocked_by {
            doc.meta
                .insert("blocked_by".into(), Value::strings(list.clone()));
        }
        apply_edits(&mut doc.meta, edits);
        if o.status.is_some() {
            reopen(&mut doc.meta, id)?;
        }
        let now = now_utc();
        doc.meta.insert("updated".into(), ts_value(&now));
        let task = validated(&doc.meta, id)?;
        persist(cfg, &path, &doc)?;
        // A reopened task leaves done/; a crash-stranded open file there is healed too.
        if !is_terminal(&task.status) {
            let open_path =
                safe_resolve(&cfg.spaces, &folder(cfg, "open")?.join(format!("{id}.md")))?;
            move_if_needed(&path, &open_path)?;
        }
        task
    };

    if edges_change {
        // A replace also retracts the mirrors it dropped, or the union rule would resurrect them.
        deps::apply_mirrors(
            cfg,
            deps::mirror_edits(
                id,
                &old_blocks,
                &new_blocks,
                &old_blocked_by,
                &new_blocked_by,
            ),
        );
    }
    Ok(task)
}

/// `update --status open`: a done or cancelled task becomes open again with no claim; an
/// open task just loses `completed`. A claimed task is refused — releasing someone's claim
/// is `task release`'s job, with its own ownership rule.
fn reopen(meta: &mut Meta, id: &str) -> Result<()> {
    let status = meta_str(meta, "status").unwrap_or("open").to_string();
    if status == "claimed" {
        let holder = meta_str(meta, "claimed_by")
            .unwrap_or("someone")
            .to_string();
        return Err(ShardsError::Validation(format!(
            "task {id} is claimed by {holder}; release it instead of reopening"
        )));
    }
    if is_terminal(&status) {
        meta.insert("status".into(), Value::str("open"));
        meta.insert("claimed_by".into(), Value::Null);
    }
    meta.shift_remove("completed");
    Ok(())
}

pub fn append(cfg: &Config, id: &str, text: &str, o: AppendOpts) -> Result<Task> {
    let actor = o
        .actor
        .clone()
        .or_else(|| cfg.agent().map(str::to_string))
        .filter(|s| !s.is_empty());
    let block = format_block(text, o.timestamp, actor.as_deref());

    let _guard = hold(&entity_lock(root(cfg)?, id)?)?;
    let path = resolve(cfg, id)?;
    let mut doc = read_doc(&path).ok_or_else(|| ShardsError::TaskNotFound(id.to_string()))?;
    doc.body = match &o.section {
        Some(section) => append_under_section(&doc.body, &block, section),
        None => append_to_end(&doc.body, &block),
    };
    // Never a lifecycle transition: status and folder are untouched.
    let related = crate::domain::resolve_wikilinks(cfg, &doc.body);
    doc.meta.insert("related".into(), Value::strings(related));
    let now = now_utc();
    doc.meta.insert("updated".into(), ts_value(&now));
    let task = validated(&doc.meta, id)?;
    persist(cfg, &path, &doc)?;
    Ok(task)
}

/// Returns the task and its unsatisfied blockers (empty when it was ready).
pub fn claim(cfg: &Config, id: &str, claimer: &str, strict: bool) -> Result<(Task, Vec<String>)> {
    // Resolve first, so a missing task is not-found rather than "unblocked".
    resolve(cfg, id)?;
    let unsatisfied = deps::readiness(&rows(cfg), id).unsatisfied;
    if strict && !unsatisfied.is_empty() {
        return Err(ShardsError::Blocked {
            task_id: id.to_string(),
            blockers: unsatisfied.join(", "),
        });
    }

    let _guard = hold(&entity_lock(root(cfg)?, id)?)?;
    let path = resolve(cfg, id)?;
    let mut doc = read_doc(&path).ok_or_else(|| ShardsError::TaskNotFound(id.to_string()))?;
    let status = meta_str(&doc.meta, "status").unwrap_or("open").to_string();
    // 1. Terminal is an idempotent no-op — checked BEFORE claimed_by, so claiming an
    //    already-finished task is a no-op rather than a conflict.
    if is_terminal(&status) {
        return Ok((validated(&doc.meta, id)?, unsatisfied));
    }
    let existing = meta_str(&doc.meta, "claimed_by").map(str::to_string);
    match existing {
        // 2. Same-owner reclaim: no write, `updated` untouched.
        Some(ref who) if who == claimer => Ok((validated(&doc.meta, id)?, unsatisfied)),
        // 3. Someone else holds it.
        Some(who) => Err(ShardsError::ClaimConflict {
            noun: "task",
            task_id: id.to_string(),
            existing_owner: who,
        }),
        // 4. Take it. `open` and `claimed` share a folder, so a claim never moves the file.
        None => {
            doc.meta.insert("claimed_by".into(), Value::str(claimer));
            doc.meta.insert("status".into(), Value::str("claimed"));
            let now = now_utc();
            doc.meta.insert("updated".into(), ts_value(&now));
            let task = validated(&doc.meta, id)?;
            persist(cfg, &path, &doc)?;
            Ok((task, unsatisfied))
        }
    }
}

pub fn release(cfg: &Config, id: &str, releaser: &str, force: bool) -> Result<Task> {
    let _guard = hold(&entity_lock(root(cfg)?, id)?)?;
    let path = resolve(cfg, id)?;
    let mut doc = read_doc(&path).ok_or_else(|| ShardsError::TaskNotFound(id.to_string()))?;
    let status = meta_str(&doc.meta, "status").unwrap_or("open").to_string();
    if is_terminal(&status) {
        return validated(&doc.meta, id);
    }
    let Some(holder) = meta_str(&doc.meta, "claimed_by").map(str::to_string) else {
        // Releasing an unclaimed task is an idempotent no-op.
        return validated(&doc.meta, id);
    };
    // `force` is a cooperation override and an audit affordance, never an auth check.
    if holder != releaser && !force {
        return Err(ShardsError::ClaimConflict {
            noun: "task",
            task_id: id.to_string(),
            existing_owner: holder,
        });
    }
    doc.meta.insert("claimed_by".into(), Value::Null);
    doc.meta.insert("status".into(), Value::str("open"));
    let now = now_utc();
    doc.meta.insert("updated".into(), ts_value(&now));
    let task = validated(&doc.meta, id)?;
    persist(cfg, &path, &doc)?;
    Ok(task)
}

/// Returns the task and the ids that became ready — a report; nothing is written to them.
///
/// A thin wrapper over [`terminate_report`] for callers that do not need `next_due`.
pub fn terminate(
    cfg: &Config,
    id: &str,
    kind: Terminal,
    text: Option<&str>,
    actor: Option<&str>,
) -> Result<(Task, Vec<String>)> {
    let report = terminate_report(cfg, id, kind, text, actor)?;
    Ok((report.task, report.unblocked))
}

/// `finish` / `cancel` with no precondition. See [`terminate_with`].
pub fn terminate_report(
    cfg: &Config,
    id: &str,
    kind: Terminal,
    text: Option<&str>,
    actor: Option<&str>,
) -> Result<Terminated> {
    terminate_with(cfg, id, kind, text, actor, None)
}

/// `finish` / `cancel`.
///
/// Finishing a task with a `recur` rule does not close it: `due` advances to the next
/// occurrence (and `deadline` by the same number of days), `status` stays `open`, any claim is
/// released, `completed` records now, the file stays in `open/` and nothing is appended to the
/// body. When that advance clamps a day the rule does not name (day 31 into April, Feb 29 into
/// a common year) the rule is stored with the day pinned, so the series never drifts. Every
/// other finish sets `completed` and moves the file to `done/`. A stored `recur` that does
/// not parse never blocks a finish: the task is closed and a warning says why.
///
/// A recurring finish is not idempotent on its own: each call advances once more. A caller
/// that may retry passes `expected_due`, the `due` it saw (`""` for none). When the stored
/// `due` differs, the recurring finish writes nothing and reports the current `due` with a
/// warning. The precondition does not apply to a one-off task, whose finish is idempotent.
pub fn terminate_with(
    cfg: &Config,
    id: &str,
    kind: Terminal,
    text: Option<&str>,
    actor: Option<&str>,
    expected_due: Option<&str>,
) -> Result<Terminated> {
    let expected: Option<Option<Due>> = expected_due
        .map(|v| {
            if v.trim().is_empty() {
                Ok(None)
            } else {
                Due::parse(v)
                    .map(Some)
                    .map_err(|e| ShardsError::Validation(format!("expected_due: {e}")))
            }
        })
        .transpose()?;
    let done_path = safe_resolve(&cfg.spaces, &folder(cfg, "done")?.join(format!("{id}.md")))?;
    let mut next_due: Option<String> = None;
    let mut warnings: Vec<String> = Vec::new();
    let task = {
        let _guard = hold(&entity_lock(root(cfg)?, id)?)?;
        let path = resolve(cfg, id)?;
        let mut doc = read_doc(&path).ok_or_else(|| ShardsError::TaskNotFound(id.to_string()))?;
        let status = meta_str(&doc.meta, "status").unwrap_or("open").to_string();
        let recurring = kind == Terminal::Finish && !is_terminal(&status);
        let recurrence = match doc.meta.get("recur").and_then(Value::as_scalar_text) {
            Some(rule) if recurring && !rule.trim().is_empty() => match Rule::parse(&rule) {
                Ok(parsed) => Some(parsed),
                Err(e) => {
                    // A malformed v2 field reads as absent and never blocks the task.
                    warnings.push(format!(
                        "{e}; the task was closed instead of repeating. To keep it repeating, \
                         reopen it (status open) and set a valid recur; an empty recur clears \
                         the rule"
                    ));
                    None
                }
            },
            _ => None,
        };
        let current = doc.meta.get("due").and_then(Due::from_value);
        if is_terminal(&status) {
            // Idempotent: no second section, no `updated` bump — but a crash-stranded file
            // still gets reconciled into done/.
            let task = validated(&doc.meta, id)?;
            move_if_needed(&path, &done_path)?;
            task
        } else if recurrence.is_some() && expected.is_some_and(|want| want != current) {
            // A retried or stale finish: the series already moved. Write nothing.
            let shown = current.map_or_else(|| "none".to_string(), |d| d.to_string());
            let wanted = expected
                .flatten()
                .map_or_else(|| "none".to_string(), |d| d.to_string());
            warnings.push(format!(
                "due is {shown}, not the expected {wanted}; nothing changed (an earlier finish \
                 or an edit already moved it)"
            ));
            next_due = current.map(|d| d.to_string());
            validated(&doc.meta, id)?
        } else if let Some(rule) = recurrence {
            let now = now_utc();
            let from_completion = meta_str(&doc.meta, "recur_from") == Some("completion");
            let step = recur::advance(&rule, from_completion, current, today_local())?;
            doc.meta.insert("due".into(), step.due.to_value());
            if let Some(pinned) = &step.rule {
                doc.meta
                    .insert("recur".into(), Value::str(pinned.to_string()));
            }
            if let Some(deadline) = doc
                .meta
                .get("deadline")
                .and_then(recur::deadline_from_value)
            {
                let moved = recur::shift_days(deadline, step.delta_days);
                doc.meta.insert("deadline".into(), recur::date_value(moved));
            }
            doc.meta.insert("status".into(), Value::str("open"));
            doc.meta.insert("claimed_by".into(), Value::Null);
            doc.meta.insert("completed".into(), ts_value(&now));
            doc.meta.insert("updated".into(), ts_value(&now));
            let task = validated(&doc.meta, id)?;
            // One write to the task's own file; it never leaves open/.
            persist(cfg, &path, &doc)?;
            next_due = Some(step.due.to_string());
            task
        } else {
            let now = now_utc();
            let actor = actor
                .map(str::to_string)
                .or_else(|| cfg.agent().map(str::to_string))
                .filter(|s| !s.is_empty());
            let stamp = format_stamp(&iso_seconds_z(&now), actor.as_deref());
            let block = match text.filter(|t| !t.is_empty()) {
                Some(t) => format!("{stamp}\n{t}"),
                None => stamp,
            };
            let section = format!("{}\n\n{block}", kind.heading());
            doc.body = append_to_end(&doc.body, &section);
            let related = crate::domain::resolve_wikilinks(cfg, &doc.body);
            doc.meta.insert("related".into(), Value::strings(related));
            doc.meta.insert("status".into(), Value::str(kind.status()));
            if kind == Terminal::Finish {
                doc.meta.insert("completed".into(), ts_value(&now));
            }
            doc.meta.insert("updated".into(), ts_value(&now));
            let task = validated(&doc.meta, id)?;
            // Write-then-move: a crash between the two is repaired by the branch above.
            persist(cfg, &path, &doc)?;
            move_if_needed(&path, &done_path)?;
            task
        }
    };
    // The cascade is a report, computed from a fresh scan; no other file is ever written.
    // A task that stayed open (advanced, or a no-op) releases nothing.
    let unblocked = if is_terminal(&task.status) {
        deps::newly_ready(&rows(cfg), id)
    } else {
        Vec::new()
    };
    Ok(Terminated {
        task,
        unblocked,
        next_due,
        warnings,
    })
}

pub fn get(cfg: &Config, id: &str) -> Result<View<Task>> {
    let path = resolve(cfg, id)?;
    let doc = read_doc(&path).ok_or_else(|| ShardsError::TaskNotFound(id.to_string()))?;
    let item = validated(&doc.meta, id)?;
    Ok(View {
        item,
        body: doc.body,
        path,
    })
}

pub fn list(cfg: &Config, f: &Filter, av: Availability) -> Result<Vec<View<Task>>> {
    list_with(cfg, f, av, &DueFilter::default())
}

/// `list` plus the task-only date predicates, applied before the shared select.
pub fn list_with(
    cfg: &Config,
    f: &Filter,
    av: Availability,
    due: &DueFilter,
) -> Result<Vec<View<Task>>> {
    root(cfg)?;
    let now = now_local();
    // Readiness is judged against the whole graph: an undated blocker must still block a
    // dated task, so the snapshot is taken before the date predicates narrow the rows.
    let snapshot = rows(cfg);
    let all: Vec<Row> = snapshot
        .iter()
        .filter(|r| due.matches(&r.meta, now))
        .cloned()
        .collect();
    // Availability and dates are applied before `select` so the limit cannot defeat them.
    let admitted: Vec<Row> = match av {
        Availability::Any => all,
        Availability::Available => all.into_iter().filter(|r| is_available(&r.meta)).collect(),
        Availability::Ready => all
            .into_iter()
            .filter(|r| {
                is_available(&r.meta)
                    && meta_str(&r.meta, "id")
                        .is_some_and(|id| deps::readiness(&snapshot, id).ready)
            })
            .collect(),
        Availability::Blocked => all
            .into_iter()
            .filter(|r| {
                !is_terminal(meta_str(&r.meta, "status").unwrap_or("open"))
                    && meta_str(&r.meta, "id")
                        .is_some_and(|id| !deps::readiness(&snapshot, id).unsatisfied.is_empty())
            })
            .collect(),
    };
    Ok(crate::domain::select(admitted, f))
}

/// `status == open && claimed_by == null` — excludes a hand-edited open task that still
/// carries a stale `claimed_by`, and never filters on owner.
fn is_available(meta: &Meta) -> bool {
    meta_str(meta, "status").unwrap_or("open") == "open" && meta_str(meta, "claimed_by").is_none()
}

pub fn delete(cfg: &Config, id: &str) -> Result<String> {
    let _guard = hold(&entity_lock(root(cfg)?, id)?)?;
    // No read: a corrupt task is still deletable — that is the repair path.
    let path = resolve(cfg, id)?;
    std::fs::remove_file(&path)?;
    Ok(id.to_string())
}

/// Hard-delete a task and hand back its exact text, for a host that offers undo.
///
/// Same lock and resolution as [`delete`]; the read and the unlink both happen inside the
/// lock, so the text is exactly what was removed. Non-UTF-8 content is refused untouched.
pub fn delete_raw(cfg: &Config, id: &str) -> Result<(PathBuf, String)> {
    let _guard = hold(&entity_lock(root(cfg)?, id)?)?;
    let path = resolve(cfg, id)?;
    let text = crate::storage::raw::take_utf8(&path)?;
    Ok((path, text))
}

/// Replace a task's Markdown body, keeping its frontmatter.
///
/// The `append` write path with the body swapped instead of extended: `related` is
/// re-resolved from the new body's wikilinks and `updated` is bumped. An identical body is a
/// no-op that never rewrites the file. Never a lifecycle transition.
pub fn set_body(cfg: &Config, id: &str, body: &str) -> Result<Task> {
    let _guard = hold(&entity_lock(root(cfg)?, id)?)?;
    let path = resolve(cfg, id)?;
    let mut doc = read_doc(&path).ok_or_else(|| ShardsError::TaskNotFound(id.to_string()))?;
    if doc.body == body.trim() {
        return validated(&doc.meta, id);
    }
    doc.body = body.to_string();
    let related = crate::domain::resolve_wikilinks(cfg, &doc.body);
    doc.meta.insert("related".into(), Value::strings(related));
    doc.meta.insert("updated".into(), ts_value(&now_utc()));
    let task = validated(&doc.meta, id)?;
    persist(cfg, &path, &doc)?;
    Ok(task)
}

pub fn rows(cfg: &Config) -> Vec<Row> {
    task_files(cfg)
        .into_iter()
        .filter_map(|path| read_meta_only(&path).map(|meta| Row { path, meta }))
        .collect()
}

pub fn find_duplicate_title(cfg: &Config, title: &str) -> Option<String> {
    let want = slugify(title);
    rows(cfg).into_iter().find_map(|row| {
        let id = meta_str(&row.meta, "id")?;
        if !id.starts_with("t-") {
            return None;
        }
        let other = meta_str(&row.meta, "title")?;
        (slugify(other) == want).then(|| id.to_string())
    })
}

/// The ids of a view list, in order — a convenience for the CLI and for tests.
pub fn view_ids(views: &[View<Task>]) -> Vec<String> {
    views.iter().map(|v| v.item.id.clone()).collect()
}

// ---------------------------------------------------------------------------------------
// graph helpers shared with `deps`
// ---------------------------------------------------------------------------------------

/// `(blocks, blocked_by)` for one id in a scan; two empty lists when it is absent.
pub(crate) fn node_lists(rows: &[Row], id: &str) -> (Vec<String>, Vec<String>) {
    for row in rows {
        if meta_str(&row.meta, "id") == Some(id) {
            return (
                meta_strings(&row.meta, "blocks"),
                meta_strings(&row.meta, "blocked_by"),
            );
        }
    }
    (Vec::new(), Vec::new())
}

/// A copy of `rows` where `id` carries the given lists, adding a synthetic row when absent.
fn with_lists(rows: &[Row], id: &str, blocks: &[String], blocked_by: &[String]) -> Vec<Row> {
    let mut out: Vec<Row> = Vec::with_capacity(rows.len() + 1);
    let mut seen = false;
    for row in rows {
        if meta_str(&row.meta, "id") == Some(id) {
            seen = true;
            let mut meta = row.meta.clone();
            meta.insert("blocks".into(), Value::strings(blocks.to_vec()));
            meta.insert("blocked_by".into(), Value::strings(blocked_by.to_vec()));
            out.push(Row {
                path: row.path.clone(),
                meta,
            });
        } else {
            out.push(row.clone());
        }
    }
    if !seen {
        let mut meta = Meta::new();
        meta.insert("id".into(), Value::str(id));
        meta.insert("type".into(), Value::str("task"));
        meta.insert("status".into(), Value::str("open"));
        meta.insert("blocks".into(), Value::strings(blocks.to_vec()));
        meta.insert("blocked_by".into(), Value::strings(blocked_by.to_vec()));
        out.push(Row {
            path: PathBuf::from(format!("{id}.md")),
            meta,
        });
    }
    out
}

/// The `(blocked, blocker)` pairs a `--blocks` / `--blocked-by` pair proposes.
fn proposed_edges(id: &str, blocks: &[String], blocked_by: &[String]) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = Vec::new();
    for b in blocked_by {
        out.push((id.to_string(), b.clone()));
    }
    for b in blocks {
        out.push((b.clone(), id.to_string()));
    }
    out
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
    use crate::config::test_support::config_for;
    use crate::domain::SortKey;

    fn vault() -> (tempfile::TempDir, Config) {
        let dir = tempfile::tempdir().unwrap();
        let cfg = config_for(dir.path());
        (dir, cfg)
    }

    fn new_task(cfg: &Config, title: &str, o: NewTask) -> Task {
        create(cfg, title, o).unwrap()
    }

    fn open_dir(cfg: &Config) -> PathBuf {
        let dir = folder(cfg, "open").unwrap();
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn raw(cfg: &Config, id: &str, extra: &str) {
        let dir = open_dir(cfg);
        std::fs::write(
            dir.join(format!("{id}.md")),
            format!(
                "---\nid: {id}\ntype: task\ntitle: {id}\ncreated: 2026-01-01T00:00:00Z\n\
                 updated: 2026-01-01T00:00:00Z\nstatus: open\n{extra}---\n\nx\n"
            ),
        )
        .unwrap();
    }

    #[test]
    fn create_writes_the_canonical_key_set_into_open() {
        let (_d, cfg) = vault();
        let task = new_task(&cfg, "Ship it", NewTask::default());
        assert!(task.id.starts_with("t-"));
        assert_eq!(task.status, "open");
        let path = resolve(&cfg, &task.id).unwrap();
        assert!(path.to_string_lossy().contains("/tasks/open/"));
        let keys: Vec<&str> = task.meta.keys().map(String::as_str).collect();
        // Exactly the fourteen v1 keys: v2 keys are written only when set.
        assert_eq!(
            keys,
            &crate::model::task::TASK_FIELDS.fields()[..crate::model::task::TASK_V1_FIELD_COUNT]
        );
        // priority / claimed_by / project are written as null, never omitted.
        assert!(task.meta["priority"].is_null());
        assert!(task.meta["claimed_by"].is_null());
        assert!(task.meta["project"].is_null());
        assert_eq!(task.owner.as_deref(), Some("test-agent"));
    }

    #[test]
    fn priority_is_validated_before_any_write() {
        let (_d, cfg) = vault();
        let o = NewTask {
            priority: Some("critical".into()),
            ..NewTask::default()
        };
        let err = create(&cfg, "T", o).unwrap_err();
        assert_eq!(err.code(), 2);
        assert_eq!(
            err.to_string(),
            "invalid priority: 'critical' (use urgent, high, normal, low)"
        );
        assert!(rows(&cfg).is_empty(), "nothing was created");
    }

    #[test]
    fn an_unknown_owner_is_rejected_before_any_write() {
        let (_d, mut cfg) = vault();
        cfg.tasks.collections = vec!["alice".into()];
        let o = NewTask {
            owner: Some("ghost".into()),
            ..NewTask::default()
        };
        let err = create(&cfg, "T", o).unwrap_err();
        assert_eq!(err.to_string(), "unknown owner: 'ghost'");
        assert!(rows(&cfg).is_empty());
    }

    #[test]
    fn resolution_is_id_only_and_never_a_slug() {
        let (_d, cfg) = vault();
        let task = new_task(&cfg, "Ship it", NewTask::default());
        assert!(resolve(&cfg, &task.id).is_ok());
        assert_eq!(resolve(&cfg, "ship-it").unwrap_err().code(), 3);
        assert_eq!(get(&cfg, "ship-it").unwrap_err().code(), 3);
    }

    #[test]
    fn claim_is_a_four_branch_test_and_set() {
        let (_d, cfg) = vault();
        let t = new_task(&cfg, "T", NewTask::default());
        let (task, _) = claim(&cfg, &t.id, "alice", false).unwrap();
        assert_eq!(task.status, "claimed");
        assert_eq!(task.claimed_by.as_deref(), Some("alice"));

        // Same-owner reclaim: `updated` untouched, no rewrite.
        let path = resolve(&cfg, &t.id).unwrap();
        let before = std::fs::read_to_string(&path).unwrap();
        let (again, _) = claim(&cfg, &t.id, "alice", false).unwrap();
        assert_eq!(again.updated, task.updated);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), before);

        let err = claim(&cfg, &t.id, "bob", false).unwrap_err();
        assert_eq!(err.code(), 4);
        assert_eq!(
            err.to_string(),
            format!("task {} already claimed by alice", t.id)
        );
        assert_eq!(std::fs::read_to_string(&path).unwrap(), before);
    }

    #[test]
    fn claiming_a_terminal_task_is_a_no_op_not_a_conflict() {
        let (_d, cfg) = vault();
        let t = new_task(&cfg, "T", NewTask::default());
        claim(&cfg, &t.id, "alice", false).unwrap();
        terminate(&cfg, &t.id, Terminal::Finish, None, Some("alice")).unwrap();
        let path = resolve(&cfg, &t.id).unwrap();
        let before = std::fs::read_to_string(&path).unwrap();
        let (task, _) = claim(&cfg, &t.id, "bob", false).unwrap();
        assert_eq!(task.status, "done");
        // finish never clears claimed_by.
        assert_eq!(task.claimed_by.as_deref(), Some("alice"));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), before);
    }

    #[test]
    fn release_is_idempotent_and_force_breaks_a_foreign_claim() {
        let (_d, cfg) = vault();
        let t = new_task(&cfg, "T", NewTask::default());
        let path = resolve(&cfg, &t.id).unwrap();
        let before = std::fs::read_to_string(&path).unwrap();
        let task = release(&cfg, &t.id, "alice", false).unwrap();
        assert_eq!(task.status, "open");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), before);

        claim(&cfg, &t.id, "alice", false).unwrap();
        let err = release(&cfg, &t.id, "bob", false).unwrap_err();
        assert_eq!(err.code(), 4);
        let task = release(&cfg, &t.id, "bob", true).unwrap();
        assert_eq!(task.status, "open");
        assert_eq!(task.claimed_by, None);
    }

    #[test]
    fn releasing_a_terminal_task_is_a_no_op() {
        let (_d, cfg) = vault();
        let t = new_task(&cfg, "T", NewTask::default());
        claim(&cfg, &t.id, "alice", false).unwrap();
        terminate(&cfg, &t.id, Terminal::Cancel, None, None).unwrap();
        let path = resolve(&cfg, &t.id).unwrap();
        let before = std::fs::read_to_string(&path).unwrap();
        let task = release(&cfg, &t.id, "bob", false).unwrap();
        assert_eq!(task.status, "cancelled");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), before);
    }

    #[test]
    fn terminate_appends_a_stamped_section_and_moves_the_file() {
        let (_d, cfg) = vault();
        let o = NewTask {
            body: "Original body.".into(),
            ..NewTask::default()
        };
        let t = new_task(&cfg, "T", o);
        let (task, unblocked) = terminate(
            &cfg,
            &t.id,
            Terminal::Finish,
            Some("Shipped."),
            Some("alice"),
        )
        .unwrap();
        assert_eq!(task.status, "done");
        assert!(unblocked.is_empty());
        let path = resolve(&cfg, &t.id).unwrap();
        assert!(path.to_string_lossy().contains("/tasks/done/"));
        let body = crate::fm::read_body(&path);
        assert!(
            body.starts_with("Original body.\n\n## Outcome\n\n"),
            "{body}"
        );
        assert!(body.ends_with(" — alice\nShipped."), "{body}");

        // A second finish is a pure no-op.
        let before = std::fs::read_to_string(&path).unwrap();
        terminate(&cfg, &t.id, Terminal::Finish, Some("again"), Some("alice")).unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), before);
        // A cross-transition is refused as a no-op too.
        let (task, _) = terminate(&cfg, &t.id, Terminal::Cancel, None, None).unwrap();
        assert_eq!(task.status, "done");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), before);
    }

    #[test]
    fn terminate_with_no_text_is_heading_plus_stamp_only() {
        let (_d, cfg) = vault();
        let t = new_task(&cfg, "T", NewTask::default());
        terminate(&cfg, &t.id, Terminal::Cancel, None, Some("alice")).unwrap();
        let body = crate::fm::read_body(&resolve(&cfg, &t.id).unwrap());
        let lines: Vec<&str> = body.lines().collect();
        assert_eq!(lines[0], "## Cancelled");
        assert_eq!(lines[1], "");
        assert!(lines[2].ends_with(" — alice"));
        assert_eq!(lines.len(), 3);
    }

    #[test]
    fn a_crash_stranded_terminal_file_is_reconciled_into_done() {
        let (_d, cfg) = vault();
        let t = new_task(&cfg, "T", NewTask::default());
        // Simulate a crash between the write and the rename.
        let path = resolve(&cfg, &t.id).unwrap();
        let mut doc = read_doc(&path).unwrap();
        doc.meta.insert("status".into(), Value::str("done"));
        persist(&cfg, &path, &doc).unwrap();
        assert!(path.to_string_lossy().contains("/tasks/open/"));

        terminate(&cfg, &t.id, Terminal::Finish, None, None).unwrap();
        let healed = resolve(&cfg, &t.id).unwrap();
        assert!(healed.to_string_lossy().contains("/tasks/done/"));
        assert!(!path.exists());
    }

    #[test]
    fn append_never_transitions_a_lifecycle() {
        let (_d, cfg) = vault();
        let o = NewTask {
            body: "start".into(),
            ..NewTask::default()
        };
        let t = new_task(&cfg, "T", o);
        terminate(&cfg, &t.id, Terminal::Finish, None, None).unwrap();
        let task = append(&cfg, &t.id, "more", AppendOpts::default()).unwrap();
        assert_eq!(task.status, "done");
        let path = resolve(&cfg, &t.id).unwrap();
        assert!(path.to_string_lossy().contains("/tasks/done/"));
        let body = crate::fm::read_body(&path);
        assert_eq!(body.matches("## Outcome").count(), 1);
        assert!(body.ends_with("more"));
    }

    #[test]
    fn append_under_a_section_and_with_a_stamp() {
        let (_d, cfg) = vault();
        let o = NewTask {
            body: "Intro.\n\n## A\n\nitem1\n\n## B\n\nitem2".into(),
            ..NewTask::default()
        };
        let t = new_task(&cfg, "T", o);
        append(
            &cfg,
            &t.id,
            "NEW",
            AppendOpts {
                section: Some("A".into()),
                ..AppendOpts::default()
            },
        )
        .unwrap();
        let body = crate::fm::read_body(&resolve(&cfg, &t.id).unwrap());
        assert_eq!(body, "Intro.\n\n## A\n\nitem1\n\nNEW\n\n## B\n\nitem2");

        append(
            &cfg,
            &t.id,
            "stamped",
            AppendOpts {
                section: None,
                timestamp: true,
                actor: Some("carol".into()),
            },
        )
        .unwrap();
        let body = crate::fm::read_body(&resolve(&cfg, &t.id).unwrap());
        assert!(body.contains(" — carol\nstamped"), "{body}");
    }

    #[test]
    fn update_touches_only_the_supplied_fields() {
        let (_d, cfg) = vault();
        let t = new_task(&cfg, "T", NewTask::default());
        claim(&cfg, &t.id, "alice", false).unwrap();
        let o = UpdateTask {
            owner: Some("bob".into()),
            title: Some("Renamed".into()),
            ..UpdateTask::default()
        };
        let task = update(&cfg, &t.id, o).unwrap();
        assert_eq!(task.title, "Renamed");
        assert_eq!(task.owner.as_deref(), Some("bob"));
        // Reassignment never touches the claim.
        assert_eq!(task.claimed_by.as_deref(), Some("alice"));
        assert_eq!(task.status, "claimed");
    }

    #[test]
    fn update_round_trips_unknown_keys_and_absent_optionals() {
        let (_d, cfg) = vault();
        let dir = open_dir(&cfg);
        std::fs::write(
            dir.join("t-LEG.md"),
            "---\nid: t-LEG\ntype: task\ntitle: Legacy\ncreated: 2026-01-01T00:00:00Z\n\
             updated: 2026-01-01T00:00:00Z\nstatus: open\ncustom: keep\n---\n\nbody\n",
        )
        .unwrap();
        let o = UpdateTask {
            priority: Some("low".into()),
            ..UpdateTask::default()
        };
        update(&cfg, "t-LEG", o).unwrap();
        let meta = read_meta_only(&dir.join("t-LEG.md")).unwrap();
        assert_eq!(meta_str(&meta, "custom"), Some("keep"));
        assert_eq!(meta_str(&meta, "priority"), Some("low"));
        // An update without --project injects none.
        assert!(!meta.contains_key("project"));
    }

    #[test]
    fn update_tags_go_through_the_shared_spec_grammar() {
        let (_d, cfg) = vault();
        let t = new_task(
            &cfg,
            "T",
            NewTask {
                tags: vec!["a".into(), "b".into()],
                ..NewTask::default()
            },
        );
        let task = update(
            &cfg,
            &t.id,
            UpdateTask {
                tags: Some("+c,-a".into()),
                ..UpdateTask::default()
            },
        )
        .unwrap();
        assert_eq!(task.tags, ["b", "c"]);
        let err = update(
            &cfg,
            &t.id,
            UpdateTask {
                tags: Some("+c,d".into()),
                ..UpdateTask::default()
            },
        )
        .unwrap_err();
        assert_eq!(err.code(), 2);
    }

    #[test]
    fn delete_removes_a_task_in_any_state_including_a_corrupt_one() {
        let (_d, cfg) = vault();
        let t = new_task(&cfg, "T", NewTask::default());
        assert_eq!(delete(&cfg, &t.id).unwrap(), t.id);
        assert_eq!(delete(&cfg, &t.id).unwrap_err().code(), 3);

        let dir = open_dir(&cfg);
        std::fs::write(dir.join("t-BAD.md"), "---\n: : :\n---\nbroken\n").unwrap();
        assert_eq!(get(&cfg, "t-BAD").unwrap_err().code(), 3);
        assert_eq!(delete(&cfg, "t-BAD").unwrap(), "t-BAD");
    }

    #[test]
    fn status_csv_parsing_trims_dedupes_and_names_every_offender() {
        assert_eq!(parse_status_csv(" , ").unwrap(), None);
        assert_eq!(
            parse_status_csv(" open , done , open ").unwrap(),
            Some(vec!["open".into(), "done".into()])
        );
        let err = parse_status_csv("open,wat,nope").unwrap_err();
        assert_eq!(err.code(), 2);
        assert_eq!(
            err.to_string(),
            "unknown status: wat, nope (use open, claimed, done, cancelled)"
        );
    }

    #[test]
    fn list_availability_slices() {
        let (_d, cfg) = vault();
        let a = new_task(&cfg, "A", NewTask::default());
        let b = new_task(&cfg, "B", NewTask::default());
        claim(&cfg, &b.id, "alice", false).unwrap();
        let c = new_task(
            &cfg,
            "C",
            NewTask {
                blocked_by: vec![a.id.clone()],
                ..NewTask::default()
            },
        );
        let f = Filter::unbounded();
        assert_eq!(list(&cfg, &f, Availability::Any).unwrap().len(), 3);
        let available = view_ids(&list(&cfg, &f, Availability::Available).unwrap());
        assert!(available.contains(&a.id) && available.contains(&c.id));
        assert!(!available.contains(&b.id));
        assert_eq!(
            view_ids(&list(&cfg, &f, Availability::Ready).unwrap()),
            [a.id.clone()][..]
        );
        assert_eq!(
            view_ids(&list(&cfg, &f, Availability::Blocked).unwrap()),
            [c.id.clone()][..]
        );

        // Finishing the blocker flips C to ready.
        terminate(&cfg, &a.id, Terminal::Finish, None, None).unwrap();
        assert_eq!(
            view_ids(&list(&cfg, &f, Availability::Ready).unwrap()),
            [c.id]
        );
        assert!(list(&cfg, &f, Availability::Blocked).unwrap().is_empty());
    }

    #[test]
    fn available_excludes_a_hand_edited_open_task_carrying_a_claim() {
        let (_d, cfg) = vault();
        raw(&cfg, "t-STALE", "claimed_by: ghost\n");
        let f = Filter::unbounded();
        assert_eq!(list(&cfg, &f, Availability::Any).unwrap().len(), 1);
        assert!(list(&cfg, &f, Availability::Available).unwrap().is_empty());
    }

    #[test]
    fn a_legacy_priority_sorts_last_and_is_never_dropped() {
        let (_d, cfg) = vault();
        let dir = open_dir(&cfg);
        for (id, priority, created) in [
            ("t-AAA", "critical", "2026-01-01T00:00:00Z"),
            ("t-BBB", "high", "2026-01-02T00:00:00Z"),
            ("t-CCC", "low", "2026-01-03T00:00:00Z"),
        ] {
            std::fs::write(
                dir.join(format!("{id}.md")),
                format!(
                    "---\nid: {id}\ntype: task\ntitle: {id}\ncreated: {created}\n\
                     updated: {created}\nstatus: open\npriority: {priority}\n---\n\nx\n"
                ),
            )
            .unwrap();
        }
        let f = Filter {
            sort: SortKey::Priority,
            ..Filter::unbounded()
        };
        assert_eq!(
            view_ids(&list(&cfg, &f, Availability::Any).unwrap()),
            ["t-BBB", "t-CCC", "t-AAA"]
        );
    }

    #[test]
    fn urgent_outranks_high_under_the_priority_sort() {
        let (_d, cfg) = vault();
        let mk = |title: &str, p: &str| {
            new_task(
                &cfg,
                title,
                NewTask {
                    priority: Some(p.into()),
                    ..NewTask::default()
                },
            )
            .id
        };
        let low = mk("low", "low");
        let high = mk("high", "high");
        let urgent = mk("urgent", "urgent");
        let normal = mk("normal", "normal");
        let f = Filter {
            sort: SortKey::Priority,
            ..Filter::unbounded()
        };
        assert_eq!(
            view_ids(&list(&cfg, &f, Availability::Any).unwrap()),
            [urgent, high, normal, low]
        );
    }

    fn v2(o: NewTask) -> NewTask {
        o
    }

    #[test]
    fn create_writes_v2_keys_only_when_set_in_canonical_order() {
        let (_d, cfg) = vault();
        let parent = new_task(&cfg, "P", NewTask::default());
        let t = new_task(
            &cfg,
            "Child",
            v2(NewTask {
                order: Some(2.5),
                section: Some("Doing".into()),
                parent: Some(parent.id.clone()),
                recur_from: Some("completion".into()),
                recur: Some("freq=weekly;byday=we,mo".into()),
                deadline: Some("2026-12-31".into()),
                due: Some("2026-12-01T09:30".into()),
                ..NewTask::default()
            }),
        );
        let keys: Vec<&str> = t.meta.keys().map(String::as_str).collect();
        assert_eq!(keys, crate::model::task::TASK_FIELDS.fields()[..21]);
        let text = std::fs::read_to_string(resolve(&cfg, &t.id).unwrap()).unwrap();
        assert!(text.contains("\ndue: 2026-12-01T09:30\n"), "{text}");
        assert!(text.contains("\ndeadline: 2026-12-31\n"), "{text}");
        assert!(
            text.contains("\nrecur: FREQ=WEEKLY;BYDAY=MO,WE\n"),
            "{text}"
        );
        assert!(text.contains("\norder: 2.5\n"), "{text}");
        // Read back through the loader, the typed view agrees.
        let back = get(&cfg, &t.id).unwrap().item;
        assert_eq!(back.due.unwrap().to_string(), "2026-12-01T09:30");
        assert_eq!(back.parent.as_deref(), Some(parent.id.as_str()));
        assert_eq!(back.order, Some(2.5));
        // An integral order stays an integer on disk.
        let u = update(
            &cfg,
            &t.id,
            UpdateTask {
                order: Some(Some(3.0)),
                ..UpdateTask::default()
            },
        )
        .unwrap();
        assert_eq!(u.meta["order"], Value::Int(3));
    }

    #[test]
    fn invalid_v2_values_are_refused_before_any_write() {
        let (_d, cfg) = vault();
        for (o, prefix) in [
            (
                NewTask {
                    due: Some("tomorrow".into()),
                    ..NewTask::default()
                },
                "invalid due: ",
            ),
            (
                NewTask {
                    deadline: Some("2026-12-31T10:00".into()),
                    ..NewTask::default()
                },
                "invalid deadline: ",
            ),
            (
                NewTask {
                    recur: Some("FREQ=HOURLY".into()),
                    ..NewTask::default()
                },
                "invalid recur: ",
            ),
            (
                NewTask {
                    recur_from: Some("whenever".into()),
                    ..NewTask::default()
                },
                "invalid recur_from: ",
            ),
            (
                NewTask {
                    parent: Some("t-NOPE".into()),
                    ..NewTask::default()
                },
                "invalid parent: ",
            ),
            (
                NewTask {
                    order: Some(f64::NAN),
                    ..NewTask::default()
                },
                "invalid order: ",
            ),
        ] {
            let err = create(&cfg, "T", o).unwrap_err();
            assert_eq!(err.code(), 2);
            assert!(err.to_string().starts_with(prefix), "{err}");
        }
        assert!(rows(&cfg).is_empty(), "nothing was created");
    }

    #[test]
    fn update_sets_and_clears_v2_fields_keeping_unknown_key_order() {
        let (_d, cfg) = vault();
        raw(&cfg, "t-LEG", "custom: keep\nzzz: last\n");
        update(
            &cfg,
            "t-LEG",
            UpdateTask {
                due: Some("2026-11-02".into()),
                section: Some("Later".into()),
                ..UpdateTask::default()
            },
        )
        .unwrap();
        let task = update(
            &cfg,
            "t-LEG",
            UpdateTask {
                due: Some(String::new()),
                priority: Some(String::new()),
                ..UpdateTask::default()
            },
        )
        .unwrap();
        assert!(!task.meta.contains_key("due"));
        assert_eq!(task.section.as_deref(), Some("Later"));
        assert!(task.meta["priority"].is_null());
        // On disk: owned keys in declaration order, unknown keys after in their own order.
        let meta = read_meta_only(&resolve(&cfg, "t-LEG").unwrap()).unwrap();
        let keys: Vec<&str> = meta.keys().map(String::as_str).collect();
        let tail: Vec<&str> = keys.iter().rev().take(3).rev().copied().collect();
        assert_eq!(tail, ["section", "custom", "zzz"]);
    }

    #[test]
    fn parent_refuses_self_and_cycles() {
        let (_d, cfg) = vault();
        let a = new_task(&cfg, "A", NewTask::default());
        let b = new_task(
            &cfg,
            "B",
            NewTask {
                parent: Some(a.id.clone()),
                ..NewTask::default()
            },
        );
        let set_parent = |id: &str, parent: &str| {
            update(
                &cfg,
                id,
                UpdateTask {
                    parent: Some(parent.into()),
                    ..UpdateTask::default()
                },
            )
        };
        let err = set_parent(&a.id, &a.id).unwrap_err();
        assert!(err.to_string().contains("its own parent"), "{err}");
        let err = set_parent(&a.id, &b.id).unwrap_err();
        assert_eq!(err.code(), 2);
        assert_eq!(
            err.to_string(),
            format!("parent cycle: {} -> {} -> {}", a.id, b.id, a.id)
        );
        // Clearing is always allowed.
        let cleared = set_parent(&b.id, "").unwrap();
        assert!(cleared.parent.is_none() && !cleared.meta.contains_key("parent"));
    }

    #[test]
    fn finishing_sets_completed_and_reopen_clears_it_and_moves_back() {
        let (_d, cfg) = vault();
        let t = new_task(&cfg, "T", NewTask::default());
        claim(&cfg, &t.id, "alice", false).unwrap();
        let done = terminate_report(&cfg, &t.id, Terminal::Finish, None, None).unwrap();
        assert!(done.task.completed.is_some());
        assert!(done.next_due.is_none());
        let task = update(
            &cfg,
            &t.id,
            UpdateTask {
                status: Some("open".into()),
                ..UpdateTask::default()
            },
        )
        .unwrap();
        assert_eq!(task.status, "open");
        assert!(task.completed.is_none() && !task.meta.contains_key("completed"));
        assert_eq!(task.claimed_by, None);
        assert!(resolve(&cfg, &t.id)
            .unwrap()
            .to_string_lossy()
            .contains("/tasks/open/"));
        // Cancel never sets completed.
        let (cancelled, _) = terminate(&cfg, &t.id, Terminal::Cancel, None, None).unwrap();
        assert!(cancelled.completed.is_none());
    }

    #[test]
    fn update_status_accepts_only_open_and_never_breaks_a_claim() {
        let (_d, cfg) = vault();
        let t = new_task(&cfg, "T", NewTask::default());
        let reopen = || {
            update(
                &cfg,
                &t.id,
                UpdateTask {
                    status: Some("open".into()),
                    ..UpdateTask::default()
                },
            )
        };
        let err = update(
            &cfg,
            &t.id,
            UpdateTask {
                status: Some("done".into()),
                ..UpdateTask::default()
            },
        )
        .unwrap_err();
        assert_eq!(err.code(), 2);
        claim(&cfg, &t.id, "alice", false).unwrap();
        let err = reopen().unwrap_err();
        assert_eq!(err.code(), 2);
        assert!(err.to_string().contains("claimed by alice"), "{err}");
        release(&cfg, &t.id, "alice", false).unwrap();
        assert_eq!(reopen().unwrap().status, "open");
    }

    #[test]
    fn finishing_a_recurring_task_advances_due_and_deadline_in_place() {
        let (_d, cfg) = vault();
        let today = today_local();
        let past = recur::shift_days(today, -10);
        let t = new_task(
            &cfg,
            "Water plants",
            NewTask {
                due: Some(format!("{}T08:00", recur::date_text(past))),
                deadline: Some(recur::date_text(recur::shift_days(past, 2))),
                recur: Some("FREQ=DAILY".into()),
                body: "Keep it short.".into(),
                ..NewTask::default()
            },
        );
        claim(&cfg, &t.id, "alice", false).unwrap();
        let done = terminate_report(&cfg, &t.id, Terminal::Finish, None, None).unwrap();
        let tomorrow = recur::shift_days(today, 1);
        assert_eq!(
            done.next_due.as_deref(),
            Some(format!("{}T08:00", recur::date_text(tomorrow)).as_str())
        );
        let task = done.task;
        assert_eq!(task.status, "open");
        assert_eq!(task.claimed_by, None);
        assert!(task.completed.is_some());
        assert_eq!(task.deadline, Some(recur::shift_days(tomorrow, 2)));
        let path = resolve(&cfg, &t.id).unwrap();
        assert!(path.to_string_lossy().contains("/tasks/open/"));
        assert_eq!(crate::fm::read_body(&path), "Keep it short.");
        // Each finish advances again — a recurring finish is not idempotent.
        let again = terminate_report(&cfg, &t.id, Terminal::Finish, None, None).unwrap();
        assert_eq!(
            again.next_due.as_deref(),
            Some(format!("{}T08:00", recur::date_text(recur::shift_days(today, 2))).as_str())
        );
        // Cancel still closes it.
        let (cancelled, _) = terminate(&cfg, &t.id, Terminal::Cancel, None, None).unwrap();
        assert_eq!(cancelled.status, "cancelled");
    }

    #[test]
    fn due_filters_never_hide_an_undated_blocker_from_readiness() {
        let (_d, cfg) = vault();
        let a = new_task(&cfg, "A", NewTask::default());
        let b = new_task(
            &cfg,
            "B",
            NewTask {
                due: Some(recur::date_text(recur::shift_days(today_local(), -1))),
                blocked_by: vec![a.id.clone()],
                ..NewTask::default()
            },
        );
        let overdue = DueFilter {
            overdue: true,
            ..DueFilter::default()
        };
        let f = Filter::unbounded();
        assert!(list_with(&cfg, &f, Availability::Ready, &overdue)
            .unwrap()
            .is_empty());
        assert_eq!(
            view_ids(&list_with(&cfg, &f, Availability::Blocked, &overdue).unwrap()),
            [b.id.as_str()]
        );
    }

    #[test]
    fn due_filters_compare_calendar_days() {
        let (_d, cfg) = vault();
        let today = today_local();
        let mk = |title: &str, due: Option<NaiveDate>| {
            new_task(
                &cfg,
                title,
                NewTask {
                    due: due.map(recur::date_text),
                    ..NewTask::default()
                },
            )
            .id
        };
        let past = mk("past", Some(recur::shift_days(today, -3)));
        let now = mk("today", Some(today));
        let later = mk("later", Some(recur::shift_days(today, 5)));
        let none = mk("none", None);
        let done = mk("done-past", Some(recur::shift_days(today, -1)));
        terminate(&cfg, &done, Terminal::Finish, None, None).unwrap();
        let f = Filter {
            sort: SortKey::Due,
            ..Filter::unbounded()
        };
        let ids = |d: DueFilter| view_ids(&list_with(&cfg, &f, Availability::Any, &d).unwrap());
        assert_eq!(
            ids(DueFilter {
                overdue: true,
                ..DueFilter::default()
            }),
            [past.as_str()]
        );
        assert_eq!(
            ids(DueFilter {
                has_due: true,
                ..DueFilter::default()
            }),
            [past.clone(), done.clone(), now.clone(), later.clone()]
        );
        assert_eq!(
            ids(DueFilter {
                before: Some(today),
                ..DueFilter::default()
            }),
            [past.clone(), done.clone()]
        );
        assert_eq!(
            ids(DueFilter {
                after: Some(today),
                ..DueFilter::default()
            }),
            [later.as_str()]
        );
        // Sort by due puts undated last.
        assert_eq!(
            view_ids(&list(&cfg, &f, Availability::Any).unwrap()),
            [past, done, now, later, none]
        );
    }

    #[test]
    fn duplicate_titles_are_slug_normalised_and_task_only() {
        let (_d, cfg) = vault();
        let t = new_task(&cfg, "Japan Visa", NewTask::default());
        assert_eq!(
            find_duplicate_title(&cfg, "japan  visa").as_deref(),
            Some(t.id.as_str())
        );
        assert_eq!(find_duplicate_title(&cfg, "Something else"), None);
        // The scan covers done/ too.
        terminate(&cfg, &t.id, Terminal::Finish, None, None).unwrap();
        assert_eq!(
            find_duplicate_title(&cfg, "Japan Visa").as_deref(),
            Some(t.id.as_str())
        );
    }

    #[test]
    fn a_corrupt_sibling_never_blocks_a_different_id() {
        let (_d, cfg) = vault();
        let t = new_task(&cfg, "T", NewTask::default());
        let dir = open_dir(&cfg);
        std::fs::write(dir.join("t-BAD.md"), "---\n: : :\n---\nbroken\n").unwrap();
        assert!(claim(&cfg, &t.id, "alice", false).is_ok());
        assert!(terminate(&cfg, &t.id, Terminal::Finish, None, None).is_ok());
        assert_eq!(
            list(&cfg, &Filter::unbounded(), Availability::Any)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn not_found_carries_near_miss_candidates() {
        let (_d, cfg) = vault();
        let t = new_task(&cfg, "T", NewTask::default());
        let err = get(&cfg, "t-ZZZZ").unwrap_err();
        assert_eq!(err.code(), 3);
        assert!(err.candidates().contains(&t.id), "{:?}", err.candidates());
    }

    #[test]
    fn strict_claim_on_a_blocked_task_is_exit_five_and_writes_nothing() {
        let (_d, cfg) = vault();
        let a = new_task(&cfg, "A", NewTask::default());
        let b = new_task(
            &cfg,
            "B",
            NewTask {
                blocked_by: vec![a.id.clone()],
                ..NewTask::default()
            },
        );
        let path = resolve(&cfg, &b.id).unwrap();
        let before = std::fs::read_to_string(&path).unwrap();
        let err = claim(&cfg, &b.id, "alice", true).unwrap_err();
        assert_eq!(err.code(), 5);
        assert_eq!(
            err.to_string(),
            format!("task {} is blocked by {}", b.id, a.id)
        );
        assert_eq!(std::fs::read_to_string(&path).unwrap(), before);

        let (task, unsatisfied) = claim(&cfg, &b.id, "alice", false).unwrap();
        assert_eq!(task.status, "claimed");
        assert_eq!(unsatisfied, [a.id]);
    }

    #[test]
    fn finishing_a_blocker_reports_the_newly_ready_dependents() {
        let (_d, cfg) = vault();
        let a = new_task(&cfg, "A", NewTask::default());
        let b = new_task(
            &cfg,
            "B",
            NewTask {
                blocked_by: vec![a.id.clone()],
                ..NewTask::default()
            },
        );
        let (_, unblocked) = terminate(&cfg, &a.id, Terminal::Finish, None, None).unwrap();
        assert_eq!(unblocked, [b.id]);
    }

    #[test]
    fn a_cycle_is_refused_before_any_write() {
        let (_d, cfg) = vault();
        let a = new_task(&cfg, "A", NewTask::default());
        let b = new_task(
            &cfg,
            "B",
            NewTask {
                blocked_by: vec![a.id.clone()],
                ..NewTask::default()
            },
        );
        let path = resolve(&cfg, &a.id).unwrap();
        let before = std::fs::read_to_string(&path).unwrap();
        let o = UpdateTask {
            blocked_by: Some(vec![b.id]),
            ..UpdateTask::default()
        };
        let err = update(&cfg, &a.id, o).unwrap_err();
        assert_eq!(err.code(), 2);
        assert!(err.to_string().starts_with("dependency cycle: "), "{err}");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), before);
    }

    #[test]
    fn create_and_update_mirror_the_edges_they_write() {
        let (_d, cfg) = vault();
        let a = new_task(&cfg, "A", NewTask::default());
        let b = new_task(
            &cfg,
            "B",
            NewTask {
                blocked_by: vec![a.id.clone()],
                ..NewTask::default()
            },
        );
        assert_eq!(get(&cfg, &a.id).unwrap().item.blocks, [b.id.clone()][..]);

        // A replace retracts the mirror it dropped.
        let o = UpdateTask {
            blocked_by: Some(vec![]),
            ..UpdateTask::default()
        };
        update(&cfg, &b.id, o).unwrap();
        assert!(get(&cfg, &a.id).unwrap().item.blocks.is_empty());
        assert!(deps::readiness(&rows(&cfg), &b.id).ready);
    }

    #[test]
    fn a_disabled_tasks_space_is_a_validation_error() {
        let dir = tempfile::tempdir().unwrap();
        let mut cfg = config_for(dir.path());
        cfg.spaces = crate::spaces::Spaces::resolve(
            dir.path(),
            &[(Space::Tasks, crate::spaces::SpaceSetting::Disabled)],
        )
        .unwrap();
        let err = create(&cfg, "T", NewTask::default()).unwrap_err();
        assert_eq!(err.code(), 2);
        assert_eq!(err.to_string(), "space 'tasks' is disabled in [spaces]");
    }
}
