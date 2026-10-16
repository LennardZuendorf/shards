//! Host glue shared by the Tauri app and the browser-mode HTTP server:
//! one generic `call` over `shards::mcp::tools::Server`, and a passive vault watcher.
#![forbid(unsafe_code)]
#![deny(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::todo,
    clippy::string_slice
)]

pub mod members;
mod tools;

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;
use serde_json::{json, Value};
use shards::config::{load_config, resolve_config_path};
use shards::mcp::tools::Server;
use shards::spaces::Space;

pub use tools::HOST_TOOLS;

/// Error envelope sent to the UI. `Domain` carries shards' agent-facing JSON envelope text.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CallError {
    Domain { message: String },
    Unknown { message: String },
}

/// Make the configured human `[core].me` the acting identity of every core verb this process
/// runs, and return it. `None` (and no change) when the config names no `me`.
///
/// The core resolves the actor of a write (task owner, claimer, the Outcome stamp of a finish)
/// from `$SHARDS_AGENT`, then `[core].agent`. The app acts as the human (DECISIONS D4), so the
/// host sets `$SHARDS_AGENT` to `me`, overriding any agent identity the launching shell exported.
/// The env var is process-wide: call this once at process start, before any thread is spawned
/// (the shards-host `main` before its runtime starts, the Tauri `run` before the builder).
pub fn adopt_configured_identity(config: Option<&Path>) -> Option<String> {
    let me = members::read_host_config(&resolve_config_path(config)).me?;
    std::env::set_var(shards::config::ENV_AGENT, &me);
    Some(me)
}

/// `obsidian://open?path=…` for an absolute file path: Obsidian opens the file in whichever of
/// its registered vaults contains it. Every byte outside RFC 3986 "unreserved" is
/// percent-encoded, `/` included.
pub fn obsidian_url(path: &Path) -> String {
    let mut out = String::from("obsidian://open?path=");
    for b in path.to_string_lossy().bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(char::from(b));
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// One vault, one dispatcher. Cheap to clone.
#[derive(Clone)]
pub struct Host {
    server: Arc<Server>,
    config: Option<PathBuf>,
    vault: Option<PathBuf>,
}

impl Host {
    pub fn new(config: Option<PathBuf>, vault: Option<PathBuf>) -> Host {
        Host {
            server: Arc::new(Server::new(config.clone(), vault.clone())),
            config,
            vault,
        }
    }

    /// Blocking: run on a blocking thread (spawn_blocking), never on an async executor thread.
    ///
    /// `host_*` names are the UI-only tools this crate implements; every other name is
    /// forwarded to the agent MCP dispatcher unchanged. Both answer `{value, list}`.
    pub fn call(&self, tool: &str, args: &Value) -> Result<Value, CallError> {
        let result = if tool.starts_with("host_") {
            let src = tools::Sources {
                config: self.config.as_deref(),
                vault: self.vault.as_deref(),
            };
            tools::call(&src, tool, args)
        } else {
            self.server.call(tool, args).map(|o| (o.value, o.list))
        };
        match result {
            Ok((value, list)) => Ok(json!({ "value": value, "list": list })),
            Err(e) => Err(CallError::Domain {
                message: shards::mcp::tool_error(&e),
            }),
        }
    }

    /// The canonical path of a regular file inside one of this vault's enabled space roots, for
    /// the "Open in" actions. Relative paths, directories, missing files and anything that
    /// resolves outside every root (`..`, symlinks) are refused.
    pub fn openable_path(&self, path: &str) -> Result<PathBuf, CallError> {
        let refuse = |why: &str| CallError::Unknown {
            message: format!("cannot open {path}: {why}"),
        };
        if !Path::new(path).is_absolute() {
            return Err(refuse("not an absolute path"));
        }
        let real = std::fs::canonicalize(path).map_err(|_| refuse("no such file"))?;
        if !real.is_file() {
            return Err(refuse("not a file"));
        }
        let inside = self
            .roots()
            .into_iter()
            .any(|(_, root)| std::fs::canonicalize(&root).is_ok_and(|r| real.starts_with(r)));
        if inside {
            Ok(real)
        } else {
            Err(refuse("outside the vault"))
        }
    }

    /// The config file this host reads (`--config`, `$SHARDS_CONFIG_PATH`, then the default).
    pub fn config_path(&self) -> PathBuf {
        resolve_config_path(self.config.as_deref())
    }

    /// The resolved vault root, when the config loads.
    pub fn vault_root(&self) -> Option<PathBuf> {
        load_config(self.config.as_deref(), self.vault.as_deref())
            .ok()
            .map(|c| c.vault().to_path_buf())
    }

    /// Every enabled space root, deduplicated, with the space name.
    pub fn roots(&self) -> Vec<(String, PathBuf)> {
        let Ok(cfg) = load_config(self.config.as_deref(), self.vault.as_deref()) else {
            return Vec::new();
        };
        let mut out: Vec<(String, PathBuf)> = Vec::new();
        for space in Space::ALL {
            if let Ok(root) = cfg.root(space) {
                if !out.iter().any(|(_, r)| r == root) {
                    out.push((space.name().to_string(), root.to_path_buf()));
                }
            }
        }
        out
    }
}

/// The batched payload of one `vault://changed` event.
#[derive(Debug, Clone, Serialize)]
pub struct VaultChange {
    pub spaces: Vec<String>,
    pub paths: Vec<String>,
}

/// Same rule as shards' private `cli::watch::interesting` (watch.rs:94-115): only
/// create/modify/remove, no directories, and no dot-path component below a root.
/// Skipping dot paths is what stops `.locks/` writes (and read-triggered events) from looping.
pub fn interesting(kind: &notify::EventKind, path: &Path, roots: &[PathBuf]) -> bool {
    use notify::EventKind;
    if !matches!(
        kind,
        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
    ) {
        return false;
    }
    if path.is_dir() {
        return false;
    }
    let relative = roots
        .iter()
        .filter_map(|root| path.strip_prefix(root).ok())
        .min_by_key(|rest| rest.components().count())
        .unwrap_or_else(|| Path::new(path.file_name().unwrap_or(path.as_os_str())));
    !relative
        .components()
        .any(|c| c.as_os_str().to_string_lossy().starts_with('.'))
}

/// Start a passive observer (no lock, no reconcile). Calls `emit` once per debounce tick
/// with every interesting path. Returns the debouncer: drop it to stop watching.
/// A running vault watcher; dropping it stops watching.
pub type Watcher = notify_debouncer_full::Debouncer<
    notify::RecommendedWatcher,
    notify_debouncer_full::RecommendedCache,
>;

pub fn watch<F>(host: &Host, debounce: Duration, emit: F) -> notify::Result<Watcher>
where
    F: Fn(VaultChange) + Send + 'static,
{
    let named = host.roots();
    let roots: Vec<PathBuf> = named.iter().map(|(_, r)| r.clone()).collect();
    let roots_cb = roots.clone();
    let mut debouncer = notify_debouncer_full::new_debouncer(
        debounce,
        None,
        move |res: notify_debouncer_full::DebounceEventResult| {
            let Ok(events) = res else { return };
            let mut paths: Vec<PathBuf> = Vec::new();
            for ev in events {
                for p in &ev.event.paths {
                    if interesting(&ev.event.kind, p, &roots_cb) && !paths.contains(p) {
                        paths.push(p.clone());
                    }
                }
            }
            if paths.is_empty() {
                return;
            }
            let mut spaces: Vec<String> = Vec::new();
            for p in &paths {
                if let Some((name, _)) = named.iter().find(|(_, r)| p.starts_with(r)) {
                    if !spaces.contains(name) {
                        spaces.push(name.clone());
                    }
                }
            }
            emit(VaultChange {
                spaces,
                paths: paths.iter().map(|p| p.display().to_string()).collect(),
            });
        },
    )?;
    for root in &roots {
        let _ = std::fs::create_dir_all(root);
        debouncer.watch(root, notify::RecursiveMode::Recursive)?;
    }
    Ok(debouncer)
}
