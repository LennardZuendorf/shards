# Shards — PM decision brief (2026-10-15)

Authoritative decisions for the mesh → Shards pivot. Spec writers and builders follow these. Where
research disagrees, this brief wins (the rationale is noted). Research lives in `research/*.md`
next to this file.

## Product

- **D1 Name.** Brand, crate, binaries, MCP server and tool prefix all become **Shards**:
  crate/lib `shards`, bins `shards` + `shards-mcp`, MCP tools `shards_*`, env `SHARDS_*`
  (`SHARDS_AGENT`, `SHARDS_VAULT`, `SHARDS_CONFIG_PATH`, `SHARDS_INDEXED_BIN`,
  `SHARDS_INDEXED_TIMEOUT_MS`, `SHARDS_BIN`), config `~/.shards/config.toml`, plugin `plugins/shards`.
  The owner asked for it explicitly; research suggested keeping `mesh` as the CLI name because
  Crystal ships a `shards` binary — recorded as a known risk, not followed. Compat for one
  release: `MESH_*` env vars are read as a fallback when the `SHARDS_*` one is unset, and
  `~/.mesh/config.toml` / `~/.mesh/vault` are used when the `~/.shards` equivalents are absent.
  `mesh_*` tool names are NOT aliased (would double the tool list).
- **D2 Positioning.** "The multiplayer task manager for humans and agents — backed by Markdown you
  own." Wedge = Todoist-grade personal/team task UX + local-first Markdown + agent memory and
  scratch in the same vault. MCP access alone is table stakes (Todoist, TickTick have hosted MCP).
- **D3 Personas.** (1) Agent operator — a developer/PM running a fleet of coding/ops agents
  (beachhead; the owner). (2) Markdown-native knowledge worker (Obsidian user) who wants a real
  task app. (3) Small team (2–20 humans) delegating to humans and agents. (4) The agent itself as a
  first-class user (via MCP/CLI).
- **D4 Delegation model (Linear-style).** A task has an accountable **assignee** (`owner`, human or
  agent) and an optional **delegate/worker** currently executing it (`claimed_by`). Agent work shows
  a session state: working (claimed), awaiting input (task has `needs-input` label or status
  `blocked` by a human), error, done. Every write carries an actor in the activity log.
- **D5 Pricing.** Local: free forever, MIT core, no account. Personal Sync: $5/mo or $48/yr incl. a
  hosted remote-MCP endpoint. Team: $8 per human seat per month; agents are free members. Never
  resell LLM compute. Self-hosted server: free (single binary, SQLite).
- **D6 Trash/undo.** Core delete stays a hard unlink (existing principle). The app provides undo by
  holding the deleted file's raw content and restoring it via a host `restore` command (writes the
  same bytes back to the same relative path). A vault-level `.shards/trash/` is deferred to the sync
  arc (sync needs tombstones anyway).

## Task model v2 (Todoist parity, all in frontmatter; all optional; unknown keys still round-trip)

| Field | Format | Notes |
|---|---|---|
| `status` | `open` \| `claimed` \| `done` \| `cancelled` | unchanged; UI shows `claimed` as "In progress · <claimed_by>" |
| `priority` | `urgent` \| `high` \| `normal` \| `low` | adds `urgent` (P1). Map Todoist P1..P4 → urgent, high, normal, low. Default `normal` |
| `due` | `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM` (floating local time) | when it should be done |
| `deadline` | `YYYY-MM-DD` | hard limit, distinct from `due` (Todoist "deadline") |
| `recur` | RFC 5545 RRULE subset string, e.g. `FREQ=WEEKLY;BYDAY=MO,WE`, `FREQ=DAILY;INTERVAL=2`, `FREQ=MONTHLY;BYMONTHDAY=1` | FREQ ∈ DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, BYDAY (weekly only), BYMONTHDAY (monthly only) |
| `recur_from` | `due` (default, Todoist "every") \| `completion` ("every!") | |
| `parent` | task id | subtasks; one level shown nested in UI, any depth stored |
| `section` | free string | grouping inside a project (list headers, board columns) |
| `order` | number (float) | manual rank within the parent/section; UI writes midpoints |
| `completed` | RFC 3339 `…Z` | set on finish, cleared on reopen |
| `tags` | list | shown as **labels** in the UI |
| `project` | note id | unchanged (projects are notes with `type: project`) |
| `owner`, `claimed_by`, `blocks`, `blocked_by` | unchanged | |

- **Finishing a recurring task** does not create a new file: it advances `due` (and `deadline`
  by the same delta if set) to the next occurrence, keeps `status: open`, sets `completed` to now
  and appends nothing to the body. The response reports `next_due`. This is a write to the task's
  own file only, so the single-entity rule holds.
- Reopen = `task update --status open` (clears `completed`).
- Quick-add grammar (UI and a future `shards task add "…"` CLI parser): `#project`, `/section`,
  `@label`, `p1`–`p4`, `+assignee`, natural dates (chrono), `every …` / `every! …`, `{deadline}`.

## Identity and members

- `[[members]]` config table: `id`, `kind` (`human` | `agent`), `name` (display), optional `color`.
  `[tasks].collections` stays the validation list; members enrich it. `[core].me` (or
  `$SHARDS_AGENT` for an agent session) is the acting identity. The app's acting identity is the
  configured human `me`.
- Local identity is a spelling convention (unchanged). Identity becomes a security boundary only
  on the server, where the actor comes from the OAuth token, never from tool arguments.

## Architecture

- **Workspace layout.** Cargo workspace. Root crate stays in place (`shards`: core lib + CLI +
  stdio MCP) to limit churn. New: `crates/shards-host` (lib: transport-agnostic `Host::call(tool,
  args) -> Result<Json, envelope>` over `mcp::tools::Server::call` plus UI-only host tools; a
  vault change watcher emitting `{paths, spaces}` events; bin `shards-host`: axum on 127.0.0.1,
  `POST /api/call/{tool}`, `GET /api/events` SSE, serves the browser dev mode). `apps/desktop`:
  Tauri 2.12 (never v3) + React 19 + Vite + TS + Tailwind 4 + shadcn (radix) + TanStack Query +
  dnd-kit + cmdk + chrono-node + date-fns + sonner + lucide. One Tauri command
  `shards_call(tool, args)` (async + spawn_blocking) plus `vault://changed` events. Frontend
  transport picks Tauri `invoke` or HTTP `fetch` via `isTauri()`.
- **UI-only host tools** (not exposed over agent MCP): `host_task_delete`, `host_note_delete`,
  `host_memory_forget`, `host_memory_update_body`, `host_scratch_clear`, `host_restore`,
  `host_status`, `host_members`, `host_projects`, `host_dashboard`.
- **Reserved:** `crates/shards-server` = the future remote server (sync API + remote MCP over
  Streamable HTTP + OAuth). Not built in the immediate arc.
- **Sync (designed, not built now).** Server-ordered record sync; files keyed by frontmatter id;
  frontmatter merged per key with HLC timestamps (LWW for scalars, add/remove-set merge for
  lists); bodies three-way merged (`diffy`); losers kept in `.shards/conflicts/`; tombstones for
  deletes (edit beats concurrent delete); server-arbitrated claims with expiry for agents; sync
  state in `.shards/sync/` (SQLite). Runs inside the desktop app, `shards sync --watch`, or
  `shards sync --once` (cron) — local commands never depend on it ("no daemon" holds for the CLI).
  Server: axum + sqlx (Postgres hosted / SQLite self-host) + object_store. No CRDT as record store;
  Loro only for later live co-editing. E2EE: last, per-workspace, incompatible with remote MCP.
- **Remote MCP (designed, not built now).** `shards-server` exposes MCP over Streamable HTTP via
  `rmcp` + axum; supports protocol 2026-07-28 (stateless) and 2025-06-18/11-25. Built-in OAuth 2.1
  authorization server: PRM (RFC 9728), AS metadata (RFC 8414) with RFC 9207 `iss`, CIMD preferred,
  DCR behind a flag, PKCE S256, RFC 8707 resource/audience, refresh rotation; personal access tokens
  for headless agents; external IdP mode (WorkOS/Keycloak) later. Agent identity is per grant
  (member + workspace + client + grant). Scopes per space `notes|tasks|memories|scratch|assets:
  read|write` + `offline_access`. Actor injected from the token; `owner`/`claimed_by` args must be
  absent or equal the actor.

## Spec-principle reversals (must be recorded in root specs with rationale)

1. "Sync/versioning is never mesh's job; no git-sync logic" → Shards ships its own record sync
   (still no git sync). 2. "No dashboard/RBAC" non-goal → Shards ships a desktop UI, and roles on the
   server. 3. "Identity is not a security boundary" → still true locally; the server enforces it.
4. "No daemon" → still true for the CLI and core; the desktop app and `shards sync --watch` are
   long-running processes by choice, and nothing depends on them. 5. Surface growth is signed off
   by the owner for: task fields above, recurrence, host tools, `[[members]]`.

## Roadmap (Feature Sequence — binary gates)

| # | Feature | Horizon | Deliverable |
|---|---|---|---|
| 14 | shards-rebrand | Now | Rename everything, compat fallbacks |
| 15 | task-model-v2 | Now | Fields above, recurrence, filters (`--due-before/--due-after/--overdue`, `--parent`, `--section`), CLI + MCP + schema |
| 16 | desktop-app | Now | shards-host + Tauri shell + UI prototype (Inbox, Today, Upcoming, Projects list/board, Labels, Search, Agents, Memories, Scratchpads, Notes browser, ⌘K, quick add, detail pane, live refresh) |
| 17 | app-polish | Next | Reminders (tray timer loop), global quick-add window, saved filters + filter query language, calendar view, keyboard map, onboarding, importers (Todoist CSV/API, Obsidian Tasks), signed macOS build |
| 18 | sync | Next | `shards-server` sync API + client in app/CLI, personal multi-device |
| 19 | remote-mcp | Next | Hosted MCP + OAuth AS, PATs, scopes |
| 20 | multiplayer | Later | Workspaces, members/roles, invites, shared projects, comments, mentions, notifications, activity feed, presence |
| 21 | web-mobile | Later | Web client (same React app on the server), Tauri mobile capture (iOS/Android) |
| 22 | integrations | Later | Calendar sync, email-to-task, GitHub/Linear bridges, webhooks |
| 23 | e2ee | Later | Per-workspace E2EE (no remote MCP for those workspaces) |

## Design language

- Calm, dense, keyboard-first, Todoist-like clarity with Linear-like precision. Light + dark.
- Brand violet (≈ `#7c3aed` / oklch(0.55 0.24 293)), neutral grays, Geist Variable font,
  radius 0.5rem, priority colors: urgent red, high orange, normal blue, low gray (Todoist mapping).
- Agents are visually distinct from humans: agent avatars are rounded-square with a bot glyph and
  a hue derived from the id; humans are circles with initials.
- Layout: collapsible left sidebar (Inbox, Today, Upcoming, Search, Agents, Memories, Scratchpads,
  Notes; then Projects; then Labels), main list, right detail pane (sheet), ⌘K palette, `q` quick add.
