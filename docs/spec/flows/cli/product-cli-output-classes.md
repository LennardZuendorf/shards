---
type: flow
updated: 2026-11-06
---

# product-cli: Output classes

## Output classes

Every command declares one class, so precedence is never an implementer's guess.

| Class | Commands | Rule |
|---|---|---|
| **M** mutation | create, append, update, claim, release, finish, cancel, delete, block, unblock, set, add, attach, detach, `config set` | `--quiet` beats `--json`. Quiet prints the id (or name) alone; JSON is `{"id", <fields>, "updated"}` in that order |
| **L** listing, lens, object, admin | `get`, `list`, the five lenses, `task next`, `asset path`, `asset gc`, `init`, `status`, `reindex`, `watch`, `config` | `--json` beats `--quiet` |
| **S** search | `search`, `memory recall` | Output is always one JSON array; `--json` is accepted and inert; `--quiet` suppresses only the stderr degradation notice |

### Task rows

One tab-separated line per task, `-` for an absent value, and the free-text `title` last:

```
{id}\t{status}\t{claimed_by|-}\t{due|-}\t{priority|-}\t{title}
```

The two columns that decide `task next`'s order (`due`, then `priority`) sit before the title, so
the answer to "why this task" is visible in the row. `task list` and `task next` render through
one function; neither has a row format of its own. The row format is human output only; it never
replaces the `--json` payload or the `--quiet` id lines.

`task list` is capped at 20 rows. The cap is never silent: when rows are held back, one line
goes to stderr (`showing 20 of 25 tasks — use --all`, suppressed by `--quiet`), and `--json`
renders `{"tasks": [...], "total": N}` where `total` is the true match count after every
filter and before the cap. The same envelope serves a complete result, where `total` equals
`len(tasks)`. `--all` is the one named spelling for complete enumeration; an explicit
`--limit 0` is exit 2 and names it, because zero cannot also mean "everything" and a silent
empty list reads as an empty vault. `search`, `recent-activity` and `project` keep their own
caps and are not covered by this contract.

`task next` orders ready, unclaimed candidates by the `--sort due` composition and nothing else:
soonest `due` first (a timed `due` before an all-day one on the same date), **undated tasks last**,
then `priority`, then FIFO by `created`, then path. A task due on or before today therefore
outranks an undated task of any priority, and `priority` breaks ties only among tasks with the
same `due`. Nothing ready is exit 3 (`no ready task`).

---

Parent: [Section index](README.md).
