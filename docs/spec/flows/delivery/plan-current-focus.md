---
type: flow
updated: 2026-11-02
---

# plan: Current Focus

## Current Focus

- **Flint redesign verified:** the approved slice is implemented in `codex/shards-flint-ui`.
  The scoped contract and implementation units live in
  [desktop-app/42–48](../../features/desktop-app/plan.md#flint-redesign-implementation-plan).
  [Verification evidence](../../../design/flint-verification.md) records tests, browser acceptance,
  screenshots and the native-window limitation. This stays inside feature 16 and changes no
  core/host contract. Shared React components and token/Tailwind styling implement the owner's
  quality constraints. The owner authorized a PR and local application build on 2026-10-29;
  existing feature gates remain.

- **Owner decisions first:** DR1–DR6 and DR8 in § Decision register, by 2026-10-22; the
  defaults apply after that. Then § Owner actions in order.
- **Close 14:** shards-rebrand/3–6 (compat tests, harness `MESH_*`, notice, 0.3.0), the trademark
  record, then commit the rename alone (rebrand/8 procedure).
- **Then 15:** commit the landed code; finish task-model-v2/3 (cross-field rules, no-op update),
  /4 `--final`, /5 `none` + rest rule + `readiness_all`, /8 members in the core, /9 docs.
- **Local harness:** source is DONE; obtain operator approval and complete the [activation follow-up](plan-feature-sequence-2.md#local-harness-activation-follow-up) before claiming real-host lifecycle acceptance.
- **Then 16:** desktop-app/24 live acceptance (S7 text is in candidate source), the body precondition, the watcher fixes, desktop-app/31
  (OS Trash) before the dogfood starts, desktop-app/25–30 (the new MVP rows), then the acceptance
  run desktop-app/22 against a 15-DONE core.

- **Private MCP:** [local source](../../tech/surfaces/tech-surfaces-private-remote-mcp-1.md#private-remote-mcp) is DONE. The
  [deployment acceptance](plan-private-mcp-deployment-acceptance.md#private-mcp-deployment-acceptance)
  remains UNPROVEN and unapproved; the daemon declaration has zero instances.

Parent: [Section index](README.md).
