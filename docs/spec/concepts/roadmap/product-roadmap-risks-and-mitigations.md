---
type: concept
updated: 2026-11-02
---

# product-roadmap: Risks and mitigations

## Risks and mitigations

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| **Name collision.** Crystal ships a `shards` binary. `shards` is taken on crates.io and npm. A Tauri "Shards" writing app exists. | High / medium | Accepted by the owner (D1). A trademark knockout search (EUIPO, USPTO, DPMA; classes 9 and 42) and a domain check gate 14, before the rename is committed. The full clearance search gates the public beta. Always pair the brand with a descriptor. Install docs check for an existing `shards` on PATH. |
| **Multi-writer sync loses or garbles agent writes.** Beads moved off JSONL in git for this reason. | Medium / high | Record sync keyed by id, not file sync. Per-field frontmatter merge, three-way body merge, conflict copies, server-decided claims with expiry. Sync GA is gated on K12. Local commands never depend on sync. |
| **Users sync the folder themselves before Shards sync.** A finish moves a file, so path-based sync duplicates tasks; conflict markers in frontmatter hide tasks. | High / medium | Now supports one machine per vault. The README lists the known failure modes. The Local tier says "at your own risk". |
| **Mobile gap.** Todoist and Things keep users through phone capture. | High / high for persona 2 | Desktop-first, said plainly. The Now exit allows logged Todoist use for phone capture. The capture arc (19b: email-to-task, the capture + review PWA, iOS Shortcut) ships in Next; native apps in web-mobile (target Q4 2027). |
| **Pricing risk: paying for Sync with no phone.** Personal Sync goes GA on 2027-04-07, but the 19b review PWA lands on 2027-06-09. For about nine weeks a subscriber cannot see or complete Today on a phone. A Todoist Pro user compares $48 against $60 and sees the gap first. | High / high for persona 2 and Todoist switchers | K20 tests willingness to pay before 18 starts. The pricing page and launch copy name the phone gap and the 19b date. If K21 misses at GA + 90 days, revisit the price or move 19b ahead of 19 and record it in § Decision log. |
| **Sync built before demand is proven.** 18 is a 12-week XL build plus billing. | Medium / high | K20 gates the start of 18 ([plan.md](../../flows/delivery/README.md) row 18). If K20 misses, re-scope to self-host-first or capture-first before any server work. |
| **Hosted-service liability** (downtime, data loss, GDPR) | Medium / high | Every [product-hosting.md](../hosting/README.md) commitment gates sync GA. EU-only data at launch. |
| **MCP churn.** The protocol revised from 2025-06 through 2026-07, and its authorization rules change. | High / medium | Thin layers over one core. Serve the current and the previous protocol versions. The CLI stays the canonical, stable surface. |
| **Crowded agent-kanban field.** 8+ startups, and incumbents are adding agents. | High / medium | Do not position as an agent board. Lead with personal to-do quality, file ownership and memory in the same vault. |
| **Scope creep.** Matching Todoist, Linear and Mem0 at once. | High / high | Binary gates. The parity matrix is the scope contract. Every row outside it reads "not planned". |
| **Trust gap before sync.** Local owner and claimer are honour-system strings. | Certain / medium | No "multiplayer" in copy until verified identities ship. Locally, document identity as a convention. |
| **One-maintainer bandwidth.** | High / high | Agents build through Shards. Small arcs with binary gates and the slip rule. Multiplayer (XL) starts only after ≥ 100 paying Personal Sync subscribers. |
| **Breaking existing mesh users in the rename.** | Medium / medium | One release of fallback to `MESH_*` and `~/.mesh`. Upgrade notes. No tool-name aliases. |
| **Signing and notarization cost and friction** | Medium / low | Ad-hoc DMG for design partners in Now; signing in app-polish (AP8), before the public beta. |

Parent: [Section index](README.md).
