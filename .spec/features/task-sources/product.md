---
type: feature-product
feature: task-sources
status: draft
sibling: tech.md
parent: ../../product.md
children:
  - research.md
  - plan.md
updated: 2026-10-16
---

# Feature: Task sources — Product

**Status: DRAFT — owner decisions recorded 2026-10-16; plan pending owner approval.**

Task sources gives Shards one task list over three places a task can live. Simple Shards tasks
are single checkbox lines in a tasks note, and they become their own file when they need more.
Checkbox lines in the user's ordinary notes appear read-only. The owner's Todoist appears
read-only from a local copy, and an agent works on a Todoist task through a linked Shards task.
Nothing is ever written to Todoist or into a user note. Shards stays the backend: the linked task
is a native task, and the Todoist copy is a cache that a pull rebuilds.

**Parent:** [../../product.md](../../product.md)
**Architecture:** [tech.md](tech.md)
**Plan:** [plan.md](plan.md)
**Research:** [research.md](research.md) (owner decisions OD1–OD4, Todoist API and Tasks grammar)
**Related:** [../task-model-v2/product.md](../task-model-v2/product.md) (task fields),
[../sync/product.md](../sync/product.md) (record merge), [../desktop-app/product.md](../desktop-app/product.md) (views)

---

## Problem

- Most tasks are one line: "buy filters", "call the plumber". A file per task, with frontmatter,
  is heavy to read in Obsidian and heavy to scan for the owner.
- The owner already keeps checklists in notes. Shards cannot see them, so the owner keeps two
  lists.
- The owner's human tasks live in Todoist, on the phone. Agents cannot see them, and the owner
  cannot hand one to an agent without retyping it.

## Users and jobs

| Persona (D3) | Job |
|---|---|
| Agent operator (the owner) | "I see my Todoist tasks next to my agents' tasks, and I hand one to an agent in one step." |
| Markdown-native knowledge worker | "My quick tasks are one readable line in one note; a task gets a file only when it needs one." |
| Obsidian user | "The checkboxes I already keep in my notes show up in Shards, and Shards never edits those notes." |
| Agent | "I list, claim and finish work the same way, wherever the task came from, and I never write to a source I cannot own." |

## Success metrics

| Metric | Target | How measured |
|---|---|---|
| Writes sent to Todoist | 0, by construction | The client has no write path; a recording fake server in CI and the read-only real-account smoke |
| Bytes changed in user notes by any Shards verb | 0 | Byte compare of a fixture vault before and after the full verb suite |
| Tasks lost or duplicated by a crash during promotion | 0 | Crash injection at every step (tech.md § Promotion) |
| Lost line edits under concurrent writers on one tasks note | 0 | Race test with interleaved writers |
| CLI cold start | KPI K5 | `tests/foundation_cli.rs` pin on the default and the `todoist` build |
| Owner dogfood | KPI K1 | Unchanged; Todoist stays the phone capture tool |

---

## Scope

| | |
|---|---|
| **Owns** | Line storage for simple tasks: the line format, the tasks note, line edits and promotion to a file; the read-only inline source for checkbox lines in user notes; the Todoist local copy under `.shards/todoist/`, the explicit pull, token handling, Todoist rows and linked tasks; the `origin` read model across task list and get; the Todoist settings, source badges and read-only rows in the app |
| **Does not own** | Task fields and their validation (task-model-v2); views, quick add and the detail sheet as such (desktop-app); the sync record bijection and merge (sync), which receives the contract in TS25; any write to Todoist or to a user note; webhooks; the CSV import AP5 once named |
| **Relation to task-model-v2** | Every native task, line or file, has the v2 model. A line holds a subset of fields (TS1); any other field makes it a file. Two keys are added to the task model: `source` and `source_state` (Open Question 2). |
| **Relation to desktop-app** | The app shows origins and read-only rows (TS24). It reaches the core only through `Host::call`. Two host tools need sign-off (Open Question 3). |
| **Relation to sync** | Line or file is a local storage detail. Sync treats each line task as one record keyed by its id (TS25). The Todoist copy is device-local and never syncs. |
| **Relation to the roadmap** | Supersedes the importer outcomes AP5 and AP6 (owner decisions 2026-10-16): Todoist is mirrored read-only, and note checkboxes are read in place. |

---

## Requirements

### Requirement: Line task format (TS1)

A line task SHALL be one Markdown list line in the Dataview inline-field format, which the
owner's Tasks plugin reads. Every line Shards writes MUST carry `[id:: t-XXXX]`. A line MUST hold
only these fields: status, title, tags, owner, project, section, order, deadline, id, priority,
created, due (date or date and time), and the completion or cancellation date. Shards MUST write
the fields in one fixed order: title, then `#tags`, then the Shards-only fields (owner, project,
section, order, deadline), then the fields the Tasks plugin reads (id, priority, created, due,
cancelled, completion). Priority MUST be written as `highest`, `high`, `medium` or `low` for
`urgent`, `high`, `normal` and `low`, and an unset priority MUST write no field. Reading a line
Shards wrote and writing it again MUST give the same bytes.

#### Scenario: A simple task as a line

- **Given** an empty tasks note
- **When** the user runs `shards task new "Buy filters" --priority high --due 2026-10-20 --tags home`
- **Then** the note holds one line `- [ ] Buy filters #home  [id:: t-XXXX]  [priority:: high]  [created:: 2026-10-16]  [due:: 2026-10-20]` (two spaces before each field, as the Tasks plugin writes)
- **And** `shards task get t-XXXX --json` shows title, priority, tags and due as given

#### Scenario: Shards-only fields stay left of the Tasks fields

- **Given** a line task with owner `lennard` and project `n-7Q2A`
- **When** Shards writes it
- **Then** `[owner:: lennard] [project:: n-7Q2A]` come before `[id:: …]` on the line
- **And** the Tasks plugin still reads the id, priority and due of that line

### Requirement: Where lines live (TS2)

Line tasks SHALL live in one tasks note per vault, at a path inside the tasks space that the
config names, outside the open and done folders. The note MUST carry a frontmatter marker that
says it is a Shards tasks note, and Shards MUST NOT write lines into a file at that path that
lacks the marker. Shards MUST create the note on the first line write. Shards MUST keep every
non-task line and the frontmatter of the note byte-for-byte. When a new line would grow the note
past its size cap, the task MUST be created as a file instead, with a warning. When the config
disables line storage, every new task MUST be a file.

#### Scenario: First line creates the note

- **Given** a vault with no tasks note
- **When** an agent creates a simple task
- **Then** the tasks note exists with its marker and one line

#### Scenario: A foreign file at the configured path

- **Given** a user note without the marker at the configured tasks-note path
- **When** an agent creates a simple task
- **Then** the task is created as a file
- **And** the response warns that the tasks note is not a Shards tasks note

#### Scenario: Note past its cap

- **Given** a tasks note above its size cap
- **When** the user creates a simple task
- **Then** the task is a file in the open folder
- **And** the output warns that the tasks note is full

### Requirement: Storage is chosen on create (TS3)

On create, the system SHALL store a task as a line when the line can hold it and as a file
otherwise. A create MUST produce a file when it has a body, blockers in either direction, a
recurrence, a parent, or a title or tag that a line cannot hold without changing it on
read. The CLI and MCP create calls MUST NOT gain a parameter for this choice. The response MUST
say which storage was used.

#### Scenario: Body forces a file

- **Given** the default config
- **When** an agent creates a task with a body
- **Then** the task is a file in the open folder
- **And** the response says `storage: file`

#### Scenario: A title that would not round-trip

- **Given** the title `Fix #12`
- **When** the user creates the task
- **Then** the task is a file, because a trailing `#12` would read back as a tag

### Requirement: Field edits keep a line a line (TS4)

An update that sets only fields a line can hold SHALL rewrite that one line in place. A finish
or cancel without text MUST mark the line done (`[x]`) or cancelled (`[-]`) with today's date.
Reopen MUST restore `[ ]` and drop the date. A delete MUST remove the line. A no-op MUST NOT
rewrite the note.

#### Scenario: Finish a line task

- **Given** an open line task t-4K2P
- **When** an agent runs `shards task finish t-4K2P`
- **Then** its line reads `- [x] … [completion:: <today>]`
- **And** no task file is created

#### Scenario: No-op update

- **Given** a line task with priority `high`
- **When** an agent sets priority `high` again
- **Then** the tasks note is byte-identical and its mtime does not change

### Requirement: Promotion triggers (TS5)

The system SHALL promote a line task to a file before a change that a line cannot hold. The
triggers MUST be: setting or appending a body or comment; claiming, including `task next` with a
claim; a finish or cancel with outcome or reason text; adding a blocker in either direction;
setting a recurrence or a parent; and any field the line cannot hold. The triggering change MUST
land in the same file write as the promotion. Promotion MUST keep the id and every field value.

#### Scenario: Claim promotes

- **Given** an open line task t-4K2P
- **When** agent `coder` claims it
- **Then** `tasks/open/t-4K2P.md` exists with `status: claimed` and `claimed_by: coder`
- **And** the tasks note no longer holds a checkbox line for t-4K2P

#### Scenario: Comment promotes

- **Given** an open line task t-4K2P
- **When** an agent appends "Ordered from the hardware store"
- **Then** the task file body holds that text
- **And** title, tags, due and created equal the line's values

#### Scenario: Finish with an outcome

- **Given** an open line task t-4K2P
- **When** an agent finishes it with outcome "Done, receipt in assets"
- **Then** `tasks/done/t-4K2P.md` holds the outcome section
- **And** the line is gone

### Requirement: Promotion is crash-safe (TS6)

Promotion SHALL never leave a state where the task exists zero times, and it MUST leave no state
that readers cannot repair. The system MUST write the task file before it removes the line. When a
task id resolves to both a file and a line, every reader MUST use the file, and the next write to
the tasks note MUST remove the stale line. A repeated promotion after a crash MUST NOT create a
second file.

#### Scenario: Crash after the file write

- **Given** a promotion that wrote `tasks/open/t-4K2P.md` and stopped before it changed the note
- **When** an agent lists tasks
- **Then** t-4K2P appears once, from the file
- **And** the next write to the tasks note removes the old line

#### Scenario: Crash before the file write

- **Given** a promotion that stopped before the file existed
- **When** an agent lists tasks
- **Then** t-4K2P appears once, from the line, unchanged

### Requirement: Files never demote (TS7)

A task file SHALL NOT become a line again. Removing the body, the claim or the blockers of a file
task MUST leave it a file.

#### Scenario: Body cleared

- **Given** a promoted task whose body the user clears in the app
- **When** the change is saved
- **Then** the task is still a file

### Requirement: Concurrent writers on one tasks note (TS8)

Every write to a line task SHALL hold that task's entity lock and then the tasks-note lock, in
that order, and MUST re-read the note inside the locks. An edit MUST address its line by id,
never by line number, and MUST be replayed against the note as read inside the lock. Two writers
that edit two different lines MUST both land. A writer that cannot get the lock in time MUST fail
with a lock conflict and change nothing.

#### Scenario: Two agents edit two lines

- **Given** line tasks t-A and t-B in one tasks note
- **When** agent 1 sets t-A due and agent 2 finishes t-B at the same moment
- **Then** the note holds both changes

#### Scenario: Many creates at once

- **Given** an empty tasks note
- **When** 32 agents each create one simple task concurrently
- **Then** the note holds 32 lines with 32 distinct ids

### Requirement: Lines edited outside Shards (TS9)

The system SHALL read the tasks note as the user leaves it. A line ticked or unticked in an
editor MUST read as done or open. A line the user typed into the tasks note without an id MUST
be listed read-only until the next line task is created in that note, which MUST give it an id
(Open Question 4). When two lines carry the same id, readers MUST use the first, and the next line
create MUST give the later line a new id. A malformed field MUST NOT hide the line; the field reads as
part of the title.

#### Scenario: Ticked in Obsidian

- **Given** a line task t-4K2P ticked in Obsidian with no completion date
- **When** an agent gets t-4K2P
- **Then** its status is `done`

#### Scenario: Hand-typed line

- **Given** the user typed `- [ ] call mum` into the tasks note
- **When** an agent creates another simple task
- **Then** both lines now carry an id, and "call mum" is a native line task

### Requirement: Foreign checkbox lines are read-only (TS10)

The system SHALL list checkbox lines from notes in the notes space as read-only inline tasks. It
MUST read both the Dataview and the emoji format, and it MUST honour the Tasks plugin's global
filter when one is set. It MUST NOT write any byte of a user note. It MUST skip the tasks note,
fenced code blocks and lines the Tasks plugin does not treat as tasks. A config switch MUST turn
the inline source off.

#### Scenario: Checklist in a project note

- **Given** a note `Garden.md` with `- [ ] cut the hedge [due:: 2026-11-02]`
- **When** the user runs `shards task list --origin inline`
- **Then** the row shows title "cut the hedge", due 2026-11-02, `origin: inline` and `read_only: true`
- **And** `Garden.md` is byte-identical

#### Scenario: Emoji line in a vault set to Dataview

- **Given** the line `- [ ] pay rent 📅 2026-10-20`
- **When** the user lists inline tasks
- **Then** the row is due 2026-10-20

### Requirement: Inline identity and dedupe (TS11)

Each inline task SHALL have a stable id that Shards never writes into the note. The id MUST stay
the same when lines above it are added or removed and when the box is ticked. It MUST change when
the line text or the file path changes. A line that carries a Tasks id or a block id MUST keep its
id across text edits. A line whose id is the id of a native task MUST NOT be listed a second time.

#### Scenario: A line inserted above

- **Given** an inline task with id `inline:7F3K2M9QAB`
- **When** the user adds a line above it
- **Then** the inline task keeps id `inline:7F3K2M9QAB`

#### Scenario: Copy of a native line

- **Given** the user pasted `- [ ] Buy filters [id:: t-4K2P]` into a daily note
- **When** the user lists all tasks
- **Then** t-4K2P appears once

### Requirement: One read model over every origin (TS12)

Task list and get SHALL return native, inline and Todoist tasks as one row shape. Every row MUST
carry `origin` (`shards`, `inline` or `todoist`), `storage` (`file`, `line`, `note` or `copy`)
and `read_only`. List MUST accept an origin filter and MUST include every enabled origin by
default. Every other filter, sort and limit MUST apply to all rows the same way. The ready,
available and blocked selections and `task next` MUST consider native tasks only.

#### Scenario: Default list

- **Given** two native tasks, one inline task and one Todoist row
- **When** the user runs `shards task list`
- **Then** four rows are listed, each with its origin

#### Scenario: Next ignores read-only rows

- **Given** a Todoist row due today and no open native task
- **When** an agent runs `shards task next`
- **Then** no task is returned

### Requirement: Read-only rows refuse writes (TS13)

A write to an inline task or to an unlinked Todoist row SHALL fail with a validation error that
names the origin and says what to do instead. Claim and owner assignment on a Todoist row are the
exceptions (TS19).

#### Scenario: Finish an inline task

- **Given** an inline task
- **When** an agent finishes it
- **Then** the call exits 2 with "read-only inline task in Garden.md; edit it in your editor"

### Requirement: Todoist pull is explicit (TS14)

The system SHALL contact Todoist only in a pull: the `shards todoist pull` command, or the
desktop host on a timer and on request. List, get and every other verb MUST read only the local
copy and MUST NOT use the network. The first pull MUST read the whole account; later pulls MUST
read only the changes since the last one.

#### Scenario: Offline list

- **Given** a pulled copy and no network
- **When** the user runs `shards task list --origin todoist`
- **Then** the rows from the last pull are listed with the pull time

#### Scenario: Incremental pull

- **Given** a copy pulled an hour ago
- **When** the user runs `shards todoist pull`
- **Then** only changes since the last pull are requested
- **And** the output counts the changed tasks

### Requirement: Nothing is written to Todoist (TS15)

The system MUST NOT send any write to Todoist from any surface, build or code path. Completing,
assigning, claiming or editing a Todoist task in Shards MUST leave Todoist unchanged.

#### Scenario: Agent finishes a linked task

- **Given** a linked task for Todoist task 6X7r
- **When** the agent finishes it
- **Then** Todoist shows 6X7r unchanged and open

### Requirement: The token stays secret (TS16)

The system SHALL read the Todoist token only from the `SHARDS_TODOIST_TOKEN` environment variable
or the OS keychain. It MUST NOT write the token to the config, the vault, the local copy, a report
or a log, and it MUST NOT print any part of it.

#### Scenario: No token

- **Given** no token in the environment or the keychain
- **When** the user runs `shards todoist pull`
- **Then** the command exits 2 with a message that names both places
- **And** nothing is written

#### Scenario: Rejected token

- **Given** a token Todoist rejects
- **When** the user pulls
- **Then** the error says "Todoist rejected the token" and shows no character of it

### Requirement: The local copy is atomic (TS17)

The local copy and its sync position SHALL change together in one atomic write. A crash at any
point MUST leave the previous copy or the new copy, never a mix. Two pulls MUST NOT run at once.

#### Scenario: Crash during a pull

- **Given** a pull that stops after the network read and before the copy write
- **When** the user pulls again
- **Then** the pull continues from the previous sync position
- **And** no change is lost or applied twice

### Requirement: Todoist rows map as researched (TS18)

Todoist rows SHALL map as the research mapping table states. Todoist priority 4, 3 and 2 MUST map
to `urgent`, `high` and `normal`, and the default priority 1 MUST map to no priority. A recurring
task MUST show its Todoist recurrence text and its current due date, and MUST NOT get a Shards
recurrence rule. A fixed-zone due MUST show in local time with a warning. A row MUST carry a link
that opens the task in Todoist. A Shards project note MAY claim a Todoist project; rows of that
project then belong to that Shards project.

#### Scenario: Default priority

- **Given** a Todoist task with the default priority
- **When** the user lists it
- **Then** its priority is unset

#### Scenario: Recurring task

- **Given** a Todoist task due "every mon" with the next date 2026-10-19
- **When** the user gets it
- **Then** due is 2026-10-19, `recur_text` is "every mon", and `recur` is absent

### Requirement: Linked task on assign (TS19)

Claiming a Todoist row, or setting its owner, SHALL create a linked native task and apply the
claim or owner to it. The linked task MUST carry `source: todoist:<id>`. Its id MUST derive from
the Todoist id, so concurrent or repeated calls MUST yield one linked task. After linking, list
and get MUST show the linked task in place of the Todoist row. Every Shards verb MUST work on the
linked task as on any native task.

#### Scenario: Assign to an agent

- **Given** a Todoist row `todoist:6X7r` "Book flights"
- **When** the owner runs `shards task update todoist:6X7r --owner travel-agent`
- **Then** a native task with `source: todoist:6X7r`, owner `travel-agent` and title "Book flights" exists
- **And** the list shows that task once, with origin `todoist`

#### Scenario: Two agents claim at once

- **Given** an unlinked Todoist row
- **When** two agents claim it at the same moment
- **Then** one linked task exists
- **And** exactly one claim succeeds; the other exits 4 naming the holder

### Requirement: Linked tasks refresh from the copy (TS20)

Each pull SHALL refresh the Todoist-owned fields of every linked task from the copy: title, due,
deadline, priority and project, and the upstream state in `source_state`. Shards-owned fields
(body, owner, claim, tags, status) MUST NOT change, except as TS21 states. A refresh that changes
nothing MUST NOT rewrite the file.

#### Scenario: Due moved on the phone

- **Given** a linked task due 2026-10-20 and the owner moves the Todoist task to 2026-10-22
- **When** the next pull runs
- **Then** the linked task is due 2026-10-22
- **And** its body and claim are unchanged

### Requirement: Upstream completion or deletion (TS21)

When a pull sees that a linked task's Todoist task was completed, the system SHALL finish the
linked task if no one holds it, and MUST NOT finish it while it is claimed: it MUST set
`source_state: completed`, warn the holder on get and on release, and finish it on the first pull
after release. When the Todoist task was deleted, the system MUST set `source_state: deleted` and
MUST NOT delete or close the linked task. A Todoist task reopened upstream MUST set
`source_state: open` and MUST NOT reopen the linked task.

#### Scenario: Completed while an agent works

- **Given** a linked task claimed by `travel-agent`
- **When** the owner completes the Todoist task and a pull runs
- **Then** the linked task stays claimed with `source_state: completed`
- **And** `shards task get` shows "completed in Todoist"

#### Scenario: Deleted upstream

- **Given** an unclaimed linked task with a body the agent wrote
- **When** the Todoist task is deleted and a pull runs
- **Then** the linked task and its body remain, with `source_state: deleted`

### Requirement: MCP surface grows by parameters only (TS22)

The agent MCP surface SHALL keep its 40 tools. `shards_task_list` MUST gain an `origin`
parameter, and every task row MUST carry `origin`, `storage` and `read_only`. `shards_task_get`
MUST accept `todoist:` and `inline:` ids. `shards_task_claim` and `shards_task_update` MUST accept
a `todoist:` id and link it (TS19). `shards_health` MUST report the Todoist copy's pull time and
row count. Agent MCP MUST NOT offer a pull tool.

#### Scenario: Agent lists Todoist rows

- **Given** a pulled copy
- **When** an agent calls `shards_task_list` with `origin: "todoist"`
- **Then** each row carries `origin: "todoist"`, `storage: "copy"`, `read_only: true` and a Todoist link

### Requirement: CLI surface (TS23)

The CLI SHALL offer `--origin` on `task list`, accept `todoist:` and `inline:` ids where get,
claim and update take an id, and offer `shards todoist pull`, `shards todoist login` (token from
standard input into the keychain) and `shards todoist logout`. A build without Todoist support
MUST answer the three `todoist` commands with exit 2 "this build has no Todoist support" and MUST
still list rows from an existing copy.

#### Scenario: Login

- **Given** a token on standard input
- **When** the user runs `shards todoist login`
- **Then** the token is in the keychain and the output does not show it

### Requirement: The app shows origins (TS24)

The desktop app SHALL mark each task row with its origin. Todoist and inline rows MUST be
read-only: their checkbox MUST be disabled with a hint, and a Todoist row MUST offer "Open in
Todoist" and "Assign to agent". The sidebar MUST list Todoist projects under a Todoist group. A
project's settings MUST let the owner pick the Todoist project it claims. Settings MUST offer
connect, disconnect, the last pull time and "Pull now".

#### Scenario: Assign from the app

- **Given** a Todoist row in Today
- **When** the owner picks "Assign to agent" and chooses `travel-agent`
- **Then** the row becomes a linked task owned by `travel-agent` with a Todoist badge

### Requirement: Storage form is a local detail (TS25)

A line task and the file it is promoted to SHALL have the same id and the same field values, so
any consumer that keys on the task id (agents, sync) sees one task. A linked task created on two
machines for the same Todoist task MUST get the same id, unless a local hash collision forces a
longer id, which MUST be reported.

#### Scenario: Promotion keeps identity

- **Given** a line task t-4K2P with due, priority and tags
- **When** it is promoted
- **Then** `shards task get t-4K2P --json` returns the same id and values as before, plus `storage: file`

### Requirement: Read paths stay fast (TS26)

The CLI cold start SHALL stay within KPI K5 on the default and the Todoist build. List MUST stay
within the budgets in [tech.md](tech.md) § Performance Budget with every origin enabled.

#### Scenario: Cold start

- **Given** the release build with Todoist support
- **When** the cold-start pin runs
- **Then** it passes the same bound as the default build

---

## Non-Goals

- **Any write to Todoist**: completing, editing, commenting, closing after capture.
- **Webhooks** and any Todoist OAuth app.
- **Editing foreign inline lines** in user notes, including ticking them. The user edits them in
  the editor; Shards reads the result. Writing into notes Shards does not own needs its own
  sign-off and the body-precondition decision (DR1).
- **Importing** inline lines or Todoist tasks as copies. A copy would show the task twice.
- **One tasks note per project.** A project change would move a line between two files.
- **Demotion** of a file back to a line.
- **Emoji-format writing** or a per-vault line format.
- **Todoist assignee mapping** (`responsible_uid`), durations and reminders.
- **The Todoist CSV path** of the old AP5.

## Risks

| Risk | Mitigation |
|---|---|
| Obsidian saves its buffer over a Shards write to the tasks note | Re-read inside the lock; residual risk is the open body-precondition decision (DR1) |
| The tasks note grows without bound with done lines | Size cap with file fallback (TS2); the user prunes done lines in the editor |
| An inline scan over a large notes space slows list | Budget in tech.md; config switch; ready selections skip it |
| Todoist incremental semantics differ in v1 from the older docs | Verified read-only on the real account before the pull unit is done |
| A token leaks through an error or log | TS16; the token type has no display form |
| A linked task finished by an agent while the human never closes the Todoist task | Shown as "done in Shards, open in Todoist" on the row; Shards never closes it |
| Line tasks carry no actor stamps | Recorded as a divergence from the task-model-v2 stamp rule (Open Question 2) |
| A line task's `updated` is the tasks note's mtime, so every line looks changed when any line changes | Accepted cost: `--since`, recent activity and the default `updated` sort are coarse for line tasks; a task that needs precise history is promoted |
| Sync arrives after line storage | TS25 fixes identity now; sync owns the record bijection |

## Open Questions

1. **Gate and horizon.** Start when task-model-v2 and desktop-app are DONE (Next), as the root
   plan proposes, or pull it into Now? Recommendation: Next; the feature edits paths both of those
   features own.
2. **Core seam and fields.** Approve one core create seam that takes a given id, `created`, status
   and source keys (used by promotion and linked tasks, not a verb), the two new task keys
   `source` and `source_state` in the canonical order, and the rule that line tasks carry no actor
   stamps. Recommendation: approve all three as in [tech.md](tech.md).
3. **New surface sign-off.** `--origin` / `origin`, the `shards todoist` command group, the config
   keys, the `todoist` build feature, and two host tools (`host_todoist_pull`,
   `host_todoist_token`). Recommendation: approve as listed in [tech.md](tech.md) § Surface changes.
4. **Hand-typed lines in the tasks note.** Give them an id on the next line create (TS9), or keep
   them read-only for ever? Recommendation: give them an id; Shards owns that note.
