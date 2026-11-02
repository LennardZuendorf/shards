---
type: concept
updated: 2026-11-02
---

# product-roadmap: Todoist parity matrix (2/4)

| Capability | Todoist | Tier | Status | Arc | Owning requirement | Evidence |
|---|---|---|---|---|---|---|
| Quick add with parsing: project, section, label, p1–p4, assignee, natural dates, every / every!, deadline | All plans | MVP | building (in the app) | desktop-app | desktop-app R13; task-model-v2 R18 | `apps/desktop/src/lib/quickadd/parse.test.ts` (≥ 60 phrases, 95 % gate); /22 P1 |
| Inbox view (tasks with no project) | All | MVP | building | desktop-app | desktop-app R2 | /22 P2 |
| Today view, including overdue | All | MVP | building | desktop-app | desktop-app R3 | `apps/desktop/src/components/task/model.test.ts`; /22 P3 |
| Upcoming view | All | MVP | building | desktop-app | desktop-app R4 | `apps/desktop/src/lib/dates.test.ts`; /22 P4 |
| Project create, rename, colour and sidebar order | 5 free / 300 Pro | MVP | building (core have; app create, rename and colour built; drag order not built) | desktop-app | desktop-app R35 | `apps/desktop/src/components/task/project-actions.test.ts`; /22 P5 |
| Archive and delete a project | All | MVP | building (archive and delete built; archived tasks still show in Today and Upcoming) | desktop-app | desktop-app R35 | `project-actions.test.ts`; /22 P6 |
| Sections inside a project | All | MVP | building | task-model-v2, desktop-app | task-model-v2 R10; desktop-app R5 | `tests/task_v2_cli.rs`; /22 P7 |
| Subtasks | All | MVP | building | task-model-v2, desktop-app | task-model-v2 R9; desktop-app R11 | `tests/task_v2_cli.rs`; /22 P8 |
| Labels | All | MVP | building (core have as tags) | desktop-app | desktop-app R7 | /22 P9 |
| Four priorities | All | MVP | building (adds urgent) | task-model-v2 | task-model-v2 R1 | `tests/task_v2_cli.rs`; /22 P10 |
| Due date with optional time | All | MVP | building | task-model-v2 | task-model-v2 R2 | `tests/task_v2_cli.rs`; /22 P11 |
| Deadline separate from the due date | Pro | MVP | building, free | task-model-v2 | task-model-v2 R3 | `tests/task_v2_cli.rs`; /22 P12 |
| Recurrence from the due date and from completion | All | MVP | building | task-model-v2 | task-model-v2 R4, R5 | `tests/task_v2_cli.rs`; /22 P13 |
| Due-date filters (overdue, before, after) | All | MVP | building | task-model-v2 | task-model-v2 R12 | `tests/task_v2_cli.rs`; /22 P14 |
| List and board layouts | All | MVP | building | desktop-app | desktop-app R5, R6 | /22 P15 |
| Manual reorder by drag | All | MVP | building | task-model-v2, desktop-app | task-model-v2 R10; desktop-app R5 | /22 P16 |
| Markdown task description | All | MVP | building (core have; app editor built) | desktop-app | desktop-app R10 | /22 P17 |
| Completed log (last 30 days, all projects) with Reopen. A recurring task shows its latest occurrence only, because one file keeps one `completed`. | All | MVP | building (not built) | task-model-v2 (`completed`, reopen), desktop-app (view) | desktop-app R34; task-model-v2 R7, R8 | /22 P18 |
| Search across tasks, notes and memories | All | MVP | building (core have) | desktop-app | desktop-app R8 | `tests/search_cli.rs`; /22 P19 |
| Command palette, keyboard-first | Partial | MVP | building | desktop-app | desktop-app R14, R27 | /22 P20 |
| Multi-select and bulk actions: complete, move, priority, due, labels, delete, with one undo | All | MVP | building (not built) | desktop-app | desktop-app R36 | /22 P21 |
| Duplicate task | All | MVP | building (built in the task menu, unverified) | desktop-app | desktop-app R14 | /22 P22 |
| Undo of delete and complete; an app delete stays recoverable from the OS Trash after quit | All | MVP | building | desktop-app | desktop-app R25 | `crates/shards-host/tests/host_tools.rs`; /22 P23 |
| Light and dark themes | All | MVP | building | desktop-app | desktop-app R23 | /22 P24 |
| Reminders for timed tasks while the app window is open | All | MVP | building (not built) | desktop-app | desktop-app R40 | /22 P25 |
| Week start, 12/24-hour time and date order from the system locale, with overrides | All | MVP | building (week start hard-coded to Monday) | desktop-app | desktop-app R38 | `apps/desktop/src/lib/dates.test.ts`; /22 P26 |
| Accessibility: screen-reader names, VoiceOver flows, reduced motion, 200 % zoom | All | MVP | building (reduced motion built) | desktop-app | desktop-app R37 | axe-core check in the `frontend` CI job; /22 P27 |
| Dependencies (blocked by / blocking) | No | MVP | building (core have) | desktop-app | desktop-app R11 | `tests/task_dep_cli.rs`; /22 P28 |
| Assignee plus agent delegate, session state, and a "Waiting on me" queue | Agent acts as the user | MVP | building (core have: owner, claim) | desktop-app | desktop-app R16, R39; root R2 | `apps/desktop/src/components/agent/agent-utils.test.ts`; /22 P29 |
| Per-task activity with actor | 7 days free | MVP | building | desktop-app, task-model-v2 | desktop-app R12; task-model-v2 R19 | /22 P30 |
| Memory and scratch managers | No | MVP | building | desktop-app | desktop-app R18–R21 | `memory-utils.test.ts`, `scratch-utils.test.ts`; /22 P31 |
| Quick add parsing in the CLI (`shards task add "…"`) | n/a | v1 | planned | app-polish | AP9 | app-polish plan |
| Reminders from the tray and while the window is closed | All | v1 | planned | app-polish | AP1 | app-polish plan |
| Global quick-add window | All | v1 | planned | app-polish | AP2 | app-polish plan |
| Saved filters and a filter query language | 3 free / 150 Pro | v1 | planned | app-polish | AP3 | app-polish plan |
| View options: sort and group per view (date, priority, project, assignee), remembered per view | All | v1 | planned | app-polish | AP10 | app-polish plan |
| Task links: a `shards://task/<id>` URL scheme and "Copy link" | All | v1 | planned | app-polish | AP12 | app-polish plan |
| Calendar view | Pro | v1 | planned | app-polish | AP4 | app-polish plan |
| Importers: Todoist, Obsidian Tasks | n/a | v1 | planned | app-polish | AP5, AP6 | app-polish plan |
| Onboarding, keyboard map, signed app with bundled CLI and MCP, one-click agent connect | All | v1 | planned | app-polish | AP7, AP8 | app-polish plan |

Parent: [Section index](README.md).
