---
type: tech
applies: "**"
updated: 2026-11-02
---

# tech-surfaces: Surfaces (4/4)

[contract below](tech-surfaces-local-agent-harness-1.md#local-agent-harness) and [activation checklist](../../flows/delivery/plan-feature-sequence-2.md#local-harness-activation-follow-up)
  retain the boundaries and remaining acceptance work.
- **Session lenses** — `recent-activity`, `build-context`, `graph` (`--direction in|out|both`),
  `project`, and `session-start` (tasks → mentions → memories → activity, deduped by id, a
  `reason` on every entry, `--team` widening only the activity half, `--budget` trimming bodies
  before entries). All are read-only and accept a space filter. `--mine` resolves against the
  acting identity — `--owner` when given, else `[core].agent` — on every lens and list verb
  (planned, task-model-v2/8: `[core].me` joins the chain; today only `shards-host` reads it, see
  [product-cli.md](../../flows/cli/README.md) § Configuration and identity precedence).

Parent: [Section index](README.md).
