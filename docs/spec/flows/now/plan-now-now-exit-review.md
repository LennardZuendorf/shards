---
type: flow
updated: 2026-11-02
---

# plan-now: Now exit review

## Now exit review

Target 2027-01-12. The review walks this list and records the result in
[product-roadmap.md](../../concepts/roadmap/README.md) § Decision log. Each MVP parity row passes only when its
evidence step passes in desktop-app/22 ([features/desktop-app/plan.md](../../features/desktop-app/plan.md)
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
[product-roadmap.md](../../concepts/roadmap/README.md) § KPIs.

Parent: [Section index](README.md).
