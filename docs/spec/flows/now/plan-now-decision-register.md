---
type: flow
updated: 2026-11-02
---

# plan-now: Decision register

## Decision register

Owner decisions that block a gate. Each has a recommended default. When no ruling is recorded by
the date in the last column, the default applies and is recorded in
[product-roadmap.md](../../concepts/roadmap/README.md) § Decision log as "default applied". The owner may still
reverse an applied default later, through a new unit.

| Id | Question | Recommended default | Gate it blocks | Decide by | Default applies if no ruling by |
|---|---|---|---|---|---|
| DR1 | Body precondition: may an app save overwrite a body that changed on disk? | No. Adopt `expected_body_sha256` on every body replace plus the `conflict` error kind (desktop-app tech.md § Core seams S2). | 16 (R26) | 2026-10-22 | 2026-10-22 |
| DR2 | Which browser origins may call `shards-host`? | Only the app's own origin and the one Vite origin the host is told about at start (`--allow-origin`, default `http://localhost:5173`), never any loopback port. Agents running Vite on 52xx pass their port. | 16 (R31) | 2026-10-22 | 2026-10-22 |
| DR3 | Host identity when `[core].me` is unset | The host ignores `$SHARDS_AGENT` (and `$MESH_AGENT`). With no `[core].me` it refuses every write with a `validation` error naming the setting, and the app shows first run (R23). | 16 (R32) | 2026-10-22 | 2026-10-22 |
| DR4 | Production CSP exceptions | Drop the `style-src` exception (`dangerousDisableAssetCspModification`). Allow `img-src https:` only for images the operator clicks to load; nothing loads remote content unasked. | 16 (R31, R22) | 2026-10-22 | 2026-10-22 |
| DR5 | May field undo overwrite a later write? | No. Hash-guard field undo and restore: undo is refused, naming the writer, when the file changed since (R25). | 16 (R25) | 2026-10-22 | 2026-10-22 |
| DR6 | Sign off actor stamps `created_by` / `updated_by` (task-model-v2 Open Question 2) | Sign off R19 as specified. It adds no flag, parameter or tool. | 15; root R2 and the "Per-task activity with actor" MVP row | 2026-10-22 | 2026-10-22 |
| DR7 | Sign off the sync surface: `shards sync` subcommands and the non-default `sync` build feature (sync Open Question 2) | Sign off as proposed in [features/sync/product.md](../../features/sync/product.md) § Open Questions. | 18 | 2027-01-12 (Now exit review) | 2027-01-12 |
| DR8 | Keep outcome notes on recurring finishes? (task-model-v2 Open Question 1) | Yes: one stamped entry under a reused `## Outcome` section when outcome text is given. | 15 | 2026-10-22 | 2026-10-22 |

Parent: [Section index](README.md).
