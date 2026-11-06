---
type: tech
applies: "**"
updated: 2026-11-06
---

# tech-core: Contracts (1/2)

## Contracts

| Contract | Rule |
|---|---|
| Config | `~/.shards/config.toml`. `[core]` `vault_path` + `agent`; `[spaces]` notes/tasks/memories/scratch/assets (relative path, absolute path, `"."`, or `false`; every key optional); `[search]` collection, hybrid, threshold, engine, spaces; `[tasks]` collections, strict. `vault_path` is expanded then canonicalised at the parse boundary; `path` and `tolaria_path` are permanent input aliases. Unknown tables and keys are ignored. Precedence: `--config` > `$SHARDS_CONFIG_PATH` > default; `--vault` > `$SHARDS_VAULT` > file; `$SHARDS_AGENT` > file (v2 adds `[core].me`; the full chain is owned by [product-cli.md](../../flows/cli/README.md) § Configuration and identity precedence). Missing config → exit 2 (`config set` excepted: it seeds the default file first). `[search].threshold` applies **only when explicitly set**, on both engine branches; every `--threshold` takes a finite number (`nan`/`inf` are exit 2). `config set` writes only keys a reader consumes and parses each as that reader's own type; an unknown key or a wrong type is exit 2. |
| Rename compat (one release) | `config::env_var` reads `SHARDS_*` and falls back to the `MESH_*` spelling when the new one is unset or empty (`CONFIG_PATH`, `AGENT`, `VAULT`, `INDEXED_BIN`, `INDEXED_TIMEOUT_MS`). `config::home_path` uses `~/.mesh/<leaf>` (config, vault) only when `~/.shards/<leaf>` is absent. `mesh_*` tool names are **not** aliased. No frontmatter key or id prefix changed, so vaults need no migration. |
| IDs | `n-` / `t-` / `m-` / `a-` + Crockford base32 over `SHA-256(created_iso \0 title)`, 4+ chars, extended on collision. Asset ids digest the content instead, making the id the content address. Never sequential; existing ids are never recomputed. |
| Folders | Routing is relative to the **space root**. Notes: `note→<notes>/`, `log/decision/reference/project→<notes>/{logs,decisions,references,projects}/`, recursive. Tasks: `open\|claimed→<tasks>/open/`, `done\|cancelled→<tasks>/done/`, non-recursive. Memories: flat, never moved. Scratch: `<scratch>/<agent>/<name>.md`, both components rejected when they normalise to empty. Assets: blob plus sidecar sharing one stem; a blob is Shards' only when its name is one Shards would mint for that id (§ Invariants 11). |
| Atomic write | Temp file plus rename, mode-preserving, `fsync`ed; the destination is untouched on any failure before the rename. |
| Locks | `O_EXCL` per entity under the space's `.locks/`; stale when the PID is dead or older than 300 s; reclaim and release are `(dev, ino)` compare-and-swaps under an exclusive `flock`. `shards status` reports stale locks. The `shards watch` singleton lock is `$XDG_RUNTIME_DIR/shards-<hash12>.watch.lock`, else `~/.shards/run/`. |
| Sandbox | Every resolved path must equal or sit beneath one enabled space root. |
| Exit codes | 0 ok · 1 io/infrastructure or declined confirmation · 2 validation · 3 not found (incl. corrupt frontmatter on read/amend, foreign seed, empty `task next`) · 4 claim conflict or contended lock · 5 blocked. Codes live on `ShardsError`; `main` maps them once. |
| Error envelope | Under `--json`, one JSON object on stderr: `kind`, `message`, `next_action`, the structured fields (`task_id`, `existing_owner`, `id_or_slug`, `slug`/`ids`, `seed_id`, …), plus `candidates` on not-found and `retry_after_ms` on a lock conflict. MCP renders the identical object. A verb spanning several transactions names **what already committed** and the repair command; that wrapper changes the message only — `kind`, `code` and `candidates` read through. Consumers key on `kind`, never on `message` (messages name CLI verbs such as `shards init`). Every kind is listed in § Error kind registry. |

### Error kind registry

The one list of envelope kinds. A feature that adds a kind adds its row here first. Exit is the
CLI and stdio MCP code; HTTP is the status `shards-host` and `shards-server` return. A remote
`tools/call` failure is an `isError` result inside HTTP 200; the HTTP column then applies only
to transport-level refusals. **Delivered `shards-host` deviates:** every domain error is HTTP
422 with body `{kind: "domain", message: <envelope JSON string>}`; the guard answers 401
`unauthorized` and 403 `forbidden`; a host fault is 500 `unknown`. The per-kind HTTP column is
the planned map (desktop-app gap).

| Kind | Exit | HTTP | Owner |
|---|---|---|---|
| `validation` (incl. unknown tool: `mcp/errors.rs::unknown_tool`) | 2 | 422 | core |
| `ambiguous_slug` | 2 | 422 | core |
| `config_missing` | 2 | 503 | core |
| `not_found` (incl. corrupt frontmatter on read, foreign seed, empty `task next`) | 3 | 404 | core |
| `claim_conflict` | 4 | 409 | core |
| `lock_conflict` | 4 | 409 + `Retry-After` | core |
| `blocked` | 5 | 409 | core |
| `io_error` | 1 | 500 | core |
| `error` (declined confirmation, planned host panic guard; a partial-batch wrapper reads its inner kind through) | 1 | 500 | core |
| `conflict` (stale body hash, occupied restore target) — **planned, not built**; today an occupied restore target is `validation` | 4 | 409 | desktop-app (S2, S4) |
| `unauthorized` (missing or bad `x-shards-token`; later a bearer) | — | 401 | desktop-app (host, delivered), remote-mcp |
| `forbidden` (host: foreign `Host`/`Origin`, missing `x-shards-client`) / `insufficient_scope` | — | 403 | desktop-app (host, delivered), remote-mcp |
| `identity_mismatch` | 2 | tool error | remote-mcp |
| `not_available_remote` | — | tool error | remote-mcp |
| `workspace_encrypted` | — | 403 | remote-mcp, e2ee |
| `offline_claim` | 4 | — | sync (client, `offline_claims = "refuse"`) |
| `cursor_expired`, `cursor_ahead` | — | 410 | sync |
| `device_revoked` | — | 401 | sync |
| `upgrade_required` | — | 426 | sync |

Parent: [Section index](README.md).
