---
type: concept
updated: 2026-11-26
---

# product-roadmap: Todoist parity matrix (1/4)

## Todoist parity matrix

The scope contract. R1 is met when every **MVP** row reads "have". Tiers: **MVP** is the Now
horizon, **v1** is Next, **later** is Later. Every row but R16 is as measured 2026-11-26 at
`ec92858`, after the seven rows closed on 2026-11-25 (P5, P6, P12, P16, P26, P29, P30); R16 moved to
`building` on 2026-11-26 on the code read below:
have: 31 · building: 2 · planned: 17 · not planned: 10 (60 rows; the attachments row reads "core
have (assets); app view planned" and counts as planned).

Two v1 rows moved to **not planned** on 2026-11-26 by owner decision — **calendar view** and **phone
capture** (PWA page, iOS Shortcut) — which is why planned fell 19 → 17 and not-planned rose 8 → 10. No row moved
because the product changed; the owner removed the requirement.

R16 is the second `building` row: its state rule requires a **Queued** state for a task assigned to
an agent, open and not yet taken, and the code has none — `AgentSessionState`
(`apps/desktop/src/lib/types.ts:295`) has no `queued` member, so `sessionState`
(`apps/desktop/src/lib/status.ts:13`) falls through to `idle` for that task unless it carries an
`error` or `needs-input` tag (then it reads `error` or `awaiting`). The other four states, the
Waiting on me queue and the Agents view's per-agent queue count pass their tests; the S7 agent text
is open too.

- **have**: the row's evidence passes. A named test in the tree (or a CLI command) that exercises
  the row's behaviour ran green; the row's step in the desktop-app/22 acceptance run
  ([features/desktop-app/plan.md](../../features/desktop-app/plan.md) § desktop-app/22, parity
  evidence steps P1–P31) stays the app-mode confirmation;
- **building**: the capability is in a Now arc and part of it is missing; the parenthesis names
  the piece;
- **planned**: it is scheduled in a named Next or Later arc;
- **not planned**: it is deliberately out of scope.

**Owning requirement** names the requirement whose scenarios define the row. Feature requirement
ids read `<feature> R<n>`; app-polish outcomes read `AP<n>` (§ Next). **Evidence** names the test
file and the acceptance step that flip the row to "have". Next and Later rows get their evidence
when their arc's plan is written. A row with no owning requirement cannot be scheduled.

Todoist P1–P4 map to urgent, high, normal and low. Todoist labels are Shards tags, shown as
labels. Assignee and delegate are owner and claimed_by.

Parent: [Section index](README.md).
