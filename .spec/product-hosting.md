---
type: product-topic
parent: product.md
scope: hosted-service
covers: hosted service commitments, availability, backup, data residency, GDPR duties, security disclosure, plan limits, unit economics, billing and entitlements
updated: 2026-10-15
---

# Hosted service — Product

Personal Sync and Team are paid, hosted services run by one EU-based owner. Charging for them
creates duties that the local product never had: availability, backups, data protection law,
security response and billing. This document states those duties as gates. **Sync GA (feature
18) and the paid launch do not happen until every requirement here holds.** Prices are in
[product-roadmap.md](product-roadmap.md) § Pricing. Feature 18b (billing) and the sync and
remote-mcp features implement what is stated here.

## Principles

- The local vault stays complete and usable when the service is down, cancelled or deleted.
- Users can leave with all their data, without contacting the owner.
- Commitments are measured by the service itself, not by user reports.
- Limits protect the service and its margins. They never price agents.

## Service commitments

| Area | Commitment | Checked by |
|---|---|---|
| Availability | 99.5 % per calendar month for the sync API and the hosted MCP endpoint (≈3 h 39 min downtime budget) | External uptime probe every 60 s, monthly report |
| Backup | RPO ≤ 1 h (continuous WAL archive plus object-store versioning); RTO ≤ 4 h | Daily automated restore drill into a scratch environment; a failed drill pages the owner |
| Data residency | EU-only region at launch for the database, object storage and backups. Any non-EU subprocessor is listed with its transfer basis. | Subprocessor list review before each paid launch |
| Account deletion | Deleting an account purges all server data, including backups, within 30 days. The local vault is untouched. | Deletion job audit log |
| Export | Self-service export: the user's Markdown vault as files, plus an archive of server history (revisions, conflict copies, tombstones) | Release test: export, wipe, re-import gives the same vault |
| Legal | Privacy policy, Terms of Service and a public subprocessor list are published before the paid launch. A Data Processing Agreement (GDPR Art. 28) is published before the Team launch. | Launch checklist |
| Security disclosure | `/.well-known/security.txt` with a contact and policy; acknowledgement of reports within 3 working days | Launch checklist |
| Incident response | A written runbook. A personal-data breach is notified to the supervisory authority within 72 hours (GDPR Art. 33) and to affected users without undue delay. | Tabletop exercise before sync GA |

## Plan limits

| Limit | Personal Sync | Team (per workspace) | When exceeded |
|---|---|---|---|
| Storage (Markdown + assets) | 5 GB | 20 GB | Writes refused with a clear error; reads and export keep working |
| Remote MCP calls | 20,000 per day | 100,000 per day | 429 with `Retry-After`; local CLI and stdio MCP are unaffected |
| Devices | 10 | 10 per human seat | New device refused until one is revoked |
| Agents | Unlimited count | Unlimited count; agents are free members | — |

The per-grant burst limits in features/remote-mcp/tech.md (600 calls per minute, 20 concurrent)
sit under these daily limits.

## Unit economics

- **Target:** cost of goods sold ≤ 20 % of revenue per subscriber at 1,000 subscribers.
- **Cost model (≈, to validate at sync beta):** managed Postgres ≈ $50, EU object storage
  ≈ $10 (1,000 × 0.5 GB), two app instances ≈ $60, backups and monitoring ≈ $40, so ≈ $160 per
  month, or ≈ $0.16 per subscriber. Merchant-of-record fees (≈ 5 % + $0.50 per transaction) are
  ≈ 15 % of a $5 monthly charge and ≈ 6 % of a $48 annual charge. Infrastructure plus fees is
  ≈ 9–18 % of revenue, inside the target. Model compute is never resold, so it is never a cost.

## Billing and entitlements (feature 18b)

- Checkout through **Paddle as merchant of record**, which collects and remits EU VAT (OSS) and
  US sales tax. Monthly ($5) and annual ($48) Personal Sync plans; a 14-day trial with no card.
- The server checks entitlements on every sync and hosted MCP request. The client never decides.
- **Cancellation and downgrade:** the local vault keeps working. The server copy stays read-only
  for 30 days (export allowed), then is deleted under the account-deletion rule.
- Failed payments: dunning emails over 14 days, then the cancellation rule applies.
- Invoices come from the merchant of record. Team seat counting arrives with multiplayer (20).

## Requirements

### Requirement: Self-service subscription lifecycle (HOST-R1)

A user SHALL be able to subscribe, be charged, cancel and export without contacting the owner.

#### Scenario: Cancel and leave

**Given** a Personal Sync subscriber with a synced vault
**When** they cancel and request an export
**Then** sync stops at the end of the paid period, the server copy is read-only for 30 days
**And** the export holds every Markdown file plus the server history archive

### Requirement: Local vault survives the service (HOST-R2)

The local vault MUST stay complete and usable when the hosted service is down, the plan is
cancelled or the account is deleted.

#### Scenario: Account deleted

**Given** a synced vault on two devices
**When** the user deletes their account
**Then** both devices keep every file, and server data is purged within 30 days

### Requirement: Limits never block local work (HOST-R3)

Exceeding a plan limit MUST only refuse the hosted operation. Local CLI, stdio MCP and app
commands MUST behave the same.

#### Scenario: Storage full

**Given** a subscriber at the 5 GB storage limit
**When** an agent creates a task through the local CLI
**Then** the task is written locally, and sync reports the limit without retrying in a loop
