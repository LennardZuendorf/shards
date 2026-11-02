---
type: flow
updated: 2026-11-02
---

# product-cli: Requirements (10/10)

### Requirement: `task next` answers by due (CLI-R9)

`task next` SHALL order ready, unclaimed candidates by the `--sort due` composition — soonest
`due` first, undated last, `priority` as the tiebreak — and MUST NOT carry an ordering of its own.
A task due on or before today MUST outrank an undated task of any priority.

#### Scenario: A due task outranks an undated urgent one

- **GIVEN** a ready, unclaimed task with no `due` and priority `urgent`, and a ready, unclaimed task
with priority `low` due today
- **WHEN** the operator runs `task next`
- **THEN** the task due today is printed, in human, `--quiet` and `--json` modes alike

---

Parent: [Section index](README.md).
