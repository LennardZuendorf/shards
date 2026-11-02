---
type: concept
updated: 2026-11-02
---

# product-roadmap: Decision log

## Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07 | Keep and extend mesh. Reject GBrain and Beads as replacements. | Both make a database the truth, against Markdown-as-truth |
| 2026-08 | No notes-app coupling; `[core].vault_path` is canonical | It was never a code dependency |
| 2026-09 | Rust rewrite: one binary, five spaces, daemon removed | Agent hot loops pay startup on every call |
| 2026-09 | Rename shards → mesh, with no aliases | **Superseded 2026-10-15** |
| 2026-10-15 | **D1** Name: Shards everywhere (`shards`, `shards-mcp`, `shards_*`, `SHARDS_*`, `~/.shards`), with a one-release `MESH_*` / `~/.mesh` fallback and no tool aliases | The owner's explicit choice. The research advice to keep `mesh` as the CLI name is recorded as a risk. |
| 2026-10-15 | **D2** Positioning: the multiplayer task manager for humans and agents, backed by Markdown you own | MCP access alone is table stakes (research: market §0) |
| 2026-10-15 | **D3** Personas: agent operator (beachhead), Markdown-native worker, small team, the agent | Research: market §5c |
| 2026-10-15 | **D4** Delegation: owner is the accountable assignee and claimed_by is the delegate. An actor on every write. | Category consensus (Linear) |
| 2026-10-15 | **D5** Pricing: Local free; Personal Sync $5/month or $48/year with hosted MCP; Team $8 per human seat; agents free; self-host free; no compute resale | Research: market §6 |
| 2026-10-15 | **D6** Core delete stays hard. The app undoes through restore. Vault trash comes with sync. **Amended 2026-10-16** (below). | Keeps the core invariant and gives humans undo |
| 2026-10-15 | Task model v2: urgent/high/normal/low, due, deadline, recurrence (from due or completion), parent, section, order, completed | Todoist parity. All fields are optional, and unknown keys still round-trip. |
| 2026-10-15 | Sync model: server-ordered record sync, per-field merge, three-way body merge, conflict copies, tombstones, server-decided claims. No CRDT as the store, no git sync. | Writes arrive as whole-file diffs, so a CRDT adds drift without better merges (research: sync) |
| 2026-10-15 | Remote MCP: hosted, OAuth with consent, personal access tokens, per-space scopes, actor taken from the grant | Closes the identity gap (research: mcp-oauth) |
| 2026-10-15 | E2EE comes last, per workspace, and is incompatible with remote MCP | Server-side merge and remote MCP need plaintext |
| 2026-10-15 | Principle reversals: sync, UI and roles, server identity, long-running app processes, surface growth | Recorded in [product.md](../product/README.md) § Non-goals |
| 2026-10-15 | *Spec review refinements, decided autonomously while the owner was unavailable; the owner may reverse any of them:* | |
| 2026-10-15 | R1 means "every MVP parity row reads have". The Now exit allows logged Todoist use for phone capture and reminders only (< 10 per week). **Reminders part superseded 2026-10-16.** | Reminders and phone capture are not in Now scope; the old exit could not pass honestly |
| 2026-10-15 | Dated milestones and the slip rule (§ Roadmap horizons) | Binary gates alone gave no decision point |
| 2026-10-15 | 17 app-polish and 18 sync run in parallel (plan.md exception). Multiplayer starts only after ≥ 100 paying subscribers. | Sync is the only revenue; it cannot wait for polish. Replaces "defer XL arcs until revenue exists" |
| 2026-10-15 | New arc 18b billing: Paddle as merchant of record, 14-day trial, 30-day read-only server copy after cancel | No arc owned revenue |
| 2026-10-15 | New arc 19b capture moves email-to-task from Later (integrations) to Next, with a PWA capture page and an iOS Shortcut | The mobile-gap mitigation had no arc behind it |
| 2026-10-15 | Hosted-service commitments gate sync GA ([product-hosting.md](../hosting/README.md)) | Charging for a hosted service needs SLO, backups, GDPR duties and incident response |
| 2026-10-15 | No client telemetry; server counts for synced users; a design-partner panel for local users. North star, funnel and KPI ids K1–K19. | Several targets could not be measured; resolves product.md open question 3 |
| 2026-10-15 | Public tagline for Now and Next: "Todoist-grade tasks for you and your agents — on Markdown you own." D2 stays the long-term category; "multiplayer" enters copy at the Team launch. | § Principles: no marketing before the trust model exists |
| 2026-10-15 | D4 refinement: session states on the wire are `queued`, `working`, `needs_input`, `error`, `done` ("awaiting input" is now "needs input") | The app shows queued agent work; one enum across docs |
| 2026-10-15 | D4 refinement (remote): actor arguments (`claimer`, release `owner`, author `owner`, write `agent`) must equal the token actor; the assignee `owner` on task create and update may name any active workspace member. A refusal is tool error `identity_mismatch`. | Assignment to others is the point of D4; the literal "owner must equal actor" rule forbade it |
| 2026-10-15 | Now supports one machine per vault; agents on other machines use the local CLI over SSH | No sync exists in Now, and path-based sync duplicates tasks |
| 2026-10-16 | *Spec critique pass, decided autonomously while the owner was unavailable; the owner may reverse any of them:* | |
| 2026-10-16 | **Reminders reversal.** A minimal reminder moves into Now as desktop-app R40: a native notification within 60 s of a timed task's due time while the app window is open. No tray and no closed-app delivery; those stay AP1. The Now exit allows logged Todoist use for phone capture only. | Timed reminders are the most common Todoist use, so the 30-day dogfood could not prove replacement without them. The app is already a long-running process, which is all R40 needs. |
| 2026-10-16 | **D6 amended.** Core and CLI delete stay a hard unlink. The host tools `host_task_delete`, `host_note_delete`, `host_memory_forget` and `host_scratch_clear` move the file to the OS Trash instead. If the move fails, the delete is refused and nothing is unlinked. | A 30-day dogfood of real personal data runs before sync tombstones exist; one misclick plus a quit must not lose data. |
| 2026-10-16 | The parity matrix gains "Owning requirement" and "Evidence" columns. A row reads "have" only when its evidence step passes in desktop-app/22 against a 15-DONE core, so earlier "have (core)" MVP rows read "building" until then. | R1 and the Now exit review must be checks, not judgement |
| 2026-10-16 | New parity rows and tiers. **MVP:** completed log (desktop-app R34), project create/rename/colour/order and archive/delete (R35), multi-select and bulk actions (R36), accessibility (R37), locale (R38), "Waiting on me" (R39), in-window reminders (R40), duplicate task (R14). **v1:** view options (AP10), task links and `shards://` (AP12), mobile web review (19b). **Later, not planned:** favourite projects, templates, quick add in other languages. | Everyday Todoist tools a switcher hits on day one; favourites and templates add surface without changing the daily loop |
| 2026-10-16 | AP11 (duplicate task) withdrawn: the app already duplicates from the task menu, so the row is MVP under desktop-app R14 | Code is truth; scheduling a built feature in v1 would misstate the matrix |
| 2026-10-16 | K20 willingness to pay gates the start of 18 sync. If it misses, re-scope to self-host-first or capture-first and record it here. The weekly form gains a price-sensitivity question. | The 15 % retained-to-paid rate is an assumption, and 18 + 18b is the largest build on the roadmap |
| 2026-10-16 | 19b widens from capture to capture + review PWA (Today, Upcoming, Inbox read-only; complete, reschedule, quick add), resized to M (5 wk). web-mobile targets Q4 2027. The phone gap is recorded as a pricing risk. | Paid Sync with no way to see Today on a phone undercuts the Todoist Pro comparison |
| 2026-10-16 | KPI ids K20–K22 added. Feature docs cite K ids instead of restating targets (spec rule KPI-1). The sync "5 % of weekly-active desktop users" metric becomes K21 (trials per download), because WAU cannot be measured without telemetry. | One source of targets; the old rows contradicted K1, K12 and K14 |
| 2026-10-30 | **D7 `indexed` handoff — owner ruling: Shards keeps owning the CLI↔`indexed` contract.** One subprocess, `indexed index search <q> --collection <C> --limit <N>`, the child in `INDEXED_SIMPLE_OUTPUT=1`, one envelope decoded in `src/search/indexed.rs`. Shards does **not** become an MCP client of `indexed`. The guardrail lives on the Shards side — the engine report in `shards doctor` (DR10) — and works over either transport. | Two failures, both **contract-version** failures rather than transport failures: 2026-10-23 was a **capability mismatch** (Shards passed `--json` to a build that did not implement it; fixed in #11 `ebb9cab6`) and 2026-10-24 an **argument mismatch** (a negative `--limit` produced a valid empty envelope at exit 0; fixed in #31 `56a4777`). Both are caught by a versioned CLI contract plus an engine probe; neither is caught by switching transport. MCP would add a process/session lifecycle and a second protocol surface to a local tool that already answers in one call, and it would put the guardrail in the wrong place: the silent-degradation risk is in *how Shards calls the engine*, so it belongs on the Shards side. Closes [#13](https://github.com/LennardZuendorf/shards/issues/13). |

Parent: [Section index](README.md).
