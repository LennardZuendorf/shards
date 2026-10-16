---
type: feature-research
feature: desktop-app
parent: product.md
updated: 2026-10-15
---

# desktop-app — Research

Discovery artifacts for the feature. Deleted with the feature folder at wrapup — never promoted to root. If a finding should persist, extract it to a lesson (lessons.md) or root tech.md section.

Condensed from three research passes on 2026-10-15: the obsidian-taskui reference app
(`taskui`), the Tauri 2 and frontend stack (`tauri`), and memory and scratchpad UX (`memory-ux`).
Citations of the form `file:line` refer to the reference checkout or the pre-rename tree. They
were valid on that day.

## Question

1. Which parts of the owner's earlier Obsidian task plugin are worth porting to a standalone
   app? Which are traps?
2. How should a Tauri desktop app sit on top of a synchronous Rust core? The answer must keep CLI
   and MCP parity and also run in a plain browser for testing.
3. How do humans inspect and correct agent memory and working state in comparable products? What
   does the Shards core lack for that?

## Findings

### Finding: TaskUI is a UI layer worth porting, over a data layer that is not

obsidian-taskui (v0.2.2, ~12.3k LOC) is React 18, Tailwind 3, shadcn new-york, Radix, TanStack
Table, dnd-kit, Jotai, RHF/Zod and chrono-node.

- **What it has:** Table, List and Board views, a modal and inline editor, and group/sort/filter
  popovers.
- **What it lacks:** calendar, quick add, global shortcuts, sidebar, projects and search.
- **Data model:** it stores one task per checkbox *line* in arbitrary notes. Shards stores one
  *file* per task. Port the views; treat the line mapper only as a future importer.

Source: taskui §0, §3, §6.

### Finding: Specific TaskUI ideas to keep

- **Enum display-config registry.** One table per enum: label, icon, class, order.
- **Status checkbox tinted by priority.** Click completes; right-click picks the priority.
- **Distinct priority flag silhouettes.** They carry meaning without colour.
- **Relative date categories:** Overdue, Today, Tomorrow, Next 7 days.
- **A chrono-backed date input.**
- **One view model feeding every layout.**
- **Kanban columns that collapse to a 48px strip,** with a dashed "drop to move" zone and a tilted
  drag overlay.
- **An adaptive row:** one line without dates, extra lines only when metadata exists.

Source: taskui §4.2, §8.

### Finding: TaskUI bugs to avoid

- **Unstable ids for id-less lines.** Every poll churns them (`taskBuilder.ts:8-13`). Shards ids
  are stable frontmatter.
- **Drops onto a card are ignored, and in-column order is never persisted**
  (`BoardView.tsx:103-116`). Shards needs persisted `order` and drop-on-card handling.
- **Board and List paginate at 30** (`taskAtoms.ts:485-491`). Virtualise; never paginate.
- **The date-category filter can never match**, because its labels differ from the produced
  values (`DTableFilterBy.tsx:55-74`).
- **A typo in the font variable** (`tailwind.config.cjs:61`).
- **A 5 s full-refetch poll** (`internalApiService.ts:229-262`). Use a Rust file watcher that
  pushes events.
- **"Medium" equals "no priority"** (`taskMapper.ts:231`). Keep an explicit default level.
- **Naming trap:** TaskUI `blocks` stores depends-on, which equals Shards `blocked_by`.

Source: taskui §6, §7.2.

### Finding: TaskUI defines no design tokens

Every TaskUI colour maps to an Obsidian CSS variable, so the standalone app must define its own
palette. The repo icon is faceted violet shards, which gives brand violet ≈ `#7c3aed` with
near-black panels in dark mode. Use the current shadcn convention:

- Tailwind 4 `@theme inline`;
- OKLCH variables;
- `tw-animate-css`;
- the unified `radix-ui` package.

Source: taskui §5.1, §5.3; https://ui.shadcn.com/docs/tailwind-v4.

### Finding: Tauri 2.12, never 3

- Tauri 2.12.4 is stable (MSRV 1.90). 3.0.0-alpha.5 requires Rust 1.95 and edition 2024; the repo
  pins 1.94. v3 also changes runtime selection and the ACL.
- `cargo add tauri` without a version resolves to the 3.0 alpha, so pin `~2.12`.
- Keep the JS `@tauri-apps/api` minor equal to the Rust minor.

Source: tauri §0.1, §1.1, §2; https://github.com/tauri-apps/tauri/releases.

### Finding: One generic command over the MCP dispatcher gives exact parity

`shards::mcp::tools::Server::call(name, &Json)` is public and already dispatches every agent tool
with full validation. A single Tauri command `shards_call(tool, args)` reuses it, so the UI and
agents run the same code path. Any new tool reaches the UI with no new command or capability.

The command must be `async` and use `spawn_blocking`, because the docs say: "Commands without the
async keyword are executed on the main thread". The core is synchronous and can wait on locks.

The cost is weaker static typing. One typed API module in the frontend mitigates it.
`tauri-specta` is still an RC after two years.

Source: tauri §4.1, §4.2, §4.4; https://v2.tauri.app/develop/calling-rust/.

### Finding: Browser mode is a small axum server over the same envelope

Routes:

- `POST /api/call/{tool}`;
- `GET /api/events` (SSE);
- `GET /api/health`.

Bind to 127.0.0.1 and require a per-launch token, because any website can POST to localhost.
`EventSource` cannot set headers, so the events route takes the token as a query parameter.

The frontend picks a transport with `isTauri()`, exported from `@tauri-apps/api/core` 2.12.4.
Vite proxies `/api` in dev.

This also makes browser-driven testing possible without a native window.

Source: tauri §8.2; codebase §2.5 for the kind → HTTP status mapping.

### Finding: Live refresh with a passive watcher

Use `notify-debouncer-full` at 150 ms over the enabled space roots. It uses the same filter as
`shards watch`: create, modify and remove only, no directories, no dot-path component. Skipping
dot paths keeps `.locks/` from looping.

- **Observer only.** The watcher never takes the `shards watch` singleton lock and never
  reconciles.
- **Fallbacks.** macOS FSEvents coalesces, and cloud folders can drop events, so keep
  refetch-on-focus.
- **Frontend.** Invalidate TanStack Query keys by space.

Source: tauri §7.

### Finding: Plugin and platform traps

- **Desktop notifications ignore `schedule`.** Reminders need an in-app loop. That is out of
  scope here.
- **Single-instance must be registered first** and has no JS API.
- **Global shortcuts registered from Rust** need no capability permission.
- **Skip `plugin-fs`.** All vault I/O goes through the core's sandbox and locks.
- **Build target.** Tailwind 4 needs Safari 16.4, so set `build.target: safari16.4` and macOS
  `minimumSystemVersion` 13.3, not the guide's `safari13`.
- **Deep links** fire only for an installed app in `/Applications` on macOS.

Source: tauri §5, §6, §8.1; https://tailwindcss.com/docs/compatibility;
https://docs.rs/tauri-plugin-notification/latest/tauri_plugin_notification/enum.Schedule.html;
https://v2.tauri.app/plugin/deep-linking/.

### Finding: Frontend stack versions (verified 2026-10-15)

| Package | Version |
|---|---|
| React | 19.3 |
| Vite | 8.3 (Rolldown) |
| `@vitejs/plugin-react` | 6.1 |
| TypeScript | 7.0 (native, no compiler API until 7.1) |
| Tailwind | 4.3 |
| shadcn CLI | 4.21 (Radix) |
| TanStack Query | 5.104 |
| TanStack Virtual | 3.14 |
| dnd-kit core / sortable | 6.3 / 10 |
| cmdk | 1.1 |
| chrono-node | 2.10 |
| date-fns | 4.4 |
| sonner | 2.0 |
| lucide-react | 1.57 |
| react-day-picker | 10 |

Notes:

- `@dnd-kit/react` 0.5 is still pre-1.0. Avoid it.
- Use CodeMirror 6 for body editing and `react-markdown` for reading, to keep files byte-faithful.

Source: tauri §1.3, §11.1.

### Finding: Memory products converge on five human controls

The five controls:

1. A browsable list with per-item edit and delete.
2. A scope or partition switch.
3. Provenance.
4. Expiry or archive instead of delete.
5. A "why was this recalled" view.

Where they appear:

- **ChatGPT:** a Manage view and source explanations.
- **Claude:** Topics and per-project memory.
- **Mem0 / OpenMemory:** entity filters, ADD/UPDATE/DELETE history, pause/archive.
- **Letta ADE:** editable blocks.
- **Zep:** bi-temporal facts.
- **Devin:** knowledge enable/disable and a "misleading knowledge" flag.

Shards already stores most of the needed fields in frontmatter: `kind`, `scope`, `importance`,
`source`, `expires`, `superseded_by`, `project`. Its recall formula is public and deterministic,
so the UI can show an exact score breakdown.

Source: memory-ux §0, §2.1. Pages:

- https://help.openai.com/articles/8590148-memory-faq
- https://support.claude.com/en/articles/11817273
- https://docs.mem0.ai/api-reference/memory/history-memory
- https://docs.letta.com/v1-sdk/ade
- https://help.getzep.com/facts
- https://docs.devin.ai/product-guides/knowledge

### Finding: Agent working state is shown on the card, with liveness inferred from recency

- **Linear:** keeps the human as assignee and the agent as delegate. Session state (working,
  awaiting input, error, done) is inferred from activities; ~30 min of silence means stale.
- **Kanbrio:** puts the session state on the card face.
- **Cursor:** lists every agent in a sidebar.
- **Linear and Letta:** treat a plan as a whole-document replace. That maps onto `scratch set`,
  with `- [ ]` lines rendered as a checklist.

Source: memory-ux §2.2. Pages:

- https://linear.app/developers/agent-interaction
- https://linear.app/developers/agents
- https://kanbrio.com
- https://cursor.com/changelog/1-7

### Finding: Core gaps that block the memory and scratch UX

| Gap | What is missing |
|---|---|
| G1 | No body-replace verb |
| G2 | `private` scope is applied inconsistently, and the operator cannot see agents' private memories |
| G4 | Supersession cannot be linked between existing memories or undone |
| G6 | Recall is opaque: the final score overwrites the match score |
| G13 | No optimistic-concurrency precondition, so a human editing a live scratch races the agent |
| G15 | The MCP scratch list drops `bytes` |
| G16 | No human/agent identity model |
| G17 | No library change feed |
| G19 | `Filter::default()` and MCP list defaults cap at 20 rows |

Two market patterns conflict with standing principles and are rejected:

- touch-on-read "last used" counters;
- edit history inside the vault.

Source: memory-ux §5, §2.3.

## Approaches tried

| Approach | Result | Notes |
|---|---|---|
| Many typed Tauri commands (one per verb) | ruled out | Doubles the surface and drifts from MCP; tauri-specta still RC |
| One generic `shards_call` over the MCP dispatcher | chosen | Exact parity; scaffold spike works in `tauri dev` and browser mode |
| `tauri-plugin-fs` with a vault scope | ruled out | Bypasses locks, sandbox and canonical frontmatter |
| Polling like TaskUI | ruled out | Watcher plus SSE/events, with refocus as fallback |
| Delayed deletes (hold for 5 s, then unlink) for undo | ruled out | Root design chooses immediate delete plus `host_restore` of held bytes (DECISIONS D6) |
| `updated` timestamp as the edit precondition | ruled out for bodies | External editors do not bump `updated`; a body hash catches them |
| Adding `forget`/`delete`/`clear` to agent MCP | ruled out | MCP name test bans those substrings; UI-only `host_*` tools instead |
| Playwright for UI verification | not used here | Browser mode driven by the villain-layer browser tools; root budgets may still add a harness later |

## Decision

The decisions:

- **Port TaskUI's UI ideas, not its data layer.**
- **Build on Tauri 2.12.** The shell is one generic command over the existing dispatcher.
- **Put a host library under the shell,** shared with an axum browser-mode server. It owns:
  - operator identity;
  - unbounded lists;
  - UI-only destructive and body-replace tools behind a body-hash precondition;
  - exact-bytes undo;
  - a passive watcher.

In the memory and scratch UX, this feature closes gaps G1, G2 (operator view), G13, G16 (consumed
from task-model-v2), G17 and G19.

It leaves these open, as non-goals:

- G4 (link to existing, un-supersede);
- G6 as a core explain mode (the app mirrors the formula client-side instead);
- G11 and G12 (scratch tags, rename, move).

Rejected outright:

- reminders in the desktop app (app-polish);
- `plugin-fs`;
- polling;
- touch-on-read counters;
- in-vault history.
