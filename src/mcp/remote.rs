//! Immutable authority for private remote calls. Local calls carry no principal.
use std::collections::HashSet;
use std::path::Path;

use crate::config::Config;
use crate::error::{Result, ShardsError};
use crate::fm::{read_meta_only, Meta};
use crate::model::common::meta_str;
use crate::spaces::{Space, Spaces};
use serde_json::{json, Value as Json};

/// A member declared in the receiver's local authority registry.
#[derive(Clone, Debug)]
pub struct RemoteMember {
    pub id: String,
    pub kind: String,
    pub sponsor: Option<String>,
}
/// A verified actor and its per-space authority. Fields cannot be changed by callers.
#[derive(Clone, Debug)]
pub struct Principal {
    actor: String,
    kind: String,
    scopes: HashSet<String>,
    members: Vec<RemoteMember>,
}
fn denied() -> ShardsError {
    ShardsError::validation("remote access denied")
}
impl Principal {
    /// Validate the complete local membership and scope declaration, then bind the actor.
    pub fn new(actor: &str, scopes: &[String], members: &[RemoteMember]) -> Result<Self> {
        let mut ids = HashSet::new();
        let mut namespaces = HashSet::new();
        for m in members {
            if m.id.is_empty()
                || crate::text::slugify(&m.id).is_empty()
                || !ids.insert(m.id.as_str())
                || !namespaces.insert(crate::text::slugify(&m.id))
                || !matches!(m.kind.as_str(), "human" | "agent")
            {
                return Err(denied());
            }
        }
        for m in members {
            if let Some(sponsor) = &m.sponsor {
                if m.kind != "agent"
                    || !members
                        .iter()
                        .any(|s| s.id == *sponsor && s.kind == "human")
                {
                    return Err(denied());
                }
            }
        }
        let member = members.iter().find(|m| m.id == actor).ok_or_else(denied)?;
        for scope in scopes {
            let Some((space, access)) = scope.split_once(':') else {
                return Err(denied());
            };
            if Space::from_name(space).is_none() || !matches!(access, "read" | "write") {
                return Err(denied());
            }
        }
        Ok(Self {
            actor: actor.into(),
            kind: member.kind.clone(),
            scopes: scopes.iter().cloned().collect(),
            members: members.to_vec(),
        })
    }
    pub fn actor(&self) -> &str {
        &self.actor
    }
    pub fn kind(&self) -> &str {
        &self.kind
    }
    /// Remote instructions contain no host paths, registry directory or local trust advice.
    pub fn instructions(&self) -> String {
        format!("Shards private MCP acts as '{}' from a verified grant. The local Rust authority enforces the grant on every call. Use only the listed tools and authorized spaces. Write scope includes read scope. Private memories and scratch require the actor's own namespace or an explicitly sponsored agent. Acting identity arguments must equal the verified actor. Task owner assignment does not change the acting identity. Search uses the authorized built-in corpus. Paths identify records relative to their named space. A transport failure can leave a mutation outcome unknown; never automatically replay a mutation.",self.actor)
    }

    /// Keep the configured identity spelling rules at the remote trust boundary.
    pub fn validate_config(&self, cfg: &Config) -> Result<()> {
        for m in &self.members {
            crate::domain::validate_owner(cfg, Some(&m.id))?;
        }
        Ok(())
    }
    pub fn allows(&self, space: Space, write: bool) -> bool {
        self.scopes.contains(&format!("{}:write", space.name()))
            || (!write && self.scopes.contains(&format!("{}:read", space.name())))
    }
    fn namespace(&self, owner: &str) -> bool {
        owner == self.actor
            || (self.kind == "human"
                && self.members.iter().any(|m| {
                    m.id == owner && m.kind == "agent" && m.sponsor.as_deref() == Some(&self.actor)
                }))
    }
    fn declared(&self, owner: &str) -> bool {
        self.members.iter().any(|m| m.id == owner)
    }
    fn require(&self, space: Space, write: bool) -> Result<()> {
        if self.allows(space, write) {
            Ok(())
        } else {
            Err(denied())
        }
    }
    /// Canonical schemas filtered by the explicit policy table, with adoption excluded.
    pub fn tools(&self) -> Vec<Json> {
        super::schema::tools_list()
            .as_array()
            .into_iter()
            .flatten()
            .filter(|tool| {
                tool.get("name")
                    .and_then(Json::as_str)
                    .is_some_and(|name| self.permitted(name))
            })
            .cloned()
            .collect()
    }
    fn permitted(&self, name: &str) -> bool {
        match policy(name) {
            Some(Policy::Space(s, w)) => self.allows(s, w),
            Some(Policy::Corpus) => Space::ALL.into_iter().any(|s| self.allows(s, false)),
            Some(Policy::Health) => true,
            Some(Policy::Attach) => {
                self.allows(Space::Assets, true)
                    && [Space::Notes, Space::Tasks, Space::Memories]
                        .into_iter()
                        .any(|s| self.allows(s, true))
            }
            Some(Policy::ReadAny(spaces)) => spaces.iter().any(|s| self.allows(*s, false)),
            None => false,
        }
    }
    pub(crate) fn authorize(&self, cfg: &Config, name: &str, args: &Json) -> Result<()> {
        self.validate_config(cfg)?;
        if !self.permitted(name) {
            return Err(denied());
        }
        let acting = match name {
            "shards_note_claim" | "shards_task_claim" => Some("claimer"),
            "shards_note_release" | "shards_task_release" | "shards_session_start" => Some("owner"),
            "shards_note_new" | "shards_memory_new" => Some("owner"),
            "shards_scratch_set" | "shards_scratch_append" => Some("agent"),
            _ => None,
        };
        if let Some(value) = acting
            .and_then(|key| args.get(key))
            .filter(|v| !v.is_null())
        {
            if value.as_str() != Some(&self.actor) {
                return Err(ShardsError::IdentityMismatch);
            }
        }
        if matches!(
            name,
            "shards_task_new" | "shards_task_update" | "shards_memory_update"
        ) {
            if let Some(owner) = args.get("owner").and_then(Json::as_str) {
                if !self.declared(owner) {
                    return Err(denied());
                }
                if name == "shards_memory_update"
                    && owner != self.actor
                    && (self.kind != "human" || !self.namespace(owner))
                {
                    return Err(denied());
                }
            }
        }
        if args.get("force").and_then(Json::as_bool) == Some(true)
            && (name == "shards_note_release" || name == "shards_task_release")
            && self.kind != "human"
        {
            return Err(denied());
        }
        if matches!(name, "shards_scratch_get" | "shards_scratch_list") {
            if let Some(agent) = args.get("agent").and_then(Json::as_str) {
                if !self.namespace(agent) {
                    return Err(denied());
                }
            }
        }
        if name == "shards_asset_attach" {
            if let Some(asset) = args.get("asset_id").and_then(Json::as_str) {
                self.authorize_write_target(cfg, Space::Assets, asset)?;
            }
            if let Some(target) = args.get("target").and_then(Json::as_str) {
                let space = Space::ALL
                    .into_iter()
                    .find(|s| s.id_prefix().is_some_and(|p| target.starts_with(p)))
                    .ok_or_else(denied)?;
                self.require(space, true)?;
                self.authorize_write_target(cfg, space, target)?;
            }
        }
        if matches!(
            name,
            "shards_task_new" | "shards_task_update" | "shards_task_block" | "shards_task_unblock"
        ) {
            let mut targets = Vec::new();
            for key in ["blocks", "blocked_by", "on"] {
                if let Some(values) = args.get(key).and_then(Json::as_array) {
                    targets.extend(values.iter().filter_map(Json::as_str).map(str::to_string));
                }
            }
            let replacing = name == "shards_task_update"
                && (args.get("blocks").is_some_and(|v| !v.is_null())
                    || args.get("blocked_by").is_some_and(|v| !v.is_null()));
            if replacing
                || (name == "shards_task_unblock"
                    && args.get("all").and_then(Json::as_bool) == Some(true))
            {
                if let Some(id) = args.get("task_id").and_then(Json::as_str) {
                    let all = crate::domain::tasks::graph_rows(cfg);
                    targets.extend(crate::domain::deps::effective_blockers(&all, id));
                    if replacing {
                        targets.extend(crate::domain::deps::dependents(&all, id));
                    }
                }
            }
            for target in targets {
                self.authorize_write_target(cfg, Space::Tasks, &target)?;
            }
        }
        // A remote task claim always preserves dependency readiness, regardless of local advisory mode.
        Ok(())
    }
    fn authorize_write_target(&self, cfg: &Config, space: Space, id: &str) -> Result<()> {
        let mut full = cfg.clone();
        full.spaces.set_principal(None);
        let (path, meta) = match space {
            Space::Notes => {
                let view = crate::domain::notes::get(&full, id)?;
                (view.path, view.item.meta)
            }
            Space::Tasks => {
                let view = crate::domain::tasks::get(&full, id)?;
                (view.path, view.item.meta)
            }
            Space::Memories => {
                let view = crate::domain::memories::get(&full, id)?;
                (view.path, view.item.meta)
            }
            Space::Assets => {
                let view = crate::domain::assets::get(&full, id)?;
                (view.path, view.item.meta)
            }
            Space::Scratch => return Err(denied()),
        };
        self.check_write(&cfg.spaces, &path, &meta)
    }
    pub(crate) fn visible(&self, spaces: &Spaces, path: &Path, meta: &Meta) -> bool {
        let resolved = crate::storage::realpath(path);
        let path = resolved.as_path();
        let Some(space) = space_of(spaces, path) else {
            return false;
        };
        if !self.allows(space, false) {
            return false;
        }
        // A narrower configured root changes the required space scope, never the
        // underlying private-memory or scratch-namespace object rule.
        if spaces
            .root(Space::Memories)
            .is_ok_and(|root| path.starts_with(root))
            && meta_str(meta, "scope") == Some("private")
            && !meta_str(meta, "owner").is_some_and(|owner| self.namespace(owner))
        {
            return false;
        }
        if let Ok(root) = spaces.root(Space::Scratch) {
            if let Ok(relative) = path.strip_prefix(root) {
                return relative
                    .components()
                    .next()
                    .and_then(|c| c.as_os_str().to_str())
                    .is_some_and(|slug| {
                        self.members
                            .iter()
                            .any(|m| crate::text::slugify(&m.id) == slug && self.namespace(&m.id))
                    });
            }
        }
        true
    }

    pub(crate) fn check_write(&self, spaces: &Spaces, path: &Path, meta: &Meta) -> Result<()> {
        let space = space_of(spaces, path).ok_or_else(denied)?;
        self.require(space, true)?;
        if !self.visible(spaces, path, meta) {
            return Err(denied());
        }
        if let Some(before) = read_meta_only(path) {
            if !self.visible(spaces, path, &before) {
                return Err(denied());
            }
            if meta_str(&before, "id").is_some_and(|id| id.starts_with("m-"))
                && meta_str(&before, "owner") != meta_str(meta, "owner")
            {
                let owner = meta_str(meta, "owner").ok_or_else(denied)?;
                if self.kind != "human" || !self.namespace(owner) {
                    return Err(denied());
                }
            }
            if meta_str(&before, "id").is_some_and(|id| id.starts_with("n-"))
                && meta_str(&before, "claimed_by").is_some_and(|o| o != self.actor)
                && meta_str(meta, "claimed_by").is_none()
            {
                let prior = meta_str(&before, "claimed_by").ok_or_else(denied)?;
                if self.kind != "human" || !self.namespace(prior) {
                    return Err(denied());
                }
            }
        }
        Ok(())
    }
}
#[derive(Clone, Copy)]
enum Policy {
    Space(Space, bool),
    Corpus,
    Attach,
    ReadAny(&'static [Space]),
    Health,
}
fn policy(name: &str) -> Option<Policy> {
    use Policy::{Corpus, Health, ReadAny, Space as S};
    Some(match name {
        "shards_note_get" | "shards_note_list" => S(Space::Notes, false),
        "shards_note_new"
        | "shards_note_append"
        | "shards_note_update"
        | "shards_note_claim"
        | "shards_note_release" => S(Space::Notes, true),
        "shards_task_get" | "shards_task_list" => S(Space::Tasks, false),
        "shards_task_new"
        | "shards_task_append"
        | "shards_task_claim"
        | "shards_task_release"
        | "shards_task_finish"
        | "shards_task_update"
        | "shards_task_cancel"
        | "shards_task_block"
        | "shards_task_unblock"
        | "shards_task_next" => S(Space::Tasks, true),
        "shards_memory_get" | "shards_memory_list" | "shards_memory_recall" => {
            S(Space::Memories, false)
        }
        "shards_memory_new" | "shards_memory_append" | "shards_memory_update" => {
            S(Space::Memories, true)
        }
        "shards_scratch_get" | "shards_scratch_list" => S(Space::Scratch, false),
        "shards_scratch_set" | "shards_scratch_append" => S(Space::Scratch, true),
        "shards_asset_get" | "shards_asset_list" => S(Space::Assets, false),
        "shards_asset_attach" => Policy::Attach,
        "shards_search" => Corpus,
        "shards_recent_activity" => ReadAny(&[Space::Notes, Space::Tasks]),
        "shards_build_context" | "shards_graph" | "shards_session_start" => {
            ReadAny(&[Space::Notes, Space::Tasks, Space::Memories])
        }
        "shards_project" => S(Space::Notes, false),
        "shards_health" => Health,
        _ => return None,
    })
}
pub(crate) fn space_of(spaces: &Spaces, path: &Path) -> Option<Space> {
    let path = crate::storage::realpath(path);
    Space::ALL
        .into_iter()
        .filter_map(|s| {
            spaces
                .root(s)
                .ok()
                .filter(|root| path.starts_with(root))
                .map(|root| (root.components().count(), s))
        })
        .max_by_key(|(n, _)| *n)
        .map(|(_, s)| s)
}
/// Apply visibility using the existing frontmatter reader before selection or ranking.
pub(crate) fn visible_path(cfg: &Config, path: &Path) -> bool {
    cfg.spaces
        .principal()
        .is_none_or(|p| read_meta_only(path).is_some_and(|m| p.visible(&cfg.spaces, path, &m)))
}
/// Authorize the exact metadata snapshot returned to a selector, rather than discovery data.
pub(crate) fn read_meta(cfg: &Config, path: &Path) -> Option<Meta> {
    let meta = read_meta_only(path)?;
    if cfg
        .spaces
        .principal()
        .is_some_and(|p| !p.visible(&cfg.spaces, path, &meta))
    {
        return None;
    }
    Some(meta)
}
/// The same reader with per-call visibility; locked mutation paths call this after locking.
pub(crate) fn read_doc(cfg: &Config, path: &Path) -> Option<crate::fm::Doc> {
    let doc = crate::fm::read_doc(path)?;
    if cfg
        .spaces
        .principal()
        .is_some_and(|p| !p.visible(&cfg.spaces, path, &doc.meta))
    {
        return None;
    }
    Some(doc)
}
/// Generated response metadata is redacted structurally. User bodies are never scanned.
pub(crate) fn redact(cfg: &Config, name: &str, value: &mut Json) {
    match name {
        "shards_graph" => {
            if let Some(Json::Array(nodes)) = value.get_mut("nodes") {
                for node in nodes {
                    redact_entry(cfg, node, true);
                }
            }
        }
        "shards_project" => {
            if let Some(project) = value.get_mut("project") {
                redact_entry(cfg, project, true);
            }
            for key in ["tasks", "notes", "memories"] {
                if let Some(Json::Array(entries)) = value.get_mut(key) {
                    for entry in entries {
                        redact_entry(cfg, entry, true);
                    }
                }
            }
        }
        "shards_note_list"
        | "shards_task_list"
        | "shards_memory_list"
        | "shards_memory_recall"
        | "shards_scratch_list"
        | "shards_asset_list"
        | "shards_search"
        | "shards_recent_activity"
        | "shards_build_context"
        | "shards_session_start" => {
            if let Json::Array(entries) = value {
                for entry in entries {
                    redact_entry(cfg, entry, true);
                }
            }
        }
        "shards_note_get" | "shards_task_get" | "shards_memory_get" | "shards_scratch_get"
        | "shards_asset_get" | "shards_task_next" => redact_entry(cfg, value, true),
        _ => redact_entry(cfg, value, false),
    }
}
fn redact_entry(cfg: &Config, value: &mut Json, generated_path: bool) {
    let Some(map) = value.as_object_mut() else {
        return;
    };
    if generated_path {
        if let Some(path) = map.get("path").and_then(Json::as_str).map(str::to_string) {
            let path = Path::new(&path);
            if let Some(space) = space_of(&cfg.spaces, path) {
                if let Ok(rel) = cfg
                    .root(space)
                    .and_then(|r| path.strip_prefix(r).map_err(|_| denied()))
                {
                    map.insert("path".into(), json!(rel.to_string_lossy()));
                    map.insert("space".into(), json!(space.name()));
                } else {
                    map.remove("path");
                }
            } else {
                map.remove("path");
            }
        }
    }
    // The owned relationship fields are generated metadata. Unknown frontmatter objects
    // and all prose fields are preserved byte-for-byte at the JSON value boundary.
    // Notes may carry any adopted type label. Entity id families own field semantics.
    let kind = map
        .get("id")
        .and_then(Json::as_str)
        .map(|id| {
            if id.starts_with("n-") {
                "note"
            } else if id.starts_with("t-") {
                "task"
            } else if id.starts_with("m-") {
                "memory"
            } else if id.starts_with("a-") {
                "asset"
            } else {
                ""
            }
        })
        .unwrap_or_default();
    let list_keys: &[&str] = match kind {
        "task" => &[
            "related",
            "blocks",
            "blocked_by",
            "blocked_by_unsatisfied",
            "unblocked",
        ],
        "note" | "project" | "memory" | "asset" => &["related"],
        _ => &[],
    };
    for key in list_keys {
        if let Some(Json::Array(ids)) = map.get_mut(*key) {
            ids.retain(|id| id.as_str().is_some_and(|id| reference_visible(cfg, id)));
        }
    }
    let scalar_keys: &[&str] = match kind {
        "task" => &["project", "parent"],
        "memory" => &["project", "superseded_by"],
        _ => &[],
    };
    for key in scalar_keys {
        if map
            .get(*key)
            .and_then(Json::as_str)
            .is_some_and(|id| !reference_visible(cfg, id))
        {
            map.remove(*key);
        }
    }
}
fn reference_visible(cfg: &Config, id: &str) -> bool {
    // Resolve through existing domain readers, never infer access from an id's presence.
    if id.starts_with("n-") {
        crate::domain::notes::get(cfg, id).is_ok()
    } else if id.starts_with("t-") {
        crate::domain::tasks::get(cfg, id).is_ok()
    } else if id.starts_with("m-") {
        crate::domain::memories::get(cfg, id).is_ok()
    } else if id.starts_with("a-") {
        crate::domain::assets::get(cfg, id).is_ok()
    } else {
        false
    }
}
/// Do not expose filesystem diagnostics, hidden candidates, or identifiers from errors.
pub(crate) fn safe_error(error: ShardsError) -> ShardsError {
    match error {
        ShardsError::IdentityMismatch => error,
        ShardsError::Validation(ref s) if s == "remote access denied" => error,
        ShardsError::Blocked { .. } => ShardsError::Blocked {
            task_id: "requested task".into(),
            blockers: "an unsatisfied dependency".into(),
        },
        ShardsError::Partial { .. } => ShardsError::validation(
            "remote operation partially applied; inspect the affected records before retrying",
        ),
        ShardsError::Lock(_) => ShardsError::Lock("requested entity is locked".into()),
        ShardsError::Io(_) => ShardsError::validation("remote storage operation failed"),
        _ => ShardsError::validation("remote operation refused; check authorized inputs"),
    }
}
