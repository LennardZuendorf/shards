---
type: flow
updated: 2026-11-02
---

# product-cli: Requirements (2/10)

## Requirements

### Requirement: Output class precedence (CLI-R1)

Every command SHALL belong to exactly one output class, and the class SHALL decide how
`--json` and `--quiet` combine.

#### Scenario: Quiet wins on a mutation

- **GIVEN** a vault with an open task
- **WHEN** the operator runs a task update with both `--json` and `--quiet`
- **THEN** stdout holds the task id alone and nothing else

#### Scenario: JSON wins on a listing

- **GIVEN** a vault with two tasks
- **WHEN** the operator lists tasks with both `--json` and `--quiet`
- **THEN** stdout is the JSON listing

Parent: [Section index](README.md).
