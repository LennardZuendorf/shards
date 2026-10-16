---
type: feature-tech
feature: desktop-app
sibling: product.md
parent: ../../tech.md
updated: 2026-10-16
---

# Feature: Desktop App — Architecture

Three new pieces over the synchronous core. **`crates/shards-host`** is a library whose
`Host::call(tool, args)` dispatches every `shards_*` tool through the existing MCP dispatcher
(`shards::mcp::tools::Server`) and adds 13 UI-only `host_*` tools (plus one alias) and a passive
vault watcher; its binary `shards-host` serves the same calls over axum on 127.0.0.1
(`POST /api/call/{tool}`, `GET /api/events` SSE) for browser mode, behind a Host/Origin/token
guard. **`apps/desktop/src-tauri`** (package `shards-desktop`) is a thin Tauri 2.12 shell exposing
one async command `shards_call` and forwarding watcher events as `vault://changed`.
**`apps/desktop/src`** is the React 19 app; it talks to whichever transport is present
(`isTauri()`), keeps server state in TanStack Query, and invalidates by space on change events.
A few additive core seams (raw delete, body replace, `notes::set_meta`, `write_new`) make this
possible; the 40-tool MCP table is untouched. This document describes the delivered code
(2026-10-16); § Designed, not built keeps the rest of the design.

**Parent:** [../../tech.md](../../tech.md)
**Requirements:** [product.md](product.md)
**Design:** [design.md](design.md)
**Plan:** [plan.md](plan.md)
**Research:** [research.md](research.md)

---

## Files

Delivered tree (2026-10-16). Planned files that do not exist yet are in § Designed, not built.

```
Cargo.toml                       # [workspace] members [".", "crates/shards-host", "apps/desktop/src-tauri"], default-members ["."]
src/domain/{tasks,notes,memories,scratch}.rs  # + delete_raw / forget_raw / clear_raw, set_body; notes::set_meta (additive)
src/storage/raw.rs               # + write_new (no-clobber atomic create)
src/cli/dashboard.rs             # snapshot() reused by host_dashboard
src/mcp/schema.rs                # shards_scratch_list description names the default scope
.github/workflows/ci.yml         # check (ubuntu+macOS), desktop (macOS), frontend, coverage, package
crates/shards-host/
  Cargo.toml                     # shards (path), axum 0.8.9, tokio 1.53, tokio-stream, futures-util, toml 0.9, notify
  src/lib.rs                     # Host, CallError, adopt_configured_identity, VaultChange, interesting(), watch()
  src/members.rs                 # [core].me + [[members]] reader, guess_kind()
  src/tools.rs                   # HOST_TOOLS (16) and every host_* tool
  src/bin/shards-host.rs         # flags, Host/Origin/client/token guard, token file, SSE, /api/health
  tests/host_tools.rs            # 25 tests: every host tool, restore sandbox, project_update, scratch scopes
  tests/identity.rs              # the host acts as [core].me
apps/desktop/                    # pnpm package: dev | build | lint | test (+ @tauri-apps/cli: pnpm tauri)
  vite.config.ts                 # /api proxy to $SHARDS_HOST_URL, adds x-shards-token from the token file
  src/main.tsx src/App.tsx src/index.css
  src/app/{AppShell,Sidebar,CommandPalette,QuickAdd,QuickAddForm,DetailPane,ShortcutsDialog,routes,…}.tsx
  src/lib/transport.ts           # call(), onVaultChanged(): invoke | fetch + EventSource
  src/lib/api/{tasks,notes,memories,scratch,host,util}.ts   # the only place tool args are named
  src/lib/{query,hooks,router,hotkeys,dates,recur,patch,priority,status,color,safe-url,errors,types}.ts
  src/lib/quickadd/{parse,suggest}.ts (+ tests)
  src/components/{ui,shared,task,agent,memory,scratch,note}/
  src/views/{tasks,agents,memories,scratch,notes,settings}/
  src-tauri/{Cargo.toml,build.rs,tauri.conf.json,capabilities/default.json,icons/,src/{main.rs,lib.rs}}
scripts/demo-vault.sh            # demo vault + config through the shards CLI (--force, --empty)
```

---

## Contract / API

### Core seams (delivered state)

| Seam | Delivered | Not built |
|---|---|---|
| S0 operator identity | `shards_host::adopt_configured_identity` reads `[core].me` from the config file and sets `$SHARDS_AGENT` once at process start (host `main`, Tauri `run`) | `[core].me` in the core `Config`, `Config::operator()`, `config set core.me`; with no `me` the host inherits the shell's `$SHARDS_AGENT` |
| S1 dispatch with a given config | — | `Server::call_with`; the host builds `Server::new(config, vault)` and every call reloads the config |
| S2 body replace | `{tasks,notes,memories}::set_body(cfg, target, body)`: under the entity lock, keep frontmatter, bump `updated` | `expected_body_sha256`, the `conflict` kind, scratch body replace, identical-body no-op |
| S3 remove returning content | `tasks::delete_raw`, `notes::delete_raw`, `memories::forget_raw`, `scratch::clear_raw` → `(id, path, content)` inside the entity lock | one generic `entity::remove_returning` |
| S4 restore | host-side `restore_target` + `storage::raw::write_new` (create only) | replace with `expected_sha256`, the `@<space>/` path form |
| S5 project meta | `notes::set_meta(cfg, target, &[(key, Option<Value>)])` (any non-core key; one locked atomic write); `host_project_update` validates `title`, `color`, `archived`, `sections`, `renames` | an `order` key (number) for sidebar order (R35) |
| S6 watch filter | — | shared `storage::watch`; the host keeps its own `interesting()` copy |
| S7 agent signalling | the app reads `needs-input`/`awaiting-input` and `error`/`agent-error`/`failed` labels (`src/lib/status.ts`) | the text in `mcp::instructions` and SKILL.md, and its `tests/bundle.rs` pin |

### Host library

```rust
// crates/shards-host/src/lib.rs
pub fn adopt_configured_identity(config: Option<&Path>) -> Option<String>; // sets $SHARDS_AGENT = [core].me
#[derive(Clone)] pub struct Host { /* Arc<Server>, config, vault */ }
#[derive(Serialize)] #[serde(tag = "kind", rename_all = "camelCase")]
pub enum CallError { Domain { message: String }, Unknown { message: String } } // message = envelope JSON text
impl Host {
    pub fn new(config: Option<PathBuf>, vault: Option<PathBuf>) -> Host;
    pub fn call(&self, tool: &str, args: &Json) -> Result<Json, CallError>;   // blocking; Ok = {value, list}
    pub fn config_path(&self) -> PathBuf;
    pub fn vault_root(&self) -> Option<PathBuf>;
    pub fn roots(&self) -> Vec<(String, PathBuf)>;                           // enabled spaces, deduplicated
}
#[derive(Serialize)] pub struct VaultChange { pub spaces: Vec<String>, pub paths: Vec<String> } // absolute paths
pub fn watch<F: Fn(VaultChange) + Send + 'static>(host: &Host, debounce: Duration, emit: F) -> notify::Result<Watcher>;
pub const HOST_TOOLS: [&str; 14];
```

### Transports

| Transport | Request | Success | Failure |
|---|---|---|---|
| Tauri | `invoke("shards_call", { tool, args })` | `{ value, list }` | rejects with `{ kind: "domain" \| "unknown", message }` |
| HTTP | `POST /api/call/{tool}`, body = args (no body = `{}`; a body needs `content-type: application/json`, else 415), headers `x-shards-client: 1`, `x-shards-token` | `200` `{ value, list }` | `422` `CallError`; `401` / `403` `{kind, message}` from the guard; `500` `{kind: "unknown"}` on a join error |
| Events (Tauri) | `listen("vault://changed")` | `VaultChange` | — |
| Events (HTTP) | `GET /api/events` with `x-shards-token` (added by the Vite proxy) | SSE `event: vault-changed`, `data: VaultChange`; axum default keep-alive; a lagging subscriber gets one all-spaces event | `401` / `403` |
| Health | `GET /api/health` (loopback `Host` only) | `200` text `ok` | `403` |

The frontend `CallError` parses the envelope out of `message`, so `kind` is the core kind
(`validation`, `not_found`, …) and `offline` is true for `kind: "network"` (fetch failed or the
proxy could not reach the host).

### Host tools (UI-only; never in any agent MCP `tools/list`)

Delivered exactly as root [tech.md](../../tech.md) § Host Tool Contract lists them (16 names: 15
tools plus the `host_memory_update_body` alias). `host_notes_browse` and `host_note_read` sit on
two core reads, `notes::browse(cfg) -> Vec<BrowseEntry>` and `notes::read_path(cfg, path) ->
Result<(BrowseEntry, String)>`, which reuse the notes walk; the read resolves only paths the walk
yields, so the walk is the sandbox. Arguments use `id` for tasks, notes and memories,
and `name, agent?` for scratch. `shards_*` tools keep their schema names: `shards_task_get` and
`shards_note_get` take `id`; `shards_memory_get`, `shards_note_update|append|claim|release` and
`shards_memory_update|append` take `target`; the other task verbs take `task_id`; scratch verbs
take `name` and an optional `agent`.

### `shards_*` tools the app uses

| Screen | Calls |
|---|---|
| Task views | `shards_task_list { status: "open,claimed", limit: 2000, … }`; project completed `{ status: "done,cancelled", project, since: "30d" }`; agents done `{ status: "done", since: "2d" }` |
| Detail | `shards_task_get { id }`; `shards_task_update { task_id, … }` (`""` clears a v2 field; `order` a number or `""`); `shards_task_append { task_id, text, … }`; `shards_task_block` / `shards_task_unblock`; `shards_task_new` for subtasks |
| Complete / reopen | `shards_task_finish { task_id, outcome? }` (`next_due` on recurring); reopen = `shards_task_update { task_id, status: "open" }` |
| Delegation | `shards_task_claim { task_id, claimer? }`; `shards_task_release { task_id, owner }` |
| Notes | `shards_note_list { limit: 500 }`, `shards_note_get { id }`, `shards_note_new`, `shards_note_update|append|claim|release { target }`, `shards_note_adopt { paths }` |
| Memories | `shards_memory_list { limit: 500 }`, `shards_memory_get { target }`, `shards_memory_new`, `shards_memory_update|append { target }`, `shards_memory_recall { query, limit: 30 }`, `shards_asset_*` |
| Scratch | `shards_scratch_list { all_agents: true }`, `shards_scratch_get { name, agent }`, `shards_scratch_set`, `shards_scratch_append` |
| Search, agents | `shards_search { query, limit: 50, … }`; `shards_recent_activity { limit: 50 \| 300, since? }`; `shards_session_start`; `shards_build_context`, `shards_graph`, `shards_project` |
| Projects | `host_projects`, `host_project_update` (feature-probed with `{}`); fallback derives projects from task `project` ids and `note_type: project` notes when the host lacks the tool |

The app does not send `expected_due` on finish yet, and it never retries a failed finish (it
retries only `offline` errors, twice).

---

## Implementation Detail (delivered)

### Host

1. **Identity.** `adopt_configured_identity` runs before any thread exists and sets
   `$SHARDS_AGENT` to `[core].me`. The binary logs `shards-host acting as <me> ([core].me)` or
   that it acts as the agent identity.
2. **Dispatch.** `Host::call` sends `host_*` to `tools::call` and everything else to
   `Server::call`; both return `(value, list)`, wrapped as `{value, list}`. Errors become
   `CallError::Domain { message: mcp::tool_error(&e) }`.
3. **Blocking.** Transports run `Host::call` on `spawn_blocking`
   (`tauri::async_runtime` / `tokio::task`). The core keeps no async runtime.
4. **No limit injection.** The app passes its own `limit` (task lists 2000, notes, memories and
   assets 500, search 50).

### Undo (delivered, client-side)

- Deletes (`host_task_delete`, `host_note_delete`, `host_memory_forget`, `host_scratch_clear`)
  return the raw bytes; the undo calls `host_restore { path, content }` (create only, so a path
  someone re-created since is refused with a `validation` error).
- Field edits keep the old values in the mutation and undo by sending them back through
  `shards_task_update` (`""` for fields that were unset, `src/lib/patch.ts`). A recurring finish
  undoes with `{ status: "open", due: <old>, deadline: <old> }`; a one-off finish undoes with
  reopen.
- One undo slot (`src/lib/query.ts`): the toast's Undo button or ⌘Z within 30 s; a used entry
  cannot run twice; every undo invalidates all queries. Undo is not hash-guarded: it overwrites
  any write made since.

### Watcher

- `shards_host::watch`: `notify-debouncer-full` at 150 ms, recursive, over every enabled space
  root (deduplicated). It calls `create_dir_all` on each root before watching (gap: breaks the
  lazy-folder invariant).
- Filter (`interesting`): create/modify/remove only, no directories, no dot component below the
  deepest matching root, so `.locks/` and `.shards/` never fire.
- One `VaultChange` per tick: absolute paths, deduplicated, each mapped to the space whose root
  prefixes it. Observer only: never takes the `shards watch` lock, never reconciles.
- Tauri restarts the watcher when `host_pick_vault` switches the vault and emits an all-spaces
  event.

### HTTP binary

```
shards-host [--port <PORT>] [--config <PATH>] [--vault <PATH>]
shards-host 127.0.0.1:<PORT>        # legacy form, port only
```

- Port: `--port` > `$SHARDS_HOST_PORT` > 7878. Always binds `127.0.0.1`; a non-loopback legacy
  address is refused at parse time.
- Config and vault: `--config` > `$SHARDS_CONFIG_PATH` > default; `--vault` > `$SHARDS_VAULT` >
  `[core].vault_path`.
- Token: written after the bind succeeds (a second host that failed to bind never replaces the
  running host's token), 0600, to `$SHARDS_HOST_TOKEN_FILE` or `~/.shards/run/host-<port>.token`.
- Guard order: `Host` → `Origin` → `x-shards-client` (calls) → `x-shards-token` (calls, events).
  Rules in root [tech.md](../../tech.md) § Security Model.
- No static file serving: browser mode is always Vite + proxy.

### Vite proxy (browser mode)

`vite.config.ts` proxies `/api` to `$SHARDS_HOST_URL` (default `http://127.0.0.1:7878`), reads the
token file for that port (or `$SHARDS_HOST_TOKEN_FILE`) on every request and sets
`x-shards-token`. For SSE it flushes headers at once and destroys the downstream stream when the
upstream closes, so the browser sees the host go away. Dev server port 5173, `strictPort`.
Override it with `pnpm -C apps/desktop dev --port N --strictPort`, with no `--`: pnpm passes
`-- --port N` through to `vite` as positional text, and Vite then binds 5173 anyway (seen
2026-10-16: `vite -- --port 5293 --strictPort` → `Local: http://localhost:5173/`).

### Tauri shell

- `tauri ~2.12`; plugins: `single-instance` (registered first; a second launch focuses `main`),
  `window-state`, `dialog`, `opener`. No `plugin-fs`, no global shortcut, no tray.
- Commands (capability grants `allow-shards-call` and `allow-shards-open`): `shards_call(tool, args)` (async + `spawn_blocking`; `SHARDS_DESKTOP_TRACE=1` logs one
  stderr line per call), `shards_open(path, with)` (R41: `with` = `obsidian` →
  `obsidian://open?path=<percent-encoded absolute path>`, `default` → `open_path`, `reveal` →
  `reveal_item_in_dir`, all through the opener plugin's Rust API after the path is canonicalised
  and checked against the host's space roots) and `host_pick_vault` (folder picker that switches
  the vault and saves it to `desktop.json` in the app config dir; registered, not granted by the
  capability, no UI).
- Startup: `$SHARDS_CONFIG_PATH`; vault = `$SHARDS_VAULT`, else the saved pick, else the config.
- Capability `capabilities/default.json` and CSP: root [tech.md](../../tech.md) § Security Model.
- `tauri.conf.json`: identifier `app.shards.desktop`; window `main` 1280×820, min 760×520,
  `titleBarStyle: "Overlay"`, `hiddenTitle`, traffic lights at (16, 20); devUrl
  `http://localhost:5173`; `beforeDevCommand: pnpm dev`; bundle target `app` only, unsigned,
  `minimumSystemVersion: "13.3"`.

### Frontend data layer

- **Transport** (`lib/transport.ts`): `call<T>(tool, args): Promise<T>` returns `value`.
  `onVaultChanged(cb, onState)`: Tauri `listen`; browser `EventSource('/api/events')` with a
  watchdog that probes `/api/health` every 10 s while the stream looks open, and reconnect backoff
  1, 2, 4, 8, 15 s; states `connecting | live | offline`.
- **Query client** (`lib/query.ts`): `staleTime` 30 s, `refetchOnWindowFocus: false`, retry only
  offline errors (max 2). Keys: `tasks`, `notes`, `memories`, `scratch`, `assets`, `search`,
  `activity`, `host/{status,members,projects,dashboard,caps}`.
- **Invalidation map** on `VaultChange` (coalesced): tasks → tasks, host projects, members,
  status, search, activity; notes → notes, host projects, status, search, activity; memories →
  memories, host members, status, search, activity; scratch → scratch, host members, status,
  activity; assets → assets, host status, search; an empty or unknown space list → everything; an
  SSE reconnect after the first open → everything.
- **Optimistic updates** for complete, reopen, priority, schedule, section/order moves:
  `patchTaskCaches` patches every cached list and detail; `onError` restores the snapshot.
- **Routing** (`lib/router.ts`): a hand-written hash router. Routes: `#/inbox`, `#/today` (default),
  `#/upcoming`, `#/project/:id`, `#/label/:name`, `#/search`, `#/agents/:id?`, `#/memories/:id?`,
  `#/scratch/:agent?/:name?`, `#/notes/:id?`, `#/settings`. Views are lazy chunks preloaded on
  sidebar hover.
- **Per-device prefs** in `localStorage` (theme, sidebar, layouts), every access in try/catch.
  Project sections live in the project note (`host_project_update`), not in browser storage.

### Keyboard (delivered, `lib/hotkeys.ts` registry; `?` lists every described shortcut)

| Group | Keys |
|---|---|
| General | `⌘K` command menu · `?` shortcuts · `⌘Z` undo last action · `[` toggle sidebar · `Esc` close detail |
| Navigation | `g i` Inbox · `g t` Today · `g u` Upcoming · `g a` Agents · `g m` Memories · `g s` Scratchpads · `g n` Notes · `g ,` Settings · `/` Search |
| Tasks | `q` quick add · `j`/`k` or arrows move · `Enter` open · `e`/`x` complete (reopen when done) · `1`–`4` priority · `t` today · `Shift+T` tomorrow · `r` rename · `⌘⌫`/`⌘Del` delete |
| Tasks (designed, R36) | `x` or `⌘`-click toggles selection · Shift-click range · `Shift+↓`/`Shift+↑` extend · `Esc` clears. Delivered `x` completes, against the root map; desktop-app/27 moves `x` to selection and keeps `e` for complete |
| Notes | `j`/`k` · `n` new · `f` filter · `e` edit · `a` append |
| Memories | `j`/`k` · `n` new · `f` filter · `r` recall playground · `e` edit body · `Shift+S` supersede · `⌘⌫` forget · `Esc` back |
| Scratchpads | `j`/`k` · `n` new · `e` edit · `v` raw / rendered · `a` leave a note for the agent · `Esc` back |

Plain keys never fire while typing; `mod+…` combos do. Sequences time out after 1 s.

---

## Designed, not built

Kept as the target design; each item is a row in [plan.md](plan.md) § Spec vs Implementation.

- **Undo tokens.** `Host::call_undoable` returns `Undo { tool, args, label }`; edits restore the
  exact pre-image through `host_restore { rel_path, content, id, expected_sha256 }` (replace when
  the current file hash matches, else `conflict`; a moved copy unlinked by `(dev, ino)` CAS);
  creates undo through the matching delete; `task_block`/`unblock` undo through the edges the call
  changed; calls that write `blocks`/`blocked_by` mirrors return no undo. Undo stack of 50.
- **Body preconditions.** `host_{task,note,memory,scratch}_update_body { …, body,
  expected_body_sha256? }`; mismatch → `conflict` (exit 4, 409) naming `updated` and holder;
  identical body → no write. Editors autosave and show Reload / Overwrite on conflict.
- **Operator dispatch.** `Server::call_with(&cfg.with_agent(operator), …)` with a cached
  `Arc<Config>` reloaded on config events; `$SHARDS_AGENT` ignored by construction.
- **More host tools.** `host_config_set { key: core.me | core.vault_path, value }`,
  `host_memory_list { …, all_scopes }`, `host_memory_recall_as { agent, … }`.
- **HTTP.** Kind → status map (root [tech-core.md](../../tech-core.md) § Error kind registry),
  `Retry-After` on `lock_conflict`, `--static DIR`, `{ok, version, vault}` health, a `catch_unwind`
  panic guard.
- **Events.** Vault-relative paths, `seq`, `config: true` on a config file change, watching the
  nearest existing ancestor instead of creating space folders.
- **Shell.** `global-shortcut` (`CmdOrCtrl+Shift+Space` quick add), a `quickadd` window and its
  capability, `dmg` bundle (app-polish).
- **Frontend.** Hash-guarded editors, change flash on external edits, ≥ 60-phrase quick-add corpus
  with a 95 % gate, token disable and `\` escape in quick add, list virtualisation for 5k rows.
- **Delete to the OS Trash (R25, D6 amended 2026-10-16).** `host_task_delete`, `host_note_delete`,
  `host_memory_forget` and `host_scratch_clear` read the raw bytes under the entity lock as today,
  then move the file to the platform Trash with the `trash` crate (host only; the core and CLI
  keep the hard unlink). macOS uses the Finder method so the item is restorable from the Trash.
  A failed move returns a `validation` error naming the path and leaves the file in place; there
  is no unlink fallback. The response keeps `{id, path, content}`, so in-session undo still goes
  through `host_restore` (create-only). `crates/shards-host/tests/host_tools.rs` asserts the file
  left the vault and that a forced trash failure leaves it in place.
- **Completed log (R34).** One query `shards_task_list { status: "done", since: "30d", limit:
  2000 }` plus the loaded active set filtered client-side on `completed` (recurring tasks stay
  `open`); grouped by local day. Reopen sends `shards_task_update { status: "open" }`.
- **Archived projects (R35).** The active-set projections for Today, Upcoming, Waiting on me and
  labels drop tasks whose `project` is archived (`host_projects` already returns `archived`).
- **Bulk actions (R36).** A selection set in the list store; each action maps to N single-entity
  calls through `lib/api/*` with bounded concurrency (4); the undo entry holds N inverse calls
  and reverses only the calls that succeeded.
- **Waiting on me (R39).** A pure `waitingOnMe(activeSet, operator)` in `src/lib/status.ts`
  that applies the R16 rule directly, not the delivered `sessionState` (which also returns
  `awaiting` for a claimed task blocked by another agent): a `needs-input` or `agent-error`
  label, or an open blocker assigned to a human member, plus any open task with an open blocker
  assigned to the operator. Wait start = the newest body stamp whose author is not the operator,
  else `updated`. Unit-tested.
- **Reminders (R40).** `tauri-plugin-notification` (minor pinned with the other Tauri plugins) with its permission in
  `capabilities/default.json`; browser mode uses the Web Notification API. A 30 s scheduler over
  the active set fires for open tasks whose `due` has a time in `(last tick, now]`, keyed by
  `id + due` so a reminder fires once per occurrence. No firing for times before launch.
- **Locale (R38).** `Intl.Locale(...).weekInfo` (fallback Monday) and `Intl.DateTimeFormat`
  `hourCycle` for defaults; overrides in per-device prefs; date-fns `weekStartsOn` and the
  chrono-node locale (`en` month-first, `en-GB` day-first) follow them.
- **Accessibility (R37).** `@axe-core/playwright` is not used (browser tests use the villain-layer
  browser); instead `vitest-axe` renders every view against fixture data in the `frontend` CI job
  and fails on serious or critical violations.

## Implementation Detail (pure helpers)

### Session state and activity (pure, unit-tested)

- Delivered `sessionState(task)` (`src/lib/status.ts`) → `done | error | awaiting | working | idle`,
  first match:
  1. status `done` or `cancelled` → `done`
  2. a label in `error`, `agent-error`, `failed` → `error`
  3. a label in `needs-input`, `awaiting-input` → `awaiting`
  4. status `claimed`: an unready `blocked_by` → `awaiting`, else `working`
  5. otherwise `idle`
- The Agents board (`components/agent/agent-utils.ts`, `buildBoard`) also counts an open task as
  awaiting a human when an open blocker is owned or claimed by a human (`isAwaitingHuman`).
- Not built: the `queued` state, the member-kind checks in the rule, and the S7 agent text.
- Comments: the detail pane appends with `shards_task_append { task_id, text, section:
  "Comments", timestamp: true }` and parses stamped entries back out of the body
  (`components/task/model.ts`, `parseComments`).

### Manual order

`order` is a float (`components/task/model.ts`). Sort: `order` ascending (unset last), then
`created`. A drop between neighbours with a usable gap writes one midpoint; a missing neighbour
extends by `ORDER_STEP` (1024). When a gap falls to `MIN_GAP` (1e-6) or a neighbour has no
`order`, `planReorder` renumbers the group 1024, 2048, … and writes only the rows whose value
changes, one single-entity update each.

### Quick-add parser (`lib/quickadd`)

Delivered (`parse.ts`, 51 cases in `parse.test.ts`; autocomplete in `suggest.ts`):
`parseQuickAdd(input, { now?, known? }) -> ParsedTask` with `ParsedTask = { title, project,
section, labels[], priority, due, recur, recur_from, deadline, owner, tokens: Token[] }` and
`Token = { kind, start, end, text, value }`. `known` lists project titles, section names,
labels and member names per sigil. Passes run in this order; each consumed span is masked with
spaces so indices stay valid:

1. **Braces** `{…}` → chrono (`forwardDate`) → `deadline` (date only).
2. **Recurrence** `every` / `every!` (first match): `day|week|month|year`, `N days|weeks|…`,
   `other week|…`, `weekday|workday`, `weekend`, day lists (`mon, wed and fri`), `15th` /
   `1st of the month`, `month on the 15th`. `every!` → `recur_from: "completion"`, else `"due"`.
3. **Sigils** at a token boundary, in order `#` project, `/` section, `@` label, `+` owner: a
   quoted name (`#"Q4 Planning"`), else the longest known name followed by a boundary, else one
   word (`\p{L}[\p{L}\p{N}_.-]*`). The value is the known spelling when one matched. An unknown
   name is still consumed; the form resolves it (`No project "…"` warning, unknown owner left
   unset).
4. **Priority** `p1`–`p4` (case-insensitive, standalone) → `urgent | high | normal | low`.
5. **Date**: chrono on the rest, first result whose day, weekday or hour is certain (a bare
   month name is ignored). A time → `YYYY-MM-DDTHH:MM`, else `YYYY-MM-DD`. With a recurrence and
   no certain day, the rule picks the day and chrono the time ("every mon at 9am"). With a
   recurrence and no date, `due` = the rule's first occurrence from today.
6. **Title** = the remaining text, whitespace collapsed.

The form shows the highlighted segments and a chip per field; context defaults (current project,
section, Today) fill only fields the input left unset. Not built: `warnings[]`, token disable,
`\` escape.

### Demo vault

`scripts/demo-vault.sh [--force] [--empty] [DIR]` (default `/tmp/shards-demo`) needs a built
`shards` (`target/debug` or `target/release`, or `$SHARDS_BIN`) and refuses a folder it did not
make. It runs `shards init` (owner `lennard`, collections `lennard, maya, claude-code,
flights-agent, ops-agent`, builtin search), appends `me = "lennard"` and five `[[members]]` rows,
then drives the CLI with per-actor `SHARDS_AGENT` so every file is canonical: projects, sections,
tasks relative to today (overdue, today, upcoming, recurring, deadlines, subtasks, blockers,
agent claims, done), memories, scratch pads for `claude-code`, `flights-agent` and `ops-agent`,
and notes. `--empty` stops after the config (the first-run onboarding state). It unsets
`SHARDS_*` and `MESH_*` identity variables first and prints the host and Vite commands.

---

## Performance Budget

Aligned with root [tech.md](../../tech.md) § Performance Budgets (5k-task fixture: 5,000 tasks,
60% done, 2,000 notes, from a scaled demo vault; `scripts/demo-vault.sh --scale` is not built).

| Path | Budget | Measured by |
|---|---|---|
| `Host::call` active-set `shards_task_list` | p95 ≤ 50 ms | release-mode timing test in `crates/shards-host/tests/`, 50 runs |
| `Host::call` `shards_task_get` / single-entity write | p95 ≤ 10 ms / ≤ 25 ms | same |
| External write → row updated | p95 ≤ 500 ms (150 ms debounce + FSEvents + refetch) | 50 CLI writes, event-to-render timestamps logged in browser mode |
| Launch → Today interactive | ≤ 1.5 s | release build, M-series Mac |
| 5k-row list | first render ≤ 100 ms after data; ≤ 80 rows mounted; filter change ≤ 50 ms | React Profiler in browser mode |
| Quick-add parse | < 2 ms per keystroke | vitest bench |
| Initial JS | ≤ 400 KB gzip; Markdown editor lazy-loaded | `pnpm -C apps/desktop build` report |
| Idle | < 1% CPU with the watcher running | Activity Monitor, 5 min |
| `shards` CLI cold start | unchanged; `shards` links no tokio, axum or tauri | `cargo test -p shards`; the CI guard on `cargo tree -p shards -e normal` |

---

## Testing

**Delivered (2026-10-16):**

- **Core** (`cargo test -p shards`, 1502 passed): the raw delete / set_body / set_meta seams are
  covered through the host suite; `set_meta` key preservation has a core test.
- **Host** (`cargo test -p shards-host`, 36 passed): `tests/host_tools.rs` (25) covers the
  `{value, list}` wrap, every delete returning exact bytes and restoring, restore refusing
  overwrite, escapes, symlinks and non-delete shapes, body replace, status/members/projects/
  dashboard shapes, `host_project_update` (probe, frontmatter writes, section order, renames,
  validate-before-write), the scratch list scopes, a missing config as a per-call error, and that
  agent MCP never dispatches a host tool; `tests/identity.rs` (1) the host acts as `[core].me`;
  binary unit tests (7) the arg parser, loopback Host/Origin rules, constant-time token compare,
  the guard matrix (401/403), the lagging-subscriber event and the 0600 symlink-safe token file;
  lib unit tests (3) members parsing and the kind heuristic.
- **Frontend** (`pnpm -C apps/desktop test`, 14 files, 148 tests): quick-add parse (51) and
  suggest, dates, color, task model (ordering, tree, comments), patch/undo inverses, project
  actions, onboarding, agent/memory/scratch helpers, wikilinks, safe Markdown, render reset.
- **CI** (`.github/workflows/ci.yml`): `check` (ubuntu + macOS: fmt, clippy and test on the
  workspace minus `shards-desktop`, core dependency guard), `desktop` (macOS: frontend build, then
  clippy and test `shards-desktop`), `frontend` (lint, test, build), `coverage` (core, 80 %
  floor), `package` (release `shards` + `shards-host`, CLI and MCP smoke, host smoke: health,
  401 without token, 200 with it). Not yet run on GitHub.
- **Manual browser verification**: `scripts/demo-vault.sh`, `shards-host` and Vite on distinct
  ports, driven with the villain-layer browser tools.
- **Native smoke**: `pnpm -C apps/desktop tauri build --debug --bundles app`, then an 8 s launch
  with `SHARDS_DESKTOP_TRACE=1` showing `shards_call` lines and a re-run after an external CLI
  edit.

**Target, not built:** parity of every `shards_*` tool through `Host::call` vs
`Server::call_with`; undo round trips per tool family; watcher tests (one event per external
write, none for `.locks/`, no folder creation, `config: true`); kind → status map; SSE frame
delivery; release-mode timing budgets; a ≥ 60-phrase quick-add corpus with a 95 % gate; a
`session()` table that includes member kinds.

---

## Risks

| Risk | Mitigation |
|---|---|
| O(n²) readiness on `ready`/`blocked` lists at 5k tasks | The app never requests those filters; detail uses one `task_get`. The index-once fix sits in the core's task paths (task-model-v2/5) |
| `cargo add tauri` pulls the 3.0 alpha | `~2.12` pin; plugins pinned `2.x`; JS `@tauri-apps/api ~2.12.4` |
| Dropped FSEvents on iCloud or Dropbox vaults | SSE reconnect invalidates everything. Gap: `refetchOnWindowFocus` is off |
| Human and agent edit the same body | Gap: no precondition yet, last write wins (`expected_body_sha256` designed) |
| Undo overwrites a write made since | Gap: undo is not hash-guarded; delete undo is create-only, so it cannot clobber |
| `[workspace]` makes a bare `cargo test` build the desktop crate | `default-members = ["."]`; CI excludes `shards-desktop` from `check` and runs it in `desktop` |
| No agent sets `needs-input` or `agent-error`, so Awaiting input and Error rarely show | S7 text not built; the app also reads `awaiting-input`, `error`, `failed` |
| Other local processes reach the host | Loopback only, per-launch 0600 token, `Host`, `Origin` and client-header checks. Gap: any loopback `http` origin passes the `Origin` check, so a page on another localhost port could use the Vite proxy (which adds the token) |
| task-model-v2 argument names drift | `lib/api/*` is the single place that names arguments |
| Windows (POSIX locks) | Unsupported in this feature |

---

## Open Questions

1. **Body precondition.** Root DECISIONS named `host_memory_update_body`; the code ships
   `host_*_set_body` with the old name as an alias and no precondition. Recommendation: add
   `expected_body_sha256` (not `expected_updated`, because Markdown editors change bodies without
   bumping `updated`) before the app is used on a vault agents write to.
2. **Origin allowlist.** The spec asked for the host's own origin plus the Vite dev origin; the
   code accepts any loopback `http` origin so parallel worktrees can each run Vite on their own
   port. Options: pass the allowed Vite origin to the host (`--allow-origin`), or keep it and rely
   on the token. Owner decision.
