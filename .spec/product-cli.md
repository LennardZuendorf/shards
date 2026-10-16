---
type: product-topic
parent: product.md
scope: cli-mcp-conventions
covers: global flags, configuration precedence, output classes, errors and degradation, which space wins, MCP surface naming, terminal dashboard, output rules
updated: 2026-10-16
---

# CLI and MCP conventions — Product

`shards` (CLI) and `shards-mcp` (stdio MCP) are the surfaces agents live on, and the desktop app
reaches the same core through `shards-host`. These conventions span every verb family and every
feature, so they live here rather than in a feature folder. **Tone:** quiet, deterministic,
instant. Humans get terse text; agents get strict JSON. A command never depends on another
process being up. Moved from the pre-Shards `design.md`, which now holds the visual design system.

**Parent:** [product.md](product.md) · **Architecture:** [tech.md](tech.md) · **Visual design:** [design.md](design.md)

---

## Principles

- Terse, parseable output; ids and paths over prose.
- One verb family per space; no per-command bespoke formats.
- Infrastructure on stderr, never in a JSON payload.
- No spinners, colour or editor prompts on machine paths.
- Read verbs never write: no touch-on-read, no use counters, no lens that mutates.
- An agent can act from the tool schema and the error envelope alone, without reading this doc.

---

## Global flags

| Flag | Effect |
|---|---|
| `--json` / `--quiet` | Machine output / ids only |
| `--owner` / `--mine` | Set or filter by actor (`--mine` = owner or claimed_by). An empty `--owner` reads as absent, never as an identity |
| `--config PATH` | Config file location (precedence below) |
| `--vault PATH` | Vault root (precedence below) |
| `--space CSV` | Which spaces a search or lens reads. Defaults to the configured search spaces |
| `--engine auto\|indexed\|builtin\|substring` | Search engine; `substring` restores the legacy scoring exactly |
| `--tags` / `--any-tag` | Tag filter (AND / OR). On `update`, `--tags` is a grammar: bare `x,y` merges (additive, idempotent), `=x,y` replaces the list, `+x,-y` is a per-token delta. A mixed spec is exit 2, never a guess |
| `--meta-only` / `--full` | Token budget vs full body |
| `--since` / `--stale` | Recency floor (`7d`, ISO date) and its exact inverse |
| `--status`, `--type`, `--kind`, `--limit`, `--threshold` | Task / note / memory / search filters. `--status` takes a CSV union on every verb that has one; an unknown value is exit 2, never a silent empty result. `--threshold` takes a finite number |
| `--available` / `--ready` / `--blocked` | Open-and-unclaimed / also unblocked / has an unsatisfied blocker. `--available` is deliberately dependency-blind |
| `--due-before` / `--due-after` / `--overdue` / `--has-due` | Task date filters (task-model-v2). `--due-before`/`--due-after` are strict and compare the calendar day of `due`. `--overdue` = not done or cancelled, with a date-only `due` before today or a timed `due` earlier than now (local time). `--has-due` = any `due` |
| `--parent ID` / `--section NAME` | Task structure filters (task-model-v2). `--parent` lists direct subtasks only; `--section` is an exact match. A `none` selector is not built (it matches the literal value) |
| `--sort` | `task list`: `updated` \| `created` \| `title` \| `priority` \| `due` (soonest, timed before all-day, undated last) \| `order` (manual rank, unranked last); default `updated`, or `priority` with `--available`/`--ready` |
| `--due` / `--deadline` / `--recur` / `--recur-from` / `--parent` / `--section` / `--order` | `task new` and `task update` (task-model-v2). On `update`, `""` clears each one |
| `--expected-due` | `task finish` (MCP `expected_due`): the `due` the caller saw. A recurring finish whose stored `due` differs writes nothing and warns, so a retry never skips an occurrence |
| `--direction in\|out\|both` | `graph` traversal: `out` follows `related`, `in` walks backlinks, `both` either |
| `--team` | `session-start` only: widens the activity half to every agent; task-ownership and mention halves stay yours |
| `--budget N` | `session-start` only: character budget; trims bodies before entries |
| `--force` | The delete guard on every removal verb |

Task field values (`priority`, `due`, `deadline`, `recur`, `recur_from`, `parent`, `section`,
`order`) are defined by the task-model-v2 feature. The priority enum is `urgent`, `high`,
`normal`, `low` on every surface.

**Defaults:** `search` and `task list` are JSON-friendly; `note get` = frontmatter + 200
characters; search always returns `path`.

**Time:** every instant (`created`, `updated`, `completed`, claim times) renders as UTC with a
`Z` suffix on human and JSON surfaces alike. `due` and `deadline` are calendar values in floating
local time and never carry a zone. One field never has two spellings.

**Flag placement:** `--json`, `--quiet`, `--owner` and `--mine` are accepted before and after the
command name on every non-admin command, with identical effect. `--owner` is the identity the
invocation acts as: it defaults the written `owner` on create and filters on list. `--mine`
resolves against that same acting identity everywhere, never `[core].me` while `--owner` says
otherwise, so selection and the claim it feeds always agree about who is asking.

---

## Configuration and identity precedence

The first source that is set wins. The `MESH_*` and `~/.mesh` rungs are a one-release
compatibility bridge ([product-roadmap.md](product-roadmap.md) § Decision log, D1) and are removed
in the release after shards-rebrand. This table owns the acting-identity rule; other docs cite it.

| Setting | Precedence (highest first) |
|---|---|
| Config file | `--config` > `$SHARDS_CONFIG_PATH` > `$MESH_CONFIG_PATH` > `~/.shards/config.toml` > `~/.mesh/config.toml` |
| Vault root | `--vault` > `$SHARDS_VAULT` > `$MESH_VAULT` > `[core].vault_path`; none set is a validation exit. `shards init` proposes `~/.shards/vault` (or `~/.mesh/vault` when only that exists) |
| Acting identity | `--owner` > `$SHARDS_AGENT` > `$MESH_AGENT` > `[core].me` > `[core].agent` (pre-Shards key, read when `me` is absent). **Delivered:** the core does not read `[core].me` yet (task-model-v2/8), so CLI and MCP use `--owner` > `$SHARDS_AGENT` > `$MESH_AGENT` > `[core].agent`. `shards-host` sets `$SHARDS_AGENT` to `[core].me` at start |
| Search binary | `$SHARDS_INDEXED_BIN` > `$MESH_INDEXED_BIN` > `indexed` on `PATH` |

Identity is a spelling convention locally, validated against `[tasks].collections` (enriched by
`[[members]]` once task-model-v2/8 lands; today only `shards-host` reads `[[members]]`, for
display names and kinds). It becomes a security boundary only on the future server, where the actor comes
from the OAuth token.

---

## Output classes

Every command declares one class, so precedence is never an implementer's guess.

| Class | Commands | Rule |
|---|---|---|
| **M** mutation | create, append, update, claim, release, finish, cancel, delete, block, unblock, set, add, attach, detach, `config set` | `--quiet` beats `--json`. Quiet prints the id (or name) alone; JSON is `{"id", <fields>, "updated"}` in that order |
| **L** listing, lens, object, admin | `get`, `list`, the five lenses, `task next`, `asset path`, `asset gc`, `init`, `status`, `reindex`, `watch`, `config` | `--json` beats `--quiet` |
| **S** search | `search`, `memory recall` | Output is always one JSON array; `--json` is accepted and inert; `--quiet` suppresses only the stderr degradation notice |

---

## Errors and degradation

- Human mode: one plain-text line on stderr.
- Machine mode (`--json`): exactly one JSON object on stderr with `kind`, `message`,
  `next_action` and structured fields, plus `candidates` on a not-found and `retry_after_ms` on a
  lock conflict. Exit codes are identical in both modes. No `next_action` may read as an
  authorisation decision. MCP renders the identical object, and the desktop app shows `message`
  and `next_action` in its error toast.
- Degradation (substring fallback, a missing search binary, a blocked claim, an unblock report, a
  duplicate title, a dangling rename) is one stderr line, suppressed by `--quiet`, and never
  enters a payload.
- Exit codes are a typed contract owned by [tech.md](tech.md).

---

## Which space wins

Guidance for agents, stated in the playbook and the MCP instructions block. Shards enforces
nothing here; the duplicate-title advisory is same-space only by construction.

- **note**: durable knowledge about the world or the work; the operator reads it.
- **task**: work someone is accountable for, with an assignee and possibly a worker.
- **memory**: an agent's belief about the operator or the fleet; another agent recalls it.
- **scratch**: this session's working state; no lens or default search shows it. The desktop
  Scratchpads view is the one place a human sees it.
- **asset**: bytes that are not Markdown; attach them to the entity they belong to.

---

## MCP surface

- Agent tools are named `shards_*` only. `mesh_*` names are not aliased; an agent configured with
  old names reconnects to `shards-mcp` and re-reads the tool list.
- UI-only host tools (`host_*`, [tech.md](tech.md) § Host Tool Contract) are reachable only through
  `shards-host`. They never appear on the agent MCP surface.
- No agent tool name contains delete, forget, remove, clear, status, reindex or daemon; those
  verbs stay CLI- and host-only (pinned by the MCP name-ban test).
- Every tool parameter carries a description; enums list the real domain literals.
- Failures cross as the same structured envelope the CLI emits, never a stack trace.

---

## Terminal dashboard

`shards dashboard` is a read-only terminal view for operators who stay in the shell.

- Four fixed panes, never reordered: agents, tasks, recent activity, vault health.
- Calm empty states, never an error or spinner: "no agents yet", "no tasks — all clear",
  "no recent activity", "healthy — nothing to report".
- One help line: refresh tick, mine badge, frame clock, focused pane, the keys.
- Keys: `q` / Ctrl-C quit, `r` refresh, `m` toggle mine, `Tab` next pane, `↑`/`↓` scroll. No key
  claims, edits or deletes anything.

---

## Requirements

### Requirement: Output class precedence (CLI-R1)

Every command SHALL belong to exactly one output class, and the class SHALL decide how
`--json` and `--quiet` combine.

#### Scenario: Quiet wins on a mutation

**Given** a vault with an open task
**When** the operator runs a task update with both `--json` and `--quiet`
**Then** stdout holds the task id alone and nothing else

#### Scenario: JSON wins on a listing

**Given** a vault with two tasks
**When** the operator lists tasks with both `--json` and `--quiet`
**Then** stdout is the JSON listing

### Requirement: One error envelope (CLI-R2)

In machine mode a failure MUST write exactly one JSON object to stderr with `kind`, `message`
and `next_action`, and MUST exit with the same code as human mode. MCP SHALL return the same
object.

#### Scenario: Not found with candidates

**Given** a task titled "Ship build"
**When** an agent gets a task by the slug "ship-buld" with `--json`
**Then** stderr holds one object with `kind` "not_found" and a `candidates` list naming the task
**And** the exit code equals the human-mode exit code for not-found

### Requirement: Degradation stays out of payloads (CLI-R3)

A degraded path SHALL report on stderr only and MUST NOT change the shape of stdout.

#### Scenario: Search binary missing

**Given** the configured search binary is absent
**When** an agent searches with `--json`
**Then** stdout is the same JSON array shape the indexed engine returns
**And** stderr holds one degradation line, which `--quiet` suppresses

### Requirement: Unknown enum values are rejected (CLI-R4)

A filter or field that takes an enum MUST reject an unknown value with a validation exit, never
return an empty result.

#### Scenario: Unknown priority

**Given** any vault
**When** an agent creates a task with priority "critical"
**Then** the command exits with the validation code, writes no file, and the envelope message
names `urgent`, `high`, `normal`, `low`

#### Scenario: Unknown status in a filter

**Given** a vault with open tasks
**When** an agent lists tasks with status "doing"
**Then** the command exits with the validation code instead of printing an empty list

### Requirement: Rebrand compatibility bridge (CLI-R5)

For one release, each `SHARDS_*` variable and `~/.shards` path SHALL fall back to its `MESH_*`
or `~/.mesh` counterpart when unset or absent, and the `SHARDS_*` value MUST win when both exist.

#### Scenario: Legacy agent variable

**Given** `$MESH_AGENT` is "ops-agent" and `$SHARDS_AGENT` is unset
**When** the agent creates a task
**Then** the task owner is "ops-agent"

#### Scenario: Both set

**Given** `$MESH_VAULT` and `$SHARDS_VAULT` name different folders
**When** any command runs
**Then** it reads the `$SHARDS_VAULT` folder

### Requirement: Agent surface naming (CLI-R6)

The agent MCP surface SHALL list only `shards_*` tools and MUST NOT list any `mesh_*` alias or
any `host_*` tool.

#### Scenario: Tool list

**Given** a running `shards-mcp`
**When** a client lists tools
**Then** every name starts with `shards_`

### Requirement: Read verbs never write (CLI-R7)

Every listing, lens, search and recall verb MUST leave every file in the vault byte-identical.

#### Scenario: Recall leaves files untouched

**Given** a vault with memories
**When** an agent recalls memories ten times
**Then** no file's bytes or modification time change

### Requirement: Acting identity is one value per invocation (CLI-R8)

`--mine`, the written `owner` and claims SHALL resolve against the same acting identity, wherever
the flags are placed.

#### Scenario: Owner overrides the configured identity

**Given** `[core].me` is "lennard" and a task claimed by "ops-agent"
**When** the operator lists tasks with `--owner ops-agent --mine`
**Then** the claimed task is listed

---

## Non-goals

- No colour, spinners or interactive prompts on any machine path.
- No per-command output formats beyond the three classes.
- No `mesh_*` tool aliases, and no compatibility bridge beyond one release.
