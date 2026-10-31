---
type: feature-tech
feature: task-model-v2
sibling: product.md
parent: ../../tech.md
updated: 2026-10-31
---

# Feature: Task Model v2 — Architecture

v2 extends the existing task pipeline. It does not build a second one. The pipeline is:

1. the typed view in `src/model/task.rs`;
2. the verbs in `src/domain/tasks.rs`;
3. the shared select engine in `src/domain/select.rs`;
4. the CLI in `src/cli/{mod,task}.rs`;
5. the MCP server in `src/mcp/{schema,tools}.rs`.

One new pure module, `src/domain/recur.rs`, owns calendar values (`Due`, deadline) and the RRULE
subset. The local clock sits behind exactly one function, `timefmt::today_local`. `[[members]]` is
planned to be parsed in `src/config.rs` and to widen the owner roster in `src/domain/owner.rs`
(task-model-v2/8, not built; today only `shards-host` reads `[[members]]` and `[core].me`).

Four rules keep v1 compatibility:

- v2 keys are **sparse**: they are written only when set.
- v2 keys are **appended**: they sort after the 14 v1 keys.
- v2 reads are **lenient**: a malformed value reads as absent and never rejects the task.
- v2 writes are **strict**: validation runs before any lock.

**Parent:** [../../tech.md](../../tech.md)
**Requirements:** [product.md](product.md)
**Plan:** [plan.md](plan.md)

> **State on 2026-10-16 (reconciled with the code; code is truth for delivered behaviour).**
>
> - **Landed:** the model, `recur.rs` (incl. `BYMONTH`, negative `BYMONTHDAY`, and the clamp pin
>   via `Advance::rule`), the select keys, rendering, the domain write path, reopen, the
>   recurring finish with `expected_due` and `warnings`, `DueFilter` (applied after the readiness
>   snapshot), and the CLI and MCP params. That includes `order` as `OptNumOrClear` and
>   `Ann::Write` on `shards_task_finish`. Evidence: `tests/task_v2_cli.rs` (18 tests),
>   `cargo test -p shards` passed on 2026-10-16.
> - **Not in the code:** `--final` / `final`, members in the core, the parent/section `none`
>   selectors, the rest rule, the cross-field rules (`recur` without `due` and `recur_from`
>   without `recur` are accepted today), `pin_monthly` at write time, and the actor stamps (R19).
>
> § Spec vs Implementation in [plan.md](plan.md) lists the deltas.

---

## Files

```
src/model/task.rs        # TASK_PRIORITIES (4), priority_rank, TASK_FIELDS (22), TASK_V1_FIELD_COUNT,
                         #   Task v2 fields, lenient readers, Sortable for Due/Order        [landed; + created_by, updated_by → 24]
src/model/common.rs      # TIMESTAMP_FIELDS += "completed"; CALENDAR_FIELDS = ["due","deadline"] [landed]
src/render.rs            # owned_value_to_json: CALENDAR_FIELDS render ts.raw verbatim       [landed]
src/timefmt.rs           # today_local(): the only chrono::Local call site                   [landed]
src/domain/recur.rs      # NEW: Due, deadline helpers, Rule (parse/Display/next_after), advance,
                         #   shift_days, validate_recur_from, RECUR_FROM_VALUES              [landed; bymonth + clamp pin; first_on_or_after not built]
src/domain/select.rs     # SortKey::{Due, Order}; SortValue::{Due, Order}; due_key, order_cmp [landed]
src/domain/tasks.rs      # NewTask/UpdateTask v2 fields (raw text), v2_edits, apply_edits,
                         #   validate_parent, parse_order, reopen, Terminated, terminate_report,
                         #   DueFilter, list_with, terminate_with (expected_due, warnings)   [landed; TaskQuery, rest rule, final not built]
                         #   persist(.., actor) stamps updated_by; create stamps created_by  [todo, R19]
src/domain/owner.rs      # roster = [tasks].collections ∪ [[members]].id                    [todo]
src/config.rs            # Member, MemberKind, Config.members, [[members]] parse             [todo]
src/cli/mod.rs           # TaskSub::{New,Update,Finish,List} new args, --expected-due        [landed; --final not built]
src/cli/task.rs          # TASK_SORT_KEYS (6), arg mapping, terminate_report, meta_lines     [landed; + final, TaskQuery]
src/cli/admin.rs         # `config show` lists members                                       [todo]
src/mcp/schema.rs        # new params, enums, expected_due, finish annotation → Write        [landed; final not built]
src/mcp/tools.rs         # task_new/task_update/task_list/terminate read new args            [landed; + final, TaskQuery]
src/mcp/instructions.rs, plugins/shards/skills/shards/SKILL.md, README.md, docs/concepts.md  [SKILL.md + README landed 2026-10-16; instructions.rs, concepts.md todo]
tests/task_v2_cli.rs     # NEW: binary-level scenarios for R1–R17 (CLI + MCP round trip)      [landed, 18 tests]
tests/task_cli.rs        # priority message, key-order assertion → v1 prefix + sparse v2     [todo]
tests/mcp_cli.rs         # params, enums, finish annotation, v2 round trip over MCP          [todo]
tests/compat_corpus.rs   # v2 reads are byte-neutral on the corpus                            [todo]
```

---

## Contract / API

### Frontmatter on disk and JSON on the wire

The canonical key order is `TASK_FIELDS`, 24 keys. The first 14 are unchanged. The v2 keys come
after them, in the decision-brief order, and the actor stamps (R19) come last. The existing prefix
of a v1 file never moves:

```
id type title tags owner created updated related status priority claimed_by project blocks blocked_by
due deadline recur recur_from parent section order completed created_by updated_by
```

| Key | On disk | When written | JSON |
|---|---|---|---|
| `priority` | `urgent\|high\|normal\|low` or `null` | Always (v1 rule). `""` writes `null`. | string or null |
| `due` | unquoted `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM` (`Value::Ts`, raw = canonical) | When set | `ts.raw`, verbatim |
| `deadline` | unquoted `YYYY-MM-DD` (`Value::Ts`) | When set | `ts.raw`, verbatim |
| `recur` | canonical RRULE string (`Rule` `Display`) | When set | string |
| `recur_from` | `due` or `completion` | When set | string |
| `parent` | a `t-…` string | When set | string |
| `section` | trimmed string | When set | string |
| `order` | YAML int when integral and below 2^53, else YAML float. Always finite. | When set | number |
| `completed` | RFC 3339 `…Z` (`ts_value`) | On finish, one-off or occurrence | `…Z` (in `TIMESTAMP_FIELDS`) |
| `created_by` | identity string | Once, on create, when an actor resolves | string |
| `updated_by` | identity string | On every write that changes the file; removed when no actor resolves | string |

Rules for the calendar fields:

- `due` and `deadline` are always written as `Value::Ts`, never as `Value::Str`. The emitter quotes
  a `Str` that would re-resolve to a timestamp, and a quoted date is no longer an Obsidian date
  property.
- Neither field is in `TIMESTAMP_FIELDS`. That list promotes a naive value to UTC
  `…T00:00:00Z`.
- `render::owned_value_to_json` emits `CALENDAR_FIELDS` as their raw text, so a field never has
  two spellings.
- Known side effect of adding `completed` to `TIMESTAMP_FIELDS`: a foreign `completed` key on a
  note also renders as UTC. This affects JSON only, and it is accepted.

### Model (`src/model/task.rs`)

```rust
pub const TASK_PRIORITIES: [&str; 4] = ["urgent", "high", "normal", "low"];
pub const PRIORITY_UNRANKED: i64 = 4;               // unknown labels AND unset
pub fn priority_rank(p: Option<&str>) -> i64;       // urgent 0, high 1, normal 2, low 3, else 4
pub const TASK_V1_FIELD_COUNT: usize = 14;

pub struct Task { /* 14 v1 fields */
    pub due: Option<Due>, pub deadline: Option<NaiveDate>,
    pub recur: Option<String>, pub recur_from: Option<String>,
    pub parent: Option<String>, pub section: Option<String>,
    pub order: Option<f64>, pub completed: Option<DateTime<Utc>>,
    pub created_by: Option<String>, pub updated_by: Option<String>, pub meta: Meta }
```

`Task::from_meta` keeps every v1 rejection rule. The v2 fields go through tolerant readers instead:
`Due::from_value`, `deadline_from_value`, `scalar_text` (also for the two stamps), `order_value`
and `meta_time`. Each of them
returns `None` on a bad shape and never fails admission (product R16).

### Calendar and recurrence (`src/domain/recur.rs`, pure)

```rust
pub struct Due { pub date: NaiveDate, pub time: Option<NaiveTime> }   // floating, minute precision
impl Due {
    pub fn parse(s: &str) -> Result<Due>;           // exactly YYYY-MM-DD | YYYY-MM-DDTHH:MM
    pub fn from_value(v: &Value) -> Option<Due>;    // lenient: Ts Date|Naive|Offset(wall clock) or parseable Str
    pub fn to_value(self) -> Value;                 // Value::Ts, raw = Display
    pub fn on(self, date: NaiveDate) -> Due;        // same wall-clock time, other date
}
pub fn parse_deadline(s: &str) -> Result<NaiveDate>;                 // exactly YYYY-MM-DD
pub fn parse_filter_date(flag: &str, s: &str) -> Result<NaiveDate>;  // exactly YYYY-MM-DD
pub fn deadline_from_value(v: &Value) -> Option<NaiveDate>;
pub fn date_value(d: NaiveDate) -> Value;
pub const RECUR_FROM_VALUES: [&str; 2] = ["due", "completion"];
pub fn validate_recur_from(s: &str) -> Result<()>;

pub enum Freq { Daily, Weekly, Monthly, Yearly }
pub struct Rule { pub freq: Freq, pub interval: u32, pub byday: Vec<Weekday>,
    pub bymonth: Vec<u32>,          // YEARLY only, 1..=12
    pub bymonthday: Vec<i32> }      // MONTHLY, or YEARLY with BYMONTH; negative counts from the end
impl Rule {
    pub fn parse(s: &str) -> Result<Rule>;          // case-insensitive, optional "RRULE:" prefix
    pub fn next_after(&self, anchor: NaiveDate, after: NaiveDate) -> Option<NaiveDate>;
    fn pinned_to(&self, anchor: NaiveDate) -> Option<Rule>;   // private: MONTHLY → BYMONTHDAY=day,
                                                              // YEARLY → BYMONTH=month;BYMONTHDAY=day
}
impl Display for Rule;  // canonical: FREQ; INTERVAL only when > 1; BYDAY in MO..SU order, deduped; BYMONTH; BYMONTHDAY
pub struct Advance { pub due: Due, pub delta_days: i64,
    pub rule: Option<Rule> }        // Some when the advance clamped a day the rule did not name
pub fn advance(rule: &Rule, from_completion: bool, due: Option<Due>, today: NaiveDate) -> Result<Advance>;
pub fn shift_days(d: NaiveDate, days: i64) -> NaiveDate;
```

How `advance` picks the next date:

| Mode | Anchor | Next date |
|---|---|---|
| "every" (`from_completion = false`) | the current due date, or today when there is none | `next_after(anchor, max(due, today))` |
| "every!" (`from_completion = true`) | today | `next_after(today, today)` |

The time of day is kept through `Due::on`. `delta_days` is next minus base, and `deadline` shifts
by it.

Schedule semantics. The anchor is period 0, and every candidate is computed from the anchor, never
from an earlier clamped date:

| Rule | Occurrences |
|---|---|
| `DAILY;INTERVAL=n` | anchor + k·n days |
| `WEEKLY;INTERVAL=n` | anchor's weekday (or each `BYDAY`) in ISO weeks week(anchor) + k·n |
| `MONTHLY;INTERVAL=n` | day(anchor), or each `BYMONTHDAY` (negative counts from the month end), in month(anchor) + k·n, clamped to the month length |
| `YEARLY;INTERVAL=n` | month/day(anchor), or each `BYMONTH` × `BYMONTHDAY`, in year + k·n. Feb 29 clamps to Feb 28. |

**Clamp pin (delivered, finish-time).** When a "from due" advance lands on a day other than the
anchor's (day 31 into a 30-day month, Feb 29 into a common year), `Advance::rule` carries the rule
with the anchor's day pinned (`MONTHLY` → `BYMONTHDAY=<day>`; `YEARLY` → `BYMONTH=<month>;
BYMONTHDAY=<day>`), and `terminate_with` stores it in place of the old `recur`. A rule that already
names its days, and every "from completion" advance, is never rewritten. So a Jan-31 monthly series
goes Feb 28 → Mar 31, and a Feb-29 yearly series returns on Feb 29 in the next leap year (pinned by
`a_monthly_repeat_on_day_31_survives_a_short_month` and
`a_yearly_repeat_on_feb_29_returns_in_the_next_leap_year`). The write-time `pin_monthly` the plan
proposed is not built and is no longer needed for drift.

The search skips ahead arithmetically to the period that contains `after`, then walks at most
`PERIOD_SLACK` (8) periods. The cost is O(1) whatever the backlog.

#### Error texts

`ShardsError::Validation`, exit 2:

```
invalid due: '<x>' (use YYYY-MM-DD or YYYY-MM-DDTHH:MM)
invalid deadline: '<x>' (use YYYY-MM-DD)
invalid <flag>: '<x>' (use YYYY-MM-DD)                       # --due-before / --due-after
invalid recur: '<x>' (<why>)                                  # why: expected KEY=VALUE…, <KEY> given twice,
                                                              #   unsupported FREQ…, INTERVAL must be an integer 1..1000,
                                                              #   BYDAY takes MO…SU…, BYMONTHDAY takes 1..31 or -31..-1…,
                                                              #   unsupported part '<KEY>'; use FREQ, INTERVAL, BYDAY, BYMONTHDAY,
                                                              #   FREQ is required, BYDAY/BYMONTHDAY is only supported with …
invalid recur_from: '<x>' (use due, completion)
recur_from requires recur                                     # NOT BUILT (accepted today)
recur requires due                                            # NOT BUILT (accepted today)
invalid recur on <id>: '<raw>' — fix it, or finish for good with --final   # NOT BUILT (see below)
invalid order: '<x>' (use a finite number)
invalid parent: '<x>' (no such task) | (a task cannot be its own parent)
parent cycle: <a> -> <b> -> <a>
invalid status for update: '<x>' (only 'open' reopens a task; use task claim, finish or cancel)
task <id> is claimed by <holder>; release it instead of reopening
invalid priority: '<x>' (use urgent, high, normal, low)
```

### Domain (`src/domain/tasks.rs`)

```rust
pub struct NewTask { /* v1 */ pub due: Option<String>, pub deadline: Option<String>,
    pub recur: Option<String>, pub recur_from: Option<String>, pub parent: Option<String>,
    pub section: Option<String>, pub order: Option<f64> }            // "" = unset
pub struct UpdateTask { /* v1 */ pub status: Option<String>, pub due: Option<String>,
    pub deadline: Option<String>, pub recur: Option<String>, pub recur_from: Option<String>,
    pub parent: Option<String>, pub section: Option<String>,
    pub order: Option<Option<f64>> }                                 // None keep, Some("") clear
pub fn parse_order(s: &str) -> Result<Option<f64>>;                  // "" → None (clear)
pub(crate) fn persist(cfg, path, doc, actor: Option<&str>) -> Result<()>;  // TODO (R19): sets or removes updated_by

pub struct Terminated { pub task: Task, pub unblocked: Vec<String>, pub next_due: Option<String>,
    pub warnings: Vec<String> }
pub fn terminate(cfg, id, kind, text, actor) -> Result<(Task, Vec<String>)>;   // v1 wrapper, keeps old callers
pub fn terminate_report(cfg, id, kind, text, actor) -> Result<Terminated>;     // = terminate_with(.., None)
pub fn terminate_with(cfg, id, kind, text, actor, expected_due: Option<&str>) -> Result<Terminated>;
//   NOT BUILT: `final_: bool` (CLI --final / MCP final) — skips the recurring branch.

pub struct DueFilter { pub before: Option<NaiveDate>, pub after: Option<NaiveDate>,
    pub overdue: bool, pub has_due: bool }
pub enum Sel { Is(String), Unset }                                   // NOT BUILT: ID|NAME vs `none`
pub struct TaskQuery { pub due: DueFilter, pub parent: Option<Sel>, pub section: Option<Sel> } // NOT BUILT
pub fn list(cfg, f, av) -> Result<Vec<View<Task>>>;                  // unchanged signature (11 callers)
pub fn list_with(cfg, f, av, due: &DueFilter) -> Result<Vec<View<Task>>>;  // delivered; parent/section
                                                                     // are exact-match filters on Filter
```

### CLI (`src/cli/mod.rs`, `src/cli/task.rs`)

| Verb | New flags |
|---|---|
| `task new` | `--due`, `--deadline`, `--recur`, `--recur-from <due\|completion>`, `--parent`, `--section`, `--order` |
| `task update` | the same flags, where `""` clears; `--priority ""` and `--project ""` clear to null; `--status open` |
| `task finish` | `--final` |
| `task list` | `--due-before`, `--due-after`, `--overdue`, `--has-due`, `--parent <id\|none>`, `--section <name\|none>`; `--sort` gains `due`, `order` |

- `TASK_SORT_KEYS` becomes `[Updated, Created, Title, Priority, Due, Order]`. Its rejection text is
  `invalid sort field: 'x' (use updated, created, title, priority, due, order)`.
- `--order` is a string flag parsed by `tasks::parse_order`, so `""` can clear it.
- The `--priority` help names the four values.
- Finish reports:
  - `--json`: the class-M payload adds `next_due` when the task advanced.
  - Human mode: prints `next due: <due>` through `out::notice`, next to the existing `unblocked:`
    notice.
- `meta_lines` keeps the 14 pinned lines. It then adds one line per v2 key that is present, in
  `TASK_FIELDS` order.
- The tab row `{id}\t{status}\t{holder}\t{title}` does not change.

### MCP (`src/mcp/schema.rs`, `src/mcp/tools.rs`)

| Tool | New params |
|---|---|
| `shards_task_new` | `due`, `deadline`, `recur` OptStr; `recur_from` OptEnum(`RECUR_FROM_VALUES`); `parent`, `section` OptStr; `order` OptNum |
| `shards_task_update` | the same, except `order`, which is OptNumOrClear (`["number","string","null"]`, read by `Args::num_or_clear`): a number sets it, `""` clears it, and a numeric string is parsed (`Args::get` maps JSON `null` to absent, so `null` cannot clear); `status` OptEnum(`["open"]`) |
| `shards_task_finish` | Delivered: `expected_due` OptStr (`YYYY-MM-DD[THH:MM]`, `""` = none) and the annotation `Ann::Idempotent` → `Ann::Write`. The description says a recurring task stays open and `due` advances on each call. Not built: `final` Bool. |
| `shards_task_list` | `due_before`, `due_after`, `parent`, `section` OptStr; `overdue`, `has_due` Bool; the `sort` description adds `due`, `order` |

The `priority` enums widen automatically through `PRIORITY_VALUES = &TASK_PRIORITIES`. The tool
count stays at 40. The finish payload adds `next_due` when the task advanced (or, on a failed
`expected_due` precondition, the current `due`) and `warnings` only when there is something to
say: an unparsable stored `recur` (the task was closed instead of repeating), a failed
`expected_due` precondition (nothing written), or outcome text on a recurring finish (not
recorded; use `shards_task_append`). The CLI JSON carries the same keys and prints each warning to
stderr. The actor stamps (not built) add no parameter: the task payload would carry `created_by`
and `updated_by` when set.

### Members (`src/config.rs`, `src/domain/owner.rs`) — NOT BUILT in the core

Delivered elsewhere: `crates/shards-host/src/members.rs` reads `[core].me` and `[[members]]`
(`id`, `kind`, `name`, `color`) leniently for display only (malformed rows skipped, first id
wins) and does not validate owners. The core plan below stands.

```rust
pub enum MemberKind { Human, Agent }
pub struct Member { pub id: String, pub kind: MemberKind, pub name: String, pub color: Option<String> }
pub struct Config { /* … */ pub members: Vec<Member> }
```

- `from_table` reads `members` as an array of tables. It reports
  `[[members]] entry {n}: {reason}`, 1-based, where reason is one of: `id is required`,
  `id must not contain whitespace`, `duplicate id '{id}'`, `kind must be human or agent`,
  `color must be #RRGGBB`.
- `value_kind` does not change, so `config set` cannot write members.
- `validate_owner` checks the union of `cfg.tasks.collections` and the member ids. An empty union
  keeps the open roster.

<!-- merge -->
## Task model v2 invariants

- **Sparse, appended, lenient.** v2 task keys are written only when set. They sort after the 14
  v1 keys in `TASK_FIELDS`. A malformed v2 value never rejects a task on read: filters and sorts
  treat it as absent, and it round-trips verbatim.
- **Floating calendar values.** `due` (a date, or a local datetime to the minute) and `deadline`
  (a date) carry no zone. They are written as unquoted YAML timestamps, rendered raw
  (`CALENDAR_FIELDS`), and are never in `TIMESTAMP_FIELDS`. "Today" comes only from
  `timefmt::today_local()`.
- **Recurrence advances the task's own file.** Finishing a task with a valid `recur` writes only
  that file: `due` and `deadline` advance, `status: open`, `claimed_by: null`, `completed` is set.
  No file is created, so the single-entity rule holds. A recurring task never satisfies a blocker
  edge.
- **The rest rule.** A recurring task whose due date is after today drops out of ready listings and
  `task next`. `deps::readiness` stays dependency-only, and so do `task get .ready` and the strict
  claim gate.
- **One occurrence engine.** All RRULE parsing and date math live in the pure `domain::recur`, which
  takes `today` as an argument. Nothing else computes occurrences, the desktop app included.
- **Clearing is the empty string** on both CLI and MCP, because MCP `null` means "absent".
- **Actor stamps come from the process, never from arguments.** `created_by` is written once on
  create. `updated_by` is set by `tasks::persist` on every write that changes the file, from the
  configured identity (`Config::agent()`; `[core].me` in `shards-host`; the token on
  `shards-server`). `--owner`, `claimer` and `owner` arguments never set a stamp. A stamp is
  trusted only when `updated` moved with it.
- **List predicates never shrink the readiness graph.** Availability is computed on the full scan.
  Task predicates (due, parent, section) apply afterwards, and then `select` runs.
<!-- /merge -->

---

## Implementation Detail

### Write path (landed; additions marked)

1. Validate before any lock. `v2_edits` turns raw text into `Edit`s: `Due::parse`,
   `parse_deadline`, `Rule::parse` → `Display`, `validate_recur_from`, the trimmed section, and
   `order_value`. `validate_parent` runs on the `rows(cfg)` scan that `create` and `update` already
   take for the dependency graph.
2. **Add (not built):** the cross-field checks, run on the merged map.
   - `recur` set and `due` absent on the merged map: fill `due` from
     `first_on_or_after(today_local(), today_local())`. This applies to `create`, and to an
     `update` that sets `recur` on a task with no due date.
   - An `update` that clears `due` while `recur` stays set is refused with `recur requires due`.
   - `recur_from` set without `recur`: `recur_from requires recur`.
   - `recur` cleared: also remove `recur_from`.
   - ~~`MONTHLY` rule, recurrence from due, no BYMONTHDAY: `pin_monthly`.~~ Superseded by the
     finish-time clamp pin (§ Calendar and recurrence).
3. `apply_edits` inserts or `shift_remove`s each key, keeping the relative order of the others.
   `persist` reorders through `TASK_FIELDS`.
4. **Add (R19):** `persist` takes `actor: Option<&str>`. It sets `updated_by` to the actor, or
   removes the key when the actor is `None`. `create` also sets `created_by`. The actor is
   `Config::agent()`, not `Ctx::actor()`: on `task new` and `task update` the CLI folds `--owner`
   into the global owner, so `Ctx::actor()` would stamp the assignee. Every task writer passes it:
   `create`, `update`, `append`, `claim`, `release`, `terminate_report`, `reopen` and the `blocks`
   mirror write. The no-op check runs before `persist`, so a no-op never restamps.

### Reopen (landed)

`update` with `status: Some("open")` calls `reopen(meta, id)`:

- claimed: refused;
- terminal: `status: open`, `claimed_by: null`;
- always: `completed` is removed.

When the resulting status is not terminal, `move_if_needed(path, open/<id>.md)` runs after
`persist`. That is write-then-move, and a repeat heals a crash-stranded file.

**Add:** no-op detection. When no field changed, skip the write, so `updated` stays untouched and
the file stays byte-identical (AGENTS §6).

### Recurring finish (landed; additions marked)

`terminate_report` takes the recurring branch when all three hold: `kind == Finish`, the task is
not terminal, and `recur` is non-empty. In that branch it:

1. Parses the rule. Delivered: an unparsable stored rule never blocks the finish; the task is
   closed as a one-off and a warning says how to keep it repeating (reopen, set a valid `recur`).
   The `--final` hint the plan proposed is not built.
2. **Precondition (delivered).** When `expected_due` is given and differs from the stored `due`,
   nothing is written; the result reports the current `due` as `next_due` plus a warning. One-off
   tasks ignore it (their finish is idempotent).
3. Runs `advance` and writes `due`, `deadline` (shifted), the pinned `recur` when the advance
   clamped, `status: open`, `claimed_by: null`, `completed` and `updated`.
4. Leaves the body untouched. Any `text` (outcome) is not recorded, per the decision brief; the
   MCP payload adds a warning when outcome text was given.
5. Persists in place. `unblocked` is `[]`. `next_due` is `Some(due.to_string())`.

**Add (not built):** with `final_ == true`, the recurring branch is skipped and the v1 finish path runs, which
also sets `completed`. Cancel never sets `completed`.

### Listing (landed in part; fix and additions)

Order of operations in `list_with`:

1. `rows(cfg)` takes the full scan.
2. Availability is computed on the **full** scan.
3. Task predicates apply (`DueFilter`, parent, section). Fixed: `DueFilter` runs after the
   readiness snapshot (pinned by `due_filters_never_hide_an_undated_blocker_from_readiness`).
4. `select` applies `Filter`, sort and limit.

| Predicate | Rule (on the due's calendar date) |
|---|---|
| `before(d)` | `due.date < d` |
| `after(d)` | `due.date > d` |
| `overdue` | not terminal, and a date-only `due` before today, or a timed `due` earlier than now (local) |
| `has_due` | a valid `due` |
| `parent` | exact match on `parent` (delivered); `Unset`/`none` not built |
| `section` | exact match (delivered); `Unset`/`none` not built |

**Add (not built), the rest rule:** in the `Availability::Ready` branch, drop rows where `recur` parses and
`due.date > today_local()`. `deps::candidates` (`src/domain/deps.rs`) calls
`tasks::list(.., Ready)`, so `task next` inherits the rule. Dashboard and lens ready counts follow.

### Sorting (landed)

All sorts are stable compositions (`sort_unstable` is banned in `select.rs`):

| Key | Passes, in order |
|---|---|
| `Due` | path, created ascending, priority rank, then `due_key = (undated, date, all_day, time)` |
| `Order` | path, created ascending, then `order_cmp` (`f64::total_cmp`, `None` last) |

`Priority` has no code change. Only the rank table changed.

### Testing "today"

- `recur.rs` takes `today` as a parameter and has table-driven unit tests with fixed dates.
- CLI tests in `tests/task_v2_cli.rs` run the binary with `TZ=UTC` and use one of two kinds of
  date:
  - expected dates computed in the test from `chrono::Utc::now().date_naive()`;
  - fixed fixtures far in the past (`2000-01-03`) or far in the future (`2999-01-01`), so the
    result cannot depend on the run date.
- There is no clock env override and no hidden flag. A run that crosses UTC midnight can flake
  once. That is accepted and documented in the test module header.

---

## Performance Budget

- `task list` with any v2 predicate on 5,000 tasks: within 10% of the same list without the
  predicate (release build). Each predicate parses at most two scalars per row from the scan that
  `list` already takes.
- `advance`: O(1) skip-ahead plus at most 8 periods.
- CLI cold start stays under 10 ms. There is no new dependency, and `chrono` already has `clock`.

---

## Open Questions

1. ~~**YEARLY Feb 29 drift.**~~ Resolved in code: the subset accepts `BYMONTH`, and a clamped
   advance stores `BYMONTH=2;BYMONTHDAY=29`, so the series returns on Feb 29.
