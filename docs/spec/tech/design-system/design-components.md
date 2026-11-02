---
type: tech
applies: "**"
updated: 2026-11-02
---

# design: Components

## Components

| Pattern | Rules |
|---|---|
| Task row | Completion control, readable title, project mark where relevant, worker/owner identity and due metadata; preserve priority, recurrence, labels, deadlines and subtask access |
| Needs-you panel | Ember panel, named actor, affected task and one real next action; no fabricated question or elapsed time |
| Handoff strip | Show accountable owner and current worker separately; actions use existing assignment and release semantics |
| Agent row | Artwork, name/handle, derived state, current work and links to memories/scratch; no invented runtime or chat connection |
| Note reader | Folders/Tags selector tabs with one visible tree; file list and filter beside a readable article; paths and active filters stay visible |
| Palette | Contextual task actions precede general navigation only when an active task supplies that context |
| Toast | Preserve existing error and undo behavior; errors say what failed and the next action |
| Empty/error state | Preserve distinct disabled, empty, filtered and error states, with one relevant action |

Parent: [Section index](README.md).
