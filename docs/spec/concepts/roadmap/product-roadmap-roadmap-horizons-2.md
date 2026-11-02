---
type: concept
updated: 2026-11-02
---

# product-roadmap: Roadmap horizons (2/3)

**Now exit.** For 30 consecutive days the owner creates and completes every desktop-captured
personal task and every agent task in Shards, timed tasks included (desktop-app R40 reminds while
the app window is open). Todoist is used only for phone capture, each such use is logged, and the
count stays within KPI K1. Every MVP parity row reads "have". K20 is measured and recorded at
the review; a miss does not fail the Now exit, it re-scopes 18 ([plan.md](../../flows/delivery/README.md) row 18). Now
supports one machine per vault (product.md § Non-goals). The exit review walks
[plan.md](../../flows/delivery/README.md) § Now exit review, one line per MVP row with its evidence.

**Design-partner distribution (Now).** An ad-hoc-signed DMG with documented Gatekeeper steps,
plus `scripts/install.sh`, which installs the `shards` and `shards-mcp` binaries.

### Next (mid-Jan – Jun 2027): "Reach: every device, every cloud agent, power users"

| Arc | Goal | Exit criteria | Size |
|---|---|---|---|
| app-polish | Power-user tier and a public-beta quality bar | Outcomes AP1–AP10 and AP12 below hold (AP11 is withdrawn). | L |
| sync | Personal multi-device sync | KPI K12 passes. Conflict copies are recoverable. Offline edits merge on reconnect. Self-host runs as one binary. Every [product-hosting.md](../hosting/README.md) commitment is met. | XL |
| billing (18b) | Revenue | A user can subscribe, be charged, cancel and export without contacting the owner (HOST-R1). | M |
| remote-mcp | Cloud agents reach the vault safely | Claude and ChatGPT connect over OAuth within KPI K13. Personal access tokens work for headless agents. Per-space scopes are enforced. Spoofed actor identities are refused. | M (research estimate: 3–4 weeks) |
| capture (19b) | Capture and review away from the desktop | Email-to-task through a per-user inbox address, an iOS Shortcut recipe, and a capture + review PWA served by `shards-server` from the same React app as the desktop (browser mode over the server transport): Today, Upcoming and Inbox read-only, plus complete, reschedule and quick add with the same parser. All are included in Personal Sync. A phone completes and reschedules a synced task, and the desktop shows it within the sync propagation target. | M (5 wk; reuses browser mode) |

**app-polish outcomes.** Its feature folder is created when 15 and 16 are DONE, and turns these
into numbered requirements.

Parent: [Section index](README.md).
