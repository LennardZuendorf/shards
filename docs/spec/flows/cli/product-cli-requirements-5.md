---
type: flow
updated: 2026-11-02
---

# product-cli: Requirements (5/10)

### Requirement: Unknown enum values are rejected (CLI-R4)

A filter or field that takes an enum MUST reject an unknown value with a validation exit, never
return an empty result.

#### Scenario: Unknown priority

- **GIVEN** any vault
- **WHEN** an agent creates a task with priority "critical"
- **THEN** the command exits with the validation code, writes no file, and the envelope message
names `urgent`, `high`, `normal`, `low`

#### Scenario: Unknown status in a filter

- **GIVEN** a vault with open tasks
- **WHEN** an agent lists tasks with status "doing"
- **THEN** the command exits with the validation code instead of printing an empty list

Parent: [Section index](README.md).
