---
type: feature-plan
feature: task-sources
status: draft
sibling: tech.md
parent: ../../plan.md
updated: 2026-10-16
---

# Feature: Task sources — Implementation Plan

**Status: DRAFT — owner decisions recorded 2026-10-16; plan pending owner approval. No unit may
start before the owner approves this plan and the sign-off list in [tech.md](tech.md) § Surface
changes.**

Eleven units. The core comes first (line codec, model seam, line storage, promotion), then the
unified read model with the inline source, then Todoist (copy and linking in every build, then the
pull behind the `todoist` feature), then the agent and CLI surface, then the host and the desktop
UI, then the acceptance run. The feature is a closed box: it is DONE when task-sources/11 passes.

> For agentic workers: execute units in Seq order via superpowers:executing-plans or
> superpowers:subagent-driven-development.

**Parent:** [../../plan.md](../../plan.md)
**Requirements:** [product.md](product.md)
**Architecture:** [tech.md](tech.md)
**Research:** [research.md](research.md)

**Feature gate:** Starts when task-model-v2 (15) and desktop-app (16) are both `DONE` and the owner
has approved this plan (root [plan.md](../../plan.md) Feature Sequence, row 17b). The desktop UI
units therefore run after desktop-app's last unit. No unit here depends on another feature's
units.

---

## Problem Frame

Today a task is a file, the notes' checkboxes are invisible, and Todoist is out of reach. The
risky part is not parsing: it is keeping writes atomic and single-entity when many tasks share
one note, and keeping promotion crash-safe across two files. So the codec and the seam come
first, line storage and promotion are proven under crash injection and races before any reader
depends on them, and the network arrives last, behind a build feature, after the offline copy and
linking already work from fixtures.

---

## Requirements Trace

| ID | Requirement | Units |
|---|---|---|
| TS1 | [Line task format](product.md#requirement-line-task-format-ts1) | task-sources/1, task-sources/3 |
| TS2 | [Where lines live](product.md#requirement-where-lines-live-ts2) | task-sources/3 |
| TS3 | [Storage is chosen on create](product.md#requirement-storage-is-chosen-on-create-ts3) | task-sources/1, task-sources/3 |
| TS4 | [Field edits keep a line a line](product.md#requirement-field-edits-keep-a-line-a-line-ts4) | task-sources/3 |
| TS5 | [Promotion triggers](product.md#requirement-promotion-triggers-ts5) | task-sources/4 |
| TS6 | [Promotion is crash-safe](product.md#requirement-promotion-is-crash-safe-ts6) | task-sources/4 |
| TS7 | [Files never demote](product.md#requirement-files-never-demote-ts7) | task-sources/4 |
| TS8 | [Concurrent writers on one tasks note](product.md#requirement-concurrent-writers-on-one-tasks-note-ts8) | task-sources/3, task-sources/4 |
| TS9 | [Lines edited outside Shards](product.md#requirement-lines-edited-outside-shards-ts9) | task-sources/3 |
| TS10 | [Foreign checkbox lines are read-only](product.md#requirement-foreign-checkbox-lines-are-read-only-ts10) | task-sources/5 |
| TS11 | [Inline identity and dedupe](product.md#requirement-inline-identity-and-dedupe-ts11) | task-sources/5 |
| TS12 | [One read model over every origin](product.md#requirement-one-read-model-over-every-origin-ts12) | task-sources/5, task-sources/6, task-sources/8 |
| TS13 | [Read-only rows refuse writes](product.md#requirement-read-only-rows-refuse-writes-ts13) | task-sources/5, task-sources/6 |
| TS14 | [Todoist pull is explicit](product.md#requirement-todoist-pull-is-explicit-ts14) | task-sources/7, task-sources/9 |
| TS15 | [Nothing is written to Todoist](product.md#requirement-nothing-is-written-to-todoist-ts15) | task-sources/7 |
| TS16 | [The token stays secret](product.md#requirement-the-token-stays-secret-ts16) | task-sources/7, task-sources/9 |
| TS17 | [The local copy is atomic](product.md#requirement-the-local-copy-is-atomic-ts17) | task-sources/6, task-sources/7 |
| TS18 | [Todoist rows map as researched](product.md#requirement-todoist-rows-map-as-researched-ts18) | task-sources/6 |
| TS19 | [Linked task on assign](product.md#requirement-linked-task-on-assign-ts19) | task-sources/2, task-sources/6 |
| TS20 | [Linked tasks refresh from the copy](product.md#requirement-linked-tasks-refresh-from-the-copy-ts20) | task-sources/6, task-sources/7 |
| TS21 | [Upstream completion or deletion](product.md#requirement-upstream-completion-or-deletion-ts21) | task-sources/6 |
| TS22 | [MCP surface grows by parameters only](product.md#requirement-mcp-surface-grows-by-parameters-only-ts22) | task-sources/8 |
| TS23 | [CLI surface](product.md#requirement-cli-surface-ts23) | task-sources/7, task-sources/8 |
| TS24 | [The app shows origins](product.md#requirement-the-app-shows-origins-ts24) | task-sources/9, task-sources/10 |
| TS25 | [Storage form is a local detail](product.md#requirement-storage-form-is-a-local-detail-ts25) | task-sources/2, task-sources/4, task-sources/6 |
| TS26 | [Read paths stay fast](product.md#requirement-read-paths-stay-fast-ts26) | task-sources/5, task-sources/7, task-sources/11 |

---

## Key Technical Decisions

1. **Dataview lines, written in one fixed order; both formats read.** Matches the owner's Tasks
   plugin; one emitter keeps one round-trip contract ([tech.md](tech.md) § Line grammar).
2. **Line eligibility is the round trip.** `line_form` emits and re-parses; no second quoting
   rule exists.
3. **One tasks note per vault, marked by frontmatter.** A project is a field, so no edit moves a
   line between files.
4. **Lock order create → entity → note; edits replay by id inside the locks.**
5. **Promotion writes the file first; readers prefer the file; note writes repair.** No zero-copy
   state exists.
6. **One core seam, `create_seeded`,** for promotion and linked tasks; not a verb.
7. **Todoist behind the non-default `todoist` feature** with a shared `src/net/`; copy reading
   and linking compile in every build.
8. **No new agent MCP tool.** `origin` on list; refs on get, claim, update; `sources` on health.

---

## Global Constraints

- Read [tech.md](tech.md) § Code facts before any unit; it names the seams and pins.
- Gates per unit: `cargo fmt --all --check`; `cargo clippy --all-targets --locked -- -D warnings`;
  `cargo test -p shards`. From task-sources/7 on, also `cargo clippy --features todoist
  --all-targets --locked -- -D warnings` and `cargo test -p shards --features todoist`.
- Baseline the gates on the base commit before task-sources/1 and record the counts; judge each
  unit by the delta.
- No `regex`, `unwrap`, `expect`, `panic` or byte slicing in `src/`. Stable sorts only in
  `select.rs`.
- Every write is atomic and single-entity, re-resolved inside its locks; a no-op writes nothing,
  asserted byte-for-byte.
- No network outside `src/todoist/pull.rs` and `src/net/`. No code builds a Todoist `commands`
  payload.
- Test fixtures for Todoist are synthetic. Nothing from the owner's real account is committed.
- Never touch a user note's bytes; assert it in every inline test.
- The agent MCP table stays at 40 tools; `tools/list` stays ≤ 40 KiB.

---

## Unit IDs

Units are `task-sources/n`, assigned once and never renumbered. Seq holds the execution order.
Cite IDs in commits and tests (`feat(tasks): task-sources/3 ...`).

---

### task-sources/1 — Line codec

**Goal:** A pure scanner for checkbox lines in both Tasks formats and a Dataview emitter, with
`line_form` as the single eligibility rule.

**Requirements:** TS1, TS3

**Dependencies:** —

**Files:**

```
src/lines/mod.rs, src/lines/codec.rs     # new
src/lib.rs                               # module
tests/fixtures/tasks-format/             # Tasks approved doc samples; corrected TaskUI cases
```

**Test scenarios:**

- Every Tasks doc sample parses to the documented fields, emoji and Dataview.
- `- [ ] pay 📅 2026-10-20 rent` keeps the date in the description.
- For generated line-holdable tasks, `parse(emit(t)) == t` and `emit(parse(l)) == l`.
- `line_form` returns `None` for a trailing `#word` title, a `]` or `::` in a value, a newline, and
  surrounding whitespace.
- Priority maps highest/high/medium/low ↔ urgent/high/normal/low; lowest reads as low; unset
  writes no field.

**Verification:** `cargo test -p shards lines::codec` green; no `regex` in `Cargo.lock`.

---

### task-sources/2 — Model keys, seeded create, derived ids

**Goal:** `source` and `source_state` in `TASK_FIELDS`, `Task::from_meta_with(IdRule)`,
`tasks::create_seeded`, and `ids::derived_id`.

**Requirements:** TS19, TS25

**Dependencies:** —

**Files:**

```
src/model/task.rs     # two keys appended; IdRule
src/domain/tasks.rs   # create_seeded (raw::write_new into open/ or done/)
src/ids.rs            # derived_id(prefix, namespace, key, exists)
src/domain/select.rs  # select_with(rows, f, admit)
```

**Test scenarios:**

- A v1 and a v2 task file read and write unchanged (compat corpus byte-identical).
- `create_seeded` keeps the given id, `created`, status and source keys, writes `done/` for a done
  seed, and refuses an existing target without clobbering it.
- `derived_id("t-", "todoist", "6X7r", …)` is 12 chars and the same on any vault; it extends only
  past a task with a different `source`, and then reports `linked_id_collision`.
- `IdRule::Native` rejects `inline:` and `todoist:` ids; `IdRule::Source` accepts only those.

**Verification:** `cargo test -p shards` green; `tests/compat_corpus.rs` unchanged.

---

### task-sources/3 — Tasks note and line storage

**Goal:** Create, read and edit line tasks in the tasks note under create → entity → note locks,
with config `[tasks].note`, the marker, the size cap, hand-typed and duplicate-line handling.

**Requirements:** TS1, TS2, TS3, TS4, TS8, TS9

**Dependencies:** task-sources/1, task-sources/2

**Files:**

```
src/lines/note.rs           # segments, LineEdit, dump; note lock
src/storage/lock.rs         # note_lock
src/domain/sources.rs       # Target, resolve_target (file first, then line)
src/domain/tasks.rs         # create picks storage; update/finish/cancel/reopen/delete/get on lines; id_taken over lines
src/config.rs               # [tasks].note; reject paths inside open/ or done/
tests/task_lines_cli.rs, tests/race.rs
```

**Test scenarios:**

- A simple create writes one line in the documented order; a create with a body writes a file.
- Field update, finish, cancel, reopen and delete change only that line; a no-op leaves the note
  byte-identical with the same mtime.
- A file without the marker at the note path is never written; the create falls back with a
  warning. A note past the cap falls back with a warning. `note = false` writes files only.
- A ticked line reads `done`; a hand-typed line gets an id on the next line create, and no other
  write mints; a duplicate id is re-minted on the later line at the next line create; other lines
  and frontmatter stay byte-for-byte.
- 32 concurrent creates give 32 lines and 32 ids; 4 writers editing 8 lines lose nothing. Both
  race tests fail with the note lock removed.

**Verification:** `cargo test -p shards --test task_lines_cli --test race` green, plus the
red-with-lock-removed run recorded in the unit's commit message.

---

### task-sources/4 — Promotion

**Goal:** Every trigger promotes a line to a file in one file write, crash-safe by the step order,
with file-wins reads and repair on the next note write; files never demote.

**Requirements:** TS5, TS6, TS7, TS8, TS25

**Dependencies:** task-sources/3

**Files:**

```
src/domain/promote.rs       # step functions, repair
src/domain/tasks.rs         # append, set_body, claim, finish/cancel with text, update triggers
src/domain/deps.rs          # block/unblock and mirrors promote line tasks
tests/task_promote.rs, tests/race.rs
```

**Test scenarios:**

- Each trigger (append, body, claim, `next --claim`, finish with outcome, cancel with reason,
  block on either side, recur, parent) yields one file with the line's id and values plus the
  change, and no checkbox line for that id.
- Step-wise runs: stopping after each step of the promotion table leaves one listed task, from
  the file once it exists; the next note write removes the stale line; a retried promotion writes
  no second file.
- A promotion racing a field edit of the same id ends with the edit in the file.
- Clearing the body of a promoted task leaves a file.

**Verification:** `cargo test -p shards --test task_promote --test race` and
`cargo test -p shards domain::promote` green.

---

### task-sources/5 — Read model and inline source

**Goal:** `rows_all` over file, line and inline rows, `origin`/`storage`/`read_only` on rows, the
origin filter, read-only refusals, the inline scanner with Tasks global filter, and the
`[sources].inline` switch.

**Requirements:** TS10, TS11, TS12, TS13, TS26

**Dependencies:** task-sources/3

**Files:**

```
src/lines/inline.rs         # scan over iter_md(notes); inline keys
src/domain/sources.rs       # rows_all, Origin, Storage, refuse_read_only
src/domain/tasks.rs         # list_with: readiness from native rows; ready/available/blocked force shards
src/render.rs               # origin, storage, read_only keys
src/config.rs               # [sources].inline
tests/task_inline_cli.rs
```

**Test scenarios:**

- A note's Dataview and emoji lines list as inline rows; fenced code and the tasks note are
  skipped; the global filter applies when set.
- An inline key survives a line inserted above and a tick; it changes on a text edit; a Tasks id
  or block id keeps it across text edits.
- A pasted copy of a native line lists once.
- Every verb that writes refuses an inline id with exit 2 naming the origin.
- `task next` and `--ready` return native tasks only.
- Every user note in the fixture vault is byte-identical after the whole suite.
- Budgets: inline scan and tasks-note parse within [tech.md](tech.md) § Performance Budget.

**Verification:** `cargo test -p shards --test task_inline_cli` green; budget test output shows
the measured times.

---

### task-sources/6 — Todoist copy, rows and linked tasks

**Goal:** The copy format and reader, Todoist rows, `todoist:` refs, linked-task creation on claim
and assign, and the pure refresh with the upstream table, all from fixtures with no network.

**Requirements:** TS12, TS13, TS17, TS18, TS19, TS20, TS21, TS25

**Dependencies:** task-sources/2, task-sources/5

**Files:**

```
src/todoist/mod.rs, copy.rs, map.rs, link.rs
src/domain/sources.rs       # Todoist rows; linked rows hide their item
src/domain/tasks.rs         # claim/update on todoist: refs; release warning
tests/todoist_copy.rs, tests/fixtures/todoist/
```

**Test scenarios:**

- Mapping: priority 4/3/2/1 → urgent/high/normal/unset; full-day, floating and fixed-zone dues;
  `recur_text` without `recur`; deadline; labels; project mapping through a project note.
- Claiming or assigning a `todoist:` ref creates one linked task with the derived id; repeated and
  concurrent calls create one; the loser of a concurrent claim exits 4.
- After linking, list shows the linked task once with origin `todoist`.
- Refresh with no upstream change writes nothing; each cell of the upstream table in
  [tech.md](tech.md) holds, including the claimed-completed path finishing after release.
- Writes to an unlinked Todoist row other than claim and owner exit 2.

**Verification:** `cargo test -p shards --test todoist_copy` green on the default build.

---

### task-sources/7 — Todoist pull and token

**Goal:** The `todoist` cargo feature, `src/net/`, the token lookup and redaction, the full and
incremental pull with its commit point and refresh, and `shards todoist pull|login|logout`.

**Requirements:** TS14, TS15, TS16, TS17, TS20, TS23, TS26

**Dependencies:** task-sources/6

**Files:**

```
Cargo.toml                  # [features] todoist = ureq (rustls), keyring
src/net/http.rs, src/net/creds.rs
src/todoist/pull.rs
src/cli/todoist.rs, src/cli/mod.rs
tests/todoist_pull.rs, tests/todoist_live.rs (#[ignore])
CI workflow                 # default-build cargo tree check; cold-start pin on both builds
```

**Test scenarios:**

- Against the in-test fake: the first pull sends `sync_token=*`, the next sends the stored token;
  every request is a read and no body has a `commands` field.
- A crash between the read and the copy write leaves the old copy and token; the next pull
  continues from them. A crash after the copy write is repaired by the next pull's refresh.
- A second concurrent pull exits 4 after the wait.
- No token, and a rejected token, exit 2 with messages that name the sources and hold no token
  character; `Debug` of the token is redacted.
- The default build answers `shards todoist pull` with exit 2 and still lists rows from a copy.
- Live smoke (manual, `SHARDS_TODOIST_TOKEN` set): full then incremental pull on the owner's
  account; records whether incremental items carry `checked` and `is_deleted`, and what
  `GET /api/v1/tasks/{id}` returns for a completed task.

**Verification:** `cargo test -p shards --features todoist --test todoist_pull` green;
`cargo tree -p shards -e normal | grep -E 'ureq|rustls|keyring'` prints nothing on the default
build; the cold-start pin passes on both builds; the live smoke output is pasted into the unit's
notes.

---

### task-sources/8 — Agent and CLI surface

**Goal:** `--origin` and the MCP `origin` parameter, refs in get, claim and update, the
`shards_health` and `shards status` source blocks, config keys in every listed place, and the
shipped skill and README.

**Requirements:** TS12, TS22, TS23

**Dependencies:** task-sources/4, task-sources/5, task-sources/7

**Files:**

```
src/cli/task.rs, src/cli/mod.rs
src/mcp/schema.rs, src/mcp/tools.rs
src/config.rs, config.example.toml, tests/bundle.rs (key list)
plugins/shards/skills/shards/SKILL.md, README.md, docs/concepts.md
tests/mcp_cli.rs
```

**Test scenarios:**

- `shards_task_list` with `origin` returns only those origins; rows carry the three keys.
- CLI and MCP give the same rows and the same error text for a read-only write.
- Tool count 40 and every existing pin unchanged; `tools/list` ≤ 40 KiB with the new text.
- `config.example.toml` loads through `from_table` with the three new keys.

**Verification:** `cargo test -p shards` green, including `tests/mcp_cli.rs` and
`tests/bundle.rs`; measured `tools/list` size recorded.

---

### task-sources/9 — Host: timer, events, tools

**Goal:** `shards-host` with `todoist` enabled, the pull timer, the change event after a pull, the
`sources` block in `host_status`, `todoist_project` on `host_project_update`, and the two signed-off
host tools.

**Requirements:** TS14, TS16, TS24

**Dependencies:** task-sources/7, task-sources/8

**Files:**

```
crates/shards-host/Cargo.toml        # shards with feature todoist
crates/shards-host/src/tools.rs      # host_todoist_pull, host_todoist_token; HOST_TOOLS 18
crates/shards-host/src/lib.rs, src/bin/shards-host.rs, apps/desktop/src-tauri/src/lib.rs  # timer
crates/shards-host/tests/host_tools.rs
```

**Test scenarios:**

- `host_todoist_pull` against the fake runs one pull and returns the report; an overlapping tick
  skips while the lock is held.
- `host_todoist_token` stores and clears without echoing; neither tool is in the agent MCP table.
- A pull that changed rows emits one `tasks` change event.

**Verification:** `cargo test -p shards-host` green; agent `tools/list` still has 40 tools.

---

### task-sources/10 — Desktop UI

**Goal:** Source badges, read-only rows, "Open in Todoist" and "Assign to agent", the Todoist
sidebar group, the project-to-Todoist picker, and the Settings card.

**Requirements:** TS24

**Dependencies:** task-sources/9

**Files:**

```
apps/desktop/src/components/   # source badge, read-only row state
apps/desktop/src/views/        # Todoist sidebar group, project settings picker, Settings card
apps/desktop/src/lib/          # query keys for origins; host tool calls
```

**Test scenarios:**

- Todoist and inline rows render a badge and a disabled checkbox with a hint.
- "Assign to agent" turns a Todoist row into a linked task row with the chosen owner.
- The Settings card shows the last pull and runs "Pull now"; the token field never shows a stored
  token.
- Views degrade when no copy exists (no Todoist group, no error).

**Verification:** `pnpm -C apps/desktop test`, `build` and `lint` green; screenshots of Today with
mixed origins added to `docs/screenshots/`.

---

### task-sources/11 — Acceptance run

**Goal:** Prove every TS requirement end-to-end on a demo vault and the owner's real Todoist
(read-only), reconcile the spec against the code, and record the evidence.

**Requirements:** TS1–TS26

**Dependencies:** task-sources/10

**Files:**

```
scripts/demo-vault.sh       # tasks note, inline checklists, Todoist fixture copy
.spec/features/task-sources/{product,tech,plan}.md   # reconcile
```

**Test scenarios:**

- One scenario run per requirement, by the evidence named in its scenarios.
- A full read-only pull on the owner's account, then Today in the app shows Todoist rows, one is
  assigned to an agent, and the agent claims and finishes it; Todoist shows that task unchanged.
- The KPI-1 grep and `validate.sh` are clean after the reconcile.

**Verification:** each requirement row ticked with its command output in § Progress notes; every
gate green on the default and the `todoist` build.

---

## Dependencies

| Unit | Seq | Blocks | Blocked by | Parallel with |
|---|---:|---|---|---|
| task-sources/1 | 1 | 3 | — | task-sources/2 |
| task-sources/2 | 1 | 3, 6 | — | task-sources/1 |
| task-sources/3 | 2 | 4, 5 | 1, 2 | — |
| task-sources/4 | 3 | 8 | 3 | task-sources/5, task-sources/6, task-sources/7 |
| task-sources/5 | 3 | 6, 8 | 3 | task-sources/4 |
| task-sources/6 | 4 | 7 | 2, 5 | task-sources/4 |
| task-sources/7 | 5 | 8, 9 | 6 | task-sources/4 |
| task-sources/8 | 6 | 9 | 4, 5, 7 | — |
| task-sources/9 | 7 | 10 | 7, 8 | — |
| task-sources/10 | 8 | 11 | 9 | — |
| task-sources/11 | 9 | — | 10 | — |

Same-feature dependencies only. Parallel units touch disjoint files except `src/domain/tasks.rs`
and `src/domain/sources.rs`; the later unit rebases onto the earlier one.

---

## Progress

| Unit | Status |
|---|---|
| task-sources/1 | NOT STARTED |
| task-sources/2 | NOT STARTED |
| task-sources/3 | NOT STARTED |
| task-sources/4 | NOT STARTED |
| task-sources/5 | NOT STARTED |
| task-sources/6 | NOT STARTED |
| task-sources/7 | NOT STARTED |
| task-sources/8 | NOT STARTED |
| task-sources/9 | NOT STARTED |
| task-sources/10 | NOT STARTED |
| task-sources/11 | NOT STARTED |

---

## Open Questions

1. **Plan approval and sign-offs** — the four owner questions in [product.md](product.md) § Open
   Questions block every unit. task-sources/2 needs question 2, task-sources/3 needs question 4,
   task-sources/7 to task-sources/9 need question 3.
