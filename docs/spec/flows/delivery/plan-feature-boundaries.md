---
type: flow
updated: 2026-11-02
---

# plan: Feature Boundaries

## Feature Boundaries

```
core (delivered)  ── owns ──>  src/** (storage, fm, search, lenses), tests/**, plugins/shards
shards-rebrand    ── owns ──>  tree-wide rename + compat fallbacks (src/config.rs), README, AGENTS.md, docs/spec/
task-model-v2     ── owns ──>  src/model, src/domain/tasks.rs, src/domain/recur.rs, src/cli, src/mcp
desktop-app       ── owns ──>  crates/shards-host, apps/desktop, root [workspace], core seams S0–S6
                               (src/config.rs [core].me, Server::call_with, src/domain/entity.rs,
                               notes project meta, storage::watch, the `conflict` kind)
sync, billing,    ── own  ──>  crates/shards-server (reserved; nothing written in the Now horizon)
remote-mcp, capture
```

| Layer | Owns | Does not own |
|---|---|---|
| **shards-rebrand** | Renames in every path; `MESH_*` env and `~/.mesh/` fallbacks; README, AGENTS.md, root `docs/spec/` | New surface of any kind; `mesh_*` tool aliases (D1: not aliased) |
| **task-model-v2** | Task fields (`priority: urgent`, `due`, `deadline`, `recur`, `recur_from`, `parent`, `section`, `order`, `completed`), recurrence advance on finish, filters (`--due-before`, `--due-after`, `--overdue`, `--parent`, `--section`), task MCP schemas, `[[members]]` config | Host-only tools; any UI; sync; other spaces' models |
| **desktop-app** | `Host::call`, the UI-only `host_*` tools, the vault change watcher, `shards-host` HTTP/SSE bin, the Tauri shell and React UI; core seams S0–S6 ([features/desktop-app/tech.md](../../features/desktop-app/tech.md) § Core seams) | Task schema and existing verb behaviour (read through `Host::call` only); `crates/shards-server`; tray and closed-window reminders, importers and signing (feature 17) |
| **sync** | `crates/shards-server` sync API; client in app and CLI; `.shards/sync/`, `.shards/conflicts/`, tombstones | Local command behaviour: CLI commands never depend on sync; billing |
| **billing (18b)** | Checkout (Paddle as merchant of record), plans, trial, server-side entitlement checks on sync and MCP endpoints, cancellation and downgrade, dunning, invoices; later Team seat counting | Prices (product-roadmap.md § Pricing); sync and MCP protocol |
| **remote-mcp** | Streamable HTTP MCP, OAuth 2.1 AS, PATs, scopes in `crates/shards-server` | Stdio MCP in the core crate |
| **private-remote-mcp** | `services/shards-remote`, `crates/shards-gateway`, shared remote policy/context and core filtering, private daemon declaration | UI, sync, public OAuth, `crates/shards-server`, core CLI network dependencies |
| **capture (19b)** | Email-to-task (per-user inbox address), iOS Shortcut recipe, the capture + review PWA served by `shards-server` from the desktop React app (Today, Upcoming, Inbox read-only; complete, reschedule, quick add) | Full web editing and native mobile apps (web-mobile) |

---

Parent: [Section index](README.md).
