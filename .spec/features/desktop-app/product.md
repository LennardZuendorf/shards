---
type: feature-product
feature: desktop-app
sibling: tech.md
parent: ../../product.md
updated: 2026-10-16
---

# Feature: Desktop App — Product

The Shards desktop app is the first human face of the vault. It gives the operator a
Todoist-grade task manager (Inbox, Today, Upcoming, projects with list and board, labels, search,
quick add, a detail pane, a command palette) and, in the same window, the agent layer no task app
has: who each agent is, what it holds, what it remembers and what it is scribbling right now. Every
screen reads and writes the same Markdown folder the CLI and the agents use, and refreshes on its
own when an agent edits a file. The same app also runs in a plain browser against a local host
process, so it can be tested and driven without the native window.

**Parent:** [../../product.md](../../product.md)
**Architecture:** [tech.md](tech.md)
**Design:** [design.md](design.md)
**Plan:** [plan.md](plan.md)
**Research:** [research.md](research.md)

---

## Scope

| | |
|---|---|
| **Owns** | The desktop app and its local host; UI-only operator actions (delete to the OS Trash with undo, body edits, restore); the human operator identity setting; the edit-conflict error; project management (create, rename, colour, order, archive, delete) and sections; the completed log; multi-select and bulk actions; the "Waiting on me" queue; reminders while the app window is open; accessibility and locale settings; the change feed; the agent signalling contract (how an agent asks for input or reports an error); the read-only notes browser and "Open in" an external Markdown editor; a seeded demo vault; CI coverage for the app and host |
| **Does not own** | Task model v2 fields, recurrence roll-forward, list filters and the `[[members]]` config table (task-model-v2); the 40-tool agent MCP surface, which this feature leaves unchanged; tray, reminders while the window is closed, global quick-add window, saved filters, filter language, view options, task links, calendar, full onboarding, importers and signed builds (app-polish); sync and the remote server (sync, remote-mcp); design tokens (root design.md); the rename (shards-rebrand) |

---

## Why this feature exists

Shards has the strongest agent core in its category (atomic claims, derived readiness, recall,
scratch) and no interface a human would choose over Todoist. MCP access alone is table stakes:
Todoist and TickTick already ship hosted MCP servers (research: market §2a). The wedge is a
personal task app as good as Todoist that also shows and steers the agents working in the same
folder (research: market §5f). Without the app, the owner keeps two systems: Todoist for himself
and the vault for his agents. This feature removes the second system.

---

## Personas served

| Persona | What they do here |
|---|---|
| Agent operator (beachhead, the owner) | Plans the day, delegates work to agents, watches their progress, corrects their memories |
| Markdown-native knowledge worker | Uses a real task app over files they can still open in any editor |
| The agent (indirect) | Never uses the app; benefits because humans can triage, correct and unblock it |

Small teams are out of scope until multiplayer ships; the app is single-human, many-agent.

---

## Success metrics

| Metric | Target | How measured |
|---|---|---|
| Dogfood | KPI K1 ([product-roadmap.md](../../product-roadmap.md) § KPIs; the root Now exit) | Owner log of every Todoist use; Todoist activity export for the window |
| Live refresh | KPI K4 (agent write visible) | 50 scripted agent writes against the demo vault, timestamped |
| Quick-add accuracy | At least 95% of a fixed 60-phrase corpus parses to the expected fields | Automated phrase corpus |
| Speed | Today view interactive within 1.5 s of launch; the UI and host budgets of the 5k-task fixture in root [tech.md](../../tech.md) § Performance Budgets | Stopwatch and the timing harness on the 5k-task fixture |
| Keyboard coverage | Every action in this document is reachable without a pointer | Manual checklist, one row per requirement |
| Data fidelity | Zero lost foreign keys or untouched body bytes across all app writes | Round-trip check over the demo vault after the verification run |
| Parity of modes | Every screen behaves the same in the native window and in browser mode | Manual checklist run once per mode |
| Accessibility | 0 serious axe-core violations on every view; the R37 VoiceOver flows pass | axe-core in CI; manual VoiceOver run in desktop-app/22 |

---

## Requirements

### Requirement: Navigation shell (R1)

The app SHALL present a collapsible left sidebar with, in order: Inbox, Today, Upcoming, Waiting
on me (R39), Completed (R34), Search, Agents, Memories, Scratchpads, Notes; then the project list;
then the label list. Inbox and Today MUST show a count of open tasks; Waiting on me MUST show its
count. The main area shows the selected view; a task, memory, note or
scratchpad opens in a right-hand detail pane without leaving the view.

#### Scenario: Moving between views keeps context

- **Given** the operator has Today open and a task selected in the detail pane
- **When** they choose a project in the sidebar
- **Then** the project view replaces Today, the detail pane closes, and returning to Today restores its scroll position

#### Scenario: Collapsed sidebar

- **Given** the sidebar is expanded
- **When** the operator presses the sidebar toggle shortcut
- **Then** the sidebar collapses, the list widens, and the choice persists across restarts

### Requirement: Inbox (R2)

The Inbox SHALL list every open or in-progress task that has no project and no parent task,
newest first. It is where agent-created and quick-captured tasks without a project land for triage.

#### Scenario: Agent-created task lands in the Inbox

- **Given** the Inbox is open
- **When** an agent creates a task without a project
- **Then** the task appears in the Inbox within one second, marked with the agent's avatar as creator

#### Scenario: Triage moves a task out

- **Given** a task in the Inbox
- **When** the operator moves it to a project
- **Then** it leaves the Inbox and appears in that project

### Requirement: Today (R3)

Today SHALL show an Overdue group (open tasks whose due date or deadline is before today) above a
Today group (due today or deadline today), each ordered by time, then priority, then manual order.
Overdue MUST offer one action that reschedules every overdue task to today.

#### Scenario: Overdue rollover

- **Given** a task due yesterday is still open
- **When** the operator opens Today
- **Then** it sits under Overdue with its due date in the overdue colour

#### Scenario: Reschedule all overdue

- **Given** three overdue tasks
- **When** the operator chooses "Reschedule to today"
- **Then** all three move to the Today group and one undo restores all three dates

### Requirement: Upcoming (R4)

Upcoming SHALL show the next seven days starting today, grouped by day with a header per day
(weekday and date), with Overdue collapsed above them. Every day header MUST offer adding a task
pre-dated to that day. The operator MAY step one week forward or back.

#### Scenario: Empty day still shows

- **Given** nothing is due on Thursday
- **When** Upcoming is open
- **Then** Thursday still has a header and an "Add task" affordance

#### Scenario: Add to a day

- **Given** Upcoming is open
- **When** the operator adds "Call bank" under Friday
- **Then** the task is created due on that Friday and appears under it

### Requirement: Project list view (R5)

A project view SHALL list the project's open tasks grouped into its sections, tasks without a
section first, each section collapsible with a count. Within a group, tasks follow their manual
order. Subtasks nest one level under their parent with a collapse control and a progress count.
The operator MUST be able to add, rename and reorder sections and drag tasks to reorder them within
or between sections. Completed tasks are hidden behind a "Show completed" toggle.

#### Scenario: Reorder within a section

- **Given** tasks A, B, C in section "Next"
- **When** the operator drags C between A and B
- **Then** the order reads A, C, B and survives a restart and a reload by another device reading the same folder

#### Scenario: Empty section persists

- **Given** a project
- **When** the operator adds the section "Later" and puts no task in it
- **Then** "Later" still appears after a restart

### Requirement: Project board view (R6)

Each project SHALL offer a board layout, toggled from the list layout and remembered per project.
The board groups by section by default and MAY group by status instead.
Dragging a card between section columns moves it to that section; dragging between status columns
changes its status: to In progress claims it as the operator, back to To do releases it, to Done
completes it, from Done back to To do reopens it. Status columns are To do, In progress (named
with the worker), Done and Cancelled, Cancelled collapsed by default. Columns MUST collapse to a
narrow strip.

#### Scenario: Drag to another section

- **Given** the board grouped by section
- **When** the operator drags a card from "Next" to "Waiting"
- **Then** the card shows in "Waiting" immediately and the list layout agrees

#### Scenario: Taking work back from an agent

- **Given** the board grouped by status and a card in progress by an agent
- **When** the operator drags it to To do
- **Then** the app asks "Take back from <agent>?" and only on confirmation releases the agent's claim

### Requirement: Labels (R7)

The sidebar SHALL list every label used on an open task with its count. Choosing a label shows
its open tasks grouped by project. Labels are created by using them; a label disappears when no
open task carries it.

#### Scenario: New label from quick add

- **Given** no task carries the label "errand"
- **When** the operator quick-adds "Buy stamps @errand"
- **Then** "errand" appears in the label list with count 1

### Requirement: Search (R8)

Search SHALL query tasks, notes and memories together and show results grouped by space, best
match first, each opening its detail pane. Scratchpads MAY be included with an explicit toggle.

#### Scenario: Cross-space result

- **Given** a task, a note and a memory all mention "passport"
- **When** the operator searches "passport"
- **Then** three groups appear, Tasks, Notes and Memories, each with its match

#### Scenario: Nothing found

- **Given** no file mentions "zeppelin"
- **When** the operator searches it
- **Then** the app says nothing matched and offers to create a task titled "zeppelin"

### Requirement: Task rows and completion (R9)

Every task row SHALL show a round checkbox tinted by priority, the title, and, when present, due
date, deadline, recurrence mark, labels, project (outside its own project), assignee avatar, agent
session state and subtask progress. Ticking the box MUST complete the task with an undo toast.
Completing a recurring task MUST keep it open, move it to its next date, and name that date.

#### Scenario: Complete with undo

- **Given** an open task in Today
- **When** the operator ticks it
- **Then** it leaves the list and a toast "Completed · Undo" appears for six seconds

#### Scenario: Recurring completion

- **Given** a task due today that repeats every Monday
- **When** the operator ticks it
- **Then** it moves to next Monday and the toast reads "Completed · next Mon 20 Oct · Undo"

### Requirement: Task detail pane (R10)

Opening a task SHALL show an editable detail pane with title, Markdown description (rendered, with
an edit mode), priority, due date and time, deadline, recurrence, labels, assignee, delegate,
project and section, subtasks, blockers and activity. Edits MUST save without a save button: field
changes on commit, the description one second after typing stops and on leaving the field.

#### Scenario: Edit description

- **Given** a task with a description
- **When** the operator edits the description and clicks elsewhere
- **Then** the new text is saved and the rest of the file, including fields the app does not know, is unchanged

#### Scenario: Set recurrence

- **Given** a task due today
- **When** the operator picks "Every weekday" in the recurrence field
- **Then** the row shows the recurrence mark and completing it moves the date to the next weekday

### Requirement: Subtasks and blockers (R11)

The detail pane SHALL list subtasks with their own checkboxes and an inline "Add subtask" that
inherits the parent's project and section. It MUST list "Blocked by" and "Blocking" tasks, allow
adding a blocker through a task picker and removing one, and show whether the task is ready.

#### Scenario: Add a blocker

- **Given** task "Ship release" and task "Write changelog"
- **When** the operator adds "Write changelog" as a blocker of "Ship release"
- **Then** "Ship release" shows "Blocked by 1" and an agent asking for ready work does not receive it

#### Scenario: Completing the last blocker

- **Given** a task blocked only by "Write changelog"
- **When** "Write changelog" is completed
- **Then** the blocked task shows as ready without a manual refresh

### Requirement: Activity and comments (R12)

The detail pane SHALL show an activity timeline built from what the task file records: creation
and creator, claims and releases, comments, outcome or cancellation notes and completion, each with
an actor avatar (human or agent) and a relative time. A comment box MUST append a timestamped
comment signed by the operator.

#### Scenario: Agent outcome appears in activity

- **Given** an agent finishes a task with an outcome note
- **When** the operator opens the task
- **Then** the timeline shows the outcome with the agent's avatar and the time

### Requirement: Quick add (R13)

Pressing the quick-add key anywhere SHALL open a single-line capture box that parses, as the
operator types, these tokens and highlights each one: `#project`, `/section`, `@label`, `p1`–`p4`,
`+assignee`, natural dates and times ("tomorrow 5pm", "next fri", "in 3 days"), recurrence
("every monday", "every 2 weeks", "every! 3 days" for repeat-from-completion) and `{deadline}`.
The remaining text becomes the title. Unknown projects or assignees MUST stay in the title with a
warning, never be silently created. Clicking a highlight MUST turn it back into plain title text.
Backspace on a highlight does the same. Enter adds the task and keeps the box open for the next
one; Shift+Enter adds it and closes the box. The box defaults to the current context: the open
project, the Upcoming day, or today from Today.

> **Delivered (2026-10-16):** every token kind parses and highlights, with autocomplete after
> `#`, `/`, `@`, `+`. Differences: an unknown `#project` is consumed with a "No project …"
> warning and the task goes to the current project or the Inbox (never created); an unknown
> `+assignee` is consumed and leaves the task unassigned; clicking or Backspacing a highlight to
> return it to text is not built. Gaps: [plan.md](plan.md) § Spec vs Implementation.

#### Scenario: Full phrase

- **Given** a project "Home" with section "Errands" and member "claude"
- **When** the operator types "Renew passport #Home /Errands @admin p2 +claude next fri {oct 31}" and presses Enter
- **Then** a task "Renew passport" is created in Home › Errands, label admin, high priority, assigned to claude, due next Friday, deadline 31 October

#### Scenario: Literal text

- **Given** the operator types "Read May report"
- **When** "May" is highlighted as a date
- **Then** clicking the highlight keeps "May" in the title and drops the date

#### Scenario: Capture several in a row

- **Given** quick add is open
- **When** the operator types a task and presses Enter, then another and presses Shift+Enter
- **Then** both tasks exist, the box cleared after the first and closed after the second

### Requirement: Command palette (R14)

A command palette SHALL open with the palette shortcut and offer, in one fuzzy list: navigation to
every view, project and label; actions (new task, new memory, new note, toggle theme, open
settings, recall playground); entities by title (tasks, notes, memories); and, when a task is
selected, actions on it (complete, set priority, set due, assign, delegate, move, duplicate,
delete). Duplicate MUST create a new open task with a new id and the same title, description,
priority, due, deadline, recurrence, labels, project and section, placed right after the
original; it copies no subtasks, blockers, claim or activity, and offers undo.

> **Delivered (2026-10-16):** duplicate exists in the task "…" menu with undo; it is not yet in
> the palette.

#### Scenario: Duplicate a task

- **Given** a task "Weekly review" with labels and a due date
- **When** the operator chooses "Duplicate"
- **Then** a second open task "Weekly review" with the same fields appears right below it, and Undo removes only the copy

#### Scenario: Act on the selection

- **Given** a task is selected in a list
- **When** the operator opens the palette and chooses "Delegate to… › claude"
- **Then** the task is delegated to claude and the palette closes

### Requirement: Humans and agents are visually distinct (R15)

Every place that shows an identity (avatars, pickers, activity, cards) SHALL render humans as
circles with initials and agents as rounded squares with a bot glyph and a stable colour derived
from the identity. Pickers MUST group Humans and Agents separately. An identity seen in files but
not declared as a member MUST show as "unregistered".

#### Scenario: Assignee picker

- **Given** members lennard (human), claude and codex (agents)
- **When** the operator opens the assignee picker
- **Then** a "Humans" group lists lennard and an "Agents" group lists claude and codex with bot avatars

### Requirement: Delegation and agent session state (R16)

The app SHALL separate the accountable assignee from the delegate currently doing the work. The
operator MUST be able to assign a task to anyone, delegate it to an agent (the agent then holds
it as in progress), take it back, and start it themselves. A task held or owned by an agent MUST
show one session state on its row and in its detail:

| State | Rule |
|---|---|
| Queued | Assigned to an agent, open, not yet taken |
| Working | In progress by an agent, no flags below |
| Needs input | Carries the label `needs-input`, or is blocked by an open task assigned to a human |
| Error | Carries the label `agent-error` |
| Done | Completed while an agent held or owned it |

Answering a "Needs input" task MUST be one action: write a comment and clear `needs-input`.
Agents learn to set the two reserved labels from the signalling contract (R33).

#### Scenario: Delegate to an agent

- **Given** an open task assigned to the operator
- **When** the operator delegates it to claude
- **Then** the operator stays the assignee, the row shows claude's avatar with "Working", and claude receives it as its own work

#### Scenario: Unblocking an agent

- **Given** a task claude holds with the label `needs-input`
- **When** the operator answers it from the detail pane
- **Then** the comment is appended under the operator's name, the label is removed and the state returns to "Working"

### Requirement: Agents view (R17)

The Agents view SHALL show one card per agent with avatar, name, liveness (Live under 30 minutes
since its last write, Idle under 24 hours, Dormant after), the tasks it holds with their session
states, stale claims, memory count, scratchpad count and its ten most recent activities. Opening an
agent MUST show its full task list, recent activity, memories and scratchpads, each linking to
the matching view filtered to that agent.

#### Scenario: Live agent

- **Given** claude wrote to its scratchpad two minutes ago
- **When** the Agents view is open
- **Then** claude's card shows "Live" and its newest activity first

#### Scenario: No agents yet

- **Given** no agent has written to the vault and none is declared
- **When** the Agents view opens
- **Then** it explains how to connect an agent and shows the operator's own identity

### Requirement: Memories manager (R18)

The Memories view SHALL list every memory in a dense table with title, kind, scope, importance,
owner, project, last update with a freshness mark, and expiry. It MUST filter by kind, scope,
project, owner (agent) and minimum importance, with toggles for expired and superseded memories,
and MUST show agents' private memories to the operator with a lock mark. When filters hide
everything, it MUST say how many memories are hidden and why.

#### Scenario: Filter to one agent

- **Given** memories from claude and codex
- **When** the operator filters owner to claude and kind to preference
- **Then** only claude's preference memories show, private ones included with a lock mark

#### Scenario: Everything hidden

- **Given** all twelve memories are expired
- **When** the view opens with default filters
- **Then** it reads "12 expired memories are hidden" with a toggle to show them

### Requirement: Editing, correcting and forgetting memories (R19)

The memory detail pane SHALL allow editing every field and the body, setting or clearing expiry
("Extend", "Never expire"), and correcting a memory: creating a replacement pre-filled from the
original that marks the original superseded, with the supersession chain shown. Forgetting MUST
delete the memory with an undo toast; bulk forget MUST name the count and say the files are
deleted.

#### Scenario: Correct a memory

- **Given** a memory "Deploys run on Fridays"
- **When** the operator chooses "Correct this", edits it to "Deploys run on Thursdays" and saves
- **Then** the new memory exists, the old one is marked superseded with a link forward, and recall returns only the new one

#### Scenario: Forget and undo

- **Given** a memory
- **When** the operator forgets it and presses Undo within ten seconds
- **Then** the memory file is back, byte for byte, at the same place

### Requirement: Recall playground (R20)

A recall playground SHALL answer "what would agent X recall for this query, and why". Controls:
query, agent, kind, minimum importance, limit, threshold, decay on or off, include expired. Each hit
MUST show its rank, final score and the breakdown into match, importance weight and recency weight.
With an empty query it MUST show what the agent receives at session start.

#### Scenario: Recall as another agent

- **Given** codex has a private memory about "release checklist"
- **When** the operator recalls "release" as codex
- **Then** the private memory is listed with its score breakdown, and recalling as claude does not list it

### Requirement: Scratchpads (R21)

The Scratchpads view SHALL show one column per agent with its scratchpads as cards: name, last
update, liveness, the first lines and a checklist progress bar when the body has checkboxes. The
operator MUST be able to open, edit, append a note to, and clear a scratchpad, and to promote one
to a memory, a note or tasks. Editing a scratchpad an agent wrote in the last 30 minutes MUST
default to appending, with a warning that the agent is active.

#### Scenario: Clear with undo

- **Given** a stale scratchpad from codex
- **When** the operator clears it
- **Then** the card disappears with an undo toast, and undo restores it

#### Scenario: Promote to memory

- **Given** claude's scratchpad "deploy-notes"
- **When** the operator chooses "Promote to memory"
- **Then** a new memory is created from its text with the scratchpad named as its source

### Requirement: Notes browser (R22)

Shards is task-first; notes are context, and the operator's Markdown editor stays the place to
write them. The Notes view SHALL list **every** Markdown file in the notes space, Shards notes and
files without a Shards id alike, filterable by text, folder and tag and sorted by last change. It
MUST be read-only: no create, edit, tag, adopt or delete actions. Opening a file MUST render it
with working wikilinks, and every file MUST offer "Open in" (R41). Files of other spaces nested in
the notes space (for example the tasks folder), dot folders and `node_modules` folders are not
listed.

#### Scenario: A vault written in Obsidian

- **Given** a vault with 4 Shards notes and 665 Markdown files written in Obsidian
- **When** the operator opens Notes
- **Then** all 669 files are listed, and filtering by a folder name narrows the list to that folder

#### Scenario: Follow a wikilink

- **Given** a file linking to [[Release plan]]
- **When** the operator clicks the link
- **Then** the "Release plan" file opens in the reader

#### Scenario: Read-only

- **Given** any file in the Notes view
- **When** the operator opens it
- **Then** the reader shows no edit, tag, adopt or delete action, and offers "Open in"

### Requirement: Settings and first run (R23)

Settings SHALL show and change: the vault folder (picked with the system folder dialog; the
choice applies to the CLI and agents too, and says so), the operator's identity (chosen from
human members or typed), the members list with kinds (read-only, with a way to open the config
file), and the theme (system, light, dark). When no vault is configured, the app MUST open on a
single "Choose your vault and name" screen instead of an error.

#### Scenario: First run

- **Given** a machine with no Shards configuration
- **When** the app starts
- **Then** it asks for a vault folder and a name, and after confirming shows an empty Inbox

#### Scenario: Browser mode vault is fixed

- **Given** the app runs in browser mode against a host started with an explicit vault
- **When** Settings opens
- **Then** the vault is shown read-only with "set by the host process"

### Requirement: Live refresh (R24)

Every open view SHALL reflect writes made outside the app (agents, the CLI, other editors) within
one second without user action. Rows changed by someone else SHOULD flash briefly. When change
notifications are unavailable, views MUST refresh when the window regains focus.

#### Scenario: Agent claims a task

- **Given** Today is open and lists an open task
- **When** an agent claims it from the command line
- **Then** within one second the row shows the agent's avatar and "Working"

### Requirement: Undo (R25)

Every change the operator makes in the app SHALL be undoable from its toast (six seconds; ten for
deletions) and with the undo shortcut for the rest of the session, most recent first. Undo MUST restore the
exact prior file content. If someone else changed the item after the operator's change, undo MUST
refuse and name who changed it, rather than overwrite their work. Blocker changes undo by
reversing only the links that change added or removed. A change that wrote nothing offers no undo,
and a change that cannot be reversed exactly says "Can't undo" in its toast. Every delete from the
app (task, note, memory forget, scratchpad clear) MUST move the file to the operating system's
Trash rather than unlink it, so it stays restorable from the OS Trash after the app quits. When
the move to the Trash fails, the delete MUST be refused with the reason and nothing is removed.

> **Delivered (2026-10-16):** one undo slot, reachable from the toast (7 s) or ⌘Z within 30 s.
> Deletes restore the exact bytes and refuse when the path was re-created. Field edits undo by
> sending the old values back, without checking for a newer write, and name nobody. The exact,
> refusing undo above is designed, not built (tech.md § Designed, not built). App deletes still
> unlink the file; the move to the OS Trash is designed, not built (desktop-app/31).

#### Scenario: Undo a completion

- **Given** the operator completed a task ten seconds ago
- **When** they press the undo shortcut
- **Then** the task is open again, in its original place, with its original dates

#### Scenario: Undo refused after an agent edit

- **Given** the operator changed a task's priority and claude then edited the same task
- **When** the operator presses undo
- **Then** the app says "Can't undo — claude changed this task since" and nothing is written

#### Scenario: Recover after quit

- **Given** the operator deleted the task "Renew passport" and then quit the app
- **When** they restore that task's file (`tasks/open/<t-id>.md`, named by its id) from the operating system's Trash to its original folder
- **Then** the task is back in its lists, byte for byte, the next time the app or the CLI reads the vault

#### Scenario: Trash unavailable

- **Given** a vault on a volume where the operating system offers no Trash
- **When** the operator deletes a task
- **Then** the app says the file could not be moved to the Trash, and the task and its file stay

### Requirement: Edit conflicts (R26)

When a description, note, memory or scratchpad being edited changes on disk from another writer,
the editor SHALL show "Changed on disk" with "Reload" and "Overwrite", and MUST NOT save over the
other writer's change without that explicit choice.

#### Scenario: Agent writes while the operator types

- **Given** the operator is editing claude's scratchpad
- **When** claude rewrites it and the operator's autosave fires
- **Then** the save is refused, the banner appears, and the operator's text is kept in the editor

### Requirement: Keyboard-first operation (R27)

The app SHALL support, in every list: move selection down and up, open, complete, set priority 1–4,
set due today, open the date picker, assign, delete; plus global keys for quick add, command
palette, search, undo, sidebar toggle and "go to" Inbox, Today and Upcoming. A shortcut sheet MUST
list them. Focus MUST always be visible.

#### Scenario: Triage without a mouse

- **Given** the Inbox has five tasks
- **When** the operator moves down twice, sets priority 1 and presses the due-today key
- **Then** the third task is urgent and due today, and focus stays on it

### Requirement: Empty, error and disabled states (R28)

Every view SHALL distinguish: loading, empty (with a next step), filtered to nothing (with the
active filters and "Clear"), space turned off in this vault (with a link to settings), and error
(with the message and "Retry"). A failed write MUST show a toast with the reason and leave the
view as it was before the write.

#### Scenario: Space turned off

- **Given** a vault whose memories space is turned off
- **When** the operator opens Memories
- **Then** the view reads "Memories are turned off in this vault" instead of an error

### Requirement: Native window behaviour (R29)

The native app SHALL run as a single instance (a second launch focuses the first), remember window
size and position, and register a system-wide shortcut that brings the window forward with quick
add open.

> **Delivered (2026-10-16):** single instance and remembered window state. The system-wide
> shortcut is not built.

#### Scenario: Second launch

- **Given** the app is running behind other windows
- **When** the operator launches it again
- **Then** the existing window comes forward and no second window opens

### Requirement: Human-only destructive actions (R30)

Deleting tasks and notes, forgetting memories, clearing scratchpads and replacing bodies SHALL be
available to the human in the app only. The tools agents see MUST stay exactly as they are today.

#### Scenario: Agents cannot delete

- **Given** the app is installed and running
- **When** an agent lists its available tools
- **Then** it sees the same 40 tools as before and none of them deletes

### Requirement: Browser mode (R31)

The same app SHALL run in a regular browser against a local host process bound to the loopback
address, with identical behaviour including live refresh. The host MUST refuse requests that do
not carry its session token or that arrive under a foreign host name.

#### Scenario: Browser parity

- **Given** the host runs against the demo vault
- **When** the operator opens the app in a browser and completes a task
- **Then** the file changes exactly as it would from the native app

#### Scenario: Foreign page cannot write

- **Given** the host is running
- **When** a web page from another origin posts a write to it
- **Then** the request is refused and no file changes

### Requirement: Acting identity (R32)

Every write the app makes SHALL be attributed to the operator's configured identity, never to an
agent identity present in the environment the app was started from.

#### Scenario: Started from an agent shell

- **Given** the browser-mode host is started from a shell where the agent identity is set to claude
- **When** the operator adds a comment
- **Then** the comment is signed by the operator, not claude

### Requirement: Agent signalling contract (R33)

The instructions every agent receives from the Shards MCP server and from the shipped Shards agent
skill SHALL tell an agent that needs a human to (1) append a stamped question to the task and
(2) add the label `needs-input`. They MUST tell an agent whose task fails to add the label
`agent-error` and append a stamped line saying what failed. The shipped instruction text MUST be
pinned by an automated test so it cannot drift. These instructions add no tool; the agent uses the
append and update tools it already has.

#### Scenario: Agent stops for a missing credential

- **Given** an agent following the shipped skill hits a missing credential while working a task
- **When** it stops
- **Then** the task shows Needs input, and its question appears in Activity under the agent's name

#### Scenario: Agent reports a failure

- **Given** an agent following the shipped skill cannot complete a task
- **When** it gives up
- **Then** the task shows Error, and the failure reason appears in Activity

### Requirement: Completed log (R34)

The app SHALL offer a Completed view, reachable from the sidebar and from the command palette
("Go to Completed"). It lists every task whose `completed` time falls in the last 30 days, across
all projects (archived ones included), grouped by day, newest first. Each row MUST show the title,
its project, the completion time and the avatar of the identity that last wrote the task (its
`updated_by`; "unknown" when absent). A done task's row MUST offer Reopen, which sets it open again
(`task update --status open`, which clears `completed`) and returns it to its lists. A recurring
task appears once, at its latest completion, because its file keeps one `completed`; its row shows
the recurrence mark and its next date and offers no Reopen, because the task is still open.

#### Scenario: Reopen from log

- **Given** the operator completed "Pay invoice" yesterday
- **When** they open Completed and choose Reopen on that row
- **Then** "Pay invoice" leaves the log, shows as open in its project and in Today when due, and its file has no `completed`

#### Scenario: Recurring task shows only its latest occurrence

- **Given** "Water plants" repeats daily and was completed on each of the last three days
- **When** the operator opens Completed
- **Then** "Water plants" appears once, under today, with the recurrence mark, its next date and no Reopen action

#### Scenario: Older than 30 days

- **Given** a task completed 31 days ago
- **When** the operator opens Completed
- **Then** that task is not listed

### Requirement: Project management (R35)

The operator SHALL be able to create a project from the sidebar "+" and from the command palette
("New project"); rename it; give it a colour from the 10-name palette (red, orange, yellow,
green, teal, sky, blue, violet, pink, gray) or none; drag projects to reorder the sidebar, with the
order surviving a restart; archive and unarchive it; and delete it.

- **Archive** MUST hide the project from the sidebar and the pickers, and MUST exclude its tasks
  from Today, Upcoming, Waiting on me and label views. An "Archived projects" list in the sidebar
  footer shows archived projects, each with Unarchive. The project's own view still opens from that
  list.
- **Delete** of a project with no open task MUST happen at once with an undo toast. Delete of a
  project with open tasks MUST first ask for confirmation in a dialog that names the open-task
  count; on confirmation those tasks move to the Inbox and the project note is deleted (R25: to
  the OS Trash). One undo restores the project note and puts the moved tasks back in the project.

> **Delivered (2026-10-16):** create (`AddProjectDialog`), rename, colour, archive with "Show
> archived" in the sidebar, and delete that confirms with the open-task count, moves those tasks to
> the Inbox and offers undo. Not built: drag to reorder the sidebar (needs an `order` key on the
> project note), the palette "New project" entry, and excluding archived projects' tasks from
> Today and Upcoming.

#### Scenario: Create from the palette

- **Given** the command palette is open
- **When** the operator chooses "New project", types "Garden" and picks green
- **Then** "Garden" appears in the sidebar with a green dot and opens empty

#### Scenario: Rename and recolour

- **Given** a project "Home" coloured blue
- **When** the operator renames it to "House" and picks orange
- **Then** the sidebar, pickers and task rows show "House" in orange, and its tasks still belong to it

#### Scenario: Archive hides the project and its tasks

- **Given** a project "Old launch" with a task due today
- **When** the operator archives it
- **Then** it leaves the sidebar, the task no longer shows in Today, and "Archived projects" lists "Old launch" with Unarchive

#### Scenario: Delete a project with tasks

- **Given** a project "Trip" with 3 open tasks
- **When** the operator deletes it
- **Then** a dialog reads "Delete “Trip”? Its 3 open tasks move to the Inbox", and only after confirmation the project is gone and the 3 tasks are in the Inbox

#### Scenario: Undo a project delete

- **Given** the operator just deleted "Trip" and its 3 tasks moved to the Inbox
- **When** they press Undo
- **Then** "Trip" is back in the sidebar with its 3 tasks

#### Scenario: Reorder the sidebar

- **Given** projects Home, Work, Garden in that order
- **When** the operator drags Garden above Home
- **Then** the sidebar reads Garden, Home, Work, and still does after a restart

### Requirement: Multi-select and bulk actions (R36)

In every task list the operator SHALL be able to select several tasks: `x` or ⌘-click toggles
one row, Shift-click selects a range, Shift+↓/↑ extends the selection from the keyboard, and Esc
clears it. The `x` key follows the root keyboard map (root design.md: `x` selects, `e`
completes). While two or more tasks are selected, a bulk bar MUST offer: complete, move (project and
section), set priority, set due date, add or remove labels, and delete. Each bulk action writes
each task as its own single-task change through the same paths as a single edit, adds no tool,
and MUST be reversed by one undo. Bulk delete of two or more tasks MUST confirm with the count
first. When some writes fail, the bar MUST say how many failed and why; the others stay applied,
and the one undo reverses only those.

#### Scenario: Bulk reschedule

- **Given** four tasks selected in the Inbox
- **When** the operator sets their due date to tomorrow from the bulk bar
- **Then** all four are due tomorrow and one undo restores all four previous dates

#### Scenario: Bulk delete confirms

- **Given** three tasks selected
- **When** the operator chooses Delete in the bulk bar
- **Then** a confirmation reads "Delete 3 tasks? They move to the Trash. Undo for 10 s.", and nothing is deleted until confirmed

#### Scenario: Partial failure

- **Given** five tasks selected and an agent deletes one of them meanwhile
- **When** the operator completes the selection
- **Then** four are completed, the bar says "1 task could not be completed: not found", and undo reopens the four

### Requirement: Accessibility (R37)

Every control SHALL have an accessible name that a screen reader announces. With VoiceOver on
macOS, the operator MUST be able to complete a task, reschedule it and open it in the detail pane
without a pointer. When the system asks for reduced motion (`prefers-reduced-motion`), the change
flash (R24) and the drag animations MUST not play. At 200 % zoom no text or control is clipped or
unreachable. An automated axe-core check over every view MUST report zero serious or critical
violations in CI.

> **Delivered (2026-10-16):** a global `prefers-reduced-motion` rule shortens every CSS animation
> and transition, which covers the flash and dnd-kit transitions. Not built: the axe-core check,
> a VoiceOver pass and a 200 % zoom pass.

#### Scenario: Complete with VoiceOver

- **Given** VoiceOver is on and Today is open
- **When** the operator moves to the row "Renew passport" and activates its checkbox
- **Then** VoiceOver announces "Renew passport, task, not completed" before and "Completed" after, and the toast's Undo is reachable

#### Scenario: Reduced motion

- **Given** the system setting "Reduce motion" is on
- **When** an agent changes a visible task
- **Then** the row updates without the flash animation

### Requirement: Locale (R38)

Week start, 12- or 24-hour time and the order of day, month and year SHALL come from the system
locale. Settings MUST offer an override for each. They apply everywhere dates show or are picked:
row chips, the detail pane, the date picker, Upcoming's week layout and the week stepper. Numeric
dates typed in quick add (for example "3/4") follow the date-order setting. Quick-add words stay
English (§ Non-Goals).

> **Delivered (2026-10-16):** absolute dates use the browser locale; the date picker hard-codes
> Monday as week start (`weekStartsOn={1}` in `QuickAddForm.tsx`). No Settings overrides.

#### Scenario: Sunday week start

- **Given** the system locale starts the week on Sunday
- **When** the operator opens the date picker
- **Then** its weeks start on Sunday, and setting "Week starts on Monday" in Settings changes it at once

#### Scenario: 24-hour time

- **Given** Settings set time to 24-hour
- **When** a task is due at 5 pm
- **Then** its chip reads "17:00"

### Requirement: Waiting on me (R39)

The sidebar SHALL offer "Waiting on me" with a count. It lists, without duplicates:

- every open task whose session state is Needs input or Error (R16);
- every open task blocked by an open task assigned to the operator.

Rows are ordered by how long they have waited, longest first. The wait starts at the latest
stamped body entry written by someone other than the operator; when there is none, at the task's
`updated` time. Each row shows that age. A Needs input or Error row MUST offer "Answer & resume"
inline: a one-line comment box that appends the operator's signed comment and removes
`needs-input` or `agent-error` in one action (R16).

#### Scenario: Answer from the queue

- **Given** claude marked "Rotate API key" `needs-input` with the stamped question "Which vault?" two hours ago, and codex marked another task `agent-error` an hour ago
- **When** the operator opens Waiting on me
- **Then** "Rotate API key" is first with "2 h", and answering "Use prod" in its inline box appends the comment, removes the label and drops the row from the queue

#### Scenario: Blocked on the operator

- **Given** codex holds "Ship release", which is blocked by "Approve changelog" assigned to the operator
- **When** the operator opens Waiting on me
- **Then** "Ship release" is listed with "Blocked by Approve changelog (you)"

### Requirement: Reminders while the app is open (R40)

While the app window is open (focused, in the background or minimised), every open task with a
due time SHALL raise a system notification within 60 seconds after that time. The notification
shows the title and the project; choosing it brings the window forward with the task open. A task
completed, rescheduled or deleted before its time raises nothing. A recurring task reminds at each
occurrence's time. Times that passed while the app was closed raise nothing at launch; Today's
Overdue group covers them. The first timed task asks for notification permission; when it is
denied, the app shows an in-app toast instead and Settings says how to allow notifications.
Tray, close-to-tray and delivery while the window is closed are app-polish (AP1).

#### Scenario: Reminder fires

- **Given** the app is open in the background and "Call bank" is due today at 10:00
- **When** the clock reaches 10:00
- **Then** a notification "Call bank · Home" appears by 10:01, and choosing it opens the task

#### Scenario: Completed before its time

- **Given** "Call bank" is due at 10:00
- **When** the operator completes it at 09:50
- **Then** no notification appears at 10:00

#### Scenario: Recurring reminder

- **Given** "Stand-up" repeats every weekday at 09:30
- **When** the operator completes Monday's occurrence and Tuesday 09:30 comes with the app open
- **Then** a notification for "Stand-up" appears by 09:31 on Tuesday

### Requirement: Open in the operator's Markdown editor (R41)

Every task and every file in the Notes view SHALL offer "Open in", which opens the underlying
Markdown file outside Shards. When the vault (or a folder above it) is an Obsidian vault, the
default target MUST be Obsidian, opened on that exact file. The menu MUST also offer the system
default app and "Show in Finder" in the desktop app, and "Copy path" everywhere. Settings MUST let
the operator choose the default target (Obsidian or the system default app). `⌘⇧O` opens the
selected task or file with the default target. The app MUST refuse to open a path outside the
vault's enabled space roots. In browser mode only the Obsidian link and "Copy path" are offered.

#### Scenario: Jump to Obsidian from a task

- **Given** the vault is registered in Obsidian and a task is open in the detail pane
- **When** the operator clicks "Open in Obsidian" or presses `⌘⇧O`
- **Then** Obsidian opens that task's Markdown file

#### Scenario: No Obsidian vault

- **Given** a vault with no `.obsidian` folder in it or above it
- **When** the operator opens a file's "Open in" menu
- **Then** the default target is the system default app, and no Obsidian entry is shown

---

## User Experience

A morning with the app:

```
08:55  Opens Shards. Today: 2 overdue, 5 due today. One row shows claude · Needs input.
08:56  Presses q: "Book dentist tomorrow 9am @health p3"  ->  appears under Upcoming › Thu.
08:57  Opens the claude task, reads its question in Activity, answers in the comment box.
       The row flips to Working.
09:10  Agents view: codex Live, holding 2 tasks; claude Idle. codex's scratchpad shows 3/7 done.
09:12  Memories, owner = codex: one memory says deploys run Fridays. "Correct this" -> Thursdays.
09:30  While writing, a task row flashes: codex finished "Write changelog";
       "Ship release" turns ready.
```

---

## Outputs

- A native desktop app for macOS 13.3+ (Linux builds best effort; Windows not supported).
- A local host process that serves the same app to a browser for testing and development.
- Writes only through the same validated paths the CLI and agents use; the Markdown files remain
  the only store.
- A seeded demo vault for verification and screenshots.

---

## Non-Goals

- Tray icon, close-to-tray, autostart, and reminders while the window is closed (app-polish AP1).
  In-window reminders are R40.
- A separate floating quick-add window; this feature's system-wide shortcut only brings the main
  window forward with quick add open (app-polish).
- Saved filters, a filter query language, per-view sort and group options, task links and a URL
  scheme, calendar layout, time blocking, durations (app-polish).
- Quick add in languages other than English: the quick-add grammar (keywords, weekday and month
  names, "every") is English only. Locale changes how dates show, not how quick add reads words.
- Importers from Todoist or Obsidian Tasks (app-polish).
- Multiple humans, sharing, roles, presence, notifications to others (multiplayer).
- Sync between devices, remote agent access (sync, remote-mcp).
- An in-app Trash view. App deletes go to the operating system's Trash (R25); the in-app undo
  holds deleted content for the session only.
- Editing members or roles from the app; members are edited in the config file.
- Linking a memory as superseded by an already existing memory, or un-superseding one.
- A history of every occurrence of a recurring task. The completed log (R34) shows only its
  latest completion, because a recurring finish records nothing else. This gap needs an entry in
  task-model-v2's Open Questions.
- Windows support (file locking is POSIX-only today).
- Mobile and web-hosted versions (web-mobile).

---

## Decisions

1. **Sections live in the project.** A project stores its ordered section list, so empty
   sections and section order survive restarts and other readers; tasks name their section.
2. **The operator sees private memories.** Privacy between agents is a courtesy filter, not a
   permission; the human owner of the vault sees everything, marked with a lock.
3. **One vault for app, CLI and agents.** Changing the vault in the app changes it for every tool
   on the machine, so they can never silently diverge.
4. **Session state is derived, never stored.** The five states come from status, holder and two
   reserved labels (`needs-input`, `agent-error`), so agents set them with the tools they already
   have. The shipped agent instructions tell them when (R33).
5. **Activity is what the file records.** The timeline is built from the task's own timestamps and
   stamped body entries; there is no separate activity store in this feature.
6. **Undo is session-scoped and refuses to clobber.** Undo restores exact bytes, refuses when
   anyone else changed the item since, and does not survive quitting the app. Deleted files go to
   the OS Trash, so recovery after quit uses the operating system (D6 as amended 2026-10-16).
7. **Unknown quick-add references are never created implicitly.** A typo in `#project` or
   `+assignee` must not spawn a project or an identity.

---

## Risks

| Risk | Mitigation |
|---|---|
| Undo after a Trash delete recreates the file while the Trash still holds a copy; a later restore from the Trash gives two files with one id | The delete toast's Undo is the in-session path and the Trash the after-quit path; after Undo the toast says "The copy in the Trash is now stale". desktop-app/31 tests that undo then restore-from-Trash is reported as a duplicate id, never merged silently |
| Large vaults feel slow (readiness checks grow quadratically with task count) | Lists ask only for the statuses they show; the 5k-task fixture budgets (root tech.md § Performance Budgets) are part of verification; the fix is scheduled before polish |
| Change notifications drop on cloud-synced folders | Refresh on window focus; reconnect refreshes everything |
| Natural-language dates mis-read names ("May", "March") | Highlight every parsed token; a bare month name is never taken as a date (delivered); one-click revert is not built; `parse.test.ts` covers names |
| The operator overwrites an agent mid-write | Edits carry the version they started from; conflicting saves are refused with a banner |
| Undo of a change that touched two items (blockers, corrections) is partial | Blocker changes undo by applying the inverse change; corrections are not undoable from the toast and say so |
| "Shards" collides with Crystal's `shards` binary | Recorded at root; the app's name is unaffected |

