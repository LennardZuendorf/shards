---
type: plan-topic
parent: plan.md
scope: implementation
covers: Now-horizon decision register, owner actions, Now exit review checklist
updated: 2026-10-16
---

# Shards — Now-horizon gates

Owner decisions, owner-only actions and the exit checklist for the Now horizon (features 14–16).
Split out of [plan.md](plan.md) to keep the root plan within the length budget.

## Decision register

Owner decisions that block a gate. Each has a recommended default. When no ruling is recorded by
the date in the last column, the default applies and is recorded in
[product-roadmap.md](product-roadmap.md) § Decision log as "default applied". The owner may still
reverse an applied default later, through a new unit.

| Id | Question | Recommended default | Gate it blocks | Decide by | Default applies if no ruling by |
|---|---|---|---|---|---|
| DR1 | Body precondition: may an app save overwrite a body that changed on disk? | No. Adopt `expected_body_sha256` on every body replace plus the `conflict` error kind (desktop-app tech.md § Core seams S2). | 16 (R26) | 2026-10-22 | 2026-10-22 |
| DR2 | Which browser origins may call `shards-host`? | Only the app's own origin and the one Vite origin the host is told about at start (`--allow-origin`, default `http://localhost:5173`), never any loopback port. Agents running Vite on 52xx pass their port. | 16 (R31) | 2026-10-22 | 2026-10-22 |
| DR3 | Host identity when `[core].me` is unset | The host ignores `$SHARDS_AGENT` (and `$MESH_AGENT`). With no `[core].me` it refuses every write with a `validation` error naming the setting, and the app shows first run (R23). | 16 (R32) | 2026-10-22 | 2026-10-22 |
| DR4 | Production CSP exceptions | Drop the `style-src` exception (`dangerousDisableAssetCspModification`). Allow `img-src https:` only for images the operator clicks to load; nothing loads remote content unasked. | 16 (R31, R22) | 2026-10-22 | 2026-10-22 |
| DR5 | May field undo overwrite a later write? | No. Hash-guard field undo and restore: undo is refused, naming the writer, when the file changed since (R25). | 16 (R25) | 2026-10-22 | 2026-10-22 |
| DR6 | Sign off actor stamps `created_by` / `updated_by` (task-model-v2 Open Question 2) | Sign off R19 as specified. It adds no flag, parameter or tool. | 15; root R2 and the "Per-task activity with actor" MVP row | 2026-10-22 | 2026-10-22 |
| DR7 | Sign off the sync surface: `shards sync` subcommands and the non-default `sync` build feature (sync Open Question 2) | Sign off as proposed in [features/sync/product.md](features/sync/product.md) § Open Questions. | 18 | 2027-01-12 (Now exit review) | 2027-01-12 |
| DR8 | Keep outcome notes on recurring finishes? (task-model-v2 Open Question 1) | Yes: one stamped entry under a reused `## Outcome` section when outcome text is given. | 15 | 2026-10-22 | 2026-10-22 |

## Owner actions

Only the owner can do these; agents may not commit. Order follows gate 14: the trademark record
and the 0.3.0 bump are preconditions of the rename commit, so they come before it.

- [ ] **By 2026-10-22:** rule on DR1–DR6 and DR8, or let the defaults apply.
- [ ] **By 2026-10-22:** record the trademark knockout search (EUIPO, USPTO, DPMA; classes 9 and
  42) and the shards.app domain check in [product-roadmap.md](product-roadmap.md) § Decision log.
- [ ] **By 2026-10-23:** approve the 0.3.0 bump (shards-rebrand/6); `shards --version` prints
  `0.3.0`.
- [ ] **By 2026-10-24:** commit the rename alone (shards-rebrand/8 procedure). Gate 14 target.
- [ ] **By 2026-10-27:** commit the landed task-model-v2 code (15), rebased on the rename.
- [ ] **By 2026-10-28:** commit the desktop-app code (16), after 15.
- [ ] **At the Now exit review (2027-01-12):** record K20 and rule on DR7.

## Now exit review

Target 2027-01-12. The review walks this list and records the result in
[product-roadmap.md](product-roadmap.md) § Decision log. Each MVP parity row passes only when its
evidence step passes in desktop-app/22 ([features/desktop-app/plan.md](features/desktop-app/plan.md)
§ desktop-app/22, parity evidence steps) against a 15-DONE core. The owning requirement for each
row is in the parity matrix.

| MVP parity row | Evidence |
|---|---|
| Quick add with parsing | `apps/desktop/src/lib/quickadd/parse.test.ts`; /22 P1 |
| Inbox | /22 P2 |
| Today, including overdue | `apps/desktop/src/components/task/model.test.ts`; /22 P3 |
| Upcoming | `apps/desktop/src/lib/dates.test.ts`; /22 P4 |
| Project create, rename, colour and order | `apps/desktop/src/components/task/project-actions.test.ts`; /22 P5 |
| Archive and delete a project | /22 P6 |
| Sections | `tests/task_v2_cli.rs`; /22 P7 |
| Subtasks | `tests/task_v2_cli.rs`; /22 P8 |
| Labels | /22 P9 |
| Four priorities | `tests/task_v2_cli.rs`; /22 P10 |
| Due date with optional time | `tests/task_v2_cli.rs`; /22 P11 |
| Deadline | `tests/task_v2_cli.rs`; /22 P12 |
| Recurrence | `tests/task_v2_cli.rs`; /22 P13 |
| Due-date filters | `tests/task_v2_cli.rs`; /22 P14 |
| List and board layouts | /22 P15 |
| Manual reorder by drag | /22 P16 |
| Markdown task description | /22 P17 |
| Completed log with Reopen | /22 P18 |
| Search | `tests/search_cli.rs`; /22 P19 |
| Command palette, keyboard-first | /22 P20 |
| Multi-select and bulk actions | /22 P21 |
| Duplicate task | /22 P22 |
| Undo, and recovery from the OS Trash after quit | `crates/shards-host/tests/host_tools.rs`; /22 P23 |
| Light and dark themes | /22 P24 |
| In-window reminders | /22 P25 |
| Locale | `apps/desktop/src/lib/dates.test.ts`; /22 P26 |
| Accessibility | axe-core in the `frontend` CI job; /22 P27 |
| Dependencies | `tests/task_dep_cli.rs`; /22 P28 |
| Assignee, delegate, session state, "Waiting on me" | `apps/desktop/src/components/agent/agent-utils.test.ts`; /22 P29 |
| Per-task activity with actor | /22 P30 |
| Memory and scratch managers | `memory-utils.test.ts`, `scratch-utils.test.ts`; /22 P31 |

Beside the rows, the review records K1, K2, K3, K6, K20 and K22 from
[product-roadmap.md](product-roadmap.md) § KPIs.
