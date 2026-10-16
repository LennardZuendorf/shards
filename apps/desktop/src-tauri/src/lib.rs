//! The Shards desktop shell: one generic `shards_call` command over `shards_host::Host`, a
//! passive vault watcher that emits `vault://changed`, and an optional vault picker.
#![forbid(unsafe_code)]
#![deny(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::todo,
    clippy::string_slice
)]

use std::path::PathBuf;
use std::sync::{Mutex, RwLock};
use std::time::Duration;

use serde_json::{json, Value};
use shards_host::{CallError, Host, VaultChange};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

const WATCH_DEBOUNCE: Duration = Duration::from_millis(150);
/// The picked vault survives restarts in this file under the app config dir.
const PREFS_FILE: &str = "desktop.json";

struct AppState {
    config: Option<PathBuf>,
    host: RwLock<Host>,
    watcher: Mutex<Option<shards_host::Watcher>>,
}

impl AppState {
    fn host(&self) -> Result<Host, CallError> {
        self.host
            .read()
            .map(|h| h.clone())
            .map_err(|_| unknown("host state is poisoned"))
    }
}

fn unknown(message: impl Into<String>) -> CallError {
    CallError::Unknown {
        message: message.into(),
    }
}

/// One generic command: exact parity with the stdio MCP tool surface plus the `host_*` tools.
/// `async` + spawn_blocking: the core is synchronous and a sync command would run on the main
/// thread.
#[tauri::command]
async fn shards_call(
    state: tauri::State<'_, AppState>,
    tool: String,
    args: Value,
) -> Result<Value, CallError> {
    let host = state.host()?;
    // `SHARDS_DESKTOP_TRACE=1`: one stderr line per call, so a headless smoke run can prove the
    // page loaded under the CSP and reached Rust through the capability.
    if std::env::var_os("SHARDS_DESKTOP_TRACE").is_some() {
        eprintln!("shards_call {tool}");
    }
    tauri::async_runtime::spawn_blocking(move || host.call(&tool, &args))
        .await
        .map_err(|e| unknown(e.to_string()))?
}

/// "Open in" (R41): open one vault file outside the app. `with` = `obsidian` (the file in
/// Obsidian), `default` (the system default app) or `reveal` (Finder). The path must be a
/// regular file inside an enabled space root, so the webview needs no `opener:allow-open-path`
/// scope of its own.
#[tauri::command]
async fn shards_open(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    path: String,
    with: String,
) -> Result<(), CallError> {
    let real = state.host()?.openable_path(&path)?;
    let opener = app.opener();
    let done = match with.as_str() {
        "obsidian" => opener.open_url(shards_host::obsidian_url(&real), None::<&str>),
        "default" => opener.open_path(real.display().to_string(), None::<&str>),
        "reveal" => opener.reveal_item_in_dir(&real),
        other => return Err(unknown(format!("unknown open target '{other}'"))),
    };
    done.map_err(|e| unknown(e.to_string()))
}

/// Open a folder picker and switch the app to that vault (same config file, vault override).
/// Returns `{vault}` on a switch, `null` when the user cancelled.
#[tauri::command]
async fn host_pick_vault(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Value, CallError> {
    let dialog = app.dialog().clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        dialog
            .file()
            .set_title("Choose a Shards vault folder")
            .blocking_pick_folder()
    })
    .await
    .map_err(|e| unknown(e.to_string()))?;
    let Some(picked) = picked else {
        return Ok(Value::Null);
    };
    let folder = picked
        .into_path()
        .map_err(|e| unknown(format!("not a local folder: {e}")))?;
    let host = Host::new(state.config.clone(), Some(folder.clone()));
    let Some(vault) = host.vault_root() else {
        return Err(unknown(format!(
            "no Shards config found at {}; run `shards init` first",
            host.config_path().display()
        )));
    };
    switch_vault(&app, &state, host);
    save_vault_pref(&app, &vault);
    Ok(json!({ "vault": vault.display().to_string() }))
}

/// Swap the host, restart the watcher on the new roots, and tell the UI everything changed.
fn switch_vault(app: &AppHandle, state: &AppState, host: Host) {
    if let Ok(mut slot) = state.host.write() {
        *slot = host.clone();
    }
    let watcher = start_watcher(app, &host);
    if let Ok(mut slot) = state.watcher.lock() {
        *slot = watcher;
    }
    let spaces = host.roots().into_iter().map(|(name, _)| name).collect();
    let _ = app.emit(
        "vault://changed",
        VaultChange {
            spaces,
            paths: Vec::new(),
        },
    );
}

fn start_watcher(app: &AppHandle, host: &Host) -> Option<shards_host::Watcher> {
    let handle = app.clone();
    match shards_host::watch(host, WATCH_DEBOUNCE, move |change| {
        let _ = handle.emit("vault://changed", change);
    }) {
        Ok(w) => Some(w),
        Err(e) => {
            eprintln!("watcher disabled: {e}");
            None
        }
    }
}

fn prefs_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join(PREFS_FILE))
}

fn load_vault_pref(app: &AppHandle) -> Option<PathBuf> {
    let text = std::fs::read_to_string(prefs_path(app)?).ok()?;
    let v: Value = serde_json::from_str(&text).ok()?;
    let path = PathBuf::from(v.get("vault")?.as_str()?);
    path.is_dir().then_some(path)
}

fn save_vault_pref(app: &AppHandle, vault: &std::path::Path) {
    let Some(path) = prefs_path(app) else { return };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::write(
        path,
        json!({ "vault": vault.display().to_string() }).to_string(),
    );
}

fn focus_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn run() {
    let config = std::env::var_os("SHARDS_CONFIG_PATH").map(PathBuf::from);
    let env_vault = std::env::var_os("SHARDS_VAULT").map(PathBuf::from);
    // The app acts as the configured human `[core].me` (D4). It sets $SHARDS_AGENT for the
    // whole process, so it runs here, before the builder spawns any thread.
    let _ = shards_host::adopt_configured_identity(config.as_deref());
    let mut builder = tauri::Builder::default();
    // single-instance must be the first plugin: a second launch focuses the running window.
    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            focus_main(app);
        }));
    }
    builder
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            let handle = app.handle().clone();
            // An explicit $SHARDS_VAULT wins; otherwise the last vault picked in the app.
            let vault = env_vault.or_else(|| load_vault_pref(&handle));
            let host = Host::new(config.clone(), vault);
            let watcher = start_watcher(&handle, &host);
            app.manage(AppState {
                config,
                host: RwLock::new(host),
                watcher: Mutex::new(watcher),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            shards_call,
            shards_open,
            host_pick_vault
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| eprintln!("tauri: {e}"));
}
