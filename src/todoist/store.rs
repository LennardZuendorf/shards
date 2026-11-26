//! The vault side of a pull: index the mirrored tasks, create one, or update one in place.
//!
//! Every write goes through the same primitives as the task verbs — the entity lock, the one
//! canonical frontmatter order, `tasks::persist` and the atomic writer — so an imported task is
//! an ordinary task with three extra keys, not a second kind of file.

use std::path::{Path, PathBuf};

use chrono::NaiveDate;

use crate::config::Config;
use crate::domain::recur::{self, Due};
use crate::domain::{taskline, tasks};
use crate::error::{Result, ShardsError};
use crate::fm::{Doc, Meta, Value};
use crate::model::common::ts_value;
use crate::model::task::{is_terminal, Task, TASK_FIELDS};
use crate::storage::{entity_lock, safe_resolve};
use crate::timefmt::now_utc;
use crate::todoist::model::{Desired, Snapshot};

/// One task file as the pull read it.
pub struct VaultTask {
    pub id: String,
    pub path: PathBuf,
    pub task: Task,
    pub doc: Doc,
}

/// The state the vault currently represents, in the same shape as [`Desired::snapshot`].
pub fn local_snapshot(vault: &VaultTask) -> Snapshot {
    let task = &vault.task;
    let mut tags = task.tags.clone();
    tags.sort();
    Snapshot {
        title: task.title.clone(),
        body: taskline::without_line(&vault.doc.body, &task.id),
        tags,
        priority: task.priority.clone().unwrap_or_default(),
        due: task.due.map(|due| due.to_string()).unwrap_or_default(),
        deadline: task
            .deadline
            .map(|date| date.to_string())
            .unwrap_or_default(),
        section: task.section.clone().unwrap_or_default(),
        project: task.todoist_project.clone().unwrap_or_default(),
        parent: task.parent.clone().unwrap_or_default(),
        // A terminal status the vault has and Todoist does not must keep its own value: folding
        // `cancelled` into `done` made a local cancellation hash equal to a pushed `done`, so the
        // next pull rewrote it back without reporting a divergence.
        state: match task.status.as_str() {
            "done" => "done",
            "cancelled" => "cancelled",
            _ => "open",
        }
        .to_string(),
    }
}

/// Whether the vault task still holds exactly the state the last pull wrote.
pub fn is_local_baseline(vault: &VaultTask) -> bool {
    vault
        .task
        .todoist_digest
        .as_deref()
        .is_some_and(|stored| stored == local_snapshot(vault).digest())
}

/// Every readable task file, in walk order.
pub fn index(cfg: &Config) -> Vec<VaultTask> {
    let mut out = Vec::new();
    for path in tasks::task_files(cfg) {
        let Some(doc) = tasks::read_task_doc(cfg, &path) else {
            continue;
        };
        let Some(task) = task_of(&doc.meta) else {
            continue;
        };
        out.push(VaultTask {
            id: task.id.clone(),
            path,
            task,
            doc,
        });
    }
    out
}

fn task_of(meta: &Meta) -> Option<Task> {
    use crate::domain::FromMeta;
    Task::from_meta(meta)
}

/// The outcome of applying one desired task to the vault.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Applied {
    Updated,
    Unchanged,
    /// The vault and the pull both moved: nothing was written.
    Diverged,
}

/// Create one imported task and return its new `t-` id.
pub fn create(cfg: &Config, desired: &Desired) -> Result<String> {
    let snapshot = &desired.snapshot;
    let completed = is_done(desired).then(|| desired.completed_at.unwrap_or_else(now_utc));
    let o = tasks::NewTask {
        priority: Some(snapshot.priority.clone()),
        tags: snapshot.tags.clone(),
        body: snapshot.body.clone(),
        due: non_empty(&snapshot.due),
        deadline: non_empty(&snapshot.deadline),
        section: non_empty(&snapshot.section),
        parent: non_empty(&snapshot.parent),
        ..tasks::NewTask::default()
    };
    // `owner` stays unset: a mirrored task is not owned by the agent that pulled it. The three
    // link keys ride along in the same transaction as the rest of the frontmatter.
    let extra = [
        ("owner".to_string(), Value::Null),
        ("todoist_id".to_string(), Value::str(&desired.todoist_id)),
        ("todoist_project".to_string(), Value::str(&snapshot.project)),
        ("todoist_digest".to_string(), Value::str(desired.digest())),
    ];
    let task = tasks::create_imported(cfg, &snapshot.title, o, &extra, completed)?;
    Ok(task.id)
}

/// An absent v2 value is `None`, never `Some("")`: create rejects a blank relation.
fn non_empty(raw: &str) -> Option<String> {
    (!raw.is_empty()).then(|| raw.to_string())
}

/// Apply the Todoist-owned fields onto an existing task.
///
/// The digest is checked again under the entity lock, so an edit that landed between the scan
/// and the write is a divergence, never an overwrite.
pub fn apply(cfg: &Config, vault: &VaultTask, desired: &Desired) -> Result<Applied> {
    let _guard = entity_lock(tasks::root(cfg)?, &vault.id)?;
    let path = tasks::resolve(cfg, &vault.id)?;
    let mut doc = tasks::read_task_doc(cfg, &path)
        .ok_or_else(|| ShardsError::TaskNotFound(vault.id.clone()))?;
    let Some(task) = task_of(&doc.meta) else {
        return Err(ShardsError::Malformed { path });
    };
    let current = VaultTask {
        id: task.id.clone(),
        path: path.clone(),
        task,
        doc: doc.clone(),
    };
    if current.task.todoist_id.as_deref() != Some(desired.todoist_id.as_str())
        || !is_local_baseline(&current)
    {
        return Ok(Applied::Diverged);
    }
    if local_snapshot(&current).digest() == desired.digest() {
        return Ok(Applied::Unchanged);
    }

    let now = now_utc();
    apply_fields(&mut doc.meta, desired);
    doc.meta.insert("updated".into(), ts_value(&now));
    let done = is_done(desired);
    let was_done = is_terminal(&current.task.status);
    if done {
        doc.meta.insert("status".into(), Value::str("done"));
        doc.meta.insert("claimed_by".into(), Value::Null);
        let at = current
            .task
            .completed
            .or(desired.completed_at)
            .unwrap_or(now);
        doc.meta.insert("completed".into(), ts_value(&at));
    } else if was_done {
        doc.meta.insert("status".into(), Value::str("open"));
        doc.meta.insert("claimed_by".into(), Value::Null);
        doc.meta.shift_remove("completed");
    }
    doc.body = desired.snapshot.body.clone();
    let meta = TASK_FIELDS.reorder(&doc.meta);
    tasks::validated(&meta, &current.id)?;
    doc.meta = meta;
    tasks::persist(cfg, &path, &doc, cfg.agent())?;
    move_if_needed(cfg, &path, &current.id, done)?;
    Ok(Applied::Updated)
}

fn is_done(desired: &Desired) -> bool {
    desired.snapshot.state == "done"
}

/// Insert the fields a pull owns. v2-style absent values are removed, never written blank.
fn apply_fields(meta: &mut Meta, desired: &Desired) {
    let snapshot = &desired.snapshot;
    meta.insert("title".into(), Value::str(&snapshot.title));
    meta.insert("tags".into(), Value::strings(snapshot.tags.clone()));
    meta.insert("priority".into(), Value::str(&snapshot.priority));
    set_or_remove(meta, "due", due_value(&snapshot.due));
    set_or_remove(meta, "deadline", deadline_value(&snapshot.deadline));
    set_or_remove(meta, "section", text_value(&snapshot.section));
    set_or_remove(meta, "parent", text_value(&snapshot.parent));
    set_or_remove(meta, "todoist_project", text_value(&snapshot.project));
    meta.insert("todoist_id".into(), Value::str(&desired.todoist_id));
    meta.insert("todoist_digest".into(), Value::str(desired.digest()));
}

fn text_value(raw: &str) -> Option<Value> {
    (!raw.is_empty()).then(|| Value::str(raw))
}

fn due_value(raw: &str) -> Option<Value> {
    Due::parse(raw).ok().map(Due::to_value)
}

fn deadline_value(raw: &str) -> Option<Value> {
    NaiveDate::parse_from_str(raw, "%Y-%m-%d")
        .ok()
        .map(recur::date_value)
}

fn set_or_remove(meta: &mut Meta, key: &str, value: Option<Value>) {
    match value {
        Some(value) => {
            meta.insert(key.to_string(), value);
        }
        None => {
            meta.shift_remove(key);
        }
    }
}

fn target_path(cfg: &Config, id: &str, done: bool) -> Result<PathBuf> {
    let folder = tasks::folder(cfg, if done { "done" } else { "open" })?;
    safe_resolve(&cfg.spaces, &folder.join(format!("{id}.md")))
}

/// Move a task between `open/` and `done/` after its status changed.
fn move_if_needed(cfg: &Config, path: &Path, id: &str, done: bool) -> Result<()> {
    let target = target_path(cfg, id, done)?;
    if target == path {
        return Ok(());
    }
    if target.exists() {
        return Err(ShardsError::Validation(format!(
            "todoist: cannot move {id} to {}: the target exists",
            target.display()
        )));
    }
    if let Some(dir) = target.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::rename(path, &target)?;
    Ok(())
}

/// A task id that a Todoist task already owns, if exactly one does.
pub fn find<'a>(index: &'a [VaultTask], todoist_id: &str) -> Vec<&'a VaultTask> {
    index
        .iter()
        .filter(|task| task.task.todoist_id.as_deref() == Some(todoist_id))
        .collect()
}

/// A title for the report, trimmed to something a terminal can print.
pub fn display_title(title: &str) -> String {
    let flat = title.replace(['\n', '\r'], " ");
    let trimmed = flat.trim();
    if trimmed.chars().count() > 60 {
        format!("{}…", trimmed.chars().take(59).collect::<String>())
    } else {
        trimmed.to_string()
    }
}
