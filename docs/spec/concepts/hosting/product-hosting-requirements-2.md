---
type: concept
updated: 2026-11-02
---

# product-hosting: Requirements (2/4)

## Requirements

### Requirement: Self-service subscription lifecycle (HOST-R1)

A user SHALL be able to subscribe, be charged, cancel and export without contacting the owner.

#### Scenario: Cancel and leave

- **GIVEN** a Personal Sync subscriber with a synced vault
- **WHEN** they cancel and request an export
- **THEN** sync stops at the end of the paid period, the server copy is read-only for 30 days
**And** the export holds every Markdown file plus the server history archive

Parent: [Section index](README.md).
