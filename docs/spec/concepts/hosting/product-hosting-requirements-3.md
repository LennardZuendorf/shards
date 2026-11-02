---
type: concept
updated: 2026-11-02
---

# product-hosting: Requirements (3/4)

### Requirement: Local vault survives the service (HOST-R2)

The local vault MUST stay complete and usable when the hosted service is down, the plan is
cancelled or the account is deleted.

#### Scenario: Account deleted

- **GIVEN** a synced vault on two devices
- **WHEN** the user deletes their account
- **THEN** both devices keep every file, and server data is purged within 30 days

Parent: [Section index](README.md).
