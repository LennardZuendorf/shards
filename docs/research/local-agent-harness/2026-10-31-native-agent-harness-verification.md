# Native agent harness verification

Date: 2026-10-31. The user-directed rewrite replaces the rejected Python runtime and tooling. Rust owns the entire deployed harness. TypeScript builds and tests its packages using the existing Node development toolchain. Installed hooks require neither Node nor Python.

## Executable checks

| Check | Actual result |
| --- | --- |
| Core and native Rust suite | 1630 passed, 0 failed |
| Shards host suite after shared JSON feature changes | 46 passed, 0 failed |
| TypeScript package tests | 7 passed, 0 failed |
| Strict TypeScript no-emit check | Exit 0, existing repository compiler and Node types |
| Workspace clippy excluding desktop | Exit 0 with warnings denied |
| Workspace formatting and diff checks | Exit 0 |
| Spec validation | 0 errors, 66 existing warnings |
| Independent native review and scoped fix review | Both findings addressed; no remaining findings |

Rust counts are test executions: importing the private harness modules into an integration crate repeats their unit cases. Coverage reports map all131 prior Python test names to native/TypeScript assertions; counts are not a model-obedience or reliability estimate.

Retained logs: /private/tmp/shards-native-verified-tests.log, /private/tmp/shards-native-verified-host-tests.log, /private/tmp/shards-native-workspace-clippy.log. The full suites use an isolated XDG_RUNTIME_DIR. Existing filesystem-event and loopback tests required normal execution approval; focused reproductions distinguished these environment denials from source regressions before the full reruns.

## Native artifacts

Both actual artifacts under /private/tmp/shards-native-packages-OWJIFU contain seven files: a native executable, target metadata, two skills and the selected host manifest/MCP/hook files. The current target is darwin/aarch64. Each native executable independently answered MCP initialize, listed exactly40tools and completed shards_health against a temporary vault. Target metadata records its SHA256; executable mode is0755. No script is packaged.

The actual installed app-bundled Codex0.165.0-alpha.1.2 read-only parser preview exposed all six hooks, server shards and both skills, with installed:false/enabled:false and no parse error. Minimal proof and source hashes are retained in [codex-package-preview.json](../../../plugins/shards/tests/fixtures/native/codex-package-preview.json). This is discovery evidence, not execution of candidate hooks by a host.

## Regressions and boundaries

Native subprocess tests exercise real MCP-produced claim/append results under both observed host envelopes, actor overrides, selected/ambient vault coherence, source and package recovery commands, runtime-directory symlink refusal and exact one-use grants. The state suite preserves strict required fields and JSON hashes, descriptor-anchored private writes, immutable callback context, retirement/rebinding and current-checkpoint capacity. The fixed first-publication lock path passed360fresh-anchor process-pair races; unexpected child errors cannot count as ownership conflicts.

Historical recorder-hook and Python-candidate observations remain labeled historical. Native candidate hooks have not been installed, trusted or executed by Codex or Claude Code. Actual client lifecycle acceptance, normal activation and live-project enrollment remain separately gated. Other OS/architecture combinations, native desktop conversation execution and universal hook delivery are not established here. This verification preceded the owner's approval to commit, push and update PR #41.
