---
type: concept
updated: 2026-11-19
---

# product-roadmap: Todoist parity matrix (2/4)

| Capability | Todoist | Tier | Status | Arc | Owning requirement | Evidence |
|---|---|---|---|---|---|---|
| Quick add with parsing: project, section, label, p1–p4, assignee, natural dates, every / every!, deadline | All plans | MVP | have | desktop-app | desktop-app R13; task-model-v2 R18 | `apps/desktop/src/lib/quickadd/parse.test.ts`; `corpus.test.ts` (72/72 non-todo phrases = 100 %, P1 gate ≥ 95 %); `app/quickadd-submit.test.ts`; /22 P1 |
| Inbox view (tasks with no project) | All | MVP | have | desktop-app | desktop-app R2 | `apps/desktop/src/views/tasks/inbox-view.test.ts`; /22 P2 |
| Today view, including overdue | All | MVP | have | desktop-app | desktop-app R3 | `components/task/group-specs.test.ts` (`todaySets`/`todayGroups`); `lib/dates.test.ts` (overdue honours time of day); /22 P3 |
| Upcoming view | All | MVP | have | desktop-app | desktop-app R4 | `components/task/group-specs.test.ts` (`upcomingRange`/`upcomingGroups`); /22 P4 |
| Project create, rename, colour and sidebar order | 5 free / 300 Pro | MVP | building (core have; app create, rename and colour built; sidebar drag order and a palette "New project" entry not built) | desktop-app | desktop-app R35 | `apps/desktop/src/components/task/project-actions.test.ts`; /22 P5 |
| Archive and delete a project | All | MVP | building (archive, unarchive and delete built and tested; a task in an archived project still reaches the Waiting-on-me queue) | desktop-app | desktop-app R35 | `components/task/project-lifecycle.test.tsx`; `group-specs.test.ts` (archived projects leave Today, Upcoming and Label); /22 P6 |
| Sections inside a project | All | MVP | have | task-model-v2, desktop-app | task-model-v2 R10; desktop-app R5 | `group-specs.test.ts` (section groups, empty section kept); `section-store.test.ts`; `tests/task_v2_cli.rs`; /22 P7 |
| Subtasks | All | MVP | have | task-model-v2, desktop-app | task-model-v2 R9; desktop-app R11 | `components/task/model.test.ts` (buildTree/flattenTree, indent/outdent); `tests/task_v2_cli.rs`; /22 P8 |
| Labels | All | MVP | have | desktop-app | desktop-app R7 | `label-actions.test.ts`; `views/tasks/label-view.test.tsx`; `task-row-labels.test.tsx`; /22 P9 |
| Four priorities | All | MVP | have | task-model-v2 | task-model-v2 R1 | `tests/task_v2_cli.rs` (`priority_sorts_urgent_high_normal_low_then_unset`); `lib/quickadd/parse.test.ts` (p1–p4 → urgent…low); /22 P10 |
| Due date with optional time | All | MVP | have | task-model-v2 | task-model-v2 R2 | `tests/task_v2_cli.rs`; `lib/dates.test.ts` (hasTime, "Today 17:00", a moved date keeps its time); /22 P11 |
| Deadline separate from the due date | Pro | MVP | building (core have, free; Today lists by `due` only, so a deadline-today task is absent, and no test renders the deadline chip) | task-model-v2 | task-model-v2 R3 | `tests/task_v2_cli.rs`; /22 P12 |
| Recurrence from the due date and from completion | All | MVP | have | task-model-v2 | task-model-v2 R4, R5 | `tests/task_v2_cli.rs` (recurrence suite); `lib/dates.test.ts` (recur); `lib/quickadd/parse.test.ts` (every, every!); /22 P13 |
| Due-date filters (overdue, before, after) | All | MVP | have | task-model-v2 | task-model-v2 R12 | `tests/task_v2_cli.rs` (`list_filters_by_due_window_overdue_parent_and_section`); `lib/view-options.test.ts`; `shards task list --overdue/--due-before/--due-after`; /22 P14 |
| List and board layouts | All | MVP | have | desktop-app | desktop-app R5, R6 | `views/tasks/project-view-layout.test.tsx`; `components/task/model.test.ts` (board columns, statusDrop); /22 P15 |
| Manual reorder by drag | All | MVP | building (the drop path has no test: `model.test.ts` covers `planReorder`, nothing drives `TaskList`'s `onDragEnd`) | task-model-v2, desktop-app | task-model-v2 R10; desktop-app R5 | /22 P16 |
| Markdown task description | All | MVP | have | desktop-app | desktop-app R10 | `components/shared/safe-markdown.test.tsx`; `app/detail-drafts.test.ts`; `crates/shards-host/tests/host_tools.rs` (`set_body_keeps_frontmatter_and_bumps_updated`); /22 P17 |
| Completed log (last 30 days, all projects) with Reopen. A recurring task shows its latest occurrence only, because one file keeps one `completed`. | All | MVP | building (not built: no Completed view; a project's completed tail is not a cross-project log) | task-model-v2 (`completed`, reopen), desktop-app (view) | desktop-app R34; task-model-v2 R7, R8 | /22 P18 |
| Search across tasks, notes and memories | All | MVP | have | desktop-app | desktop-app R8 | `tests/search_cli.rs`; `views/tasks/search-state.test.ts`; `shards search` returned hits in all three spaces; /22 P19 |
| Command palette, keyboard-first | Partial | MVP | have | desktop-app | desktop-app R14, R27 | `apps/desktop/src/app/palette-selection.test.tsx`; /22 P20 |
| Multi-select and bulk actions: complete, move, priority, due, labels, delete, with one undo | All | MVP | have | desktop-app | desktop-app R36 | `components/task/bulk.test.tsx` (all six actions, one undo each); `selection.test.ts`; /22 P21 |
| Duplicate task | All | MVP | have | desktop-app | desktop-app R14 | `apps/desktop/src/components/task/duplicate.test.ts`; /22 P22 |
| Undo of delete and complete; an app delete stays recoverable from the OS Trash after quit | All | MVP | building (undo of delete and complete built and tested; the OS-Trash half is not built — desktop-app/31 D6, so a deleted file is gone after quit) | desktop-app | desktop-app R25 | `components/task/cancel-undo.test.ts`; `crates/shards-host/tests/host_tools.rs`; /22 P23 |
| Light and dark themes | All | MVP | have | desktop-app | desktop-app R23 | `lib/appearance.test.ts`; `lib/contrast.test.ts` (AA on every stone, both modes); /22 P24 |
| Reminders for timed tasks while the app window is open | All | MVP | building (not built: no reminder code in the app or the host) | desktop-app | desktop-app R40 | /22 P25 |
| Week start, 12/24-hour time and date order from the system locale, with overrides | All | MVP | building (week start hard-coded to Monday; no 12/24-hour time or date-order setting, no overrides) | desktop-app | desktop-app R38 | `group-specs.ts` and `UpcomingView.tsx` pin `weekStartsOn: 1`; `dates.test.ts` has no week-start or 12/24 h case; /22 P26 |
| Accessibility: screen-reader names, VoiceOver flows, reduced motion, 200 % zoom | All | MVP | building (axe-core 0 violations over 12 view × mode scans, 200 % zoom 0 findings and reduced motion pinned; the VoiceOver flows in P27 are macOS-only) | desktop-app | desktop-app R37 | `apps/desktop/a11y/run.mjs` (the `a11y (axe-core)` CI job); `lib/motion.test.ts`; /22 P27 |
| Dependencies (blocked by / blocking) | No | MVP | have | desktop-app | desktop-app R11 | `tests/task_dep_cli.rs`; `components/task/model.test.ts` (blocked board status); `lib/view-options.test.ts` (readiness filter); /22 P28 |
| Assignee plus agent delegate, session state, and a "Waiting on me" queue | Agent acts as the user | MVP | have | desktop-app | desktop-app R16, R39; root R2 | `components/agent/agent-utils.test.ts`; `lib/handoff-context.test.ts`; `lib/scope.test.ts`; /22 P29 |
| Per-task activity with actor | 7 days free | MVP | building (Activity shows created, claimed and comment events with an actor; its "Completed" and "Last updated" rows carry none, and no test mounts the list) | desktop-app, task-model-v2 | desktop-app R12; task-model-v2 R19 | /22 P30 |
| Memory and scratch managers | No | MVP | have | desktop-app | desktop-app R18–R21 | `views/memories/memory-manager.test.tsx`; `views/scratch/scratch-manager.test.tsx`; /22 P31 |
| Quick add parsing in the CLI (`shards task add "…"`) | n/a | v1 | planned | app-polish | AP9 | app-polish plan |
| Reminders from the tray and while the window is closed | All | v1 | planned | app-polish | AP1 | app-polish plan |
| Global quick-add window | All | v1 | planned | app-polish | AP2 | app-polish plan |
| Saved filters and a filter query language | 3 free / 150 Pro | v1 | planned | app-polish | AP3 | app-polish plan |
| View options: sort and group per view (date, priority, project, assignee), remembered per view | All | v1 | have | app-polish | AP10 | `lib/view-options.test.ts`; `lib/ui-contract.test.ts` (per-view preference key) |
| Task links: a `shards://task/<id>` URL scheme and "Copy link" | All | v1 | planned | app-polish | AP12 | app-polish plan |
| Calendar view | Pro | v1 | planned | app-polish | AP4 | app-polish plan |
| Importers: Todoist, Obsidian Tasks | n/a | v1 | planned | app-polish | AP5, AP6 | app-polish plan |
| Onboarding, keyboard map, signed app with bundled CLI and MCP, one-click agent connect | All | v1 | planned | app-polish | AP7, AP8 | app-polish plan |

Parent: [Section index](README.md).
