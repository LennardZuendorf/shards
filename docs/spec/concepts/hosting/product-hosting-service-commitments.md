---
type: concept
updated: 2026-11-02
---

# product-hosting: Service commitments

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

Parent: [Section index](README.md).
