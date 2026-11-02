---
type: flow
updated: 2026-11-02
---

# product-cli: Terminal dashboard

## Terminal dashboard

`shards dashboard` is a read-only terminal view for operators who stay in the shell.

- Four fixed panes, never reordered: agents, tasks, recent activity, vault health.
- Calm empty states, never an error or spinner: "no agents yet", "no tasks — all clear",
  "no recent activity", "healthy — nothing to report".
- One help line: refresh tick, mine badge, frame clock, focused pane, the keys.
- Keys: `q` / Ctrl-C quit, `r` refresh, `m` toggle mine, `Tab` next pane, `↑`/`↓` scroll. No key
  claims, edits or deletes anything.

---

Parent: [Section index](README.md).
