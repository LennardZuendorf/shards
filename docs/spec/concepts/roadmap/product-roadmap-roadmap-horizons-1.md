---
type: concept
updated: 2026-11-02
---

# product-roadmap: Roadmap horizons (1/3)

## Roadmap horizons

[plan.md](../../flows/delivery/README.md) § Feature Sequence owns the order and the gates. Sizing is in engineer-weeks
for the owner working with agents: S is up to 1 week, M is 2–4, L is 5–8 and XL is more than 8.

### Dated milestones

| Milestone | Target | Rests on |
|---|---|---|
| 14 shards-rebrand DONE (incl. trademark knockout search) | 2026-10-24 | S |
| 15 task-model-v2 DONE | 2026-11-21 | M, runs beside 16 (sanctioned exception) |
| 16 desktop-app DONE | 2026-12-12 | L |
| Owner dogfood (Now exit criterion) | 2026-12-13 → 2027-01-11 | 30 consecutive days |
| **Now exit review** | 2027-01-12 | recorded in § Decision log |
| 17 app-polish DONE → public beta | 2027-03-10 | L (8 wk), starts 2027-01-13 |
| 18 sync reaches beta | 2027-03-10 | XL planned at 12 wk, starts 2027-01-13 beside 17 |
| 18b billing DONE; hosted commitments met | 2027-04-07 | M, starts at sync beta |
| **18 sync DONE → GA, paid launch** | 2027-04-07 | 4-week soak dogfood after beta |
| 19 remote-mcp DONE | 2027-05-05 | M (4 wk) |
| 19b capture DONE (capture + review PWA) | 2027-06-09 | M (5 wk, widened 2026-10-16), after 19 |
| **Next exit review** | 2027-06-16 | 2 weeks of slack inside H1 2027 |
| web-mobile target | Q4 2027 | XL; exit criterion in § Later |

**Arithmetic.** The Next dates hold only under the 17 ∥ 18 exception in plan.md, with agents
carrying most implementation. If the owner must run 17 and 18 in sequence, sync GA moves to
≈ 2027-06-02, and 19 and 19b move to Q3 2027. 18 starts only when K20 is met at the Now exit
review ([plan.md](../../flows/delivery/README.md) row 18); otherwise the re-scope recorded there replaces these dates.

**Slip rule.** When a gate slips more than 2 weeks past its target, re-scope the next arc before
it starts and record the change in § Decision log. If sync GA would land after 2027-06-30, move it
to Q3 2027 openly. Never shorten the soak to hold a date.

### Now (Q4 2026 – mid-Jan 2027): "Replace Todoist for one person and their agents"

| Arc | Goal | Exit criteria | Size |
|---|---|---|---|
| shards-rebrand | One name everywhere. Existing mesh setups keep working. | No user-visible "mesh" remains except in the fallback notes. A mesh vault and config work unchanged for one release. The 42 tools are renamed to `shards_*`. All suites are green. The trademark knockout search is recorded. | S |
| task-model-v2 | Todoist-parity fields in the files, the CLI and MCP | Every v2 field round-trips. Finishing a recurring task moves it to its next due date. Date, parent and section filters work. A v1 task stays valid. | M |
| desktop-app | A desktop prototype covering every MVP view | Every MVP parity row reads "have", by its evidence step in desktop-app/22. Agent writes show up in the open app within KPI K4. | L |

Parent: [Section index](README.md).
