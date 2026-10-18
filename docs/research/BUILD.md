# Shards prototype — build contract (2026-10-15)

Repo: `~/.villain-worktrees/villain-mesh-improvements/mesh` (branch
`villain/mesh-improvements`). Product decisions: `DECISIONS.md` next to this file (authoritative).
Research: `research/*.md` (taskui.md = UI to port; memory-ux.md = memory/scratch screens;
tauri.md = stack). Reference UI source: `ref/obsidian-taskui/src` (React + shadcn; port ideas and
components, not Obsidian code).

## Rules for every builder

- Do NOT commit, push, or run `git stash`/`git checkout`/`git reset`. Leave changes in the tree.
- Edit ONLY the paths your task owns. Other agents are editing other paths at the same time.
  If a build/type error is in a file you do not own, ignore it (or note it in your result).
- Rust: `clippy -D warnings` clean (`unwrap`/`expect`/`panic` denied in non-test code),
  `cargo fmt`. Frontend: `pnpm -C apps/desktop build` (tsc + vite) clean, `pnpm -C apps/desktop
  test` (vitest) green. No byte-slicing strings in Rust.
- Never add dependencies beyond what your task names without need; pin Tauri to 2.12 (never v3).
- Show real command output for verification in your final result.

## Workspace layout (already scaffolded, builds)

```
Cargo.toml                       # [workspace] members: ".", crates/shards-host, apps/desktop/src-tauri
src/ tests/                      # core crate `shards` (lib + bins shards, shards-mcp)
crates/shards-host/src/lib.rs    # Host::call(tool,args) over shards::mcp::tools::Server::call; watch()
crates/shards-host/src/bin/shards-host.rs  # axum 127.0.0.1:7878: POST /api/call/{tool}, GET /api/events (SSE), GET /api/health
apps/desktop/                    # Vite 8 + React 19 + TS 7 + Tailwind 4 + shadcn (radix) — pnpm
apps/desktop/src-tauri/          # Tauri 2.12, one command shards_call(tool,args), emits vault://changed
```

Run browser mode: `SHARDS_CONFIG_PATH=<cfg> cargo run -p shards-host` (port 7878) and
`pnpm -C apps/desktop dev` (5173, proxies /api → 7878).

## Transport contract

`call(tool, args) -> value` (frontend `src/lib/transport.ts`). Response body `{value, list}`; errors
`{kind, message}` where `message` for domain errors is the core's JSON error envelope string
`{kind, message, next_action, ...}`. Change events: `{spaces: string[], paths: string[]}`.

### Agent MCP tools (exist today; args = the MCP schema in `src/mcp/schema.rs`)

shards_note_get, shards_note_list, shards_task_get, shards_task_list, shards_search, shards_health,
shards_recent_activity, shards_build_context, shards_graph, shards_project, shards_session_start,
shards_note_new, shards_note_append, shards_task_new, shards_task_append, shards_note_update,
shards_note_adopt, shards_note_claim, shards_note_release, shards_task_claim, shards_task_release,
shards_task_finish, shards_task_update, shards_task_cancel, shards_memory_new,
shards_memory_append, shards_memory_update, shards_memory_get, shards_memory_list,
shards_memory_recall, shards_scratch_set, shards_scratch_append, shards_scratch_get,
shards_scratch_list, shards_asset_get, shards_asset_list, shards_asset_attach, shards_task_block,
shards_task_unblock, shards_task_next.

Task list item today: `{"id","type":"task","title","tags":[],"owner","created","updated",
"related":[],"status","priority","claimed_by","project","blocks":[],"blocked_by":[]}`.
task-model-v2 adds (when set): `due`, `deadline`, `recur`, `recur_from`, `parent`, `section`,
`order`, `completed`; priority gains `urgent`. The UI MUST tolerate these being absent.

### Host tools (UI-only; implemented in crates/shards-host, NOT exposed to agent MCP)

| tool | args | returns |
|---|---|---|
| `host_status` | `{}` | `{vault, config_path, me, version, spaces: {name: root|null}, counts: {notes,tasks,memories,scratch,assets}}` |
| `host_members` | `{}` | `[{id, kind: "human"|"agent", name, color?}]` from `[[members]]` config + `[tasks].collections` + every distinct owner/claimed_by/memory author/scratch agent seen in the vault (kind heuristic when not configured: id ends with `-agent`/`agent`/`bot` or appears only as a scratch/memory author → agent; `me` → human) |
| `host_projects` | `{}` | `[{id, title, slug?, color?, sections: [string], open_count}]` — notes with `type: project` (plus distinct `project` ids referenced by tasks); `sections` = distinct `section` values of its tasks, in first-seen `order` |
| `host_task_delete` | `{id}` | `{id, path, content}` (raw bytes as UTF-8 before deletion, path vault-relative) |
| `host_note_delete` | `{id}` | same shape |
| `host_memory_forget` | `{id}` | same shape |
| `host_scratch_clear` | `{name, agent?}` | same shape |
| `host_restore` | `{path, content}` | `{path}` — writes content atomically to vault-relative path; refuses to overwrite an existing file; path must stay inside the sandbox |
| `host_task_set_body` / `host_note_set_body` / `host_memory_set_body` | `{id, body}` | `{id, updated}` — replace the Markdown body, keep frontmatter, bump `updated` |
| `host_dashboard` | `{}` | the PR #11 dashboard snapshot (`cli/dashboard.rs` DashFrame) as JSON, if extractable; else `{}` |

## Frontend structure (owned as listed in each task)

```
apps/desktop/src/
  main.tsx, App.tsx              # foundation
  index.css                      # foundation — Shards tokens (violet brand, light+dark)
  lib/transport.ts               # foundation (exists)
  lib/types.ts                   # foundation — Task, Note, Memory, Scratch, Member, Project, Status...
  lib/api/{tasks,notes,memories,scratch,host}.ts   # foundation — typed wrappers for every tool above
  lib/query.ts                   # foundation — TanStack Query client, keys, change-event invalidation
  lib/quickadd/{parse.ts,parse.test.ts}  # foundation — quick-add grammar + vitest
  lib/dates.ts                   # foundation — due buckets (overdue/today/tomorrow/this week/later), formatting
  app/routes.tsx                 # foundation — route table: inbox, today, upcoming, project/:id, label/:name, search, agents, memories, scratch, notes, settings
  app/{AppShell,Sidebar,CommandPalette,QuickAdd}.tsx  # foundation
  components/ui/*                # shadcn primitives (foundation adds what views need)
  components/shared/*            # foundation — Avatar(human/agent), PriorityFlag, PriorityCheckbox, DueChip, LabelChip, StatusBadge, EmptyState, Kbd
  views/tasks/**                 # task-views agent
  components/task/**             # task-views agent
  views/{agents,memories,scratch,notes,settings}/**  # agent-views agent
  components/{memory,scratch,agent,note}/**          # agent-views agent
```
