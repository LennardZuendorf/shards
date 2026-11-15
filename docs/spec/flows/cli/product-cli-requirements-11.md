---
type: flow
updated: 2026-11-04
---

# product-cli: Requirements (11/11)

### Requirement: A stale claim is recoverable (CLI-R10)

A claim untouched for the stale window SHALL be recoverable by a different agent through
`task claim --takeover` or `task release --takeover` (MCP `shards_task_claim` /
`shards_task_release` with `takeover: true`). The window is 2 days and is judged from the task's
`updated`, because a claim carries no separate lease stamp. A fresher claim MUST still fail with
the same `claim_conflict` and leave the file byte-identical, `--force` MUST stay CLI-only, and
every takeover MUST be recorded in the task body under `## Claim history`, naming the previous
holder and that holder's last `updated`. `task list` marks the row `claim_recoverable` and
`status` lists the ids under `stale_claims`, so an operator sees a stuck fleet before agents
start failing.

#### Scenario: A dead owner's claim is recoverable

- **GIVEN** a task claimed by "aurora" whose file has not been written for three days
- **WHEN** "comet" releases it with `takeover: true`
- **THEN** the task is open with `claimed_by` null and the body records "aurora"'s claim under
  `## Claim history`

#### Scenario: A live claim is not

- **GIVEN** a task claimed by "aurora" a minute ago
- **WHEN** "comet" claims or releases it with `takeover: true`
- **THEN** the call fails with the claim-conflict envelope and the task file is unchanged

Parent: [Section index](README.md).
