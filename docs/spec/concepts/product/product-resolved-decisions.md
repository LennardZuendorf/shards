---
type: concept
updated: 2026-11-02
---

# product: Resolved decisions

## Resolved decisions

The full dated log is in [product-roadmap.md](../roadmap/README.md) § Decision log.

- **Shards pivot (2026-10-15).** mesh becomes Shards (D1–D6). The owner chose `shards` as the
  binary name against the research advice.
- **Delegation (2026-10-15).** `owner` is the accountable assignee and `claimed_by` is the
  delegate. Session states on the wire: `queued`, `working`, `needs_input`, `error`, `done`.
- **Remote identity (2026-10-15, D4 refinement).** Actor arguments (`claimer`, release `owner`,
  author `owner`, write `agent`) must equal the token actor. The assignee `owner` on task create
  and update may name any active workspace member. A refusal is tool error `identity_mismatch`.
- **Rust core (2026-09); toolset (2026-07).** One binary, five spaces, no daemon; GBrain, Beads rejected.

Parent: [Section index](README.md).
