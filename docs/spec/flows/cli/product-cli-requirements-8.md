---
type: flow
updated: 2026-11-02
---

# product-cli: Requirements (8/10)

### Requirement: Read verbs never write (CLI-R7)

Every listing, lens, search and recall verb MUST leave every file in the vault byte-identical.

#### Scenario: Recall leaves files untouched

- **GIVEN** a vault with memories
- **WHEN** an agent recalls memories ten times
- **THEN** no file's bytes or modification time change

Parent: [Section index](README.md).
