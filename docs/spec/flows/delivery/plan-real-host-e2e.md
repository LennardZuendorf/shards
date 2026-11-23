---
type: flow
updated: 2026-11-23
---

# plan: Real-host desktop workflows (M1 evidence harness)

`apps/desktop/a11y/run.mjs` answers every `/api/**` from fixtures, so no desktop test had ever
talked to `shards-host`. This flow is the frame M1's five workflows run in
([#98](https://github.com/LennardZuendorf/shards/issues/98)). Harness:
`apps/desktop/e2e/host-workflow.mjs` (`pnpm -C apps/desktop e2e`); CI:
`.github/workflows/quality.yml` job `e2e-real-host` (ubuntu-latest, 25 min budget).

## One run

1. `scripts/demo-vault.sh --empty` seeds a disposable vault in `$E2E_WORK_DIR` (first-run state);
   the CLI then adds the two project notes the move workflow needs. Setup data is real: the
   harness seeds a vault, it never stubs one.
2. `shards-host --config <work>/demo/config.toml --port <free>` boots on it; wait for `/api/health`.
3. `vite preview` serves `dist` with `SHARDS_HOST_URL`/`SHARDS_HOST_TOKEN_FILE`, so the app's `/api`
   traffic crosses the same Vite proxy as dev (it injects `x-shards-token`). No `page.route` is
   installed: every request reaches the host.
4. Chromium drives the five workflows below, in user order, on that one vault. Each reads the id
   off `[data-task-row]` and confirms it through `shards --vault <same vault> … --json`; the
   comparison is the **id**, never a visible label.

| # | workflow | driven in the UI | must agree, in the vault |
|---|---|---|---|
| 1 | create | `q` → quick-add dialog → "Add task" | the id exists, with that title |
| 2 | edit | row date popover, then the row priority menu | `due:` and `priority:` in the task file |
| 3 | move | row `⋯` → Move to… (Inbox → A → B) | `project:` in the task file, `task list --project` both ways, the project note file |
| 4 | complete | detail-panel checkbox, then Reopen | `status:` read from the file twice (`done`, then `open`) |
| 5 | search | reload the app, then `#/search?q=` | `shards search` names the same id, and `/api/call/shards_search` named it after the reload |

The tally step fails the job unless all five rows ran and every UI id equals its CLI id: a workflow
that silently stopped running would otherwise make the job look better, not worse.

## Negative controls

`--readonly-vault` locks every file and directory of the seeded vault (0555/0444) before the UI
drives it — the root alone is not enough, because the host creates `tasks/open/` at boot. That run
is red at `quick-add a task in the UI` with
`422 … shards_task_new … Permission denied (os error 13)` and a failure screenshot.

`--readonly-at edit` is the second control: workflow 1 runs writable, then the vault turns
read-only and workflow 2 must fail at `the CLI shows the new due date and priority`. It exists
because the first control only proves the *create* write is real; this one proves a later workflow
cannot fake its outcome in the browser. `search` writes nothing, so `--readonly-at` refuses it.

CI fails a step if either control *passes*, and also unless the log names the refused write
(`FAILED STEP: …`) — a control that fails for the wrong reason proves nothing.

## Not covered

The Tauri shell (this runs the browser build; native IPC stays with `cargo test -p shards-desktop`
and the host's `api_contract`). The axe-core job is unchanged and runs separately.

Parent: [Delivery plan](README.md).
