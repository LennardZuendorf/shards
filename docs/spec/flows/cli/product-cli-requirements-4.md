---
type: flow
updated: 2026-11-02
---

# product-cli: Requirements (4/10)

### Requirement: Degradation stays out of payloads (CLI-R3)

A degraded path SHALL report on stderr only and MUST NOT change the shape of stdout.

#### Scenario: Search binary missing

- **GIVEN** the configured search binary is absent
- **WHEN** an agent searches with `--json`
- **THEN** stdout is the same JSON array shape the indexed engine returns
**And** stderr holds one degradation line, which `--quiet` suppresses

Parent: [Section index](README.md).
