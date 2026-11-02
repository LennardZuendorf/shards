---
type: concept
updated: 2026-11-02
---

# product-roadmap: Measurement

## Measurement

**Decided (resolves the former product.md open question 3).** The app and the CLI send no
telemetry, not even an opt-in ping. Signals come from:
- **server-side counts** for synced and hosted users: accounts, subscriptions, active vaults,
  writes by actor kind, MCP grants and calls, client type;
- **a design-partner panel** for local users: the weekly form and calls in § Go-to-market;
- public counts: release downloads, Homebrew installs, GitHub stars and issues, plugin installs
  where the marketplace reports them.

**North star:** weekly active vaults with ≥ 1 human write and ≥ 1 agent write in the week.
Server-counted for synced vaults; panel-reported for local vaults.

**Funnel assumptions** (to re-check at the public beta + 90 days):

| Step | Rate | Measured by |
|---|---|---|
| Download → activated (3 tasks captured and 1 agent connected) | 40 % | Panel and moderated tests |
| Activated → retained at day 30 | 35 % | Panel; server for synced vaults |
| Retained → paid Personal Sync | 15 % (an assumption until K20 and K21 report) | Server |
| Download → paid (product) | ≈ 2.1 % | Inside the 2–5 % freemium band |

Parent: [Section index](README.md).
