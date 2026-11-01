---
type: feature-plan
feature: task-model-v2
sibling: tech.md
parent: ../../plan.md
updated: 2026-10-31
---

# Feature: Task Model v2 — Implementation Plan

This feature delivers the Todoist-parity task model in the core. The work runs in this order:

1. Model and calendar values.
2. The pure recurrence engine.
3. The domain write path, reopen and the recurring finish.
4. List predicates and the rest rule.
5. CLI and MCP surfaces, which ship together for parity.
6. `[[members]]`.
7. Docs and compatibility proof.

The quick-add parser (R18) belongs to desktop-app. This plan only checks that the parser uses the
field contract.

> For agentic workers: run the units in Seq order with superpowers:executing-plans. Some code has
> already landed in the working tree from a parallel pass. Each unit's **Status** says what exists.
> Finish the unit against its Test scenarios; do not rewrite landed code that already meets the
> contract.

**Parent:** [../../plan.md](../../plan.md)
**Requirements:** [product.md](product.md)
**Architecture:** [tech.md](tech.md)

**Feature gate:** Starts when shards-rebrand (14) is DONE (root plan § Feature Sequence). Both
features edit `src/cli` and `src/mcp`. Landed model and domain code waits on the rebrand commit
before it is committed.

---

## Problem Frame

The v1 model treats every v2 key as an unknown key. It round-trips the key but never validates,
filters or sorts on it.

v2 has to make nine fields first-class without breaking 0.2 vaults, pinned JSON key order or the
single-entity write rule. Recurrence is the only behaviour that is not just field CRUD: finish
must advance a task in place instead of closing it.

Units run from pure code outward:

- pure code first, so the date math is proven before any I/O;
- then domain writes;
- then reads;
- then both surfaces in one unit each, so CLI and MCP cannot drift.

---

## Requirements Trace

| ID | Requirement | Units |
|---|---|---|
| R1 | [Four priorities](product.md#requirement-four-priorities-r1) | task-model-v2/1, task-model-v2/6, task-model-v2/7 |
| R2 | [Due date with optional time](product.md#requirement-due-date-with-optional-time-r2) | task-model-v2/1, task-model-v2/3, task-model-v2/6 |
| R3 | [Deadline separate from due](product.md#requirement-deadline-separate-from-due-r3) | task-model-v2/1, task-model-v2/3, task-model-v2/6 |
| R4 | [Recurrence rule](product.md#requirement-recurrence-rule-r4) | task-model-v2/2, task-model-v2/3, task-model-v2/6 |
| R5 | [Finishing a recurring task advances it](product.md#requirement-finishing-a-recurring-task-advances-it-r5) | task-model-v2/2, task-model-v2/4, task-model-v2/6, task-model-v2/7 |
| R6 | [Ending a series](product.md#requirement-ending-a-series-r6) | task-model-v2/4, task-model-v2/6, task-model-v2/7 |
| R7 | [Completion timestamp](product.md#requirement-completion-timestamp-r7) | task-model-v2/4 |
| R8 | [Reopen](product.md#requirement-reopen-r8) | task-model-v2/4, task-model-v2/6 |
| R9 | [Subtasks](product.md#requirement-subtasks-r9) | task-model-v2/3, task-model-v2/6 |
| R10 | [Sections and manual order](product.md#requirement-sections-and-manual-order-r10) | task-model-v2/3, task-model-v2/5, task-model-v2/6 |
| R11 | [Clearing a field](product.md#requirement-clearing-a-field-r11) | task-model-v2/3, task-model-v2/6, task-model-v2/7 |
| R12 | [Date, parent and section filters](product.md#requirement-date-parent-and-section-filters-r12) | task-model-v2/5, task-model-v2/6, task-model-v2/7 |
| R13 | [Sort keys](product.md#requirement-sort-keys-r13) | task-model-v2/1, task-model-v2/6 |
| R14 | [Recurring tasks rest until due](product.md#requirement-recurring-tasks-rest-until-due-r14) | task-model-v2/5 |
| R15 | [Agent parity](product.md#requirement-agent-parity-r15) | task-model-v2/7 |
| R16 | [Existing vaults keep working](product.md#requirement-existing-vaults-keep-working-r16) | task-model-v2/1, task-model-v2/9 |
| R17 | [Members roster](product.md#requirement-members-roster-r17) | task-model-v2/8 |
| R18 | [Quick-add grammar](product.md#requirement-quick-add-grammar-r18) | task-model-v2/9 |
| R19 | [Actor stamps](product.md#requirement-actor-stamps-r19) | task-model-v2/3, task-model-v2/6, task-model-v2/7 |

---

## Key Technical Decisions

1. **Sparse, appended v2 keys.** v1 files keep their shape and their JSON prefix, so goldens and
   compat tests stay valid. Rationale: [tech.md](tech.md) § Task model v2 invariants.
2. **Lenient read, strict write.** A foreign `due: next week` must not hide a task. The v1
   rejection rules are unchanged.
3. **Floating calendar values, one clock.** `today_local()` is the only `Local::now`. `recur.rs`
   is pure, and tests inject `today`.
4. **Advance in place, not spawn.** This keeps the single-entity write rule (decision brief, task
   model v2). The cost: finish on a recurring task is not idempotent. Its MCP annotation becomes
   `Write`.
5. **Absolute inputs only on CLI and MCP.** Natural language belongs to quick add. This keeps one
   parser per grammar and matches the landed `Due::parse`.
6. **Unset priority keeps the "unranked" bucket**, after `low`, as in v1. Clients show it as
   `normal`. Folding unset into normal would reorder `task next` in existing vaults with no
   user-visible benefit.
7. **Members widen the roster. They do not replace it.** `[tasks].collections` stays valid.
   Identity is still a local spelling convention.
8. **Actor stamps in the one write funnel.** `tasks::persist` stamps `updated_by`, so no verb can
   forget it. The stamp comes from `Config::agent()`, never from `--owner` or a claimer argument
   (R19). The stamps need owner sign-off (product § Open Questions 2).

---

## Global Constraints

- Gates for every unit: `cargo fmt --all --check`,
  `cargo clippy --all-targets --locked -- -D warnings`, `cargo test -p shards`.
- No new dependency. `chrono` with `clock` is enough.
- No `unwrap`, `expect`, `panic` or byte-slicing in `src/`. No `sort_unstable` in `select.rs`.
- Every validation runs before any lock or write. Every no-op is byte-identical, and tests assert it.
- Error texts are the ones in [tech.md](tech.md) § Calendar and recurrence › Error texts. CLI and MCP tests assert the same
  strings.
- The MCP tool count stays 40. Only `host_*` tools (desktop-app) are new elsewhere.

---

## Unit IDs

Units are `task-model-v2/n`. They are never renumbered. Cite them in commits, for example
`feat(task): task-model-v2/4 recurring finish`.

---

### task-model-v2/1 — Model, priorities, calendar rendering, sort keys

**Status:** DONE (2026-10-16). Evidence: `cargo test -p shards` → passed,
including `tests/task_v2_cli.rs::{priority_sorts_urgent_high_normal_low_then_unset,
sort_by_due_puts_undated_last_and_sort_by_order_ranks_manually,
a_task_without_v2_fields_keeps_the_v1_shape}`. The R19 stamps (24 keys) belong to
task-model-v2/3 and are not built.

**Goal:** `Task` carries the v2 fields with tolerant reads, the four-level priority table, 22-key
canonical order (24 once task-model-v2/3 adds the R19 stamps), raw calendar rendering, and the `due`/`order` sort keys.

**Requirements:** R1, R2, R3, R13, R16

**Dependencies:** —

**Files:**

```
src/model/task.rs     # TASK_PRIORITIES, priority_rank, TASK_FIELDS, TASK_V1_FIELD_COUNT, Task, from_meta, Sortable
src/model/common.rs   # TIMESTAMP_FIELDS += completed; CALENDAR_FIELDS
src/render.rs         # owned_value_to_json
src/domain/select.rs  # SortKey::{Due,Order}, SortValue::{Due,Order}, due_key, order_cmp
src/domain/tasks.rs   # the three pinned tests → v2 expectations
```

**Test scenarios:**

- Priority ranks are urgent 0, high 1, normal 2, low 3. Unset and unknown are both 4.
- The `urgent` value is accepted on write.
- `invalid priority: 'p1' (use urgent, high, normal, low)`.
- A new task created with no v2 field and no actor has exactly the first 14 `TASK_FIELDS`, and no
  v2 key is written.
- `due: next week` and `order: abc` still admit the task, with the fields reading as `None`.
- JSON renders `due: 2026-10-16T09:30` verbatim, not `…:00`. `completed` renders as `…Z`.
- `--sort due` puts timed before all-day on the same date, and undated tasks last.
- `--sort order` puts `None` last and breaks ties by created.

**Verification:** `cargo test -p shards --lib -- model::task domain::select domain::tasks` → 0
failed.

---

### task-model-v2/2 — Recurrence engine

**Status:** DONE (2026-10-16). The subset grew `BYMONTH` (yearly) and negative `BYMONTHDAY`;
drift is solved at finish time by `Advance::rule` (the clamp pin), so `Rule::pin_monthly` is
superseded. `Rule::first_on_or_after` is not built; only the task-model-v2/3 due default needs it.
Evidence: `cargo test -p shards --lib domain::recur` (in the 1502), and
`tests/task_v2_cli.rs::{a_monthly_repeat_on_day_31_survives_a_short_month,
a_yearly_repeat_on_feb_29_returns_in_the_next_leap_year,
a_completion_anchored_daily_repeat_restarts_from_today}`.

**Goal:** One pure module parses, canonicalises and advances the RRULE subset.

**Requirements:** R4, R5

**Dependencies:** —

**Files:**

```
src/domain/recur.rs   # + pin_monthly, first_on_or_after; unit tests
src/domain/mod.rs     # pub mod recur (landed)
```

**Test scenarios** (table-driven, fixed `today`):

- Parse and canonicalise:
  - `freq=weekly;byday=we,mo` → `FREQ=WEEKLY;BYDAY=MO,WE`
  - `RRULE:FREQ=DAILY;INTERVAL=1` → `FREQ=DAILY`
- Rejections: `COUNT`, `UNTIL`, a duplicate `FREQ`, `INTERVAL=0`, `INTERVAL=1001`,
  `BYDAY` with `DAILY`, `BYMONTHDAY=0` and `BYMONTHDAY=32`. Each produces the exact message in
  [tech.md](tech.md).
- `advance` from due:
  - due Mon 2026-10-12, weekly MO, today 2026-10-15 → 2026-10-19
  - finishing early (due tomorrow) → the occurrence after tomorrow
- `advance` from completion: daily interval 3, today 2026-10-15 → 2026-10-18.
- A timed due keeps its time. `delta_days` is correct, so the deadline shifts.
- Monthly BYMONTHDAY=31: Jan 31 → Feb 28 → Mar 31. `BYMONTHDAY=-1` gives the last day.
- `pin_monthly`: MONTHLY with no day, due 2026-01-31 → `BYMONTHDAY=31`.
- `first_on_or_after`: weekly MO, Thursday 2026-10-15 → 2026-10-19. On a Monday, it returns that
  same Monday.
- A 10-year-overdue daily task advances in one call (the skip-ahead bound).

**Verification:** `cargo test -p shards --lib -- domain::recur` → 0 failed.

---

### task-model-v2/3 — Domain write path

**Status:** PARTIAL (2026-10-16). Landed: `v2_edits`, `apply_edits`, `validate_parent` and
`parse_order`, plus the `""` clear for `priority` and `project`. Evidence:
`tests/task_v2_cli.rs::{new_writes_every_v2_field_and_get_returns_them_in_canonical_order,
update_sets_and_an_empty_string_clears, invalid_values_exit_two_and_write_nothing,
parent_rejects_self_and_cycles}`.

To do (each checked against the binary on 2026-10-16):

- the cross-field rules (`recur requires due`, `recur_from requires recur`, clearing `recur` also
  clears `recur_from`): `task new x --recur FREQ=DAILY` and `--recur-from completion` alone are
  both accepted today;
- the due default from `first_on_or_after` on create;
- ~~`pin_monthly`~~ superseded by the finish-time clamp pin (task-model-v2/2);
- no-op detection in `update`: a repeated `task update <id> --section A` bumps `updated` again;
- the R19 actor stamps: `created_by` and `updated_by` appended to `TASK_FIELDS` (24 keys), and
  `persist(.., actor)` called by every task writer.

**Goal:** Create and update validate and write every v2 field sparsely, before any lock. Every task
write records its actor.

**Requirements:** R2, R3, R4, R9, R10, R11, R19

**Dependencies:** task-model-v2/1, task-model-v2/2

**Files:**

```
src/domain/tasks.rs   # NewTask, UpdateTask, create, update, v2_edits, validate_parent, persist(.., actor), unit tests
src/model/task.rs     # TASK_FIELDS += created_by, updated_by; Task fields; lenient read
src/domain/deps.rs    # the blocks mirror write passes the actor
```

**Test scenarios:**

- A create with every v2 field writes them in `TASK_FIELDS` order after `blocked_by`.
- Invalid `due`, `deadline`, `recur`, `recur_from` or `order` writes nothing. Each case is checked
  with a directory listing.
- Parent errors: unknown, self, and a cycle (`parent cycle: A -> B -> A`). None of them writes.
- `recur` without `due`, on create or on an update of a task with no due date → due is the first
  occurrence on or after today.
- Clearing `due` on a recurring task → `recur requires due`. Clearing `recur` also removes
  `recur_from`.
- An `update` that changes nothing is byte-identical, and `updated` is untouched.
- `--priority ""` and `--project ""` write null.
- Create with actor `flights-agent` and owner `alice` → `created_by` and `updated_by` are
  `flights-agent`, `owner` is `alice`.
- A later update by `alice` changes `updated_by` only. `created_by` never changes.
- A no-op update by another actor leaves the file byte-identical, `updated_by` included.
- A write with no actor removes `updated_by`. A create with no actor writes no stamp.
- Claim, release, finish, append and the `blocks` mirror each set `updated_by`.
- A v1 file with no stamps reads as valid and stays byte-identical after reads.

**Verification:** `cargo test -p shards --lib -- domain::tasks domain::deps model::task` → 0
failed.

---

### task-model-v2/4 — Finish, final, completed, reopen

**Status:** PARTIAL (2026-10-16). Landed: `terminate_with` with the recurring branch,
`completed` on finish, `Terminated.{next_due, warnings}`, the `expected_due` precondition, the
claim release, and `reopen`. A corrupt stored rule closes the task with a warning (product R5
scenario changed to match). Evidence: `tests/task_v2_cli.rs::{finishing_a_recurring_task_advances_due_and_deadline_and_keeps_it_open,
expected_due_makes_a_retried_recurring_finish_a_no_op,
a_hand_edited_invalid_recur_never_blocks_a_finish, reopen_moves_a_done_task_back_and_clears_completed}`.

To do:

- `final_` parameter (`--final` / MCP `final`);
- ~~the `invalid recur on <id>` message with the `--final` hint~~ replaced by the delivered
  close-with-warning behaviour.

**Goal:** Finish advances recurring tasks in place, `--final` ends a series, and reopen restores a
terminal task.

**Requirements:** R5, R6, R7, R8

**Dependencies:** task-model-v2/3

**Files:**

```
src/domain/tasks.rs   # terminate_report(.., final_), reopen, unit tests
src/domain/deps.rs    # test call sites of terminate (signature unchanged via the wrapper)
```

**Test scenarios:**

- Each product R5 scenario at domain level:
  - weekly from due;
  - every! from completion;
  - time and deadline shift;
  - claim cleared;
  - short-month clamp;
  - the body is byte-identical even when outcome text is passed;
  - a corrupt rule refuses and leaves the file byte-identical.
- A recurring finish stays in `open/` and reports `unblocked == []`. Its dependent stays blocked.
- `final_ = true` → done, moved, `## Outcome`, `completed`, no `next_due`.
- A cancel on a recurring task → cancelled and moved. `completed` is absent.
- Reopen:
  - done → open, moved back, with no `completed` and no `claimed_by`;
  - claimed → refused;
  - `--status done` → refused;
  - a repeat on a stranded file (status open in `done/`) moves it only.

**Verification:** `cargo test -p shards --lib -- domain::tasks domain::deps` → 0 failed.

---

### task-model-v2/5 — List predicates and the rest rule

**Status:** PARTIAL (2026-10-16). Landed: `DueFilter` (`before`, `after`, timed `overdue`,
`has_due`) applied after the readiness snapshot (defect fixed:
`domain::tasks::tests::due_filters_never_hide_an_undated_blocker_from_readiness`), exact-match
`parent` and `section`. Evidence: `tests/task_v2_cli.rs::list_filters_by_due_window_overdue_parent_and_section`.

To do:

- `TaskQuery` with `Sel` for parent and section (`none` today matches the literal value);
- the rest rule in `Availability::Ready`;
- `deps::readiness_all` (O(n²) readiness on `--ready`/`--blocked`, root plan gap).

**Goal:** `task list` filters by due window, overdue, has-due, parent and section, and resting
recurring tasks drop out of ready work.

**Requirements:** R10, R12, R14

**Dependencies:** task-model-v2/1

**Files:**

```
src/domain/tasks.rs   # TaskQuery, Sel, list_with, rest rule, unit tests
```

**Test scenarios:**

- Window: `--due-after 2026-10-14 --due-before 2026-10-16` keeps both 2026-10-15 tasks, the
  timed one included.
- Overdue keeps an open task due yesterday. It drops a done one and one due today at 08:00.
- `--ready --has-due`: a blocked task whose blocker has no due date is **not** listed (the
  regression test for the defect).
- `--parent none` and `--section none` keep only top-level tasks, or only tasks with no section.
- `--limit 1 --overdue` returns an overdue task even when newer non-overdue tasks exist (predicates
  run before the limit).
- A daily recurring task due tomorrow is absent from `Availability::Ready` and from `task next`.
  The same task without `recur` is present.

**Verification:** `cargo test -p shards --lib -- domain::tasks domain::deps` → 0 failed.

---

### task-model-v2/6 — CLI surface

**Status:** PARTIAL (2026-10-16). Landed: the new/update/list flags (incl. `--has-due`), the six
sort keys, `task finish --expected-due`, and the `next_due` / `warnings` extras. Evidence:
`shards task {new,update,list,finish} --help` and `tests/task_v2_cli.rs`. Still missing: `--final`,
`none` for `--parent`/`--section`, and the binary-level R19 stamp test.

**Goal:** Every v2 flag on `task new`, `update`, `finish` and `list`, with sort keys, report extras
and meta lines.

**Requirements:** R1, R2, R3, R4, R5, R6, R8, R9, R10, R11, R12, R13, R19

**Dependencies:** task-model-v2/3, task-model-v2/4, task-model-v2/5

**Files:**

```
src/cli/mod.rs          # TaskSub::{New,Update,Finish,List} args, help text
src/cli/task.rs         # TASK_SORT_KEYS (6), dispatch mapping, terminate_report, next_due notice, meta_lines
tests/task_v2_cli.rs    # NEW (TZ=UTC; relative and far-past/far-future fixtures)
tests/task_cli.rs       # priority message, sort-key message, key-order assertion
```

**Test scenarios:**

- Every product scenario for R1–R14 that names a `shards task …` command, run through the binary.
  This includes the exact error strings and exit codes.
- `task finish <recurring> --json` → `{"id","status":"open","next_due",…,"updated"}`.
- Human mode prints `finished <id>` and the stderr notice `next due: <due>`.
- `task get` human output keeps the 14 pinned lines and appends the v2 lines that are present.
- `--has-due --sort due --limit 5` on a mixed vault gives the expected order.
- `SHARDS_AGENT=flights-agent shards task new "x" --owner alice --json` → `created_by` and
  `updated_by` are `flights-agent`. No flag sets a stamp.

**Verification:** `cargo test -p shards --test task_v2_cli --test task_cli --test task_dep_cli` → 0
failed. `cargo run -q -- task list --help` lists the new flags.

---

### task-model-v2/7 — MCP surface

**Status:** PARTIAL (2026-10-16). Landed in `src/mcp/schema.rs` and `src/mcp/tools.rs`: the new
params, `expected_due` on `shards_task_finish`, `order` as `OptNumOrClear` on `shards_task_update`,
and `Ann::Write` on `shards_task_finish`. Evidence:
`tests/task_v2_cli.rs::{the_mcp_schemas_carry_the_v2_parameters,
mcp_round_trips_v2_fields_filters_and_a_recurring_finish}`. Still missing: `final`, and `none`
for `parent`/`section`.

**Goal:** CLI ↔ MCP parity for every v2 parameter, plus the finish annotation change.

**Requirements:** R1, R5, R6, R11, R12, R15, R19

**Dependencies:** task-model-v2/6

**Files:**

```
src/mcp/schema.rs        # params on shards_task_{new,update,finish,list}; shards_task_finish ann → Write; descriptions
src/mcp/tools.rs         # task_new, task_update, task_list (TaskQuery), terminate (terminate_report, final, next_due)
src/mcp/instructions.rs  # one line: recurring finish advances; do not retry blindly
tests/mcp_cli.rs         # schema shape, enums, annotation, round trips, error-text parity
```

**Test scenarios:**

- `tools/list`: still 40 tools. `priority` enum = urgent, high, normal, low. `recur_from` enum =
  due, completion. `status` enum = open.
- `shards_task_finish` has `idempotentHint: false`. The existing annotation test changes on
  purpose, and the commit says so.
- Round trip: create with every v2 field → get returns them verbatim.
- Update with `due: ""` removes it. Update with `due: null` leaves it.
- `priority: "p1"` gives the same error text as the CLI.
- Recurring finish returns `next_due`. `final: true` closes the task.
- `shards_task_list` with `overdue`, `parent: "none"` and `sort: "due"` agrees with the CLI on the
  same vault.
- `shards_task_update` `order`: `1.5` sets it, `"2"` is parsed, `""` clears it.
- `shards_task_new` with `owner: "alice"` under `[core].agent = "flights-agent"` stamps
  `flights-agent`. No tool has a `created_by` or `updated_by` param.

**Verification:** `cargo test -p shards --test mcp_cli` → 0 failed.

---

### task-model-v2/8 — Members roster

**Status:** NOT STARTED in the core (2026-10-16). `src/config.rs` does not read `[[members]]` or
`[core].me`. A lenient display-only reader lives in `crates/shards-host/src/members.rs`
(desktop-app, `host_members`); it does not widen owner validation.

**Goal:** `[[members]]` parses, validates, shows in `config show`, and widens owner validation.

**Requirements:** R17

**Dependencies:** —

**Files:**

```
src/config.rs           # Member, MemberKind, Config.members, from_table, unit tests
src/domain/owner.rs     # union roster, unit tests
src/cli/admin.rs        # config show prints members
config.example.toml     # documented [[members]] example
tests/admin_cli.rs      # config show; bad entries
tests/bundle.rs         # config.example.toml still loads
```

**Test scenarios:**

- A member id is accepted as an owner when `collections` is non-empty.
- A stranger is still refused. When both lists are empty, the roster stays open.
- Each error reason is reported with its 1-based entry number: missing id, whitespace in the id,
  duplicate id, bad kind, bad color.
- `name` defaults to the id.
- `config set members.x` is refused (unchanged surface).

**Verification:** `cargo test -p shards --lib -- config domain::owner` and
`cargo test -p shards --test admin_cli --test bundle` → 0 failed.

---

### task-model-v2/9 — Docs, compatibility proof, quick-add contract check

**Status:** PARTIAL (2026-10-16). Landed: README (task flags, priorities, recurring finish) and
the SKILL.md command surface (`cargo test -p shards --test bundle` green). Open: `src/mcp/instructions.rs`,
`docs/concepts.md`, the corpus proof (`tests/compat_corpus.rs` has no v2 assertion), and the
quick-add contract check (the desktop parser differs: see product R18 note).

**Goal:** Prove R16 on the corpus. Document the model for humans and agents. Confirm that the
desktop quick-add parser emits only the R18 field contract.

**Requirements:** R16, R18

**Dependencies:** task-model-v2/7, task-model-v2/8

**Files:**

```
tests/compat_corpus.rs                  # read-only v2 commands keep the corpus byte-identical
README.md, docs/concepts.md             # task fields table, recurrence semantics, filters, members
plugins/shards/skills/shards/SKILL.md   # agent guidance: due/overdue, recurring finish, reopen
```

**Test scenarios:**

- Tree hash of `tests/fixtures/python-vault` before and after `task list --overdue`, `task get` and
  `task list --sort due` is equal.
- The R18 table and `apps/desktop/src/lib/quickadd/parse.test.ts` (desktop-app) agree on each token
  row. This is a review check that the desktop-app reviewer signs; this unit writes no code.

**Verification:** `cargo test -p shards --test compat_corpus --test bundle` → 0 failed. A reviewer
confirms the R18 table against the desktop parser test names.

---

## Dependencies

| Unit | Blocks | Blocked by |
|---|---|---|
| task-model-v2/1 | /3, /5 | — |
| task-model-v2/2 | /3 | — |
| task-model-v2/3 | /4, /6 | /1, /2 |
| task-model-v2/4 | /6 | /3 |
| task-model-v2/5 | /6 | /1 |
| task-model-v2/6 | /7 | /3, /4, /5 |
| task-model-v2/7 | /9 | /6 |
| task-model-v2/8 | /9 | — |
| task-model-v2/9 | — | /7, /8 |

---

## Spec vs Implementation

Checked against the working tree on 2026-10-16 (code, `--help`, and binary probes).

| Gap | Tracked in | Notes |
|---|---|---|
| Cross-field rules and the create-time due default are missing | task-model-v2/3 | `recur` without `due` and `recur_from` without `recur` are accepted; the first finish anchors on today |
| `update` has no no-op detection | task-model-v2/3 | A repeated identical update bumps `updated` (AGENTS §6 says a no-op never rewrites) |
| No `created_by`/`updated_by`; `persist` takes no actor | task-model-v2/3 | R19 waits on owner sign-off (product § Open Questions 2) |
| `--final` / `final` missing | task-model-v2/4, /6, /7 | A corrupt stored rule now closes the task with a warning instead of refusing (product R5 updated) |
| No `none` selector for `--parent`/`--section`; no rest rule | task-model-v2/5, /6, /7 | `none` matches the literal value |
| `--ready`/`--blocked` readiness is O(n²) | task-model-v2/5 | `deps::readiness_all` not built; blocks the host 5k budget |
| `[[members]]` and `[core].me` are not read by the core | task-model-v2/8 | `shards-host` reads both for display only |
| Instructions block, `docs/concepts.md` and the corpus proof are not updated | task-model-v2/9 | README and SKILL.md are |

---

## Progress

| Unit | Status | Evidence |
|---|---|---|
| task-model-v2/1 | DONE | `cargo test -p shards` 1502/0; `tests/task_v2_cli.rs` sort and v1-shape tests |
| task-model-v2/2 | DONE | `domain::recur` unit tests; monthly-31 and Feb-29 tests in `tests/task_v2_cli.rs` |
| task-model-v2/3 | PARTIAL | write-path tests landed; cross-field rules, no-op detection, R19 open |
| task-model-v2/4 | PARTIAL | recurring finish, `expected_due`, reopen tests; `--final` open |
| task-model-v2/5 | PARTIAL | `list_filters_by_due_window_overdue_parent_and_section`; `none`, rest rule, `readiness_all` open |
| task-model-v2/6 | PARTIAL | `shards task … --help`; `--final`, `none` open |
| task-model-v2/7 | PARTIAL | `the_mcp_schemas_carry_the_v2_parameters`, `mcp_round_trips_…`; `final`, `none` open |
| task-model-v2/8 | NOT STARTED | core `src/config.rs` has no members code |
| task-model-v2/9 | PARTIAL | README + SKILL.md; `cargo test -p shards --test bundle` green |
