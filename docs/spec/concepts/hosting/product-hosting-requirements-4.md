---
type: concept
updated: 2026-11-02
---

# product-hosting: Requirements (4/4)

### Requirement: Limits never block local work (HOST-R3)

Exceeding a plan limit MUST only refuse the hosted operation. Local CLI, stdio MCP and app
commands MUST behave the same.

#### Scenario: Storage full

- **GIVEN** a subscriber at the 5 GB storage limit
- **WHEN** an agent creates a task through the local CLI
- **THEN** the task is written locally, and sync reports the limit without retrying in a loop

Parent: [Section index](README.md).
