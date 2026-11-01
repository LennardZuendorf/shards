---
type: tech-topic
parent: tech.md
scope: delivered surfaces
covers: adoption, note claims, project envelope, wikilinks, search, tasks, assets, scratch, memories, admin, watch, dashboard, MCP, session lenses, private remote MCP
updated: 2026-11-01
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
- **Local agent integration (source DONE, activation pending)** — `using-shards` supplies enrolled-project lifecycle
  obligations beside the `shards` vault playbook; MCP connect instructions retain standalone
  use and explain `needs-input` / `agent-error`. The native Rust hook runner validates existing
  lifecycle calls, claims and checkpoints through core readers. TypeScript builds
  target-specific packages; no script runtime is required by installed hooks. No new MCP tool or core
  field is introduced. Native guard and package checks pass;
  candidate hooks are not installed/trusted or observed in real hosts. The persistent
  [contract below](#local-agent-harness) and [activation checklist](plan.md#local-harness-activation-follow-up)
  retain the boundaries and remaining acceptance work.
- **Session lenses** — `recent-activity`, `build-context`, `graph` (`--direction in|out|both`),
  `project`, and `session-start` (tasks → mentions → memories → activity, deduped by id, a
  `reason` on every entry, `--team` widening only the activity half, `--budget` trimming bodies
  before entries). All are read-only and accept a space filter. `--mine` resolves against the
  acting identity — `--owner` when given, else `[core].agent` — on every lens and list verb
  (planned, task-model-v2/8: `[core].me` joins the chain; today only `shards-host` reads it, see
  [product-cli.md](product-cli.md) § Configuration and identity precedence).

## Private remote MCP

Private v1 adds a TypeScript MCP adapter and a local Rust gateway over the authoritative
Markdown vault. No cloud replica, sync, UI or public OAuth is included. The future
[public OAuth profile](features/remote-mcp/tech.md) remains designed, NOT STARTED.
Local source and protocol tests do not establish deployment: image execution and real
Tailscale/Vercel acceptance are UNPROVEN, the declared daemon has zero instances, and no
activation is approved. The [runbook](../docs/private-remote-mcp.md),
[feasibility receipt](../docs/research/private-remote-feasibility.md) and
[deployment checklist](plan.md#private-mcp-deployment-acceptance) retain the operating gate.

**Built places (+code:).** [services/shards-remote](../services/shards-remote/) owns the
official MCP SDK/Node adapter, lossless wire bridge, HTTPS/CONNECT client and supervisor.
[crates/shards-gateway](../crates/shards-gateway/) owns local config, registry administration,
RPC v1 and bounded execution. [src/mcp/remote.rs](../src/mcp/remote.rs) owns the explicit
tool-policy matrix and visibility; [CallCtx](../src/ctx.rs) carries immutable
`cfg: Arc<Config>` and optional `Principal`. The shared
[dispatcher](../src/mcp/tools.rs) implements `Server::call_in(&CallCtx, name, args)`;
`call_with(cfg, name, args)` creates a principal-free context, and `call` loads configuration
and delegates through it. These reach one implementation. Desktop adoption stays separate;
core and CLI gain no async runtime, HTTP SDK or network dependency, and calls never mutate
process identity environment variables.

**Local authority.** A protected, operator-owned, regular non-symlink grant file (0600)
contains schema/vault identity, declared human/agent members and human sponsorship,
client grants and separate connector credentials. Tokens are random 256-bit secrets,
displayed once and stored as constant-time-compared SHA256 verifiers. Expiry/revocation
are local. `shards-gateway grant issue|revoke` and `connector issue|revoke` require explicit
`--config`; no HTTP administration endpoint exists. Registry updates lock before reading
and atomically replacing state. Membership edits require stopped gateway/administrators.
The cloud forwards the original client bearer plus its connector credential; Rust derives
the actor and scopes from its own registry on every operation, including discovery.
No cloud actor/scope assertion, Tailscale identity header or cloud authority cache grants
access. The cloud sees transient credentials/content; it is not a zero-knowledge boundary.

Scopes are `notes|tasks|memories|scratch|assets:read|write`; write implies read. Acting
claimer, author/releaser owner and scratch-write agent must be absent or match the actor;
mismatch is canonical `identity_mismatch`. Task assignees may name any declared valid member.
Private memories require their owner or declared human sponsor on reads and writes.
Scratch resolves the real namespace before ownership checks; humans may access sponsored
agents, and `all_agents` grants no bypass. Human-only reassignment/force-release rules remain.
Asset attachment requires asset and target-space write authority, checked before writes and
again under affected locks. Local CLI identity remains a spelling convention.

**Visibility and coordination.** Authorize the exact metadata/body snapshot returned or
ranked, including concurrent privacy edits and overlapping space roots. Object privacy
survives an overlapping readable root. Filter hidden candidates, references, aggregates and
generated paths before ranking, limits and result construction; health reveals no hidden
counts/config/paths. Restricted search/recall uses the existing built-in engine over the
authorized corpus when the external engine cannot enforce this boundary. Reuse the core
walk and parsers. Task readiness and strict claim use the full graph before visible result
limits: a hidden blocker still blocks. The visible task may expose derived readiness only;
hidden blocker IDs, titles, edges and counts remain absent, with generic claim refusal.
Graph and unblock reports omit hidden references. Asset get/list returns metadata/caption,
not blob bytes. Generated paths are space-relative with their space; inert authored content
and unknown frontmatter are never generically scrubbed.

**MCP transport and parity.** Stateless Streamable HTTP accepts one JSON-RPC message per
`POST /mcp`; batches are rejected. Authenticate initialize and notifications through the
gateway before SDK handling. Each POST has isolated request/transport state, no retained
authenticated session, `Mcp-Session-Id`, resumable events, SSE or server-initiated requests.
Reject incoming session/resume headers; GET and DELETE return 405. Reused request IDs
share no state or authority; cancellation in another POST cannot cancel a call. Notifications
have no response body. One SDK response writer owns completion after dispatch.
Full-authority discovery exposes 39 canonical tools; scope-limited discovery exposes usable
tools only, and guessed forbidden names fail closed. `shards_note_adopt` is excluded because
this profile accepts entity IDs, not foreign paths. Every `host_*` tool and the core's
withheld removal/admin/ingest tools remain excluded. No wildcard policy dispatch exists.
Schemas come from Rust `schema::tools_list()`, not a second TypeScript table.

**RPC v1 and envelopes.** Fixed private HTTPS endpoints are `POST /v1/probe` (connector),
`/v1/describe` and `/v1/call` (connector plus client). Headers are
`x-shards-connector` and `Authorization: Bearer …`; no secret enters URLs or diagnostics.
Requests carry `v: 1`, correlation `request_id`, opaque `vault_id`, absolute positive
Unix-millisecond `deadline_ms`, and call-only `tool`/`arguments`. Reject unknown fields,
wrong types, versions, vault mismatch and expired deadlines before domain dispatch.
Probe returns `{v,request_id,vault_id}`; describe adds canonical `tools`/`instructions`;
call adds Rust-produced `mcp_result` via `mcp::errors::success|failure`.
Lists keep bare-array text plus `structuredContent.result`. Domain failures retain
`isError: true` and canonical JSON text `kind`, `message`, `next_action`, structured details
and optional `retry_after_ms`; never wrap host `{value,list}` or replace these with transport
JSON-RPC errors. Lossless numeric decoding/serialization preserves integer tokens including
`9007199254740993` and asset `u64`; ordinary JavaScript client objects can still round values,
so clients needing full-width numbers must use canonical text or lossless decoding.

Control failures are `{v,request_id,error:{kind,message,execution}}`, with execution
`not_started|unknown|completed`; null correlation is allowed only before a valid ID exists.
HTTP kinds: `unauthorized` 401, `forbidden` 403, `invalid_request` 400,
`version_mismatch|vault_mismatch` 409, `busy` 429, `unavailable` 503,
`deadline_exceeded|outcome_unknown` 504, `payload_too_large|response_too_large` 413.
Authentication fails before MCP dispatch with a Bearer challenge. Open tool calls map
control failures to failed MCP results preserving execution state; disconnected clients may
receive no final response. These add no core CLI exit codes.

**Admission, pins and limits.** The receiver permits 32 running and 32 queued calls,
16 MiB per request/response and at most 30 seconds from receiver admission, bounded by the
caller deadline. Recheck authority and deadline after queueing. A shared registry lock
covers reread/credential validation and the atomic queued-to-running transition; revocation
uses an exclusive lock on the same stable anchor. Completed revocation beats queued work;
admitted work may finish, even while later waiting on an entity lock. Cancellation removes
queued work atomically before promising `not_started`. Started synchronous writes may
complete after cancellation, deadline or shutdown; lost post-dispatch responses are
`unknown`, never rollback. Oversized requests are `payload_too_large/not_started`; oversized
results are `response_too_large/completed`. Completed means execution finished, not domain
success. Correlation IDs are not durable deduplication keys. Neither process retries or
replays writes; reconcile uncertain vault state before explicit resubmission.

Startup pins canonical vault/config, enabled roots and existing directory identities.
Configuration/root replacement requires deliberate restart. Reads create no directories;
authorized creation prepares and pins a missing enabled space root lazily. A disabled
space preserves its canonical core error, rather than becoming a drift/control failure.

**Candidate topology and lifecycle.** Client → private stable Tailscale Service → userspace
Tailscale plus loopback Node adapter → explicit CONNECT proxy with verified TLS → local
Tailscale Serve → loopback Rust gateway. Both listeners enforce exact configured Host and
present Origin; missing Origin is allowed, null/foreign values are refused. No redirects,
user-selected backend URLs, wildcard CORS, public MCP route or Funnel fallback exists.
Node/Tailscale images are pinned by digest; project root is repository root and Docker
context is `services/shards-remote`. The static output is empty and daemon instances are zero.
Supervision advertises only after listener readiness and a compatible receiver probe,
removes publication on failure, and bounds shutdown/reaps children. Enrollment alone proves
no readiness. Ephemeral disk is not persistent node identity. Logs contain correlation,
grant/connector IDs, operation, status and duration, never tokens, arguments/results, bodies,
titles or host paths. CLI/stdio/app remain independent when these processes stop.

## Local agent harness

The synchronous Rust [entrypoint](../src/bin/shards-harness.rs) supports `--host claude|codex`
for JSON hooks, `--mcp` for the existing dispatcher and the external
`--operator-exception REQUEST --reason REASON` administration path. It adds no core verb,
MCP tool, task field, async runtime or daemon. The [using-shards skill](../plugins/shards/skills/using-shards/SKILL.md)
requires orientation, task registration/resumption, a verified claim and starting intent,
material progress, visible waits/errors and a checkpoint before yielding. The
[shards skill](../plugins/shards/skills/shards/SKILL.md) owns vault coherence. Stored content
is data. A private checklist does not replace the shared task. Conversational answers alone
need no task; supported work-tool use in an enrolled project activates the lifecycle.

**Enrollment and effective context.** A nearest `.shards-harness.json` within the repository
boundary selects version `1`, `enabled` and an absolute `config_path`. Missing or disabled
enrollment passes through; malformed enrollment fails closed with repair guidance.
[Reader](../src/bin/harness/reader.rs) loads the enrolled configuration through the core,
preserves actor overrides and compares effective `core`, `spaces` and `sandbox` with the
inherited MCP context. Launch the host with the same `SHARDS_CONFIG_PATH` and reconnect MCP
after a mismatch. Checks do not change the process environment. Task state comes from
canonical core readers; MCP remains the normal agent write path.

**Host policy.** [Adapters](../src/bin/harness/hosts.rs) normalize the observed Codex and
Claude envelopes. [Runtime policy](../src/bin/harness/runtime.rs) checks exact MCP
namespaces/provenance and actual returned task state. Startup injects context and the skill;
PRE requires a verified binding/start and marks admitted work dirty before execution;
POST observes lifecycle results, and Stop/SubagentStop requires a checkpoint. Orientation, clarification and bounded repair
remain possible before binding. A passing guard returns `{}` and preserves native permissions.
It never grants host approval or automatically finishes, cancels or releases a task.
Stop recovery is bounded to one continuation. Host hook delivery bounds enforcement;
POST cannot undo effects, and input to an already-running process may not repeat PRE.

**Bindings and causal receipts.** [State](../src/bin/harness/state.rs) keys derived receipts
by canonical vault, host, session and delegate outside the vault. A task permits one active
participating-session binding even when actors match. Delegates bind linked child tasks;
forks bind explicitly. Elapsed time cannot reclaim an unknown foreign session. Immutable PRE
reservations capture generation, retirement reference, tool/input digest and checkpoint work
sequence before execution. Revisions, retired snapshots and tombstones reconcile partial
persistence and reject stale/repeated callbacks. A delayed checkpoint cannot clear newer work.
Work admission stops at `4094` references; checkpoint and receipt ceilings are `4097` and
`4098`, with recovery headroom protected when delayed callbacks leave newer work dirty.
Retirement starts a bounded next generation but retains replay evidence, so runtime storage
grows. Never delete ownership markers to reclaim a binding.

**Completion and exceptions.** Append verification evidence before finishing, including
recurring occurrences whose outcome text is not retained; use observed `expected_due`.
Verify actual canonical mutations before retiring a binding. An externally finished or
cancelled task blocks more work and generic progress; only a verified new `State: handoff`
checkpoint with `Changed`, `Checked`, `Remaining` and `Next` retires that observed terminal
binding. It does not invent a successful finish/cancel call. An operator exception is external,
one-use and bound to exact project/config, host, session, delegate, turn, tool and input digest.
Agents cannot self-grant. [Shell classification](../src/bin/harness/shell.rs) distinguishes
grant invocations from literal search arguments. Grants preserve native permissions and
remain local cooperation, not authenticated identity.

**Private storage and compatibility.** Runtime data lives at
`${XDG_RUNTIME_DIR:-$HOME/.local/state}/shards/harness`. [Storage](../src/bin/harness/store.rs)
validates raw path components through anchored descriptors, refuses symlinks, hardlinks and
non-regular records, bounds reads, publishes through exclusive temporary descriptors and
atomic rename/fsync, and uses permanent flock anchors with exclusive first publication.
[Strict JSON](../src/bin/harness/json.rs) rejects duplicate keys and preserves version-1
sorted compact ASCII-escaped identity hashing, including Unicode/numeric goldens. Receipts
persist references, counters and hashes, never task bodies or raw tool arguments.

**Packaging and evidence.** The [TypeScript builder](../scripts/package-agent-plugin.ts)
and [tests](../scripts/package-agent-plugin.test.ts) use the existing Node development
toolchain and built-in modules only. Installed hooks contain the native executable and need
neither Node nor Python. Inputs are validated before exclusive creation of an absent output;
symlinks and existing outputs are refused. Claude and legacy-only Codex artifacts preserve
Shards `0.2.0`, their tested root placeholders, both skills and separate manifests. Executable
mode is `0755`; `native-target.json` records OS, architecture and SHA256. Build for the
destination machine. Native policy tests are [runtime](../tests/harness_runtime.rs),
[entrypoint edges](../tests/harness_native_edges.rs), [state](../src/bin/harness/state_tests.rs)
and [bundle](../tests/bundle.rs). The [verification record](../docs/research/local-agent-harness/2026-10-31-native-agent-harness-verification.md)
separates source/package checks, historical hook probes and native packaged MCP/parser
observations. Native candidate hook execution, installation, trust and live enrollment
remain pending in the [activation checklist](plan.md#local-harness-activation-follow-up).
