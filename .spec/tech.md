---
type: entrypoint
scope: technical
children:
  - tech-core.md
  - tech-surfaces.md
  - features/shards-rebrand/tech.md
  - features/task-model-v2/tech.md
  - features/desktop-app/tech.md
  - features/sync/tech.md
  - features/remote-mcp/tech.md
updated: 2026-10-31
---

# Shards — Technical Architecture

One synchronous Rust core over one Markdown folder, reached through three surfaces: the `shards`
CLI, the `shards-mcp` stdio server, and a desktop app that calls the same dispatcher through
`shards-host`. Markdown on disk stays the only source of truth; every long-running process is
optional. A reserved `shards-server` adds sync, remote MCP and OAuth later. Delivered contracts:
[tech-core.md](tech-core.md), [tech-surfaces.md](tech-surfaces.md).

## Design Philosophy

1. **One dispatcher, three transports.** CLI, agent MCP and the app run the same domain calls
   through `mcp::tools::Server::call`; a UI bug is an agent bug and the reverse (research: tauri §4.1).
2. **The folder is the database.** Indexes, sync state and caches are rebuildable dot-paths.
3. **Sync core, async edges.** No async runtime in core; outer crates use `spawn_blocking`.
4. **Local trust, server enforcement.** Locally any process may act as anyone; on the server the
   actor comes from the token and nothing else (research: mcp-oauth §7).
5. **Optional processes.** The CLI never needs the app, the host, the watcher or sync.

## Local agent harness

The [persistent surface contract](tech-surfaces.md#local-agent-harness) owns the
Codex/Claude Code adapters. The synchronous Rust `shards-harness` binary reuses
core configuration, canonical task readers and the existing MCP dispatcher. Shared
skills define the lifecycle contract. TypeScript builds target-specific plugin
packages using the existing Node development toolchain; installed hooks require
neither Node nor Python. Explicit project enrollment pins
configuration; guards reject disagreement with MCP's inherited effective context.
Derived receipts live outside the vault and verify actual task state, exclusive
participating-session bindings, checkpoints and binding retirement. They add no core
schema, verb or daemon and never authenticate local actors or bypass native approvals.

Separate host artifacts preserve package identity and exact tested parser contracts.
Native source and package checks pass. Historical host hook primitives, native
packaged MCP reads and a native Codex parser preview are observed; candidate host
hook execution, trust and activation remain
pending. Operator instructions and evidence limits are in [README](../README.md#local-agent-harness-source-verified).
The [verification record](../docs/research/local-agent-harness/2026-10-31-native-agent-harness-verification.md)
separates native source checks from observed client behavior. Source closure does not
approve installation, trust or enrollment; [plan.md](plan.md#local-harness-activation-follow-up)
retains those checks.

Built places (+code:): [native entrypoint](../src/bin/shards-harness.rs),
[policy and core reader](../src/bin/harness/runtime.rs),
[configuration coherence](../src/bin/harness/reader.rs),
[receipt state](../src/bin/harness/state.rs), [private storage](../src/bin/harness/store.rs),
[host adapters](../src/bin/harness/hosts.rs), [strict JSON and hashes](../src/bin/harness/json.rs),
[TypeScript packager](../scripts/package-agent-plugin.ts) and
[shared skills](../plugins/shards/skills/using-shards/SKILL.md).

## Architecture Overview

```
               humans                         agents (Claude Code, Cowork, scripts)
                 │                                  │                     │
     ┌───────────▼───────────┐                      │ stdio JSON-RPC      │ argv / --json
     │ apps/desktop (Tauri)  │               ┌──────▼──────┐       ┌──────▼──────┐
     │ React UI ─ invoke ────┼─┐             │ shards-mcp  │       │ shards CLI  │
     └───────────────────────┘ │             └──────┬──────┘       └──────┬──────┘
     browser dev: fetch/SSE    │                    │                     │
            │                  ▼                    │                     │
     ┌──────▼──────────────────────────┐            │                     │
     │ crates/shards-host              │            │                     │
     │ Host::call(tool,args)           │            │                     │
     │  shards_* ──────────────────────┼──┐         │                     │
     │  host_*  (UI-only)              │  │         │                     │
     │ watcher → {spaces,paths} events │  ▼         ▼                     ▼
     │ bin: axum 127.0.0.1 /api, SSE   │ ┌───────────────────────────────────────────┐
     └─────────────────────────────────┘ │ shards (root crate, sync): config, spaces,│
                                         │ domain, model, fm, storage, search, mcp   │
     ┌─────────────────────────────────┐ └──────────────────────┬────────────────────┘
     │ crates/shards-server (RESERVED) │  same core per          │ atomic write, O_EXCL locks
     │ sync API · remote MCP (rmcp) ·  │  workspace replica      ▼
     │ OAuth 2.1 AS · Postgres/SQLite  │◄──── record sync ── vault/  notes/ tasks/ memories/
     └─────────────────────────────────┘   (designed, later)        scratch/ assets/ .shards/
```

Workspace members: `.`, `crates/shards-host`, `apps/desktop/src-tauri`; the root package does not
move (research: codebase §5, tauri §3). `crates/shards-server` joins when feature 18 starts.

## Tech Stack

| Layer | Choice (pinned major/minor) |
|---|---|
| Core | Rust 1.94.1 toolchain, edition 2021, sync, no MCP SDK → [tech-core.md](tech-core.md) § Stack |
| Host | `axum` 0.8.9, `tokio` 1.53, `tokio-stream` 0.1, `futures-util` 0.3, `toml` 0.9 (reads `[core].me` / `[[members]]`), `notify` 8 + `notify-debouncer-full` 0.6 (shared with core) |
| Desktop shell | `tauri` 2.12.4 / `tauri-build` 2.7.3 / `@tauri-apps/api` 2.12.4 / CLI 2.12.3. **Never v3** (alpha, MSRV 1.95, edition 2024). Plugins delivered: single-instance 2.5, window-state 2.5, dialog 2.8, opener 2.7. Planned (app-polish): global-shortcut, notification, deep-link, store, updater, autostart, log. No `plugin-fs` (research: tauri §1, §2, §6) |
| Frontend | React 19.3, Vite 8.3, TypeScript 7.0, Tailwind 4.3 (`@tailwindcss/vite`), shadcn CLI 4.21 + `radix-ui` 1.8, TanStack Query 5.104, dnd-kit core 6.3 / sortable 10, cmdk 1.1, chrono-node 2.10, date-fns 4.4, sonner 2.0, lucide-react 1.57, react-markdown 10 + remark-gfm 4, react-day-picker 10, `@fontsource-variable/geist`; routing is a hand-written hash router (`src/lib/router.ts`), UI state small `useSyncExternalStore` stores; no TanStack Router, zustand or TanStack Virtual; lint oxlint; tests vitest 5; pnpm |
| Build targets | macOS ≥ 13.3, Vite `build.target: safari16.4` (Tailwind 4 floor); Linux best-effort; Windows blocked on core POSIX shims |
| Server (reserved) | `rmcp` 3.5.1 (Streamable HTTP), `axum`, `sqlx` (Postgres hosted / SQLite self-host), `object_store`, `diffy`, `jsonwebtoken` 11; desktop tokens in OS keychain via `keyring` 4.2 (research: sync §6, mcp-oauth §5) |

Recurrence (task model v2) is a hand-rolled RRULE-subset evaluator in core; the `rrule` crate is
rejected because it pulls `chrono-tz` into the CLI binary.

## Invariants

The eleven core invariants are detailed in [tech-core.md](tech-core.md) § Invariants. Status
after the Shards pivot ([product.md](product.md) § Non-goals, principle reversals 1–8):

| # | Invariant | Status |
|---|---|---|
| 1 | No daemon | **Amended.** Holds for CLI and core. The app, `shards-host` and `shards sync --watch` run long by choice; no command depends on them |
| 2–6, 8, 9, 11 | Spaces, derived state, canonical frontmatter, one walk, atomic single-entity writes, no panics, inert content, minted-name ownership | **Hold.** Recurring finish rewrites only the task's own file. Remote sync applies changes through the same lock + rename. The CLI `main` catches panics; the host has no `catch_unwind` yet (a panic in a blocking call surfaces as HTTP 500 `unknown`) |
| 7 | Identity is a spelling check | **Amended.** Still true locally; `shards-server` enforces identity from the token |
| 10 | Sync/versioning is the vault owner's job | **Amended.** Shards owns record sync (never git sync). Core and CLI delete stay a hard unlink. The host's delete tools move the file to the OS Trash (D6 amended 2026-10-16; designed, desktop-app/31); undo is app-level via `host_restore`; `.shards/trash/` waits for sync tombstones |
| + | No async runtime, no MCP SDK | **Scoped** to the root crate. Host, app and server use tokio; the server uses `rmcp`; stdio MCP stays hand-rolled |
| + | **New:** UI-only tools stay UI-only | `host_*` never appear in any agent MCP `tools/list`, local or remote |

## Data Contracts

**Task model v2** (frontmatter, all optional, unknown keys still round-trip; feature 15):

| Field | Format |
|---|---|
| `status` | `open` \| `claimed` \| `done` \| `cancelled` (unchanged) |
| `priority` | `urgent` \| `high` \| `normal` \| `low`; default `normal`; Todoist P1–P4 map in that order |
| `due` | `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM` (floating local time) |
| `deadline` | `YYYY-MM-DD` |
| `recur` / `recur_from` | RRULE subset: `FREQ` DAILY/WEEKLY/MONTHLY/YEARLY, `INTERVAL` (1..1000), `BYDAY` (weekly), `BYMONTHDAY` incl. negative (monthly, or yearly with `BYMONTH`), `BYMONTH` (yearly); stored in canonical spelling / `due` (default) \| `completion` |
| `parent`, `section`, `order` | task id; free string; float rank (UI writes midpoints) |
| `completed` | RFC 3339 `…Z`, set on finish, cleared on reopen |
| `tags`, `project`, `owner`, `claimed_by`, `blocks`, `blocked_by` | unchanged |

Recurring finish: advance `due` (and `deadline` by the same delta), keep `status: open`, release
any claim, set `completed`, append nothing, report `next_due`. A day the rule does not name that
clamps (31 → 30 April, Feb 29 → 28) rewrites `recur` with the day pinned, so the series never
drifts. `expected_due` (optional) makes a retried recurring finish a no-op with a warning.
`warnings` appear only when there is something to say: an unparsable stored `recur` (the task is
closed instead), a failed `expected_due` precondition, or outcome text on a recurring finish (not
recorded). Reopen = update `status: open`. Memory, scratch, note and asset
models are unchanged (→ [tech-core.md](tech-core.md) § Entity fields).

**Identity config.** `[[members]]` = `id`, `kind` (`human`\|`agent`), `name`, optional `color`;
`[tasks].collections` stays the validation list. `[core].me` names the human operator. Delivered:
only `shards-host` reads `[core].me` and `[[members]]` (`crates/shards-host/src/members.rs`); the
core `Config` ignores both, so the CLI/MCP actor is `--owner` > `$SHARDS_AGENT` > `$MESH_AGENT`
(0.3.x only) > `[core].agent`. Planned (task-model-v2/8): the core reads both and `[core].me` joins
that chain before `[core].agent`; [product-cli.md](product-cli.md) § Configuration and identity
precedence owns the rule. `shards-host` sets `$SHARDS_AGENT = [core].me` at start (§ Host Tool
Contract); with no `me` it inherits the shell's `$SHARDS_AGENT` (gap: the spec says it ignores it).

**Vault-internal state.** `.shards/` at the vault root, skipped by the walk: `sync/` (SQLite:
bases, HLCs, cursor), `conflicts/`, later `trash/`.

## Host Tool Contract

Delivered contract (code: `crates/shards-host/src/{lib,tools}.rs`, `bin/shards-host.rs`; tests:
`crates/shards-host/tests/host_tools.rs`). Planned parts that are not built are listed at the end
of this section and in [plan.md](plan.md) § Spec vs Implementation.

`Host::call(tool, args) -> Result<Json, CallError>` (blocking; transports run it on a blocking
thread). Success is `{value, list}` on both transports: `value` is the core's raw result (an
object, or a bare array for list tools) and `list` says which. `shards_*` names go to
`mcp::tools::Server::call` unchanged (40 tools; v2 adds parameters, not tools). `host_*` names go
to the UI-only table. Failure is `CallError`, serialised as `{kind: "domain", message}`, where
`message` is the core's JSON error envelope as a string (`kind`, `message`, `next_action`,
structured fields), or `{kind: "unknown", message}` for a host fault. Tauri: command
`shards_call(tool, args)` (async + `spawn_blocking`). HTTP: `POST /api/call/{tool}`, body = args.

`HOST_TOOLS` has 16 names: 15 tools plus one alias. Every tool is UI-only (pinned by
`agent_mcp_never_dispatches_a_host_tool`).

| Tool | Args → returns |
|---|---|
| `host_status` | `{}` → `{vault, config_path, me, version, spaces: {name: root\|null}, counts: {notes, tasks, memories, scratch, assets}, obsidian_vault}`. `obsidian_vault` = the nearest folder at or above the vault that holds a `.obsidian/` folder, else `null` |
| `host_notes_browse` | `{}` → list of `{path, abs_path, folder, title, id, tags, modified}` for **every** Markdown file in the notes space (the one walk: nested space roots, dot components, > 4 MiB and non-UTF-8 files skipped; the browser also skips `node_modules` folders), Shards notes and foreign files alike, newest `modified` first. `title` = frontmatter `title`, else the file stem; `id` = the Shards id or `null`; `folder` = notes-relative parent (`""` at the root); `modified` = RFC 3339 mtime |
| `host_note_read` | `{path}` (as `host_notes_browse` returns it) → the browse row plus `body` (frontmatter stripped). Only a file `host_notes_browse` would list resolves; anything else is `not_found`. Read-only |
| `host_members` | `{}` → list of `{id, kind: human\|agent, name, color}`: `[[members]]` rows, then `me`, `[tasks].collections`, then every owner, claimer, memory author and scratch agent on disk (kind heuristic for undeclared ids) |
| `host_projects` | `{}` → list of `{id, title, slug, color, sections, stored_sections, open_count, archived}`. Project notes first (by `order`, then title), then project ids only tasks reference. `sections` = the note's stored `sections:` order, then sections only tasks use; `stored_sections` = the stored part alone, so the app can pin a column order before writing |
| `host_project_update` | `{id, title?, color?, archived?, sections?, renames?}` → the `host_projects` row plus `renamed_tasks: [ids]`. `color` = `red orange yellow green teal sky blue violet pink gray` (+ `purple`, `grey`) or `#rgb`/`#rrggbb`/`#rrggbbaa`, stored lowercase, `""` removes; `archived: false` removes the key; `sections` trimmed, de-duplicated, no control characters, ≤ 120 chars, `[]` removes the key; `renames` `{old: new}` (`""` removes) rewrites `section` on every task of the project, done ones included, one atomic write per task, then one frontmatter write (`notes::set_meta`). Everything is validated before the first write. No `id` → validation error (the UI's feature probe) |
| `host_dashboard` | `{}` → `{agents, tasks: {ready, blocked, claimed}, activity, health}` from the dashboard `DashFrame` |
| `host_task_delete`, `host_note_delete`, `host_memory_forget` | `{id}` → `{id, path, content}` (raw bytes read inside the entity lock that unlinks). Designed (desktop-app/31): move to the OS Trash instead of unlinking; a failed move refuses the delete |
| `host_scratch_clear` | `{name, agent?}` (agent defaults to the acting identity) → `{id, path, content, agent}` |
| `host_restore` | `{path, content}` → `{path}`. Create only, never overwrite. `path` must resolve inside an enabled space root, without `..`, no dot component, `.md`, and in a shape a delete returns (task `open\|done/<t-id>.md` with matching frontmatter id; `m-` memory; `n-` note; `<agent>/<name>.md` scratch; never an asset) |
| `host_task_set_body`, `host_note_set_body`, `host_memory_set_body` | `{id, body}` → `{id, updated}`. Replaces the body, keeps frontmatter, bumps `updated`. `host_memory_update_body` is an alias of `host_memory_set_body` (the DECISIONS spelling) |

`path` is vault-relative, or absolute when the space root sits outside the vault.

**Envelope** = core envelope ([tech-core.md](tech-core.md) § Error kind registry). An unknown
tool is `validation`. Over HTTP every `CallError` is status 422; the guard answers 401
`unauthorized` and 403 `forbidden` with `{kind, message}`.

**Events.** One watcher (`shards_host::watch`, 150 ms debounce, observer only: no lock, no
reconcile) emits `{spaces: [..], paths: [..]}` with **absolute** paths. It skips non
create/modify/remove events, directories and any dot component below a root. Tauri: event
`vault://changed`. HTTP: SSE `event: vault-changed` on `GET /api/events`; a subscriber that lags
gets one event naming every space.

**Acting identity.** `adopt_configured_identity` sets `$SHARDS_AGENT` to `[core].me` at process
start, before any thread exists, so the core acts as the human. `[core].me` and `[[members]]` are
read by the host only (`crates/shards-host/src/members.rs`); the core `Config` ignores them. With
no `[core].me` the host acts as whatever `$SHARDS_AGENT` / `[core].agent` names.

**Planned, not built** (design in [features/desktop-app/tech.md](features/desktop-app/tech.md)
§ Designed, not built): `call_undoable` undo tokens, body-hash preconditions
(`expected_body_sha256`) and the `conflict` kind, restore-as-replace, kind → HTTP status map,
`host_config_set`, `host_memory_list`, `host_memory_recall_as`, scratch body replace,
`Server::call_with` / `Config::operator()`, vault-relative event paths with `seq` and `config`.

## Security Model

| Boundary | Rule |
|---|---|
| Local (CLI, stdio MCP, app) | Same-user trust. Identity is a spelling convention; `private` memory is a courtesy filter |
| Tauri webview | No filesystem plugin; vault I/O only through `shards_call`. One capability (`apps/desktop/src-tauri/capabilities/default.json`, window `main`) grants exactly `allow-shards-call`, `core:event:allow-listen`/`allow-unlisten`, `core:window:allow-start-dragging`/`allow-internal-toggle-maximize`, `opener:allow-open-url`, `opener:allow-default-urls`, `allow-shards-open`; `host_pick_vault` is registered but not granted. `shards_open {path, with: obsidian|default|reveal}` opens a file outside the app from Rust: the path must canonicalise to a regular file inside an enabled space root of the current vault, so the webview gets no general `opener:allow-open-path` scope. Production CSP `default-src 'self'; script-src 'self'`, `connect-src 'self' ipc: http://ipc.localhost`, `img-src` adds `data: blob: asset: https:`, `object-src`/`frame-src 'none'`, `form-action 'none'`; `dangerousDisableAssetCspModification: ["style-src"]` (gap: owner review). Markdown via react-markdown without raw HTML; links open outside the app, remote images load on click (`safe-markdown.tsx`). No `quickadd` window yet |
| `shards-host` HTTP (dev/browser) | Binds 127.0.0.1 only (`--port`, `$SHARDS_HOST_PORT`, default 7878). Every route: `Host` must be `localhost`, `127.0.0.1` or `[::1]` with an optional port (DNS-rebinding guard), else 403. An `Origin`, when present, must be `http://` + a loopback host on **any** port (each worktree's Vite has its own port); `null`, `https:` and `tauri://localhost` are refused (403). `/api/call` needs `x-shards-client: 1` (forces a CORS preflight the server never answers), else 403. `/api/call` and `/api/events` need `x-shards-token` (constant-time compare), else 401. The token is 32 random bytes hex, new per launch, written 0600 to `$SHARDS_HOST_TOKEN_FILE` or `~/.shards/run/host-<port>.token` (stale file or symlink unlinked, then exclusive create) after the port is bound. The Vite dev proxy reads the file on every request and adds the header, so the browser never holds the token. `/api/health` needs only the `Host` check. No CORS headers at all |
| `shards-server` (reserved) | OAuth 2.1 AS: PRM (RFC 9728), AS metadata (RFC 8414) + RFC 9207 `iss`, CIMD preferred, DCR behind a flag, PKCE S256, RFC 8707 audience (`/mcp` and `/api` separate), refresh rotation, PATs for headless agents. Actor injected from the token. Actor args (`claimer`, release `owner`, author `owner`, write `agent`) absent or equal to it, else tool error `identity_mismatch` (exit 2); assignee `owner` on `task_new`/`task_update` may name any active member; HTTP 403 only for missing scope. Scopes `notes\|tasks\|memories\|scratch\|assets:read\|write` + `offline_access`; cross-space tools filter to readable spaces. Absolute paths stripped to `rel_path` |

## Performance Budgets

| Budget | Target | Measured by |
|---|---|---|
| CLI cold start | < 10 ms warm FS; CI pin min-of-10 < 50 ms; `shards` links no tokio/axum/tauri | `tests/foundation_cli.rs`; `cargo tree -p shards` check in CI |
| Host call p95 (5k-task fixture: 5,000 tasks, 60% done, 2,000 notes; a scaled demo vault: `scripts/demo-vault.sh` has no `--scale`/`--notes` yet) | `shards_task_list` unbounded incl. `ready` ≤ 50 ms; `shards_task_get` baseline first, then ≤ 2× baseline; single-entity write ≤ 25 ms | release-mode timing test in `crates/shards-host/tests/`, 50 runs |
| UI list of 5k tasks | first render ≤ 100 ms after data; ≤ 80 rows mounted (virtualised); filter change ≤ 50 ms | vitest bench + timed browser-mode run against `shards-host` (villain-layer browser) → [features/desktop-app/tech.md](features/desktop-app/tech.md) § Testing |
| Live refresh | external write → UI updated ≤ 500 ms p95 | same harness, CLI write + event wait |

Blockers to fix first: O(n²) readiness in `ready`/`blocked` lists and the dashboard lens (owner
task-model-v2/5: `deps::readiness_all` once per list, release bench ≤ 50 ms at 5k); the 20-row
`Filter::default()` cap (delivered workaround: the app sends `limit: 2000` on task lists and 500
on notes, memories and assets; the planned host-side `limit: -1` injection is not built); per-call
config reload (not built: `Server::call` and every host tool still load the config per call).

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `shards` binary collides with Crystal's `shards` (research: market §7) | Accepted by owner (D1); install docs name the conflict; `MESH_*`/`~/.mesh` fallbacks for one release |
| Local HTTP reachable by other processes or DNS rebinding | Loopback bind, Host/Origin checks, per-launch token (§ Security Model) |
| Tauri v3 lands mid-build | Pin `^2.12`; one generic command keeps a migration to one file |
| UI writes race agents | Same per-entity locks. Gap: body replace has no precondition yet (`expected_body_sha256` planned), so an app save can overwrite an agent's or editor's newer body; the UI does not retry `lock_conflict` (it retries only offline errors) |
| Watcher misses events (FSEvents coalescing, cloud folders) | Invalidation by space, not by path; a lagging SSE subscriber gets an all-spaces event; an SSE reconnect invalidates every query. `refetchOnWindowFocus` is off (`staleTime` 30 s) |
| Sync/remote MCP scope creep into Now | `shards-server` stays reserved until features 18–19 start |

## Features

| Feature | Covers |
|---|---|
| **[features/shards-rebrand/](features/shards-rebrand/tech.md)** | Rename, compat fallbacks (14) |
| **[features/task-model-v2/](features/task-model-v2/tech.md)** | v2 fields, recurrence, filters across CLI, MCP, schema (15) |
| **[features/desktop-app/](features/desktop-app/tech.md)** | `shards-host`, Tauri shell, React UI, events (16) |
| **[features/sync/](features/sync/tech.md)** | `shards-server` sync API, HLC merge, client in app + CLI (18, designed) |
| **[features/remote-mcp/](features/remote-mcp/tech.md)** | Streamable HTTP MCP, OAuth 2.1 AS, PATs, scopes (19, designed) |

Other arcs (app-polish, billing, capture, multiplayer, web-mobile, integrations, e2ee) → [plan.md](plan.md).

## Branch Documents

| Document | Covers |
|---|---|
| **[tech-core.md](tech-core.md)** | Delivered core: stack, layout, invariants detail, contracts, exit codes, error kind registry, fields |
| **[tech-surfaces.md](tech-surfaces.md)** | Delivered per-verb behaviour: adoption, search, tasks, assets, memories, admin, dashboard, MCP, lenses |
