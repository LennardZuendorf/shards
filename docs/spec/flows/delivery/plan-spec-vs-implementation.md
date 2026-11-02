---
type: flow
updated: 2026-11-02
---

# plan: Spec vs Implementation

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
| Agent signalling guidance is present in candidate MCP instructions and shared skills; live host acceptance remains open | desktop-app/24, local-agent-harness | Text and tests cover `needs-input` / `agent-error`; the app already reads the labels. Candidate package installation, trust and observed lifecycle execution remain pending |
| `[[members]]` / `[core].me` not read by the core | task-model-v2/8 | Host reads both for display |
| Cross-field recur rules, update no-op detection, `--final`, `none` selectors, rest rule, R19 stamps | task-model-v2/3–7 | See its plan |
| `--ready`/`--blocked` and the dashboard lens are O(n²) | task-model-v2/5 | Blocks the 5k-task budget; budgets unmeasured |
| CI workflow not yet run on GitHub | desktop-app/23 | Each job's commands pass locally |
| Windows does not compile (`rustix`, `std::os::unix`) | — | Out of scope for Now |

Parent: [Section index](README.md).
