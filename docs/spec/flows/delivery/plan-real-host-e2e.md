---
type: flow
updated: 2026-11-23
---

# plan: Real-host desktop workflow (M1 evidence harness)

`apps/desktop/a11y/run.mjs` answers every `/api/**` from fixtures, so no desktop test had ever
talked to `shards-host`. This flow is the first workflow that does, and the frame M1's workflows
2–5 plug into ([#98](https://github.com/LennardZuendorf/shards/issues/98)). Harness:
`apps/desktop/e2e/host-workflow.mjs` (`pnpm -C apps/desktop e2e`); CI:
`.github/workflows/quality.yml` job `e2e-real-host` (ubuntu-latest, 25 min budget).

## One run

1. `scripts/demo-vault.sh --empty` seeds a disposable vault in `$E2E_WORK_DIR` (first-run state).
2. `shards-host --config <work>/demo/config.toml --port <free>` boots on it; wait for `/api/health`.
3. `vite preview` serves `dist` with `SHARDS_HOST_URL`/`SHARDS_HOST_TOKEN_FILE`, so the app's `/api`
   traffic crosses the same Vite proxy as dev (it injects `x-shards-token`). No `page.route` is
   installed: every request reaches the host.
4. Chromium opens `#/inbox`, presses `q`, fills the dialog's `combobox` "Task name", clicks that
   dialog's "Add task".
5. The new `[data-task-row="<id>"]` must appear; the id is read from the DOM.
6. `shards --vault <same vault> task list --json --all` must hold exactly that id and title, and a
   file under the vault must name it.

Step 6 is the contract: a fixture can fake step 5, never the Markdown file the CLI reads.

## Negative control

`--readonly-vault` locks every file and directory of the seeded vault (0555/0444) before the UI
drives it — the root alone is not enough, because the host creates `tasks/open/` at boot. CI fails
the step if the control *passes*:

```
if pnpm -C apps/desktop e2e --readonly-vault; then
  echo "::error::the workflow passed on a vault shards-host cannot write"; exit 1
fi
```

The control is red at `quick-add a task in the UI`, with
`422 POST /api/call/shards_task_new {"kind":"io_error","message":"io error: Permission denied (os error 13)"}`
and a failure screenshot.

## Adding workflows 2–5

One `step("…")` block each, in user order, so a failure names the broken step. Drive the real UI
by role and accessible name (ids from `data-task-row`); confirm the changed field through
`shards task list|get --json` on the id the UI reported; one disposable vault, unique titles;
state which mutation must turn the workflow red. A workflow that cannot fail on a refused write is
a rendering test — it belongs in `a11y/` or `vitest`. Planned order: due date and priority, move
to a project, complete and reopen, search for the persisted task after a reload.

## Not covered

The Tauri shell (this runs the browser build; native IPC stays with `cargo test -p shards-desktop`
and the host's `api_contract`), four of the five M1 workflows, and no reload check. The axe-core
job is unchanged and runs separately.

Parent: [Delivery plan](README.md).
