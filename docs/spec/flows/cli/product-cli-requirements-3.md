---
type: flow
updated: 2026-11-02
---

# product-cli: Requirements (3/10)

### Requirement: One error envelope (CLI-R2)

In machine mode a failure MUST write exactly one JSON object to stderr with `kind`, `message`
and `next_action`, and MUST exit with the same code as human mode. MCP SHALL return the same
object.

#### Scenario: Not found with candidates

- **GIVEN** a task titled "Ship build"
- **WHEN** an agent gets a task by the slug "ship-buld" with `--json`
- **THEN** stderr holds one object with `kind` "not_found" and a `candidates` list naming the task
**And** the exit code equals the human-mode exit code for not-found

Parent: [Section index](README.md).
