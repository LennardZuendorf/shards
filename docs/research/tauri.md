# Shards desktop: Tauri 2 + frontend stack research (2026-10-15)

Scope: how to build the Shards desktop app (Tauri) on top of the existing `mesh` Rust crate, plus the
frontend stack. All versions below were verified on 2026-10-15 against the npm registry (`npm view`)
and the crates.io API (`max_stable_version`). Nothing was installed into the repo.

Repo under study: `~/.villain-worktrees/villain-mesh-improvements/mesh` (below: `mesh/`).

---

## 0. TL;DR recommendations

1. **Use Tauri 2.12.x (stable). Do not use Tauri 3.** v3 is `3.0.0-alpha.5` (released 2026-10-14). It
   sets MSRV 1.95 and Rust edition 2024. The repo pins Rust `1.94.1` (`mesh/rust-toolchain.toml:2`,
   `mesh/Cargo.toml:5`), so v3 cannot build there today. v3 also breaks the runtime selection,
   the GTK features and the ACL layout. Re-evaluate v3 when it reaches RC.
2. **Layout:** add `apps/desktop/` (Vite + React frontend) with `apps/desktop/src-tauri/` (a Rust
   crate `shards-desktop` with a path dependency on the root crate). Add a `[workspace]` table to the
   root `Cargo.toml`. Do not move the root crate.
3. **IPC:** use **one generic command** `shards_call(tool, args) -> Json`. It dispatches to the
   existing public `mesh::mcp::tools::Server::call(name, &Json)` (`mesh/src/mcp/tools.rs:183,192,222`).
   This gives exact parity between the UI and MCP. Add a few app-only commands (vault pick, watcher
   start, OAuth, reminders). Make every command `async` or `#[tauri::command(async)]`, because the
   mesh domain is synchronous (`mesh/src/mcp/mod.rs:4`, `mesh/src/mcp/proto.rs:4`). A plain sync
   command runs on the main thread and freezes the UI.
4. **Browser mode:** ship a small axum 0.8.9 server (`shards serve --http`) that exposes the same
   envelope: `POST /api/call/{tool}` plus `GET /api/events` (SSE). The frontend transport chooses
   with `isTauri()` from `@tauri-apps/api/core`. Vite proxies `/api` in dev. Playwright and
   agent-browser testing then work without a Tauri window.
5. **Live refresh:** a Rust `notify` watcher (reuse the root crate's `notify` 8 and
   `notify-debouncer-full` 0.6) emits a `vault://changed` event with `{space, ids, paths}`. The
   frontend invalidates TanStack Query keys. The watcher is an **observer only**. It must not take
   the `mesh watch` singleton lock (`mesh/src/cli/watch.rs:170`) and must not reconcile.
6. **Plugins (v2 stable):** single-instance (+`deep-link` feature), window-state, global-shortcut
   (quick-add), tray (core `tray-icon` feature), notification, deep-link, dialog (vault picker),
   store (UI prefs only), opener, updater, autostart, log. **Skip `plugin-fs`.** All vault IO goes
   through Rust commands, so the webview gets no filesystem scope.
7. **Reminders:** desktop notifications **ignore `schedule`**. Shards needs its own Rust-side
   reminder scheduler that fires immediate notifications. The app stays alive in the tray
   (close-to-tray + autostart).
8. **OAuth:** use a loopback redirect (RFC 8252; `tauri-plugin-oauth` 2.1.0) + PKCE as the default.
   It works in `tauri dev`. A deep-link `shards://auth/callback` is the production alternative.
   On macOS a deep link fires only for a bundled app in `/Applications`. Store tokens in the OS
   keychain (`keyring` 4.2.0), not in `plugin-store`.
9. **Frontend:** React 19.3 + Vite 8.3 (Rolldown) + `@vitejs/plugin-react` 6 + TypeScript 7.0
   (native) + Tailwind 4.3 via `@tailwindcss/vite` + shadcn CLI 4.21 (Radix, new-york, neutral)
   + TanStack Query 5.104 + dnd-kit core 6.3/sortable 10 + cmdk 1.1 + chrono-node 2.10 + date-fns 4 +
   sonner 2 + lucide-react 1.x + react-day-picker 10. Use Biome. Do not use typescript-eslint,
   because TS 7 has no compiler API.
10. **Required fix vs the Tauri Vite guide:** set `build.target: 'safari16.4'` (not `safari13`) and
    `bundle.macOS.minimumSystemVersion: "13.3"`, because Tailwind v4 needs Safari 16.4.

---

## 1. Verified versions

### 1.1 Tauri (Rust crates, crates.io `max_stable_version`)

| crate | stable | prerelease (`max_version`) | notes |
|---|---|---|---|
| `tauri` | **2.12.4** (MSRV 1.90) | 3.0.0-alpha.5 | updated 2026-10-14 |
| `tauri-build` | **2.7.3** | 3.0.0-alpha.4 | |
| `tauri-plugin-single-instance` | 2.5.4 | 3.0.0-alpha.3 | no JS package (npm `ERR` is expected) |
| `tauri-plugin-window-state` | 2.5.0 | 3.0.0-alpha.2 | |
| `tauri-plugin-global-shortcut` | 2.4.1 | 3.0.0-alpha.3 | |
| `tauri-plugin-notification` | 2.7.0 (MSRV 1.90) | 3.0.0-alpha.3 | |
| `tauri-plugin-deep-link` | 2.6.2 (MSRV 1.90) | 3.0.0-alpha.3 | |
| `tauri-plugin-updater` | 2.14.0 | 3.0.0-alpha.3 | |
| `tauri-plugin-dialog` | 2.8.3 | 3.0.0-alpha.4 | |
| `tauri-plugin-store` | 2.5.0 | 3.0.0-alpha.3 | |
| `tauri-plugin-opener` | 2.7.2 | 3.0.0-alpha.3 | |
| `tauri-plugin-log` | 2.10.1 | 3.0.0-alpha.3 | |
| `tauri-plugin-autostart` | 2.7.0 | 3.0.0-alpha.3 | |
| `tauri-plugin-positioner` | 2.4.0 | 3.0.0-alpha.3 | optional (quick-add panel near tray) |
| `tauri-plugin-fs` | 2.7.1 | 3.0.0-alpha.3 | **not recommended** (see §5) |
| `tauri-plugin-oauth` (FabianLars, community) | 2.1.0 | | loopback OAuth server |
| `tauri-specta` / `specta` | 2.0.0-rc.25 (stable line is 1.x for Tauri v1) | | still RC, see §4.4 |
| `notify` | 8.2.0 | 9.0.0-rc.5 | repo uses `notify = "8"` |
| `notify-debouncer-full` | 0.7.0 | 0.8.0-rc.2 | repo uses `0.6` |
| `axum` | 0.8.9 | | browser/dev HTTP API |
| `tower-http` | 0.7.1 | | CORS, static files |
| `tokio` | 1.53.3 | | Tauri already pulls it in |
| `keyring` | 4.2.0 | | OS keychain for OAuth tokens |
| `ts-rs` | 12.0.1 | | alternative TS type generator |
| `schemars` | 1.2.3 | | alternative JSON Schema generator |

Caution: `cargo search tauri` lists the **3.0 alphas first** (`tauri = "3.0.0-alpha.5"`). A naive
`cargo add tauri` without a version can pull v3 alpha into a workspace. Always pin `"2.12"`.

### 1.2 Tauri (npm, `latest` dist-tag)

| package | latest | `next` |
|---|---|---|
| `@tauri-apps/cli` | **2.12.3** (2026-10-14) | 3.0.0-alpha.5 |
| `@tauri-apps/api` | **2.12.4** | 3.0.0-alpha.3 |
| `create-tauri-app` | 4.7.5 | |
| `@tauri-apps/plugin-window-state` | 2.5.0 | |
| `@tauri-apps/plugin-global-shortcut` | 2.4.1 | |
| `@tauri-apps/plugin-notification` | 2.7.0 | |
| `@tauri-apps/plugin-deep-link` | 2.6.2 | |
| `@tauri-apps/plugin-updater` | 2.14.0 | |
| `@tauri-apps/plugin-dialog` | 2.8.3 | |
| `@tauri-apps/plugin-store` | 2.5.0 | |
| `@tauri-apps/plugin-opener` | 2.7.2 | |
| `@tauri-apps/plugin-os` / `-process` | 2.4.0 / 2.4.0 | |
| `@tauri-apps/plugin-log` | 2.10.1 | |
| `@tauri-apps/plugin-autostart` | 2.7.0 | |
| `@tauri-apps/plugin-positioner` | 2.4.0 | |
| `@tauri-apps/plugin-clipboard-manager` | 2.5.0 | |
| `@fabianlars/tauri-plugin-oauth` | 2.1.0 | |

Release cadence: 2.11.0 (2026-04-30) → 2.12.0 (2026-09-26) → 2.12.3 (2026-10-14). v2 still gets
weekly patches alongside v3 alpha. Use caret ranges (`^2.12`), commit the lockfile, and keep the JS
`@tauri-apps/api` minor equal to the Rust `tauri` minor. The CLI warns on a mismatch.

### 1.3 Frontend (npm `latest`)

| package | version | notes |
|---|---|---|
| `react` / `react-dom` | 19.3.1 | |
| `vite` | 8.3.4 | Vite 8 = Rolldown bundler, released 2026-03-12 |
| `@vitejs/plugin-react` | 6.1.2 | peer `vite ^8`; oxc transform; optional `babel-plugin-react-compiler` |
| `typescript` | 7.0.2 | native (Go) port, GA 2026-07-08; **no compiler API until 7.1** |
| `tailwindcss` / `@tailwindcss/vite` | 4.3.3 | plugin peer `vite ^5..^8` |
| `shadcn` (CLI) | 4.21.5 | |
| `radix-ui` (mono package) | 1.8.1 | what current shadcn imports |
| `@base-ui/react` | 1.9.0 | alternative primitives shadcn can target |
| `tw-animate-css` | 1.4.0 | replaces `tailwindcss-animate` under v4 |
| `@tanstack/react-query` | 5.104.3 | |
| `@tanstack/react-router` | 1.170.44 | optional; or `react-router` 8.4.0 |
| `@tanstack/react-virtual` | 3.14.20 | long task lists |
| `@dnd-kit/core` / `@dnd-kit/sortable` | 6.3.1 / 10.0.0 | last publish 2024-12-05, stable, in use by the reference |
| `@dnd-kit/react` | 0.5.1 | new API, still 0.x |
| `cmdk` | 1.1.1 | peer React ^18/^19; last publish 2025-08 |
| `chrono-node` | 2.10.3 | natural-language dates |
| `date-fns` | 4.4.0 | |
| `react-day-picker` | 10.0.2 | reference uses 9 |
| `sonner` | 2.0.8 | toasts |
| `lucide-react` | 1.57.0 | reference uses 0.453 |
| `zustand` | 5.0.15 | |
| `jotai` | 3.0.1 | reference uses 2.x |
| `motion` | 14.3.0 | optional animations |
| `@uiw/react-codemirror` / `@codemirror/lang-markdown` | 4.25.12 / 6.5.2 | Markdown body editor |
| `@milkdown/kit` / `@tiptap/react` | 7.22.3 / 3.32.0 | WYSIWYG alternatives |
| `react-markdown` | 10.1.0 | read-only rendering |

Local toolchain on this machine: node v24.15.0, pnpm 12.6.0, rustc 1.98.1 (Homebrew; the repo
toolchain file pins 1.94.1 through rustup). The Tauri CLI is not installed (`cargo tauri` → "no such
command"). Use the npm `@tauri-apps/cli` as a devDependency.

---

## 2. Why Tauri 2, not 3

From the v3 alpha changelog
(https://newreleases.io/project/github/tauri-apps/tauri/release/tauri-v3.0.0-alpha.0,
https://github.com/tauri-apps/tauri/releases):

- MSRV 1.95 and Rust edition 2024. The repo pins 1.94.1.
- You select the runtime at build time: `tauri::Builder::default().runtime(tauri_runtime_wry::Wry::default())`.
  The `wry`/`cef` features are removed, and a new CEF (Chromium) runtime is added.
- `tauri::tao`/`tauri::wry` re-exports are removed. The custom-scheme URL moves into the runtime.
- The ACL changes: apps get implicit `allow-*`/`deny-*`. On v2 you still list commands through
  `AppManifest::commands` (§5).
- The 3.0 milestone is ~25% complete (https://github.com/tauri-apps/tauri/milestone/5).

Decision: build on 2.12. Keep the Rust surface small (one generic command, plugin init in one
`lib.rs`), so a later v3 migration touches one file. v3's CEF runtime is worth revisiting if
WebKit-specific rendering bugs appear on Linux.

---

## 3. Project layout in the existing Cargo workspace

The root `mesh/Cargo.toml` is a single package (lib `mesh` + bins `mesh`, `mesh-mcp`) with no
`[workspace]` table. The Shards rename is out of scope here. Below, `mesh` stands for the core
crate, whatever it is called later (`shards`/`shards-core`).

```
mesh/                          (repo root; root package stays where it is)
├── Cargo.toml                 + [workspace] members = [".", "apps/desktop/src-tauri", "crates/shards-server"]
├── src/                       (lib + CLI + stdio MCP — unchanged)
├── apps/desktop/
│   ├── package.json           (vite, react, @tauri-apps/cli as devDependency)
│   ├── vite.config.ts
│   ├── index.html
│   ├── src/                   (React app)
│   │   ├── lib/transport.ts   (isTauri() ? invoke : fetch)
│   │   ├── lib/api.ts         (typed wrappers per tool)
│   │   └── components/ui/     (shadcn)
│   └── src-tauri/
│       ├── Cargo.toml         (package "shards-desktop"; mesh = { path = "../../.." })
│       ├── build.rs           (tauri_build::try_build(...AppManifest::commands(...)))
│       ├── tauri.conf.json
│       ├── capabilities/{main.json, quickadd.json}
│       ├── icons/
│       └── src/{main.rs, lib.rs, commands.rs, watcher.rs, reminders.rs, auth.rs}
└── crates/shards-server/      (optional: axum HTTP API + later remote MCP; or a `serve` subcommand)
```

Root `Cargo.toml` additions:

```toml
[workspace]
members = [".", "apps/desktop/src-tauri"]
resolver = "2"

[workspace.dependencies]
notify = "8"
notify-debouncer-full = "0.6"   # or bump to 0.7 in one place
serde = { version = "1", features = ["derive"] }
serde_json = { version = "1", features = ["preserve_order"] }
```

`apps/desktop/src-tauri/Cargo.toml`:

```toml
[package]
name = "shards-desktop"
version = "0.1.0"
edition = "2021"
rust-version = "1.94"
publish = false

[lib]
name = "shards_desktop_lib"
crate-type = ["staticlib", "cdylib", "rlib"]   # template default; rlib alone is fine desktop-only

[build-dependencies]
tauri-build = { version = "2.7", features = [] }

[dependencies]
mesh = { path = "../../.." }
tauri = { version = "2.12", features = ["tray-icon"] }
tauri-plugin-window-state = "2.5"
tauri-plugin-notification = "2.7"
tauri-plugin-deep-link = "2.6"
tauri-plugin-dialog = "2.8"
tauri-plugin-store = "2.5"
tauri-plugin-opener = "2.7"
tauri-plugin-log = "2.10"
tauri-plugin-oauth = "2.1"
notify = { workspace = true }
notify-debouncer-full = { workspace = true }
serde = { workspace = true }
serde_json = { workspace = true }
keyring = "4.2"

[target.'cfg(any(target_os = "macos", windows, target_os = "linux"))'.dependencies]
tauri-plugin-single-instance = { version = "2.5", features = ["deep-link"] }
tauri-plugin-global-shortcut = "2.4"
tauri-plugin-updater = "2.14"
tauri-plugin-autostart = "2.7"
```

Workspace notes:

- One `Cargo.lock` and one `target/` at the repo root. `tauri build` finds the workspace target
  dir. Bundles land in `target/release/bundle/`.
- The root `[profile.release]` (`lto = "thin"`, `codegen-units = 1`, `strip = true`,
  `mesh/Cargo.toml` tail) now applies to the desktop binary too. That is good for size and slow
  to link. Add `[profile.dev] incremental = true` defaults as needed. Add
  `[profile.dev.package."*"] opt-level = 1` if dev builds feel slow.
- `#![forbid(unsafe_code)]` and the strict clippy denies in `mesh/src/lib.rs` cover only the lib.
  Mirror the clippy denies in `shards-desktop` (Tauri macros are fine under `forbid(unsafe_code)`
  in the app crate).
- `cargo test` at the root now builds the desktop crate as well. Use `cargo test -p mesh` in the
  existing CI and add a separate desktop job. On Linux CI the desktop crate needs
  webkit2gtk-4.1/libsoup3 system packages.
- The Tauri CLI locates `src-tauri` by searching for `tauri.conf.json`. Run `pnpm tauri dev` from
  `apps/desktop/`.
- Rust 1.94.1 satisfies Tauri 2.12's MSRV of 1.90 (crates.io `rust_version`).

---

## 4. IPC design

### 4.1 One generic command, backed by the MCP dispatcher

The repo already has a uniform JSON entry point:

- `mesh::mcp::tools::Server::new(config_flag, vault_flag)` (`mesh/src/mcp/tools.rs:183,192`), public.
- `Server::call(&self, name: &str, arguments: &Json) -> Result<Outcome>`
  (`mesh/src/mcp/tools.rs:222`), public, with `Outcome { value: Json, list: bool }`
  (`tools.rs:60`). It dispatches ~35 `mesh_*` tools (notes, tasks, memories, scratch, assets,
  search, graph, context).
- `mesh::mcp::tool_error(&MeshError) -> String` (`mesh/src/mcp/mod.rs:198`) produces the
  agent-facing error envelope.

Recommended desktop command:

```rust
#[derive(serde::Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum CallError { Domain { message: String }, Unknown { message: String } }

#[tauri::command]
async fn shards_call(
    state: tauri::State<'_, AppState>,
    tool: String,
    args: serde_json::Value,
) -> Result<serde_json::Value, CallError> {
    let server = state.server.clone();          // Arc<mesh::mcp::tools::Server>
    tauri::async_runtime::spawn_blocking(move || server.call(&tool, &args))
        .await
        .map_err(|e| CallError::Unknown { message: e.to_string() })?
        .map(|o| serde_json::json!({ "value": o.value, "list": o.list }))
        .map_err(|e| CallError::Domain { message: mesh::mcp::tool_error(&e) })
}
```

Why one generic command and not many:

- **Parity.** The UI, the agents (stdio MCP) and the future remote MCP run the same code path and
  the same validation. A UI bug in this path is also an agent bug, and the reverse.
- **Small Rust surface.** Adding a tool to MCP makes it available to the UI with no new Tauri
  command and no capability edit.
- **The same envelope over HTTP** (§7), so browser mode is trivial.
- Cost: weaker static typing. Mitigate by generating TS types from the MCP schema (§4.4).

Add a few typed **app-only commands** next to it. These cover things that are not vault
operations: `vault_open(path)`, `vault_current()`, `watch_start()`, `auth_login()`, `auth_logout()`,
`reminders_sync()`, `quickadd_show()`.

Gaps to plan for (they are core work, not Tauri work): the UI needs operations that MCP does not
expose today. Examples: task delete/reorder/bulk update, projects and sections, saved filters,
and a richer `task_list` (due ranges, sort, group). Add them as `mesh_*` tools (they help agents
too), or add a second internal dispatcher `ui_*` that reuses the domain functions in
`mesh/src/domain/tasks.rs` (`create` :242, `update` :297, `list` :525, `delete` :563, ...).

### 4.2 Threading (required)

From https://v2.tauri.app/develop/calling-rust/: "Commands without the async keyword are executed
on the main thread unless defined with #[tauri::command(async)]." mesh is fully synchronous, with
"no async runtime" (`mesh/src/mcp/mod.rs:4`, `mesh/src/mcp/proto.rs:4`). It walks the vault, takes
`O_EXCL` locks (`mesh/src/storage/lock.rs`) and can wait on them. So:

- Every vault command is `async` + `spawn_blocking`, or `#[tauri::command(async)]`.
- Async commands cannot take borrowed args (`&str`). Use `String` and owned JSON.

### 4.3 Per-call config reload

`Server::ctx` (`mesh/src/mcp/tools.rs:208`) reloads the config on **every** call. This is correct
(it picks up config edits) but adds disk IO for each call. For a UI that issues 5–20 calls per
view, add a cached-config variant later (`Server::with_config(Config)` + invalidate on watcher
events touching the config file). Measure before optimizing.

### 4.4 Types across the boundary

Options:

1. **Generate TS from the MCP schema** (`mesh/src/mcp/schema.rs`, `schema::tools_list()`). A small
   build script emits `tools.d.ts` (input types per tool). Output types need a hand-written
   `types.ts` for Task/Note/Memory/Scratch views. **Recommended**: one source of truth, which
   agents already consume.
2. `tauri-specta` 2.0.0-rc.25: typed commands + events. It is still RC after 2+ years, has
   `=`-pin guidance and an open "release candidate status" question (2026-07-22,
   https://github.com/specta-rs/tauri-specta/issues). It fits many typed commands, not the
   single-generic-command design. Skip.
3. `ts-rs` 12.0.1: derive TS types on the model structs (`mesh/src/model/*`). This is fine for the
   output types if hand-written types drift.

### 4.5 Events and channels

- Events (`app.emit("vault://changed", payload)`) fit low-rate fan-out to all windows. "Events are
  not designed for low latency or high throughput"
  (https://v2.tauri.app/develop/calling-frontend/).
- Use `tauri::ipc::Channel<T>` when a command streams a response (e.g. a large search or import
  progress).
- React: register `listen()` inside `useEffect` and call `unlisten` in cleanup
  (`unlisten.then(f => f())`). The docs warn about calling `unlisten` before the promise resolves.

---

## 5. Capabilities and permissions (v2)

- Files live in `src-tauri/capabilities/*.json`. All files in the directory are enabled unless
  `app.security.capabilities` lists specific ones (https://v2.tauri.app/security/capabilities/).
- App commands registered through `invoke_handler` are allowed for **all windows** by default.
  To scope them, declare `tauri_build::AppManifest::new().commands(&["shards_call", ...])` in
  `build.rs`. Then grant `allow-shards-call` etc. per capability. (The v3 implicit `allow-*` does
  not exist on v2.)
- Scope by window label. Proposal:

`capabilities/main.json`:
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "main",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "allow-shards-call", "allow-vault-open", "allow-vault-current", "allow-watch-start",
    "allow-auth-login", "allow-auth-logout", "allow-reminders-sync",
    "dialog:allow-open",
    "notification:default",
    "deep-link:default",
    "store:default",
    "opener:allow-open-url",
    "window-state:default",
    "updater:default",
    "autostart:default",
    "global-shortcut:allow-register", "global-shortcut:allow-unregister", "global-shortcut:allow-is-registered",
    "oauth:allow-start", "oauth:allow-cancel",
    "log:default"
  ]
}
```

`capabilities/quickadd.json`: window `quickadd`, only `core:default` + `allow-shards-call`
(+ `core:window:allow-hide`).

- **No `fs:*` permissions.** The webview never touches the vault directly. The Rust side already
  sandboxes paths (`mesh/src/storage/sandbox.rs`). Granting `fs` scopes to the vault would bypass
  mesh's lock protocol and frontmatter emitter.
- `oauth` has no `default` permission set. You must list `allow-start`/`allow-cancel`
  (https://github.com/Playmoir/knowledge-base/blob/main/tauri-desktop-oauth.md).
- `global-shortcut` has no default permissions by design
  (https://v2.tauri.app/plugin/global-shortcut/). Registering from Rust needs no permission at all.
  Prefer that.
- Single-instance has no JS API, so it needs no permission
  (https://v2.tauri.app/plugin/single-instance/).

---

## 6. Plugins: what each one is for in Shards

| need | plugin / API | notes |
|---|---|---|
| One app instance; forward deep links / CLI args | `tauri-plugin-single-instance` 2.5 with `features = ["deep-link"]` | **must be registered first** (docs). Callback focuses `main`. |
| Remember window size/position | `tauri-plugin-window-state` 2.5 | exclude the `quickadd` window via denylist |
| Global quick-add (e.g. `Cmd+Shift+Space`) | `tauri-plugin-global-shortcut` 2.4 | register in Rust `setup`; toggle a small frameless always-on-top `quickadd` window (`decorations:false`, `visible:false`, `skipTaskbar:true`). Make the hotkey user-configurable in settings. |
| Tray / menu bar | core `tray-icon` feature (`TrayIconBuilder`) | menu: Quick add, Today, Open, Pause reminders, Quit. On Linux tray click events are not emitted (docs). |
| Reminders | `tauri-plugin-notification` 2.7 | **`schedule` is ignored on desktop**: "Scheduling is only implemented on mobile; the desktop implementation delivers the notification immediately and ignores the schedule" (https://docs.rs/tauri-plugin-notification/latest/tauri_plugin_notification/enum.Schedule.html). Build a Rust reminder loop: on start and on `vault://changed`, collect `reminder`/`due` datetimes, keep a min-heap, `tokio::time::sleep_until` the next one, then `.show()`. On Windows it works only for installed apps. Desktop action buttons are limited. |
| Keep reminders alive | close-to-tray (`on_window_event` → `CloseRequested` → `api.prevent_close(); window.hide()`) + `tauri-plugin-autostart` 2.7 (opt-in in settings) | |
| OAuth callback | `tauri-plugin-oauth` 2.1 (loopback) and/or `tauri-plugin-deep-link` 2.6 (`shards://`) | see §9 |
| Pick / create a vault folder | `tauri-plugin-dialog` 2.8 `open({ directory: true })` | then call `vault_open(path)` in Rust, which validates and persists |
| UI prefs (theme, sidebar, last view, hotkey) | `tauri-plugin-store` 2.5 | Not secrets. Not vault data. In browser mode fall back to `localStorage`. |
| Open links / reveal in Finder | `tauri-plugin-opener` 2.7 | `openUrl`, `revealItemInDir` |
| Auto update | `tauri-plugin-updater` 2.14 | needs signing keys (`tauri signer generate`), `bundle.createUpdaterArtifacts: true`, `TAURI_SIGNING_PRIVATE_KEY` env at build time ("`.env` files do not work"). macOS artifact: `.app.tar.gz` + `.sig`. Host `latest.json` on GitHub Releases. |
| Logs | `tauri-plugin-log` 2.10 | route Rust + webview logs to a file in the app log dir |
| Filesystem | ~~`tauri-plugin-fs`~~ | not needed; see §5 |

Plugin registration order in `lib.rs`: `single_instance` → `deep_link` → `log` → `window_state` →
others. Register `global_shortcut`, `updater` and `autostart` inside `#[cfg(desktop)]`.

---

## 7. File watching: refresh the UI when agents edit files

Agents write through the CLI/MCP from other processes. The UI must notice.

Design (`src-tauri/src/watcher.rs`):

1. On `vault_open`, start a `notify_debouncer_full::new_debouncer(Duration::from_millis(150), None, tx)`
   (same API the CLI uses at `mesh/src/cli/watch.rs:237`). Use `RecursiveMode::Recursive` on each
   enabled space root (`Config::root(space)`, as in `watched_roots`, `watch.rs:33`).
2. Filter events with the **same rules as `mesh watch`'s private `interesting()`**
   (`mesh/src/cli/watch.rs:94-115`): only `Create|Modify|Remove`, no directories, and skip any
   dot-path component. That skips `.locks/` and stops the read-triggers-event loop the comment at
   `watch.rs:90-93` describes. **Recommend moving `interesting()` and `watched_roots()` into the
   lib** (e.g. `mesh::storage::watch`), so the CLI and the desktop share them.
3. Map each path to `(space, id)` and emit one batched event per debounce tick:
   `app.emit("vault://changed", { space, ids, paths, kinds })`.
4. Frontend: one `useVaultEvents()` hook calls
   `queryClient.invalidateQueries({ queryKey: [space] })` (and `[space, id]` for open details).
   TanStack Query dedups and refetches only the active queries.
5. **Do not take the `mesh watch` singleton lock** (`watch.rs:170-171`) and **do not reconcile or
   move files**. The desktop watcher is a passive observer. If the user also runs `mesh watch`,
   the two coexist. Optionally show "watcher: CLI running" status by reading the lock's pid file.
6. Self-write echo: the UI's own writes come back as events. Invalidation is idempotent, so this
   is acceptable. To avoid flicker under optimistic updates, keep a short-lived (`~500 ms`)
   `recently_written: HashMap<PathBuf, Instant>` filled by `shards_call` mutations and drop
   matching events.
7. macOS uses FSEvents (coalesced and slightly delayed). The 150 ms debounce plus coalescing is
   fine for a task UI. Network/synced folders (iCloud, Dropbox) can drop events. Add a
   "refresh on window focus" fallback (TanStack `refetchOnWindowFocus` works in a Tauri webview).

---

## 8. Dev workflow, and the same frontend in a plain browser

### 8.1 `tauri dev` with Vite

`apps/desktop/src-tauri/tauri.conf.json` (core parts):

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Shards",
  "identifier": "app.shards.desktop",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "beforeBuildCommand": "pnpm build",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      { "label": "main", "title": "Shards", "width": 1200, "height": 800, "minWidth": 720, "minHeight": 480,
        "titleBarStyle": "Overlay", "hiddenTitle": true },
      { "label": "quickadd", "url": "/#/quick-add", "width": 640, "height": 140, "visible": false,
        "decorations": false, "alwaysOnTop": true, "skipTaskbar": true, "resizable": false, "center": true }
    ],
    "security": { "csp": "default-src 'self'; connect-src 'self' ipc: http://ipc.localhost; img-src 'self' asset: data: blob:; style-src 'self' 'unsafe-inline'" }
  },
  "bundle": {
    "active": true,
    "targets": ["app", "dmg"],
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"],
    "createUpdaterArtifacts": true,
    "macOS": { "minimumSystemVersion": "13.3" }
  },
  "plugins": {
    "deep-link": { "desktop": { "schemes": ["shards"] } },
    "updater": { "pubkey": "<PUBKEY>", "endpoints": ["https://github.com/<owner>/<repo>/releases/latest/download/latest.json"] }
  }
}
```

`vite.config.ts` (Tauri Vite guide, https://v2.tauri.app/start/frontend/vite/, "accurate as of
Vite 8"), **with the target corrected**:

```ts
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
    proxy: { "/api": "http://127.0.0.1:7878" },   // browser mode → shards-server
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    // NOT 'safari13' as in the Tauri guide: Tailwind v4 needs Safari 16.4 (@property, color-mix)
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome111" : "safari16.4",
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
```

Why the target matters: Tailwind v4 "depends on" Chrome 111 / Safari 16.4 / Firefox 128
(https://tailwindcss.com/docs/compatibility). macOS WKWebView follows the OS: Safari 16.4 = macOS
13.3, and macOS 12 ships WebKit 15.6 (https://v2.tauri.app/reference/webview-versions/). Another
Tauri + Tailwind v4 project hit exactly this
(https://github.com/debpalash/OmniVoice-Studio/issues/1268). So set
`minimumSystemVersion: "13.3"`.

Scripts (`apps/desktop/package.json`):

```json
{
  "scripts": {
    "dev": "vite",
    "dev:web": "concurrently -k \"cargo run -p mesh -- serve --http 127.0.0.1:7878\" \"vite\"",
    "build": "tsc -b && vite build",
    "tauri": "tauri",
    "check": "biome check --write ./src",
    "test": "vitest run"
  }
}
```

### 8.2 Browser mode against a local HTTP API

Purpose: fast UI iteration, Playwright and agent-browser tests, and a first step toward the
remote server.

- Server: axum 0.8.9 in the core crate behind a cargo feature (`http`), or in
  `crates/shards-server`. Routes:
  - `POST /api/call/{tool}` with body = args. It returns `{ value, list }` or `{ error }`, through
    the same `Server::call` in `spawn_blocking`.
  - `GET /api/events`: SSE stream fed by the same watcher module (§7), so the watcher must live
    in a crate both binaries share, not in `src-tauri`.
  - `GET /api/health`.
  - Bind `127.0.0.1` only. Require a random bearer token printed at start (local CSRF defence:
    any website can POST to localhost). Use `tower-http` CORS only for the Vite origin.
- Frontend transport (`src/lib/transport.ts`):

```ts
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export async function call<T>(tool: string, args: Record<string, unknown> = {}): Promise<T> {
  if (isTauri()) return invoke<T>("shards_call", { tool, args });
  const r = await fetch(`/api/call/${tool}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${import.meta.env.VITE_SHARDS_TOKEN}` }, body: JSON.stringify(args) });
  if (!r.ok) throw await r.json();
  return r.json();
}

export function onVaultChanged(cb: (e: VaultChange) => void): () => void {
  if (isTauri()) { const p = listen<VaultChange>("vault://changed", (e) => cb(e.payload)); return () => { p.then((u) => u()); }; }
  const es = new EventSource("/api/events"); es.onmessage = (m) => cb(JSON.parse(m.data)); return () => es.close();
}
```

  (`isTauri` is exported from `@tauri-apps/api/core` 2.12.4: verified in
  `https://unpkg.com/@tauri-apps/api@2.12.4/core.d.ts`, line 443.)
- Guard every plugin import behind `isTauri()` (dialog, notification, store). Provide web
  fallbacks: a text input for the vault path, the `Notification` web API, and `localStorage`.
- A mock transport (an in-memory fixture vault) lets component tests and a Storybook-like gallery
  run without Rust.
- The same axum server later grows the Streamable-HTTP remote MCP endpoint + OAuth. Keep the
  router modular.

---

## 9. OAuth for sync / remote MCP from the desktop

- **Default: loopback redirect + PKCE (RFC 8252 §7.3).** `tauri-plugin-oauth` 2.1.0 binds
  `127.0.0.1:<port>` and passes the redirect URL to a handler. "Because of the unprotected
  localhost port, you must verify the URL" (https://docs.rs/crate/tauri-plugin-oauth/latest).
  Validate `state`, use S256 PKCE, and exchange the code **in Rust**, so tokens never enter the
  webview. Add a ~2 min timeout + Cancel so the port is not left bound
  (https://github.com/Playmoir/knowledge-base/blob/main/tauri-desktop-oauth.md). Shards runs its
  own authorization server, so it can allow `http://127.0.0.1:*/callback` for the native public
  client.
- **Alternative: a deep link `shards://auth/callback`** via `tauri-plugin-deep-link` +
  single-instance `deep-link` feature. Caveats from the docs
  (https://v2.tauri.app/plugin/deep-linking/): "Deep links are only triggered for installed
  applications on desktop", and "Registering deep links at runtime is not possible on macOS, so
  deep links can only be tested on the bundled application, which must be installed in the
  `/Applications` directory." On Linux/Windows `register_all()` makes dev work. Still use deep
  links for "Open in Shards" links (`shards://task/<id>`), even if auth uses loopback.
- **Token storage:** OS keychain via `keyring` 4.2.0 (macOS Keychain / Windows Credential Manager /
  Secret Service). Not `plugin-store` (a plain JSON file). `plugin-stronghold` (2.4.0) is heavier
  and needs its own password. Skip it.
- Open the authorize URL with `opener.openUrl` (system browser). Never use an embedded webview for
  login.

---

## 10. macOS bundle basics

- `pnpm tauri build --bundles app,dmg` → `target/release/bundle/macos/Shards.app` + `dmg/`.
- Universal binary: `--target universal-apple-darwin` (needs both rust targets installed).
- `minimumSystemVersion: "13.3"` (see §8.1).
- Signing: a "Developer ID Application" certificate. Set `APPLE_SIGNING_IDENTITY` or
  `bundle.macOS.signingIdentity`. In CI: `APPLE_CERTIFICATE` (base64 .p12),
  `APPLE_CERTIFICATE_PASSWORD`. Notarization: `APPLE_ID`, `APPLE_PASSWORD` (app-specific),
  `APPLE_TEAM_ID`, or an App Store Connect API key. A free account cannot notarize
  (https://v2.tauri.app/distribute/sign/macos/). Before Developer ID exists, ship unsigned dev
  builds or ad-hoc sign (`signingIdentity: "-"`) for local use only.
- `Info.plist` merge file in `src-tauri/` for extra keys. `Entitlements.plist` only if you
  sandbox. **Do not enable App Sandbox** in v1: the user picks arbitrary vault folders, and agents
  write there. Sandboxing needs security-scoped bookmarks. Revisit for the Mac App Store.
- GUI apps do not inherit the shell `$PATH` (docs). If Shards shells out to `mesh`, `git` or
  `indexed`, use `fix-path-env` or resolve absolute paths.
- Updater artifacts: `Shards.app.tar.gz` + `.sig`. The private key and password come from env vars
  in CI.

---

## 11. Frontend stack: recommendation and setup

### 11.1 Choices

| layer | pick | why |
|---|---|---|
| UI framework | React 19.3 | reference plugin is React; largest shadcn/dnd/cmdk ecosystem |
| Build | Vite 8.3 + `@vitejs/plugin-react` 6.1 | Tauri's documented path; Rolldown is fast; plugin 6 needs Vite 8 |
| Language | TypeScript 7.0.2 (`tsc` is the Go port) | ~10x faster type-check. **No programmatic API until 7.1** (https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/): typescript-eslint, ts-morph and some Vite checker plugins cannot use it. Use **Biome** for lint/format (as obsidian-taskui does, `biome.json`). If a tool needs the TS API, use the documented alias: `"typescript": "npm:@typescript/typescript6@^6.0.2"`, `"@typescript/native": "npm:typescript@^7.0.2"`. |
| Styling | Tailwind 4.3 via `@tailwindcss/vite` | CSS-first config (`@theme`), no `tailwind.config.*`, no PostCSS/autoprefixer |
| Components | shadcn (CLI 4.21.5), style new-york, base color neutral, Radix primitives (`radix-ui` 1.8.1) | matches reference `components.json`. Base UI (`@base-ui/react` 1.9) is the other option shadcn offers. Stay on Radix for continuity. |
| Server state | TanStack Query 5.104 | cache keyed by `[space, filter]`, invalidated by watcher events, optimistic mutations for check/drag |
| Client state | zustand 5 (or keep jotai 3) | small: selection, open panels, command palette state |
| Routing | TanStack Router 1.170 (hash history in Tauri) or react-router 8 | views: Inbox, Today, Upcoming, Project/<id>, Label/<x>, Filter/<x>, Memories, Scratch, Notes, Agents |
| Drag and drop | `@dnd-kit/core` 6.3.1 + `@dnd-kit/sortable` 10.0.0 | reference already uses them. Stable. `@dnd-kit/react` 0.5 is the future API but still 0.x. |
| Command palette / quick find | `cmdk` 1.1.1 (shadcn `command`) | |
| NL dates | `chrono-node` 2.10.3 | quick-add parsing ("tomorrow 5pm", "every mon"). Recurrence needs a small own parser on top. |
| Dates | `date-fns` 4.4 + `react-day-picker` 10 (shadcn `calendar`) | |
| Toasts / undo | `sonner` 2.0.8 | "Task completed · Undo" |
| Icons | `lucide-react` 1.57 | |
| Virtualization | `@tanstack/react-virtual` 3.14 | 1k+ task lists |
| Markdown | CodeMirror 6 (`@uiw/react-codemirror` + `@codemirror/lang-markdown`) for body editing; `react-markdown` 10 for read-only | keeps files byte-faithful; avoids WYSIWYG round-trip loss of frontmatter/wikilinks |
| Forms | react-hook-form + zod (as reference) | task editor dialog |
| Tests | Vitest + Testing Library; Playwright against browser mode (§8.2) | |

### 11.2 Setup steps (Tailwind v4 + shadcn on Vite)

From https://ui.shadcn.com/docs/installation/vite and
https://tailwindcss.com/docs/installation/using-vite:

```bash
# inside apps/desktop (scaffold once; do not run at the task-folder root)
pnpm create vite@latest . --template react-ts      # or: pnpm create tauri-app (create-tauri-app 4.7.5)
pnpm add tailwindcss @tailwindcss/vite
printf '@import "tailwindcss";\n' > src/index.css
# tsconfig.json AND tsconfig.app.json → compilerOptions: { "baseUrl": ".", "paths": { "@/*": ["./src/*"] } }
pnpm add -D @types/node
# vite.config.ts → plugins: [react(), tailwindcss()], resolve.alias "@" (see §8.1)
pnpm dlx shadcn@latest init                       # existing project; or `init -t vite` for a fresh one
pnpm dlx shadcn@latest add button input textarea checkbox badge dialog sheet popover dropdown-menu \
  context-menu command calendar tooltip separator scroll-area tabs sidebar sonner select toggle-group kbd
pnpm add @tauri-apps/api @tauri-apps/plugin-dialog @tauri-apps/plugin-notification @tauri-apps/plugin-store \
  @tauri-apps/plugin-opener @tauri-apps/plugin-deep-link @tauri-apps/plugin-global-shortcut @tauri-apps/plugin-window-state \
  @tauri-apps/plugin-updater @tauri-apps/plugin-log @fabianlars/tauri-plugin-oauth
pnpm add -D @tauri-apps/cli
pnpm add @tanstack/react-query @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities cmdk chrono-node date-fns sonner lucide-react zustand
```

Notes:
- `components.json` for v4: `"tailwind": { "config": "" , "css": "src/index.css", ... }`. Leave
  `config` blank for v4 (https://ui.shadcn.com/docs/components-json).
- shadcn also offers `shadcn/create` presets (`init --preset <code> --template vite`), with options
  such as `--base`, `--monorepo` and `--rtl`. **The exact `--base` values for CLI 4.21 were not
  verified.** Run `pnpm dlx shadcn@latest init --help` before scripting it.
- Animations: v4 setups use `tw-animate-css` (1.4.0) instead of `tailwindcss-animate`. The shadcn
  init writes this.
- Dark mode: shadcn v4 tokens use CSS variables + `@custom-variant dark (&:is(.dark *))`. Follow
  the OS via `prefers-color-scheme` or the Tauri `theme` window API.
- macOS look: `titleBarStyle: "Overlay"` + `hiddenTitle`. Add a `data-tauri-drag-region` header
  and pad the sidebar top ~28px for the traffic lights.

### 11.3 Porting from obsidian-taskui

The reference (`scratchpad/ref/obsidian-taskui/package.json`) runs React 18.3, Tailwind 3.4
(`tailwind.config.cjs`, `postcss.config.cjs`), TS 4.8, Vite 7, lucide 0.453, jotai 2,
react-day-picker 9, `tailwindcss-animate`, `@tanstack/react-table` 8, emblor (tag input),
react-hook-form + zod, `@dnd-kit/*`, cmdk, chrono-node. Its `components.json` is style
`new-york`, base `neutral`, with aliases under `@/ui/*`. Porting impact:

- Tailwind 3 → 4: run `npx @tailwindcss/upgrade`. Theme moves into CSS `@theme`. Drop the
  PostCSS config. Remove Obsidian CSS-variable bridging (`var(--background-primary)` etc.) and
  replace it with shadcn tokens.
- React 18 → 19: `forwardRef` is no longer needed (ref is a prop), and `@types/react` 19.
- lucide 0.x → 1.x: a few icon renames. jotai 2 → 3: API check. react-day-picker 9 → 10:
  shadcn `calendar` regenerate.
- Remove `obsidian`, `obsidian-dataview` and `@ophidian/core`. Replace the Dataview data layer
  with the `call()` transport (§8.2).
- Its views (`src/ui/components/{task,table,forms,views}`) are a good structural template: task
  row, task table, task form, board view.

---

## 12. Risks and open questions

| risk | mitigation |
|---|---|
| Tauri v3 lands during development | keep the Rust surface tiny; pin `^2.12`; migrate after v3 RC + Rust ≥1.95 bump |
| Sync domain calls block | all commands async/`spawn_blocking` (§4.2); add a timeout on lock waits |
| Config reload per call is slow on large vaults | cache config; benchmark `task_list` on 2k tasks |
| MCP tools lack UI-grade operations (reorder, sections, bulk) | add `mesh_*`/`ui_*` tools in core first (they help agents too) |
| Watcher fights `mesh watch` | observer only, no lock, no reconcile (§7) |
| No desktop scheduled notifications | own reminder loop + tray + autostart (§6) |
| Deep links untestable in macOS dev | loopback OAuth by default (§9) |
| TS 7 has no API | Biome; TS6 alias fallback |
| Tailwind v4 vs older macOS | `minimumSystemVersion 13.3`, `build.target safari16.4` |
| Signing/notarization cost | Apple Developer Program ($99/yr) before the public beta; unsigned dev builds until then |
| Linux CI deps | separate desktop job with webkit2gtk-4.1 packages |

---

## Sources

- Tauri v3 alpha notes: https://newreleases.io/project/github/tauri-apps/tauri/release/tauri-v3.0.0-alpha.0 ; https://github.com/tauri-apps/tauri/releases ; milestone https://github.com/tauri-apps/tauri/milestone/5
- Capabilities: https://v2.tauri.app/security/capabilities/
- Calling Rust (threading, channels, state): https://v2.tauri.app/develop/calling-rust/
- Calling frontend (events): https://v2.tauri.app/develop/calling-frontend/
- Vite guide: https://v2.tauri.app/start/frontend/vite/
- Deep linking: https://v2.tauri.app/plugin/deep-linking/
- Single instance: https://v2.tauri.app/plugin/single-instance/
- Notification: https://v2.tauri.app/plugin/notification/ ; https://docs.rs/tauri-plugin-notification/latest/tauri_plugin_notification/enum.Schedule.html ; https://v2.tauri.app/reference/javascript/notification/
- Global shortcut: https://v2.tauri.app/plugin/global-shortcut/
- System tray: https://v2.tauri.app/learn/system-tray/
- Updater: https://v2.tauri.app/plugin/updater/
- macOS signing: https://v2.tauri.app/distribute/sign/macos/ ; bundle: https://v2.tauri.app/distribute/macos-application-bundle/
- Webview versions: https://v2.tauri.app/reference/webview-versions/
- OAuth plugin: https://docs.rs/crate/tauri-plugin-oauth/latest ; field notes https://github.com/Playmoir/knowledge-base/blob/main/tauri-desktop-oauth.md
- tauri-specta: https://github.com/specta-rs/tauri-specta/releases ; https://github.com/specta-rs/tauri-specta/issues
- shadcn Vite: https://ui.shadcn.com/docs/installation/vite ; components.json https://ui.shadcn.com/docs/components-json ; Tailwind v4 notes https://ui.shadcn.com/docs/tailwind-v4
- Tailwind Vite install: https://tailwindcss.com/docs/installation/using-vite ; compatibility https://tailwindcss.com/docs/compatibility ; Safari floor issue https://github.com/debpalash/OmniVoice-Studio/issues/1268
- TypeScript 7: https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
- Registry checks: `npm view <pkg> version|dist-tags|time`, `https://crates.io/api/v1/crates/<crate>` (2026-10-15)
- Repo: `mesh/Cargo.toml`, `mesh/rust-toolchain.toml`, `mesh/src/lib.rs`, `mesh/src/mcp/tools.rs:60,183-260`, `mesh/src/mcp/mod.rs:4,70-145,198`, `mesh/src/mcp/proto.rs:4`, `mesh/src/cli/watch.rs:1-30,90-115,170,237`, `mesh/src/domain/tasks.rs:242-591`, `mesh/src/storage/lock.rs`
