# Shards — Market and Product Research

Research date: 2026-10-15. Author: market-research subagent. Scope: the market and product case for
pivoting `mesh` (Rust CLI + stdio MCP over one Markdown folder) into **Shards**, a multiplayer task
manager for humans and agents, backed by Markdown.

---

## 0. Summary (answer first)

1. **MCP access alone does not set Shards apart. Do not position on it.** Todoist runs an official hosted MCP
   server with OAuth (`https://ai.todoist.net/mcp`) and a `td` CLI with agent skills. TickTick runs
   `https://mcp.ticktick.com`. Linear, Jira, Asana, Notion and GitHub all let you assign work to
   an agent. At least eight startups (Stellary, Kanbrio, Kanvas, Tokanban, Ukolio, Agelo,
   LooperTask, Kelvia) sell an "agent kanban" with an OAuth MCP server.
2. **The open space is the overlap of three things that no single product covers today:**
   - (a) a personal to-do app at Todoist parity, at consumer quality;
   - (b) local-first, user-owned Markdown files;
   - (c) agent memory and scratchpads in the same vault as the tasks.

   The near-misses each cover one or two of these:
   - Backlog.md and Beads are dev-only, with no recurrence or reminders.
   - TaskNotes and Obsidian Tasks are tied to Obsidian and do not coordinate agents.
   - Basic Memory and GBrain are memory without tasks.
   - Todoist and TickTick are proprietary clouds.
3. **The category has settled on one delegation model. Copy it.**
   - Linear separates the **assignee** (the accountable human) from the **delegate** (the agent).
   - Linear sessions show the states working, awaiting input, error and done.
   - Linear's Agent Interaction Guidelines say "an agent cannot be held accountable".
   - Jira and Asana put agents straight into the assignee field.

   Shards should use the Linear model. That model also fixes mesh's known trust gap:
   `owner`/`claimed_by` are unverified strings (`mesh/README.md:25`,
   `mesh/.spec/product.md:50`). Remote sync with OAuth gives every human and agent a verified
   identity. Treat sync as the fix for that trust problem, not as a convenience add-on.
4. **The Todoist parity floor for an MVP is roughly Todoist's free tier:**
   - quick-add NLP with natural-language dates and `every`/`every!` recurrence;
   - Inbox, Today and Upcoming views;
   - projects, sections and subtasks;
   - labels and P1–P4 priorities;
   - list and board views.

   Reminders need a running process. Mesh has none by design (`mesh/README.md:5-6`), so the CLI
   cannot send them. The Tauri app is that process. Due-time notifications while the app or tray
   is running are MVP. Custom, location and push reminders are v1. Mobile capture is the largest
   parity gap, and it stays a "later" item.
5. **Business model:**
   - Local use is free and unlimited: CLI, MCP and desktop app.
   - Paid **Sync** at about $4–5/month covers multi-device use, history and a hosted remote MCP
     endpoint that cloud agents can reach.
   - Paid **Team** at about $8–10 per *human* seat per month.
   - **Agents never cost a seat.**
   - Do not resell LLM compute.

   Benchmarks:
   - Obsidian Sync: $4/$8.
   - Anytype: $4/$8/$16.
   - Basic Memory Cloud: $15/seat.
   - Todoist Pro: $5/month billed annually ($60/year).
   - Todoist Business: $8/user/month billed annually.
6. **Name: "Shards" can be used as a product brand, but not as the CLI binary name.**
   - Crystal's dependency manager is a binary called `shards`, distributed with Crystal.
   - `shards` is already taken on crates.io and npm.
   - A Tauri/Rust app named "Shards" exists (a writing tool).
   - Keep `mesh` as the engine and CLI name. `shard` is also taken on crates.io and npm.
   - No trademark search was run. §7 gives the search to run.

---

## 1. Method and data caveats

- **Sources:** Exa web search and fetch of vendor pricing, docs and changelog pages, dated
  2026-06 to 2026-10. `gh api` for GitHub stars. The crates.io and npm registry APIs. `dig` for
  DNS. The mesh repo and the obsidian-taskui reference were read locally, without changes.
- **Conflicts I found and did not resolve. Each is flagged where it is used:**
  - **Todoist Pro file-upload limit.** The pricing page says 100 MB. The plans FAQ, updated
    2026-10-15, says Pro is 25 MB and Business is 100 MB. Trust the FAQ until checked.
  - **Todoist user count.** "50M+ users (May 2026)" comes from a secondary aggregator
    (whobrands.com). Older founder-sourced figures say 30M+. Treat both as approximate. Revenue
    estimates are ~$20–26.5M ARR, with ~300k paying customers (operatorbook.dev; GetLatka
    estimate).
  - **Asana Starter/Advanced prices** ($10.99 / $24.99 per user per month) come from Capterra.
    Whether these are monthly or annual-billed prices is unverified.
  - **Asana AI Teammates** launched in beta on 2025-09-25, with "GA expected Q1 FY27". Their GA
    status in October 2026 is unverified.
  - **Things 3 calendar.** The App Store says "Calendar integration — see your events and to-dos
    together". AsianEfficiency (2026-07) says it has no native calendar sync. Both fit: Things
    shows calendar events read-only and does not write events.
  - **Mem0 licence.** Different sources say Apache-2.0 or MIT. `gh` reports Apache-2.0.
  - **DNS.** "No A record observed" does not mean a domain is available. Run WHOIS before relying
    on any domain.

---

## 2. Feature matrices

### 2a. Todoist: the parity target in full

Todoist has an estimated 30–50M users (see §1). It is bootstrapped and profitable, and it is the
benchmark the owner wants to challenge.

| Area | Todoist capability (2026) | Plan gate | Source |
|---|---|---|---|
| Quick Add NLP | `#project`, `/section`, `@label`, `p1–p4`, `+assignee`, `{deadline}`, `for 30 min` duration. Natural dates up to 150 chars ("every 3rd Tuesday starting Aug 29 ending in 6 months", "tom evening", "50 days before new year's eve"). Global `Q` hotkey. | all | todoist.com/help …introduction-to-dates-and-time; usecarly.com/blog/how-to-use-natural-language-in-todoist |
| Recurrence | `every`, which recurs from the scheduled date, and `every!`, which recurs from the completion date. `every other`, `every 12 hours starting at 9pm`, `every last workday`, `every 15th workday`. `starting …`/`ending …`/`for 3 weeks`. Future occurrences are shown in the calendar view. | all | todoist.com/help …introduction-to-recurring-dates |
| Hierarchy | Projects with sub-projects, folders (team), sections, sub-tasks. Project and section descriptions (2026), also exposed via API, CLI and MCP. | 5 projects free / 300 Pro | todoist.com/help …2026-changelog; …plans-pricing-and-billing-faq |
| Labels and priorities | Labels (shared labels in teams). 4 priority levels, P1–P4. | all | todoist.com/features |
| Dates | Due date and time; **deadlines** (separate from the scheduled date); task **durations**; time-blocking. | deadlines and durations are Pro | pricing FAQ |
| Reminders | Automatic reminders for timed tasks (all plans). Custom, time-based, location-based and recurring reminders. | custom reminders are Pro | todoist.com/help …get-started-with-todoist-pro |
| Views | Inbox, Today, Upcoming. Layouts: list and board (all plans), calendar (Pro). Filters can show several lists in one view (`p1 & overdue, p4 & today`). | calendar is Pro | pricing FAQ |
| Filter query language | Operators `& \| ! () ,` and `*` wildcards. Terms: `search:`, `date:`, `date before/after:`, `deadline:`, `due before:`, `no date`, `no time`, `overdue`, `7 days`, `recurring`, `#proj`, `##proj` (includes sub-projects), `/section`, `!/*`, `@label`, `assigned to:`/`assigned by:`/`added by:` (`me`, `others`), `assigned`, `shared`, `subtask`, `created before:`. Limits: no comment search, no completed tasks, and parent and sub-task are not shown together. | 3 filters free / 150 Pro | todoist.com/help/articles/introduction-to-filters-V98wIH; …introduction-to-search |
| Collaboration | Shared projects, assignment, comments, file uploads, activity log (7 days free, full on Pro). Team workspace with roles (admin, member, guest), team filters, shared templates, up to 1,000 members. | team features are Business | pricing FAQ |
| Motivation | Karma points, productivity visualisations, completed-task archive, **Project Insights** (moved to Pro in 2026). | Insights is Pro | todoist.com/features; 2026 changelog |
| AI | **Todoist Assist**: Filter Assist (natural language to filter query), Task Assist (break down, rewrite, suggest), Email Assist (email to task). **Ramble**: voice to tasks, 38 languages. Task Capture Assist reads images and documents. | Ramble is limited to 10 sessions/month on free | todoist.com/help …introduction-to-todoist-assist |
| Agents | Hosted MCP server at `ai.todoist.net/mcp`, Streamable HTTP with OAuth. `td` CLI with `td skill install claude-code`. "Agents are first-class users of Todoist." | all | developer.todoist.com; github.com/Doist/todoist-mcp |
| Integrations | 80+ integrations, 10+ apps and platforms, email-to-project, daily backups (Pro). | — | todoist.com/features |
| Price | Beginner free. Pro $7/month or $60/year. Business $10/user/month or $8/user/month billed annually (raised 2025-12-10). | — | pricing FAQ; …business-plan-pricing-update |

### 2b. Consumer and team task managers

| Capability | Todoist | Things 3 | TickTick | Asana | Notion | Linear |
|---|---|---|---|---|---|---|
| Quick-add NLP | Best in class | Basic | Yes (date recognition) | Limited | Limited | Limited |
| Recurrence | Very rich (`every!`) | Basic | Rich | Yes | Via automations | Recurring issues |
| Projects / sections / subtasks | Yes / Yes / Yes | Areas → Projects → Headings → checklists | Lists / sections / subtasks (199) | Yes, plus multi-homing | Databases with subtasks and dependencies | Projects, initiatives, sub-issues |
| Labels / priorities | Labels, P1–P4 | Tags | Tags, 4 priorities | Custom fields | Properties | Labels, priority |
| Saved filters / query language | Yes (rich syntax) | Quick Find only | Smart lists | Search and reports | DB filters | Views with filters |
| Today / Upcoming | Yes | Today, This Evening, Upcoming, Anytime, Someday, Logbook | Today, Next 7 days | My Tasks | Custom | My issues, Inbox |
| Board / calendar | Yes / Pro | No / reads calendar | Yes / 6 calendar views | Yes / Yes | Yes / Yes | Board / timeline |
| Reminders | Time, location, recurring | Yes | Constant reminder, location | Yes | Yes | Notifications |
| Deadlines separate from schedule | Yes (Pro) | Yes (`when` vs deadline) | Partly (start/due) | Start/due | — | Due / cycle |
| Extras | Karma, Insights | Magic Plus, Mail to Things | Pomodoro, habits, Eisenhower matrix | Goals, portfolios, workload | Docs, wiki | Cycles, triage, insights |
| Collaboration | Shared projects, Business teams | **None** | List sharing | Core strength | Core strength | Core strength |
| Agents | MCP + CLI | Siri AI only (3.24, 2026-09) | MCP (`mcp.ticktick.com`) and CLI | AI Teammates (assignable) | Notion Agent and Custom Agents | Delegate field, Linear Agent, open agent platform |
| Platforms | All, including web | Apple only, no web | All | All | All | All |
| Data ownership | Cloud | Things Cloud (proprietary) | Cloud | Cloud | Cloud | Cloud |
| Price | Free / $60 a year / $8 per seat | $49.99 Mac + $9.99 iPhone + $19.99 iPad, one-time | $35.99 a year | Personal free; Starter $10.99 / Advanced $24.99 (Capterra, billing period unverified) | Free / Plus $10 / Business $20 per member; credits $10 per 1k | Free (250 issues, 2 teams, agents included) / Basic $10 / Business $16 per user, billed annually |

Sources for the table:
- Things: itechguides.com/things-3-review…; apps.apple.com/us/app/things-3/id904237743;
  macrumors.com/2026/09/14/things-3-updated-for-ios-27; asianefficiency.com/task-management/things-3-review.
- TickTick: ticktick.com/upgrade; capterra.com/p/170641/TickTick/pricing;
  help.ticktick.com/articles/7438129581631995904.
- Asana: asana.com/pricing; capterra.com/p/184581/Asana-PM/pricing.
- Notion: notion.com/pricing; notion.com/product/agents.
- Linear: linear.app/pricing; linear.app/docs/assigning-issues.

### 2c. Markdown-native and agent-native task tools (the direct neighbours)

| Capability | Obsidian Tasks | TaskNotes | Backlog.md | Taskmaster AI | Beads (`bd`) | Vibe Kanban | **mesh today** |
|---|---|---|---|---|---|---|---|
| Storage | Inline `- [ ]` lines with emoji or Dataview signifiers | One note per task, YAML frontmatter | One `.md` per task in `backlog/` | `tasks.json` | **Dolt** SQL; `.beads/issues.jsonl` is only an export | App DB plus git worktrees | One `.md` per task (YAML frontmatter) in `tasks/open|done` |
| Human UI | Query blocks in notes | Bases views: list, kanban, calendar, agenda | Terminal kanban plus `backlog browser` web UI | Editor chat | CLI (third-party viewers) | Web kanban plus diff review | None (CLI only) |
| Due / scheduled / start | Yes (📅 ⏳ 🛫) | Yes | Due date | No | No | No | **No** |
| Recurrence | Yes (rrule; `when done`) | Yes (RFC 5545 rrule, materialised instances) | No | No | No | No | **No** |
| Priority | 6 levels | Yes | Yes | Yes | p0–p4 | Yes | high / normal / low |
| Dependencies | Yes (🆔 ⛔) | Yes (blocked-by / blocking) | Yes | Yes | 4 link types (blocks, parent-child, relates, discovered-from) | Sub-issues | Yes (`blocks`/`blocked_by`, derived readiness, `task next`) |
| Agent claim / ready queue | No | No | Assignee | `next_task` | `bd ready`, `--claim`, hash IDs | Workspaces per issue | **Yes**: atomic `claim` under O_EXCL, `task next --claim` |
| Memory / notes | Obsidian itself | Obsidian itself | docs/ and decisions/ | PRD docs | "Memory upgrade"; compaction | No | **notes, memories (importance, expiry, supersession), scratch, assets** |
| MCP | No (third-party) | HTTP API (third-party MCP) | Optional; the manifesto calls MCP a "legacy, optional adapter" | Yes (7 core tools) | Yes | Yes | stdio MCP |
| Multi-user sync | Obsidian Sync or git | Obsidian Sync or git | git | git | Dolt push/pull | Team cloud | None (single machine) |
| GitHub stars (2026-10-15) | 4,054 | 2,206 | 7,037 | 28,229 | 27,905 (now `gastownhall/beads`) | 28,372 | — |

Sources for the table:
- Obsidian Tasks: publish.obsidian.md/tasks/Reference/Task+Formats/Tasks+Emoji+Format.
- TaskNotes: tasknotes.dev/core-concepts; tasknotes.dev/obsidian/features.
- Backlog.md: github.com/MrLesk/Backlog.md (README, MANIFESTO.md).
- Taskmaster: docs.task-master.dev; github.com/eyaltoledano/claude-task-master.
- Beads: github.com/steveyegge/beads; yegge.ai/essays/introducing-beads….
- Vibe Kanban: github.com/BloopAI/vibe-kanban.
- mesh: `mesh/README.md:251-306`.
- Stars: `gh api repos/...`.

**What this means for Shards:**
- Mesh already has the strongest *agent coordination core* of this group: an atomic claim,
  derived readiness, the `next` primitive and a separate memories space.
- Mesh has none of the *human to-do* fields:
  - due, scheduled and start dates;
  - recurrence, reminders, sections, subtasks and P1–P4 priorities;
  - any UI.
- The data model needs those fields added. The obsidian-taskui reference already reads and writes
  both the Obsidian Tasks emoji format and the Dataview format (its `README.md`). That
  interoperability is worth carrying into Shards as an import path.

---

## 3. The emerging category: humans and agents on one task board (2025–2026)

### 3a. Incumbents that added agents to existing work graphs

| Product | How agents get work | Accountability model | Visibility | Pricing signal |
|---|---|---|---|---|
| **Linear** (Linear for Agents, AIG; Linear Agent public beta in 2026) | Assigning an issue sets it as **delegate**. Also `@mention`, triage rules that auto-delegate, and proactive `agentSessionCreateOnIssue`. | **Human stays assignee; agent is delegate.** AIG: "an agent cannot be held accountable". | AgentSession states (working, awaiting input, error, done). Activity types: thought, action, elicitation, response, error. Agent Plans checklist. "Delegate" filter in views and Insights. Workspace and team **agent guidance**. | Agents included on all plans. Coding sessions: provider token rates plus $0.25 per 20-minute sandbox block, with spend limits. |
| **GitHub** (Copilot coding agent, Agent HQ, mission control) | Assign an issue to Copilot, which always opens a PR. Third-party agents (Claude, Codex) and custom agents defined in `agents.md`. Tasks can also come from Jira, Linear, Azure Boards and Raycast. | Agent is assignee; human reviews the PR. | Mission control: real-time session logs and steering mid-run. | Included in paid Copilot (premium requests). |
| **Jira / Rovo** (agents in Jira, GA 2026-05) | Assignee field, `@mention`, **workflow transitions**, **board column triggers**. Third-party agents (Copilot coding agent, Claude Agent for Jira) and MCP servers. | Agent is assignee. Output is **private to the invoker until shared**. | Progress shown on the work item. | Rovo credits apply from 2026-12-03. |
| **Asana** (AI Teammates, beta 2025-09) | Assignment, `@mention`, rules, forms, recurring tasks. | Checkpoints for human review. Needs approval before assigning to a human who lacks access. | Comments and subtasks as it works; shared team memory. | AI Studio credits. |
| **Notion** (Notion 3.0 agents; Custom Agents 2026-02) | Personal agent on demand. Custom Agents run on triggers and schedules. | Per-agent permissions, audit log, **reversible changes**, auto-pause at the credit cap. | Run logs. | $10 per 1,000 credits, on Business and Enterprise only. |
| **Todoist / TickTick** | Hosted MCP and CLI; the user's own agent acts **as the user**. | No separate agent identity. | Ordinary activity log. | Included. |

Sources for the table:
- Linear: linear.app/developers/aig; linear.app/developers/agent-interaction;
  linear.app/docs/agents-in-linear; linear.app/changelog.
- GitHub: github.blog/news-insights/company-news/welcome-home-agents;
  docs.github.com/…/kick-off-a-task.
- Jira: support.atlassian.com/jira-software-cloud/docs/collaborate-on-work-items-with-ai-agents;
  community.atlassian.com/…/Introducing-Agents-in-Jira.
- Asana: help.asana.com/s/article/ai-teammates; investors.asana.com/….
- Notion: notion.com/blog/introducing-custom-agents.

### 3b. Agent runtimes that consume task boards

| Runtime | How it takes tasks | Source |
|---|---|---|
| **OpenAI Codex** | Assign a Linear issue to Codex or `@Codex`; Linear triage rules can delegate automatically; local access through Linear MCP. | developers.openai.com/codex/integrations/linear |
| **Devin** | Linear and Jira assignment. **Playbook labels** (`!plan`, `!implement`). Edge-triggered automation on team, label or status. Reuses Linear's agent-session UI. | docs.devin.ai/integrations/linear |
| **Claude Cowork** | Single-player. Describe an outcome; it runs in the cloud; scheduled tasks; projects with memory. "Sessions can't be shared with others." Connectors include Asana and Notion. | support.claude.com/en/articles/13345190; venturebeat.com/…/anthropic-launches-cowork… |

**Implication:**
- These runtimes are **consumers** of a task source. They are not task managers.
- Shards wins if Claude Code, Codex, Cowork and others can pull the same queue through one MCP
  endpoint, and the human sees their progress in one UI.
- Cowork's single-player limit is a gap that a shared Shards vault fills.

### 3c. New "agent kanban" startups (crowded, mostly cloud-only)

| Product | Notable mechanism | Source |
|---|---|---|
| Stellary | Autonomy modes: direct, **supervised**, **approval** (non-read writes become proposals). Remote MCP with bearer token. | stellary.co/ai-kanban-board |
| Kanbrio | AgentSession states on the card face. OAuth 2.1 MCP with 122 capabilities. Hash-chained audit log. **"Agents never cost a seat."** Open-core, self-host. | kanbrio.com |
| Kanvas | Agent identities with an avatar and scoped token. **Skills served over MCP.** Human handoffs. | getkanvas.ai |
| Tokanban | Tasks **plus durable memory** (facts, decisions, session chronicles). Personas (PM, Architect, …). | tokanban.com |
| Ukolio | MIT and self-hostable. MCP with OAuth 2.1, PKCE and dynamic client registration (RFC 9728). Every event tagged Human or Agent and named by MCP client. | ukolio.com |
| Agelo | Per-column `agentPickupEnabled` and `agentCanModerate`. Only explicitly declared transitions are allowed. Agents need approval. | agelo.app |
| LooperTask | Agents run locally and call `claim_next_task`. Locked lanes. Forms turn into tasks. SSE live board. | loopertask.com |
| Kelvia | Shared record for coding agents. Worklogs, day plan, undo of status changes. | kelvia.app |
| Vibe Kanban | Orchestrates 10+ coding agents in worktrees and reviews diffs. 28k stars. | vibekanban.com |

**What these startups do not have, and Shards can offer:**
- a first-class *personal to-do* experience (recurrence, Today, quick add);
- Markdown ownership;
- offline use.

Most of them target engineering teams only.

### 3d. Interaction patterns to adopt (cross-product consensus)

1. **Assignee ≠ delegate.** A human is accountable and an agent acts on their behalf (Linear).
   This maps onto mesh's `owner` and `claimed_by`.
2. **Visible session state:** working, awaiting input, error, done. Show it on the card, with an
   activity stream of thoughts, actions, questions and results (Linear AIG, Kanbrio).
3. **Agent guidance:** workspace- and project-level standing instructions that are passed to any
   agent (Linear guidance, Kanvas skills, mesh `AGENTS.md`-style notes).
4. **Ways to trigger an agent:** assignment, `@mention`, status/column transitions, triage rules,
   recurring tasks (Jira, Asana, Devin).
5. **Autonomy gates:** per-column pickup permissions; approval mode where agent writes become
   proposals; reversible changes; spend and credit caps (Agelo, Stellary, Notion).
6. **Actor-tagged audit:** every event records whether a human or an agent did it, which client,
   and on whose behalf (Ukolio, Kanbrio).
7. **Private-until-shared agent output** (Jira). This is useful for personal agents working in a
   shared project.

---

## 4. Agent memory and notes tools

| Tool | Model | Storage | Agent surface | Pricing | Stars | Relevance |
|---|---|---|---|---|---|---|
| **Mem0** | Fact extraction into a vector store, with optional graph | Managed or OSS | SDK, API | Free (10k adds, 1k retrievals) / $19 / **$249 for graph memory** | 67,235 | A memory API. No tasks, no files. |
| **Letta** (MemGPT) | Agent runtime with core, recall and archival tiers | Server. **Pivoting to Letta Code with git-backed context repositories** | SDK, ADE | Free / $20 Pro / $20 per seat Teams; plus usage | 25,155 | Its pivot supports files plus git as the memory substrate. |
| **Zep / Graphiti** | Temporal knowledge graph with validity windows | Neo4j, FalkorDB or Kuzu; Zep Cloud | API, Graphiti MCP | Free / Flex $125 ($104 annual) / $375 | 31,789 (Graphiti) | Good model for supersession and "what was true when". Mesh memories already have supersession. |
| **Basic Memory** | Markdown with wiki-links, observations and typed relations, plus semantic index | **Local Markdown files**; Obsidian-compatible | MCP | **OSS free locally; Cloud $15/seat/month** (50k notes per seat, 1k updates per day) | 4,231 (AGPL-3.0) | Closest business-model analogue: free locally, paid sync and teams. Sync is CLI push/pull with conflict files. |
| **GBrain** (Garry Tan) | Markdown "brain repo" as system of record, indexed into PGLite or Postgres+pgvector; typed graph; synthesis | Git repo plus DB | **Seven memory verbs** (`recall`, `remember`, `entity`, `synthesize`, `forget`, `context_pack`, `delta`); `--surface verbs/starter/full`; **remote MCP over Tailscale with OAuth/PKCE** (`gbrain mcp expose`) | OSS; hosted gbrain.io | 30,896 | Mesh's spec already contrasts itself with GBrain. GBrain's limited tool surfaces and its remote-MCP pattern are directly reusable ideas. |
| **Obsidian Local REST API v4** | Built-in MCP inside Obsidian | Vault | 20 tools, including heading/block patch; supports MCP revisions 2024-10-07 to **2026-07-28 (stateless)** | Free | 3,029 | Obsidian users already have vault MCP. Shards must offer more than file access. |
| **mcp-obsidian / MCPVault / cyanheads** | Filesystem or REST wrappers | Vault | MCP | Free | 4,479 (mcp-obsidian) | Same as above. |
| Supermemory | Hybrid memory API | Hosted, or self-hosted binary | API | Free / $19 / $399 | — | — |

Sources:
- Mem0, Letta, Zep: agenticwire.news/article/mem0-zep-letta-agent-memory;
  digitalapplied.com/blog/open-source-agent-memory-mem0-letta-zep-compared;
  devtoollab.com/blog/ai-agent-memory-platforms; wallabytoken.com/blog/p/ai-memory-pricing-compared.
- Basic Memory: basicmemory.com/pricing; docs.basicmemory.com/integrations/obsidian.
- GBrain: github.com/garrytan/gbrain; gbrain.fun.
- Obsidian MCP: github.com/coddingtonbear/obsidian-local-rest-api;
  contextbolt.com/blog/obsidian-mcp-claude.

**Takeaways:**
- **Memory products are converging on Markdown plus git as the durable layer**, with an index
  built on top:
  - Letta has pivoted to Letta Code.
  - GBrain keeps a brain repo as its system of record.
  - Basic Memory stores plain Markdown.
  - Wallaby recommends plain files for "operational truth".

  This supports the Shards substrate.
- **No memory tool also manages tasks.** Tokanban is the only product that pairs tasks with
  memory, and it is cloud-only and for coding only.
- **Vendor recall benchmarks disagree.** Mem0 reports 94.4 on LongMemEval; an independent run
  scored about 49.0. Do not compete on memory benchmarks. Compete on putting memory next to the
  work, on human-visible and editable memories, and on provenance.

---

## 5. Synthesis: positioning and product

### 5a. White space

```
                    Personal to-do quality (recurrence, Today, quick add)
                                  ▲
         Todoist, TickTick,       │        ← SHARDS target
         Things (cloud/closed)    │          (to-do parity + agents + memory, Markdown-owned)
                                  │
  Cloud-owned data ───────────────┼──────────────── User-owned Markdown / local-first
                                  │
   Linear/Jira/Asana/Notion,      │   Backlog.md, Beads, Taskmaster,
   agent-kanban startups          │   Basic Memory, GBrain, mesh, Obsidian Tasks/TaskNotes
                                  ▼
                    Agent/dev workflow only
```

### 5b. Positioning statement

> **Shards is the shared to-do list for you, your team and your agents.** It has Todoist-grade
> capture and planning, and it lives in plain Markdown that you own. Agents claim work, report
> progress and keep their memory and scratchpads in the same vault. You see all of it in one
> desktop app.

- **Category:** "multiplayer task manager for humans and agents".
- **Tagline options:**
  - "Your tasks. Your agents. Your files."
  - "One vault. Many hands."
  - "Every piece of work, in one place." (This one reuses the shard/fragment metaphor.)

### 5c. Target personas (in priority order)

1. **The agent operator (beachhead).** A solo builder or technical PM who runs 3–10 agents
   (Claude Code, Codex, Cowork), uses Todoist for life and Obsidian for notes, and keeps agent
   plans in TODO.md or Backlog.md.
   - Pain: work is split across 3–4 tools. Agents start sessions cold. The operator cannot see
     what each agent is doing.
   - The repo owner is this persona.
2. **The Markdown-native knowledge worker.** An Obsidian or Logseq user who is privacy-first,
   tried Obsidian Tasks or TaskNotes, and wants a Todoist-grade UI without leaving files.
   - Pain: Obsidian task plugins are capable but clunky, and do not work on mobile or outside
     Obsidian.
3. **The small team lead (2–15 people).** Delegates to humans and agents, finds Jira and Asana
   too heavy, and needs audit and accountability.
   - Pain: agents in Slack or chat leave no durable trail.
4. **The agent itself, as a non-human persona.** It needs:
   - a deterministic ready queue and atomic claim;
   - structured errors;
   - scoped identity;
   - recall of relevant memory;
   - a scratchpad that survives the session;
   - a small tool surface (compare GBrain `--surface verbs`).
5. **Later: households and personal collaborators.** Shared grocery or chore lists, as in
   Todoist and TickTick.

### 5d. Jobs to be done

- **Human jobs:**
  - "When something comes to mind, let me capture it in two seconds with dates, project and
    priority parsed, so I can forget it safely." (quick add)
  - "Each morning, show me what matters today: my tasks, my agents' tasks, and what is waiting on
    me." (Today, plus an "awaiting you" lane)
  - "Let me hand a task to an agent and stay accountable for it, seeing its progress and
    questions without reading logs." (delegate plus session state)
  - "Let me review what my agents remembered about me and my projects, and correct or delete it."
    (memory manager)
  - "Let me see and tidy agents' scratchpads so stale working state doesn't pile up." (scratch
    manager)
  - "Let me share a project with a colleague and their agents, and know who did what." (sync plus
    identity plus audit)
- **Agent jobs:**
  - "At session start, give me my ready work, the context for it, and the relevant memories in one
    call." (mesh `session-start`/`build-context` lens; GBrain `context_pack`)
  - "Let me claim work atomically, record progress, ask the human a question, and hand off."
- **Owner job:** "Keep my data as files I can grep, version and move, and never lock me in."

### 5e. Differentiators, and how defensible each one is

| # | Differentiator | Defensibility |
|---|---|---|
| 1 | **Todoist-grade to-do UX on plain Markdown you own** (local-first, offline, no account for solo use) | Medium-high. Incumbents will not move to files. Obsidian plugins lack UX polish and run only inside Obsidian. |
| 2 | **Tasks, memories, scratchpads and notes in one vault**, so agents recall context next to the work | High. No competitor combines all four (§2c, §4). |
| 3 | **Accountable delegation built in:** human assignee plus agent delegate, session states, actor-tagged audit, approval mode | Medium. Copies the best patterns (Linear, Ukolio, Stellary) but is local-first. |
| 4 | **Agents are free.** Seats are for humans only. | Medium. A pricing stance; Kanbrio does the same. |
| 5 | **One Rust core, many surfaces:** CLI, stdio MCP, remote MCP with OAuth, Tauri app | Medium. Speed and reliability; mesh already has atomic claim and derived readiness. |
| 6 | **Interop:** imports and reads Obsidian Tasks emoji and Dataview fields and TaskNotes frontmatter; Todoist, TickTick and Things importers | Medium. Lowers switching cost. |

### 5f. Parity list to "challenge Todoist", ranked

The ranking follows mesh's no-daemon invariant: anything time-triggered needs the Tauri app
running or the sync server.

**MVP (desktop prototype; replaces Todoist's free tier for a single user and their agents):**
1. Quick Add with NLP. Tokens: `#project`, `/section`, `@label`, `p1`–`p4`, `+assignee` (human or
   agent), natural dates, `every`/`every!` recurrence, `{deadline}`.
2. Inbox, Today (including overdue), Upcoming (7-day strip).
3. Projects, sections, subtasks (`parent`), labels, priorities P1–P4. This changes mesh's
   3-level priority.
4. Due date and time, plus recurrence with roll-forward on completion.
5. List and Board layouts. Drag and drop to reorder and change status.
6. Task detail pane with a Markdown description, activity and dependencies (blocked by /
   blocking).
7. Command palette (⌘K), keyboard-first navigation, global quick-add hotkey (Tauri).
8. Search across tasks, notes and memories (mesh `search`).
9. **Agent layer:** assignee vs delegate; claim, release and finish shown on the card; agent
   session state; per-task activity log tagged human or agent.
10. **Memory manager:** browse, edit, supersede and expire memories by agent and scope. **Scratch
    manager:** per-agent sessions with a staleness view.
11. Completed list (Logbook) and undo. Undo matters because mesh deletes with a hard `unlink`
    (`mesh/README.md:38`). The app should add a trash folder.
12. Light and dark theme, with polish comparable to Things and Todoist.
13. Due-time desktop notifications while the Tauri app or tray is running. This matches Todoist's
    free-tier automatic reminders. The no-daemon rule applies to the CLI; the desktop app is the
    long-running process.

**v1 (sync, multiplayer and the power-user tier; Todoist Pro and Business equivalent):**
1. Filter query language with saved filters. Keep a Todoist-compatible subset (`& | ! ()`,
   `today`, `overdue`, `7 days`, `no date`, `#`, `##`, `@`, `p1`, `assigned to:`, `search:`).
   Add Filter Assist via the user's own agent over MCP.
2. Calendar layout with time-blocking, task durations, deadlines distinct from scheduled date, and
   start dates.
3. Custom, relative and recurring reminders. Push via the sync server when the app is closed.
4. Comments and threaded @mentions of humans and agents. Agents receive their mentions as
   triggers.
5. **Remote sync and hosted remote MCP with OAuth 2.1, PKCE and dynamic client registration**,
   so cloud agents (claude.ai connectors, ChatGPT, Cowork scheduled tasks) can reach the vault.
6. Shared projects, invites, roles (owner, member, guest, agent), autonomy policies per project
   or column (agent pickup on or off; approval mode), audit log.
7. Agent guidance per workspace and project.
8. Triggers: on assignment, on status change, on a recurring schedule.
9. Templates, and project and section descriptions.
10. Importers: Todoist (API/CSV), TickTick, Things (JSON/AppleScript), Obsidian Tasks and
    TaskNotes, Backlog.md, Beads JSONL.
11. Attachments via the assets space. Light productivity stats (completed per day or week).

**Later:**
- Mobile capture apps: iOS and Android, share sheet, widgets, watch. This is a **known parity
  gap**, and Todoist and Things win here until it ships. Tauri 2 mobile is a candidate.
- Web app; email-to-task; voice capture like Ramble; location reminders.
- Calendar two-way sync (ICS or CalDAV); GitHub, Linear and Slack bridges; Zapier.
- AI assists through MCP sampling or the user's own key: break down a task, rewrite it, triage the
  inbox.
- Team workspaces, SSO, SCIM, data residency; self-hosted server.
- Karma-style gamification and Insights.
- Explicitly **not** planned: Pomodoro, habits, Eisenhower matrix (TickTick territory), and
  sprints or cycles (Linear territory).

---

## 6. Pricing landscape and suggested business model

### 6a. Competitor pricing

| Product | Free | Individual | Team | AI / agent metering |
|---|---|---|---|---|
| Todoist | Beginner (5 projects, 3 filters, 7-day history) | Pro $7/month or $60/year | Business $10/user/month, $8 billed annually | Assist on Pro; Ramble limited on free |
| Things 3 | No | One-time, about $80 for Mac + iPhone + iPad; sync free | — | None |
| TickTick | Yes | $35.99/year or $2.99/month | — | — |
| Linear | 250 issues, 2 teams, agents included | — | Basic $10, Business $16 per user, annual | Coding sessions: provider tokens plus $0.25 per 20 minutes |
| Asana | Personal (2 seats) | — | Starter $10.99, Advanced $24.99 (Capterra) | AI Studio credits |
| Notion | Free | Plus $10/member | Business $20/member | Custom Agents: $10 per 1,000 credits |
| Jira | — | — | Standard and above | Rovo credits from 2026-12-03 |
| Obsidian | App free | Sync $4 / $8 per month (annual) | Commercial licence $50/user/year (optional) | — |
| Anytype | 100 MB remote | $4 / $8 / $16 per month (storage tiers) | Business tier | — |
| Basic Memory | OSS, local | — | Cloud $15/seat/month | — |
| Mem0 / Zep / Letta | Free tiers | $19 / $125 / $20 | — | Metered by adds, credits or agents |
| Kanbrio | — | — | Flat per workspace; **agents and guests free** | Hard-capped credits; BYO key means $0 |
| Backlog.md, Beads, Taskmaster, Vibe Kanban | OSS free | — | Vibe Kanban team cloud | — |

### 6b. Recommended model: local-first and free; pay for sync, reach and teams

| Tier | Price (suggested) | Includes |
|---|---|---|
| **Local** (free forever) | $0 | Desktop app, CLI, stdio MCP, unlimited tasks, projects and agents on one machine. Sync your own way with git, iCloud or Syncthing, unsupported. Open-source core (MIT, matching mesh: `mesh/Cargo.toml:7`). |
| **Personal Sync** | $5/month or $48/year | Encrypted multi-device sync. 12-month version history and trash. **Hosted remote MCP endpoint with OAuth for cloud agents.** Mobile capture when it ships. Web read-only view. |
| **Team** | $8/human seat/month, billed annually ($10 monthly) | Shared projects, roles, agent identities with scoped tokens, approval policies, audit log, guests free. **Agents free** (fair-use rate limits per workspace). |
| **Self-host / Enterprise** | Licence or contract | Sync server on your own infrastructure, SSO/SCIM, data residency. Possibly a source-available or AGPL server, as Basic Memory does. |

**Why this model:**
- **It matches the local-first precedents users already accept:** Obsidian Sync, Anytype and
  Basic Memory.
- **Personal Sync undercuts Todoist Pro** ($48 against $60 a year), and **Team matches Todoist
  Business** ($8 per seat billed annually), while adding agent features.
- **Agents create value only when they can reach the vault.** Cloud-hosted agents cannot reach a
  local stdio server: Claude Desktop needs `mcp-remote`, and GBrain needs a Tailscale funnel. A
  hosted remote MCP endpoint is therefore a concrete reason to pay.
- **Do not resell model compute.** Notion credits, Rovo credits, Linear sandbox billing and
  Mem0's $249 graph tier are all places where buyers push back. Users bring their own agent and
  model.

---

## 7. Name check: "Shards"

| Collision | Type | Severity | Source |
|---|---|---|---|
| **Crystal `shards`**: dependency manager for the Crystal language, distributed with Crystal, binary named `shards` | Developer CLI | **High for a CLI binary name** (PATH clash for Crystal users; confusing search results) | crystal-lang.org/reference/master/man/shards; github.com/crystal-lang/shards |
| **"Shards" (mitsukiyouko555)**: a Tauri/Rust plot-building app for writers | Desktop app on the same stack | Medium (different domain, identical tech stack, small project) | mitsukiyouko555.github.io/shards-app |
| fragcolor-xyz/shards: programming language (C++/Rust) | Dev tool | Low–medium | github.com/fragcolor-xyz/shards |
| shards.market: NEAR token launchpad | Crypto | Low (brand noise) | docs.shards.market |
| shardsbot.app: Discord bot | Consumer software | Low–medium | shardsbot.app |
| shards-dev/Shards: rollup deployment | Web3 dev tool | Low | github.com/shards-dev/Shards |
| Shards / Shards Online / Shards of Infinity | Games | Low (app store noise) | App Store, Google Play, Legacy Games |
| Devpost "Shards": network-security hackathon project | Hackathon | Negligible | devpost.com/software/shards |
| "Sharding", the database term | Generic | SEO noise; "shards" alone is hard to rank | — |

**Package registries (checked 2026-10-15):**
- `shards` is **taken** on crates.io: 0.1.1, rust bindings, low activity.
- `shards` is **taken** on npm: an Express server.
- `shards-cli` (crates.io) and `@shards/cli` (npm) were not found, so they look free.

**Domains:**
- `shards.app` and `shards.dev` resolve (A records present), so assume they are taken.
- `shards.so`, `getshards.com` and `shards.md`: no A record observed. This is **not** evidence that
  they are available. Run WHOIS.
- `useshards.com` resolves.

**Trademark:** I did not search. Search the following:
- USPTO TESS/TMSearch and EUIPO eSearch for "SHARDS" in Nice **classes 9** (software) **and 42**
  (SaaS).
- The same registers for "SHARD".
- Germany's DPMA, because the owner is in the EU.

**Recommendations:**
1. Brand: **Shards**, always with a descriptor in copy, such as "Shards — tasks for humans and
   agents".
2. CLI binary: **keep `mesh`** as the engine and CLI name ("Shards, powered by mesh"). Do not
   ship a binary called `shards`. The singular `shard` is also taken: on crates.io (0.1.2, last
   updated 2017, dormant) and on npm (1.1.0). A binary named `shard` is possible but cannot use
   the registry name.
3. Crates: `shards-core`, `shards-app` (check availability), or keep the `mesh-*` crate names
   internally.
4. Domains to check first: `shards.md` (fits the Markdown story), `getshards.app`, `shards.so`.

---

## 8. Risks and architecture signals from the market

1. **Multi-writer sync of plain files is hard.**
   - Beads moved its source of truth from JSONL in git to **Dolt**, because merge pain from
     concurrent agents and branches was the problem.
   - Basic Memory Cloud uses push/pull with conflict files.
   - Logseq Sync warned that it overwrites whole pages.
   - Anytype warns against putting its SQLite database in cloud-synced folders.

   Shards' sync design must handle concurrent agent writes per file. Mesh already has per-file
   O_EXCL locks for claims. Hidden per-file CRDT or OT metadata, or a server-arbitrated claim
   lease, is likely needed.
2. **"MCP is a legacy, optional adapter."** Backlog.md's manifesto makes the CLI canonical.
   - The MCP spec is still changing: Obsidian's plugin already serves the stateless 2026-07-28
     revision next to the 2024-10-07 to 2025-11-25 revisions.
   - Keep CLI, MCP and app as thin layers over one Rust core, with JSON output.
   - Ship small tool surfaces, as GBrain's `verbs`/`starter`/`full` surfaces do.
3. **Incumbents can add the agent layer quickly.** Todoist already shipped MCP plus CLI skills;
   TickTick shipped MCP. Shards' defence is Markdown ownership plus the combined memory vault, not
   agent access itself.
4. **The mobile gap.** Capture on the phone is where Todoist and Things keep users. Without
   mobile, Shards stays a desktop and power-user tool. Plan Tauri 2 mobile, or a thin web capture
   PWA backed by the sync server.
5. **Scope creep.** Trying to match Todoist, Linear and Mem0 at once risks shipping none of them
   well. Stay within the §5f tiers.
6. **Trust and identity.** Until sync ships, `owner`/`claimed_by` are honour-system strings
   (`mesh/README.md:25-33`). Market multiplayer only after verified identities exist.
7. **Crowded agent-kanban space.** Eight or more startups are active. Differentiate on personal
   to-do quality and file ownership, not on "agents on a board".

---

## 9. Concrete recommendations

1. **Lead with the to-do app, not the agent board.**
   - The MVP must feel like Todoist or Things on day one: quick add, Today, Upcoming,
     recurrence.
   - Agents appear as a natural extension: assignee/delegate, session state, memory pane.
2. **Adopt Linear's delegation model:**
   - `assignee` (human, accountable) plus `delegate` (agent) on every task;
   - session states `working | awaiting_input | error | done`;
   - an activity stream with actor type.

   Map mesh's `owner` to the assignee and `claimed_by` to the delegate's claim.
3. **Extend the task frontmatter** before the UI work: `due`, `scheduled`, `start`, `deadline`,
   `recurrence` (rrule plus `every!` semantics), `section`, `parent`, `priority` (1–4), `labels`,
   `assignee`, `delegate`, `duration`, `reminders`. Keep unknown keys round-tripping, as mesh
   already guarantees.
4. **Treat memories and scratch as first-class UI features.** They are the moat. Provide an
   editable memory list with provenance, supersession and expiry, and a scratch view per agent
   session.
5. **Treat sync plus remote MCP with OAuth as one paid feature** whose value is "your agents can
   reach your vault from anywhere, safely". This also closes the identity gap.
6. **Price:** free locally, $5/month Sync, $8/human seat Team, agents free, no compute
   resale.
7. **Name:** brand "Shards", CLI `mesh`. Run the trademark search before any public
   launch.
8. **Import paths are growth levers:** Todoist importer, Obsidian Tasks/TaskNotes readers,
   Backlog.md and Beads importers. Make these v1.

---

## 10. Source index

**Todoist**
- Pricing: https://www.todoist.com/pricing
- Plans FAQ: https://www.todoist.com/help/account-and-billing/plans/todoist-plans-pricing-and-billing-faq-Vq2z0HWL6
- Business pricing update: https://www.todoist.com/help/account-and-billing/plans/todoist-business-plan-pricing-update-dF5in65YM
- Get started with Pro: https://www.todoist.com/help/account-and-billing/plans/get-started-with-todoist-pro-K3fDksPPh
- Todoist Assist: https://www.todoist.com/help/todoist/todoist-and-ai/introduction-to-todoist-assist-KgPP22q5O
- 2026 changelog: https://www.todoist.com/help/todoist/product-updates/2026-changelog-HD3jJAtLd
- Filters: https://www.todoist.com/help/articles/introduction-to-filters-V98wIH
- Search: https://www.todoist.com/help/articles/introduction-to-search-fAfiDSAp
- Dates: https://www.todoist.com/help/todoist/features/introduction-to-dates-and-time-q7VobO
- Recurring dates: https://www.todoist.com/help/todoist/features/introduction-to-recurring-dates-YUYVJJAV
- Features: https://www.todoist.com/features
- Developers and MCP: https://developer.todoist.com/ ; https://github.com/Doist/todoist-mcp
- Connect an AI assistant: https://www.todoist.com/help/todoist/todoist-and-ai/connect-todoist-to-an-ai-assistant-xMSzFfHng
- Users and revenue: https://www.whobrands.com/companies/doist/brands ; https://www.operatorbook.dev/stories/todoist-revenue-100m-number-founder-calls-boring

**Other task managers**
- Things 3: https://www.itechguides.com/things-3-review-features-pricing-pros-cons/ ; https://apps.apple.com/us/app/things-3/id904237743 ; https://www.macrumors.com/2026/09/14/things-3-updated-for-ios-27/ ; https://www.asianefficiency.com/task-management/things-3-review/
- TickTick: https://ticktick.com/upgrade ; https://www.capterra.com/p/170641/TickTick/pricing/ ; https://help.ticktick.com/articles/7438129581631995904
- Asana: https://asana.com/pricing/ ; https://www.capterra.com/p/184581/Asana-PM/pricing/ ; https://help.asana.com/s/article/ai-teammates?language=en_US ; https://investors.asana.com/news-releases/news-release-details/asana-announces-new-ai-teammates-collaborative-agents-deliver
- Notion: https://www.notion.com/pricing ; https://www.notion.com/blog/introducing-custom-agents ; https://www.notion.com/product/agents ; https://www.notion.com/releases/2025-09-18

**Agent-enabled work trackers and agent runtimes**
- Linear: https://linear.app/pricing ; https://linear.app/docs/assigning-issues ; https://linear.app/developers/aig ; https://linear.app/developers/agent-interaction ; https://linear.app/developers/agents ; https://linear.app/docs/agents-in-linear ; https://linear.app/changelog
- GitHub: https://github.blog/news-insights/company-news/welcome-home-agents/ ; https://github.blog/changelog/2025-10-28-a-mission-control-to-assign-steer-and-track-copilot-coding-agent-tasks/ ; https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/kick-off-a-task
- Jira / Rovo: https://support.atlassian.com/jira-software-cloud/docs/collaborate-on-work-items-with-ai-agents/ ; https://community.atlassian.com/forums/Jira-articles/Introducing-Agents-in-Jira/ba-p/3194583 ; https://www.atlassian.com/blog/rovo/ai-agents-in-jira
- Codex: https://developers.openai.com/codex/integrations/linear
- Devin: https://docs.devin.ai/integrations/linear
- Claude Cowork: https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork ; https://claude.com/product/cowork ; https://venturebeat.com/technology/anthropic-launches-cowork-a-claude-desktop-agent-that-works-in-your-files-no

**Agent kanban startups**
- https://stellary.co/ai-kanban-board/
- http://kanbrio.com/
- https://www.getkanvas.ai/
- https://tokanban.com/
- https://www.ukolio.com/
- https://agelo.app/
- https://loopertask.com/
- https://kelvia.app/
- https://www.vibekanban.com/

**Markdown-native task tools**
- Backlog.md: https://github.com/MrLesk/Backlog.md
- Beads: https://github.com/steveyegge/beads ; https://yegge.ai/essays/introducing-beads-a-coding-agent-memory-system/
- Taskmaster: https://docs.task-master.dev ; https://github.com/eyaltoledano/claude-task-master
- TaskNotes: https://tasknotes.dev/core-concepts/
- Obsidian Tasks: https://publish.obsidian.md/tasks/Reference/Task+Formats/Tasks+Emoji+Format

**Agent memory and Obsidian**
- Mem0, Letta, Zep comparisons: https://www.agenticwire.news/article/mem0-zep-letta-agent-memory ; https://www.digitalapplied.com/blog/open-source-agent-memory-mem0-letta-zep-compared ; https://devtoollab.com/blog/ai-agent-memory-platforms ; https://wallabytoken.com/blog/p/ai-memory-pricing-compared
- Basic Memory: https://basicmemory.com/pricing ; https://docs.basicmemory.com/integrations/obsidian
- GBrain: https://github.com/garrytan/gbrain ; https://gbrain.fun/
- Obsidian MCP: https://github.com/coddingtonbear/obsidian-local-rest-api ; https://contextbolt.com/blog/obsidian-mcp-claude/
- Obsidian pricing and Sync: https://obsidian.md/pricing ; https://obsidian.md/help/sync/plans

**Local-first benchmarks**
- Anytype: https://anytype.io/pricing/
- Logseq: https://blog.logseq.com/how-to-setup-and-use-logseq-sync/

**Name check**
- https://crystal-lang.org/reference/master/man/shards/index.html
- https://github.com/fragcolor-xyz/shards
- https://mitsukiyouko555.github.io/shards-app/
- https://docs.shards.market/
- https://shardsbot.app/
- https://github.com/shards-dev/Shards
- crates.io and npm registry APIs (queried 2026-10-15)

**Local files**
- `README.md` (lines 5-6, 25-41, 251-306)
- `.spec/product.md` (lines 14-62)
- `…/scratchpad/ref/obsidian-taskui/README.md`
