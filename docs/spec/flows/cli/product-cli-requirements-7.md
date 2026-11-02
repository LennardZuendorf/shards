---
type: flow
updated: 2026-11-02
---

# product-cli: Requirements (7/10)

### Requirement: Agent surface naming (CLI-R6)

The agent MCP surface SHALL list only `shards_*` tools and MUST NOT list any `mesh_*` alias or
any `host_*` tool.

#### Scenario: Tool list

- **GIVEN** a running `shards-mcp`
- **WHEN** a client lists tools
- **THEN** every name starts with `shards_`

Parent: [Section index](README.md).
