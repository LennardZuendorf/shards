---
type: feature-plan
feature: desktop-app
sibling: tech.md
parent: ../../plan.md
updated: 2026-10-29
---

# Feature: Desktop App — Implementation Plan

Delivers the host library and binary, the Tauri shell and the React app in 48 units (42–48 delivered 2026-10-28): core seams,
the agent signalling contract and a seeded demo vault first, then the host (dispatch, tools, watcher, HTTP), then the shell, then
the app from scaffold to every screen, then live refresh, polish and the acceptance run, with CI for the new crates and the app landing
before the first screen. Units 25–31 (added 2026-10-16) close the MVP parity rows the spec
critique found unowned: completed log, project management, bulk actions, accessibility and
locale, "Waiting on me", in-window reminders and delete to the OS Trash. Units 32–33 (2026-10-16)
add the read-only notes browser and "Open in". Units 34–41 (2026-10-16, approved)
add notes trees, sidebar sections, task-view options and the monochrome redesign. Every UI
unit is verified in a real browser against `shards-host` on the demo vault, so the native window
is needed only for the shell units.

> For agentic workers: execute units in Seq order via superpowers:executing-plans or
> superpowers:subagent-driven-development; each unit's Test scenarios and Verification are the
> checklist.

**Parent:** [../../plan.md](../../plan.md)
**Requirements:** [product.md](product.md)
**Architecture:** [tech.md](tech.md)
**Design:** [design.md](design.md)

**Feature gate:** Starts when shards-rebrand (14) is `DONE`. Runs concurrently with task-model-v2
(15) under the root plan's sanctioned exception: the app degrades gracefully on tasks without v2
fields and edits no 15 path except the two additive seams in desktop-app/1 and the additive
signalling text in desktop-app/24. desktop-app is `DONE`
only when desktop-app/22 passes against a 15-`DONE` core.

---

## Problem Frame

The core is synchronous, CLI-shaped and identity-from-environment; a long-running UI needs a
transport-agnostic dispatcher that acts as the human, never truncates lists, can delete with undo
and replace bodies without clobbering agents, and pushes change events. Those seams come first
because every screen depends on them. The host is then testable with cargo alone, and browser mode
makes every UI unit testable without Tauri. Screens follow the order of daily use (shell → task
lists → quick add → detail → board → agent layer → notes → search/palette → settings), so the
owner can dogfood from desktop-app/12 onward.

---

## Requirements Trace

| ID | Requirement | Units |
|---|---|---|
| R1 | [Navigation shell](product.md#requirement-navigation-shell-r1) | desktop-app/7, desktop-app/9, desktop-app/21 |
| R2 | [Inbox](product.md#requirement-inbox-r2) | desktop-app/10 |
| R3 | [Today](product.md#requirement-today-r3) | desktop-app/10 |
| R4 | [Upcoming](product.md#requirement-upcoming-r4) | desktop-app/10 |
| R5 | [Project list view](product.md#requirement-project-list-view-r5) | desktop-app/1, desktop-app/3, desktop-app/10 |
| R6 | [Project board view](product.md#requirement-project-board-view-r6) | desktop-app/13 |
| R7 | [Labels](product.md#requirement-labels-r7) | desktop-app/10 |
| R8 | [Search](product.md#requirement-search-r8) | desktop-app/18 |
| R9 | [Task rows and completion](product.md#requirement-task-rows-and-completion-r9) | desktop-app/10 |
| R10 | [Task detail pane](product.md#requirement-task-detail-pane-r10) | desktop-app/12 |
| R11 | [Subtasks and blockers](product.md#requirement-subtasks-and-blockers-r11) | desktop-app/12 |
| R12 | [Activity and comments](product.md#requirement-activity-and-comments-r12) | desktop-app/12 |
| R13 | [Quick add](product.md#requirement-quick-add-r13) | desktop-app/11 |
| R14 | [Command palette](product.md#requirement-command-palette-r14) | desktop-app/18 |
| R15 | [Humans and agents are visually distinct](product.md#requirement-humans-and-agents-are-visually-distinct-r15) | desktop-app/3, desktop-app/7, desktop-app/14 |
| R16 | [Delegation and agent session state](product.md#requirement-delegation-and-agent-session-state-r16) | desktop-app/14, desktop-app/24 |
| R17 | [Agents view](product.md#requirement-agents-view-r17) | desktop-app/3, desktop-app/14 |
| R18 | [Memories manager](product.md#requirement-memories-manager-r18) | desktop-app/3, desktop-app/15 |
| R19 | [Editing, correcting and forgetting memories](product.md#requirement-editing-correcting-and-forgetting-memories-r19) | desktop-app/15 |
| R20 | [Recall playground](product.md#requirement-recall-playground-r20) | desktop-app/1, desktop-app/3, desktop-app/15 |
| R21 | [Scratchpads](product.md#requirement-scratchpads-r21) | desktop-app/16 |
| R22 | [Notes browser](product.md#requirement-notes-browser-r22) | desktop-app/17, desktop-app/32 |
| R23 | [Settings and first run](product.md#requirement-settings-and-first-run-r23) | desktop-app/3, desktop-app/6, desktop-app/19 |
| R24 | [Live refresh](product.md#requirement-live-refresh-r24) | desktop-app/1, desktop-app/4, desktop-app/6, desktop-app/8, desktop-app/20 |
| R25 | [Undo](product.md#requirement-undo-r25) | desktop-app/1, desktop-app/3, desktop-app/8, desktop-app/31 |
| R26 | [Edit conflicts](product.md#requirement-edit-conflicts-r26) | desktop-app/1, desktop-app/12 |
| R27 | [Keyboard-first operation](product.md#requirement-keyboard-first-operation-r27) | desktop-app/9, desktop-app/21 |
| R28 | [Empty, error and disabled states](product.md#requirement-empty-error-and-disabled-states-r28) | desktop-app/9, desktop-app/21 |
| R29 | [Native window behaviour](product.md#requirement-native-window-behaviour-r29) | desktop-app/6 |
| R30 | [Human-only destructive actions](product.md#requirement-human-only-destructive-actions-r30) | desktop-app/1, desktop-app/3 |
| R31 | [Browser mode](product.md#requirement-browser-mode-r31) | desktop-app/2, desktop-app/5, desktop-app/8 |
| R32 | [Acting identity](product.md#requirement-acting-identity-r32) | desktop-app/1, desktop-app/3 |
| R33 | [Agent signalling contract](product.md#requirement-agent-signalling-contract-r33) | desktop-app/24 |
| R34 | [Completed log](product.md#requirement-completed-log-r34) | desktop-app/25 |
| R35 | [Project management](product.md#requirement-project-management-r35) | desktop-app/13, desktop-app/26 |
| R36 | [Multi-select and bulk actions](product.md#requirement-multi-select-and-bulk-actions-r36) | desktop-app/27 |
| R37 | [Accessibility](product.md#requirement-accessibility-r37) | desktop-app/21, desktop-app/28 |
| R38 | [Locale](product.md#requirement-locale-r38) | desktop-app/28 |
| R39 | [Waiting on me](product.md#requirement-waiting-on-me-r39) | desktop-app/29 |
| R40 | [Reminders while the app is open](product.md#requirement-reminders-while-the-app-is-open-r40) | desktop-app/30 |
| R41 | [Open in the operator's Markdown editor](product.md#requirement-open-in-the-operators-markdown-editor-r41) | desktop-app/33 |
| R42 | [Folder and tag trees](product.md#requirement-folder-and-tag-trees-for-notes-r42) | desktop-app/34, /37, /48 |
| R43 | [View options](product.md#requirement-view-options-for-task-lists-r43) | desktop-app/38, /39 |
| R44 | [Task filters](product.md#requirement-filters-for-task-lists-r44) | desktop-app/40 |
| R45 | [Flint visual system](product.md#requirement-flint-visual-system-r45) | desktop-app/42, /43, /46, /47, /48 |
| R46 | [Quiet and Focus modes](product.md#requirement-quiet-and-focus-modes-r46) | desktop-app/44, /47 |
| R47 | [Flint identities and agent overview](product.md#requirement-flint-identities-and-agent-overview-r47) | desktop-app/42, /43, /46, /47, /48 |
| R48 | [Truthful contextual handoff](product.md#requirement-truthful-contextual-handoff-r48) | desktop-app/45, /47 |
| R49 | [Redesign preserves the working app](product.md#requirement-redesign-preserves-the-working-app-r49) | desktop-app/43–48 |

Every unit below cites the R-IDs it satisfies. New work gets a new unit id; ids are never renumbered.

---

## Key Technical Decisions

1. **One active-set query feeds every task view.** All task views project one unbounded
   `status: open,claimed` list. This gives one optimistic cache and consistent counts, and never
   takes the O(n²) readiness path. → [tech.md](tech.md) § Frontend data layer
2. **Undo is an inverse call carried in the response.** Edits restore the exact pre-image, moves
   included. Deletes restore bytes. Every restore is refused when anyone wrote since. → § Undo and
   restore
3. **Body writes are guarded by a body hash, not `updated`.** External Markdown editors never bump
   `updated`. → § Core seams S2
4. **The host acts as the operator by passing its own config into the dispatcher.**
   `$SHARDS_AGENT` cannot leak in. → § Host dispatch
5. **Browser mode is the test harness.** It uses the same `Host`, the same events and the same
   app. Verification drives it with the villain-layer browser, not Playwright. → § Testing
6. **No new MCP tools.** Every UI-only capability is a `host_*` tool. The agent surface stays at
   40.

---

## Global Constraints

- `cargo fmt --all --check`, `cargo clippy --all-targets --locked -- -D warnings` and
  `cargo test -p shards` stay green after every unit. The cold-start pin is included.
- New crates mirror the core's clippy denies (`unwrap_used`, `expect_used`, `panic`,
  `string_slice`) and use `#![forbid(unsafe_code)]`.
- Edit no task-model-v2 path except two additive seams in desktop-app/1 (`Server::call_with`
  and `[core].me` / `Config::operator()` beside 15's `[[members]]`) and the additive S7 text in
  desktop-app/24. task-model-v2 also edits `src/mcp/instructions.rs`, SKILL.md and
  `tests/bundle.rs`; desktop-app/24 adds its own lines and asserts only, and whichever lands
  second rebases.
- No `host_*` name may enter `src/mcp/mod.rs` `TOOL_NAMES`.
- Tauri crates pinned `~2.12` / `~2.7`. JS `@tauri-apps/*` minors equal the Rust minors.
- pnpm runs only inside `apps/desktop`. No lockfile at the repo or task root.
- The frontend names tool arguments only in `src/lib/api/*`.
- Commits: `feat(desktop): desktop-app/n <subject>` (≤ 50 chars, imperative).

**Shared verification harness** (used by every UI unit; `$D` = a scratch directory):

```bash
cargo build                                               # demo-vault.sh needs target/debug/shards
bash scripts/demo-vault.sh --force $D/demo
cargo run -p shards-host -- --config $D/demo/config.toml --port 79NN &   # token → ~/.shards/run/host-79NN.token
SHARDS_HOST_URL=http://127.0.0.1:79NN pnpm -C apps/desktop dev --port 52NN --strictPort &   # no `--`; proxy adds the token
# agent writes during checks:
SHARDS_CONFIG_PATH=$D/demo/config.toml SHARDS_AGENT=claude-code ./target/debug/shards task …
# stop both servers when done (kill the two background jobs)
```

Then the villain-layer browser tools: `browser_navigate` to the view's URL, `browser_snapshot`, and
assert the named elements listed under each unit's Verification.

---

## Unit IDs

Units are `desktop-app/n`. Seq equals n unless reordered below.

- desktop-app/24 (agent signalling contract) runs right after desktop-app/1. It is text and a
  bundle test, and desktop-app/14 depends on it.
- desktop-app/23 (CI) runs right after desktop-app/8, before the first screen unit.
- desktop-app/31 (delete to the OS Trash) runs before the owner's 30-day dogfood starts.
- desktop-app/25–30 run after desktop-app/20 and before desktop-app/21, because 21's polish
  pass and 22's acceptance cover them.
- desktop-app/34–41 (added and approved 2026-10-16) run before desktop-app/21: 34 first; then
  35, 37 and 38→39→40 in parallel (37 and 38 use `components/ui` by name, so 35 can swap the
  internals underneath them); 36 after 35, because it uses the animate-ui sidebar; 41 last. 21 and
  22 cover them.

---

### desktop-app/1 — Core seams

**Goal:** Land the additive core seams the host needs: `[core].me` with `Config::operator()`,
`call_with`, `entity` (set_body, remove_returning, restore), the `conflict` kind, project meta,
and the shared watch filter.

**Requirements:** R5, R20, R24, R25, R26, R30, R32

**Dependencies:** —

**Files:**

```
src/config.rs             # + [core].me, Config::operator()
src/mcp/tools.rs          # + Server::call_with
src/domain/entity.rs      # new: set_body, remove_returning, restore
src/domain/mod.rs         # pub mod entity
src/error.rs              # + Conflict { target, current_sha256, updated, holder } -> "conflict", exit 4
src/domain/notes.rs       # + update_project_meta
src/storage/watch.rs      # new: interesting, watched_roots (moved)
src/cli/watch.rs          # call the moved functions
tests/entity_cli.rs       # new integration tests
```

**Test scenarios:**

- `operator()` returns `[core].me`, falls back to the file's `[core].agent`, and ignores
  `SHARDS_AGENT=claude`.
- `call_with(cfg.with_agent("lennard"), "shards_task_append", …)` stamps `— lennard` even with
  `SHARDS_AGENT=claude` set.
- `set_body` replaces the body, keeps unknown keys byte-identical, recomputes `related`, and
  no-ops on an identical body (mtime unchanged).
- `set_body` with a stale hash → exit 4, kind `conflict`, file unchanged.
- `remove_returning` returns the exact bytes that were unlinked.
- `restore` of a deleted task recreates it byte for byte. An occupied path is refused.
- `restore` after `finish` puts the file back in `open/` with the old `due` and leaves nothing
  in `done/`. A foreign edit between finish and restore → `conflict`.
- `update_project_meta` rejects a non-project note, duplicate sections and an unknown colour.
- `shards watch` unit tests pass unchanged.
- The MCP table is still 40 names.

**Verification:** `cargo test -p shards` (all green, including `tests/entity_cli.rs` and
`mcp::tests::the_tool_table_is_forty_unique_names`); `cargo clippy --all-targets --locked -- -D
warnings`.

---

### desktop-app/2 — Seeded demo vault

**Goal:** Ship a demo-vault script that builds the demo vault from tech.md § Demo vault through
the `shards` CLI. Delivered as `scripts/demo-vault.sh [--force] [--empty] [DIR]`; `--scale N`
is not built.

**Requirements:** R31

**Dependencies:** —

**Files:**

```
scripts/demo-vault.sh
```

**Test scenarios:**

- Two runs on fresh directories produce the same counts of tasks, memories, scratch and notes.
- The dates are relative to the run day.
- `--scale 3500` adds done tasks for the 5k-task fixture.

**Verification:** `bash scripts/demo-vault.sh --force $D/demo` with these checks:

- `SHARDS_CONFIG_PATH=$D/demo/config.toml shards task list --status open,claimed --json | jq length` prints ≥ 20.
- `shards memory list --json --include-expired --include-superseded | jq length` prints 8.
- `shards scratch list --all-agents --json | jq length` prints ≥ 3.
- `shards status` reports no dangling links and one foreign file.

---

### desktop-app/3 — Host library: dispatch and host tools

**Goal:** Replace the spike with `Host` per tech.md: operator identity, cached config, limit
injection, the envelope object, `call_undoable` with inverse calls, and all 17 `host_*` tools.

**Requirements:** R5, R15, R17, R18, R20, R23, R25, R30, R32

**Dependencies:** desktop-app/1

**Files:**

```
crates/shards-host/src/{lib.rs,dispatch.rs}
crates/shards-host/src/tools/{status,members,projects,dashboard,bodies,removal,memory,config,restore}.rs
crates/shards-host/tests/{dispatch,host_tools,undo,api_contract}.rs
crates/shards-host/tests/fixtures/api_calls.json   # every { tool, args } lib/api/* sends
```

**Interfaces:**

- Consumes: `Server::call_with`, `entity::*`, `notes::update_project_meta` (desktop-app/1)
- Produces: `Host`, `HostOptions`, `Envelope`, `Undo`, `Host::call`, `Host::call_undoable`

**Test scenarios:**

- Every `shards_*` tool returns identical JSON through `Host::call` and `Server::call_with`.
- A 30-task vault lists all 30 without a `limit` argument.
- `SHARDS_AGENT=claude` in the test environment still produces operator-stamped writes.
- Each `host_*` tool succeeds on a fixture and fails with the right `kind`: unknown id →
  `not_found`; disabled space → `validation`, and `host_status` shows `enabled: false`.
- One undo round trip per family: update, finish (moved file), delete, create, block.
- An undo after a foreign write → `conflict`.
- `task_block { on: [B, C] }` where B already blocked the task → undo is `task_unblock { on: [C] }`,
  and B stays a blocker on both files.
- `task_unblock { on: [B] }` → undo is `task_block { on: [B] }`. Unblocking an absent edge returns
  no undo.
- A call that leaves the file byte-identical (same priority again) returns no undo.
- `task_new` or `task_update` with `blocks` or `blocked_by` returns no undo; the result says it
  cannot be undone.
- `api_contract`: every `{ tool, args }` in `fixtures/api_calls.json` runs through `Host::call` on
  a fixture vault, and none fails with `missing required parameter` or an unknown-argument
  `validation` error. The fixture starts from tech.md § `shards_*` tools the app uses
  (`shards_task_get { id }`, `shards_memory_get { target }`, `shards_note_update { target }`, …);
  desktop-app/8 keeps it in sync with `lib/api/*`.
- `host_memory_list { all_scopes: true }` includes codex's private memory. Without the flag it
  does not.
- `host_memory_recall_as { agent: "codex" }` ranks codex's private memory.
- `host_config_set core.me` on a missing config creates it.

**Verification:** `cargo test -p shards-host`; `cargo clippy -p shards-host --all-targets -- -D
warnings`.

---

### desktop-app/4 — Host watcher

**Goal:** `Host::watch` emits `ChangeEvent { spaces, paths, seq, config }` with vault-relative
paths, from the shared filter, as a passive observer.

**Requirements:** R24

**Dependencies:** desktop-app/1, desktop-app/3

**Files:**

```
crates/shards-host/src/watch.rs
crates/shards-host/tests/watch.rs
```

**Test scenarios:**

- A CLI `task new` produces one event naming `tasks` and the vault-relative path within 1 s.
- A write under `.locks/` produces no event.
- A config edit produces `config: true`, and the watcher re-roots after the vault path changes.
- A running `shards watch` keeps its singleton lock while the host watcher runs.
- Launching on a vault without `scratch/` creates no folder. Creating `scratch/` later re-roots,
  and a write inside it emits an event naming `scratch`.
- Saving the config with write-temp-and-rename emits `config: true`.

**Verification:** `cargo test -p shards-host --test watch`.

---

### desktop-app/5 — `shards-host` HTTP binary

**Goal:** Serve `POST /api/call/{tool}`, `GET /api/events` (SSE `vault-changed`) and
`GET /api/health` behind the token, `Host` and `Origin` guards, with kind → status mapping,
`--static` and the documented flags.

**Requirements:** R31

**Dependencies:** desktop-app/3, desktop-app/4

**Files:**

```
crates/shards-host/src/{http.rs,bin/shards-host.rs}
crates/shards-host/tests/http.rs
```

**Test scenarios:**

- A request without a token → 401.
- `Host: evil.example` → 403.
- `Origin: https://evil.example` → 403.
- An unknown tool → 404 with a `not_found` envelope.
- `claim_conflict` → 409.
- An SSE client receives a `vault-changed` frame after a CLI write.
- A non-loopback address (`0.0.0.0:7878`) refuses to start.

**Verification:** `cargo test -p shards-host` (the guard tests live in `src/bin/shards-host.rs`).
Then start the binary on the demo vault with `--port 79NN` and run:

- `curl -s -H 'content-type: application/json' -H 'x-shards-client: 1' -H "x-shards-token: $(cat ~/.shards/run/host-79NN.token)" -X POST 127.0.0.1:79NN/api/call/host_status -d '{}' | jq .value.me` prints `"lennard"`.
- The same call without the token header prints HTTP 401.

---

### desktop-app/6 — Tauri shell

**Goal:** Build the `shards-desktop` crate with `shards_call` over `call_undoable`, the
`vault://changed` forwarding, these plugins, the capability file, CSP, window config and an
unsigned `app`/`dmg` bundle:

- single-instance, registered first;
- window-state;
- dialog;
- opener;
- global-shortcut, which shows the window and emits `app://quick-add`.

**Requirements:** R23, R24, R29

**Dependencies:** desktop-app/3, desktop-app/4

**Files:**

```
apps/desktop/src-tauri/{Cargo.toml,build.rs,tauri.conf.json}
apps/desktop/src-tauri/capabilities/main.json   # replaces default.json
apps/desktop/src-tauri/src/{main.rs,lib.rs}
```

**Test scenarios:**

- A second launch focuses the first window.
- Size and position survive a restart.
- `CmdOrCtrl+Shift+Space` from another app brings Shards forward.
- A CLI write logs one `vault://changed` in the devtools console.
- The webview cannot call any command other than `shards_call`.

**Verification:** `cargo check -p shards-desktop`; `pnpm -C apps/desktop tauri dev` on the demo
vault, then confirm each scenario by hand and record the result in the PR description.

---

### desktop-app/7 — App scaffold and design system

**Goal:** Map the root design tokens to the shadcn CSS variables for light and dark (Geist
Variable, radius 0.5rem, priority, due, session and identity colours). Add the theme switch
(system, light, dark), the avatar component (circle for humans, rounded square with a bot glyph
for agents, hue from the id) and a token gallery route.

**Requirements:** R1, R15

**Dependencies:** —

**Files:**

```
apps/desktop/src/index.css                 # @theme tokens, .dark
apps/desktop/src/app/{App,providers}.tsx
apps/desktop/src/components/common/{Avatar,PriorityFlag,DueChip,SessionDot}.tsx
apps/desktop/src/lib/members.ts (+ members.test.ts)
apps/desktop/src/views/dev/Gallery.tsx      # #/dev/gallery, dev builds only
```

**Test scenarios:**

- `members.hue(id)` is stable and in 0–359.
- Every token pair in the gallery meets WCAG AA in both themes. Check with the browser devtools
  contrast readout.

**Verification:** run `pnpm -C apps/desktop test` and `pnpm -C apps/desktop build`. Then use the
harness:

- `browser_navigate http://localhost:5173/#/dev/gallery`.
- `browser_snapshot` shows the four priority swatches and a human avatar and an agent avatar.
- Toggle the theme and snapshot again.

---

### desktop-app/8 — Transport, query layer, undo stack

**Goal:** Build the parts of the app's data layer:

- `transport.ts` per tech.md: `{ value, undo }`, envelope errors, token handling, SSE
  `vault-changed` with reconnect;
- `lib/api/*` with the tech.md argument names, replacing the spike's `host_*_set_body`,
  `{path}` restore and `{id}` task delete;
- query keys and the invalidation map;
- `useVaultEvents()`;
- the undo stack wired to sonner toasts (6 s, 10 s for deletions) and ⌘Z.

**Requirements:** R24, R25, R31

**Dependencies:** desktop-app/5

**Files:**

```
apps/desktop/src/lib/{transport,keys,live,undo}.ts (+ tests)
apps/desktop/src/lib/api/{tasks,notes,memories,scratch,host,search,util}.ts
apps/desktop/src/lib/types.ts
```

**Test scenarios:**

- The invalidation map: a `tasks` event invalidates `tasks`, `host/projects`, `host/members`,
  `host/dashboard`, `activity` and `search`, and never `memories`.
- `config: true` invalidates everything.
- The undo stack caps at 50 and pops on success.
- A `conflict` on undo keeps the entry and surfaces the holder.
- `call` returns `value` from `{ value, list }` (delivered contract; lists are bare arrays).
- Every `lib/api/*` function's `{ tool, args }` matches an entry in
  `crates/shards-host/tests/fixtures/api_calls.json`; a new or renamed argument fails until the
  fixture is updated, and the fixture then runs through `api_contract` (desktop-app/3).

**Verification:** `pnpm -C apps/desktop test`; `cargo test -p shards-host --test api_contract`. Then use the harness: open `#/today`, run
`shards task new "From agent"` as claude, and `browser_snapshot` shows that row within 2 s with no
reload.

---

### desktop-app/9 — Shell: sidebar, routing, keyboard core

**Goal:** Build the parts of the three-region shell:

- the three-region layout;
- the sidebar in the root order, with counts from the active set, projects with colour dots,
  labels and the live indicator;
- the `[` collapse;
- hash routes for every view;
- the sheet slot driven by search params;
- the global keys `q`, ⌘K, `/`, `g i/t/u/a`, `?` and ⌘Z;
- the five view states: loading, empty, filtered, space-off and error.

**Requirements:** R1, R27, R28

**Dependencies:** desktop-app/7, desktop-app/8

**Files:**

```
apps/desktop/src/app/router.tsx
apps/desktop/src/components/shell/{Sidebar,Header,Sheet,ViewState,Shortcuts}.tsx
```

**Test scenarios:**

- Every sidebar entry routes.
- `g t` goes to Today.
- The collapse persists across a reload.
- Turning the memories space off in the config shows "Memories are turned off in this vault".

**Verification:** use the harness.

- `browser_navigate #/inbox`, then `browser_press_key g`, then `t`.
- `browser_snapshot` shows the heading "Today".
- With `memories = false` in the demo config, `browser_navigate #/memories` and the snapshot
  contains "turned off".

---

### desktop-app/10 — Task list views and task row

**Goal:** Build these views as projections of the active set:

- Inbox, Today (Overdue + Today, with "Reschedule to today"), Upcoming (7 day headers, week
  stepper, add per day, drop onto a day), project list layout and label view;
- project list layout: sections from `host_projects`, collapsible, reorder by drag and
  `⌥↑/↓` with midpoint `order`, add, rename and reorder sections, subtasks nested, "Show
  completed";
- the task row from design.md;
- completion with undo, including the recurring toast with `next_due`.

**Requirements:** R2, R3, R4, R5, R7, R9

**Dependencies:** desktop-app/9

**Files:**

```
apps/desktop/src/views/{inbox,today,upcoming,project,label}/
apps/desktop/src/components/task/{TaskRow,TaskCheckbox,TaskList,SectionHeader,AddTaskRow}.tsx
apps/desktop/src/lib/{dates,order}.ts (+ tests)
```

**Test scenarios:**

- The date buckets match the core at the day boundary and across the DST change (vitest).
- The midpoint and the renumber trigger work (vitest).
- Ticking a task shows "Completed · Undo". Undo returns it to its place.
- Ticking the recurring seed task names next week's date.
- An empty section survives a reload.

**Verification:** run `pnpm -C apps/desktop test`. Then use the harness:

- `#/today`: the snapshot shows "Overdue" with 3 rows and "Today" with 4 rows. Click
  "Reschedule to today". The snapshot shows no "Overdue". Press ⌘Z and the snapshot shows 3
  overdue rows again.
- `#/upcoming`: the snapshot shows 7 day headers.
- `#/project/<Shards launch id>`: drag the third row above the first. `shards task list
  --project <id> --json` shows the new `order`.

---

### desktop-app/11 — Quick add

**Goal:** Build the parser per tech.md § Quick-add parser, with the fixture corpus, and the
dialog from design.md:

- inline token chips;
- a plain-language summary;
- completion lists for `# / @ +`;
- disable a token by click or Backspace;
- Enter adds and keeps the dialog open, ⇧Enter adds and closes;
- context defaults.

**Requirements:** R13

**Dependencies:** desktop-app/10

**Files:**

```
apps/desktop/src/lib/quickadd/{parse,grammar}.ts + parse.test.ts + corpus.json (≥ 60 phrases)
apps/desktop/src/lib/recur.ts (+ recur.test.ts)
apps/desktop/src/components/shell/QuickAdd.tsx
```

**Test scenarios:**

- The corpus passes at ≥ 95%, and the test prints the failures.
- "Read May report" keeps "May" in the title.
- `#Hmoe` stays in the title with a warning.
- `10/12` is a date, not a section.
- `every! 3 days` → `FREQ=DAILY;INTERVAL=3` with `recur_from: completion`.
- A parse benchmark stays under 2 ms.

**Verification:** run `pnpm -C apps/desktop test -- quickadd`, which prints the corpus pass
rate. Then use the harness:

- `browser_press_key q` and `browser_type "Renew passport #Home /Errands @admin p2 +claude next fri {oct 31}"`.
- `browser_snapshot` shows the summary line "Home › Errands · @admin · High · claude".
- Press Enter. `shards task list --json` contains the task with `section: Errands`,
  `priority: high`, `owner: claude` and `deadline` set to 31 Oct.

---

### desktop-app/12 — Task detail sheet

**Goal:** Build the sheet from design.md:

- the property popovers (assignee, worker, due, deadline, repeat presets, priority, labels,
  project and section);
- the Markdown description with autosave and `expected_body_sha256`;
- the conflict banner;
- subtasks with an inline add;
- blocked by and blocking, with a picker and core `ready`;
- the activity timeline from `activity()`;
- the comment box;
- other fields, read-only;
- the path with Reveal.

**Requirements:** R10, R11, R12, R26

**Dependencies:** desktop-app/10

**Files:**

```
apps/desktop/src/components/task/{TaskSheet,PropertyRow,RepeatPicker,BlockerPicker,Activity,Comment}.tsx
apps/desktop/src/components/common/MarkdownEditor.tsx (lazy)
apps/desktop/src/lib/activity.ts (+ activity.test.ts)
```

**Test scenarios:**

- `activity()` parses stamped comments, outcomes and cancellations from fixtures.
- Editing the description saves after 1 s.
- An agent body write during an edit shows the banner, keeps the local text and writes nothing.
- Adding a blocker shows "Blocked by 1", and `shards task next --json` as claude does not return
  the task.

**Verification:** run `pnpm -C apps/desktop test`. Then use the harness:

- Open `?task=<Ship release id>`. The snapshot shows "Blocked by" and "Activity".
- Type in the description. While typing, run `shards task append <id> "agent note"` as claude.
  The snapshot shows "Changed on disk".
- Click Reload and the snapshot shows "agent note".

---

### desktop-app/13 — Project board

**Goal:** Build the board layout per design.md:

- a list/board toggle per project, remembered;
- group by section or by status;
- dnd-kit drags between columns, with drop on a card meaning "insert before";
- collapsible column strips;
- the confirm popover when taking work back from an agent;
- keyboard equivalents for every drag.

**Requirements:** R6

**Dependencies:** desktop-app/12

**Files:**

```
apps/desktop/src/views/project/{Board,BoardColumn,BoardCard}.tsx
```

**Test scenarios:**

- Dragging between sections writes `section` and `order`.
- The status drags map to claim, release, finish and reopen.
- Dropping an agent-held card on To do confirms first.
- A collapsed column persists.

**Verification:** use the harness.

- On `#/project/<id>` press `b`. The snapshot shows the columns "Next", "Waiting" and "Later".
- Drag "Record demo" into Waiting. `shards task get <id> --json | jq .section` prints
  `"Waiting"`.
- Group by status. Drag claude's card to To do. The snapshot shows "Take back from claude?".

---

### desktop-app/14 — Agents, delegation, session state

**Goal:** Build these parts of the agent layer:

- `session()` and its row dot and sheet label;
- the member picker grouped Humans and Agents;
- Delegate to…, Take back and Start myself;
- Answer & resume;
- the Agents card grid with liveness, held tasks, stale claims, counts and recent activity;
- the agent page tabs;
- the unregistered badge and the empty state.

**Requirements:** R15, R16, R17

**Dependencies:** desktop-app/12, desktop-app/24

**Files:**

```
apps/desktop/src/lib/session.ts (+ session.test.ts)
apps/desktop/src/views/agents/{AgentsGrid,AgentCard,AgentPage}.tsx
apps/desktop/src/components/common/MemberPicker.tsx
```

**Test scenarios:**

- The `session()` table covers all five states and their precedence.
- Delegating keeps the operator as owner and sets `claimed_by`.
- Answering clears `needs-input`.
- An agent write within 30 min shows Live.

**Verification:** run `pnpm -C apps/desktop test`. Then use the harness:

- `#/agents`: the snapshot shows the cards "claude" and "codex" and the text "Needs input".
- Open claude's needs-input task, type an answer and click "Answer & resume". The snapshot shows
  "Working".
- `shards task get <id> --json | jq .tags` lacks `needs-input`.

---

### desktop-app/15 — Memories manager and recall playground

**Goal:** Build these parts:

- the memories table with facets, the hidden-count line, bulk select, bulk importance and kind,
  and bulk forget behind one confirm;
- the memory sheet: field edits, body edit through `host_memory_set_body` (alias `host_memory_update_body`), Extend, Never
  expire, Correct this with the chain stepper, forget with undo, and the eligibility chip;
- the recall playground with "recall as", the score breakdown and the session-start preview on an
  empty query.

**Requirements:** R18, R19, R20

**Dependencies:** desktop-app/9

**Files:**

```
apps/desktop/src/views/memories/{MemoryTable,Facets,MemorySheet,ChainStepper,BulkBar}.tsx
apps/desktop/src/views/recall/Playground.tsx
apps/desktop/src/lib/recall.ts (+ recall.test.ts)   # score breakdown math
```

**Test scenarios:**

- The breakdown reproduces the core formula: match × (0.6 + 0.1·imp) × (0.35 + 0.65·0.5^(age_days ÷ 90)).
- Filtering owner to codex shows the private row with a lock.
- Forget, then Undo, restores the file byte for byte.
- Correct this marks the predecessor superseded.

**Verification:** run `pnpm -C apps/desktop test`. Then use the harness:

- On `#/memories`, filter Owner to codex. The snapshot shows the lock row.
- Forget a memory and click Undo. `shards memory get <id>` succeeds.
- On `#/memories/recall`, recall as codex for "release". The snapshot shows "match" and "rec".

---

### desktop-app/16 — Scratchpads

**Goal:** Build the scratchpad parts:

- the agent-column board with liveness and checklist progress;
- the sheet, which defaults to Append when the pad is live and offers Edit through
  `host_scratch_update_body`;
- Clear with undo and Clear stale;
- Promote to memory, note or tasks.

**Requirements:** R21

**Dependencies:** desktop-app/9

**Files:**

```
apps/desktop/src/views/scratch/{ScratchBoard,ScratchSheet,Checklist}.tsx
```

**Test scenarios:**

- Checklist progress parses `- [ ]` and `- [x]`.
- A live pad opens in Append mode with the warning.
- Promote to memory creates a memory whose `source` names the pad.

**Verification:** use the harness.

- `#/scratch`: the snapshot shows "claude" with "3/7".
- Clear `codex/notes` and click Undo. `shards scratch get notes --agent codex` succeeds.

---

### desktop-app/17 — Notes browser

**Goal:** Build these parts:

- type groups and "Other files";
- the reader with working wikilinks and backlinks;
- an editor for title, tags, type and body through `host_note_update_body`;
- New note and delete with undo;
- Adopt for foreign files.

**Requirements:** R22

**Dependencies:** desktop-app/12

**Files:**

```
apps/desktop/src/views/notes/{NotesList,NoteSheet,Wikilink}.tsx
```

**Test scenarios:**

- A wikilink click opens the target note.
- A dangling link renders muted.
- A foreign file is read-only, and Adopt adds an id while the body stays byte-identical.

**Verification:** use the harness.

- On `#/notes`, open "Release plan" and click its wikilink. The snapshot shows the target title.
- Open the foreign file. The snapshot shows "Adopt".

---

### desktop-app/18 — Search and command palette

**Goal:** Build these parts:

- Search grouped by space, with an optional scratch toggle, keyboard traversal and a
  create-from-query empty state;
- the ⌘K palette with Navigate, Create, On selection (with sub-pages), Agents & memory and Items,
  each entry showing its shortcut.

**Requirements:** R8, R14

**Dependencies:** desktop-app/14, desktop-app/15

**Files:**

```
apps/desktop/src/views/search/Search.tsx
apps/desktop/src/components/shell/CommandPalette.tsx
```

**Test scenarios:**

- "passport" returns three groups.
- "zeppelin" offers creation.
- Palette › Delegate to… › claude delegates the selected task.

**Verification:** use the harness.

- `#/search`: type "passport". The snapshot shows "Tasks", "Notes" and "Memories".
- Select a task, press ⌘K and type "deleg". The snapshot shows "Delegate to…".

---

### desktop-app/19 — Settings and first run

**Goal:** Build these parts:

- Settings: the vault through the dialog (native) and `host_config_set`, identity, the members
  list (read-only) with "Edit in config file", theme, and About from `host_status`;
- the browser-mode read-only vault;
- the first-run screen when `config_missing`.

**Requirements:** R23

**Dependencies:** desktop-app/9

**Files:**

```
apps/desktop/src/views/settings/Settings.tsx
apps/desktop/src/views/first-run/FirstRun.tsx
```

**Test scenarios:**

- No config shows the first-run screen. Submitting creates the config and shows an empty Inbox.
- With `--vault`, Settings shows "Set by the host process".

**Verification:** start the harness with `SHARDS_CONFIG_PATH=$D/none.toml` (absent).

- `browser_snapshot` shows "Welcome to Shards".
- Type a folder and a name, then click Start. The snapshot shows "Inbox".
- `$D/none.toml` now exists with `[core] me`.

---

### desktop-app/20 — Live refresh integration

**Goal:** Wire refresh end to end:

- event → invalidation → change flash, excluding own writes;
- refetch on focus;
- invalidate everything on reconnect;
- connection status in the footer;
- no list reorder under the pointer.

**Requirements:** R24

**Dependencies:** desktop-app/10, desktop-app/14

**Files:**

```
apps/desktop/src/lib/live.ts
apps/desktop/src/components/task/TaskList.tsx   # flash + deferred reorder
```

**Test scenarios:**

- An agent claim flips the row within 1 s and flashes it.
- The operator's own write does not flash.
- Killing and restarting `shards-host` shows offline, then live, followed by a full refresh.

**Verification:** use the harness.

- On `#/today`, run 50 scripted `shards task update` writes as claude while timing in the
  console (`performance.now` from event to render).
- p95 ≤ 500 ms. Record the numbers in the PR.

---

### desktop-app/21 — Polish: keyboard map, states, accessibility, budgets

**Goal:** Finish the cross-cutting work:

- the complete root keyboard map and the `?` shortcut sheet;
- every view's empty, filtered, space-off and error states with copy from design.md;
- visible focus;
- WCAG AA contrast in both themes;
- list virtualisation (≤ 80 rows mounted);
- a lazy Markdown editor;
- the bundle at ≤ 400 KB gzip;
- the host timing budgets on the 5k fixture.

**Requirements:** R1, R27, R28

**Dependencies:** desktop-app/11 – desktop-app/20, desktop-app/25 – desktop-app/30

**Files:**

```
apps/desktop/src/components/shell/Shortcuts.tsx
crates/shards-host/tests/timing.rs
```

**Test scenarios:**

- The `?` sheet lists every key in the root map.
- The Inbox triage scenario from R27 runs without a pointer.
- `Host::call` p95 stays within the budgets on `--scale 3500`.

**Verification:** `cargo test -p shards-host --release --test timing`; `pnpm -C apps/desktop
build` (size report); harness keyboard-only run of R27's scenario with `browser_press_key` only.

---

### desktop-app/22 — Acceptance run

**Goal:** Prove the feature against a task-model-v2-`DONE` core. That means:

- every product scenario in both modes;
- the success metrics measured;
- the data-fidelity check;
- the root plan row moved to `DONE` through the spec skill.

**Requirements:** R1–R40

**Dependencies:** desktop-app/21, desktop-app/23, desktop-app/24, desktop-app/25–31

**Files:**

```
.spec/features/desktop-app/plan.md   # Progress
```

**Test scenarios:**

- Every `#### Scenario` in product.md runs once in browser mode and once in `tauri dev`.
- A data-fidelity diff of the demo vault before and after the run: only the intended keys and
  bodies changed, and unknown keys are byte-identical.

**Verification:** `cargo test -p shards && cargo test -p shards-host && pnpm -C apps/desktop
test`, and the CI run of desktop-app/23 is green. Also run the scenario checklist (pass/fail per scenario per mode) and the metrics table
(quick-add corpus %, live p95, launch time, 5k scroll), all attached to the acceptance commit.

**Parity evidence steps.** Each step is the evidence for one MVP row of the parity matrix
([product-roadmap.md](../../product-roadmap.md) § Todoist parity matrix). A row reads "have" only
when its step passes in browser mode and in `tauri dev` against a 15-DONE core. The step runs the
named scenarios on the demo vault and records pass or fail per mode; root
[plan.md](../../plan.md) § Now exit review lists the same steps.

| Step | Matrix row | Passes when |
|---|---|---|
| P1 | Quick add with parsing | `parse.test.ts` holds ≥ 60 phrases at ≥ 95 %; R13 scenarios pass |
| P2 | Inbox | R2 scenarios pass |
| P3 | Today, including overdue | `model.test.ts` green; R3 scenarios pass |
| P4 | Upcoming | `dates.test.ts` green; R4 scenarios pass |
| P5 | Project create, rename, colour and order | `project-actions.test.ts` green; R35 create, rename and reorder scenarios pass |
| P6 | Archive and delete a project | R35 archive, delete and undo scenarios pass |
| P7 | Sections | task-model-v2 R10 tests green; R5 "Empty section persists" passes |
| P8 | Subtasks | task-model-v2 R9 tests green; R11 subtask flow passes |
| P9 | Labels | R7 scenario passes |
| P10 | Four priorities | task-model-v2 R1 tests green; R27 "Triage without a mouse" sets urgent |
| P11 | Due date with optional time | task-model-v2 R2 tests green; a timed due shows on the row |
| P12 | Deadline | task-model-v2 R3 tests green; the deadline chip shows and Today lists a deadline-today task |
| P13 | Recurrence | task-model-v2 R4, R5 tests green; R9 "Recurring completion" and R10 "Set recurrence" pass |
| P14 | Due-date filters | `shards task list --overdue`, `--due-before`, `--due-after` on the demo vault match Today's Overdue group |
| P15 | List and board layouts | R5 and R6 scenarios pass |
| P16 | Manual reorder by drag | R5 "Reorder within a section" passes, and `shards task list --project <id> --json` shows the new `order` |
| P17 | Markdown task description | R10 "Edit description" passes with unknown keys byte-identical |
| P18 | Completed log with Reopen | R34 scenarios pass |
| P19 | Search | R8 scenarios pass |
| P20 | Command palette, keyboard-first | R14 "Act on the selection" and R27 pass with `browser_press_key` only |
| P21 | Multi-select and bulk actions | R36 scenarios pass |
| P22 | Duplicate task | R14 "Duplicate a task" passes |
| P23 | Undo and recovery after quit | `host_tools.rs` trash tests green; R25 scenarios pass, "Recover after quit" in `tauri dev` |
| P24 | Light and dark themes | every view renders in both themes with AA contrast (desktop-app/21) |
| P25 | In-window reminders | R40 scenarios pass in `tauri dev`; "Reminder fires" also passes in browser mode with permission granted |
| P26 | Locale | `dates.test.ts` covers Sunday and Monday week starts and 12/24 h; R38 scenarios pass |
| P27 | Accessibility | the axe-core CI check is green; R37 scenarios pass with VoiceOver; a 200 % zoom pass clips nothing |
| P28 | Dependencies | `task_dep_cli.rs` green; R11 blocker scenarios pass |
| P29 | Assignee, delegate, session state, Waiting on me | `agent-utils.test.ts` green; R16 and R39 scenarios pass |
| P30 | Per-task activity with actor | R12 scenario passes; every row in Activity shows an actor (task-model-v2 R19 stamps) |
| P31 | Memory and scratch managers | R18–R21 scenarios pass |

---

### desktop-app/23 — CI for the host, the shell and the app

**Goal:** Make CI check the new crates and the frontend. Today `cargo clippy --all-targets
--locked` and `cargo test --locked` cover only `default-members = ["."]`, so none of the
desktop-app code is checked.

**Requirements:** R24, R25, R31 (guards the units that deliver them)

**Dependencies:** desktop-app/3, desktop-app/6, desktop-app/8

**Files:**

```
.github/workflows/ci.yml
```

**Test scenarios:**

- A `host` job (ubuntu, macOS) runs `cargo clippy -p shards-host --all-targets --locked -- -D
  warnings` and `cargo test -p shards-host --locked`.
- The `frontend` and `desktop` jobs set up Node 24 (`actions/setup-node`) and pnpm 12
  (`pnpm/action-setup`), the versions that produced `apps/desktop/pnpm-lock.yaml`, each pinned
  to an exact version in the workflow.
- A `frontend` job runs `pnpm -C apps/desktop install --frozen-lockfile`, then `pnpm -C
  apps/desktop lint`, `pnpm -C apps/desktop test` and `pnpm -C apps/desktop build`.
- A `desktop` job (macOS) runs `pnpm -C apps/desktop install --frozen-lockfile && pnpm -C
  apps/desktop build` first, because Tauri's `generate_context!` fails at compile time when
  `frontendDist` (`../dist`) does not exist. Then it runs `cargo check -p shards-desktop
  --locked`.
- The core dependency guard fails the build when the core links an async or UI crate:
  `! cargo tree -p shards -e normal --prefix none | grep -E '^(tokio|axum|tauri) '`.
- A deliberate clippy warning in `crates/shards-host` fails the PR run.

**Verification:** the CI run on the PR is green, and every new job appears in the run summary.

---

### desktop-app/24 — Agent signalling contract

**Goal:** Tell agents how to raise Needs input and Error (seam S7). Add the contract to the MCP
instructions block and to `plugins/shards/skills/shards/SKILL.md`, and pin it in
`tests/bundle.rs`. No tool, schema or argument changes.

**Requirements:** R16, R33

**Dependencies:** desktop-app/1

**Files:**

```
src/mcp/instructions.rs                 # contract lines, within the 2048-byte budget
plugins/shards/skills/shards/SKILL.md   # "Asking for input and reporting errors" section
tests/bundle.rs                         # pins the text
```

**Test scenarios:**

- SKILL.md names `needs-input`, `agent-error`, `shards_task_append` and `shards_task_update`
  in the contract section.
- The instructions block for a default config contains both labels and stays ≤ 2048 bytes.
- The MCP table is still 40 names.
- Given the demo vault, an agent run that follows the skill and hits a missing credential leaves
  the task tagged `needs-input` with a stamped question, and `session()` returns `needs_input`.

**Verification:** `cargo test -p shards --test bundle`; `cargo test -p shards
mcp::instructions`; then, on the harness, run as claude `shards task append <id> "Which API key?"
--timestamp` and `shards task update <id> --tags +needs-input`. `browser_snapshot` of `#/agents`
shows "Needs input", and the task's Activity shows the question under claude.

---

### desktop-app/25 — Completed log

**Goal:** Add the Completed view (R34): sidebar entry and ⌘K "Go to Completed", 30-day window
across all projects, day groups, actor avatar, Reopen on done rows, recurring rows once with
their next date.

**Requirements:** R1, R34

**Dependencies:** desktop-app/10, desktop-app/14

**Files:**

```
apps/desktop/src/views/tasks/CompletedView.tsx
apps/desktop/src/components/task/model.ts        # completedLog(doneList, activeSet, now) (+ test)
apps/desktop/src/app/{Sidebar,CommandPalette,routes}.tsx
```

**Test scenarios:**

- `completedLog` keeps day 30 and drops day 31 at the local day boundary (vitest).
- A recurring open task with `completed` yesterday appears once, with no Reopen.
- Reopen clears `completed` and the row leaves the log.

**Verification:** `pnpm -C apps/desktop test`; harness: complete a seed task as claude with
`shards task finish`, open `#/completed`, `browser_snapshot` shows it under today with claude's
avatar; click Reopen; `shards task get <id> --json` shows `status: open` and no `completed`.

---

### desktop-app/26 — Project management

**Goal:** Finish R35 on top of the delivered create, rename, colour, archive and delete:

- the palette "New project" entry;
- drag to reorder the sidebar, stored as `order` on the project note (`host_project_update`
  accepts `order`, S5);
- exclude archived projects' tasks from Today, Upcoming, Waiting on me and label views;
- the "Archived projects" list with Unarchive;
- one undo for a delete that moved tasks to the Inbox.

**Requirements:** R35

**Dependencies:** desktop-app/13

**Files:**

```
crates/shards-host/src/tools.rs                  # host_project_update: order (number)
crates/shards-host/tests/host_tools.rs
apps/desktop/src/components/task/{project-actions,ProjectMenu,AddProjectDialog}.ts(x)
apps/desktop/src/app/{Sidebar,CommandPalette}.tsx
apps/desktop/src/components/task/model.ts        # archived filter in the projections (+ test)
```

**Test scenarios:**

- `host_project_update { order }` writes a number and rejects a non-number.
- An archived project's task due today is absent from the Today projection (vitest).
- Every R35 scenario.

**Verification:** `cargo test -p shards-host`; `pnpm -C apps/desktop test`; harness: archive the
seed project that holds a due-today task, `browser_snapshot` of `#/today` lacks it; drag a
project in the sidebar, reload, the order holds.

---

### desktop-app/27 — Multi-select and bulk actions

**Goal:** Selection in every task list (`x` or ⌘-click, Shift-click, Shift+↓/↑, Esc) and the
bulk bar (complete, move, priority, due, labels, delete) with one undo per batch and a count
confirm for bulk delete. Move the delivered `x` binding from complete to select, matching the
root keyboard map.

**Requirements:** R36, R27

**Dependencies:** desktop-app/10, desktop-app/31

**Files:**

```
apps/desktop/src/components/task/{TaskList,BulkBar}.tsx
apps/desktop/src/components/task/bulk.ts          # batch runner + inverse list (+ test)
apps/desktop/src/lib/hotkeys.ts
```

**Test scenarios:**

- A batch of 5 with one failure applies 4 and its undo holds 4 inverses (vitest).
- Bulk delete of 2+ opens the confirm with the count; Esc cancels and nothing is written.
- `x` toggles selection and `e` still completes.

**Verification:** `pnpm -C apps/desktop test`; harness: select 4 Inbox rows, set due tomorrow,
`shards task list --json` shows 4 due tomorrow; ⌘Z restores all 4.

---

### desktop-app/28 — Accessibility and locale

**Goal:** R37 and R38: accessible names on every control, VoiceOver flows for complete,
reschedule and open, 200 % zoom without clipping, an axe-core check in CI; week start, 12/24 h
and date order from the system locale with Settings overrides, applied to chips, pickers,
Upcoming and numeric quick-add dates.

**Requirements:** R37, R38

**Dependencies:** desktop-app/19, desktop-app/23

**Files:**

```
apps/desktop/src/lib/locale.ts                    # defaults from Intl + overrides (+ test)
apps/desktop/src/lib/{dates,quickadd/parse}.ts    # weekStartsOn, hourCycle, date order
apps/desktop/src/views/settings/SettingsView.tsx
apps/desktop/src/a11y.test.tsx                    # vitest-axe over every view
.github/workflows/ci.yml                          # the frontend job runs it (pnpm test)
```

**Test scenarios:**

- `en-US` defaults to Sunday and 12 h; `de-DE` to Monday and 24 h; an override wins (vitest).
- "3/4" parses to 4 March under day-first and 3 April under month-first.
- `a11y.test.tsx` reports zero serious or critical violations.

**Verification:** `pnpm -C apps/desktop test`; a manual VoiceOver run of R37's scenario in
`tauri dev`, recorded in the PR; browser zoom 200 % on Today, the detail pane and Settings.

---

### desktop-app/29 — Waiting on me

**Goal:** The "Waiting on me" sidebar entry with count and its view (R39): Needs input and Error
tasks plus tasks blocked by the operator's open tasks, ordered by wait age, with inline "Answer
& resume".

**Requirements:** R39, R16

**Dependencies:** desktop-app/14, desktop-app/24

**Files:**

```
apps/desktop/src/lib/status.ts                    # waitingOnMe() (+ test)
apps/desktop/src/views/tasks/WaitingView.tsx
apps/desktop/src/app/Sidebar.tsx
```

**Test scenarios:**

- `waitingOnMe` lists a `needs-input` task, an `agent-error` task and a task blocked by an
  operator-owned open task once each, oldest wait first (vitest).
- The wait start ignores the operator's own stamps.
- "Answer & resume" appends one comment and removes the label in one action.

**Verification:** `pnpm -C apps/desktop test`; harness: as claude run `shards task append <id>
"Which vault?" --timestamp` and `shards task update <id> --tags +needs-input`; `#/waiting` lists
it; answer inline; `shards task get <id> --json` shows the comment and no `needs-input`.

---

### desktop-app/30 — Reminders while the app is open

**Goal:** R40: a scheduler over the active set that raises a system notification within 60 s
of each open timed task's due time while the window is open; click opens the task; permission
prompt on the first timed task, toast fallback when denied.

**Requirements:** R40

**Dependencies:** desktop-app/6, desktop-app/20

**Files:**

```
apps/desktop/src-tauri/{Cargo.toml,src/lib.rs,capabilities/default.json}   # tauri-plugin-notification, minor pinned with the other plugins (Global Constraints)
apps/desktop/src/lib/reminders.ts                 # due-in-window scheduler (+ test)
apps/desktop/src/app/AppShell.tsx
```

**Test scenarios:**

- With a fake clock, a task due 10:00 fires once in the tick that crosses 10:00 and never again
  for the same `id + due` (vitest).
- A task completed or rescheduled before its time does not fire.
- A recurring task fires again at its next occurrence.
- Times before launch never fire.

**Verification:** `pnpm -C apps/desktop test`; `tauri dev` on the demo vault: create a task due
in 2 minutes, background the window, a notification appears within 60 s of the time; choose it
and the task opens.

---

### desktop-app/31 — Delete to the OS Trash

**Goal:** D6 as amended on 2026-10-16: the four host delete tools move the file to the OS Trash
(`trash` crate, Finder method on macOS) after reading its bytes; a failed move refuses the delete
and leaves the file. Core and CLI deletes stay hard.

**Requirements:** R25, R30

**Dependencies:** desktop-app/3

**Files:**

```
crates/shards-host/Cargo.toml                     # trash
crates/shards-host/src/tools.rs                   # delete, forget, clear → move to Trash
crates/shards-host/tests/host_tools.rs
```

**Test scenarios:**

- Each of `host_task_delete`, `host_note_delete`, `host_memory_forget`, `host_scratch_clear`
  removes the file from the vault and returns `{id, path, content}`.
- A forced trash failure (a test seam) returns an error and the file is still in place.
- `host_restore` after a trash delete still recreates the exact bytes.
- Undo, then a restore of the same file from the Trash, leaves two files with one id; the next
  `host_status` or list reports the duplicate id instead of hiding one.
- `cargo tree -p shards` still links no `trash` (core unchanged).

**Verification:** `cargo test -p shards-host`; on macOS, delete a demo task from the app, quit,
find the file in the Trash and put it back; `shards task get <id>` finds it.

---

### desktop-app/32 — Read-only notes browser over every Markdown file

**Goal:** Replace the desktop-app/17 note editor (owner decision 2026-10-16: Shards is
task-first). The Notes view lists every Markdown file in the notes space through
`host_notes_browse`, filters by text, folder and tag, and reads one file through `host_note_read`
with wikilinks. Remove New note, edit, tag edit, Adopt and delete from the app.

**Requirements:** R22

**Dependencies:** desktop-app/17

**Files:**

```
src/domain/notes.rs                               # BrowseEntry, browse(), read_path()
crates/shards-host/src/tools.rs                   # host_notes_browse, host_note_read, status.obsidian_vault
crates/shards-host/tests/host_tools.rs
apps/desktop/src/lib/api/notes.ts, lib/types.ts, lib/hooks.ts
apps/desktop/src/views/notes/NotesView.tsx        # rewritten read-only
apps/desktop/src/components/note/*                # editor parts removed
```

**Test scenarios:**

- `host_notes_browse` lists a Shards note and a foreign file, newest first, and skips the nested
  tasks space and dot folders.
- `host_note_read` returns the body without frontmatter; a path outside the walk (`../x.md`,
  a task file, a dot folder) is `not_found`.
- `host_status.obsidian_vault` is the vault when it holds `.obsidian/`, a parent when the parent
  does, else `null`.
- The Notes view shows no edit, tag, adopt, delete or New note control.

**Verification:** `cargo test -p shards-host`; browser mode on the demo vault plus a foreign file:
the list shows both, a wikilink opens its target. Against the owner's vault the count equals
`shards status` notes + foreign markdown, minus files under `node_modules`.

---

### desktop-app/33 — Open in the operator's Markdown editor

**Goal:** "Open in" on every task and notes-browser file: Obsidian when detected, else the default
app; Show in Finder and Copy path in the menu; `⌘⇧O`; a Settings choice of default target. The
desktop app opens through the `shards_open` command, browser mode through an `obsidian://` link.

**Requirements:** R41

**Dependencies:** desktop-app/32

**Files:**

```
apps/desktop/src-tauri/{build.rs,src/lib.rs,capabilities/default.json}   # shards_open + allow-shards-open
apps/desktop/src/lib/open.ts (+ open.test.ts)     # obsidian URL, target preference, open()
apps/desktop/src/components/shared/OpenIn.tsx     # split button + menu items
apps/desktop/src/components/task/TaskDetail.tsx, task context menu, views/settings
```

**Test scenarios:**

- `obsidianUrl("/a b/ä.md")` is `obsidian://open?path=%2Fa%20b%2F%C3%A4.md`.
- `shards_open` refuses a path outside the space roots and a directory.
- With no Obsidian vault the menu has no Obsidian entry and the default is the default app.

**Verification:** `pnpm -C apps/desktop test`; in the `.app` on the owner's vault, "Open in
Obsidian" on a task opens that file in Obsidian.

---

### desktop-app/34 — UI contract file

Units 34–41 were added and approved by the owner on 2026-10-16.

**Goal:** Pin the names every parallel track shares before fan-out: navigation list, view-option
types and storage keys, tree node shape, preference keys (tech.md § Planned).

**Requirements:** R1, R42, R43, R44

**Dependencies:** —

**Files:**

```
apps/desktop/src/lib/ui-contract.ts               # types + NAV + key helpers; no React
apps/desktop/src/lib/ui-contract.test.ts          # NAV order, unique ids and chords, key format
```

**Test scenarios:**

- `NAV_SECTIONS` lists Tasks (Inbox, Today, Upcoming; Waiting on me and Completed join when
  /29 and /25 add their routes), Agent team (Agents, Memories, Scratchpads), Library (Notes);
  every entry is a real route, once; Search and Settings sit outside the sections.
- `viewOptionsKey("project:n-abc")` is `shards.view.project:n-abc`.

**Verification:** `pnpm -C apps/desktop test`; `pnpm -C apps/desktop build`.

---

### desktop-app/35 — Monochrome tokens and animate-ui foundation

**Goal:** Root design.md § Colors and § Motion in code: stock shadcn neutral tokens with the
three AA deviations, semantic text-only colours, neutral identity; install the animate-ui radix
items and wire them behind the existing `components/ui` names; root `MotionConfig`; the
reduced-motion guard test.

**Requirements:** R37 (reduced motion), root design.md

**Dependencies:** desktop-app/34

**Files:**

```
apps/desktop/src/index.css                         # :root/.dark neutral tokens, semantic vars, ring at full opacity
apps/desktop/package.json, pnpm-lock.yaml          # motion, animate-ui deps (exact pins)
apps/desktop/src/components/animate-ui/**          # vendored, patched for reduced motion (or thin wrappers: licence decision)
apps/desktop/src/components/ui/{dialog,sheet,tooltip,dropdown-menu,popover,alert-dialog,switch,toggle-group}.tsx
apps/desktop/src/App.tsx                           # MotionConfig reducedMotion="user"
apps/desktop/src/lib/motion.test.ts                # guard over components/animate-ui/**
apps/desktop/src/lib/color.ts (+ color.test.ts)    # neutral avatar fill, member override kept
AGENTS.md § 3                                      # new frontend deps
```

**Test scenarios:**

- The guard fails on a fixture file that animates `filter` without `useReducedMotion`, and passes
  on the patched files (verify red by removing one patch).
- `avatarFill(member)` is neutral unless `[[members]].color` is set.
- Every kept text token pair meets 4.5:1 and rings 3:1 (pinned from `scripts/contrast.py` values
  in a table test).

**Verification:** `pnpm -C apps/desktop build` (bundle delta ≤ 50 KB gzip, before/after pasted),
`lint`, `test`; browser mode on the demo vault, light and dark screenshots of Today; with macOS
"Reduce motion" on, opening the detail sheet and a dialog shows no blur or flip.

---

### desktop-app/36 — Sidebar sections

**Goal:** R1 as amended: Search, then Tasks / Agent team / Library sections with collapsible,
remembered headers; one nav list drives sidebar, `g` chords and the palette; the sidebar open
state persists across restarts.

**Requirements:** R1

**Dependencies:** desktop-app/34, desktop-app/35

**Files:**

```
apps/desktop/src/app/Sidebar.tsx                   # sections from NAV, animate-ui sidebar + collapsible
apps/desktop/src/app/AppShell.tsx                  # read the sidebar open state; g chords from NAV
apps/desktop/src/app/CommandPalette.tsx            # Navigate group from NAV
apps/desktop/src/lib/nav.ts (+ nav.test.ts)        # counts per item, collapsed-section prefs
```

**Test scenarios:**

- The palette's Navigate group and the `g` chord table equal `NAV` order (one test, three
  consumers).
- A collapsed section stays collapsed after a reload; its items still answer their chords.

**Verification:** `pnpm -C apps/desktop test`; browser mode: collapse Agent team, reload, still
collapsed; `g a` opens Agents; `[` then reload keeps the sidebar closed.

---

### desktop-app/37 — Notes folder and tag trees

**Goal:** R42: Folders and Tags trees beside the Notes list with counts, keyboard navigation and
filtering; the list virtualised.

**Requirements:** R42, R22

**Dependencies:** desktop-app/34, desktop-app/32

**Files:**

```
apps/desktop/src/views/notes/tree.ts (+ tree.test.ts)   # buildFolderTree, buildTagTree, predicate, timing pin
apps/desktop/src/views/notes/NotesTree.tsx              # roving-focus tree, aria-tree semantics
apps/desktop/src/views/notes/NotesView.tsx              # tree column + useVirtualizer list
apps/desktop/src/views/notes/filter.ts (+ filter.test.ts)
apps/desktop/package.json                               # @tanstack/react-virtual
```

**Test scenarios:**

- Tags `project/shards`, `project/shards/ui`, `project` on three files give counts 3 / 2 / 1;
  a file with both `a/b` and `a/c` counts once under `a`.
- Folder + tag + text filters combine with AND.
- 1,000 synthetic rows: both trees build in ≤ 8 ms (min of 10).

**Verification:** `pnpm -C apps/desktop test`; browser mode on the demo vault (keyboard walk:
→ ↓ Enter filters); against the owner vault read-only: the All files count equals the R22 count
and scrolling to the end mounts ≤ 40 rows (`browser_evaluate` row count).

---

### desktop-app/38 — Board columns and label grouping

**Goal:** Deliver the R6 and R7 rows that are specified but not built: collapsible board columns
(48px strip, rotated name, count, remembered per project and mode), a Cancelled status column
collapsed by default with drop-to-cancel, "Move to X" drop zones, and the Label view grouped by
project with Inbox first.

**Requirements:** R6, R7

**Dependencies:** desktop-app/34

**Files:**

```
apps/desktop/src/components/task/TaskBoard.tsx
apps/desktop/src/components/task/model.ts (+ model.test.ts)   # BOARD_STATUSES gains cancelled
apps/desktop/src/views/tasks/LabelView.tsx
```

**Test scenarios:**

- A cancelled task lands in Cancelled, not Done; dropping a card on Cancelled calls
  `shards_task_cancel` and undo reopens it.
- Label grouping orders Inbox first, then projects by sidebar order.

**Verification:** `pnpm -C apps/desktop test`; browser mode on the demo vault: collapse a column,
reload, still collapsed; drag a card to Cancelled and undo.

---

### desktop-app/39 — Display menu: group, sort, density

**Goal:** R43: a Display popover on every task list view with Group by, Sort by and Density,
remembered per view; drops between groups write the group field; non-manual sorts disable
reorder.

**Requirements:** R43

**Dependencies:** desktop-app/34, desktop-app/38

**Files:**

```
apps/desktop/src/lib/view-options.ts (+ view-options.test.ts)   # groupTasks, sortTasks, dropPatch, timing pin
apps/desktop/src/components/task/DisplayMenu.tsx
apps/desktop/src/components/task/{TaskList,TaskRow}.tsx         # group spec from options, compact density
apps/desktop/src/components/task/hooks.ts                       # useViewOptions
apps/desktop/src/views/tasks/*.tsx                              # each view passes its default spec
```

**Test scenarios:**

- Defaults reproduce each view's delivered grouping and order (snapshot of group keys per view).
- `dropPatch("priority","high")` is `{priority: "high"}`; `dropPatch("label", …)` refuses.
- Sorting by due is stable; ties keep manual order.
- 2,000 tasks: group + sort ≤ 8 ms (min of 10).

**Verification:** `pnpm -C apps/desktop test`; browser mode: Group by priority in a demo project,
drag normal → High, undo; sort by due and press `⌥↓`, nothing moves.

---

### desktop-app/40 — Filters and chips

**Goal:** R44: a filter menu and removable chips on every task list view, persisted per view;
the R28 filtered-to-zero state with "Clear filters".

**Requirements:** R44, R28

**Dependencies:** desktop-app/39

**Files:**

```
apps/desktop/src/lib/view-options.ts (+ test)      # filterTasks
apps/desktop/src/components/task/{FilterMenu,FilterChips}.tsx
apps/desktop/src/components/task/TaskList.tsx      # empty state when filtered to zero
```

**Test scenarios:**

- Values within a filter OR, filters AND; `blocked` uses the derived readiness the row already
  shows.
- Stored filters naming a removed label still load and show the chip; removing it clears.

**Verification:** `pnpm -C apps/desktop test`; browser mode: Today filtered by `@admin`, chip,
remove, all rows back; filter to zero shows "Clear filters".

---

### desktop-app/41 — Monochrome sweep

**Goal:** Finish root design.md on every remaining surface: raw `oklch()` in memory badges,
Settings and the logo, `entityColor` avatar fills, `primary` used as an accent, label chip
colours; agents as inverted rounded squares.

**Requirements:** R15, root design.md

**Dependencies:** desktop-app/35, desktop-app/36, desktop-app/37, desktop-app/38, desktop-app/39,
desktop-app/40

**Files:**

```
apps/desktop/src/**                                # files listed by the grep below, outside the other tracks' sets
```

**Test scenarios:**

- `rg -n "oklch\(" apps/desktop/src --glob '!index.css' --glob '!components/animate-ui/**'`
  prints only the project-colour palette in `lib/color.ts`.
- Humans render as circles, agents as rounded squares in every list (existing identity tests).

**Verification:** `pnpm -C apps/desktop build`, `lint`, `test`; browser mode light and dark
screenshots of Today, a project board, Agents, Memories and Notes.

---

## Flint Redesign Implementation Plan

> **For agentic workers:** use superpowers:executing-plans for shared-file implementation;
> delegate independent research and review to code-explorer/code-reviewer. Steps use checkboxes.
> Implementation approved 2026-10-28 with shared React components and token/Tailwind styling.
> No commits without a request.

**Goal:** Replace the current desktop appearance with the supplied Flint design across all
implemented views while retaining existing storage and task semantics.

**Architecture:** Reuse the current React shell, query cache, route/detail stores, task actions,
Radix/animate-ui primitives and Host::call transport. Extend local appearance and Focus state.
Change shared visual primitives before screen-specific layout. Keep all core and host contracts.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind 4, shadcn/Radix, TanStack Query,
existing TanStack Virtual, dnd-kit, cmdk, motion and sonner. Tauri 2.12 remains unchanged.

**Spec:** [R45–R49](product.md#requirement-flint-visual-system-r45),
[Flint screen contract](design.md#flint-migration--desktop-app4247),
[technical contract](tech.md#flint-presentation-slice-desktop-app4247),
[root tokens](../../design.md), [reference](../../../docs/design/shards-flint.html).

### Slice constraints

- Frontend changes only; no new host tool, task field, MCP tool, agent process or durable review state.
- The existing theme key remains `shards-theme`; add only `shards-stone` for appearance.
- Existing modes stay `system | light | dark`; stones are `flint | jade | moonstone | sandstone`.
- Comfortable/compact/Focus task rows are 44px/36px/46px minimum; metadata can grow a row.
- Sidebar is 224px; detail prefers 372px; breakpoints remain 1100px and 768px.
- AA text minimum is 4.5:1; essential non-text/focus minimum is 3:1, across all eight palettes.
- All font/art resources are local. Preserve vendored component and asset licenses.
- Use a throwaway demo vault and explicit config/token paths for browser verification.
- Treat 2026-10-28 baseline as evidence: core 1,477; host 46; frontend 547; frontend lint 25 warnings.
  These are prior counts, not required counts or permission to retain newly introduced defects.
- Existing body conflict, host undo and Trash gaps remain owned by their original units;
  this slice must not claim those gaps are solved or regress current behavior.

### Review focus

1. Missing/corrupt preferences and blocked storage: first paint and runtime agree without crashing.
2. Long titles, ids and metadata at narrow widths/zoom: information and controls remain reachable.
3. Dirty editors and external refresh during mode changes: no remount, silent overwrite or draft loss.
4. Unknown identities and active claims: art fallback works and assignment never starts execution.
5. Menus, dialogs and text input: Focus shortcuts respect focus, native typing and reduced motion.

**Acceptance:** [evidence](../../../docs/design/flint-verification.md). Browser: 30 checks, zero AA
violations and zero zoom findings. Frontend: 730 tests; Rust core: 1,477; host: 46. Native
Tauri window not run; this slice does not close the remaining desktop feature gaps.

### desktop-app/42 — Flint tokens, appearance and local assets

**Requirements:** R45, R47. **Dependencies:** —.

**Files:** modify `apps/desktop/src/index.css`, `src/app/theme.ts` and `src/app/ThemeControls.tsx`, `public/theme-boot.js`,
`src/views/settings/SettingsView.tsx`, `src/lib/contrast.test.ts`, `src/lib/color.test.ts`;
create `src/lib/appearance.ts`, `src/lib/appearance.test.ts`, `src/lib/identity.ts`,
`src/lib/identity.test.ts`, `src/assets/agents/*`, `public/fonts/*` and asset license notices.
All paths in this slice's Files lists are relative to `apps/desktop/` unless repo-qualified.

**Interfaces:** `Stone`, `STONES`, `parseStone(value: unknown): Stone`;
`agentArt(id: string): string | null`; `projectShape(id: string)` returns one of
`diamond | square | ring | triangle`; theme hooks expose stone and `setStone(stone: Stone)`.

- [x] Add failing tests: all four stones round-trip, unknown/empty/non-string storage resolves to
  Flint, the bootstrap script and runtime agree for each saved mode, system changes retain the
  chosen stone, and storage exceptions leave appearance usable. Test actual consumers, not copies.
- [x] Extend contrast assertions to all eight token combinations, foreground/muted/selected/sheet
  pairs, input/focus boundaries and needs-you backgrounds. Demonstrate failures on old tokens.
- [x] Port approved tokens and font roles, add local fonts/art/notices and wire validated stone
  state into first-paint boot, runtime storage events and Settings. Keep existing mode semantics.
- [x] Test known art mapping and unknown fallback; project shapes are deterministic for ASCII and
  Unicode ids across unrelated input ordering. Verify no remote resource is needed offline.
- [x] Run `pnpm -C apps/desktop exec vitest run src/lib/appearance.test.ts src/lib/identity.test.ts
  src/lib/contrast.test.ts src/lib/color.test.ts`, then `pnpm -C apps/desktop build`. Expect pass.

### desktop-app/43 — Tray shell and shared identities

**Requirements:** R45, R47, R49. **Dependencies:** desktop-app/42.

**Files:** `src/app/{AppShell,Sidebar,DetailPane}.tsx`,
`src/components/shared/{Avatar,ProjectDot,ShardsLogo,PageHeader,Kbd,StatusBadge,DueChip,PriorityCheckbox,PriorityFlag}.tsx`,
`src/lib/color.ts`, `src/lib/dates.ts`, `src/lib/priority.ts`,
`src/app/nav-lists.test.ts`, `src/lib/nav.test.ts`, `src/lib/ui-contract.test.ts`.
Also create `src/app/detail-drafts.tsx` and its tests; wire task fields in
`src/components/task/TaskDetail.tsx` and add resize cases to `a11y/run.mjs`.

**Interfaces:** consume appearance/identity from /42; retain `AvatarProps`, `MemberAvatar`,
`ProjectDot({id,color,className})`, route names, query keys and detail renderer interfaces.
`DetailDraftProvider` lives above the adaptive detail branches; `useDetailDraftState<T>(fieldKey,
initial)` returns `[state, setState]`. Preserve the complete editing state and source snapshot,
not only the text. The target-scoped controller owns focus/selection/scroll restoration.

- [x] Update focused consumer tests for the same routes, project/label entries, accessible names,
  identity kinds and state labels. Keep old persisted sidebar/section keys and count semantics.
- [x] Restyle the shell into frame, three trays and rounded main card. Draw the two-facet mark,
  geometric project identities and agent-art avatars with named fallbacks. Retain color metadata.
- [x] Give the wide detail a floating 372px preferred surface inside its reserved column; preserve
  existing overlay focus trapping below 1100px and full-width detail below 768px.
- [x] First add a failing executable resize case: enter unsaved title/description/comment text,
  select a text range, scroll detail and the task list, then resize 1280 → 1000 → 720 → 1280.
  Assert the draft, editing flag, cursor selection, focus and scroll survive and zero saves run.
  Hoist state into the target-scoped controller, suppress layout-induced blur saves, and restore
  interaction state after wrapper mounts. Show a dirty-source warning on external updates.
- [x] Check long project/member names, many labels, overflowing nav, and a keyboard trip from
  sidebar to list to detail and back. Verify no meaningful information disappears.
- [x] Run frontend tests, lint and build. Use Yab on the explicit demo vault to check light/dark
  Today, sidebar persistence, open/close detail and narrow-width navigation. Expect no new errors.

### desktop-app/44 — Task surfaces and Focus mode

**Requirements:** R46, R49. **Dependencies:** desktop-app/43.

**Files:** create `src/app/focus-mode.ts`, `src/app/focus-mode.test.ts`,
`src/app/FocusControls.tsx`; modify `src/app/{AppShell,ShortcutsDialog}.tsx`,
`src/components/task/{TaskRow,TaskList,TaskBoard,SectionedList,TaskView,DisplayMenu,FilterMenu,FilterChips,TaskComposer,ScopeToggle}.tsx`,
`src/views/tasks/*.tsx`, `src/lib/ui-contract.ts`, and the existing selection/view-option tests.

**Interfaces:** `focusModeStore.use(): boolean`, `.set(value: boolean)`, `.toggle()`,
`.useEligible(): boolean`, `.registerView(routeKey: string, allowed: boolean): () => void`;
`canFocus(route: RouteName, board: boolean): boolean`. `TaskView` registers route and `wide`
board flag using `route.path` as the key (including project/label params), and owns the
eligible-only shortcut. The store guards all entry points and ignores
stale registration cleanup. Route changes clear Focus. Keep existing selection/write owners;
Focus does not change sidebar storage.

- [x] Add failing tests for allowed task-list routes, board/non-task exit, session-only state,
  returning to the saved sidebar preference, and shortcut suppression in input/editor fields.
- [x] Cover a saved section board and status board at first render, switching list → board while
  focused, and keyboard/palette/toolbar entry attempts on boards. Preserve the Notes tree chord.
  Exercise stale view cleanup after a newer view registers, so eligibility cannot drift.
  Test Project A → Project B and Label A → Label B with the same mounted route component:
  destination changes exit Focus; query-only filters and opening detail do not.
- [x] Implement Focus with attributes/CSS on the mounted shell and task content. Bind `mod+\`,
  add exit and help controls, and keep palette, quick add, selected task and detail usable.
- [x] Apply 44px comfortable, 36px compact and 46px Focus minimum rows, matching the reference's
  group rhythm and subdued metadata while keeping all current task fields and board actions.
- [x] In browser mode, keep a dirty task draft open, scroll/select a task, toggle Focus twice,
  deliver an external fixture edit and verify draft/selection/filter/position remain. Also
  check empty and filtered-to-zero lists, long labels/titles and keyboard/drag reordering.
- [x] Run targeted Focus, selection and view-option tests, full frontend tests and build.
  Expected: no writes caused by entering/exiting Focus and no task operation changes.

### desktop-app/45 — Floating detail, capture and contextual palette

**Requirements:** R45, R48, R49. **Dependencies:** desktop-app/44.

**Files:** `src/components/task/{TaskDetail,TaskMenu,pickers}.tsx`,
`src/app/{CommandPalette,QuickAdd,QuickAddForm,DetailPane}.tsx`,
`src/components/shared/EmptyState.tsx`; create `src/lib/handoff-context.ts`,
`src/lib/handoff-context.test.ts` and focused palette/action consumer tests.

**Interfaces:** new `handoffContext(task: Task | null, me: string | null)` returns
`{canAssign: boolean, canTakeBack: boolean, canRelease: boolean}`. Assignment requires an open
unclaimed task; Take back requires operator ownership and a different worker; release requires
an active claim. Context resolves an open task detail first, else the selected row.
Actions call existing `setOwner`, `release`, `complete`, `reopen`; keep existing error policy.

- [x] Add failing availability tests covering missing task/operator, unclaimed, claimed-by-me,
  claimed-by-other, terminal and stale contexts. Assert assignment never claims or launches an
  agent; claimed tasks expose release before reassignment rather than a multi-write transaction.
- [x] Restyle detail into the reference's heading/property hierarchy and owner-to-worker strip.
  Preserve description, subtasks, blockers, comments, file actions, recurrence and undo behavior.
- [x] Restyle quick add and pickers without changing parser/resolve/token-disable behavior.
  Add contextual assignment/release palette results, kept separate from ordinary title search.
  When no task is active, keep the current navigation/search/create behavior.
- [x] Add the real cmdk consumer acceptance case: query `hand`, `handoff`, `assign`, each member id
  and a display-name fragment. Contextual targets must remain visible and precede ordinary task
  titles for handoff queries; stale/claimed/terminal task contexts must not expose assignment.
  Use explicit cmdk keywords and deterministic group ranking, not display text alone.
- [x] Verify actual action invocation and failure visibility, real task updates on disk, and Undo
  where the existing operation supplies it. Show ordinary completion and real comments in place
  of unsupported approval/send-back controls; never display simulated history.
- [x] Run focused context/palette tests, existing quick-add corpus/submit tests, full frontend
  tests and build. Browser-check keyboard palette selection, Escape layering and draft retention.

### desktop-app/46 — Agents and library surfaces

**Requirements:** R45, R47, R49. **Dependencies:** desktop-app/45.

**Files:** `src/views/agents/AgentsView.tsx`, `src/components/agent/{AgentCard,AssignTaskDialog,primitives}.tsx`,
`src/views/notes/{NotesView,NotesTree}.tsx`, `src/views/memories/MemoriesView.tsx`,
`src/components/memory/*.tsx`, `src/views/scratch/ScratchView.tsx`,
`src/components/scratch/*.tsx`, `src/views/settings/SettingsView.tsx`,
`src/components/task/GettingStarted.tsx`; existing agent/memory/scratch/note tests.

**Interfaces:** consume current `buildBoard`, `isAwaitingHuman`, entity hooks and existing
mutation functions. Do not introduce agent state persistence or duplicate retrieval/walk logic.

- [x] Add consumer tests for needs-you ordering, missing question fallback, unknown artwork,
  links to real tasks/memories/scratch, and no fabricated elapsed runtime or recall history.
- [x] Restyle Agents into needs-you, crew, people and recent-memory sections. Preserve access to
  expanded queues/activity; Reply opens the existing comment field without posting a message.
- [x] Apply the Notes composition while retaining its toggleable folder/tag tree and existing
  wikilinks/file opening. Style memory, recall, scratch, Settings and onboarding with the same
  tokens. Preserve existing warnings and destructive/undo behavior.
- [x] Use the /43 draft controller for editable library details and repeat dirty-draft resize
  checks for memory and scratch. Route-specific reader layouts must retain draft owners above
  any responsive list/detail split rather than assuming the shell controller covers them.
- [x] Verify empty/disabled/error states, long paths, private/expired memories, stale/live scratch,
  removed members and unavailable host responses. Keep functional controls visible at narrow widths.
- [x] Run existing entity tests, frontend tests/lint/build and live demo browser checks for all
  implemented routes. Expect each reference screen recognizable and no blank or inert controls.

### desktop-app/47 — Acceptance, accessibility and compounding

**Requirements:** R45–R49. **Dependencies:** desktop-app/46.

**Files:** `a11y/run.mjs`, `a11y/fixtures.json`, existing accessibility tests, focused tests
introduced above, `docs/screenshots/*`, `README.md` where screenshots/copy changed,
`.spec/design.md`, `.spec/tech.md`, `.spec/features/desktop-app/{product,tech,design,plan}.md`,
`.spec/plan.md`.

- [x] Extend the existing executable accessibility/zoom harness for stone state and Focus.
  Test all eight palettes on shared components and representative task/detail/agent/library
  states. Do not raise or regenerate violation allowances to hide a regression.
- [x] Run frontend `test`, `lint`, `build`, `a11y`; Rust `cargo fmt --all --check`,
  `cargo clippy --workspace --exclude shards-desktop --all-targets --locked -- -D warnings`,
  `cargo test -p shards` and `cargo test -p shards-host`. Record actual outputs and any baseline limits.
- [x] Run the real host with explicit demo config; check completion/Undo, assignment/release,
  note navigation, memory/scratch actions and external CLI edits. Never use the live owner vault.
- [x] Capture the six reference compositions in Flint light/dark, every other implemented route
  at least once, and 1280px/900px/720px layouts. Use the existing zoom harness for 200% checks.
  Check reduced motion and offline font/art availability. Do not claim native checks without a run.
- [x] Review the final diff independently, fix confirmed regressions, rerun affected checks and
  update specs with delivered behavior, limitations and evidence. Preserve unrelated feature gaps.
- [x] Present the verified result for the verify-to-ship gate. No commit, push, merge, PR or
  deployment without the corresponding explicit authorization.

---

### desktop-app/48 — Visual QA corrections and Notes selector tabs

**Requirements:** R42, R45, R49. **Dependencies:** desktop-app/47. **Approval:** owner request and screenshots, 2026-10-28.
**Files:** TaskRow, Sidebar, NotesTree, NotesView, native icons/favicon, focused visual harness.

- [x] Reproduce task-row hover overlap with rich metadata and capture failing visual cases.
- [x] Reserve row action space; correct sidebar tray spacing and nested navigation alignment.
- [x] Replace stacked folder/tag headings with keyboard-accessible tabs, one tree panel,
  persisted tab choice and unchanged folder/tag filtering and expansion semantics.
- [x] Generate favicon and native icon variants from one approved Flint vector source.
- [x] Inspect actual hover/focus, folders/tags, sidebar and icon images in both themes at
  desktop and narrow widths. Save before/after evidence and obtain independent visual review.
- [x] Run affected tests, lint, build, accessibility and spec validation; record limitations.

## Dependencies

| Unit | Blocks | Blocked by |
|---|---|---|
| desktop-app/1 | 3, 4, 24 | — |
| desktop-app/2 | every harness verification | — |
| desktop-app/3 | 4, 5, 6, 23, 31 | 1 |
| desktop-app/4 | 5, 6 | 1, 3 |
| desktop-app/5 | 8 | 3, 4 |
| desktop-app/6 | 23, 30 | 3, 4 |
| desktop-app/7 | 9 | — |
| desktop-app/8 | 9, 23 | 5 |
| desktop-app/9 | 10, 15, 16, 19 | 7, 8 |
| desktop-app/10 | 11, 12, 20, 25, 27 | 9 |
| desktop-app/12 | 13, 14, 17 | 10 |
| desktop-app/17 | 32 | 12 |
| desktop-app/13 | 26 | 12 |
| desktop-app/14 | 18, 20, 25, 29 | 12, 24 |
| desktop-app/15 | 18 | 9 |
| desktop-app/19 | 28 | 9 |
| desktop-app/20 | 21, 30 | 10, 14 |
| desktop-app/21 | 22 | 11–20, 25–30, 41 |
| desktop-app/23 | 22, 28 | 3, 6, 8 |
| desktop-app/24 | 14, 22, 29 | 1 |
| desktop-app/25 | 21, 22 | 10, 14 |
| desktop-app/26 | 21, 22 | 13 |
| desktop-app/27 | 21, 22 | 10, 31 |
| desktop-app/28 | 21, 22 | 19, 23 |
| desktop-app/29 | 21, 22 | 14, 24 |
| desktop-app/30 | 21, 22 | 6, 20 |
| desktop-app/31 | 22, 27 | 3 |
| desktop-app/32 | 33 | 17 |
| desktop-app/33 | — | 32 |
| desktop-app/34 | 35–41 | — |
| desktop-app/35 | 36–41 | 34 |
| desktop-app/36 | 41 | 34, 35 |
| desktop-app/37 | 41 | 32, 34 |
| desktop-app/38 | 39, 41 | 34 |
| desktop-app/39 | 40, 41 | 34, 38 |
| desktop-app/40 | 41 | 39 |
| desktop-app/41 | 21, 22 | 35–40 |

Same-feature dependencies only. Cross-feature order is the gate above and the root
[plan.md](../../plan.md) Feature Sequence.

---

## Spec vs Implementation

Checked against the working tree on 2026-10-16. Code is truth for delivered behaviour; the
contract now lives in [tech.md](tech.md) § Contract / API, and each row below is design that is
not built yet (or a delivered choice that needs an owner decision, marked **decide**).

| Gap | Tracked in | Notes |
|---|---|---|
| Body replace has no precondition (`expected_body_sha256`, `conflict` kind) | desktop-app/1, /12 | **decide** (integrity): an app save overwrites a newer agent or editor body; R26 unmet |
| `Origin` check accepts any loopback `http` port | desktop-app/5 | **decide** (security): spec asked for own origin + the Vite origin; the token and `x-shards-client` mitigate; a page on another localhost port can use the Vite proxy |
| With no `[core].me` the host inherits the shell's `$SHARDS_AGENT` | desktop-app/1 | **decide** (identity): spec said the host ignores it (`Config::operator()`, `call_with` not built) |
| Production CSP sets `dangerousDisableAssetCspModification: ["style-src"]` and `img-src https:` | desktop-app/6 | **decide** (security): remote images are click-to-load in Markdown, but the CSP itself allows them |
| No undo tokens (`call_undoable`); undo is one client-side slot, not hash-guarded | desktop-app/3, /8 | R25 partly met: deletes restore exactly (create-only); field edits re-send old values |
| Watcher calls `create_dir_all` on every space root; events carry absolute paths; no `config`/`seq` | desktop-app/1, /4 | Breaks the lazy-folder invariant; no watcher tests |
| HTTP sends every domain error as 422; no `--static`; health is plain `ok`; no host `catch_unwind` | desktop-app/5 | Root kind → status map is the target |
| `host_config_set`, `host_memory_list`, `host_memory_recall_as`, scratch body replace not built | desktop-app/3, /15, /19 | Settings cannot write `me` or the vault; first run relies on `scripts/demo-vault.sh` / `shards init` |
| No global shortcut, no `quickadd` window, bundle `app` only | desktop-app/6 | R29 partly met |
| Agent signalling text (S7) missing from instructions and SKILL.md | desktop-app/24 | The app reads the labels; agents are not told to set them |
| No list virtualisation; budgets unmeasured | desktop-app/21 | 5k-task budget unverified |
| Quick-add corpus is 51 cases (target ≥ 60 with a 95 % gate); no token disable or `\` escape | desktop-app/11 | |
| No Completed view (R34) | desktop-app/25 | MVP parity row "Completed log" unowned until 2026-10-16 |
| Project drag order, palette "New project", archived-task exclusion from Today/Upcoming (R35) | desktop-app/26 | Create, rename, colour, archive, delete with count confirm delivered |
| No multi-select or bulk bar; `x` completes instead of selecting (R36) | desktop-app/27 | Root keyboard map says `x` selects |
| No axe-core check, VoiceOver or zoom pass; week start hard-coded Monday; no locale overrides (R37, R38) | desktop-app/28 | Reduced motion delivered globally in `index.css` |
| No "Waiting on me" view (R39) | desktop-app/29 | |
| No reminders (R40) | desktop-app/30 | Reversal of the 2026-10-15 decision |
| App deletes unlink instead of moving to the OS Trash (R25) | desktop-app/31 | D6 amended 2026-10-16 |
| CI workflow not yet run on GitHub; release package build not run locally | desktop-app/23 | Local runs of every job's commands exit 0 (CI task report) |

---

## Progress

| Unit | Status | Evidence |
|---|---|---|
| desktop-app/1 | PARTIAL | raw delete, `set_body`, `notes::set_meta`, `write_new` in core; S0 host-only; S1, S4 replace, S6, S7 open |
| desktop-app/2 | DONE (as `scripts/demo-vault.sh`) | `bash scripts/demo-vault.sh --force <dir>` → 48 tasks, 10 notes, 12 memories, 4 scratch (2026-10-16) |
| desktop-app/3 | PARTIAL | `cargo test -p shards-host` 36 passed; 13 host tools + alias; undo tokens, `call_with`, config/memory tools open |
| desktop-app/4 | PARTIAL | watcher works (live refresh seen in browser and Tauri); creates folders, absolute paths, no tests |
| desktop-app/5 | PARTIAL | binary unit tests (7); smoke on port 7961: health `ok`, 401 without token, 403 for `Origin: https://evil.example`, 200 `{value, list}`, 422 domain envelope; status map, `--static` open |
| desktop-app/6 | PARTIAL | `pnpm -C apps/desktop tauri build --debug --bundles app` and a traced 8 s launch (reported by the build task, 2026-10-16); global shortcut, dmg open |
| desktop-app/7 | PARTIAL | tokens light/dark in `src/index.css`, shadcn components; the token gallery route is not built |
| desktop-app/8 | PARTIAL | `lib/transport.ts`, `lib/query.ts`; single undo slot instead of an undo stack |
| desktop-app/9 | DONE | hash router (`lib/router.ts`, not TanStack Router), sidebar, `g` hotkeys, `?` sheet |
| desktop-app/10 | DONE | Inbox, Today, Upcoming, Project, Label views; `components/task/model.test.ts`; screenshots `docs/screenshots/{today,upcoming}-light.png` |
| desktop-app/11 | PARTIAL | `lib/quickadd/parse.test.ts` (51), `suggest.test.ts`; screenshot `quick-add-dark.png` |
| desktop-app/12 | PARTIAL | detail pane, subtasks, blockers, comments; no edit-conflict guard |
| desktop-app/13 | DONE | board + section rename/remove via `host_project_update`; `host_tools.rs` project tests; screenshot `project-shards-launch-board-dark.png` |
| desktop-app/14 | PARTIAL | Agents board (`agent-utils.test.ts`); S7 open |
| desktop-app/15 | PARTIAL | memories list, detail, supersede, forget, recall playground (`memory-utils.test.ts`); `host_memory_list` (all scopes) open |
| desktop-app/16 | DONE | scratch list (all agents), viewer, edit, append (`scratch-utils.test.ts`) |
| desktop-app/17 | SUPERSEDED by /32 | editor removed 2026-10-16; reader and wikilinks (`wikilinks.test.ts`) kept |
| desktop-app/18 | DONE | Search view, ⌘K palette |
| desktop-app/19 | PARTIAL | Settings view, empty-vault onboarding (`onboarding.test.ts`); `host_config_set` and vault picker UI open |
| desktop-app/20 | PARTIAL | SSE + Tauri events invalidate by space (seen live); timing budget unmeasured |
| desktop-app/21 | PARTIAL | keyboard map (tech.md § Keyboard); virtualisation and budgets open |
| desktop-app/22 | NOT STARTED | needs task-model-v2 DONE |
| desktop-app/23 | PARTIAL | `.github/workflows/ci.yml` jobs check, desktop, frontend, coverage, package; not run on GitHub |
| desktop-app/24 | NOT STARTED | no `needs-input` / `agent-error` text in `src/mcp/instructions.rs` or SKILL.md |
| desktop-app/25 | NOT STARTED | `apps/desktop/src/views/tasks/` has no Completed view |
| desktop-app/26 | PARTIAL | `AddProjectDialog.tsx`, `project-actions.ts` (+ test), `ProjectMenu.tsx`; order, palette entry, archived exclusion open |
| desktop-app/27 | NOT STARTED | — |
| desktop-app/28 | PARTIAL | `prefers-reduced-motion` rule in `src/index.css`; the rest open |
| desktop-app/29 | NOT STARTED | — |
| desktop-app/30 | NOT STARTED | no notification plugin |
| desktop-app/31 | NOT STARTED | host tools unlink |
| desktop-app/32 | DONE | `cargo test -p shards-host` (`notes_browse_*`, `note_read_*`, `status_reports_the_obsidian_vault_*`); `views/notes/filter.test.ts`; browser mode on the owner vault: 640 files (669 minus 29 under `scripts/node_modules`), folder filter "Team & Organization" → 22, wikilink opens `anders-sales.md`; a Search hit on a file without an id opens it in the browser by path; Settings notes tile counts browsed files (2026-10-16) |
| desktop-app/33 | PARTIAL | `tests/open.rs` (path gate, URL), `lib/open.test.ts`; split button in task detail and notes reader (browser mode); `open "obsidian://open?path=…t-1MQG.md"` brings Obsidian forward; `.app` rebuilt and launched with trace. Not yet clicked in the native window |
| desktop-app/34 | DONE | `lib/ui-contract.ts`; `vitest run src/lib/ui-contract.test.ts` 7 passed (2026-10-16) |
| desktop-app/35 | PARTIAL | `index.css` stock neutral + 3 AA deviations, `lib/contrast.test.ts` (text ≥ 4.5, rings ≥ 3), `lib/motion.test.ts` guard (shown red with the `useReducedMotion` patch removed from `primitives/radix/dialog.tsx`, green restored), `avatarFill` + tests, animate-ui vendored with `LICENSE.md`, root `MotionConfig reducedMotion="user"`, AGENTS.md § 3; suite 28 files / 393 tests passed, lint 23 warnings (baseline), build ok; initial JS gzip 187.11 KB → 231.39 KB (+44.28 KB ≤ 50); browser on demo vault: light + dark Today, dialog, detail pane, `--primary` neutral (2026-10-17). Open: macOS "Reduce motion" run not done; violet logo/Add task/avatar call sites remain for /41 |
| desktop-app/36 | DONE | approved 2026-10-16. Sidebar sections from NAV_SECTIONS, collapsible remembered headers (animate-ui), sliding highlight + counts (reduced-motion safe), sidebar open state persisted; nav.ts + nav.test.ts (one nav list, three consumers). test 411 pass, lint 23 warnings (baseline), build ok; browser: Agent team collapse survives reload, `g a` opens Agents while collapsed, `[` closed survives reload. |
| desktop-app/37 | DONE | `views/notes/{tree,NotesTree}` + tests; suite 28 files / 393 tests passed; tree build min 1.81 ms, filter 0.16 ms at 1,000 rows (pins shown red at bound 0); browser on demo vault (nested counts, keyboard walk, persistence) and owner vault read-only: 640 files, ≤ 30 rows mounted, last row 639 (2026-10-16). Not measured: React Profiler frame budget |
| desktop-app/38 | DONE | `model.test.ts` (statusDrop, columnCollapsed, BOARD_STATUSES gains cancelled), `group-specs.test.ts` (Label: Inbox first); suite 29 files / 411 tests passed; browser on demo vault: Cancelled column 48px by default, Done collapsed to 48px and still collapsed after reload (`shards.board.<project>.status.collapsed`); drag a card to Cancelled wrote `status: cancelled` (`shards task get`), Undo reopened it (`status: open`); Label view groups Inbox, then Home (2026-10-17) |
| desktop-app/39 | DONE | `lib/view-options.test.ts` (parse, sort, group, dropPatch incl. label refusal, applyViewOptions, timing pin: filter+group+sort 2,000 tasks min of 10 = 0.32 ms, group+sort alone 0.75 ms, bound 8 ms), `group-specs.test.ts` (default options return each view's delivered groups); browser: Group by Priority in a project, drag normal to High wrote `priority: high` and one Undo restored `normal`; Sort by Due: ⌥↓ moved nothing, menu reads "Manual order is off while sorted"; compact one-line row 33 px (32 + 1 px border) vs 37 comfortable; invalid stored JSON loads defaults after reload (2026-10-17). Not built: Waiting on me view has no route yet |
| desktop-app/40 | DONE | `filterTasks`, `filterChips`, `applyViewOptions` filter tests (OR within, AND across, blocked = open blocker, removed label); `FilterMenu`/`FilterChips`/`FilteredToZero`; browser: Today filtered by @admin 4 to 1 row with chip "Label: admin", chip x restored 4; Priority urgent/high + Blocked showed "No tasks match these filters" with "Clear filters"; a stored removed label loaded as a chip and its x cleared it; filters persisted in `shards.view.today` (2026-10-17) |
| desktop-app/41 | DONE | `lib/color.ts` (`avatarShape`), `lib/dates.ts` (`dueToneClass`), `lib/quickadd/token-tone.ts` (+ tests); Avatar uses `avatarFill`, labels/tags neutral, logo `currentColor`, primary-as-accent swept to fg/accent/muted, wikilinks underlined fg, Settings preview on tokens; `rg oklch\(` prints only `lib/color.ts`; suite 30 files / 417 tests passed, lint 23 warnings (baseline 23), build ok; browser (demo vault, light + dark) Today, project list/board, Agents, Memories, Notes, Settings; demo `[[members]].color` still tints avatars (override, by design) |
| desktop-app/42 | DONE | Eight palettes, local licensed fonts/art, preference bootstrap and rendered contrast; 301 foundation tests plus browser palette checks (2026-10-28) |
| desktop-app/43 | DONE | Shared trays/identity primitives and target-scoped draft controller; seven dirty editor resize cases preserve focus/selection/scroll without writes (2026-10-28) |
| desktop-app/44 | DONE | Guarded session Focus, route/board/input/shortcut/palette consumer cases; comfortable/compact/Focus density and reduced chrome (2026-10-28) |
| desktop-app/45 | DONE | Contextual owner/release actions, actual cmdk aliases/ranking/stale guards; real-host assignment/release/completion/Undo verified (2026-10-28) |
| desktop-app/46 | DONE | Needs-you/crew/people/memory overview and all library surfaces; memory/scratch draft and external title conflict browser cases (2026-10-28) |
| desktop-app/47 | DONE | Initial automated baseline: 730 frontend, 1,477 core, 46 host tests, 30 browser cases, zero axe/zoom findings. Visual gaps found by the owner are corrected and reviewed in the built-in browser under /48 (2026-10-28) |
| desktop-app/48 | DONE | Reserved row actions and wrapping/first-line alignment, 10px aligned sidebar trays, accessible persistent Notes tabs, generated app icons. 731 frontend tests; 18 visual cases plus original 30 state/capture cases; actual built-in-browser subagent review at 1280/900/720 light/dark; see docs/design/flint-verification.md (2026-10-28) |
