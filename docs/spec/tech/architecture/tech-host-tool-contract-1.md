---
type: tech
applies: "**"
updated: 2026-11-02
---

# tech: Host Tool Contract (1/2)

## Host Tool Contract

Delivered contract (code: `crates/shards-host/src/{lib,tools}.rs`, `bin/shards-host.rs`; tests:
`crates/shards-host/tests/host_tools.rs`). Planned parts that are not built are listed at the end
of this section and in [plan.md](../../flows/delivery/README.md) § Spec vs Implementation.

`Host::call(tool, args) -> Result<Json, CallError>` (blocking; transports run it on a blocking
thread). Success is `{value, list}` on both transports: `value` is the core's raw result (an
object, or a bare array for list tools) and `list` says which. `shards_*` names go to
`mcp::tools::Server::call` unchanged (42 tools; v2 adds parameters, not tools). `host_*` names go
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

**Envelope** = core envelope ([tech-core.md](../core/README.md) § Error kind registry). An unknown
tool is `validation`. Over HTTP every `CallError` is status 422; the guard answers 401
`unauthorized` and 403 `forbidden` with `{kind, message}`.

**Events.** One watcher (`shards_host::watch`, 150 ms debounce, observer only: no lock, no
reconcile) emits `{spaces: [..], paths: [..]}` with **absolute** paths. It skips non
create/modify/remove events, directories and any dot component below a root. Tauri: event
`vault://changed`. HTTP: SSE `event: vault-changed` on `GET /api/events`; a subscriber that lags
gets one event naming every space.

Parent: [Section index](README.md).
