# Flint implementation evidence

Date: 2026-10-28. Branch: `codex/shards-flint-ui`. Base: `56a4777`.

The React desktop UI implements the approved Flint presentation slice, desktop-app/42–47.
It retains the existing Rust core, host calls, routes, query cache and task semantics.
The complete desktop feature still has the unrelated gaps recorded in its feature plan.

## Visual correction pass requested by the owner

The initial pass missed hover collisions, sidebar spacing/indentation and stale launcher
icons. Its green accessibility results did not establish complete visual QA. The supplied
screenshots triggered desktop-app/48, including the requested Notes selector tabs.

The corrections reserve an in-flow task-action column, wrap metadata without competing nested
widths, align titles with the completion control's first line, and give sidebar trays a real
10px flex gap. Projects and labels share the primary navigation inset. Notes now has Folders
and Tags tabs with one visible tree, keyboard navigation, persistent tab selection and retained
folder/tag filters. The single-file filter label uses “1 file.”

Subagents inspected the actual app in the **built-in browser** at 1280px, 900px and 720px,
including hover, keyboard focus, wrapped metadata and both themes. Their screenshots live in
[visual-fixes](../screenshots/flint/visual-fixes/). The native icon and favicon use one matching
Flint geometry; generated assets and the bundled ICNS bytes were verified. The
[icon preview](../screenshots/flint/visual-fixes/app-icon.png) comes from the actual ICNS.
No app was installed.

Executable evidence:

```text
Frontend: 41 files, 731 tests passed
Flint visual regressions: 18 passed; 0 failed
Original state cases: 30 passed across full and optional-capture runs
Total known violations: 0; new violations: 0
zoom findings: 0
```

The visual regressions first failed on real action/text and text/text intersections. The
built-in-browser review also caught title/checkbox misalignment: its measured first-line center
difference fell from 7.5px to 0.5px after correction. Logs: `visual-full-acceptance.log`,
`visual-screenshots-final.log` and `visual-alignment-final.log` under `.superpowers/sdd/plan/`. The final alignment run
passes all 18 cases, including a first-line center offset no greater than 4px;
`visual-alignment-unit.log` records the fresh 731-test pass.
Production build and lint pass; lint retains the 20 existing warnings. Spec validation has
zero errors and warnings.

## Padding follow-up — 22:18 screenshots

The task row now places title/checkbox/metadata content on the same first-line center as its
28px actions. Task detail uses 16px header insets and uniform 8px gaps between More, Open In
and Close; the split button retains its joined seam. Existing task actions remain unchanged.
Subagents reproduced the original 4px offset in the built-in browser, added failing geometry
checks, implemented the bounded fix and independently reviewed the result.

Verification: production build, 731 frontend tests and 34 visual geometry cases pass. Lint
retains the same 20 warnings. New checks cover action/avatar alignment and detail-header
insets/gaps in both themes and at desktop/narrow widths. Before images in
[padding-fixes](../screenshots/flint/padding-fixes/) are copies of the owner's supplied
screenshots; after images are browser test captures. The built-in-browser provider became
unavailable after initial reproduction, so final checks use the executable browser harness;
no final built-in-browser recheck is claimed. The installed spec CLI reports zero errors
and the same 65 pre-existing documentation-staleness warnings.

## Structure

- `styles/flint.css` owns the eight palettes, semantic aliases and shared surface tokens.
  `styles/fonts.css` loads local licensed fonts. Static presentation uses Tailwind or token CSS.
- Shared identity, heading, shortcut, status and conflict components serve every view.
  Runtime styles remain for drag/virtual positions, measured editor height and stored colors.
- `app/theme.ts` owns appearance state; `ThemeControls.tsx` owns React presentation/effect setup.
- `detail-draft-state.ts` owns complete target-scoped drafts and interaction restoration.
  `detail-drafts.tsx` exports the provider. It stays above adaptive detail wrappers.
- Focus uses the existing shell and a guarded session store. Contextual handoff uses current
  task data and the existing owner/release actions. It never starts an agent.

## Initial implementation verification

The final browser acceptance output is recorded in the execution ledger at
`.superpowers/sdd/plan/flint-browser-final-acceptance.log`; the permanent runner is
`apps/desktop/a11y/run.mjs`, including `flint-regressions.mjs`. A final shortcut-label correction also passes all three focused
Focus consumer checks.
Use `A11Y_CHROMIUM_PATH` when the installed browser differs from Playwright's expected revision.

Verified frontend output:

```text
Test Files  41 passed (41)
Tests       730 passed (730)
```

`pnpm -C apps/desktop build` passes TypeScript and the production build.
`pnpm -C apps/desktop lint` reports 20 existing warnings and zero errors, below the 25-warning
inspection baseline. The new draft modules and shared conflict component have no lint warnings.

Rust verification passes: core 1,477 tests, host 46 tests, `cargo fmt --all --check`, and
`cargo clippy --workspace --exclude shards-desktop --all-targets --locked -- -D warnings`.
The core suite required process permissions, and the host suite required loopback permissions.
No Rust implementation changed.

Browser cases exercise all four stones in light/dark, local font delivery, actual AA contrast,
neutral control boundaries, real cmdk filtering/action invocation, stale task context, guarded
Focus entry/exit and 720px/900px detail bounds. Dirty task title/description/comment and memory/
scratch editors retain text, focus, selection and scroll through 1280 → 1000 → 720 → 1280,
without writes. External task/memory title updates preserve dirty drafts and untouched editors;
only an explicit conflict choice writes. The route/overlay matrix checks AA and 200% zoom.

```text
Flint browser regressions: 30 passed; 0 failed
Total known violations: 0; new violations: 0
zoom findings: 0
```

Independent source reviews found and closed shared-store render writes, inherited identity
keys, crew layout, stale context, detail width, checkbox contrast, source conflicts and Focus
chrome. The actual board test also found and closed a semantic list containing its composer.

## Real host and visual evidence

Manual Yab checks used only `/private/tmp/shards-flint-inspection-01a182ca/config.toml` through
the demo host on 7986 and the local UI on 5286. Completion and Undo restored the task file.
Palette assignment wrote `owner: ops-agent` while preserving `status: open` and
`claimed_by: null`. After restoring the owner, a CLI-created agent claim appeared in the UI;
Take back restored `status: open`, `owner: lennard`, `claimed_by: null`. The earlier completion
test task was reopened through the CLI. The owner's live vault was not used.

[Real demo screenshots](../screenshots/flint/) contain Today, Focus, project/detail, Agents,
Notes and the handoff palette in both modes, plus quick add, Inbox, a label and expanded agent detail. The
[capture manifest](../screenshots/flint/manifest.json) records successful local font/art requests,
zero page errors and zero mutations during capture. The expected console resource errors are
the existing empty-argument `host_project_update` capability probe returning 422; they are not
hidden as successful calls. Fixture-based acceptance additionally captures 900px/720px routes.

## Limits

A native bundle was built to verify the regenerated ICNS asset. The final visual acceptance
targets the owner's built-in-browser surface; this does not claim a full native shell acceptance
run. Host body hash preconditions, OS Trash,
sync, agent launch/chat and other existing feature gaps remain with their original owners.
The owner authorized a PR and local application build on 2026-10-29. Merge and deployment
remain separate actions.

## PR handoff — 2026-10-29

Final independent review caught pending submission state being lost when responsive detail
wrappers remounted. Pending flags now live beside their target-scoped drafts. Memory and
scratch writes use promise continuations that survive unmount, and successful writes only
clear or close the submitted snapshot. Newer drafts remain editable and are retained.

Eight delayed-request browser regressions cover comments, memory/scratch appends, and task/
memory/scratch body saves. Five append cases failed before the correction with duplicate
requests or cleared/hidden newer text. All eight cases pass after correction. The scoped
source re-review has no remaining findings.

Fresh checks: 731 frontend tests and 1,523 Rust workspace tests pass. Frontend production
build, workspace Clippy with warnings denied, and Rust formatting pass. Lint retains 20
existing warnings; spec validation reports zero errors and 65 existing staleness warnings.
The complete browser runner passes 37 consumer checks, 34 visual checks, all 12 route/theme
accessibility scans with zero violations, and the zoom suite with zero findings.

The staged whitespace check is clean outside the verbatim reference HTML and font licenses.
Those source artifacts retain three original trailing-whitespace lines; the reference retains
its recorded SHA-256.

## CI accessibility correction — 2026-10-30

The Ubuntu accessibility job exposed a label/name mismatch on the Focus button: its explicit
name excluded visible Ctrl text, and the active Quiet label did not match the name either.
The button now derives its name from its contents. A screen-reader label remains available
below the text breakpoint, and the title retains Enter/Exit instructions. Keyboard behavior,
visible labels and accessibility baselines remain unchanged.

The new browser regression failed before correction on Mac and Linux platform labels. It
checks both states at 1280px, 720px and 480px, including actual accessible names, shortcut text,
label/name matching and empty-button rules.

Fresh verification passes: 731 frontend tests, 1,523 Rust tests, the production frontend build,
40 browser consumer checks, 34 visual checks, all 12 accessibility route/theme scans with zero
violations, and zoom with zero findings. Lint retains 20 existing warnings; spec validation
retains zero errors and 65 existing staleness warnings. Independent review reports no findings.
