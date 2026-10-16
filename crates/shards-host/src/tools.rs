//! The UI-only `host_*` tools. They are never registered in the agent MCP table; the desktop
//! app and the browser-mode server reach them through `Host::call` only.
//!
//! Every tool is an adapter over core domain functions: deletes and body edits run under the
//! core's own locks, and restore goes through the sandbox and a no-clobber atomic write.

use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};

use serde_json::{json, Map, Value as Json};
use shards::config::{load_config, resolve_config_path, Config};
use shards::domain::{memories, notes, scratch, tasks, Filter, FromMeta};
use shards::error::{Result, ShardsError};
use shards::fm::Meta;
use shards::mcp::errors;
use shards::model::memory::Memory;
use shards::model::task::Task;
use shards::render::field_to_json;
use shards::spaces::Space;
use shards::storage::raw::write_new;
use shards::storage::safe_resolve;
use shards::text::slugify;

use crate::members::{guess_kind, read_host_config, HostConfig, Member};

/// Every host tool name, for discovery and tests.
pub const HOST_TOOLS: [&str; 16] = [
    "host_status",
    "host_notes_browse",
    "host_note_read",
    "host_members",
    "host_projects",
    "host_project_update",
    "host_dashboard",
    "host_task_delete",
    "host_note_delete",
    "host_memory_forget",
    "host_scratch_clear",
    "host_restore",
    "host_task_set_body",
    "host_note_set_body",
    "host_memory_set_body",
    "host_memory_update_body",
];

/// Where the host finds its vault and config.
pub(crate) struct Sources<'a> {
    pub config: Option<&'a Path>,
    pub vault: Option<&'a Path>,
}

impl Sources<'_> {
    fn cfg(&self) -> Result<Config> {
        load_config(self.config, self.vault)
    }

    fn config_path(&self) -> PathBuf {
        resolve_config_path(self.config)
    }

    fn host_config(&self) -> HostConfig {
        read_host_config(&self.config_path())
    }
}

/// Dispatch one host tool. Returns `(value, list)` like the core's `Outcome`.
pub(crate) fn call(src: &Sources, tool: &str, args: &Json) -> Result<(Json, bool)> {
    match tool {
        "host_status" => status(src).map(obj),
        "host_members" => members(src).map(list),
        "host_projects" => projects(src).map(list),
        "host_project_update" => project_update(src, args).map(obj),
        "host_dashboard" => dashboard(src).map(obj),
        "host_notes_browse" => {
            let cfg = src.cfg()?;
            Ok(list(
                notes::browse(&cfg)
                    .iter()
                    .map(|e| browse_row(&cfg, e))
                    .collect(),
            ))
        }
        "host_note_read" => {
            let cfg = src.cfg()?;
            let (entry, body) = notes::read_path(&cfg, &req_str(args, "path")?)?;
            let mut row = browse_row(&cfg, &entry);
            if let Json::Object(m) = &mut row {
                m.insert("body".into(), Json::String(body));
            }
            Ok(obj(row))
        }
        "host_task_delete" => {
            let cfg = src.cfg()?;
            let id = req_str(args, "id")?;
            let (path, content) = tasks::delete_raw(&cfg, &id)?;
            Ok(obj(deleted(&cfg, &id, &path, content)))
        }
        "host_note_delete" => {
            let cfg = src.cfg()?;
            let (id, path, content) = notes::delete_raw(&cfg, &req_str(args, "id")?)?;
            Ok(obj(deleted(&cfg, &id, &path, content)))
        }
        "host_memory_forget" => {
            let cfg = src.cfg()?;
            let (id, path, content) = memories::forget_raw(&cfg, &req_str(args, "id")?)?;
            Ok(obj(deleted(&cfg, &id, &path, content)))
        }
        "host_scratch_clear" => {
            let cfg = src.cfg()?;
            let name = req_str(args, "name")?;
            let agent = match opt_str(args, "agent")? {
                Some(a) => a,
                None => acting_identity(&cfg, &src.host_config()).ok_or_else(|| {
                    ShardsError::validation("no agent identity: pass agent or set [core].me")
                })?,
            };
            let (slug, path, content) = scratch::clear_raw(&cfg, &agent, &name)?;
            let mut value = deleted(&cfg, &slug, &path, content);
            if let Json::Object(m) = &mut value {
                m.insert("agent".into(), Json::String(slugify(&agent)));
            }
            Ok(obj(value))
        }
        "host_restore" => {
            let cfg = src.cfg()?;
            let raw = req_str(args, "path")?;
            let content = req_str(args, "content")?;
            let target = restore_target(&cfg, &raw, &content)?;
            write_new(&target, &content)?;
            Ok(obj(json!({ "path": display_path(&cfg, &target) })))
        }
        "host_task_set_body" => {
            let cfg = src.cfg()?;
            let task = tasks::set_body(&cfg, &req_str(args, "id")?, &req_body(args)?)?;
            Ok(obj(body_update(&task.id, &task.meta)))
        }
        "host_note_set_body" => {
            let cfg = src.cfg()?;
            let note = notes::set_body(&cfg, &req_str(args, "id")?, &req_body(args)?)?;
            Ok(obj(body_update(&note.id, &note.meta)))
        }
        // `host_memory_update_body` is the DECISIONS.md spelling; BUILD.md says `_set_body`.
        "host_memory_set_body" | "host_memory_update_body" => {
            let cfg = src.cfg()?;
            let memory = memories::set_body(&cfg, &req_str(args, "id")?, &req_body(args)?)?;
            Ok(obj(body_update(&memory.id, &memory.meta)))
        }
        other => Err(errors::unknown_tool(other)),
    }
}

/// One notes-browser row: `path` as every other host tool spells it, plus the absolute path the
/// "Open in" actions need.
fn browse_row(cfg: &Config, e: &notes::BrowseEntry) -> Json {
    json!({
        "path": display_path(cfg, &e.path),
        "abs_path": e.path.display().to_string(),
        "folder": e.folder,
        "title": e.title,
        "id": e.id,
        "tags": e.tags,
        "modified": e.modified,
    })
}

/// The nearest folder at or above the vault that Obsidian manages (holds `.obsidian/`).
fn obsidian_vault(vault: &Path) -> Option<PathBuf> {
    vault
        .ancestors()
        .find(|dir| dir.join(".obsidian").is_dir())
        .map(Path::to_path_buf)
}

fn obj(value: Json) -> (Json, bool) {
    (value, false)
}

fn list(values: Vec<Json>) -> (Json, bool) {
    (Json::Array(values), true)
}

// ---------------------------------------------------------------------------------------
// arguments
// ---------------------------------------------------------------------------------------

fn opt_str(args: &Json, key: &str) -> Result<Option<String>> {
    match args.get(key) {
        None | Some(Json::Null) => Ok(None),
        Some(Json::String(s)) => Ok(Some(s.clone())),
        Some(_) => Err(errors::wrong_type(key, "a string")),
    }
}

fn req_str(args: &Json, key: &str) -> Result<String> {
    opt_str(args, key)?
        .filter(|s| !s.is_empty())
        .ok_or_else(|| errors::missing(key))
}

/// `body` is required but may be the empty string (clearing a body is a real edit).
fn req_body(args: &Json) -> Result<String> {
    opt_str(args, "body")?.ok_or_else(|| errors::missing("body"))
}

// ---------------------------------------------------------------------------------------
// identity
// ---------------------------------------------------------------------------------------

/// The app's acting identity: `[core].me`, else the core's `[core].agent` / `$SHARDS_AGENT`.
pub(crate) fn acting_identity(cfg: &Config, hc: &HostConfig) -> Option<String> {
    hc.me
        .clone()
        .or_else(|| cfg.agent().map(str::to_string))
        .filter(|s| !s.is_empty())
}

// ---------------------------------------------------------------------------------------
// delete / restore
// ---------------------------------------------------------------------------------------

/// A path as the UI sees it: vault-relative when inside the vault, else absolute (a space
/// root configured outside the vault).
fn display_path(cfg: &Config, path: &Path) -> String {
    match path.strip_prefix(cfg.vault()) {
        Ok(rel) if !rel.as_os_str().is_empty() => rel.to_string_lossy().into_owned(),
        _ => path.to_string_lossy().into_owned(),
    }
}

fn deleted(cfg: &Config, id: &str, path: &Path, content: String) -> Json {
    json!({ "id": id, "path": display_path(cfg, path), "content": content })
}

/// Resolve where `host_restore` may write: a `.md` file inside an enabled space root, with no
/// dot component below that root (the walk would never see it), reached without `..`, and
/// shaped like a path one of the host deleters returns for that space (`restorable`).
fn restore_target(cfg: &Config, raw: &str, content: &str) -> Result<PathBuf> {
    let escape = || ShardsError::Validation(format!("path escapes sandbox: {raw}"));
    if raw.contains('\0') {
        return Err(escape());
    }
    let given = Path::new(raw);
    if given
        .components()
        .any(|c| matches!(c, Component::ParentDir | Component::CurDir))
    {
        return Err(escape());
    }
    let absolute = if given.is_absolute() {
        given.to_path_buf()
    } else {
        // `safe_resolve` joins a relative path onto the first sandbox root, not the vault;
        // the UI's paths are vault-relative, so join here.
        cfg.vault().join(given)
    };
    let resolved = safe_resolve(&cfg.spaces, &absolute)?;
    let rel = cfg
        .spaces
        .sandbox()
        .iter()
        .map(|r| shards::storage::realpath(r))
        .filter_map(|root| resolved.strip_prefix(&root).ok().map(Path::to_path_buf))
        .min_by_key(|rest| rest.components().count())
        .ok_or_else(escape)?;
    if rel.as_os_str().is_empty()
        || rel
            .components()
            .any(|c| c.as_os_str().to_string_lossy().starts_with('.'))
    {
        return Err(escape());
    }
    if resolved.extension().and_then(|e| e.to_str()) != Some("md") {
        return Err(ShardsError::Validation(format!(
            "only Markdown files can be restored: {raw}"
        )));
    }
    if let Err(why) = restorable(cfg, &resolved, content) {
        return Err(ShardsError::Validation(format!(
            "not a path a delete returns: {raw} ({why})"
        )));
    }
    Ok(resolved)
}

/// The space whose root is the most specific (deepest) one holding `path`, and the path
/// relative to it. The notes root may be the vault root and so contain every other root.
fn owning_space(cfg: &Config, path: &Path) -> Option<(Space, PathBuf)> {
    Space::ALL
        .into_iter()
        .filter_map(|space| {
            let root = shards::storage::realpath(cfg.root(space).ok()?);
            let rel = path.strip_prefix(&root).ok()?.to_path_buf();
            Some((space, root.components().count(), rel))
        })
        .max_by_key(|(_, depth, _)| *depth)
        .map(|(space, _, rel)| (space, rel))
}

/// The frontmatter `id` the restored content carries, if any.
fn content_id(content: &str) -> Option<String> {
    let (yaml, _) = shards::fm::split_frontmatter(content);
    let meta = shards::fm::parse_meta(&yaml?)?;
    meta.get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
}

/// Only what the deleters hand out may come back, so a restore can never plant a file the
/// verbs would not see (a task in the tasks root) or act as a general Markdown writer:
/// * tasks: `open/<t-id>.md` or `done/<t-id>.md`, whose frontmatter `id` is that stem;
/// * memories: an `m-` stem (any subfolder), with no conflicting frontmatter `id`;
/// * notes: an `n-` stem or an `n-` frontmatter id (adopted notes keep a foreign stem), and
///   an `n-` stem must agree with the frontmatter id when both are present;
/// * scratch: `<agent>/<name>.md`;
/// * assets: never (no host tool deletes an asset).
fn restorable(cfg: &Config, path: &Path, content: &str) -> std::result::Result<(), String> {
    let (space, rel) = owning_space(cfg, path).ok_or("outside every space")?;
    let parts: Vec<String> = rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect();
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or_default();
    let id = content_id(content);
    let id_agrees = || id.as_deref().is_none_or(|i| i == stem);
    match space {
        Space::Tasks => {
            let in_status_dir = parts.len() == 2
                && parts
                    .first()
                    .is_some_and(|d| tasks::TASK_SUBDIRS.contains(&d.as_str()));
            if !in_status_dir {
                return Err("a task lives in open/ or done/".into());
            }
            if !stem.starts_with("t-") || id.as_deref() != Some(stem) {
                return Err("a task file is <id>.md and its frontmatter id is that id".into());
            }
        }
        Space::Memories => {
            if !stem.starts_with("m-") || !id_agrees() {
                return Err("a memory file is <m-id>.md".into());
            }
        }
        Space::Notes => {
            let ok = if stem.starts_with("n-") {
                id_agrees()
            } else {
                id.as_deref().is_some_and(|i| i.starts_with("n-"))
            };
            if !ok {
                return Err("a note has an n- id".into());
            }
        }
        Space::Scratch => {
            if parts.len() != 2 {
                return Err("a scratch file is <agent>/<name>.md".into());
            }
        }
        Space::Assets => return Err("assets are not restored".into()),
    }
    Ok(())
}

fn body_update(id: &str, meta: &Meta) -> Json {
    let updated = meta
        .get("updated")
        .map(|v| field_to_json("updated", v))
        .unwrap_or(Json::Null);
    json!({ "id": id, "updated": updated })
}

// ---------------------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------------------

fn status(src: &Sources) -> Result<Json> {
    let cfg = src.cfg()?;
    let hc = src.host_config();
    let mut spaces = Map::new();
    for space in Space::ALL {
        let root = cfg
            .root(space)
            .ok()
            .map(|p| Json::String(p.display().to_string()))
            .unwrap_or(Json::Null);
        spaces.insert(space.name().to_string(), root);
    }
    let task_count = tasks::rows(&cfg)
        .iter()
        .filter(|r| Task::from_meta(&r.meta).is_some())
        .count();
    let counts = json!({
        "notes": notes::list(&cfg, &Filter::unbounded(), false).map(|v| v.len()).unwrap_or(0),
        "tasks": task_count,
        // Every memory on disk, superseded and private ones included (like tasks: all states).
        "memories": memories::rows(&cfg)
            .iter()
            .filter(|r| Memory::from_meta(&r.meta).is_some())
            .count(),
        "scratch": scratch::summary(&cfg).files,
        "assets": shards::domain::assets::summary(&cfg).count,
    });
    Ok(json!({
        "vault": cfg.vault().display().to_string(),
        "config_path": src.config_path().display().to_string(),
        "me": acting_identity(&cfg, &hc),
        "version": shards::VERSION,
        "spaces": Json::Object(spaces),
        "counts": counts,
        "obsidian_vault": obsidian_vault(cfg.vault()).map(|p| p.display().to_string()),
    }))
}

// ---------------------------------------------------------------------------------------
// members
// ---------------------------------------------------------------------------------------

fn members(src: &Sources) -> Result<Vec<Json>> {
    let cfg = src.cfg()?;
    let hc = src.host_config();
    let me = acting_identity(&cfg, &hc);

    // Identities seen doing work (owner / claimer) versus only authoring memories or scratch.
    let mut worker: Vec<String> = Vec::new();
    let mut authored: Vec<String> = Vec::new();
    let see = |list: &mut Vec<String>, id: Option<&str>| {
        if let Some(id) = id.map(str::trim).filter(|s| !s.is_empty()) {
            if !list.iter().any(|x| x == id) {
                list.push(id.to_string());
            }
        }
    };
    for row in tasks::rows(&cfg) {
        if let Some(task) = Task::from_meta(&row.meta) {
            see(&mut worker, task.owner.as_deref());
            see(&mut worker, task.claimed_by.as_deref());
        }
    }
    if let Ok(views) = notes::list(&cfg, &Filter::unbounded(), false) {
        for v in views {
            see(&mut worker, v.item.owner.as_deref());
            see(&mut worker, v.item.claimed_by.as_deref());
        }
    }
    if let Ok(views) = memories::list(&cfg, &Filter::unbounded(), &Default::default()) {
        for v in views {
            see(&mut authored, v.item.owner.as_deref());
        }
    }
    if let Ok(views) = scratch::list(&cfg, None, true, &Filter::unbounded()) {
        for v in views {
            see(&mut authored, Some(&v.item.agent));
        }
    }

    let mut out: Vec<Member> = hc.members.clone();
    let push = |out: &mut Vec<Member>, id: &str| {
        if out.iter().any(|m| m.id == id) {
            return;
        }
        let only_authored = !worker.iter().any(|w| w == id) && authored.iter().any(|a| a == id);
        out.push(Member {
            id: id.to_string(),
            kind: guess_kind(id, me.as_deref(), only_authored).to_string(),
            name: id.to_string(),
            color: None,
        });
    };
    if let Some(me) = &me {
        push(&mut out, me);
    }
    for id in &cfg.tasks.collections {
        push(&mut out, id);
    }
    let mut discovered: Vec<String> = worker.iter().chain(authored.iter()).cloned().collect();
    discovered.sort();
    discovered.dedup();
    for id in &discovered {
        push(&mut out, id);
    }
    Ok(out
        .into_iter()
        .map(|m| serde_json::to_value(m).unwrap_or(Json::Null))
        .collect())
}

// ---------------------------------------------------------------------------------------
// projects
// ---------------------------------------------------------------------------------------

struct ProjectAcc {
    id: String,
    title: String,
    slug: Option<String>,
    color: Option<String>,
    rank: Option<f64>,
    from_note: bool,
    archived: bool,
    /// The ordered `sections:` list the project note stores (empty sections included).
    stored_sections: Vec<String>,
    /// (section, order, created) of every task, for first-seen section order.
    sections: Vec<(String, Option<f64>, String)>,
    open_count: u64,
}

fn projects(src: &Sources) -> Result<Vec<Json>> {
    let cfg = src.cfg()?;
    let note_views = notes::list(&cfg, &Filter::unbounded(), false).unwrap_or_default();
    let titles: HashMap<String, String> = note_views
        .iter()
        .map(|v| (v.item.id.clone(), v.item.title.clone()))
        .collect();

    let mut accs: Vec<ProjectAcc> = Vec::new();
    for v in note_views.iter().filter(|v| v.item.note_type == "project") {
        let meta_str = |k: &str| {
            v.item
                .meta
                .get(k)
                .and_then(|x| x.as_str())
                .map(str::to_string)
        };
        let rank = v.item.meta.get("order").and_then(|x| match x {
            shards::fm::Value::Int(i) => Some(*i as f64),
            shards::fm::Value::Float(f) => Some(*f),
            _ => None,
        });
        accs.push(ProjectAcc {
            id: v.item.id.clone(),
            title: v.item.title.clone(),
            slug: Some(slugify(&v.item.title)),
            color: meta_str("color"),
            rank,
            from_note: true,
            archived: matches!(
                v.item.meta.get("archived"),
                Some(shards::fm::Value::Bool(true))
            ),
            stored_sections: clean_sections(&shards::model::common::meta_strings(
                &v.item.meta,
                "sections",
            )),
            sections: Vec::new(),
            open_count: 0,
        });
    }

    for row in tasks::rows(&cfg) {
        let Some(task) = Task::from_meta(&row.meta) else {
            continue;
        };
        let Some(pid) = task.project.as_deref().filter(|p| !p.is_empty()) else {
            continue;
        };
        let idx = match accs.iter().position(|a| a.id == pid) {
            Some(i) => i,
            None => {
                let title = titles.get(pid).cloned().unwrap_or_else(|| pid.to_string());
                accs.push(ProjectAcc {
                    id: pid.to_string(),
                    slug: Some(slugify(&title)),
                    title,
                    color: None,
                    rank: None,
                    from_note: false,
                    archived: false,
                    stored_sections: Vec::new(),
                    sections: Vec::new(),
                    open_count: 0,
                });
                accs.len() - 1
            }
        };
        let Some(acc) = accs.get_mut(idx) else {
            continue;
        };
        if task.status == "open" || task.status == "claimed" {
            acc.open_count += 1;
        }
        if let Some(section) = task.section.as_deref().filter(|s| !s.trim().is_empty()) {
            let created = task
                .created
                .map(|c| shards::timefmt::iso_z(&c))
                .unwrap_or_default();
            acc.sections
                .push((section.to_string(), task.order, created));
        }
    }

    // Project notes first (by `order`, then title), then ids only tasks reference.
    accs.sort_by(|a, b| {
        b.from_note
            .cmp(&a.from_note)
            .then_with(|| cmp_rank(a.rank, b.rank))
            .then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
            .then_with(|| a.id.cmp(&b.id))
    });

    Ok(accs
        .into_iter()
        .map(|mut a| {
            a.sections
                .sort_by(|x, y| cmp_rank(x.1, y.1).then_with(|| x.2.cmp(&y.2)));
            // The stored order first (empty sections included), then sections only tasks name.
            // `stored_sections` is the stored part alone: the app pins the shown order before
            // a task write would move a section that only task order places.
            let stored = a.stored_sections.clone();
            let mut sections: Vec<String> = a.stored_sections;
            for (s, _, _) in a.sections {
                if !sections.contains(&s) {
                    sections.push(s);
                }
            }
            json!({
                "id": a.id,
                "title": a.title,
                "slug": a.slug,
                "color": a.color,
                "sections": sections,
                "stored_sections": stored,
                "open_count": a.open_count,
                "archived": a.archived,
            })
        })
        .collect())
}

/// Named project colors the app offers (and `purple`/`grey` aliases). Hex colors also pass.
pub const PROJECT_COLOR_NAMES: [&str; 12] = [
    "red", "orange", "yellow", "green", "teal", "sky", "blue", "violet", "pink", "gray", "purple",
    "grey",
];

/// Longest accepted section name, in characters.
const MAX_SECTION_CHARS: usize = 120;

/// Trimmed, non-empty, first occurrence wins.
fn clean_sections(raw: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for s in raw {
        let s = s.trim();
        if !s.is_empty() && !out.iter().any(|x| x == s) {
            out.push(s.to_string());
        }
    }
    out
}

fn validate_section(name: &str) -> Result<()> {
    if name.chars().any(char::is_control) || name.chars().count() > MAX_SECTION_CHARS {
        return Err(ShardsError::Validation(format!(
            "invalid section name '{name}' (no control characters, at most {MAX_SECTION_CHARS} characters)"
        )));
    }
    Ok(())
}

fn validate_color(color: &str) -> Result<()> {
    let lower = color.to_ascii_lowercase();
    let hex = lower
        .strip_prefix('#')
        .is_some_and(|h| matches!(h.len(), 3 | 6 | 8) && h.chars().all(|c| c.is_ascii_hexdigit()));
    if hex || PROJECT_COLOR_NAMES.contains(&lower.as_str()) {
        return Ok(());
    }
    Err(ShardsError::Validation(format!(
        "invalid color '{color}' (one of {}, or #rgb / #rrggbb)",
        PROJECT_COLOR_NAMES.join(", ")
    )))
}

fn opt_bool(args: &Json, key: &str) -> Result<Option<bool>> {
    match args.get(key) {
        None | Some(Json::Null) => Ok(None),
        Some(Json::Bool(b)) => Ok(Some(*b)),
        Some(_) => Err(errors::wrong_type(key, "a boolean")),
    }
}

fn opt_str_list(args: &Json, key: &str) -> Result<Option<Vec<String>>> {
    match args.get(key) {
        None | Some(Json::Null) => Ok(None),
        Some(Json::Array(items)) => items
            .iter()
            .map(|v| {
                v.as_str()
                    .map(str::to_string)
                    .ok_or_else(|| errors::wrong_type(key, "a list of strings"))
            })
            .collect::<Result<Vec<_>>>()
            .map(Some),
        Some(_) => Err(errors::wrong_type(key, "a list of strings")),
    }
}

/// `renames`: `{ "<old section>": "<new section>" }`; `""` as the new name removes the section.
fn opt_renames(args: &Json) -> Result<Vec<(String, String)>> {
    match args.get("renames") {
        None | Some(Json::Null) => Ok(Vec::new()),
        Some(Json::Object(map)) => map
            .iter()
            .map(|(from, to)| {
                let to = to
                    .as_str()
                    .ok_or_else(|| errors::wrong_type("renames", "an object of strings"))?;
                let (from, to) = (from.trim().to_string(), to.trim().to_string());
                if from.is_empty() {
                    return Err(ShardsError::validation("renames: a section name is empty"));
                }
                validate_section(&to)?;
                Ok((from, to))
            })
            .collect(),
        Some(_) => Err(errors::wrong_type("renames", "an object of strings")),
    }
}

/// `host_project_update {id, title?, color?, archived?, sections?, renames?}`.
///
/// Everything is validated before the first write. Then every task of the project whose
/// `section` is a rename source is rewritten through `tasks::update` (its own lock and atomic
/// write, done tasks included), then the project note's frontmatter is written once
/// (`notes::set_meta`). A partial failure is safe to retry: the same call converges.
/// Returns the `host_projects` row plus `renamed_tasks` (ids whose `section` changed).
fn project_update(src: &Sources, args: &Json) -> Result<Json> {
    let id = req_str(args, "id")?;
    let title = opt_str(args, "title")?;
    let color = opt_str(args, "color")?;
    let archived = opt_bool(args, "archived")?;
    let sections = opt_str_list(args, "sections")?;
    let renames = opt_renames(args)?;
    if let Some(t) = &title {
        if t.trim().is_empty() {
            return Err(ShardsError::validation("title must not be empty"));
        }
    }
    if let Some(c) = color.as_deref().map(str::trim).filter(|c| !c.is_empty()) {
        validate_color(c)?;
    }
    if let Some(list) = &sections {
        for s in list {
            validate_section(s.trim())?;
        }
    }

    let cfg = src.cfg()?;
    let view = notes::get(&cfg, &id)?;
    if view.item.note_type != "project" {
        return Err(ShardsError::Validation(format!(
            "{} is a {} note, not a project",
            view.item.id, view.item.note_type
        )));
    }
    let pid = view.item.id.clone();

    // 1. Section renames on the tasks (one task, one lock, one atomic write each).
    let mut renamed_tasks: Vec<String> = Vec::new();
    if !renames.is_empty() {
        for row in tasks::rows(&cfg) {
            let Some(task) = Task::from_meta(&row.meta) else {
                continue;
            };
            if task.project.as_deref() != Some(pid.as_str()) {
                continue;
            }
            let Some(current) = task.section.as_deref().map(str::trim) else {
                continue;
            };
            let Some((_, to)) = renames.iter().find(|(from, _)| from == current) else {
                continue;
            };
            tasks::update(
                &cfg,
                &task.id,
                tasks::UpdateTask {
                    section: Some(to.clone()),
                    ..tasks::UpdateTask::default()
                },
            )?;
            renamed_tasks.push(task.id.clone());
        }
    }

    // 2. One frontmatter write on the project note.
    let mut changes: Vec<(&str, Option<shards::fm::Value>)> = Vec::new();
    if let Some(t) = &title {
        changes.push(("title", Some(shards::fm::Value::str(t.trim()))));
    }
    if let Some(c) = &color {
        let c = c.trim();
        changes.push((
            "color",
            (!c.is_empty()).then(|| shards::fm::Value::str(c.to_ascii_lowercase())),
        ));
    }
    if let Some(a) = archived {
        changes.push(("archived", a.then_some(shards::fm::Value::Bool(true))));
    }
    if sections.is_some() || !renames.is_empty() {
        let base = match &sections {
            Some(list) => list.clone(),
            None => current_sections(&cfg, &pid, &view.item.meta),
        };
        let mut next: Vec<String> = Vec::new();
        for s in clean_sections(&base) {
            let s = match renames.iter().find(|(from, _)| *from == s) {
                Some((_, to)) => to.clone(),
                None => s,
            };
            if !s.is_empty() && !next.contains(&s) {
                next.push(s);
            }
        }
        changes.push((
            "sections",
            (!next.is_empty()).then(|| shards::fm::Value::strings(next)),
        ));
    }
    if !changes.is_empty() {
        notes::set_meta(&cfg, &pid, &changes)?;
    }

    let mut row = projects(src)?
        .into_iter()
        .find(|p| p.get("id").and_then(Json::as_str) == Some(pid.as_str()))
        .ok_or_else(|| ShardsError::NoteNotFound(pid.clone()))?;
    if let Json::Object(m) = &mut row {
        m.insert("renamed_tasks".into(), json!(renamed_tasks));
    }
    Ok(row)
}

/// A project's section list as the app shows it now: the stored order, then sections only its
/// tasks name (by rank, then creation) — the base a rename edits when no `sections` is given.
fn current_sections(cfg: &Config, pid: &str, meta: &Meta) -> Vec<String> {
    let mut out = clean_sections(&shards::model::common::meta_strings(meta, "sections"));
    let mut seen: Vec<(String, Option<f64>, String)> = Vec::new();
    for row in tasks::rows(cfg) {
        let Some(task) = Task::from_meta(&row.meta) else {
            continue;
        };
        if task.project.as_deref() != Some(pid) {
            continue;
        }
        if let Some(s) = task
            .section
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            let created = task
                .created
                .map(|c| shards::timefmt::iso_z(&c))
                .unwrap_or_default();
            seen.push((s.to_string(), task.order, created));
        }
    }
    seen.sort_by(|x, y| cmp_rank(x.1, y.1).then_with(|| x.2.cmp(&y.2)));
    for (s, _, _) in seen {
        if !out.contains(&s) {
            out.push(s);
        }
    }
    out
}

/// Ascending by rank, unranked last.
fn cmp_rank(a: Option<f64>, b: Option<f64>) -> std::cmp::Ordering {
    use std::cmp::Ordering;
    match (a, b) {
        (Some(x), Some(y)) => x.partial_cmp(&y).unwrap_or(Ordering::Equal),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => Ordering::Equal,
    }
}

// ---------------------------------------------------------------------------------------
// dashboard
// ---------------------------------------------------------------------------------------

fn dashboard(src: &Sources) -> Result<Json> {
    use shards::cli::dashboard::{snapshot, TaskRow};
    let cfg = src.cfg()?;
    let frame = snapshot(&cfg, false);
    let task_rows = |rows: &[TaskRow]| -> Json {
        Json::Array(
            rows.iter()
                .map(|r| json!({ "id": r.id, "title": r.title, "claimed_by": r.claimed_by }))
                .collect(),
        )
    };
    let agents: Vec<Json> = frame
        .agents
        .iter()
        .map(|a| {
            json!({
                "identity": a.identity,
                "owns_open": a.owns_open,
                "claimed": a.claimed,
                "stale_claims": a.stale_claims,
                "notes_owned": a.notes_owned,
                "notes_claimed": a.notes_claimed,
            })
        })
        .collect();
    let activity: Vec<Json> = frame
        .activity
        .iter()
        .map(|r| {
            json!({
                "id": r.id,
                "type": r.kind,
                "title": r.title,
                "owner": r.owner,
                "claimed_by": r.claimed_by,
                "path": r.path,
                "mtime": r.mtime_seconds,
            })
        })
        .collect();
    let h = &frame.health;
    Ok(json!({
        "agents": agents,
        "tasks": {
            "ready": task_rows(&frame.tasks.ready),
            "blocked": task_rows(&frame.tasks.blocked),
            "claimed": task_rows(&frame.tasks.claimed),
        },
        "activity": activity,
        "health": {
            "notes_native": h.notes_native,
            "notes_foreign": h.notes_foreign,
            "dangling_links": h.dangling_links,
            "dangling_links_total": h.dangling_links_total,
            "stale_locks": h.stale_locks,
            "watcher_running": h.watcher_running,
            "watcher_pid": h.watcher_pid,
            "search_mode": h.search_mode,
            "search_reason": h.search_reason,
        },
    }))
}
