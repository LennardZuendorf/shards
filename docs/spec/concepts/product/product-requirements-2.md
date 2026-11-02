---
type: concept
updated: 2026-11-02
---

# product: Requirements (2/3)

1. **R1 Task management parity.** Shards SHALL cover every MVP row of the parity matrix
   ([product-roadmap.md](../roadmap/README.md) § Todoist parity matrix). Quick add parses project,
   section, label, priority, assignee, dates, recurrence and deadline. Views: Inbox, Today,
   Upcoming. Projects have sections and subtasks; tasks have labels, four priorities (urgent,
   high, normal, low), a due date with optional time, a separate deadline, and recurrence from
   due or from completion. List and board layouts, manual order, a completed log with reopen,
   project management, bulk actions and in-window reminders. *Test:* at the Now exit, every MVP
   parity row reads "have", each by the evidence its matrix row names ([plan.md](../../flows/delivery/README.md) § Now
   exit review).
2. **R2 Accountable delegation.** Every task SHALL have one accountable assignee (human or agent)
   and MAY have a delegate working it. A claim is atomic. Agent work shows one session state:
   queued, working, needs input, error or done. Every write records its actor. *Test:* when two
   claims race, exactly one wins and the loser gets a distinct conflict result.
   In operator-enrolled local projects, Codex and Claude Code agents SHALL register or
   resume a task, verify a claim, record intent and material progress, expose waits/errors,
   and leave a checkpoint before yielding. A turn ending never implies task completion.
   Shared mandatory skills and supported host guards enforce this cooperation contract.
   Independently executing delegates bind linked child tasks; forks do not inherit a binding.
   Agents record the question or error, release their execution claim when handing off,
   and record evidence and the next actor before yielding. A completed deliverable needs
   evidence and an outcome before finish. Local identity remains a spelling convention.
   See the [implemented lifecycle contract](../../tech/surfaces/tech-surfaces-local-agent-harness-1.md#local-agent-harness) and
   [pending activation checks](../../flows/delivery/plan-feature-sequence-2.md#local-harness-activation-follow-up).
3. **R3 Memory and scratch management.** In the app, humans SHALL browse, filter (agent, scope,
   kind, project), edit, supersede, expire and forget memories, and read and clear scratchpads.
   An agent SHALL likewise curate its own memory over MCP: `shards_memory_supersede` retires a
   belief in favour of a replacement and `shards_memory_forget` removes one outright, and memory
   is the one space where an agent-facing removal verb is allowed — a wrong belief must be
   retirable, or memory only ever accumulates. Every other removal verb stays off the agent
   surface. Recall SHALL show why each item ranked. Nothing is deleted automatically. *Test:*
   everything the CLI lists appears in the app, and every human action changes the file on disk.
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
   ([product-roadmap.md](../roadmap/README.md) § KPIs) passes with zero lost writes.
7. **R7 Remote MCP with OAuth** *(Next)*. Cloud agents SHALL reach a synced vault through a hosted
   MCP endpoint after OAuth consent. Headless agents use personal access tokens. The actor comes
   from the grant, never from arguments. Scopes are read or write per space. *Test:* a call that
   names another identity as claimer, releaser or author is refused with kind `identity_mismatch`.

Parent: [Section index](README.md).
