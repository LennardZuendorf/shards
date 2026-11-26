//! Todoist sync, slice 1: a read-only pull into the tasks space.
//!
//! One pull reads the allow-listed projects, maps every task onto the vault's fields, and either
//! creates, updates, or refuses to touch it. Nothing is ever sent to Todoist. A task is matched by
//! `todoist_id`, so a second pull is an update — or a no-op — never a duplicate.
//!
//! Two safety rules define the slice:
//!
//! - A task whose vault state no longer matches the digest the last pull wrote is **divergent**.
//!   It is reported and left untouched; local work is never overwritten by a pull.
//! - Anything Todoist holds that the vault cannot represent is named in the per-task field
//!   report. That list is the input to the write-back slice, so it is printed, not dropped.

pub mod client;
pub mod model;
pub mod store;

use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::Path;

use chrono::Duration as ChronoDuration;
use serde_json::{json, Map, Value as Json};

use crate::config::Config;
use crate::error::{Result, ShardsError};
use crate::timefmt::{iso_z, now_utc};
use client::Client;
use model::{Project, Section, TaskIn};
use store::Applied;

/// What a pull did to one task (or would do, in a dry run).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Action {
    Created,
    Updated,
    Unchanged,
    Diverged,
    Skipped,
}

impl Action {
    pub fn as_str(self) -> &'static str {
        match self {
            Action::Created => "created",
            Action::Updated => "updated",
            Action::Unchanged => "unchanged",
            Action::Diverged => "diverged",
            Action::Skipped => "skipped",
        }
    }
}

/// One task's outcome, including the properties the vault cannot represent.
#[derive(Clone, Debug)]
pub struct TaskReport {
    pub todoist_id: String,
    pub vault_id: Option<String>,
    pub title: String,
    pub action: Action,
    pub unsupported: Vec<String>,
    pub note: Option<String>,
}

/// Everything one pull has to say.
#[derive(Clone, Debug)]
pub struct Report {
    pub dry_run: bool,
    pub allow_list: Vec<String>,
    pub mirrored_projects: Vec<String>,
    pub skipped_projects: Vec<String>,
    pub missing_projects: Vec<String>,
    pub tasks: Vec<TaskReport>,
    pub retries: u32,
}

impl Report {
    fn count(&self, action: Action) -> usize {
        self.tasks.iter().filter(|t| t.action == action).count()
    }

    pub fn created(&self) -> usize {
        self.count(Action::Created)
    }

    pub fn updated(&self) -> usize {
        self.count(Action::Updated)
    }

    pub fn unchanged(&self) -> usize {
        self.count(Action::Unchanged)
    }

    pub fn diverged(&self) -> usize {
        self.count(Action::Diverged)
    }

    pub fn skipped(&self) -> usize {
        self.count(Action::Skipped)
    }

    /// Writes this pull performed (or would perform): creates plus updates.
    pub fn changes(&self) -> usize {
        self.created() + self.updated()
    }

    /// The machine-readable payload. Counts are explicit so a caller never has to derive them.
    pub fn to_json(&self) -> Json {
        let mut projects = Map::new();
        projects.insert("allow_list".into(), json!(self.allow_list));
        projects.insert("mirrored".into(), json!(self.mirrored_projects));
        projects.insert("skipped".into(), json!(self.skipped_projects));
        projects.insert("missing".into(), json!(self.missing_projects));

        let mut counts = Map::new();
        counts.insert("created".into(), json!(self.created()));
        counts.insert("updated".into(), json!(self.updated()));
        counts.insert("unchanged".into(), json!(self.unchanged()));
        counts.insert("diverged".into(), json!(self.diverged()));
        counts.insert("skipped".into(), json!(self.skipped()));
        counts.insert("changes".into(), json!(self.changes()));

        let tasks: Vec<Json> = self
            .tasks
            .iter()
            .map(|task| {
                let mut row = Map::new();
                row.insert("todoist_id".into(), json!(task.todoist_id));
                row.insert("vault_id".into(), json!(task.vault_id));
                row.insert("title".into(), json!(task.title));
                row.insert("action".into(), json!(task.action.as_str()));
                row.insert("unsupported".into(), json!(task.unsupported));
                if let Some(note) = &task.note {
                    row.insert("note".into(), json!(note));
                }
                Json::Object(row)
            })
            .collect();

        let mut root = Map::new();
        root.insert("dry_run".into(), json!(self.dry_run));
        root.insert("projects".into(), Json::Object(projects));
        root.insert("counts".into(), Json::Object(counts));
        root.insert("retries".into(), json!(self.retries));
        root.insert("tasks".into(), Json::Array(tasks));
        Json::Object(root)
    }
}

/// Pull every allow-listed Todoist project into the vault. `dry_run` reads and reports only.
pub fn pull(cfg: &Config, config_path: &Path, dry_run: bool) -> Result<Report> {
    let todoist = cfg.todoist.as_ref().ok_or_else(|| {
        ShardsError::Validation(
            "todoist: no [todoist] section in the config (add projects = [\"…\"])".to_string(),
        )
    })?;
    let allow_list: Vec<String> = todoist
        .projects
        .iter()
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .collect();
    if allow_list.is_empty() {
        return Err(ShardsError::Validation(
            "todoist: [todoist].projects is empty (name every project to mirror)".to_string(),
        ));
    }

    let token = client::resolve_token(todoist, config_path, cfg.vault())?;
    let client = Client::new(&todoist.base_url, token);

    let projects: Vec<Project> = client.get_all("/api/v1/projects")?;
    let sections: Vec<Section> = client.get_all("/api/v1/sections")?;
    let active: Vec<TaskIn> = client.get_all("/api/v1/tasks")?;

    // Completion state is a first-class pull field, so recently completed tasks are fetched too.
    // Todoist caps this window; 30 days keeps a pull cheap and is enough to mirror a completion.
    let until = now_utc();
    let since = until - ChronoDuration::days(30);
    let completed_path = format!(
        "/api/v1/tasks/completed/by_completion_date?since={}&until={}",
        client::encode_component(&iso_z(&since)),
        client::encode_component(&iso_z(&until))
    );
    let completed: Vec<TaskIn> = client.get_all(&completed_path)?;

    let mut by_project: BTreeMap<String, Project> = BTreeMap::new();
    for project in &projects {
        by_project.insert(project.id.clone(), project.clone());
    }
    let mut mirrored: Vec<String> = Vec::new();
    let mut skipped_projects: Vec<String> = Vec::new();
    for project in &projects {
        if allow_list.contains(&project.name) {
            mirrored.push(project.name.clone());
        } else {
            skipped_projects.push(project.name.clone());
        }
    }
    let missing_projects: Vec<String> = allow_list
        .iter()
        .filter(|name| !projects.iter().any(|project| &project.name == *name))
        .cloned()
        .collect();
    let mirrored_ids: HashSet<&str> = projects
        .iter()
        .filter(|project| allow_list.contains(&project.name))
        .map(|project| project.id.as_str())
        .collect();
    let section_names: HashMap<&str, &str> = sections
        .iter()
        .map(|section| (section.id.as_str(), section.name.as_str()))
        .collect();

    // One entry per Todoist id: the completed window can repeat a task that is active again,
    // and the active row is the current state.
    let mut all: BTreeMap<String, TaskIn> = BTreeMap::new();
    for task in completed.into_iter().chain(active.into_iter()) {
        all.insert(task.id.clone(), task);
    }
    let tasks: Vec<TaskIn> = all.into_values().collect();
    let depths = depths(&tasks, &mirrored_ids);

    let vault = store::index(cfg);
    let mut vault_ids: HashMap<String, String> = HashMap::new();
    let mut reports: Vec<TaskReport> = Vec::new();

    for task in ordered(&tasks, &depths) {
        let Some(project) = by_project.get(&task.project_id) else {
            reports.push(TaskReport {
                todoist_id: task.id.clone(),
                vault_id: None,
                title: store::display_title(&task.content),
                action: Action::Skipped,
                unsupported: Vec::new(),
                note: Some(format!("project {} is not in the mirror", task.project_id)),
            });
            continue;
        };
        if !mirrored_ids.contains(project.id.as_str()) {
            continue;
        }

        let mut note: Option<String> = None;
        let mut parent_vault: Option<String> = None;
        if let Some(parent) = task.parent_id.as_deref() {
            if !depths.contains_key(parent) || depths.get(&task.id).copied().flatten().is_none() {
                note = Some(format!("parent {parent} is not part of the mirrored set"));
            } else if let Some(vault_id) = vault_ids.get(parent) {
                parent_vault = Some(vault_id.clone());
            } else if dry_run {
                parent_vault = Some("<created-in-this-run>".to_string());
            } else {
                note = Some(format!("parent {parent} was not mirrored in this pull"));
            }
        }

        let section = task
            .section_id
            .as_deref()
            .and_then(|id| section_names.get(id).copied());
        let desired = model::desired(task, &project.name, section, parent_vault.as_deref());

        let mut unsupported = desired.unsupported.clone();
        if let Some(section_id) = task.section_id.as_deref() {
            if !section_names.contains_key(section_id) {
                unsupported.push("section".to_string());
            }
        }
        unsupported.sort();
        unsupported.dedup();

        if note.is_some() {
            reports.push(TaskReport {
                todoist_id: task.id.clone(),
                vault_id: None,
                title: store::display_title(&desired.snapshot.title),
                action: Action::Skipped,
                unsupported,
                note,
            });
            continue;
        }

        let existing = store::find(&vault, &task.id);
        if existing.len() > 1 {
            reports.push(TaskReport {
                todoist_id: task.id.clone(),
                vault_id: None,
                title: store::display_title(&desired.snapshot.title),
                action: Action::Skipped,
                unsupported,
                note: Some("more than one vault task carries this todoist_id".to_string()),
            });
            continue;
        }

        match existing.first() {
            None => {
                let vault_id = if dry_run {
                    None
                } else {
                    Some(store::create(cfg, &desired)?)
                };
                if let Some(id) = &vault_id {
                    vault_ids.insert(task.id.clone(), id.clone());
                } else {
                    vault_ids.insert(task.id.clone(), "<created-in-this-run>".to_string());
                }
                reports.push(TaskReport {
                    todoist_id: task.id.clone(),
                    vault_id,
                    title: store::display_title(&desired.snapshot.title),
                    action: Action::Created,
                    unsupported,
                    note: None,
                });
            }
            Some(vault_task) => {
                vault_ids.insert(task.id.clone(), vault_task.id.clone());
                let action = if !store::is_local_baseline(vault_task) {
                    Action::Diverged
                } else if store::local_snapshot(vault_task).digest() == desired.digest() {
                    Action::Unchanged
                } else if dry_run {
                    Action::Updated
                } else {
                    match store::apply(cfg, vault_task, &desired)? {
                        Applied::Updated => Action::Updated,
                        Applied::Unchanged => Action::Unchanged,
                        Applied::Diverged => Action::Diverged,
                    }
                };
                reports.push(TaskReport {
                    todoist_id: task.id.clone(),
                    vault_id: Some(vault_task.id.clone()),
                    title: if action == Action::Diverged {
                        store::display_title(&vault_task.task.title)
                    } else {
                        store::display_title(&desired.snapshot.title)
                    },
                    action,
                    unsupported,
                    note: None,
                });
            }
        }
    }

    Ok(Report {
        dry_run,
        allow_list,
        mirrored_projects: mirrored,
        skipped_projects,
        missing_projects,
        tasks: reports,
        retries: client.retries(),
    })
}

/// Whether every ancestor link in one task's chain resolves inside the mirrored set.
///
/// `None` means the task or one of its ancestors has no mirrored parent (or the chain loops);
/// such a task is skipped rather than guessed into a dependency edge.
fn depth_of(
    id: &str,
    by_id: &BTreeMap<String, TaskIn>,
    visiting: &mut HashSet<String>,
    memo: &mut BTreeMap<String, Option<usize>>,
) -> Option<usize> {
    if let Some(known) = memo.get(id) {
        return *known;
    }
    if !visiting.insert(id.to_string()) {
        return None;
    }
    let parent = by_id.get(id).and_then(|task| task.parent_id.as_deref());
    let depth = match parent {
        None => Some(0),
        Some(parent) => match by_id.get(parent) {
            Some(_) => depth_of(parent, by_id, visiting, memo).map(|d| d + 1),
            None => None,
        },
    };
    visiting.remove(id);
    memo.insert(id.to_string(), depth);
    depth
}

/// Depth for every task in the mirrored set; tasks rooted outside it are absent (and skipped).
fn depths(tasks: &[TaskIn], mirrored_ids: &HashSet<&str>) -> BTreeMap<String, Option<usize>> {
    let by_id: BTreeMap<String, TaskIn> = tasks
        .iter()
        .filter(|task| mirrored_ids.contains(task.project_id.as_str()))
        .map(|task| (task.id.clone(), task.clone()))
        .collect();
    let mut memo = BTreeMap::new();
    let mut visiting = HashSet::new();
    for id in by_id.keys() {
        depth_of(id, &by_id, &mut visiting, &mut memo);
    }
    memo
}

/// Parents first, then children; unresolved tasks last.
fn ordered<'a>(tasks: &'a [TaskIn], depths: &BTreeMap<String, Option<usize>>) -> Vec<&'a TaskIn> {
    let mut rows: Vec<(Option<usize>, &TaskIn)> = tasks
        .iter()
        .map(|task| (depths.get(&task.id).copied().flatten(), task))
        .collect();
    rows.sort_by_key(|(depth, task)| (*depth, task.id.clone()));
    rows.into_iter().map(|(_, task)| task).collect()
}

/// A dry-run description used in human output.
pub fn planned_verb(action: Action, dry_run: bool) -> &'static str {
    match (action, dry_run) {
        (Action::Created, true) => "would create",
        (Action::Updated, true) => "would update",
        (Action::Created, false) => "created",
        (Action::Updated, false) => "updated",
        (Action::Unchanged, _) => "unchanged",
        (Action::Diverged, _) => "diverged",
        (Action::Skipped, _) => "skipped",
    }
}
