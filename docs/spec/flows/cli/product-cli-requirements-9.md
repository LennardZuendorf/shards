---
type: flow
updated: 2026-11-02
---

# product-cli: Requirements (9/10)

### Requirement: Acting identity is one value per invocation (CLI-R8)

`--mine`, the written `owner` and claims SHALL resolve against the same acting identity, wherever
the flags are placed.

#### Scenario: Owner overrides the configured identity

- **GIVEN** `[core].me` is "lennard" and a task claimed by "ops-agent"
- **WHEN** the operator lists tasks with `--owner ops-agent --mine`
- **THEN** the claimed task is listed

Parent: [Section index](README.md).
