---
type: feature-research
feature: task-sources
parent: product.md
updated: 2026-10-16
---

# task-sources — Research

Decision brief for three task sources in one read model: simple Shards tasks stored as checkbox
lines, foreign checkbox lines in ordinary notes, and a read-only local copy of the owner's
Todoist. It replaces the import-only `task-interop` draft (2026-10-16). Sources: two read-only
research passes on 2026-10-16 (Todoist API v1, Obsidian Tasks), the code trace of
`src/domain/tasks.rs`, `src/storage/`, `src/mcp/` and `crates/shards-host`, and the owner
decisions below. Deleted with the feature folder at wrap-up.

**Status:** DRAFT — owner decisions recorded 2026-10-16; plan pending owner approval.

---

## Question

1. How does Shards store a simple task as one Markdown checkbox line without breaking atomic,
   single-entity, crash-safe writes?
2. How do foreign checkbox lines in user notes appear in Shards views without Shards writing into
   those notes?
3. How does Shards read Todoist in full without ever writing to it, and how does an agent work on a
   Todoist task?

---

## Owner decisions (2026-10-16, binding)

| # | Decision | Effect on this feature |
|---|---|---|
| OD1 | **Lines for simple, file for rich.** A new simple task is one checkbox line in a tasks note. A task becomes its own file only when it needs a body, comments, a claim or blockers (promotion). Existing file tasks stay valid. | Two storage forms for one native task model; a one-way promotion |
| OD2 | **Shards also reads `- [ ]` lines inside ordinary notes** (Obsidian Tasks and Dataview formats), alongside native tasks and Todoist. | A read-only inline source over the notes space |
| OD3 | **Todoist: full read-only integration** from the UI, MCP and CLI. Nothing is ever written to Todoist. Human tasks come from Todoist, and the owner can assign agents to them. Model "linked task on assign": Todoist tasks are read-only rows from a local copy; assigning, delegating or claiming creates a linked native task (`source: todoist:<id>`) whose Todoist-owned fields (title, due, priority, project, completion) keep refreshing from the copy on each pull. | A pull into `.shards/todoist/`, read-only rows, linked native tasks |
| OD4 | Testing against the owner's real Todoist account is allowed **read-only**, with the token from `SHARDS_TODOIST_TOKEN` or the keychain, plus recorded fixtures for CI. | An ignored smoke test plus synthetic fixtures |

What the decisions change against the `task-interop` draft:

- AP5 is no longer an importer. Todoist stays the human's system and is mirrored, not migrated.
- AP6 is no longer an importer either. Foreign lines are read in place and never copied.
- The draft's Inbox capture pull (close in Todoist after import) is ruled out: it writes to Todoist.

---

## Todoist API v1 (cited)

All anchors are on <https://developer.todoist.com/api/v1/> unless marked otherwise.

- **One API.** v1 replaces Sync v9 and REST v2. Ids are opaque strings; old numeric ids are
  rejected (`#tag/Migrating-from-v9`, `#tag/Ids`). `/sync` keeps the old object names (`items`,
  `notes`). Task URL: `https://app.todoist.com/app/task/<id>`.
- **Auth** (`#tag/Authorization`). `Authorization: Bearer <token>`. A personal API token (Settings →
  Integrations) fits a single-user read-only pull. OAuth apps get 1-hour tokens with rotating
  refresh tokens, which this feature does not need.
- **Read path** (`#tag/Sync`). `POST /api/v1/sync`, form-encoded, with `sync_token` (`*` = full)
  and `resource_types` (`items`, `projects`, `sections`, `labels`, `notes`, `user`, …). The
  response carries `sync_token`, `full_sync`, `full_sync_date_utc`. A full sync can lag on big
  accounts; follow it with an incremental call (`#tag/Sync/Overview/Incremental-sync`).
- **Writes are a separate parameter.** Writes go through `commands=[…]` on the same endpoint. A
  read-only client never sends `commands`; that is the whole write surface to keep out.
- **Incremental semantics (to verify on the real account, read-only).** Deleted objects arrive
  with `is_deleted: true` and completed tasks with `checked: true` per the Sync v8 docs
  (<https://developer.todoist.com/sync/v8>) and the Doist Python SDK
  (<https://github.com/Doist/todoist-python/blob/main/todoist/api.py>). The v1 page lists the
  fields but does not restate the behaviour.
- **Task object** (`#tag/Sync/Tasks`): `id`, `project_id`, `section_id`, `parent_id`, `content`
  (title, may hold Markdown), `description`, `priority` 1..4 (**4 = p1 in the apps; 1 = p4, the
  default**), `due`, `deadline` (`{date}`, never recurring, `#tag/Deadlines`), `duration`,
  `labels`, `child_order`, `responsible_uid`, `checked`, `is_deleted`, `added_at`, `updated_at`,
  `completed_at`.
- **Due dates** (`#tag/Due-dates`). Full-day (`YYYY-MM-DD`), floating (`YYYY-MM-DDTHH:MM:SS`, no
  zone, the default) or fixed zone (`…Z` plus `timezone`). Every due carries `string` (e.g.
  `every mon`), `lang` and `is_recurring`. There is no rule object: recurrence exists only as
  text. Grammar: <https://www.todoist.com/help/articles/introduction-to-recurring-due-dates-YUYVJJAV>.
- **Recurring completion does not set `checked`.** Only `due.date` moves. A read-only mirror only
  shows the new date; it never has to infer a completion.
- **Completed tasks.** A full sync returns active tasks only. `GET /api/v1/tasks/completed/by_completion_date`
  (window up to 3 months, cursor pages) lists completed ones. `GET /api/v1/tasks/{id}` reads one
  task.
- **Limits** (`#tag/Request-limits`). 1000 partial and 100 full syncs per user per 15 min; 1 MiB
  body; `retry_after` on 429. A pull every few minutes is far inside this.
- **Webhooks** (`#tag/Webhooks`) need a public HTTPS endpoint and an OAuth app, and "should be used
  only as notifications and not as primary Todoist data sources". Out of scope.
- **Deadlines** are Pro/Business (<https://www.todoist.com/help/articles/introduction-to-deadlines-uMqbSLM6U>).
  A free account returns none.
- **obsidian-taskui** (`LennardZuendorf/obsidian-taskui` @ `811d339f`) has no Todoist code, and its
  debug panel prints the first 8 characters of the stored key. Lesson: never store the token in
  config or vault, and never echo any part of it.

### Mapping (Todoist → Shards row)

| Todoist | Shards row field | Notes |
|---|---|---|
| `id` | `id` = `todoist:<id>` | A source ref, never a `t-` id |
| `content` | `title` | Shown verbatim |
| `description` | body (read-only) | Shown in get; never copied into a linked task body |
| `priority` 4 / 3 / 2 / 1 | `urgent` / `high` / `normal` / unset | Owner rule: the Todoist default maps to unset |
| `due` full-day / floating | `due` `YYYY-MM-DD` / `YYYY-MM-DDTHH:MM` | Seconds dropped |
| `due` fixed zone | `due` in local wall-clock time | Zone dropped; row carries a warning |
| `due.string` + `is_recurring` | `recur_text`, `recurring` | Displayed only; never converted to an RRULE |
| `deadline.date` | `deadline` | Absent on free plans |
| `labels` | `tags` | Display only |
| `project_id`, `section_id` | `todoist_project`, `section` (names) | A Shards project note may claim a Todoist project |
| `parent_id` | `todoist_parent` | Display only |
| `checked`, `completed_at` | `status: done`, `completed` | |
| `is_deleted` | dropped from rows; tombstone kept for linked tasks | |
| `added_at`, `updated_at` | `created`, `updated` | |
| `notes` (comments) | `comments` in get | Read-only |
| `responsible_uid`, `duration`, reminders, `day_order` | — | Not mapped |

---

## Obsidian Tasks and Dataview grammar (cited)

Sources pinned: `obsidian-tasks-group/obsidian-tasks` @ `82a6d462` (v8.5.0, MIT; the owner's vault
runs 8.3.0) and <https://publish.obsidian.md/tasks/>.

- **Line shape** ([`TaskRegularExpressions.ts`][src-re], [`Task.ts`][src-task]): indent of spaces,
  tabs or `>`; marker `-`, `*`, `+`, `n.` or `n)`; `[c]` with one character; then the body. Any
  list item with a checkbox is a task ([Getting Started][gs]) unless a global filter is set
  ([Global Filter][gf]).
- **One format at a time.** Tasks reads and writes either the emoji format ([Emoji][emoji]) or the
  Dataview format ([Dataview][dv]), never both ([About Task Formats][fmt]). The owner's plugin is
  set to `taskFormat: dataview` with an empty global filter.
- **Dataview fields** are `[key:: value]` or `(key:: value)`. Tasks reads the keys `id`,
  `dependsOn`, `priority`, `repeat`, `onCompletion`, `created`, `start`, `scheduled`, `due`,
  `cancelled`, `completion`, with date values `YYYY-MM-DD`. Tasks always writes `[…]` with two
  leading spaces (issue #1913). `priority::` takes `highest|high|medium|low|lowest`; no field means
  None, which is distinct from medium ([Priority][prio]).
- **Parse direction** ([`DefaultTaskSerializer.ts`][src-ser]): Tasks strips fields from the **end**
  of the line, at most 20 passes. Unrecognised text stops the loop, and any field left of it stays
  in the description. A Shards-only field such as `[owner:: x]` therefore has to sit left of the
  Tasks fields, or Tasks reads none of them.
- **Write order** ([`TaskLayoutOptions.ts`][src-layout]): description, id, dependsOn, priority,
  recurrence, onCompletion, created, start, scheduled, due, cancelled, done, block link.
- **Statuses** ([Statuses][st], [`Status.ts`][src-status]): ` ` todo, `x`/`X` done, `/` in
  progress, `-` cancelled; unknown symbols count as todo.
- **Recurrence** ([Recurring Tasks][rec], [`Recurrence.ts`][src-rec]): completing a recurring line
  inserts a **new line** for the next instance and drops `id`/`dependsOn` from it. A Shards line
  with `[id:: t-…]` would be copied without its id. Recurring Shards tasks therefore stay files.
- **Tags** ([Tags][tags]): `#tag` tokens; trailing tags among the fields are put back into the
  description.
- **Owner's vault** (counts only, read-only): 97 checkbox lines in 11 user notes (95 open), 0 Tasks
  emoji fields, 0 Dataview inline fields, 0 block ids, 0 duplicate line texts outside dot folders,
  at most 90 task lines in one file. The vault is the Shards vault (`tasks = "Agents/tasks"`,
  `notes = "."`), so Obsidian already indexes the tasks space.
- **TaskUI** (`src/data/taskMapper.ts`) diverges from Tasks in six ways (fields matched anywhere,
  medium dropped on write, `X` read as todo, `dependsOn` joined by spaces, unknown tokens dropped,
  read-then-modify writes). Port the Tasks algorithm, not TaskUI; use TaskUI's 32 mapper tests,
  corrected, as extra fixtures.

### Mapping (line ↔ Shards)

| Line | Shards | Notes |
|---|---|---|
| description | `title` | One line |
| `#tag` tokens | `tags` | Only tokens that are valid Obsidian tags |
| `[ ]`, `/`, other | `open` | `/` has no claim identity, so it reads as open |
| `[x]`, `[X]` + `completion::` / ✅ | `done`, `completed` (date at local midnight) | Time of day lost |
| `[-]` + `cancelled::` / ❌ | `cancelled` | |
| `due::` / 📅 | `due` | Shards writes a time only when the task has one |
| `priority::` highest / high / medium / low / lowest, or 🔺 ⏫ 🔼 🔽 ⏬ | `urgent` / `high` / `normal` / `low` / `low` | Lowest collapses into low on foreign lines; Shards never writes lowest |
| `created::` / ➕ | `created` (date) | |
| `id::` / 🆔 | Shards id when it is a `t-` id; otherwise part of the inline key | |
| `repeat::` / 🔁, `dependsOn::` / ⛔, `start::`, `scheduled::` | shown as text, never mapped on foreign lines | A Shards line never carries them |

---

## Line storage trade-offs

| Concern | Finding | Consequence |
|---|---|---|
| **Concurrency** | Every line in one note shares one file. A per-entity lock alone cannot stop two writers that edit two different lines from replaying stale copies of the whole note over each other (lessons: "A list derived from an unlocked scan is a claim about the past"). | One lock per tasks note, taken after the entity lock; every edit re-reads the note inside the lock and replays the edit by line id. Writers to line tasks serialise on that lock. |
| **Identity** | Line numbers shift on any edit. Text matching hits duplicates. `id_taken` checks task files only. | Every Shards-written line carries `[id:: t-XXXX]`. Edits address the id, never a line number. Id minting checks files and lines under the create lock. |
| **Crash safety** | Promotion spans two files: the new task file and the tasks note (lessons: "Write-then-move must survive a crash"). | Write the file first (no-clobber, same id), then drop the line. Zero copies cannot happen; two copies resolve to the file and the next note write removes the line. |
| **Foreign editors** | Obsidian does not honour Shards locks, and its buffer can overwrite a Shards write. | Same class as the open body-precondition decision (DR1). The note is re-read inside the lock; the residual risk is recorded. |
| **Size** | The walk skips files over 4 MiB; done lines accumulate. | A soft cap on the tasks note; a create past it falls back to a file. |
| **Metadata** | Lines hold no body, no actor stamps, date-only `created` and `completed`, and no `updated`. | `updated` comes from the note's mtime; a line task carries no `created_by`/`updated_by`. Promotion keeps every value it has. |
| **Sync** | Sync merges per record and per key (sync product R6, R7). A tasks note as one record would turn a same-line conflict into a whole-note conflict copy, and a note without an id does not sync at all (sync R15). | Recommend that sync treat each line task as one record keyed by its `t-` id, with storage form as a local detail. Promotion then changes storage, not identity, and two offline promotions of the same id produce one record. |

---

## Approaches tried

| Approach | Result | Notes |
|---|---|---|
| Todoist one-shot import (draft AP5) | superseded | OD3: Todoist stays the human's system |
| Todoist Inbox capture pull with close | rejected | Writes to Todoist (OD3) |
| Todoist two-way polling or webhooks | rejected | Writes to Todoist; webhooks need a server |
| Obsidian checkbox importer (draft AP6) | superseded | OD2 reads lines in place |
| Two-way edits of foreign lines | deferred | Writes into notes Shards does not own |
| Generated Tasks-format export note | rejected | Stored derived state; a tick in Obsidian is overwritten |
| One tasks note per project | deferred | A project change becomes a two-file move; v1 keeps one note with a `project::` field |
| Emoji line format, or a per-vault choice | rejected for writing | The owner's Tasks plugin reads Dataview only; one emitter keeps one round-trip contract. Emoji stays readable on foreign lines. |
| Port TaskUI's mapper | rejected | Six divergences from Tasks |

## Decision

Build one native task model with two storage forms (file, line), one read-only inline source, and
one read-only Todoist source, all listed through the existing select engine. Lines are written in
the Dataview format. Promotion is one-way. Todoist is read through an explicit pull into a local
copy, never on list, and agents act on Todoist tasks only through a linked native task. Details:
[product.md](product.md), [tech.md](tech.md).

<!-- link refs -->
[gs]: https://publish.obsidian.md/tasks/Getting+Started/Getting+Started
[gf]: https://publish.obsidian.md/tasks/Getting+Started/Global+Filter
[tags]: https://publish.obsidian.md/tasks/Getting+Started/Tags
[st]: https://publish.obsidian.md/tasks/Getting+Started/Statuses
[prio]: https://publish.obsidian.md/tasks/Getting+Started/Priority
[rec]: https://publish.obsidian.md/tasks/Getting+Started/Recurring+Tasks
[emoji]: https://publish.obsidian.md/tasks/Reference/Task+Formats/Tasks+Emoji+Format
[dv]: https://publish.obsidian.md/tasks/Reference/Task+Formats/Dataview+Format
[fmt]: https://publish.obsidian.md/tasks/Reference/Task+Formats/About+Task+Formats
[src-ser]: https://github.com/obsidian-tasks-group/obsidian-tasks/blob/82a6d46226ed477440ff0527370dd1c21fa113d0/src/TaskSerializer/DefaultTaskSerializer.ts
[src-re]: https://github.com/obsidian-tasks-group/obsidian-tasks/blob/82a6d46226ed477440ff0527370dd1c21fa113d0/src/Task/TaskRegularExpressions.ts
[src-task]: https://github.com/obsidian-tasks-group/obsidian-tasks/blob/82a6d46226ed477440ff0527370dd1c21fa113d0/src/Task/Task.ts
[src-status]: https://github.com/obsidian-tasks-group/obsidian-tasks/blob/82a6d46226ed477440ff0527370dd1c21fa113d0/src/Statuses/Status.ts
[src-rec]: https://github.com/obsidian-tasks-group/obsidian-tasks/blob/82a6d46226ed477440ff0527370dd1c21fa113d0/src/Task/Recurrence.ts
[src-layout]: https://github.com/obsidian-tasks-group/obsidian-tasks/blob/82a6d46226ed477440ff0527370dd1c21fa113d0/src/Layout/TaskLayoutOptions.ts
