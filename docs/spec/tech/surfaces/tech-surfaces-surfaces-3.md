---
type: tech
applies: "**"
updated: 2026-11-02
---

# tech-surfaces: Surfaces (3/4)

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
- **MCP** — stdio JSON-RPC, server name `shards`, **42 `shards_*` tools** (`TOOL_NAMES` in
  `src/mcp/mod.rs`) mirroring the safe verbs plus the read-only lenses, each with explicit
  read-only/idempotent/destructive hints and exactly **two** destructive tools —
  `shards_task_cancel` and `shards_memory_forget`.
  **Memory lifecycle is agent-facing:** `shards_memory_supersede {target, by}` stamps
  `superseded_by` on the old memory through `memories::supersede` (a superseded memory drops out
  of recall and out of `list` unless `include_superseded` is set), and `shards_memory_forget
  {target}` hard-unlinks it through `memories::forget`. Both reuse the domain functions and the
  one recall ordering; neither invents a second path. Forget is non-idempotent by nature: a
  second call on the same id is `not_found`.
  Withheld: every *other* removal verb, asset ingest and gc, and all admin; the test
  `no_tool_name_contains_a_withheld_substring` bans `delete`, `daemon`, `reindex`, `status`,
  `remove`, `clear` from tool names (memory forget is the one removal the ban list deliberately
  stopped covering, because a wrong belief has to be retirable).
  **Tool profiles:** `shards mcp --tools all|memory` (default `all`) and `SHARDS_MCP_TOOLS` for
  the flagless `shards-mcp` shim mount a subset. `memory` is exactly the eight memory tools;
  `tools/list` returns only that subset and a `tools/call` outside the mounted profile fails as
  `unknown tool` rather than silently working, so a client can mount memory-only without a second
  server. Every parameter carries a description; enums render
  domain literals; a config-derived instructions block is sent on connect and degrades to naming
  `shards init`. Failures cross as the structured error envelope, never a trace.
- **Local agent integration (source DONE, activation pending)** — `using-shards` supplies enrolled-project lifecycle
  obligations beside the `shards` vault playbook; MCP connect instructions retain standalone
  use and explain `needs-input` / `agent-error`. The native Rust hook runner validates existing
  lifecycle calls, claims and checkpoints through core readers. TypeScript builds
  target-specific packages; no script runtime is required by installed hooks. No new MCP tool or core
  field is introduced. Native guard and package checks pass;
  candidate hooks are not installed/trusted or observed in real hosts. The persistent

Parent: [Section index](README.md).
