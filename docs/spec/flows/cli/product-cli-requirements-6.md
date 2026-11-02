---
type: flow
updated: 2026-11-02
---

# product-cli: Requirements (6/10)

### Requirement: Rebrand compatibility bridge (CLI-R5)

For one release, each `SHARDS_*` variable and `~/.shards` path SHALL fall back to its `MESH_*`
or `~/.mesh` counterpart when unset or absent, and the `SHARDS_*` value MUST win when both exist.

#### Scenario: Legacy agent variable

- **GIVEN** `$MESH_AGENT` is "ops-agent" and `$SHARDS_AGENT` is unset
- **WHEN** the agent creates a task
- **THEN** the task owner is "ops-agent"

#### Scenario: Both set

- **GIVEN** `$MESH_VAULT` and `$SHARDS_VAULT` name different folders
- **WHEN** any command runs
- **THEN** it reads the `$SHARDS_VAULT` folder

Parent: [Section index](README.md).
