---
type: flow
updated: 2026-11-04
---

# product-cli: Global flags

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
| `--takeover` | `task claim` / `task release`: take over a claim untouched for the stale window (2 days, judged from `updated`). A fresher claim still conflicts; see [CLI-R10](product-cli-requirements-11.md) |

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

Parent: [Section index](README.md).
