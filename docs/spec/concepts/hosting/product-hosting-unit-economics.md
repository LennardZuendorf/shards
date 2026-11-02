---
type: concept
updated: 2026-11-02
---

# product-hosting: Unit economics

## Unit economics

- **Target:** cost of goods sold ≤ 20 % of revenue per subscriber at 1,000 subscribers.
- **Cost model (≈, to validate at sync beta):** managed Postgres ≈ $50, EU object storage
  ≈ $10 (1,000 × 0.5 GB), two app instances ≈ $60, backups and monitoring ≈ $40, so ≈ $160 per
  month, or ≈ $0.16 per subscriber. Merchant-of-record fees (≈ 5 % + $0.50 per transaction) are
  ≈ 15 % of a $5 monthly charge and ≈ 6 % of a $48 annual charge. Infrastructure plus fees is
  ≈ 9–18 % of revenue, inside the target. Model compute is never resold, so it is never a cost.

Parent: [Section index](README.md).
