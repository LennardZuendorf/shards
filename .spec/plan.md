---
type: entrypoint
scope: implementation
covers: feature sequence, feature boundaries, build order, validation criteria, open reviews, known gaps
children:
  - plan-now.md
  - features/shards-rebrand/plan.md
  - features/task-model-v2/plan.md
  - features/desktop-app/plan.md
  - features/release-pipeline/plan.md
updated: 2026-10-30
---

# Shards — Implementation Plan

The delivered core (features 1–13: one Rust binary, five spaces, the task dependency graph, a
40-tool stdio MCP server, no daemon) is the base. The 2026-10-15 pivot turns that core into
**Shards**. The **Now** horizon is three features: **shards-rebrand** (14) renames everything and
adds compat fallbacks; **task-model-v2** (15) adds Todoist-parity task fields and recurrence;
**desktop-app** (16) adds `crates/shards-host` and the Tauri + React app on top of the same core.
**Next** adds app-polish (17), sync (18), billing (18b), remote MCP (19) and capture (19b). Sync,
billing, remote MCP and capture live in the reserved `crates/shards-server`. Target dates:
[product-roadmap.md](product-roadmap.md) § Dated milestones.

**Parent specs:** [product.md](product.md), [tech.md](tech.md), [design.md](design.md)

**Feature plans (unit-level detail lives here, not duplicated below):**

| Feature | Product | Plan | Status |
|---|---|---|---|
| [shards-rebrand](features/shards-rebrand/product.md) | `.spec/` + whole tree (rename) | [plan.md](features/shards-rebrand/plan.md) | rename done, residue gate clean; compat tests, version bump and commit open |
| [task-model-v2](features/task-model-v2/product.md) | `.spec/` + core (model, domain, CLI, MCP) | [plan.md](features/task-model-v2/plan.md) | units 1–2 DONE, 3–7 and 9 PARTIAL, 8 NOT STARTED; committed, not merged |
| [desktop-app](features/desktop-app/product.md) | `.spec/` + `crates/shards-host`, `apps/desktop`, core seams S0–S6 | [plan.md](features/desktop-app/plan.md) | working prototype: 21 units DONE, 19 PARTIAL, 7 NOT STARTED, 1 SUPERSEDED (48 units; Flint 42–48 verified 2026-10-28) |
| [release-pipeline](features/release-pipeline/product.md) | CI, releases, Homebrew, desktop packaging, server integration contract | [plan.md](features/release-pipeline/plan.md) | IMPLEMENTED LOCALLY; remote CI and ship approval pending; server application excluded |
| [sync](features/sync/product.md) | `.spec/` + `crates/shards-server` (sync API + client) | — (written when 18 starts) | designed, not started |
| [remote-mcp](features/remote-mcp/product.md) | `.spec/` + `crates/shards-server` (MCP + OAuth) | — (written when 19 starts) | designed, not started |

---

## Validation Summary

Run on 2026-10-16 against the uncommitted working tree:

- `cargo fmt --all --check` → exit 0.
- `cargo test -p shards` → 1502 passed, 0 failed (27 suites; lib 626).
- `cargo test -p shards-host` → 36 passed, 0 failed (lib 3, bin 7, `host_tools` 25,
  `identity` 1).
- `pnpm -C apps/desktop test` → 14 files, 148 tests passed.
- Residue gate step 1 (rebrand tech.md § Residue gate, with `scripts/demo-vault.sh` allowlisted
  as a compat harness line) → no output.
- Spec critique pass (same day): `bash .claude/skills/spec/scripts/validate.sh` → 0 errors, 0
  warnings; the KPI-1 grep ([product-roadmap.md](product-roadmap.md) § KPIs) prints nothing.
- Host smoke on port 7961 against `scripts/demo-vault.sh` output: `/api/health` → `ok`; a call
  without the token → 401; `Origin: https://evil.example` → 403; `host_status` → 200
  `{value: {me: "lennard", …}, list: false}`; an unknown task id → 422
  `{kind: "domain", message: "<not_found envelope>"}`. The host was stopped afterwards.
- Reported by the parallel build and CI tasks the same day, not re-run here: `cargo clippy
  --workspace --all-targets -- -D warnings` clean, `pnpm -C apps/desktop build` and `lint`,
  `pnpm -C apps/desktop tauri build --debug --bundles app`, and the local run of every CI job.

What exists:

- **Built (code is truth):** `shards` 0.2.0 core (lib + CLI + stdio MCP, 40 `shards_*` tools),
  renamed to Shards with `MESH_*` / `~/.mesh` read fallbacks.
- **task-model-v2:** fields, recurrence (incl. `BYMONTH` and the clamp pin), recurring finish
  with `expected_due` and `warnings`, reopen, filters, sorts, CLI and MCP params
  ([features/task-model-v2/plan.md](features/task-model-v2/plan.md) § Progress).
- **desktop-app:** `crates/shards-host` (16 host tool names, HTTP + SSE with Host/Origin/token
  guard), the Tauri 2.12 shell (`shards_call` + `shards_open`, least-privilege capability, CSP), and the React app
  with every Now screen, quick add, ⌘K, detail pane, board, live refresh and client-side undo
  ([features/desktop-app/plan.md](features/desktop-app/plan.md) § Progress). Screenshots:
  `docs/screenshots/`.
- **Not built:** see § Spec vs Implementation. `crates/shards-server` is reserved only.

## Feature Boundaries

```
core (delivered)  ── owns ──>  src/** (storage, fm, search, lenses), tests/**, plugins/shards
shards-rebrand    ── owns ──>  tree-wide rename + compat fallbacks (src/config.rs), README, AGENTS.md, .spec/
task-model-v2     ── owns ──>  src/model, src/domain/tasks.rs, src/domain/recur.rs, src/cli, src/mcp
desktop-app       ── owns ──>  crates/shards-host, apps/desktop, root [workspace], core seams S0–S6
                               (src/config.rs [core].me, Server::call_with, src/domain/entity.rs,
                               notes project meta, storage::watch, the `conflict` kind)
sync, billing,    ── own  ──>  crates/shards-server (reserved; nothing written in the Now horizon)
remote-mcp, capture
```

| Layer | Owns | Does not own |
|---|---|---|
| **shards-rebrand** | Renames in every path; `MESH_*` env and `~/.mesh/` fallbacks; README, AGENTS.md, root `.spec/` | New surface of any kind; `mesh_*` tool aliases (D1: not aliased) |
| **task-model-v2** | Task fields (`priority: urgent`, `due`, `deadline`, `recur`, `recur_from`, `parent`, `section`, `order`, `completed`), recurrence advance on finish, filters (`--due-before`, `--due-after`, `--overdue`, `--parent`, `--section`), task MCP schemas, `[[members]]` config | Host-only tools; any UI; sync; other spaces' models |
| **desktop-app** | `Host::call`, the UI-only `host_*` tools, the vault change watcher, `shards-host` HTTP/SSE bin, the Tauri shell and React UI; core seams S0–S6 ([features/desktop-app/tech.md](features/desktop-app/tech.md) § Core seams) | Task schema and existing verb behaviour (read through `Host::call` only); `crates/shards-server`; tray and closed-window reminders, importers and signing (feature 17) |
| **sync** | `crates/shards-server` sync API; client in app and CLI; `.shards/sync/`, `.shards/conflicts/`, tombstones | Local command behaviour: CLI commands never depend on sync; billing |
| **billing (18b)** | Checkout (Paddle as merchant of record), plans, trial, server-side entitlement checks on sync and MCP endpoints, cancellation and downgrade, dunning, invoices; later Team seat counting | Prices (product-roadmap.md § Pricing); sync and MCP protocol |
| **remote-mcp** | Streamable HTTP MCP, OAuth 2.1 AS, PATs, scopes in `crates/shards-server` | Stdio MCP in the core crate |
| **capture (19b)** | Email-to-task (per-user inbox address), iOS Shortcut recipe, the capture + review PWA served by `shards-server` from the desktop React app (Today, Upcoming, Inbox read-only; complete, reschedule, quick add) | Full web editing and native mobile apps (web-mobile) |

---

## Feature Sequence

Binary gates: a downstream feature leaves NOT STARTED only when its upstream is DONE. Units
(`feature/n`) live in feature plans only. Rows 1–13 are delivered history, condensed from the
pre-pivot plan. Their contracts live in [tech-core.md](tech-core.md) and [tech-surfaces.md](tech-surfaces.md).

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
| 14 | shards-rebrand | Everything renamed, compat fallbacks, rewritten `.spec/`, README, AGENTS.md | `cargo test -p shards`, rename grep gate | ACTIVE (residue gate clean 2026-10-16; compat tests, harness, notice, 0.3.0 bump, trademark record and commit open) | — |
| 15 | task-model-v2 | v2 fields, recurrence, date/parent/section filters in CLI + MCP + schema | `cargo test -p shards`, `tests/task_v2_cli.rs` | ACTIVE (units 1–2 DONE; 3–7, 9 PARTIAL; 8 NOT STARTED; committed, not merged) | 14 DONE |
| 16 | desktop-app | `shards-host` + Tauri shell + UI prototype (Inbox, Today, Upcoming, Waiting on me, Completed, Projects list/board with project management, Labels, Search, Agents, Memories, Scratchpads, Notes, ⌘K, quick add, detail pane, live refresh) | `cargo test -p shards-host`, `pnpm -C apps/desktop test` | ACTIVE (working prototype; units 34–41 notes trees, sidebar sections, view options and monochrome redesign landed 2026-10-17; acceptance desktop-app/22 not run) | 14 DONE |
| 16r | release-pipeline | Tested CLI/MCP and desktop candidates, custom Homebrew tap payload, prepared server release workflow | [per-unit evidence](features/release-pipeline/plan.md) | IMPLEMENTED LOCALLY (2026-10-30; remote CI and activation pending) | Explicit plan approval; distribution brought forward from AP8 at owner request; server publication waits for the separately implemented server |
| 17 | app-polish | Outcomes AP1–AP10 and AP12: tray and closed-window reminders, global quick add, saved filters, calendar, importers, onboarding, signed app with bundled CLI and MCP, updater, Homebrew, view options, task links | `pnpm -C apps/desktop test` | NOT STARTED | 15 DONE, 16 DONE and the Now exit review recorded |
| 18 | sync | `shards-server` sync API + client in app and CLI; personal multi-device | `cargo test -p shards-server` | NOT STARTED | same as 17 (runs beside 17, exception below), and K20 met at the Now exit review; otherwise re-scope (self-host-first or capture-first) and record it in [product-roadmap.md](product-roadmap.md) § Decision log |
| 18b | billing | Paddle checkout, Personal Sync plans, 14-day trial, entitlement checks, cancel/downgrade, dunning | `cargo test -p shards-server` | NOT STARTED | 18 reaches beta; DONE before 18 is DONE |
| 19 | remote-mcp | Hosted MCP + OAuth AS, PATs, scopes | `cargo test -p shards-server` | NOT STARTED | 18 DONE |
| 19b | capture | Email-to-task, capture + review PWA (Today, Upcoming, Inbox; complete, reschedule, quick add), iOS Shortcut | TBD in feature spec | NOT STARTED | 18 DONE |
| 20 | multiplayer | Workspaces, roles, invites, shared projects, comments, mentions, activity feed, presence | TBD in feature spec | NOT STARTED | 19 DONE, 19b DONE and paying Personal Sync subscribers at the KPI K9 threshold |
| 21 | web-mobile | Full web client, native mobile apps, push reminders (target Q4 2027) | TBD in feature spec | NOT STARTED | 19b DONE |
| 22 | integrations | Calendar sync, GitHub/Linear bridges, webhooks | TBD in feature spec | NOT STARTED | 20 DONE |
| 23 | e2ee | Per-workspace E2EE (no remote MCP for those workspaces) | TBD in feature spec | NOT STARTED | 20 DONE |

**Gate details.**

- **16r scope decision (2026-10-30):** the owner requested distribution work now, with CLI/MCP,
  desktop always including both tools, and a prepared server pipeline. Server implementation
  remains separate. The owner accepts unsigned Mac releases and their security prompt.
  This brings the distribution foundation forward from AP8; signing, the in-app updater and
  the other app-polish outcomes keep their existing ownership. It does not mark 14–16 DONE.
  Local implementation was approved in this chat on 2026-10-30; publication has
  its later verify→ship gate.

- **14 DONE** means all of these hold, and each check is binary:
  - `git grep --untracked -n -i mesh -- . ':!Cargo.lock' ':!.spec/' ':!src/config.rs' ':!tests/compat_env_cli.rs' ':!scripts/demo-vault.sh' ':!README.md' ':!AGENTS.md' ':!**/node_modules/**'`
    prints nothing. `--untracked` is required while the scaffolds are uncommitted. The allowlist
    holds compat and history only: `src/config.rs` (fallbacks), `tests/compat_env_cli.rs`
    (created by shards-rebrand/3), `scripts/demo-vault.sh` (one `unset` of both prefixes, the
    harness rule), `README.md` (upgrade note, history), `AGENTS.md` (fallback notes) and
    `.spec/` (lessons, plan row 6, mesh-era decisions). On 2026-10-16 it prints nothing.
  - `tests/compat_env_cli.rs` exists and passes, and the harness clears `MESH_*`
    (shards-rebrand/3–5). Open on 2026-10-16.
  - `shards --version` prints `0.3.0` (shards-rebrand/6). Open: still 0.2.0.
  - `cargo fmt --all --check` is clean (green on 2026-10-16).
  - `cargo clippy --all-targets --locked -- -D warnings` is clean.
  - `cargo test -p shards` is green.
  - Root `.spec/` names Shards only.
  - A trademark knockout search (EUIPO, USPTO, DPMA; classes 9 and 42) and a domain check
    (shards.app) are recorded in [product-roadmap.md](product-roadmap.md) § Decision log. The
    full clearance search stays a public-beta gate.
  - The rename is committed.
- **15** started ahead of its gate. Its model and domain code landed in the working tree in a
  parallel pass before 14 DONE. That code is not committed until 14 commits; then 15's units are
  finished against their scenarios, not restarted.
- **The sanctioned exception 15 ∥ 16.** Normally a feature that reads the task model would wait
  for the feature that changes it. Here the desktop UI degrades gracefully when a task has no v2
  fields: no due date, no section, default priority `normal`. 16's edits inside 15's paths are
  additive only: S1 `Server::call_with`, S0 `[core].me` and `Config::operator()` beside
  `[[members]]` in `src/config.rs`, and the S7 instruction text (desktop-app/24). Each lands
  first and 15 rebases. 16 is DONE only when its acceptance runs against a 15-DONE core.
- **Overlap inside the exception:** `Cargo.toml` and `Cargo.lock`. 15 adds no core dependency
  (the RRULE subset is hand-rolled, [tech.md](tech.md) § Tech Stack). 16 owns `[workspace]` and
  the host and app dependencies. Body replace for every space is S2 `entity::set_body`
  ([features/desktop-app/tech.md](features/desktop-app/tech.md) § Core seams).
- **The sanctioned exception 17 ∥ 18.** Sync is the only revenue and must not wait for polish.
  The two do not share paths: 18 lives in `crates/shards-server` and the client module, and the
  app only gains a sync status badge, which 18 adds after 17's last UI unit lands.
- **18b** starts when 18 reaches beta (multi-device dogfood running). 18 is DONE only when 18b is
  DONE and every [product-hosting.md](product-hosting.md) commitment is met.
- **20** carries a business gate: paying Personal Sync subscribers at the KPI K9 threshold (server count), at any time, not only within K9's 90-day window.
- **Rows 17–23** get their own feature spec when tackled. app-polish's folder is created at
  15 DONE and 16 DONE, from the outcomes in [product-roadmap.md](product-roadmap.md) § Next.

---

## Spec vs Implementation

Honest remaining gaps on 2026-10-16. Unit-level rows live in each feature plan's § Spec vs
Implementation. Rows marked **decide** need an owner decision because they touch security,
identity or data integrity; the code's behaviour is documented as-is in the specs meanwhile.
Each one has a recommended default and a date in § Decision register.

| Gap | Feature / unit | Notes |
|---|---|---|
| Nothing is committed: the rename, task-model-v2, the host, the app, CI and these specs are staged in the index; `apps/desktop/src-tauri/gen/schemas` is git-ignored | 14, 15, 16 | Agents may not commit; the owner stages and commits per the 14 → 15/16 order |
| Rebrand open: compat tests, `MESH_*` in harnesses, deprecation notice, 0.3.0 bump, trademark knockout record | shards-rebrand/3–6, 8 | Residue gate itself is clean |
| **decide** DR1 — Body replace has no precondition; an app save can overwrite a newer agent or Obsidian body | desktop-app/1, /12 | R26 unmet; `expected_body_sha256` + `conflict` designed |
| **decide** DR2 — The host `Origin` check accepts any loopback `http` port | desktop-app/5 | Spec asked for an allowlist; token + `x-shards-client` mitigate; another localhost page can use the Vite proxy |
| **decide** DR3 — Without `[core].me` the host acts as the shell's `$SHARDS_AGENT` | desktop-app/1, task-model-v2/8 | Spec: `Config::operator()` ignores the env |
| **decide** DR4 — Production CSP keeps `dangerousDisableAssetCspModification: ["style-src"]` and `img-src https:` | desktop-app/6 | Markdown already click-gates remote images |
| **decide** DR5 — Restore and field undo are not hash-guarded | desktop-app/3, /8 | Delete undo is create-only (safe); field undo overwrites later writes |
| App deletes unlink instead of moving to the OS Trash (D6 amended 2026-10-16) | desktop-app/31 | Lost on quit today |
| Completed log, bulk actions, "Waiting on me", in-window reminders not built; project drag order, archived-task exclusion, locale overrides and accessibility checks partial | desktop-app/25–30 | New MVP parity rows (2026-10-16) |
| Watcher creates missing space folders and emits absolute paths | desktop-app/4 | Breaks lazy folder creation |
| HTTP sends every domain error as 422; no host panic guard | desktop-app/5 | Kind → status map designed |
| `host_config_set`, `host_memory_list`, `host_memory_recall_as`, scratch body replace, global shortcut not built | desktop-app/3, /6, /15, /19 | Settings cannot set `me` or the vault from the app |
| Agent signalling text (`needs-input`, `agent-error`) not in instructions or SKILL.md | desktop-app/24 | The app reads the labels |
| `[[members]]` / `[core].me` not read by the core | task-model-v2/8 | Host reads both for display |
| Cross-field recur rules, update no-op detection, `--final`, `none` selectors, rest rule, R19 stamps | task-model-v2/3–7 | See its plan |
| `--ready`/`--blocked` and the dashboard lens are O(n²) | task-model-v2/5 | Blocks the 5k-task budget; budgets unmeasured |
| CI workflow not yet run on GitHub | desktop-app/23 | Each job's commands pass locally |
| Windows does not compile (`rustix`, `std::os::unix`) | — | Out of scope for Now |

## Now-horizon gates

The decision register (DR1–DR8), the owner actions checklist and the Now exit review checklist
live in [plan-now.md](plan-now.md).

## Open Reviews and Known Gaps

- **`shards watch` leaks its lock on SIGINT.**
  - `run` holds the singleton `LockGuard`, and a signal skips `Drop`. An interrupted watcher
    therefore leaves the lock behind and never emits its closing `stop` event.
  - The lock self-heals on its TTL, so this is a hygiene gap, not a wedge.
  - The fix needs a signal-handling crate, because `#![forbid(unsafe_code)]` rules out a
    hand-written handler. That is a dependency change, so it waits for a decision.
    → [tech-core.md](tech-core.md) § Stack.
  - desktop-app adds a second watcher in `shards-host`. That watcher must not reuse the CLI
    singleton lock.
- **Name collision (known risk, accepted).** Crystal ships a `shards` binary; `shards` and `shard`
  are taken on crates.io and npm. The owner chose the name anyway (D1). Mitigation:
  `publish = false`, install from source or the app bundle; the trademark knockout gates 14.

## Resolved

- **Product-positioning review**: superseded by the 2026-10-15 pivot.
  - Positioning, personas and pricing are now decided in [product.md](product.md) (D2, D3, D5).
  - The banked finding is fixed in code. `ROOT_ABOUT` in `src/cli/mod.rs` now names five spaces,
    and the `search` about string covers notes, tasks, memories and assets.
- **Rust rewrite for CLI startup performance**: shelved 2026-08, reversed 2026-09.
  → [tech-core.md](tech-core.md) § Performance.
- **Vault adaptivity**: resolved by the spaces model. Foreign Markdown is readable and searchable,
  and it is never mutated. → [tech-core.md](tech-core.md) § Invariants (detail).

## Current Focus

- **Flint redesign verified:** the approved slice is implemented in `codex/shards-flint-ui`.
  The scoped contract and implementation units live in
  [desktop-app/42–48](features/desktop-app/plan.md#flint-redesign-implementation-plan).
  [Verification evidence](../docs/design/flint-verification.md) records tests, browser acceptance,
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
- **Then 16:** desktop-app/24 (S7 text), the body precondition, the watcher fixes, desktop-app/31
  (OS Trash) before the dogfood starts, desktop-app/25–30 (the new MVP rows), then the acceptance
  run desktop-app/22 against a 15-DONE core.
