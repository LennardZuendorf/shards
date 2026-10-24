---
type: feature-tech
feature: task-sources
status: draft
sibling: product.md
parent: ../../tech.md
updated: 2026-10-16
---

# Feature: Task sources — Architecture

**Status: DRAFT — owner decisions recorded 2026-10-16; plan pending owner approval.** Every new
name below is a proposal until the owner signs off (§ Surface changes).

One native task model with two storage forms (a file, or a line in the tasks note), plus two
read-only origins (inline lines in user notes, and a Todoist local copy). A hand-written line codec
(no `regex`) reads both Tasks formats and writes Dataview only. Every source becomes `Row`s for the
one select engine. Line writes take the entity lock and then a tasks-note lock and replay edits by
id. Promotion writes the file first, then drops the line, and readers prefer the file. The Todoist
pull lives behind a non-default cargo feature `todoist` (blocking `ureq` + rustls, `keyring`), so
the default `shards` binary links no HTTP or TLS stack; reading the copy needs neither and is in
every build. The agent MCP table stays at 40 tools.

**Parent:** [../../tech.md](../../tech.md)
**Requirements:** [product.md](product.md)
**Plan:** [plan.md](plan.md)
**Research:** [research.md](research.md)
**Related:** [../task-model-v2/tech.md](../task-model-v2/tech.md) (fields, `persist`),
[../sync/tech.md](../sync/tech.md) (the `ureq`/`keyring` stack and the record model),
[../desktop-app/tech.md](../desktop-app/tech.md) (host tools)

---

## Code facts this design rests on

Traced 2026-10-16 in the working tree.

| Fact | Where |
|---|---|
| `resolve(cfg, id)` is the only id→path mapping; it matches file stems in `open/` and `done/` | `src/domain/tasks.rs:239` |
| `task_files` walks `open/` and `done/` non-recursively with `iter_md`; a file at the tasks root is never a task | `tasks.rs:224` |
| Mutating verbs take `hold(&entity_lock(root, id))` and re-resolve inside it; `create` holds `_create.lock` across minting and the write | `tasks.rs:509, 602, 700, 729, 852` |
| Locks live at `<space-root>/.locks/<id>.lock`; `entity_lock` rejects ids with `/`, `\`, NUL or a leading `.` | `src/storage/lock.rs:30-47` |
| `id_taken` checks task file stems only | `tasks.rs:274` |
| `generate_id(prefix, created, title, exists)` hashes `created \0 title`, Crockford base-32, at least 4 chars, `extend` on collision | `src/ids.rs:12, 41, 58` |
| `NewTask` cannot set `id`, `created`, `status` or unknown keys | `tasks.rs:92` |
| `select<V: FromMeta + Sortable>(Vec<Row>, &Filter)` filters raw meta, admits through `from_meta`, then sorts stably | `src/domain/select.rs:224, 251` |
| `Task::from_meta` requires a `t-` id, `type: task`, `title`, `created`, `updated` | `src/model/task.rs:138-183` |
| Readiness indexes `t-` ids only and fails open on a missing blocker | `src/domain/deps.rs:51, 137` |
| `raw::write_new` creates without clobbering (`renameat NOREPLACE`) | `src/storage/raw.rs:46` |
| `write_doc` enforces the sandbox and the 4 MiB cap, then `atomic_write` | `src/fm/doc.rs:86-101` |
| The vault-root `.shards/` is outside every space root; `safe_resolve` and `write_doc` reject it | `src/storage/sandbox.rs:55-77` |
| The host watcher ignores every path with a dot component | `crates/shards-host/src/lib.rs:167` |
| No `[features]` section, no TLS crate and no keychain crate exist in the workspace | root and crate `Cargo.toml`, `Cargo.lock` |
| The 40-tool count is pinned in `src/mcp/mod.rs:210`, `tests/mcp_cli.rs:311,319`, `src/mcp/schema.rs:786`, `tests/bundle.rs:375-406` (39 allowed tools) and the skill's `allowed-tools`; `tools/list` must stay ≤ 40 KiB (`schema.rs:912`) | |
| `tools/list` measured 38,639 bytes (debug build of this tree, 2026-10-16) | headroom 2,321 bytes |
| The cold-start pin is min of 10 warm runs under 50 ms; 10 ms is the goal (KPI K5) | `tests/foundation_cli.rs:341-393` |

---

## Files

```
src/lines/mod.rs            # module surface                                                    ~20 LOC
src/lines/codec.rs          # pure line scanner (Dataview + emoji) and Dataview emitter          ~600 LOC
src/lines/note.rs           # tasks note: load, segment, apply LineEdit by id, dump; note lock   ~350 LOC
src/lines/inline.rs         # foreign scan over the notes walk; inline keys; global filter       ~250 LOC
src/domain/sources.rs       # Origin, Storage, Target, rows_all, resolve_target, read-only refusal ~400 LOC
src/domain/promote.rs       # promotion steps, repair of stale lines                            ~250 LOC
src/domain/tasks.rs         # create picks storage; verbs branch on Target; create_seeded seam   +250 LOC
src/model/task.rs           # `source`, `source_state` in TASK_FIELDS; IdRule for source rows    +60 LOC
src/ids.rs                  # derived_id(prefix, namespace, key, exists)                         +30 LOC
src/domain/select.rs        # select_with(rows, f, admit); select unchanged                     +20 LOC
src/todoist/mod.rs          # module surface (copy, map, link always; pull behind `todoist`)    ~20 LOC
src/todoist/copy.rs         # .shards/todoist/copy.json: types, read, atomic write, pull lock    ~250 LOC
src/todoist/map.rs          # Todoist item -> Row; priority, due, zone, recurrence text          ~250 LOC
src/todoist/link.rs         # linked id, create on claim/assign, refresh diff, upstream rules    ~300 LOC
src/todoist/pull.rs         # #[cfg(feature = "todoist")] full/incremental read, apply, refresh  ~300 LOC
src/net/http.rs             # #[cfg(feature = "todoist")] read-only ureq client (GET, form POST)  ~150 LOC
src/net/creds.rs            # #[cfg(feature = "todoist")] env then keychain; redacting Token     ~100 LOC
src/cli/todoist.rs          # `shards todoist pull|login|logout`                                 ~150 LOC
src/cli/task.rs             # `--origin`; refs in get/claim/update                               +60 LOC
src/mcp/schema.rs, tools.rs # `origin` param; ref-aware handlers; health `sources` block          +80 LOC
src/config.rs               # [tasks].note, [sources].inline, [todoist].pull_minutes              +60 LOC
crates/shards-host/src/{lib,tools}.rs, bin/shards-host.rs  # timer, events, 2 host tools          +200 LOC
apps/desktop/src/**         # source badge, read-only rows, Todoist group, settings card          ~500 LOC
tests/task_lines_cli.rs, tests/task_promote.rs, tests/task_inline_cli.rs,
tests/todoist_copy.rs, tests/todoist_pull.rs, tests/todoist_live.rs (#[ignore]), tests/race.rs (+)
tests/fixtures/tasks-format/  # Tasks approved doc samples + corrected TaskUI cases
tests/fixtures/todoist/       # synthetic sync responses (never real account content)
```

---

## Contract / API

### Line grammar

Read (both formats, ported from Tasks `DefaultTaskSerializer`, end-anchored, at most 20 passes):

```
line    = indent marker " [" status "] " body
indent  = { " " | "\t" | ">" }          marker = "-" | "*" | "+" | digits ("." | ")")
body    = description { " " tag } { field } [ " ^" blockid ]
field   = "  [" key ":: " value "]" | "  (" key ":: " value ")" | emoji-signifier value
```

Write (Shards lines only, Dataview, two spaces before each field as Tasks writes them):

```
- [ ] <title>[ #tag…][  [owner:: o]][  [project:: n-…]][  [section:: s]][  [order:: n]][  [deadline:: YYYY-MM-DD]]  [id:: t-XXXX][  [priority:: highest|high|medium|low]]  [created:: YYYY-MM-DD][  [due:: YYYY-MM-DD[THH:MM]]][  [cancelled:: YYYY-MM-DD]][  [completion:: YYYY-MM-DD]]
```

| Line | Task key | Rule |
|---|---|---|
| status ` ` / `x` / `-` | `status` open / done / cancelled | Read: `X` done; `/` and unknown symbols open. A line is never `claimed`. |
| description | `title` | |
| `#tag` | `tags` | Only valid Obsidian tags (`#[^ !@#$%^&*(),.?":{}\|<>]+`, not all digits) |
| `owner`, `project`, `section`, `order`, `deadline` | same keys | Shards-only; Tasks reads them as description text, Dataview as fields |
| `id` | `id` | Required on Shards lines |
| `priority` | `priority` | highest ↔ urgent, high ↔ high, medium ↔ normal, low ↔ low; lowest reads as low |
| `created` | `created` | Date; read as `YYYY-MM-DDT00:00:00Z` |
| `due` | `due` | `Value::Ts` raw text, as on files |
| `completion` / `cancelled` | `completed` | Date; read as local midnight in UTC |
| — | `updated` | The tasks note's mtime, RFC 3339 `Z`, shared by every line in it |
| — | `created_by`, `updated_by`, body, `blocks`, `blocked_by`, `recur`, `recur_from`, `parent`, `claimed_by`, `source`, `source_state` | Never on a line; any of them makes the task a file |

**Line eligibility is one definition, the round trip.** `codec::line_form(&LineTask) -> Option<String>`
emits the line, parses it back and returns `Some` only when the parse equals the input. Create,
update and promotion all call it. A title ending in a `#word`, a value holding `]` or `::`, a
newline, or leading or trailing whitespace therefore fails by construction (lessons: "A writer and
its reader must share one definition of what needs quoting").

### Tasks note

- Path: `[tasks].note`, relative to the tasks space root, default `"Tasks.md"`; `false` turns line
  storage off. It must not resolve into `open/` or `done/`; config load rejects that.
- Marker: frontmatter `type: tasks`. Shards creates the note with exactly that frontmatter. A file
  at the path without the marker is never written; creates fall back to files with warning
  `tasks_note_foreign`.
- Soft cap: 1 MiB. A create that would pass it becomes a file with warning `tasks_note_full`. The
  walk's hard cap is 4 MiB.
- `note.rs` loads the note as segments: frontmatter, then each body line tagged
  `Task{id: Option, parsed}`, `Fence` (inside a fenced code block) or `Other`. `dump` writes every
  `Other` and `Fence` segment back byte-for-byte.
- Lines without an id (typed by hand) read as inline rows of origin `inline`, storage `line`, until
  the next line create mints ids for them (Open Question 4 in [product.md](product.md)).
- Duplicate ids: the first line keeps the id; the next line create re-mints the later ones.
- Minting happens only in a line create, which holds create → note. Other note writes never mint,
  so they never need the create lock.

### Origins, storage and refs

```rust
// src/domain/sources.rs
pub enum Origin { Shards, Inline, Todoist }           // JSON: "shards" | "inline" | "todoist"
pub enum Storage { File, Line, Note, Copy }           // JSON: "file" | "line" | "note" | "copy"
pub enum Target {
    File(PathBuf),                                    // t-… with a file (wins over a line)
    Line { note: PathBuf, id: String },               // t-… on a tasks-note line
    Inline { path: PathBuf, key: String },            // inline:<10 Crockford chars>
    Todoist { item: String, linked: Option<PathBuf> },// todoist:<Todoist id>
}
pub fn resolve_target(cfg: &Config, id: &str) -> Result<Target>;
pub fn rows_all(cfg: &Config, origins: &[Origin]) -> Result<Vec<Row>>;
pub fn refuse_read_only(t: &Target, verb: &str) -> ShardsError;   // kind `validation`, exit 2
```

- `t-` ids resolve to a file first, then to a line. Linked tasks are files with `origin: todoist`.
- `inline:` key = first 10 Crockford chars of `sha256(rel_path \0 anchor)`. Anchor is `id:<v>` for a
  Tasks id, `block:<v>` for a `^blockid`, else `text:<normalized> \0 <k>` where `normalized` drops
  the status character, completion and cancellation fields and collapses whitespace, and `k` is the
  index among equal normalized lines in that file.
- `todoist:` refs carry the opaque Todoist id unchanged.
- A read-only refusal reuses `validation` (exit 2); no new error kind.

### Task model additions (sign-off: product Open Question 2)

- `TASK_FIELDS` appends `source` and `source_state` after the last key. Both are written only when
  set, like the v2 keys. `source` is `todoist:<id>`; `source_state` is `open`, `completed` or
  `deleted`. Both are read tolerantly.
- `Task::from_meta_with(meta, IdRule)`: `IdRule::Native` (today's `t-` rule) for files and lines,
  `IdRule::Source` (`inline:` or `todoist:`) for rows built in code from a note or the copy. Every
  other field reader is shared, so there is one task parser.
- `tasks::create_seeded(cfg, Seed) -> Result<Task>` is the one new core seam. `Seed` carries the
  `NewTask` fields plus `id`, `created`, `status`, `completed`, `body`, `source` and
  `source_state`. It validates like `create`, writes with `raw::write_new` into the folder the
  status implies, and is called by promotion and by linked-task creation only. It is not a verb,
  a CLI flag or an MCP tool.

### Row JSON

Every task row keeps `render::entry(meta, TASK_FIELDS, …)` and appends `origin`, `storage` and
`read_only`. Todoist rows also carry `url`, `recur_text`, `recurring`, `todoist_project`,
`todoist_parent` and, on get, `comments`. A linked task carries `source`, `source_state` and the
same `url`. Todoist and inline rows render `path: null` and a vault-relative path respectively. The
human list row stays `{id}\t{status}\t{holder}\t{title}`.

---

## Implementation Detail

### Lock design

| Lock | Path | Taken by |
|---|---|---|
| create | `<tasks>/.locks/_create.lock` (exists) | file and line create, linked-task create, id minting |
| entity | `<tasks>/.locks/<t-id>.lock` (exists) | every write to one native task, file or line |
| tasks note | `<tasks>/.locks/_note.lock` (new `lock::note_lock`) | every write to the tasks note |
| Todoist pull | `<vault>/.shards/todoist/pull.lock` (new path, same `hold`) | the pull |

- **Total order: create → entity → note.** Nothing takes the note lock and then an entity lock, so
  no cycle exists. The pull takes its own lock, then one entity lock at a time.
- A line create holds create → note. It mints with `id_taken` widened to file stems **and** the
  note's line ids, read inside the create lock.
- A line edit holds entity → note, re-reads the note, finds the line by id, applies a `LineEdit`
  (set fields, set status, remove) to the value read inside the lock, and writes the whole note
  with `write_doc`. A pre-lock scan never feeds the written line (lessons: "A list derived from an
  unlocked scan is a claim about the past").
- Every note write also drops lines whose id has a task file (stale after a promotion crash), in
  the same atomic write. This needs no create lock: a promotion writes its file while holding the
  note lock, so file existence for line ids cannot change under the lock. A line create also mints
  ids for id-less lines and re-mints duplicates, under the create lock it already holds.
- Inline reads and copy reads take no lock: the note and the copy are replaced by rename, so a
  reader sees the old or the new bytes.

### Promotion (TS5, TS6)

Runs inside the trigger verb, under entity lock E. Steps:

| # | Step | Crash after this step leaves | Reader sees | Repair |
|---|---|---|---|---|
| 1 | Take note lock N; re-read the note; find the line by id | nothing changed | the line | — |
| 2 | If `open/<id>.md` or `done/<id>.md` exists with this id, skip to 4 (an earlier run crashed after 3) | — | the file | — |
| 3 | Build the `Seed` from the line plus the trigger's change (body, claim, outcome, edge, recur, parent); `create_seeded` writes `open/` or `done/` with `raw::write_new` | file and line, same id | the file (`resolve_target` and `rows_all` drop a line whose id has a file) | the next note write removes the line |
| 4 | Rewrite the note without the line (`write_doc`, atomic) | file only | the file | — |
| 5 | Release N; when step 2 skipped step 3, apply the trigger's change through the file path while still holding E | — | — | — |

- No step leaves zero copies: the line goes only after the file exists.
- A crash during step 3 or 4 leaves a dot-named temp file, which the walk skips.
- An editor that ticks the stale line between steps 3 and 4 loses that tick: the file wins.
- Mirrors: `deps::apply_mirrors` never writes a `blocks` key into a line. Blocking a line task
  promotes it (the blocked side). A mirror onto a line task (the blocker side) promotes that task
  in its own locked transaction, then writes the mirror into the new file; a failed mirror stays
  a warning, as today. Readiness already unions both edge directions.
- Tests run the steps one by one and call the readers and the repair after each step, so every
  row of the table is a test.

### Verb mapping on a line task

| Verb | Line stays a line | Promotes |
|---|---|---|
| `update` | fields in the line table | body, recur, recur_from, parent, blocks, blocked_by, any value `line_form` rejects |
| `append`, `set_body` | — | always |
| `claim`, `next --claim` | — | always (the claim lands in the file write) |
| `release` | — (a line is never claimed) | — |
| `finish`, `cancel` | without text: `[x]` + `completion::` / `[-]` + `cancelled::` | with outcome or reason text |
| reopen (`update --status open`) | `[ ]`, drop the date | — |
| `block`, `unblock` | — | either side of a new edge |
| `delete` (host, CLI) | removes the line | — |
| `get`, `list` | read | — |

### How the walk and the select engine see line tasks

- `select` gains a sibling `select_with(rows, f, admit: impl Fn(&Meta) -> Option<V>)`; `select`
  stays the default with `admit = V::from_meta`. Task lists call `select_with` with
  `Task::from_meta_with(meta, rule)`, the rule chosen from the row's origin. Filters, sorts and
  limits stay in one engine.
- `rows_all` concatenates, in this order: file rows (`rows(cfg)`, unchanged), line rows from the
  tasks note (`IdRule::Native`, minus ids that have a file), inline rows from
  `iter_md(notes_root, true, exclusions_for(Notes))` minus the tasks note (`IdRule::Source`), and
  Todoist rows from the copy minus linked items (`IdRule::Source`). One walk per space; no second
  walk exists.
- `list_with` takes the readiness snapshot from native rows only (file and line) and applies the
  origin filter before `select`. `Availability::{Available, Ready, Blocked}` and `deps::next` force
  `origins = [Shards]`.
- The inline scanner reads each note with the one safe reader and skips a file whose body has no
  `[` followed by a status character and `]` before running the codec.
- The Tasks global filter comes from `<vault>/.obsidian/plugins/obsidian-tasks-plugin/data.json`
  (`globalFilter`), read once per call when it exists; a missing or unreadable file means no
  filter.

### Todoist: crate placement

| Option | Default `shards` binary | Verdict |
|---|---|---|
| **A. Core crate, non-default feature `todoist`** (`ureq` 3 + rustls, `keyring` 4.2 with `default-features = false` and the native stores) | links none of them | **Chosen.** Same pattern as sync's planned `sync` feature; CLI parity; no second binary. |
| B. `shards-host` only | unchanged | Rejected: no CLI or headless pull (OD3 asks for CLI) |
| C. A separate crate or `shards-todoist` binary | unchanged | Rejected: a second install artefact and config loader; a separate crate cannot add a `shards` subcommand without a dependency cycle |

- `src/net/{http,creds}.rs` is the shared transport and credential module. Sync reuses it when it
  starts instead of adding `src/sync/transport.rs` and `creds.rs`; its feature `sync` enables the
  same dependencies.
- Copy reading, mapping, linking and refresh (`copy.rs`, `map.rs`, `link.rs`) compile in every
  build. Only `pull.rs` and `src/net/` sit behind `#[cfg(feature = "todoist")]`.
- `shards-host`, release builds and `scripts/install.sh` enable `todoist`. Without it,
  `shards todoist …` exits 2 "this build has no Todoist support".
- CI: `cargo build --no-default-features`; `cargo tree -p shards -e normal` on the default build
  lists no `ureq`, `rustls` or `keyring`; the cold-start pin runs on both builds.
- `http.rs` exposes only `get(url)` and `post_form(url, fields)`. `pull.rs` builds only read
  requests; no type or function that builds a Todoist `commands` payload exists (TS15). The fake
  server test asserts every request body.

### Todoist: token

- Lookup: `SHARDS_TODOIST_TOKEN`, then keychain service `shards`, account `todoist`.
- `Token(String)` has no `Display`; its `Debug` prints `Token(<redacted>)`. Error text names the
  source (`environment`, `keychain`) and never a token character.
- `shards todoist login` reads one line from standard input and stores it; `logout` deletes it.
- A missing token is `config_missing` (exit 2). A 401 or 403 is `validation` (exit 2) "Todoist
  rejected the token".

### Todoist: local copy

```
<vault>/.shards/todoist/
  copy.json   # { version, account, sync_token, pulled_at, full_sync_at,
              #   projects{id:{name,parent_id,is_inbox}}, sections{id:{name,project_id}},
              #   items{id:{content,description,priority,due,deadline,labels,project_id,
              #               section_id,parent_id,checked,completed_at,added_at,updated_at}},
              #   notes{item_id:[{id,content,posted_at}]}, tombstones{id:{state,at}} }
  pull.lock
```

- Written with `atomic_write` directly (the path is outside the sandbox by design), under
  `pull.lock`, re-read inside it. Data and `sync_token` live in one file, so they commit together
  (TS17).
- Only mapped fields are stored, not raw API objects. Tombstones (`deleted`, `completed`) are kept
  30 days for linked-task refresh.
- The walk, the watcher and sync never see it (dot path). It is device-local.

### Todoist: pull

1. Resolve the token; fail before any write when absent.
2. `hold(pull.lock)`; a second pull waits up to 15 s, then exits 4 `lock_conflict`.
3. Read `copy.json` inside the lock; `sync_token` = stored value, or `*` when absent or `--full`.
4. `POST https://api.todoist.com/api/v1/sync` with `sync_token` and
   `resource_types=["items","projects","sections","labels","notes","user"]`.
5. Full sync: replace items, projects, sections, notes. Incremental: upsert changed objects;
   `is_deleted: true` → tombstone `deleted`; `checked: true` → keep with `checked` and
   `completed_at`.
6. For each linked id absent after a full sync, `GET /api/v1/tasks/{id}`: `checked` → tombstone
   `completed`; 404 → `deleted`. (Verify on the real account; tech Open Question 2.)
7. Write `copy.json` atomically. **This is the commit point.**
8. Refresh linked tasks (below) over every task file whose `source` starts with `todoist:`, one
   entity lock at a time. This step always runs over all linked tasks, so a crash between 7 and 8
   is repaired by the next pull even when its delta is empty.
9. Release the lock; print the report (`pulled_at`, `full`, `changed`, `linked_refreshed`,
   `warnings`).

Rate: one sync call per pull plus step 6 calls; the host timer default (10 min) is far below the
partial-sync limit.

### Todoist: rows and linked tasks

- `map.rs` turns an item into a `Row` per the research mapping table: priority 4/3/2/1 →
  urgent/high/normal/unset; full-day and floating dues → `YYYY-MM-DD` / `YYYY-MM-DDTHH:MM`;
  fixed-zone dues → local wall-clock time with warning `due_zone_converted`; `due.string` →
  `recur_text` when `is_recurring`; never `recur`.
- Project mapping: a project note with frontmatter `todoist_project: "<Todoist project id>"` (set
  through `notes::set_meta`, from the app through `host_project_update`) claims that project.
  Mapped rows and linked tasks get `project: <that note id>`; others keep `todoist_project` only.
- **Linked id.** `ids::derived_id("t-", "todoist", item_id, exists)` = the first 12 Crockford
  chars of sha256(`todoist \0 <item id>`). A fixed length makes the id independent of which tasks
  exist on a machine, so the same Todoist task gives the same id everywhere (TS25). Only when a
  task with a different `source` holds that id does it extend one char at a time, and the response
  carries warning `linked_id_collision`.
- **Create on claim or assign.** `task claim todoist:X` and `task update todoist:X --owner o` hold
  `_create.lock`, compute the linked id, and reuse the file when it exists with `source: todoist:X`;
  otherwise `create_seeded` writes it with the Todoist-owned fields, `source`, `source_state: open`
  and an empty body. The lock drops, then the verb runs on the linked task through the normal path.
  A crash between the two leaves an unclaimed linked task; a retry finds it and claims it. Two
  concurrent claims create one file; the claim lock decides the holder (exit 4 for the loser).
- **Refresh** (`link::refresh(meta, item, projects) -> Vec<(key, Option<Value>)>`, pure): desired
  values for `title`, `due`, `deadline`, `priority`, `project` and `source_state`. The pull applies
  a non-empty diff under the entity lock, re-reading inside it; an empty diff writes nothing.

| Upstream | Linked task open, unclaimed | Linked task claimed | Linked task done or cancelled |
|---|---|---|---|
| fields changed | refreshed | refreshed | refreshed |
| completed | `source_state: completed`, then `finish` with no outcome, `completed` = Todoist time | `source_state: completed` only; get and release return warning `completed_upstream`; finished on the first pull after release | `source_state: completed` |
| reopened | `source_state: open` | `source_state: open` | `source_state: open`; status unchanged |
| deleted | `source_state: deleted`; never deleted or closed | same | same |
| recurring advanced (`due` moved, not checked) | `due` refreshed | `due` refreshed | `due` refreshed; status unchanged |

`finish` has no claim gate (`terminate_with`), which is why the claimed column never calls it.

<!-- merge -->
### Storage form is local; records key on the task id

- A native task has one id whatever its storage. A line task and its promoted file carry the same
  id and values; promotion is one-way and writes the file before it drops the line, and readers
  prefer the file.
- Sync (feature 18) treats each line task as one record keyed by its `t-` id with a storage hint,
  not the tasks note as one record. Per-key merge then applies to line tasks exactly as to files,
  and two machines that promote the same line produce one record.
- Linked tasks derive their id from the external id, so two machines that link the same Todoist
  task produce one record. The Todoist copy under `.shards/todoist/` is a device-local cache and
  never syncs.
- The default `shards` build links no HTTP, TLS or keychain crate. Network features sit behind
  non-default cargo features (`todoist`, later `sync`) that share `src/net/`.
<!-- /merge -->

### MCP

| Tool | Change |
|---|---|
| `shards_task_list` | New `origin` (OptStr, CSV of `shards`, `inline`, `todoist`, `all`; absent = every enabled origin). Rows gain `origin`, `storage`, `read_only` and the Todoist keys. `available`, `ready`, `blocked` force `shards`. |
| `shards_task_get` | `id` accepts `todoist:` and `inline:` refs |
| `shards_task_claim`, `shards_task_update` | `task_id` accepts `todoist:`; claim or `owner` links (TS19); any other field on an unlinked row is refused |
| `shards_task_new` | No parameter; the response adds `storage` and any warning |
| other task tools | Accept line ids unchanged; refuse `inline:` and unlinked `todoist:` refs with `validation` |
| `shards_health` | Payload adds `sources: {todoist: {configured, pulled_at, rows}, inline: {enabled}, lines: {note, lines}}` |

- Count stays 40; every pin listed in § Code facts is unchanged.
- Byte budget: at most 600 bytes of new schema text, against 2,321 bytes of headroom.
- The skill (`plugins/shards/skills/shards/SKILL.md`) gains one paragraph on origins and linking.

### CLI

- `task list --origin <csv>`; get, claim and update accept refs.
- `shards todoist pull [--full] [--json]`, `shards todoist login`, `shards todoist logout`.
- `shards status` prints the copy's pull time when a copy exists.

### Config

```toml
[tasks]
note = "Tasks.md"      # tasks note, relative to the tasks space root; false = files only

[sources]
inline = true          # list checkbox lines from notes

[todoist]
pull_minutes = 10      # host timer; 0 = off. The token is never a config key.
```

The three keys join `value_kind`, `render_config_toml`, `config.example.toml` and the key list in
`tests/bundle.rs:678-697`.

### Host and desktop

- `shards-host` enables `todoist`. A tokio interval (`pull_minutes`) runs the pull in
  `spawn_blocking`; overlapping ticks skip while the pull lock is held.
- After a pull that changed rows or linked tasks, the host emits a `tasks` change event itself,
  because the watcher ignores `.shards/`.
- `host_status` adds the same `sources` block as `shards_health`.
- `host_project_update` accepts `todoist_project`.
- Desktop: a source badge on rows; disabled checkbox with hint on read-only rows; "Open in
  Todoist" and "Assign to agent" (calls `shards_task_update` with the `todoist:` id); a Todoist
  sidebar group built from `todoist_project` values of Todoist rows; project settings pick a
  Todoist project; a Settings card for connect, disconnect, last pull and "Pull now".

### Surface changes (owner sign-off, AGENTS.md §0.4)

| Change | Kind |
|---|---|
| `source`, `source_state` task keys; no actor stamps on lines | task fields |
| `tasks::create_seeded` | core seam (not a verb) |
| `task list --origin`, MCP `origin`; refs accepted by get, claim, update | flag and parameter |
| `shards todoist pull`, `login`, `logout` | CLI command group |
| `[tasks].note`, `[sources].inline`, `[todoist].pull_minutes` | config keys |
| cargo feature `todoist` (`ureq`, `rustls`, `keyring`) | dependencies |
| `host_todoist_pull` (pull now, returns the report) | new host tool |
| `host_todoist_token` (`{token}` stores, `{token: null}` clears; never echoes) | new host tool |
| `host_project_update` gains `todoist_project`; `host_status` and `shards_health` gain `sources` | payload and argument growth |

`HOST_TOOLS` goes from 16 to 18. The agent MCP table does not change size.

---

## Performance Budget

Release build, warm cache, measured in the tests that own each path:

| Path | Budget |
|---|---|
| CLI cold start, default and `todoist` builds | KPI K5; pin min of 10 warm runs under 50 ms (`tests/foundation_cli.rs`) |
| `task list --origin shards` on 5,000 file tasks plus a 2,000-line tasks note | within 10 % of today's `task list` on the 5,000 files alone |
| Tasks-note parse, 2,000 lines | ≤ 5 ms |
| Inline scan, 1,000 notes of 5 KiB | ≤ 25 ms |
| Copy parse, 2,000 items | ≤ 10 ms |
| A line write | one read and one atomic write of the note; no write on a no-op |
| Pull | network-bound; at most one file write per changed linked task |

## Test plan

| Area | Test | Proves |
|---|---|---|
| Codec | unit tests in `src/lines/codec.rs`; fixtures from Tasks' approved doc samples and corrected TaskUI cases | both formats parse as Tasks does; Shards lines round-trip byte-for-byte; `line_form` rejects every non-round-trip title |
| Line verbs | `tests/task_lines_cli.rs` | create, update, finish, cancel, reopen, delete on lines; no-op byte-identical; marker; cap fallback; hand-typed lines; duplicate ids |
| Promotion | `tests/task_promote.rs` plus step-wise unit tests in `src/domain/promote.rs` | each trigger; identity and values kept; every crash row of the promotion table |
| Concurrency | `tests/race.rs` | 32 concurrent creates give 32 ids; 4 writers × 8 lines interleaved lose nothing; promotion racing a line edit; each test is first seen red with the note lock removed (lessons) |
| Inline | `tests/task_inline_cli.rs` | Dataview and emoji; global filter; fenced code skipped; stable keys under inserts and ticks; dedupe against native ids; user notes byte-identical |
| Todoist copy | `tests/todoist_copy.rs` (default build) | mapping table; priority default unset; recurrence text only; zone warning; linked create idempotent and concurrent; refresh no-op writes nothing; every cell of the upstream table |
| Todoist pull | `tests/todoist_pull.rs` (`--features todoist`) against an in-test HTTP fake serving synthetic fixtures | full then incremental token use; only read requests, no `commands` field; crash between read and write; pull lock conflict; token errors print no token character |
| Real account | `tests/todoist_live.rs`, `#[ignore]`, needs `SHARDS_TODOIST_TOKEN` | read-only full and incremental pull against the owner's account; prints the v1 incremental facts to verify; writes no fixture from real data |
| MCP | `tests/mcp_cli.rs`, `src/mcp/schema.rs` tests | count 40 unchanged; `origin` schema; `tools/list` ≤ 40 KiB |
| Build | CI | `cargo tree` default build has no network crates; cold-start pin on both builds |
| Host and app | `cargo test -p shards-host`; `pnpm -C apps/desktop test` | the two host tools; timer event; badges and read-only rows |

## Open Questions

1. **Shared `src/net/` with sync.** Sync's tech.md names `src/sync/transport.rs` and `creds.rs`.
   Recommendation: sync reuses `src/net/` when it starts; record it in sync's tech.md then.
2. **Linked ids missing from a full sync.** Does `GET /api/v1/tasks/{id}` return completed tasks
   in v1, or 404? Verify read-only on the real account in the pull unit before relying on step 6.
