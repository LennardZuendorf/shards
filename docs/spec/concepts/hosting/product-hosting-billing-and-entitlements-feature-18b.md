---
type: concept
updated: 2026-11-02
---

# product-hosting: Billing and entitlements (feature 18b)

## Billing and entitlements (feature 18b)

- Checkout through **Paddle as merchant of record**, which collects and remits EU VAT (OSS) and
  US sales tax. Monthly ($5) and annual ($48) Personal Sync plans; a 14-day trial with no card.
- The server checks entitlements on every sync and hosted MCP request. The client never decides.
- **Cancellation and downgrade:** the local vault keeps working. The server copy stays read-only
  for 30 days (export allowed), then is deleted under the account-deletion rule.
- Failed payments: dunning emails over 14 days, then the cancellation rule applies.
- Invoices come from the merchant of record. Team seat counting arrives with multiplayer (20).

Parent: [Section index](README.md).
