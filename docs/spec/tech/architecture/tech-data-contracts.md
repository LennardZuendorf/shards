---
type: tech
applies: "**"
updated: 2026-11-02
---

# tech: Data Contracts

## Data Contracts

**Task model v2** (frontmatter, all optional, unknown keys still round-trip; feature 15):

| Field | Format |
|---|---|
| `status` | `open` \| `claimed` \| `done` \| `cancelled` (unchanged) |
| `priority` | `urgent` \| `high` \| `normal` \| `low`; default `normal`; Todoist P1–P4 map in that order |
| `due` | `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM` (floating local time) |
| `deadline` | `YYYY-MM-DD` |
| `recur` / `recur_from` | RRULE subset: `FREQ` DAILY/WEEKLY/MONTHLY/YEARLY, `INTERVAL` (1..1000), `BYDAY` (weekly), `BYMONTHDAY` incl. negative (monthly, or yearly with `BYMONTH`), `BYMONTH` (yearly); stored in canonical spelling / `due` (default) \| `completion` |
| `parent`, `section`, `order` | task id; free string; float rank (UI writes midpoints) |
| `completed` | RFC 3339 `…Z`, set on finish, cleared on reopen |
| `tags`, `project`, `owner`, `claimed_by`, `blocks`, `blocked_by` | unchanged |

Recurring finish: advance `due` (and `deadline` by the same delta), keep `status: open`, release
any claim, set `completed`, append nothing, report `next_due`. A day the rule does not name that
clamps (31 → 30 April, Feb 29 → 28) rewrites `recur` with the day pinned, so the series never
drifts. `expected_due` (optional) makes a retried recurring finish a no-op with a warning.
`warnings` appear only when there is something to say: an unparsable stored `recur` (the task is
closed instead), a failed `expected_due` precondition, or outcome text on a recurring finish (not
recorded). Reopen = update `status: open`. Memory, scratch, note and asset
models are unchanged (→ [tech-core.md](../core/README.md) § Entity fields).

**Identity config.** `[[members]]` = `id`, `kind` (`human`\|`agent`), `name`, optional `color`;
`[tasks].collections` stays the validation list. `[core].me` names the human operator. Delivered:
only `shards-host` reads `[core].me` and `[[members]]` (`crates/shards-host/src/members.rs`); the
core `Config` ignores both, so the CLI/MCP actor is `--owner` > `$SHARDS_AGENT` > `$MESH_AGENT`
(0.3.x only) > `[core].agent`. Planned (task-model-v2/8): the core reads both and `[core].me` joins
that chain before `[core].agent`; [product-cli.md](../../flows/cli/README.md) § Configuration and identity
precedence owns the rule. `shards-host` sets `$SHARDS_AGENT = [core].me` at start (§ Host Tool
Contract); with no `me` it inherits the shell's `$SHARDS_AGENT` (gap: the spec says it ignores it).

**Vault-internal state.** `.shards/` at the vault root, skipped by the walk: `sync/` (SQLite:
bases, HLCs, cursor), `conflicts/`, later `trash/`.

Parent: [Section index](README.md).
