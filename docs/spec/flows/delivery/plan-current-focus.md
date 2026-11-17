---
type: flow
updated: 2026-11-17
---

# plan: Current Focus

## Current Focus

Every claim below is checked against `origin/main`; a branch name appears only while
`git ls-remote --heads origin` lists it.

- **Shipped — on `main` now:** the rename to `shards` (`Cargo.toml` package `shards` 0.1.0, #14);
  task model v2 fields, recurrence and the v2 filters in CLI, MCP and schema (`src/model/task.rs`,
  `src/domain/recur.rs`, `tests/task_v2_cli.rs`); the app, `crates/shards-host` and the Flint slice
  (`apps/desktop/src/styles/flint.css`, [verification](../../../design/flint-verification.md),
  #45/#57/#73/#80/#81/#86); the private MCP local source (`crates/shards-gateway`,
  `services/shards-remote`, #64) with one loopback run recorded (#69).

### Next, in order

K1 gates the Now exit: 30 consecutive owner dogfood days, **0 of 30 elapsed** — the window opens
2026-12-13 ([horizons](../../concepts/roadmap/product-roadmap-roadmap-horizons-1.md#dated-milestones))
and runs to 2027-01-11. These three stand between this tree and day 1.

1. **15 task-model-v2 to DONE.** Units 3–7 and 9 are PARTIAL and /8 (`[[members]]` in the core) is
   NOT STARTED — `--final`, the `none` selectors, the rest rule, cross-field recur rules, update
   no-op detection and `readiness_all` are the named gaps
   ([progress](../../features/task-model-v2/plan.md#progress)).
2. **16 desktop-app to DONE.** desktop-app/31 (delete to the OS Trash) lands before the dogfood
   starts, then desktop-app/22's acceptance run needs a 15-DONE core
   ([plan](../../features/desktop-app/plan.md) § Unit IDs, § desktop-app/22).
3. **16p private MCP deployment acceptance.** Image execution, real Tailscale and Vercel ingress are
   UNPROVEN and unapproved; local source plus one loopback run is all the evidence there is
   ([acceptance](plan-private-mcp-deployment-acceptance.md#private-mcp-deployment-acceptance)).
   [#63](https://github.com/LennardZuendorf/shards/issues/63) is its guided-setup follow-up.

### Owner-blocked

- **DR1–DR6 and DR8.** Defaults applied on silence after 2026-10-22, and no decision-log row records
  them ([register](../now/plan-now-decision-register.md#decision-register)).
- **Day 1 of the dogfood.** 0 of 30 days; the window opens 2026-12-13, after desktop-app/31.
- **Local harness activation.** Source is DONE and
  [#12](https://github.com/LennardZuendorf/shards/issues/12) stays open: install, trust and
  enrollment wait on operator approval, and every check in
  [sequence 2](plan-feature-sequence-2.md#local-harness-activation-follow-up) is still open.
- **Merge queue.** #87, #88 (v0.2.0), #89 (re-stamp) here, plus vibe#98, which unblocks
  `fetch-depth: 0` in `quality / release-tools`: that shallow checkout
  (`.github/workflows/quality.yml`) never runs SF29, the `updated:` rule.

Parent: [Section index](README.md).
