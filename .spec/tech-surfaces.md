---
type: tech-topic
parent: tech.md
scope: delivered surfaces
covers: adoption, note claims, project envelope, wikilinks, search, tasks, assets, scratch, memories, admin, watch, dashboard, MCP, session lenses
updated: 2026-10-24
---

# Implemented surfaces — Tech

The delivered behaviour of each verb family, compounded from deleted feature specs. Split out of
[tech-core.md](tech-core.md), which keeps the stack, layout, invariants and contracts. Full
detail lives in the code plus the tests cited. Task model v2 additions are in
[features/task-model-v2/tech.md](features/task-model-v2/tech.md) until that arc is compounded.

## Surfaces

- **Adoption & note claims** — `note adopt` mints a Shards id into an existing foreign file in
  place: insert-only-absent keys (`id`, `title`, `created`, `updated`; `owner` only when the flag
  is given), foreign keys and the filename untouched, byte-identical re-run. Adopt refuses (exit 2,
  file untouched) a file the walk cannot see — a dot component, a non-`.md` extension, over 4 MiB
  — and a file whose existing keys fail the note schema. A batch is a sequence of single-entity
  transactions: the first failure stops the run naming what committed; the idempotent re-run
  heals. `note claim`/`release` are the task machinery minus the lifecycle: test-and-set on
  `claimed_by` only, conflict = the shared claim-conflict envelope, `--force` on release breaks a
  foreign holder. `--mine` on note list is owner-or-claimed_by. The status census carries
  per-agent `notes_owned`/`notes_claimed`, appended last. Pinned by `tests/note_cli.rs`,
  `tests/race.rs` (8-way real-process claim race), `tests/review_regressions.rs`,
  `tests/mcp_cli.rs`, `tests/bundle.rs`.
- **Project envelope** — one membership rule per space, all read-time: tasks by `project`
  equality, notes by `related` containment, memories by `project` equality. The `project` lens
  appends `notes` then `memories` last; `search --project` and `memory recall --project` scope to
  the members and compose with every other filter as a plain conjunction (zero rows is an empty
  result, never an error). The seed gate is shared: unknown id → exit 3 with candidates; a foreign
  seed → `seed is not shards-native (no shards id)`. Unknown and dangling `project` values are
  tolerated. MCP carries `project` on `shards_search`, `shards_memory_recall` and the memory
  write tools. Pinned by `tests/{lens,search,memory,mcp}_cli.rs`.
- **Wikilinks** — `[[Title]]` → id by title match against the notes index; `[[n-id]]`/`[[t-id]]`/
  `[[m-id]]`/`[[a-id]]` pass through; alias and anchor forms (`|`, `#`, `^`) strip at the lookup
  boundary; `related` is deduped; unresolvable links are dangling and counted by `shards status`.
- **Search** — hit shape `{id,type,title,score,path}` plus conditional `tags`/`owner`/`updated`/
  `snippet`/`space`; foreign files surface with `id: null`. Routing: `indexed` when `[search].hybrid`
  is on, a collection is configured and the binary is on PATH; otherwise a built-in BM25-lite engine
  whose four legacy tiers (title-exact 1.0, title-substring 0.8, tag 0.6, body 0.4) remain floors;
  `--engine substring` restores the legacy scoring. `indexed` is a dense-vector engine: the
  `hybrid` key selects that branch, it does not fuse a lexical leg, and the built-in BM25-lite
  engine is what matches exact identifiers. Ordering is score desc, updated desc, path asc
  (±0.02 recency band on the `indexed` path only). `--tags` is repeatable, comma-split and ANDed;
  `--status` is a membership union (unknown value exit 2). Under an active filter, an explicit
  `--limit=-1`, and `memory recall`, the `indexed` fetch asks for the positive `MAX_FETCH_DOCS`
  sentinel (1,000 documents) because the CLI reads a negative limit as a valid empty result; the
  real filter and display limit are applied in Rust afterwards.
- **Tasks** — atomic `O_EXCL` claim; idempotent release/finish/cancel that never rewrite a no-op
  and report the status they *found*; `--available` is dependency-blind; `--ready`/`--blocked` are
  dependency-aware; a strict claim on a blocked task exits 5; `task next` selects and optionally
  claims in one invocation, retrying across up to 3 candidates on a race. `block`/`unblock` replay
  their add/remove sets against the locked read (§ Invariants 6); the cycle check uses the
  whole-graph scan. The v2 fields, filters, sorts and the recurring finish (uncommitted) are
  specified in [features/task-model-v2/tech.md](features/task-model-v2/tech.md) until compound.
- **Assets** — ingest is copy-only and idempotent by content; `--attach` resolves its target
  before any I/O. `attach`/`detach` span three and two transactions; both are idempotent and a
  failure names which halves committed. `remove`'s reference guard runs inside the asset's lock.
- **Scratch and memories** — the scratch agent is validated exactly like the name beside it; the
  agent census counts only a real `<agent>/<name>.md` pair. `scratch list` with no `agent` and
  no `all_agents` lists only the acting identity's pads (by design; the MCP description says so,
  and `host_tools.rs` pins the three scopes). `memory forget --expired` re-reads
  each memory under its own lock and keeps whatever is no longer expired; one unreadable memory
  is skipped, not fatal.
- **Admin and watch** — `shards reindex` and `shards watch` report the rebuild that actually ran.
  Reconciliation *moves* a file and never destroys one. `status.deps.cycles` reports strongly
  connected components. `status` labels `notes: N (shards-native)` and appends a `notes_foreign`
  count, so `notes: 0` beside a vault of foreign files cannot read as blindness.
- **Dashboard** — `shards dashboard [--interval]` (default 2 s, minimum 1 s): foreground,
  read-only, human-only terminal view, four fixed panes (agents census incl. note
  ownership/claims, tasks by ready/blocked/claimed, recent activity, vault health). Every number
  comes from the domain reads the CLI uses (`status_report`, `tasks::list`, the recent-activity
  lens, the search-health line); the `DashFrame` snapshot is the view model the desktop
  `host_dashboard` tool reuses. A failed refresh keeps the last good frame; terminal restoration
  is a Drop guard; no tty → exit 2 `dashboard needs a terminal`. Keys: `q`/Ctrl-C, `r`, `m`,
  `Tab`, arrows. Not exposed over MCP (asserted). Pinned by `src/cli/dashboard.rs` unit tests,
  `tests/dashboard_cli.rs`, and the cold-start pin.
- **MCP** — stdio JSON-RPC, server name `shards`, **40 `shards_*` tools** (`TOOL_NAMES` in
  `src/mcp/mod.rs`) mirroring the safe verbs plus the read-only lenses, each with explicit
  read-only/idempotent/destructive hints and exactly one destructive tool (`shards_task_cancel`).
  Withheld: every removal verb, asset ingest and gc, and all admin; the test
  `no_tool_name_contains_a_withheld_substring` bans `delete`, `daemon`, `reindex`, `status`,
  `forget`, `remove`, `clear` from tool names. Every parameter carries a description; enums render
  domain literals; a config-derived instructions block is sent on connect and degrades to naming
  `shards init`. Failures cross as the structured error envelope, never a trace.
- **Session lenses** — `recent-activity`, `build-context`, `graph` (`--direction in|out|both`),
  `project`, and `session-start` (tasks → mentions → memories → activity, deduped by id, a
  `reason` on every entry, `--team` widening only the activity half, `--budget` trimming bodies
  before entries). All are read-only and accept a space filter. `--mine` resolves against the
  acting identity — `--owner` when given, else `[core].agent` — on every lens and list verb
  (planned, task-model-v2/8: `[core].me` joins the chain; today only `shards-host` reads it, see
  [product-cli.md](product-cli.md) § Configuration and identity precedence).
