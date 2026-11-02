---
type: tech
applies: "**"
updated: 2026-11-02
---

# tech: Performance Budgets

## Performance Budgets

| Budget | Target | Measured by |
|---|---|---|
| CLI cold start | < 10 ms warm FS; CI pin min-of-10 < 50 ms; `shards` links no tokio/axum/tauri | `tests/foundation_cli.rs`; `cargo tree -p shards` check in CI |
| Host call p95 (5k-task fixture: 5,000 tasks, 60% done, 2,000 notes; a scaled demo vault: `scripts/demo-vault.sh` has no `--scale`/`--notes` yet) | `shards_task_list` unbounded incl. `ready` ≤ 50 ms; `shards_task_get` baseline first, then ≤ 2× baseline; single-entity write ≤ 25 ms | release-mode timing test in `crates/shards-host/tests/`, 50 runs |
| UI list of 5k tasks | first render ≤ 100 ms after data; ≤ 80 rows mounted (virtualised); filter change ≤ 50 ms | vitest bench + timed browser-mode run against `shards-host` (villain-layer browser) → [features/desktop-app/tech.md](../../features/desktop-app/tech.md) § Testing |
| Live refresh | external write → UI updated ≤ 500 ms p95 | same harness, CLI write + event wait |

Blockers to fix first: O(n²) readiness in `ready`/`blocked` lists and the dashboard lens (owner
task-model-v2/5: `deps::readiness_all` once per list, release bench ≤ 50 ms at 5k); the 20-row
`Filter::default()` cap (delivered workaround: the app sends `limit: 2000` on task lists and 500
on notes, memories and assets; the planned host-side `limit: -1` injection is not built); per-call
config reload (not built: `Server::call` and every host tool still load the config per call).

Parent: [Section index](README.md).
