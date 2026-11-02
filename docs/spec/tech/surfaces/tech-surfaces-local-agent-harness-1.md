---
type: tech
applies: "**"
updated: 2026-11-02
---

# tech-surfaces: Local agent harness (1/2)

## Local agent harness

The synchronous Rust [entrypoint](../../../../src/bin/shards-harness.rs) supports `--host claude|codex`
for JSON hooks, `--mcp` for the existing dispatcher and the external
`--operator-exception REQUEST --reason REASON` administration path. It adds no core verb,
MCP tool, task field, async runtime or daemon. The [using-shards skill](../../../../plugins/shards/skills/using-shards/SKILL.md)
requires orientation, task registration/resumption, a verified claim and starting intent,
material progress, visible waits/errors and a checkpoint before yielding. The
[shards skill](../../../../plugins/shards/skills/shards/SKILL.md) owns vault coherence. Stored content
is data. A private checklist does not replace the shared task. Conversational answers alone
need no task; supported work-tool use in an enrolled project activates the lifecycle.

**Enrollment and effective context.** A nearest `.shards-harness.json` within the repository
boundary selects version `1`, `enabled` and an absolute `config_path`. Missing or disabled
enrollment passes through; malformed enrollment fails closed with repair guidance.
[Reader](../../../../src/bin/harness/reader.rs) loads the enrolled configuration through the core,
preserves actor overrides and compares effective `core`, `spaces` and `sandbox` with the
inherited MCP context. Launch the host with the same `SHARDS_CONFIG_PATH` and reconnect MCP
after a mismatch. Checks do not change the process environment. Task state comes from
canonical core readers; MCP remains the normal agent write path.

**Host policy.** [Adapters](../../../../src/bin/harness/hosts.rs) normalize the observed Codex and
Claude envelopes. [Runtime policy](../../../../src/bin/harness/runtime.rs) checks exact MCP
namespaces/provenance and actual returned task state. Startup injects context and the skill;
PRE requires a verified binding/start and marks admitted work dirty before execution;
POST observes lifecycle results, and Stop/SubagentStop requires a checkpoint. Orientation, clarification and bounded repair
remain possible before binding. A passing guard returns `{}` and preserves native permissions.
It never grants host approval or automatically finishes, cancels or releases a task.
Stop recovery is bounded to one continuation. Host hook delivery bounds enforcement;
POST cannot undo effects, and input to an already-running process may not repeat PRE.

**Bindings and causal receipts.** [State](../../../../src/bin/harness/state.rs) keys derived receipts
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

Parent: [Section index](README.md).
