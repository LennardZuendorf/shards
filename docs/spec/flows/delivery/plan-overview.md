---
type: flow
updated: 2026-11-02
---

# plan: Overview

# Shards — Implementation Plan

The delivered core (features 1–13: one Rust binary, five spaces, the task dependency graph, a
40-tool stdio MCP server, no daemon) is the base. The 2026-10-15 pivot turns that core into
**Shards**. The **Now** horizon is three features: **shards-rebrand** (14) renames everything and
adds compat fallbacks; **task-model-v2** (15) adds Todoist-parity task fields and recurrence;
**desktop-app** (16) adds `crates/shards-host` and the Tauri + React app on top of the same core.
**Next** adds app-polish (17), sync (18), billing (18b), remote MCP (19) and capture (19b). Sync,
billing, remote MCP and capture live in the reserved `crates/shards-server`. Target dates:
[product-roadmap.md](../../concepts/roadmap/README.md) § Dated milestones.

**Parent specs:** [product.md](../../concepts/product/README.md), [tech.md](../../tech/architecture/README.md), [design.md](../../tech/design-system/README.md)

**Feature plans (unit-level detail lives here, not duplicated below):**

| Feature | Product | Plan | Status |
|---|---|---|---|
| [shards-rebrand](../../features/shards-rebrand/product.md) | `docs/spec/` + whole tree (rename) | [plan.md](../../features/shards-rebrand/plan.md) | rename done, residue gate clean; compat tests, version bump and commit open |
| [task-model-v2](../../features/task-model-v2/product.md) | `docs/spec/` + core (model, domain, CLI, MCP) | [plan.md](../../features/task-model-v2/plan.md) | units 1–2 DONE, 3–7 and 9 PARTIAL, 8 NOT STARTED; committed, not merged |
| [desktop-app](../../features/desktop-app/product.md) | `docs/spec/` + `crates/shards-host`, `apps/desktop`, core seams S0–S6 | [plan.md](../../features/desktop-app/plan.md) | working prototype: 21 units DONE, 19 PARTIAL, 7 NOT STARTED, 1 SUPERSEDED (48 units; Flint 42–48 verified 2026-10-28) |
| [local-agent-harness](../../tech/surfaces/tech-surfaces-local-agent-harness-1.md#local-agent-harness) | native Rust runner, `plugins/shards`, TypeScript packaging, MCP guidance and tests | [activation follow-up](plan-feature-sequence-2.md#local-harness-activation-follow-up) | DONE (source); installation, trust, live enrollment and real-host lifecycle acceptance pending |
| [release-pipeline](../../features/release-pipeline/product.md) | CI, releases, Homebrew, desktop packaging, server integration contract | [plan.md](../../features/release-pipeline/plan.md) | IMPLEMENTED; native builds pass; Homebrew lifecycle and first publication pending; server application excluded |
| [sync](../../features/sync/product.md) | `docs/spec/` + `crates/shards-server` (sync API + client) | — (written when 18 starts) | designed, not started |
| [remote-mcp](../../features/remote-mcp/product.md) | `docs/spec/` + `crates/shards-server` (MCP + OAuth) | — (written when 19 starts) | designed, not started |

---

**Private deployment exception (owner direction, 2026-10-28):** private-remote-mcp (16p) is a
separate [local-source delivery](../../tech/surfaces/tech-surfaces-private-remote-mcp-1.md#private-remote-mcp) for private
Vercel/Tailscale forwarding to the local vault. It does not
start the public remote-mcp/sync horizon or alter their billing gates. The owner approved
code-first implementation on 2026-10-30; Vercel feasibility remains an unproven release gate.


Private MCP source is DONE; [deployment acceptance](plan-private-mcp-deployment-acceptance.md#private-mcp-deployment-acceptance) remains UNPROVEN and unapproved.

Parent: [Section index](README.md).
