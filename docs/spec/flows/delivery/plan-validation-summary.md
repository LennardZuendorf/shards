---
type: flow
updated: 2026-11-02
---

# plan: Validation Summary

## Validation Summary

Run on 2026-10-16 against the uncommitted working tree:

- `cargo fmt --all --check` → exit 0.
- `cargo test -p shards` → passed.
- `cargo test -p shards-host` → passed, including library, binary, host tools and identity checks.
- `pnpm -C apps/desktop test` → 14 files, 148 tests passed.
- Residue gate step 1 (rebrand tech.md § Residue gate, with `scripts/demo-vault.sh` allowlisted
  as a compat harness line) → no output.
- Spec critique pass (same day): `bash .claude/skills/spec/scripts/validate.sh` → 0 errors, 0
  warnings; the KPI-1 grep ([product-roadmap.md](../../concepts/roadmap/README.md) § KPIs) prints nothing.
- Host smoke on port 7961 against `scripts/demo-vault.sh` output: `/api/health` → `ok`; a call
  without the token → 401; `Origin: https://evil.example` → 403; `host_status` → 200
  `{value: {me: "lennard", …}, list: false}`; an unknown task id → 422
  `{kind: "domain", message: "<not_found envelope>"}`. The host was stopped afterwards.
- Reported by the parallel build and CI tasks the same day, not re-run here: `cargo clippy
  --workspace --all-targets -- -D warnings` clean, `pnpm -C apps/desktop build` and `lint`,
  `pnpm -C apps/desktop tauri build --debug --bundles app`, and the local run of every CI job.

What exists:

- **Built (code is truth):** `shards` 0.2.0 core (lib + CLI + stdio MCP, 42 `shards_*` tools),
  renamed to Shards with `MESH_*` / `~/.mesh` read fallbacks.
- **task-model-v2:** fields, recurrence (incl. `BYMONTH` and the clamp pin), recurring finish
  with `expected_due` and `warnings`, reopen, filters, sorts, CLI and MCP params
  ([features/task-model-v2/plan.md](../../features/task-model-v2/plan.md) § Progress).
- **desktop-app:** `crates/shards-host` (16 host tool names, HTTP + SSE with Host/Origin/token
  guard), the Tauri 2.12 shell (`shards_call` + `shards_open`, least-privilege capability, CSP), and the React app
  with every Now screen, quick add, ⌘K, detail pane, board, live refresh and client-side undo
  ([features/desktop-app/plan.md](../../features/desktop-app/plan.md) § Progress). Screenshots:
  `docs/screenshots/`.
- **Not built:** see § Spec vs Implementation. `crates/shards-server` is reserved only.

Parent: [Section index](README.md).
