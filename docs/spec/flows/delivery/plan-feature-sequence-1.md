---
type: flow
updated: 2026-11-02
---

# plan: Feature Sequence (1/3)

## Feature Sequence

Binary gates: a downstream feature leaves NOT STARTED only when its upstream is DONE. Units
(`feature/n`) live in feature plans only. Rows 1–13 are delivered history, condensed from the
pre-pivot plan. Their contracts live in [tech-core.md](../../tech/core/README.md) and [tech-surfaces.md](../../tech/surfaces/README.md).

| # | Feature | Deliverable | Test | Status | Starts when |
|---:|---|---|---|---|---|
| 1 | notes + tasks | `note` and `task` verb families (Python era, re-delivered in Rust) | `tests/note_cli.rs`, `tests/task_cli.rs` | DONE | — |
| 2 | daemon | Background accelerator, later **removed** by row 11 | replaced by optional `shards watch` | DONE | — |
| 3 | search | `search` verb, `indexed` wrapper, built-in BM25-lite engine | `tests/search_cli.rs` | DONE | — |
| 4 | memory | Memories space, MCP tools, session lenses | `tests/memory_cli.rs` | DONE | — |
| 5 | tasks-graph | Derived readiness, `block`/`unblock`, strict claim (exit 5), `task next` | `tests/task_dep_cli.rs` | DONE | — |
| 6 | mesh-rebrand | Historical tree-wide rename to "mesh" (superseded by row 14) | — | DONE | — |
| 7 | cli-toolset-rework | `graph`/`project` lenses, CI startup guard | `tests/lens_cli.rs` | DONE | — |
| 8 | vault-agnostic | `[core].vault_path` + permanent aliases | `tests/foundation_cli.rs` | DONE | — |
| 9 | core-hardening | Lock compare-and-swaps, structured errors | `tests/race.rs` | DONE | — |
| 10 | team-awareness + agent-usability | Inbound mentions, `task append`/`release`, `session-start --team`, MCP instructions, `init` | `tests/mcp_cli.rs` | DONE | — |
| 11 | rust-rewrite | Whole `src/` and `tests/` in Rust; five spaces; no daemon | `cargo test -p shards` | DONE | — |
| 12 | note-adoption + project-envelope | `note adopt/claim/release`, `--mine`, envelope lens, `--project` filters, 40-tool parity | `tests/note_cli.rs`, `tests/mcp_cli.rs` | DONE | — |
| 13 | dashboard-tui | Read-only live TUI dashboard | `tests/dashboard_cli.rs` | DONE | — |
| 14 | shards-rebrand | Everything renamed, compat fallbacks, rewritten `docs/spec/`, README, AGENTS.md | `cargo test -p shards`, rename grep gate | ACTIVE (residue gate clean 2026-10-16; compat tests, harness, notice, 0.3.0 bump, trademark record and commit open) | — |
| 15 | task-model-v2 | v2 fields, recurrence, date/parent/section filters in CLI + MCP + schema | `cargo test -p shards`, `tests/task_v2_cli.rs` | ACTIVE (units 1–2 DONE; 3–7, 9 PARTIAL; 8 NOT STARTED; committed, not merged) | after feature 14 completes |
| 16 | desktop-app | `shards-host` + Tauri shell + UI prototype (Inbox, Today, Upcoming, Waiting on me, Completed, Projects list/board with project management, Labels, Search, Agents, Memories, Scratchpads, Notes, ⌘K, quick add, detail pane, live refresh) | `cargo test -p shards-host`, `pnpm -C apps/desktop test` | ACTIVE (working prototype; units 34–41 notes trees, sidebar sections, view options and monochrome redesign landed 2026-10-17; acceptance desktop-app/22 not run) | after feature 14 completes |
| 16p | private-remote-mcp | [Private MCP adapter + local Rust gateway](../../tech/surfaces/tech-surfaces-private-remote-mcp-1.md#private-remote-mcp), actor/space grants | [receipt](../../../research/private-remote-feasibility.md), [deployment acceptance](plan-private-mcp-deployment-acceptance.md#private-mcp-deployment-acceptance) | DONE (local source only) | After feature 13; real Vercel topology PASS before release |
| 16r | release-pipeline | Tested CLI/MCP and desktop candidates, custom Homebrew tap payload, prepared server release workflow | [per-unit evidence](../../features/release-pipeline/plan.md) | IMPLEMENTED; v0.1.0 published; native and public-URL Brew checks passed | Explicit plan approval; distribution brought forward from AP8 at owner request; server publication waits for the separately implemented server |
| 17 | app-polish | Outcomes AP1–AP10 and AP12: tray and closed-window reminders, global quick add, saved filters, calendar, importers, onboarding, signed app with bundled CLI and MCP, updater, Homebrew, view options, task links | `pnpm -C apps/desktop test` | NOT STARTED | 15 DONE, 16 DONE and the Now exit review recorded |
| 18 | sync | `shards-server` sync API + client in app and CLI; personal multi-device | `cargo test -p shards-server` | NOT STARTED | same as 17 (runs beside 17, exception below), and K20 met at the Now exit review; otherwise re-scope (self-host-first or capture-first) and record it in [product-roadmap.md](../../concepts/roadmap/README.md) § Decision log |
| 18b | billing | Paddle checkout, Personal Sync plans, 14-day trial, entitlement checks, cancel/downgrade, dunning | `cargo test -p shards-server` | NOT STARTED | 18 reaches beta; DONE before 18 is DONE |
| 19 | remote-mcp | Hosted MCP + OAuth AS, PATs, scopes | `cargo test -p shards-server` | NOT STARTED | after feature 18 completes |
| 19b | capture | Email-to-task, capture + review PWA (Today, Upcoming, Inbox; complete, reschedule, quick add), iOS Shortcut | TBD in feature spec | NOT STARTED | 18 DONE |
| 20 | multiplayer | Workspaces, roles, invites, shared projects, comments, mentions, activity feed, presence | TBD in feature spec | NOT STARTED | 19 DONE, 19b DONE and paying Personal Sync subscribers at the KPI K9 threshold |
| 21 | web-mobile | Full web client, native mobile apps, push reminders (target Q4 2027) | TBD in feature spec | NOT STARTED | 19b DONE |
| 22 | integrations | Calendar sync, GitHub/Linear bridges, webhooks | TBD in feature spec | NOT STARTED | 20 DONE |
| 23 | e2ee | Per-workspace E2EE (no remote MCP for those workspaces) | TBD in feature spec | NOT STARTED | 20 DONE |

**Local-agent-harness parallel arc.** DONE for native source and packaging on 2026-10-31;
the [persistent contract](../../tech/surfaces/tech-surfaces-local-agent-harness-1.md#local-agent-harness) and
[verification record](../../../research/local-agent-harness/2026-10-31-native-agent-harness-verification.md)
replace its transient designs/plans. This source closure does not reorder rows 14–23,
authorize remote deployment or establish candidate hook execution. Activation remains
separately gated below.

Parent: [Section index](README.md).
