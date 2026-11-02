---
type: concept
updated: 2026-11-02
---

# product-roadmap: KPIs per horizon

## KPIs per horizon

This table is the only source of KPI targets. Feature docs cite rows by id and do not restate
the numbers.

**Spec rule KPI-1 (lint).** A target for a KPI-class quantity appears only in this table:
adoption, retention, revenue, dogfood, panel and business rows, and any row that restates a K id.
Every other spec cites the id (for example "KPI K12") and names no number for it. Engineering
budgets (latency, CPU, size, conformance, parity) stay in [tech.md](../../tech/architecture/README.md) § Performance
Budgets and in feature docs, because they are not KPIs. Check before every spec change:

```bash
grep -rnE -i 'subscriber|download|stars|churn|retention|weekly-active|design partner|Todoist (untouched|use)|devices|pre-pay|paying' docs/spec --include='*.md' \
  | grep -vE '^docs/spec/(concepts/roadmap/|concepts/hosting/|lessons\.md:)' \
  | grep -E '[0-9]+ ?%|≥ ?[0-9]|< ?[0-9]|at least [0-9]|[0-9]+ consecutive' | grep -vE '\bK[0-9]+\b'
```

It must print nothing (it printed nothing on 2026-10-16). A hit is fixed by citing the K id, or
by adding a K id here. [product-hosting.md](../hosting/README.md) is exempt: plan limits and unit
economics are commitments and costs, not KPIs.

| Id | Horizon | KPI | Target |
|---|---|---|---|
| K1 | Now | Owner dogfood | The Now exit: 30 consecutive days, < 10 logged Todoist uses per week, phone capture only |
| K2 | Now | Design partners active weekly | ≥ 5 of 10 |
| K3 | Now | Share of agent tasks claimed through `task next` or a claim, not by chat paste (owner's vault) | ≥ 80 % |
| K4 | Now | Capture and freshness | Quick add file written < 200 ms after Enter; agent write visible p95 < 1 s |
| K5 | Now | CLI cold start (guardrail) | Stays under the 10 ms target |
| K6 | Now | North star (panel) | ≥ 5 vaults weekly: the owner's plus ≥ 4 design partners' |
| K20 | Now | Willingness to pay, measured at the Now exit review: design partners who pre-pay or sign a written intent to buy Personal Sync at $48/yr | ≥ 5 of 10 |
| K22 | Now | Median time from an agent's stamped `needs-input` question to the operator's answer comment (task body stamps; owner's vault and panel) | ≤ 4 h within working hours |
| K7 | Next | Downloads, public beta to 90 days after sync GA | ≥ 5,000 |
| K8 | Next | GitHub stars | ≥ 1,500 |
| K9 | Next | Personal Sync subscribers within 90 days of sync GA (server count) | ≥ 100 |
| K10 | Next | Monthly churn of Personal Sync | < 5 % |
| K11 | Next | 30-day retention, design partners and beta panel | ≥ 30 % |
| K12 | Next | Sync soak: convergence simulator with 10,000 seeds in CI, plus a 4-week dogfood on 3 devices with ≥ 5 agents | 0 lost writes, 0 duplicate ids |
| K21 | Next | Personal Sync trials started per release download, 90 days after sync GA (server trial count ÷ public download count) | ≥ 5 % |
| K13 | Next | Remote MCP connect time from Claude or ChatGPT, no manual token copy | Median ≤ 60 s, p90 ≤ 3 min |
| K14 | Next | Personal Sync subscribers with ≥ 1 active MCP grant at day 30 (grants table) | ≥ 40 % |
| K15 | Next | Moderated onboarding test: install, capture 3 tasks with quick add, see an agent task in Today | 5 of 6 first-time users within 5 minutes |
| K16 | Next | North star (server, synced vaults) 90 days after sync GA | ≥ 60 |
| K17 | Later | Paying teams | ≥ 25 |
| K18 | Later | Teams with ≥ 1 agent member active weekly (server) | ≥ 60 % |
| K19 | Later | Phone, email and mobile captures as a share of task creates, synced users only (server, by client type) | ≥ 25 % |

Parent: [Section index](README.md).
