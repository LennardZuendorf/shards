---
type: flow
updated: 2026-11-26
---

# plan: Spec vs Implementation

## Spec vs Implementation

Honest remaining gaps, re-measured at `ba255ad` on 2026-11-23; the rebrand and source-line rows below
were re-measured at `efcdd94` on 2026-11-25, and the desktop row at `0b76075` later the same day.
Unit-level rows live in each
feature plan's § Spec vs Implementation. Rows marked **decide** need an owner decision because they
touch security, identity or data integrity; the code's behaviour is documented as-is in the specs
meanwhile. Each one has a recommended default and a date in § Decision register.

| Gap | Feature / unit | Notes |
|---|---|---|
| Rebrand residue open: `tests/compat_env_cli.rs` does not exist, the harness lists have no `MESH_*` twins, there is no deprecation notice or `status.legacy`, and the trademark knockout search is unrecorded | shards-rebrand/3–5, 8 | The rename itself is on main (`Cargo.toml` `name = "shards"`, 29fc017). The planned 0.3.0 bump is moot: the workspace version is 0.2.0 and v0.2.0 is the latest tag (pre-release, 2026-11-20, no release assets) |
| The host tool's baseline is optional: `host_task_set_body` without `expect_sha256` still replaces a body unconditionally | desktop-app/1, /12 | DR1's default (2026-10-22: "adopt `expected_body_sha256` on every body replace") is applied on the CLI and app paths: `task set-body --expect-sha256` and the editor's autosave both send the hash, the host calls `tasks::set_body_sealed`, and a stale write is refused with the `conflict` kind and kept in `tasks/.conflicts/` (`src/domain/tasks.rs`, `crates/shards-host/src/tools.rs:137-138`, `apps/desktop/src/lib/api/host.ts:66`; `tests/task_body_conflict_cli.rs`, `description-autosave.test.ts`). What is left is the hatch: `expect_sha256` stays optional, so a caller that omits it writes unguarded (`tools.rs:135-136`) |
| **decide** DR2 — The host `Origin` check accepts any loopback `http` port | desktop-app/5 | Spec asked for an allowlist; token + `x-shards-client` mitigate; another localhost page can use the Vite proxy |
| **decide** DR3 — Without `[core].me` the host acts as the shell's `$SHARDS_AGENT` | desktop-app/1, task-model-v2/8 | Spec: `Config::operator()` ignores the env; the host still falls back to `[core].agent` / `$SHARDS_AGENT` (`crates/shards-host/src/tools.rs:223-227`) |
| **decide** DR4 — Production CSP keeps `dangerousDisableAssetCspModification: ["style-src"]` and `img-src https:` | desktop-app/6 | Markdown already click-gates remote images |
| **decide** DR5 — Restore and field undo are not hash-guarded | desktop-app/3, /8 | Delete undo is create-only (safe); field undo overwrites later writes |
| Bulk delete has no count confirmation (R36); every other /26, /27 and /29 gap landed | desktop-app/27 | Landed since 2026-10-16: the Completed log with Reopen (/25 DONE, `views/tasks/CompletedView.tsx`, `completed-log.test.ts`), in-window reminders (/30 DONE, `apps/desktop/src/lib/reminders.ts`, `app/Reminders.tsx`), multi-select and the bulk bar (`components/task/BulkBar.tsx`, `x` selects at `TaskView.tsx:181`), archived-task exclusion (#57), the axe-core pass, locale overrides with the week start (R38: `lib/locale.ts`, `lib/dates.ts`, `views/tasks/upcoming-week-start.test.tsx`), the Waiting on me queue (/29 DONE, #131: `lib/status.ts`, `views/tasks/WaitingView.tsx`, `app/routes.tsx:57-61`), and project drag order with the palette "Add project" entry (/26 DONE, #135: `app/project-order.test.ts`, `app/project-drag.test.tsx`, `add-project-dialog.test.tsx`) |
| Watcher creates missing space folders and emits absolute paths | desktop-app/4 | Breaks lazy folder creation (`src/cli/watch.rs:296`) |
| HTTP sends every domain error as 422; no host panic guard | desktop-app/5 | Kind → status map designed; every `Ok(Err(e))` returns `UNPROCESSABLE_ENTITY` (`crates/shards-host/src/bin/shards-host.rs:256`) |
| `host_config_set`, `host_memory_list`, `host_memory_recall_as`, scratch body replace, global shortcut not built | desktop-app/3, /6, /15, /19 | The 16 names in `HOST_TOOLS` name none of them; settings cannot set `me` or the vault from the app |
| Agent signalling guidance is in the MCP instructions and the `using-shards` skill; it is not in the `shards` skill, and live host acceptance remains open | desktop-app/24, local-agent-harness | `src/mcp/instructions.rs:40` tells agents to tag `+needs-input`/`+agent-error` and the app reads the labels; candidate package installation, trust and observed lifecycle execution remain pending |
| `[[members]]` / `[core].me` not read by the core | task-model-v2/8 | `src/config.rs` has no `members` and no `me`; the host reads both for display |
| Cross-field recur rules, update no-op detection, `--final`, `none` selectors, rest rule | task-model-v2/3–7 | See its plan; `--final`, `none`, `rest rule` and `readiness_all` all return no hits in `src/`. R19 landed: a write that resolves an actor stamps `updated_by` (and the create path `created_by`), and a write with no resolvable actor removes the key rather than guessing (`src/domain/tasks.rs:598-611`, `873-879`) |
| `--ready`/`--blocked` and the dashboard lens are O(n²) | task-model-v2/5 | `deps::readiness_all` is absent, which blocks the 5k-task budget; no 5k-task budget is measured |
| Windows does not compile (`rustix`, `std::os::unix`) | — | `crates/shards-gateway` and `crates/shards-host` use both, and no CI job targets Windows |

Parent: [Section index](README.md).
