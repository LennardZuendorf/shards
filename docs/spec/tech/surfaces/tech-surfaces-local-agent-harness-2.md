---
type: tech
applies: "**"
updated: 2026-11-02
---

# tech-surfaces: Local agent harness (2/2)

**Completion and exceptions.** Append verification evidence before finishing, including
recurring occurrences whose outcome text is not retained; use observed `expected_due`.
Verify actual canonical mutations before retiring a binding. An externally finished or
cancelled task blocks more work and generic progress; only a verified new `State: handoff`
checkpoint with `Changed`, `Checked`, `Remaining` and `Next` retires that observed terminal
binding. It does not invent a successful finish/cancel call. An operator exception is external,
one-use and bound to exact project/config, host, session, delegate, turn, tool and input digest.
Agents cannot self-grant. [Shell classification](../../../../src/bin/harness/shell.rs) distinguishes
grant invocations from literal search arguments. Grants preserve native permissions and
remain local cooperation, not authenticated identity.

**Private storage and compatibility.** Runtime data lives at
`${XDG_RUNTIME_DIR:-$HOME/.local/state}/shards/harness`. [Storage](../../../../src/bin/harness/store.rs)
validates raw path components through anchored descriptors, refuses symlinks, hardlinks and
non-regular records, bounds reads, publishes through exclusive temporary descriptors and
atomic rename/fsync, and uses permanent flock anchors with exclusive first publication.
[Strict JSON](../../../../src/bin/harness/json.rs) rejects duplicate keys and preserves version-1
sorted compact ASCII-escaped identity hashing, including Unicode/numeric goldens. Receipts
persist references, counters and hashes, never task bodies or raw tool arguments.

**Packaging and evidence.** The [TypeScript builder](../../../../scripts/package-agent-plugin.ts)
and [tests](../../../../scripts/package-agent-plugin.test.ts) use the existing Node development
toolchain and built-in modules only. Installed hooks contain the native executable and need
neither Node nor Python. Inputs are validated before exclusive creation of an absent output;
symlinks and existing outputs are refused. Claude and legacy-only Codex artifacts preserve
the Shards package name, their tested root placeholders, both skills and separate manifests.
Both plugin manifests follow the root release version. The builder validates input versions
against its managed plugin metadata instead of a literal historical version. Executable
mode is `0755`; `native-target.json` records OS, architecture and SHA256. Build for the
destination machine. Native policy tests are [runtime](../../../../tests/harness_runtime.rs),
[entrypoint edges](../../../../tests/harness_native_edges.rs), [state](../../../../src/bin/harness/state_tests.rs)
and [bundle](../../../../tests/bundle.rs). The [verification record](../../../research/local-agent-harness/2026-10-31-native-agent-harness-verification.md)
separates source/package checks, historical hook probes and native packaged MCP/parser
observations. Native candidate hook execution, installation, trust and live enrollment
remain pending in the [activation checklist](../../flows/delivery/plan-feature-sequence-2.md#local-harness-activation-follow-up).

Parent: [Section index](README.md).
