---
type: concept
updated: 2026-11-02
---

# product: Non-goals

## Non-goals

- No CRDT as the record store, and no git sync. Live co-editing is deferred.
- No resold LLM compute, no built-in model, and no seats or per-agent pricing for agents.
- No Pomodoro, habits, Eisenhower matrix, sprints or cycles. No automatic memory deletion or touch-on-read.
- No sequential ids, job queue, synthesis layer or knowledge-graph store.
- No identity enforcement on one machine. Locally, identity is a spelling convention; the server enforces it.
- **Now: one machine per vault.** Agents on other machines reach it through the local CLI over
  SSH today. Private MCP adds network access to the same authoritative machine only after
  its own acceptance; it does not enable multi-device replicas. Syncing the folder with other tools is at the user's own risk.

**Principle reversals (owner sign-off, 2026-10-15).** Other docs cite these as "reversal n".

| # | Earlier mesh rule | Now | Why |
|---|---|---|---|
| 1 | Sync is never mesh's job | Shards does its own record sync. Git sync stays out. | Multi-device use and verified identity are the paid value (research: sync) |
| 2 | No dashboard, no RBAC | The desktop UI ships now; server roles come Later | The wedge is the human to-do experience (research: market §5) |
| 3 | Identity is not a security boundary | Still true locally; the server enforces it from the token | Remote agents cross a trust line |
| 4 | No daemon | Still true for the CLI and core. The app and `shards sync --watch` are optional long-running processes. | Reminders and live sync need a process |
| 5 | No DB | Markdown stays the only truth. Sync state and the server store are replicas. | Server sync needs an ordered log |
| 6 | Hard delete, no trash | Core and CLI delete stay hard. The app offers undo and moves its deletes to the OS Trash (amended 2026-10-16); sync adds tombstones. | Humans expect undo and recovery after quit |
| 7 | Renamed to mesh with no aliases (2026-09) | Shards, with a one-release `MESH_*` / `~/.mesh` fallback | Existing vaults must not break |
| 8 | Surface frozen | Signed off: task fields v2, recurrence, UI-only host tools, `[[members]]` | Parity needs them |

Parent: [Section index](README.md).
