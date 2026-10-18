---
type: feature-product
feature: task-model-v2
sibling: tech.md
parent: ../../product.md
updated: 2026-10-16
---

# Feature: Task Model v2 — Product

Task model v2 gives a Shards task the fields a Todoist user expects: four priorities, a due date
with an optional time, a separate hard deadline, recurrence, subtasks, sections, manual order and
a completion timestamp. All of them live in the task file's frontmatter, so the vault stays plain
Markdown. Every field is optional, and a task written before v2 stays valid and unchanged.

The feature also adds:

- Recurrence that advances a task in place when it is finished.
- Reopen.
- Date, parent and section filters.
- Three sort keys.
- The `[[members]]` roster.
- The quick-add grammar that the desktop app parses.
- Actor stamps: who created a task and who last wrote it.

The CLI and the MCP server get the same surface, so a human in the app and an agent over MCP see
one model.

Users:

- The agent operator, who schedules recurring chores for agents.
- The Markdown-native knowledge worker, who wants Todoist-grade dates in Obsidian-readable files.
- The small team, who groups work into sections and subtasks.
- Agents, which read due dates and finish recurring work.

**Parent:** [../../product.md](../../product.md)
**Architecture:** [tech.md](tech.md)
**Plan:** [plan.md](plan.md)

---

## Scope

| | |
|---|---|
| **Owns** | Task fields `priority` (adding `urgent`), `due`, `deadline`, `recur`, `recur_from`, `parent`, `section`, `order` and `completed`, and the actor stamps `created_by` and `updated_by`: their validation, canonical order and output form. Recurrence advance on finish. Ending a series, reopen and clearing fields. The task list filters `--due-before`, `--due-after`, `--overdue`, `--has-due`, `--parent` and `--section`. The sort keys `due`, `order` and `priority`. The matching CLI flags and MCP parameters. The `[[members]]` config table and its effect on owner validation. The quick-add grammar's field mapping: this document is that contract. |
| **Does not own** | The quick-add parser, its UI, and the Today, Upcoming and board views (desktop-app). The acting identity `[core].me` (desktop-app). Reminders (in-window: desktop-app R40; tray and closed-window: app-polish), durations, saved filters, the filter query language, relative date words on the CLI, and a `shards task add "…"` parser (app-polish). Sync merge of these fields (sync). Other spaces' models. The rename (shards-rebrand). |
| **Deferred** | `scheduled` and `start` dates. Multiple assignees. Time zones on due times. Time-of-day precision for "overdue". `COUNT`, `UNTIL` and `BYSETPOS` recurrence parts. Stored rollups such as a subtask count on the parent (derived state is never stored). |

---

## Success metrics

| Metric | Target |
|---|---|
| Todoist quick-add attributes a task can hold: project, section, labels, priority, assignee, due date and time, `every`, `every!`, deadline | 9 of 9. Duration and reminders are deferred. |
| Existing vaults that fail to read or change on disk after the upgrade | 0. The compatibility corpus is byte-identical after read-only commands. |
| Calls an agent needs to complete one occurrence of a recurring chore | 1 (`finish`). The response carries `next_due`. |
| `task list --overdue` latency on a 5,000-task vault | Within 10% of plain `task list` on the same vault (release build, warm cache) |
| CLI ↔ MCP parity | Every new flag has an MCP parameter with the same name (snake_case), the same values and the same error text |
| Task writes through Shards that leave `updated_by` unset or naming someone other than the acting identity | 0 in the CLI, MCP and app integration suites |

---

## Requirements

### Requirement: Four priorities (R1)

Create and update SHALL accept the priorities `urgent`, `high`, `normal` and `low`. Any other value
SHALL be rejected with a message that lists the allowed values.

Priority sorting SHALL use this order:

1. `urgent`
2. `high`
3. `normal`
4. `low`
5. Any unrecognised label left by a hand edit, and tasks with no priority.

Clients SHALL show a task with no priority as `normal` (decision brief: default normal). Sorting
keeps unset tasks after the four labels, so unset tasks do not change places with explicit
`normal` ones.

#### Scenario: Urgent ranks first

- **Given** three open tasks with priority `high`, `urgent` and none
- **When** an agent runs `shards task list --sort priority`
- **Then** the order is the urgent task, then the high task, then the unprioritised task

#### Scenario: Unknown priority is rejected before any write

- **Given** any vault
- **When** an agent runs `shards task new "x" --priority p1`
- **Then** the command exits 2 with `invalid priority: 'p1' (use urgent, high, normal, low)`, and
  no file is created

### Requirement: Due date with optional time (R2)

A task MAY have a due date. A due date is either a calendar date (`YYYY-MM-DD`) or a date with a
local wall-clock time to the minute (`YYYY-MM-DDTHH:MM`). A due time SHALL be floating: it has no
zone, and it means the same wall-clock time on every machine. Writes SHALL accept only these two
exact forms. Natural-language dates are the job of the quick-add grammar (R18).

#### Scenario: Date with time round-trips

- **Given** any vault
- **When** an agent runs `shards task new "Standup" --due 2026-10-16T09:30 --json`
- **Then** the task file and the output both show `due` as `2026-10-16T09:30`

#### Scenario: Other forms are rejected

- **Given** any vault
- **When** an agent passes `--due "next friday"` or `--due 2026-10-16T09:30+02:00`
- **Then** the command exits 2 with
  `invalid due: '<value>' (use YYYY-MM-DD or YYYY-MM-DDTHH:MM)`, and nothing is written

### Requirement: Deadline separate from due (R3)

A task MAY have a deadline: a calendar date with no time. It is the hard limit, and it is separate
from when the task is planned (`due`). The system SHALL NOT require the deadline to fall on or
after the due date.

#### Scenario: Deadline with time is rejected

- **Given** any vault
- **When** an agent runs `shards task new "Tax" --deadline 2026-12-31T17:00`
- **Then** the command exits 2 with `invalid deadline: '2026-12-31T17:00' (use YYYY-MM-DD)`

### Requirement: Recurrence rule (R4)

A task MAY have a recurrence rule. The rule uses a subset of the iCalendar RRULE syntax:

- Frequency: daily, weekly, monthly or yearly.
- Interval: 1 to 1000.
- Weekdays: weekly rules only.
- Days of the month: monthly rules only. Each day is 1 to 31, or −1 to −31 counted from the end of
  the month.

A task MAY say whether recurrence counts from the due date or from the completion date. Counting
from the due date is the default and matches Todoist "every". Counting from the completion date
matches Todoist "every!".

The system SHALL store the rule in one canonical spelling. It SHALL reject any part outside the
subset and name the parts it supports. A recurring task SHALL always have a due date. When a rule
is set without one, the due date SHALL become the first occurrence on or after today.

When a monthly rule counts from the due date and names no day of the month, the system SHALL store
the due date's day in the rule. A series anchored on the 31st then returns to the 31st after a
short month.

#### Scenario: Weekly rule is canonicalised

- **Given** any vault
- **When** an agent runs `shards task new "Gym" --recur "freq=weekly;byday=we,mo" --due 2026-10-19`
- **Then** `recur` is stored as `FREQ=WEEKLY;BYDAY=MO,WE`

#### Scenario: Unsupported part is rejected

- **Given** any vault
- **When** an agent passes `--recur "FREQ=DAILY;COUNT=5"`
- **Then** the command exits 2 with
  `invalid recur: 'FREQ=DAILY;COUNT=5' (unsupported part 'COUNT'; use FREQ, INTERVAL, BYDAY, BYMONTHDAY)`

#### Scenario: Rule without due gets a first occurrence

> Not built (2026-10-16): a rule with no `due` is stored as given; the first finish then anchors
> on today. Tracked in [plan.md](plan.md) § Spec vs Implementation.

- **Given** today is Thursday 2026-10-15
- **When** an agent runs `shards task new "Review" --recur "FREQ=WEEKLY;BYDAY=MO"`
- **Then** `due` is `2026-10-19`

#### Scenario: Monthly day is pinned

> Not built at write time. Delivered instead: the first finish that clamps writes the pinned rule
> (§ R5, Scenario: A clamped day is pinned on finish), which prevents the drift this scenario
> guards against.

- **Given** any vault
- **When** an agent runs `shards task new "Rent" --recur FREQ=MONTHLY --due 2026-01-31`
- **Then** `recur` is stored as `FREQ=MONTHLY;BYMONTHDAY=31`

#### Scenario: Recur-from without a rule is rejected

> Not built (2026-10-16): `recur_from` without `recur` is accepted and has no effect.

- **Given** a task with no `recur`
- **When** an agent runs `shards task update <id> --recur-from completion`
- **Then** the command exits 2 with `recur_from requires recur`

### Requirement: Finishing a recurring task advances it (R5)

Finishing a task that has a recurrence rule SHALL NOT end the task. The task stays in the same
file and folder, and the system SHALL make these changes:

- `due` moves to the next occurrence:
  - From due ("every"): the first occurrence on the task's schedule that is strictly after both
    the old due date and today. Missed occurrences are skipped.
  - From completion ("every!"): the first occurrence strictly after today, counted from today.
- The time of day on `due` is kept.
- `deadline`, when present, moves by the same number of days as `due`.
- The status becomes `open`, and any claim is cleared.
- `completed` is set to the finish time.

The response SHALL report `next_due`. The task body SHALL NOT change (decision brief). An outcome
text passed on a recurring finish SHALL NOT be recorded, and the tool and help texts SHALL say so.

A recurring task SHALL never satisfy a blocker edge. Finishing an occurrence therefore reports no
unblocked dependents.

Finishing an occurrence is not idempotent: each call advances the task once more. A caller
that may retry SHALL be able to pass the `due` it saw (`--expected-due`, MCP `expected_due`, `""`
for none). When the stored `due` differs, the finish SHALL write nothing and return the current
`due` as `next_due` with a warning, so a retry never skips an occurrence.

When an advance clamps a day the rule does not name (day 31 into a 30-day month, Feb 29 into a
common year), the system SHALL store the rule with that day pinned, so later occurrences return
to the intended day.

#### Scenario: Every-week from due

- **Given** an open task due Monday 2026-10-12 with `FREQ=WEEKLY;BYDAY=MO`, and today is
  2026-10-15
- **When** the agent runs `shards task finish <id> --json`
- **Then** `due` is `2026-10-19`, `status` is `open` and `completed` is set
- **And** the file stays in the open folder, and the JSON includes `"next_due": "2026-10-19"`

#### Scenario: Every! from completion

- **Given** a task due 2026-10-01 with `FREQ=DAILY;INTERVAL=3` and `recur_from: completion`, and
  today is 2026-10-15
- **When** the task is finished
- **Then** `due` is `2026-10-18`

#### Scenario: Time and deadline travel with the due date

- **Given** a task due `2026-10-15T09:00` with deadline `2026-10-17` and rule `FREQ=DAILY`
- **When** the task is finished on 2026-10-15
- **Then** `due` is `2026-10-16T09:00` and `deadline` is `2026-10-18`

#### Scenario: Claimed occurrence is released

- **Given** a recurring task claimed by `agent-a`
- **When** `agent-a` finishes it
- **Then** `claimed_by` is cleared and the task is open again

#### Scenario: Short months clamp without drifting

- **Given** a task due 2026-01-31 with `FREQ=MONTHLY;BYMONTHDAY=31`
- **When** the task is finished on 2026-01-31
- **Then** `due` is `2026-02-28`
- **And** when it is finished again on 2026-02-28, `due` is `2026-03-31`

#### Scenario: A clamped day is pinned on finish

- **Given** a task due 2028-02-29 with `FREQ=YEARLY`
- **When** the task is finished on 2028-02-29
- **Then** `due` is `2029-02-28` and `recur` is stored as `FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29`
- **And** after the finishes in 2029, 2030 and 2031, `due` is `2032-02-29`

#### Scenario: A retried finish does not skip an occurrence

- **Given** a recurring task due 2026-10-19
- **When** an agent finishes it with `expected_due` `2026-10-19`, and then retries the same call
- **Then** the first call advances `due`, and the retry writes nothing and returns a warning with
  the current `due` as `next_due`

#### Scenario: Body is untouched

- **Given** a recurring task
- **When** it is finished with the outcome text "a"
- **Then** the task body is byte-identical to before

#### Scenario: Corrupt rule never blocks a finish

- **Given** a task whose `recur` was hand-edited to `every monday`
- **When** an agent runs `shards task finish <id>`
- **Then** the task is finished for good (status done, file in the done folder), the command
  exits 0, and a warning names the bad rule and says to reopen the task and set a valid `recur`
  to keep it repeating

> Changed 2026-10-16 to match the delivered code (`a_hand_edited_invalid_recur_never_blocks_a_finish`).
> The earlier draft refused the finish with exit 2 and a `--final` hint. Owner may revisit.

### Requirement: Ending a series (R6)

> `--final` / MCP `final` is not built (2026-10-16). Cancel works today.

The system SHALL let a user end a recurring series in two ways:

- Finish with `--final` completes the task for good through the normal finish: status done,
  `completed` set, file in the done folder, outcome section.
- Cancel ends the series as a cancelled task.

Both SHALL keep the rule in the file as history.

#### Scenario: Final finish

- **Given** a recurring open task
- **When** an agent runs `shards task finish <id> --final`
- **Then** the status is `done`, the file is in the done folder, and no `next_due` is reported

### Requirement: Completion timestamp (R7)

Every finish SHALL set `completed` to the finish instant in UTC. A cancel SHALL NOT set it. A task
finished before v2 SHALL stay valid without it.

#### Scenario: One-off finish records completion

- **Given** an open task with no recurrence
- **When** the task is finished at 2026-10-15T14:00:00Z
- **Then** `completed` is `2026-10-15T14:00:00Z` and the status is `done`

### Requirement: Reopen (R8)

An update with status `open` SHALL reopen a done or cancelled task. Reopen SHALL:

- set the status to `open`;
- remove `completed` and any stale claim;
- move the task back to the open folder.

On an open task, the same update SHALL only remove `completed`. When there is none, it writes
nothing.

On a claimed task, the update SHALL be refused, because releasing a claim is the release verb's
job. Update SHALL accept no status other than `open`.

#### Scenario: Reopen a done task

- **Given** a done task with `completed` set
- **When** an agent runs `shards task update <id> --status open`
- **Then** the task is in the open folder with status `open`, no `completed` and no `claimed_by`

#### Scenario: Claimed task is refused

- **Given** a task claimed by `agent-a`
- **When** an agent runs `shards task update <id> --status open`
- **Then** the command exits 2 with `task <id> is claimed by agent-a; release it instead of reopening`

#### Scenario: Other statuses are refused

- **Given** an open task
- **When** an agent runs `shards task update <id> --status done`
- **Then** the command exits 2 with
  `invalid status for update: 'done' (only 'open' reopens a task; use task claim, finish or cancel)`

### Requirement: Subtasks (R9)

A task MAY name a parent task. The parent SHALL be an existing task id. A task SHALL NOT be its
own parent, and a parent SHALL NOT close a loop in the parent chain. Any depth SHALL be stored.

Finishing, cancelling or deleting a parent SHALL NOT change its subtasks. A subtask whose parent
no longer exists SHALL stay valid and behave as a top-level task.

#### Scenario: Parent must exist

- **Given** no task `t-nope`
- **When** an agent runs `shards task new "Child" --parent t-nope`
- **Then** the command exits 2 with `invalid parent: 't-nope' (no such task)`

#### Scenario: Loop is refused

- **Given** task B has parent A
- **When** an agent runs `shards task update A --parent B`
- **Then** the command exits 2 with `parent cycle: A -> B -> A`, and nothing is written

#### Scenario: Finishing a parent leaves children alone

- **Given** parent P with one open subtask C
- **When** P is finished
- **Then** C's file is byte-identical to before

### Requirement: Sections and manual order (R10)

A task MAY have a section: free text that groups tasks inside a project. The system stores it
trimmed. A task MAY have a manual order: any finite number, smallest first.

The system SHALL NOT renumber other tasks when one task's order changes. A client places a task
between two others by writing a value between their two values.

#### Scenario: Insert between two tasks

- **Given** two tasks in section "Doing" with order 1 and 2
- **When** a client sets a third task's order to 1.5 and lists with `--section Doing --sort order`
- **Then** the third task is listed second, and the other two files are unchanged

#### Scenario: Non-finite order is rejected

- **Given** any task
- **When** an agent runs `shards task update <id> --order nan`
- **Then** the command exits 2 with `invalid order: 'nan' (use a finite number)`

### Requirement: Clearing a field (R11)

An empty value SHALL remove these fields: `due`, `deadline`, `recur`, `recur_from`, `parent`,
`section` and `order`. A removed field SHALL be absent from the file and from the output.

An empty value SHALL also clear `priority` and `project`. Those keys exist on every task, so they
become null instead of disappearing.

Removing `recur` SHALL also remove `recur_from`.

#### Scenario: Clear the due date

- **Given** a non-recurring task with `due: 2026-10-20`
- **When** an agent runs `shards task update <id> --due ""`
- **Then** the task file has no `due` key

#### Scenario: A recurring task keeps its due date

- **Given** a recurring task
- **When** an agent clears its `due` without clearing `recur`
- **Then** the command exits 2 with `recur requires due`

### Requirement: Date, parent and section filters (R12)

`task list` SHALL support these filters:

| Filter | Keeps |
|---|---|
| `--due-before D` | Tasks due on a calendar date strictly before D |
| `--due-after D` | Tasks due on a calendar date strictly after D |
| `--overdue` | Tasks that are not done or cancelled and whose due date is before today |
| `--has-due` | Tasks that have a due date |
| `--parent ID` | The direct subtasks of ID |
| `--parent none` | Tasks with no parent |
| `--section NAME` | Tasks in that section, matched exactly and case-sensitively |
| `--section none` | Tasks with no section |

D takes the form `YYYY-MM-DD`. A due with a time compares on its date.

The filters combine with each other and with the existing filters. They apply before sorting and
before the limit. They never change which tasks count as ready or blocked: readiness is always
judged against the whole vault.

#### Scenario: Tasks due today

- **Given** tasks due 2026-10-14, 2026-10-15 and `2026-10-15T18:00`
- **When** an agent runs `shards task list --due-after 2026-10-14 --due-before 2026-10-16`
- **Then** the two tasks due on 2026-10-15 are listed

#### Scenario: Overdue excludes finished tasks and today

- **Given** today is 2026-10-15, and these tasks: open due 2026-10-14, done due 2026-10-10, open
  due `2026-10-15T08:00`
- **When** an agent runs `shards task list --overdue`
- **Then** only the open task due 2026-10-14 is listed

#### Scenario: Filters do not fake readiness

- **Given** task B is blocked by open task A, A has no due date, and B is due 2026-10-20
- **When** an agent runs `shards task list --ready --has-due`
- **Then** B is not listed

#### Scenario: Top-level tasks of a section

- **Given** a parent and its subtask, both in section "Backlog"
- **When** an agent runs `shards task list --section Backlog --parent none`
- **Then** only the parent is listed

### Requirement: Sort keys (R13)

`task list` SHALL accept the sort keys `due`, `order` and `priority` beside the existing ones.

| Key | Order | Ties |
|---|---|---|
| `due` | Earliest date first. On the same date, timed tasks come before all-day tasks. Tasks with no due date come last. | Priority, then oldest created |
| `order` | Smallest number first. Tasks with no order come last. | Oldest created |
| `priority` | The R1 ranking | Oldest created |

#### Scenario: Due sort puts undated last

- **Given** tasks due 2026-10-20, no due date, and 2026-10-16
- **When** an agent runs `shards task list --sort due`
- **Then** the order is 2026-10-16, 2026-10-20, then the undated task

### Requirement: Recurring tasks rest until due (R14)

A recurring task whose due date is after today SHALL NOT count as ready work. It SHALL be left out
of ready-work listings and out of next-task selection. It SHALL still appear in every other
listing. A non-recurring task with a future due date SHALL stay ready.

#### Scenario: Agent does not loop on a daily chore

- **Given** a daily recurring task that an agent finished today, so it is now due tomorrow
- **When** the agent runs `shards task next`
- **Then** that task is not picked

### Requirement: Agent parity (R15)

Every field, filter, sort key and option in this feature SHALL be available on both the CLI and the
MCP server. Both SHALL use the same names (snake_case over MCP), the same values, the same
validation messages and the same error codes. The MCP tool descriptions SHALL say three things
about finishing a recurring task: it advances the task, it must not be retried blindly, and it does
not record outcome text.

#### Scenario: Same error over MCP

- **Given** an MCP client
- **When** it calls the task-create tool with `priority: "p1"`
- **Then** the error text is `invalid priority: 'p1' (use urgent, high, normal, low)`

### Requirement: Existing vaults keep working (R16)

A task file written before v2 SHALL read as valid. No read SHALL rewrite it. A write SHALL add a v2
field only when that field is set. The v2 fields SHALL follow the existing fields in one fixed
order on disk and in the output.

A v2 field may hold a malformed value from a hand edit or another tool. That value SHALL NOT hide
the task: the task stays listed, filters and sorts treat the value as absent, and it is kept on
disk exactly as written.

#### Scenario: Foreign due value does not hide a task

- **Given** a task whose frontmatter says `due: next week`, written by another tool
- **When** an agent runs `shards task list`
- **Then** the task is listed, it does not match `--has-due`, and `task get` shows the raw value

#### Scenario: v1 file is untouched by reads

- **Given** the compatibility corpus vault
- **When** `task list`, `task get` and `task list --overdue` run
- **Then** every file is byte-identical to before

### Requirement: Members roster (R17)

The config SHALL accept a `[[members]]` list. Each entry has:

- an id, which SHALL be unique;
- a kind, `human` or `agent`;
- an optional display name, which defaults to the id;
- an optional color in the form `#RRGGBB`.

Owner validation SHALL accept the union of `[tasks].collections` and the member ids. When both are
empty, any owner SHALL be accepted, as today. An invalid entry SHALL fail config loading with its
position and the reason.

#### Scenario: Member id is a valid owner

- **Given** `[tasks].collections = ["alice"]` and a member `{id = "flights-agent", kind = "agent"}`
- **When** an agent runs `shards task new "x" --owner flights-agent`
- **Then** the task is created

#### Scenario: Bad kind is reported

- **Given** the second member entry has `kind = "robot"`
- **When** any command loads the config
- **Then** the command exits 2 with `[[members]] entry 2: kind must be human or agent`

### Requirement: Quick-add grammar (R18)

The quick-add grammar SHALL turn one line of text into the task fields in the table below. The
desktop app's quick add implements it now; a future `shards task add "…"` implements it later.

- A token that does not resolve SHALL stay in the title. The client SHALL show that the token was
  not understood.
- A token prefixed with `\` SHALL stay literal.
- The text left after parsing SHALL become the title, with runs of spaces collapsed.
- The client SHALL show a preview of every parsed field before it creates the task.

> **Delivered in the desktop app (2026-10-16, `apps/desktop/src/lib/quickadd/parse.ts`,
> `parse.test.ts`).** Every row of the table below works, plus `every weekend`,
> `every month on the 15th` and `every <weekday> at <time>`. Differences: a sigil takes a quoted
> name, else the longest known name, else one word, so an unknown `#name` is consumed (the form
> then shows "No project …" and files the task in the current project or the Inbox); an unknown
> `+name` is consumed and leaves `owner` unset. `\` escaping and "every last day" are not built.
> A bare month name ("May") is not taken as a date; a weekday name ("fri") is.

| Token | Field | Rule |
|---|---|---|
| `#name` or `#"Two Words"` | `project` | Case-insensitive match on project title or slug. The project note's id is stored. |
| `/name` or `/"Two Words"` | `section` | Stored as written |
| `@label` | `tags` | Added to the tag list |
| `p1` `p2` `p3` `p4` | `priority` | urgent, high, normal, low. Standalone token, case-insensitive. |
| `+name` | `owner` | Member id, or a case-insensitive match on member display name |
| a natural date or time ("tomorrow 5pm", "fri", "oct 20") | `due` | A date, or a date with time when a time is given |
| `every …` | `recur`, `due` | Only phrases inside the R4 subset: "every day", "every 3 days", "every weekday", "every mon, wed", "every other week", "every month", "every 15th", "every last day", "every year". `due` becomes the first occurrence. |
| `every! …` | `recur`, `recur_from: completion` | As above, but counted from completion |
| `{date}` | `deadline` | A date only |

#### Scenario: Full line

- **Given** today is Thursday 2026-10-15, a project titled "Q4 Launch" exists, and a member
  "flights-agent" exists
- **When** the user types `Book venue #"Q4 Launch" /Logistics @ops p1 +flights-agent fri 10am {oct 31}`
- **Then** the preview shows:
  - title "Book venue";
  - project: the project's id;
  - section "Logistics";
  - tag "ops";
  - priority urgent;
  - owner flights-agent;
  - due `2026-10-16T10:00`;
  - deadline `2026-10-31`.

#### Scenario: Unsupported recurrence stays in the title

- **Given** any vault
- **When** the user types `Payroll every last workday`
- **Then** no rule is set, the title is "Payroll every last workday", and the preview marks the
  phrase as not understood

### Requirement: Actor stamps (R19)

Create SHALL set `created_by` to the acting identity. Every write to a task SHALL set `updated_by`
to the acting identity. This backs the decision brief's rule that every write carries an actor
(DECISIONS D4). The old reason for not storing a writer, that the git history was the audit
trail, no longer holds (lessons: "Removing a dependency by name leaves the premise behind").

The acting identity is the identity of the process that writes, never a tool argument:

- CLI and MCP: the configured agent identity (`[core].agent`, usually from `$SHARDS_AGENT`).
- Desktop app: the operator, `[core].me`.
- `shards-server`: the identity in the access token.

An `--owner` value or a claimer argument names the assignee or the delegate. It SHALL NOT set a
stamp.

Rules:

- Both fields are output-only. No CLI flag and no MCP parameter sets them, so R15 parity adds no
  input and the MCP tool count stays 40.
- Both fields are optional. A task without them stays valid (R16), and no read adds them.
- `created_by` is written once, at create. No later write changes it.
- A write that changes nothing writes nothing, so `updated_by` keeps its value.
- The `blocks` mirror write stamps the mirrored task too, because the same actor makes it.
- When no acting identity resolves, create omits `created_by`, and a write removes `updated_by`.
  A stale stamp then never names the wrong writer.
- The stamp records the identity as spelled. It adds no roster check, because a local identity is
  a spelling convention, not a security boundary.
- A stamp names the last writer through Shards only. An editor outside Shards changes the file but
  leaves `updated` and `updated_by` as they were. A client SHALL treat a change that did not move
  `updated` as the work of an unknown writer, and SHALL NOT name the stale stamp.

#### Scenario: An agent creates a task owned by a human

- **Given** `SHARDS_AGENT=flights-agent` and a member `alice` of kind `human`
- **When** the agent runs `shards task new "Approve budget" --owner alice --json`
- **Then** `owner` is `alice`, and `created_by` and `updated_by` are both `flights-agent`

#### Scenario: A later write changes only the last writer

- **Given** a task created by `flights-agent`
- **When** the operator completes it in the desktop app, where `[core].me` is `alice`
- **Then** `created_by` is still `flights-agent`, and `updated_by` is `alice`

#### Scenario: A no-op keeps the stamp

- **Given** a task with priority `high`, last written by `agent-a`
- **When** `agent-b` runs `shards task update <id> --priority high`, which changes nothing
- **Then** the file is byte-identical, and `updated_by` is still `agent-a`

#### Scenario: Undo is refused after an edit outside Shards

- **Given** the operator changed a task's title in the app, so `updated_by` is `alice` and
  `updated` moved
- **When** the task body is then edited in a Markdown editor, which leaves `updated` and
  `updated_by` unchanged, and the operator presses undo
- **Then** the undo is refused with "changed on disk by an unknown writer", and the message does
  not name `alice`

#### Scenario: A pre-v2 task has no stamps

- **Given** a task file written before v2, with no `created_by`
- **When** `task get` reads it
- **Then** the task is valid, no stamp is shown, and the file is byte-identical

---

## Non-Goals

- No new task file per occurrence, and no occurrence history beyond `completed`.
- No time zones on due times, and no time conversion between machines.
- No cascade from parent to subtasks, and no stored rollups such as counts or progress.
- No recurrence parts beyond the R4 subset.
- No relative date words (`today`, `+3d`) on CLI or MCP inputs. Agents send absolute dates, and
  humans use quick add.
- No change to `task next` ordering apart from the `urgent` rank and the R14 rest rule.
- No reminder fields, durations or calendar export. Reminders read the existing `due` time
  (desktop-app R40, app-polish AP1); durations and calendar export are app-polish and
  integrations.
- No history of every writer. A task holds its creator and its last writer only. The activity
  feed is multiplayer (feature 20).

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| An agent retries `finish` on a recurring task | One occurrence is skipped | The MCP annotation marks finish as not idempotent, and the tool description warns about retries. `next_due` in the response lets the agent check. |
| Two machines in different zones read one floating due time | "Overdue" differs per machine | Documented as floating local time (Todoist does the same). Zones are deferred. |
| A pre-v2 binary finishes a v2 recurring task | The series ends: the file moves to done and `recur` is ignored | Release note: upgrade every agent in a fleet together. `task update --status open` repairs the task. |
| A hand-edited v2 field is malformed | Filters skip it without a warning | Lenient read keeps the task visible, and `task get` shows the raw value |
| `urgent` was free text before v2 and ranked as unknown | Tasks hand-tagged `urgent` now jump to the top of priority sorts | Intended. Called out in the release notes. |
| A Markdown editor edits a file after a Shards write | `updated_by` still names the last Shards writer | R19: a change that did not move `updated` is shown as the work of an unknown writer |
| An agent's outcome note on a recurring finish is not kept | The occurrence leaves no record except `completed` | Tool and help texts say so. The agent records a note with `task append` before it finishes. See Open Questions. |

---

## Open Questions

1. **Keep outcome notes on recurring finishes?** The decision brief says a recurring finish
   appends nothing, and the code follows it. Agents pass outcomes by habit, so their notes are
   lost without an error. Recommendation for the owner: when outcome text is given, record it as
   one stamped entry under a single reused `## Outcome` section. A finish without text still
   leaves the body untouched. Until the owner rules, R5 follows the decision brief. Tracked as
   DR8 in root [plan.md](../../plan.md) § Decision register: decide by 2026-10-22, after which the
   recommendation applies.
2. **Owner sign-off: actor stamps (R19).** `created_by` and `updated_by` are surface growth beyond
   the signed-off list (AGENTS.md §0.4). They add no flag, no parameter and no tool. Recommendation:
   sign off, because root product R2 ("every write records its actor") and desktop-app R2 and R25
   depend on them. If the owner refuses, drop R19, change root R2 to "claims, comments, completions
   and cancellations record their actor", and rewrite desktop-app R2 and R25 to match. Tracked as
   DR6 in root [plan.md](../../plan.md) § Decision register: decide by 2026-10-22, after which the
   sign-off applies by default.
