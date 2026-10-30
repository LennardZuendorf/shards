---
type: entrypoint
scope: product
children:
  - product-roadmap.md
  - product-market.md
  - product-hosting.md
  - product-cli.md
  - features/shards-rebrand/product.md
  - features/task-model-v2/product.md
  - features/desktop-app/product.md
  - features/sync/product.md
  - features/remote-mcp/product.md
  - features/release-pipeline/product.md
updated: 2026-10-30
---

# Shards — Product

Shards is a task manager that humans and their agents share. A Todoist-grade desktop app, the
`shards` CLI and the `shards-mcp` server all work on one local folder of Markdown files. That
folder holds tasks, notes, agent memories, agent scratchpads and assets. Solo use is free,
offline and needs no account. A paid server adds multi-device sync, a hosted MCP endpoint for
cloud agents and, later, shared team workspaces.

Citations `(research: <name> §n)` and `DECISIONS Dn` across `.spec/` resolve to
[docs/research/](../docs/research/README.md).

**Category (D2, long term):** the multiplayer task manager for humans and agents — backed by
Markdown you own. **Public tagline (Now and Next):** "Todoist-grade tasks for you and your
agents — on Markdown you own." "Multiplayer" enters public copy only at the Team launch.

**Formerly mesh.** Shards grows out of mesh, the Rust CLI and stdio MCP core that is already
delivered: five spaces, atomic claims, a live dependency graph, memories and 40 MCP tools. All
of it stays true unless § Non-goals reverses it. Peers: [tech.md](tech.md), [design.md](design.md),
[plan.md](plan.md). Branches: roadmap and KPIs ([product-roadmap.md](product-roadmap.md)), market
([product-market.md](product-market.md)), hosting ([product-hosting.md](product-hosting.md)), CLI ([product-cli.md](product-cli.md)).

## Story

Agent operators run several agents beside their own to-do list, with work spread across Todoist,
Obsidian, TODO.md files and each agent's private memory. Agents start cold, and the operator
cannot see what any agent is doing or believes. MCP access is table stakes (research: market §0,
§3c). No product combines Todoist-grade task UX, local-first Markdown and agent memory and scratch
in the same vault (research: market §2c, §5a). mesh had the agent core but no to-do fields and no
UI. Shards adds both, so one person runs their whole day, and their agents', from one app.

## Target users

In priority order. Detail and jobs to be done: [product-market.md](product-market.md) § Personas.

1. **Agent operator (beachhead):** a solo builder or technical PM who runs 3–10 agents. This is the owner.
2. **Markdown-native knowledge worker:** an Obsidian or Logseq user who wants a real task app.
3. **Small-team lead:** 2–20 people, delegating to humans and agents, who needs to know who did what.
4. **The agent:** a first-class non-human user of the CLI and MCP.

## Requirements

Feature docs cite these as `product.md R1`–`R12`. The numbers are stable.

1. **R1 Task management parity.** Shards SHALL cover every MVP row of the parity matrix
   ([product-roadmap.md](product-roadmap.md) § Todoist parity matrix). Quick add parses project,
   section, label, priority, assignee, dates, recurrence and deadline. Views: Inbox, Today,
   Upcoming. Projects have sections and subtasks; tasks have labels, four priorities (urgent,
   high, normal, low), a due date with optional time, a separate deadline, and recurrence from
   due or from completion. List and board layouts, manual order, a completed log with reopen,
   project management, bulk actions and in-window reminders. *Test:* at the Now exit, every MVP
   parity row reads "have", each by the evidence its matrix row names ([plan.md](plan.md) § Now
   exit review).
2. **R2 Accountable delegation.** Every task SHALL have one accountable assignee (human or agent)
   and MAY have a delegate working it. A claim is atomic. Agent work shows one session state:
   queued, working, needs input, error or done. Every write records its actor. *Test:* when two
   claims race, exactly one wins and the loser gets a distinct conflict result.
3. **R3 Memory and scratch management.** In the app, humans SHALL browse, filter (agent, scope,
   kind, project), edit, supersede, expire and forget memories, and read and clear scratchpads.
   Recall SHALL show why each item ranked. Nothing is deleted automatically. *Test:* everything
   the CLI lists appears in the app, and every human action changes the file on disk.
4. **R4 Markdown is truth.** Every entity SHALL be one Markdown file with frontmatter in the
   user's folder. The index, the sync state and the server copy are derived or replicated, and
   can be rebuilt from the files. Unknown keys round-trip, and hand edits appear without an
   import. *Test:* deleting every derived store loses no data.
5. **R5 Local-first.** Everything except sync, hosted MCP and multiplayer SHALL work offline, with
   no account. Local commands MUST NOT depend on the app, on sync or on the network. *Test:* the
   CLI and app suites pass with networking off.
6. **R6 Sync** *(Next)*. A subscriber SHALL sync one vault across devices without losing a write.
   Edits merge field by field, an edit beats a concurrent delete, an unmergeable change is kept as
   a recoverable conflict copy, and the server decides claims. *Test:* KPI K12
   ([product-roadmap.md](product-roadmap.md) § KPIs) passes with zero lost writes.
7. **R7 Remote MCP with OAuth** *(Next)*. Cloud agents SHALL reach a synced vault through a hosted
   MCP endpoint after OAuth consent. Headless agents use personal access tokens. The actor comes
   from the grant, never from arguments. Scopes are read or write per space. *Test:* a call that
   names another identity as claimer, releaser or author is refused with kind `identity_mismatch`.
8. **R8 Multiplayer** *(Later)*. Teams SHALL share workspaces with verified human and agent
   members. A workspace has roles, invites, shared projects, comments and @mentions,
   notifications, an activity feed and presence. Agents never cost a seat.
9. **R9 Desktop app.** Shards SHALL ship a keyboard-first desktop app, macOS first, with Inbox,
   Today, Upcoming, Projects (list and board), Labels, Search, Agents, Memories, Scratchpads and
   Notes; a command palette, quick add, a detail pane, light and dark themes. Changes from any
   writer appear within 1 s with no reload; destructive actions are undoable in the session.
10. **R10 CLI and stdio MCP retained.** The `shards` CLI and `shards-mcp` SHALL stay first-class.
    Every app capability an agent may use is on both, with identical results. Delete, forget,
    clear and restore are never exposed over agent MCP; they stay operator verbs on the CLI and
    the app. CLI cold start stays under 10 ms ([tech.md](tech.md) § Performance Budgets).
11. **R11 Spaces and sandbox (carried over).** The five spaces SHALL stay configuration, not
    layout. An existing vault is exposed as it is. A foreign file changes only on explicit adopt.
    No path ever leaves the vault.
12. **R12 One name, safe upgrade.** Everything the user sees SHALL say Shards: `shards`,
    `shards-mcp`, `shards_*`, `SHARDS_*`, `~/.shards`. For one release, `MESH_*` and `~/.mesh` are
    read when the Shards equivalent is absent. Tool names get no aliases.

## Design principles

1. **Files are the product.** In any storage debate, the readable, editable Markdown file wins.
2. **Lead with the to-do app.** It feels like Todoist on day one; agents extend it (research: market §9).
3. **Humans are accountable, agents act.** Linear's assignee and delegate split (research: market §3a).
4. **Local is complete; the server adds reach.** The server adds devices, cloud agents and people.
5. **One core, many surfaces.** The CLI, stdio MCP, app and hosted MCP are thin layers. Parity is tested.
6. **Destructive power stays with humans.** No delete, forget, clear or restore over agent MCP.
7. **Surface growth is earned.** New fields, verbs and tools need a spec change and owner sign-off.
8. **Agents are free; the compute is yours.** No per-agent price and no resold model compute.

## Features

| Feature | Horizon | Covers |
|---|---|---|
| **[features/shards-rebrand/](features/shards-rebrand/product.md)** | Now | One name everywhere, plus the one-release mesh fallback (R12) |
| **[features/task-model-v2/](features/task-model-v2/product.md)** | Now | Todoist-parity fields, recurrence and date filters in the CLI and MCP (R1, R2, R4) |
| **[features/desktop-app/](features/desktop-app/product.md)** | Now | App prototype covering tasks, agents, memories, scratch, notes and live refresh (R1–R3, R9) |
| **[features/release-pipeline/](features/release-pipeline/product.md)** | Now, implemented locally; CI and activation pending | Tested CLI/MCP and desktop distribution, custom Homebrew tap, prepared server release target; first Mac release unsigned |
| **[features/sync/](features/sync/product.md)** | Next | Personal multi-device sync with no lost writes (R6) |
| **[features/remote-mcp/](features/remote-mcp/product.md)** | Next | Hosted MCP for cloud agents: OAuth, tokens, scopes (R7) |

**Arcs with no folder yet:** app-polish (Next; outcomes AP1–AP12 in the roadmap, AP11
withdrawn), billing (18b, Next; [product-hosting.md](product-hosting.md)), capture (19b, Next:
email-to-task, a capture + review PWA, an iOS Shortcut); multiplayer, web-mobile (target Q4
2027), integrations, e2ee (Later). [plan.md](plan.md)
owns the order and gates. Delivered mesh arcs: [tech-surfaces.md](tech-surfaces.md).

## Implementation phases

| Horizon | Arcs | Exit criteria |
|---|---|---|
| **Now** (Q4 2026 – mid-Jan 2027) | shards-rebrand, task-model-v2, desktop-app | For 30 consecutive days the owner creates and completes every desktop-captured personal task and every agent task in Shards. Todoist is used only for phone capture, each use is logged, and the count stays within KPI K1. All MVP parity rows read "have". K20 is measured. |
| **Next** (mid-Jan – Jun 2027) | app-polish, sync (starts only when K20 is met), billing, remote-mcp, capture | All v1 rows read "have". Personal Sync is paid and generally available, with every hosted-service commitment met. Claude and ChatGPT connect over OAuth. |
| **Later** (H2 2027+) | multiplayer (after paying subscribers reach the KPI K9 threshold), web-mobile, integrations, e2ee | Team plan generally available; native mobile apps ship |

Target dates and the slip rule: [product-roadmap.md](product-roadmap.md) § Dated milestones.
**Now exit review (day 30, target 2027-01-12).** If the criteria are not met, list each blocker
with the arc that owns it. Blockers of ≤ 2 weeks are fixed in a follow-up unit of feature 16.
Larger blockers re-scope app-polish before 17 starts. No Next arc starts until the review is
recorded in [product-roadmap.md](product-roadmap.md) § Decision log.

## Success metrics

| Metric | Target |
|---|---|
| Capture: shortcut to task file on disk | Quick add open < 100 ms (engineering budget); file written: KPI K4 |
| Freshness: agent write visible in open app | KPI K4 |
| Parity coverage | 100 % MVP rows at Now exit; 100 % v1 rows at Next exit |
| Sync integrity | KPI K12: 0 lost writes; every conflict loser recoverable |
| Hosted MCP identity | 0 calls accepted with a spoofed actor argument (claimer, releaser, author) |
| Adoption, retention and revenue | North star and K1–K22 in [product-roadmap.md](product-roadmap.md) § KPIs |

## Non-goals

- No CRDT as the record store, and no git sync. Live co-editing is deferred.
- No resold LLM compute, no built-in model, and no seats or per-agent pricing for agents.
- No Pomodoro, habits, Eisenhower matrix, sprints or cycles. No automatic memory deletion or touch-on-read.
- No sequential ids, job queue, synthesis layer or knowledge-graph store.
- No identity enforcement on one machine. Locally, identity is a spelling convention; the server enforces it.
- **Now: one machine per vault.** Agents on other machines reach it through the local CLI over
  SSH only. Syncing the folder with other tools is at the user's own risk.

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

## Open questions

1. **Trademark.** Knockout search (EUIPO, USPTO, DPMA; classes 9, 42) and domain check at gate 14; full clearance before the public beta.
2. **Dates.** Scheduled/start dates, durations, time-blocking: decide in app-polish with the calendar.
3. *Resolved 2026-10-15:* measurement. No client telemetry → [product-roadmap.md](product-roadmap.md) § Measurement.
4. **Hosted OAuth.** Built-in authorization server first (current lean), or an external IdP first?
5. **Server licence.** Decide before feature 18 starts. Recommended: AGPL-3.0 for `crates/shards-server`,
   MIT for core, CLI and app, so self-host stays free and a hosted clone must publish its changes.

## Resolved decisions

The full dated log is in [product-roadmap.md](product-roadmap.md) § Decision log.

- **Shards pivot (2026-10-15).** mesh becomes Shards (D1–D6). The owner chose `shards` as the
  binary name against the research advice.
- **Delegation (2026-10-15).** `owner` is the accountable assignee and `claimed_by` is the
  delegate. Session states on the wire: `queued`, `working`, `needs_input`, `error`, `done`.
- **Remote identity (2026-10-15, D4 refinement).** Actor arguments (`claimer`, release `owner`,
  author `owner`, write `agent`) must equal the token actor. The assignee `owner` on task create
  and update may name any active workspace member. A refusal is tool error `identity_mismatch`.
- **Rust core (2026-09); toolset (2026-07).** One binary, five spaces, no daemon; GBrain, Beads rejected.
