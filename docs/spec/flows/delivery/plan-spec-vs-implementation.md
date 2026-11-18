---
type: flow
updated: 2026-11-18
---

# plan: Spec vs Implementation

## Spec vs Implementation

Honest remaining gaps, re-measured at `479b6c0` on 2026-11-17. Unit-level rows live in each
feature plan's § Spec vs Implementation. Rows marked **decide** need an owner decision because they
touch security, identity or data integrity; the code's behaviour is documented as-is in the specs
meanwhile. Each one has a recommended default and a date in § Decision register.

| Gap | Feature / unit | Notes |
|---|---|---|
| Rebrand residue open: `tests/compat_env_cli.rs` does not exist, the harness lists have no `MESH_*` twins, there is no deprecation notice or `status.legacy`, and the trademark knockout search is unrecorded | shards-rebrand/3–5, 8 | The rename itself is on main (`Cargo.toml` `name = "shards"`, 29fc017). The planned 0.3.0 bump is moot: the workspace version is 0.1.0 and v0.1.0 shipped 2026-11-02 |
| **decide** DR1 — Body replace has no precondition; an app save can overwrite a newer agent or Obsidian body | desktop-app/1, /12 | R26 unmet; `expected_body_sha256` + `conflict` designed, absent from `src/` and `crates/` |
| **decide** DR2 — The host `Origin` check accepts any loopback `http` port | desktop-app/5 | Spec asked for an allowlist; token + `x-shards-client` mitigate; another localhost page can use the Vite proxy |
| **decide** DR3 — Without `[core].me` the host acts as the shell's `$SHARDS_AGENT` | desktop-app/1, task-model-v2/8 | Spec: `Config::operator()` ignores the env; the host still falls back to `[core].agent` / `$SHARDS_AGENT` (`crates/shards-host/src/tools.rs:209`) |
| **decide** DR4 — Production CSP keeps `dangerousDisableAssetCspModification: ["style-src"]` and `img-src https:` | desktop-app/6 | Markdown already click-gates remote images |
| **decide** DR5 — Restore and field undo are not hash-guarded | desktop-app/3, /8 | Delete undo is create-only (safe); field undo overwrites later writes |
| App deletes unlink instead of moving to the OS Trash (D6 amended 2026-10-16) | desktop-app/31 | Lost on quit today: `src/domain/tasks.rs:1322` is `std::fs::remove_file` |
| No Completed view, no "Waiting on me" view and no in-window reminders; no project drag order, locale overrides or palette "New project"; bulk delete has no count confirmation | desktop-app/25, /26, /28–30 | Landed since 2026-10-16: multi-select and the bulk bar (`components/task/BulkBar.tsx`, `x` selects at `TaskView.tsx:181`), archived-task exclusion (#57), the axe-core pass. Week start is hard-coded Monday |
| Watcher creates missing space folders and emits absolute paths | desktop-app/4 | Breaks lazy folder creation (`src/cli/watch.rs:241`) |
| HTTP sends every domain error as 422; no host panic guard | desktop-app/5 | Kind → status map designed; every `Ok(Err(e))` returns `UNPROCESSABLE_ENTITY` (`crates/shards-host/src/bin/shards-host.rs:256`) |
| `host_config_set`, `host_memory_list`, `host_memory_recall_as`, scratch body replace, global shortcut not built | desktop-app/3, /6, /15, /19 | The 16 names in `HOST_TOOLS` name none of them; settings cannot set `me` or the vault from the app |
| Agent signalling guidance is in the MCP instructions and the `using-shards` skill; it is not in the `shards` skill, and live host acceptance remains open | desktop-app/24, local-agent-harness | `src/mcp/instructions.rs:40` tells agents to tag `+needs-input`/`+agent-error` and the app reads the labels; candidate package installation, trust and observed lifecycle execution remain pending |
| `[[members]]` / `[core].me` not read by the core | task-model-v2/8 | `src/config.rs` has no `members` and no `me`; the host reads both for display |
| Cross-field recur rules, update no-op detection, `--final`, `none` selectors, rest rule, R19 stamps | task-model-v2/3–7 | See its plan; `--final`, `none`, `rest rule` and `readiness_all` all return no hits in `src/` |
| `--ready`/`--blocked` and the dashboard lens are O(n²) | task-model-v2/5 | `deps::readiness_all` is absent, which blocks the 5k-task budget; no 5k-task budget is measured |
| Windows does not compile (`rustix`, `std::os::unix`) | — | `crates/shards-gateway` and `crates/shards-host` use both, and no CI job targets Windows |

Parent: [Section index](README.md).
