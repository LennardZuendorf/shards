---
type: concept
updated: 2026-11-02
---

# product-market: Market landscape

## Market landscape

There are four segments. Each covers part of what Shards needs, and none covers all of it
(research: market §2–§4).

1. **Consumer and team task managers.** Todoist, Things 3, TickTick, Asana, Notion, Linear.
   They offer polished UX, but they are cloud-owned. Most have now added agents: Todoist and
   TickTick host MCP servers, Linear has the delegate model, Asana has AI Teammates, and Notion
   has Custom Agents.
2. **Markdown-native task tools.** Obsidian Tasks, TaskNotes, Backlog.md, Beads, Taskmaster,
   Vibe Kanban. Users own their files. They are either tied to Obsidian or built for developers
   only. None has Todoist-grade recurrence, Today views or reminders combined with agent
   coordination.
3. **Agent-kanban startups.** Stellary, Kanbrio, Kanvas, Tokanban, Ukolio, Agelo, LooperTask,
   Kelvia. This segment is crowded, and most of these products are cloud-only and coding-only.
4. **Agent memory tools.** Mem0, Letta, Zep, Basic Memory, GBrain. They store memory but have no
   tasks. Basic Memory is the closest business-model analogue: free locally, $15/seat in the
   cloud.

### Competitor matrix

| | Todoist | Things 3 | TickTick | Linear | Obsidian Tasks / TaskNotes | Backlog.md / Beads | Agent-kanban startups | Basic Memory / GBrain | **Shards** |
|---|---|---|---|---|---|---|---|---|---|
| Personal to-do UX (quick add, Today, recurrence) | Best in class | Strong | Strong | Weak | Medium (inside Obsidian) | None | Weak | None | **Target: every MVP parity row** |
| Data the user owns as files | No | No | No | No | Yes | Yes (Beads: Dolt DB) | No (some self-host) | Yes | **Yes, Markdown** |
| Works offline, no account | Partial | Yes | Partial | No | Yes | Yes | No | Yes | **Yes** |
| Agent delegation model | Agent acts as the user | None | Agent acts as the user | Assignee + delegate, session states | None | Claim / ready queue | Varies; session states, approvals | None | **Assignee + delegate, atomic claim, ready queue** |
| Agent memory and scratch beside the tasks | No | No | No | No | No | Partial | Tokanban only | Memory only | **Yes, same vault** |
| Hosted MCP + OAuth | Yes | No | Yes | Yes | Third party | Optional | Yes | GBrain via tunnel | **Next** |
| Multi-user | Business plan | None | List sharing | Core strength | Through Obsidian Sync or git | git | Yes | Basic Memory Cloud | **Later** |
| Mobile | Yes | Apple only | Yes | Yes | Through Obsidian | No | Web | No | **Capture + review web app in Next; native apps Later (target Q4 2027)** |
| Price signal | Free / Pro $60 a year / Business $8 per seat (annual) | ≈$80 one-time | $35.99 a year | Free / $10 / $16 per user | Free | Free | Per workspace; Kanbrio's agents are free | Free local / $15 per seat | **Free local / $5 Sync / $8 Team** |

**Sources:**
- Todoist: [pricing FAQ](https://www.todoist.com/help/account-and-billing/plans/todoist-plans-pricing-and-billing-faq-Vq2z0HWL6), [MCP](https://github.com/Doist/todoist-mcp).
- Linear: [agents](https://linear.app/docs/agents-in-linear), [AIG](https://linear.app/developers/aig).
- [TickTick](https://ticktick.com/upgrade).
- [Backlog.md](https://github.com/MrLesk/Backlog.md), [Beads](https://github.com/steveyegge/beads), [TaskNotes](https://tasknotes.dev/core-concepts/).
- [Basic Memory](https://basicmemory.com/pricing), [GBrain](https://github.com/garrytan/gbrain), [Kanbrio](http://kanbrio.com/).
- Todoist has ≈30–50M users and ≈$20–26M ARR. Both are secondary-source figures (research: market §1).

Parent: [Section index](README.md).
