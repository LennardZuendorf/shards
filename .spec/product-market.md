---
type: product-topic
parent: product.md
scope: market
covers: vision, market landscape, competitor matrix, positioning, public tagline, differentiation, personas, jobs to be done
updated: 2026-10-16
---

# Market — Product

Where Shards competes and for whom. Split out of [product-roadmap.md](product-roadmap.md), which
keeps the parity matrix, horizons, GTM, KPIs, risks and the decision log. Pricing, plan limits and
hosted-service duties are in [product-hosting.md](product-hosting.md). The market data comes from
research dated 2026-10-15, and the sources are cited inline. Figures marked "≈" are approximate
or unverified, and are flagged as such in the research.

## Vision

**In three years:** Shards is where a person and their agents keep all their work. A person
captures on the phone, plans on the desktop, and hands work to agents in the cloud and on their
own machine. Every one of those agents reads the same queue, writes progress to the same files,
and remembers in the same vault. The person can open, grep, version and move every file. Teams
share workspaces where every human and every agent has a verified identity and an audit trail.

**The bet:** agents become routine co-workers, and people refuse to let a proprietary cloud
hold both their to-do list and what their agents know about them. Memory products are already
converging on Markdown plus git as the durable layer: Letta Code, GBrain and Basic Memory
(research: market §4). Task products have not followed yet. Shards brings the two together.

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

## Positioning and differentiation

**Positioning statement.** For people who run agents beside their own to-do list, Shards is the
shared task manager for you and your agents. It has Todoist-grade capture and planning, and
everything lives in plain Markdown you own. Agents claim work, report progress and keep their
memory and scratchpads in the same vault. Todoist and Linear lock your work in their cloud and
treat agents as visitors. Shards keeps the files yours and makes agents accountable co-workers.

**Long-term category (D2):** the multiplayer task manager for humans and agents.

**Public tagline, Now and Next:** "Todoist-grade tasks for you and your agents — on Markdown you
own." The word "multiplayer" enters public copy only at the Team launch, when verified
identities exist ([product-roadmap.md](product-roadmap.md) § Principles and § Decision log).

**Taglines:** "Your tasks. Your agents. Your files." · "One vault. Many hands."

| # | Differentiator | Defensibility |
|---|---|---|
| 1 | Todoist-grade to-do UX on Markdown you own. Offline, with no account for solo use. | Medium-high. Incumbents will not move to files, and the Obsidian plugins run only inside Obsidian. |
| 2 | Tasks, memories, scratchpads and notes in one vault, so agents recall context next to the work | High. No competitor combines all four (research: market §2c, §4). |
| 3 | Accountable delegation: assignee plus delegate, session states, an actor on every write, and one "Waiting on me" queue of every agent question, error and task blocked on the operator, oldest first, answered inline (desktop-app R39). Tracked by KPI K22. | Medium. These are proven patterns, delivered local-first; no task app gives one cross-agent queue of what waits on the human. |
| 4 | Agents are free; seats are for humans only | Medium. It is a pricing stance that Kanbrio shares. |
| 5 | One fast core behind every surface: CLI, stdio MCP, app, hosted MCP | Medium. The atomic claim and derived readiness are already delivered. |
| 6 | Importers for Todoist and Obsidian Tasks | Medium. They lower the cost of switching. |

**What Shards does not compete on:**
- MCP access by itself (table stakes).
- Memory-recall benchmarks. The vendor numbers conflict: Mem0 reports 94.4 on LongMemEval, and an independent run measured ≈49 (research: market §4).
- Agent orchestration or coding sandboxes (Vibe Kanban, Devin).
- Habit and focus tools.

## Personas

| Persona | Who | Stack today | Pain | Wins them | Pays for |
|---|---|---|---|---|---|
| **Agent operator** (beachhead) | Solo builder or technical PM running 3–10 agents (Claude Code, Codex, Cowork). This is the owner. | Todoist for life, Obsidian for notes, TODO.md or Backlog.md for agent plans | Work spread over 3–4 tools. Agents start cold. No view of what each agent is doing or believes. | One Today view that holds both their own tasks and their agents' work. The Agents and Memories screens. `session-start` that gives an agent everything in one call. | Personal Sync, so cloud agents can reach the vault |
| **Markdown-native knowledge worker** | Privacy-first Obsidian or Logseq user | Obsidian Tasks or TaskNotes | The plugins are capable but clunky, and they do not work outside Obsidian or on mobile | A Todoist-grade app over the files they already have. An existing vault works as it is. | Personal Sync for multiple devices and phone capture |
| **Small-team lead** | Leads 2–20 people and delegates to both humans and agents | Jira or Asana (too heavy), plus agents in chat | Agent work leaves no durable trail and no accountability | Shared projects, verified identities, an activity feed, agents that cost no seat | Team seats |
| **The agent** | Claude Code, Codex, Cowork and custom agents | A private memory, chat paste | Cold starts, races for the same work, no durable scratch | A ready queue, atomic claim, structured errors, recall, durable scratch, a small tool surface | Nothing. Its human pays. |

Later persona: households and personal collaborators sharing lists, as Todoist and TickTick
users do.

## Jobs to be done

- **Capture.** "Capture a thought in two seconds, with the dates, project and priority parsed, so
  I can safely forget it."
- **Plan.** "Each morning, show me today: my tasks, my agents' tasks and what waits on me."
  Served by Today and the "Waiting on me" queue (desktop-app R3, R39).
- **Delegate.** "Let me hand a task to an agent and stay accountable for it. Show me its progress
  and its questions without making me read logs."
- **Curate.** "Let me review what my agents remember and correct or delete it. Let me clear stale
  scratchpads."
- **Share.** "Let me share a project with a colleague and their agents, and know who did what."
- **Agent.** "At session start, give me my ready work, its context and the relevant memories in
  one call. Then let me claim, record progress, ask the human, and hand off."
- **Own.** "Keep my data as files I can grep, version and move. Never lock me in."
