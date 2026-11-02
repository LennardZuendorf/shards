---
type: tech
applies: "**"
updated: 2026-11-02
---

# tech: Local agent harness

## Local agent harness

The [persistent surface contract](../surfaces/tech-surfaces-local-agent-harness-1.md#local-agent-harness) owns the
Codex/Claude Code adapters. The synchronous Rust `shards-harness` binary reuses
core configuration, canonical task readers and the existing MCP dispatcher. Shared
skills define the lifecycle contract. TypeScript builds target-specific plugin
packages using the existing Node development toolchain; installed hooks require
neither Node nor Python. Explicit project enrollment pins
configuration; guards reject disagreement with MCP's inherited effective context.
Derived receipts live outside the vault and verify actual task state, exclusive
participating-session bindings, checkpoints and binding retirement. They add no core
schema, verb or daemon and never authenticate local actors or bypass native approvals.

Separate host artifacts preserve package identity and exact tested parser contracts.
Native source and package checks pass. Historical host hook primitives, native
packaged MCP reads and a native Codex parser preview are observed; candidate host
hook execution, trust and activation remain
pending. Operator instructions and evidence limits are in [README](../../../../README.md#local-agent-harness-source-verified).
The [verification record](../../../research/local-agent-harness/2026-10-31-native-agent-harness-verification.md)
separates native source checks from observed client behavior. Source closure does not
approve installation, trust or enrollment; [plan.md](../../flows/delivery/plan-feature-sequence-2.md#local-harness-activation-follow-up)
retains those checks.

Built places (+code:): [native entrypoint](../../../../src/bin/shards-harness.rs),
[policy and core reader](../../../../src/bin/harness/runtime.rs),
[configuration coherence](../../../../src/bin/harness/reader.rs),
[receipt state](../../../../src/bin/harness/state.rs), [private storage](../../../../src/bin/harness/store.rs),
[host adapters](../../../../src/bin/harness/hosts.rs), [strict JSON and hashes](../../../../src/bin/harness/json.rs),
[TypeScript packager](../../../../scripts/package-agent-plugin.ts) and
[shared skills](../../../../plugins/shards/skills/using-shards/SKILL.md).

Parent: [Section index](README.md).
