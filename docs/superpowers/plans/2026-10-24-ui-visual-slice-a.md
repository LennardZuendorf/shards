# Visual Refinement Slice A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land Slice A of the Shards desktop visual programme (`/workspace/wiki/plans/ui-visual-redesign-program.md` § 5) as 10 reviewable commits plus one evidence commit: pin the design tokens the spec already names (radii, sidebar width, scrim, elevation, motion defaults, a real type scale, row tone scale, keycap), give task rows and group headers one state language, diet the shell chrome, add the three safe motion upgrades, and unify the unpinned copy. No `.spec/` change: every item either implements `design.md` or repairs drift against it.

**Architecture:** Each task is one file-scoped change with a source-scan or pure-module guard test written first (vitest runs in the **node** environment: no jsdom, no testing-library, so a visual change is only testable by reading a file with `readFileSync` and asserting on its text, exactly as `src/lib/contrast.test.ts` and `src/lib/motion.test.ts` already do). Colour changes re-pin `src/lib/contrast.test.ts` in the same commit. Tasks are ordered so the suite is green after every one; `index.css` is touched by Tasks 1, 2, 3, 4 and 5, so those five are strictly sequential, and Tasks 7, 8 and 9 share `TaskRow.tsx`/`TaskList.tsx`/`AppShell.tsx`/`Sidebar.tsx` and are sequential in the order given.

**Tech Stack:** React 19, Vite, TypeScript, Tailwind 4 (`@theme inline`), vitest 5 (node env), oxlint, shadcn (radix) primitives, `motion` 12, dnd-kit, pnpm.

**Baseline (re-measured in this session, branch `ui-refinements` at `55db777`, working tree clean):**
- `pnpm -C apps/desktop lint` -> `Found 25 warnings and 0 errors.` (226 files, 116 rules)
- `pnpm -C apps/desktop test` -> `Test Files 35 passed (35)`, `Tests 530 passed (530)`
- `pnpm -C apps/desktop build` -> `✓ built in 536ms`
- `pnpm -C apps/desktop a11y` was **not** run here; `~/.cache/ms-playwright/chromium-1248` is installed, so it should run (Task 11).

**Where the inputs were wrong (verified live, do not copy the reports):**
1. `page-width.ts` is at `src/components/shared/page-width.ts`, **not** `src/lib/page-width.ts` (foundations § "page-width.ts:3" and the shell report cite it loosely).
2. The foundations report claims the retired tokens have live call sites (`brand-soft` 3, `primary-soft` 3, `due-week` 5, `surface-header` 3, `identity-human` 14, `identity-agent` 13). Live counts: `brand`, `brand-soft`, `primary-soft`, `surface-header` have **zero** call sites outside `index.css`; `due-week` has **2** (`src/app/QuickAddForm.tsx:101`, `src/components/task/pickers.tsx:56`); `identity-human`/`identity-agent` have **1** (`src/views/settings/SettingsView.tsx:352`). `--identity-*-fill` is a different, live token and stays.
3. `border*` count: foundations says 337, the programme's own grep said 317. Irrelevant to this slice (no border sweep here).
4. The programme's D7 says "delete the shell `h1`". **This slice keeps it** (several views have no `PageHeader` title, so axe `page-has-heading-one` would fail on those routes). Task 8 keeps the `h1`.
5. The `apps/desktop/a11y/run.mjs` runner pins exactly three things this slice could break: `nav[aria-label="Breadcrumb"]` on every route (`run.mjs:194,208,223`), the palette dialog accessible name `"Command menu"` (`run.mjs:169`), and the quick-add placeholder `"e.g. Review PR #project p1 tomorrow 5pm @label +agent"` (`run.mjs:172`). It does **not** pin the palette placeholder, "Inbox zero", "Clear filters", any `text-*` size, or any shadow. It also measures `[data-task-row]` heights at 200% zoom (720x500) and requires them to be at least as tall as at 100% (`run.mjs:58,106-114`).

## Global Constraints

- Run everything from the repo root `/var/lib/srv/paseo/worktrees/0x77zdvo/ui-refinements`; use `pnpm -C apps/desktop ...`.
- After **every** task: `pnpm -C apps/desktop lint` must print `Found 25 warnings and 0 errors.` (no new warnings), `pnpm -C apps/desktop test` must be green, `pnpm -C apps/desktop build` must print `✓ built in`.
- Write the failing test first, run it red, then change code, then run it green. Every task's first verify command is the red run.
- vitest is node-only: no `document`, no `render`, no `@testing-library`. Guard tests read source text.
- `src/lib/contrast.test.ts` pins ratios at ±0.02 and **reads `index.css`**. Any colour change re-pins in the same commit. Never lower a `min`; only re-pin the `pinned` number.
- Do **not** touch `src/app/QuickAddForm.tsx` or `src/lib/quickadd-submit.ts` (GitHub #29 is in flight on another branch).
- Do **not** edit anything under `.spec/`. Do **not** add dependencies. No Rust changes.
- Functional bug fixes are out of scope. This slice is visual only.
- Keep every `data-*` hook the tests and the a11y pass use (`data-task-row`, `data-filter-chip`, `data-filter-trigger`, `data-display-trigger`, `data-board-column`, `data-collapsed`, `data-task-detail`, `data-active-dot`).
- Commit identity: use the configured git identity (`OpenAI Codex <codex@users.noreply.github.com>` here). Never override it.
- Commit message shape: `type(scope): subject`, imperative, lowercase, no trailing period, subject ≤ 50 chars, scope always `desktop`, then a blank line, then `Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>`.
- The plan file itself is not part of any task commit.

---

## File Structure

```text
apps/desktop/src/index.css                                  # Tasks 1,2,3,4,5: radii, scrim, elevation, motion defaults, type scale, surfaces
apps/desktop/src/components/ui/sidebar.tsx                  # Task 1: SIDEBAR_WIDTH 248px
apps/desktop/src/components/ui/dialog.tsx                   # Task 1: --scrim
apps/desktop/src/components/ui/sheet.tsx                    # Task 1: --scrim
apps/desktop/src/components/ui/alert-dialog.tsx             # Task 1: --scrim
apps/desktop/src/components/ui/badge.tsx                    # Task 1: rounded-4xl -> rounded-full
apps/desktop/src/components/ui/button.tsx                   # Task 1: drop radius hacks
apps/desktop/src/components/ui/toggle.tsx                   # Task 1: drop radius hack
apps/desktop/src/components/ui/toggle-group.tsx             # Task 1: drop radius hacks
apps/desktop/src/components/ui/select.tsx                   # Task 1: drop radius hack
apps/desktop/src/lib/design-tokens.test.ts                  # Task 1: NEW guard
apps/desktop/src/**/*.{ts,tsx}                              # Task 2: shadow-* -> shadow-elevation-*
apps/desktop/src/lib/elevation.test.ts                      # Task 2: NEW guard
apps/desktop/src/lib/motion-defaults.test.ts                # Task 3: NEW guard
apps/desktop/src/components/shared/PageHeader.tsx           # Task 4: display title
apps/desktop/src/components/shared/Avatar.tsx               # Task 4: text-avatar
apps/desktop/src/lib/type-scale.test.ts                     # Task 4: NEW guard
apps/desktop/src/lib/contrast.test.ts                       # Task 5: re-pin + SURFACES
apps/desktop/src/views/settings/SettingsView.tsx            # Tasks 5,10: identity badge, copy
apps/desktop/src/app/QuickAddForm.tsx                       # Task 5: due-week inlined ONLY (no other edit)
apps/desktop/src/components/task/pickers.tsx                # Task 5: due-week inlined
apps/desktop/src/lib/row-tone.test.ts                       # Task 5: NEW guard
apps/desktop/src/components/shared/Kbd.tsx                  # Task 6: borderless tonal cap
apps/desktop/src/lib/kbd.test.ts                            # Task 6: NEW guard
apps/desktop/src/components/task/TaskRow.tsx                # Task 7: row state language
apps/desktop/src/components/task/TaskList.tsx               # Tasks 7,9: group header, sortable transition
apps/desktop/src/components/shared/PriorityCheckbox.tsx     # Task 7: tint only urgent/high
apps/desktop/src/lib/priority.ts                            # Task 7: priorityTinted()
apps/desktop/src/lib/priority.test.ts                       # Task 7: NEW pure test
apps/desktop/src/lib/row-state.test.ts                      # Task 7: NEW guard
apps/desktop/src/app/AppShell.tsx                           # Tasks 8,9: chrome diet, scroll reset + fade
apps/desktop/src/app/Sidebar.tsx                            # Tasks 8,9: head icon, footer rule, counts, pill token
apps/desktop/src/app/CommandPalette.tsx                     # Task 8: legend footer
apps/desktop/src/lib/shell-chrome.test.ts                   # Task 8: NEW guard
apps/desktop/src/components/task/TaskView.tsx               # Task 9: 760px column
apps/desktop/src/components/shared/page-width.ts            # Task 9: list column 760px
apps/desktop/src/lib/motion.test.ts                         # Task 9: extend
apps/desktop/src/lib/copy.ts                                # Task 10: NEW pure module
apps/desktop/src/lib/copy.test.ts                           # Task 10: NEW test
apps/desktop/src/lib/query.ts                               # Task 10: one "Not saved"
apps/desktop/src/components/task/actions.ts                 # Task 10: one "Not saved", drop raw tool name
apps/desktop/src/components/task/DeleteTaskConfirm.tsx      # Task 10: subtask
apps/desktop/src/components/task/GettingStarted.tsx         # Task 10: Copied, Add project
apps/desktop/src/components/task/TaskMenu.tsx               # Task 10: Copied the id
apps/desktop/src/components/task/TaskDetail.tsx             # Task 10: copied(what)
apps/desktop/src/components/task/AddProjectDialog.tsx       # Task 10: Add project
apps/desktop/src/components/memory/MemoryDetail.tsx         # Task 10: copied(what)
apps/desktop/src/components/memory/MemoryDialog.tsx         # Task 10: Add memory
apps/desktop/src/components/shared/open-in.ts               # Task 10: Copied the path
apps/desktop/src/components/scratch/ScratchViewer.tsx       # Task 10: copied(noun)
apps/desktop/src/views/memories/MemoriesView.tsx            # Task 10: Add memory, drop raw tool name
apps/desktop/src/views/scratch/ScratchView.tsx              # Task 10: Add scratchpad, drop raw tool name
```

---

## Requirements Trace

| Slice A item (brief) | Task | Depends on |
|---|---|---|
| 1. Token guard, radii 4/6/8/12, sidebar 248px, scrim 40% | 1 | none |
| 2. Elevation tokens `--elevation-1..3` | 2 | 1 (`index.css` order) |
| 3. Motion defaults 120ms + standard curve | 3 | 2 |
| 4. Type scale tokens + sweep of 201 arbitrary px sizes | 4 | 3 |
| 6. Row tone scale `surface-2`/`surface-3` + retire dead tokens | 5 | 4 |
| 5. Keycap `h-5 min-w-5 rounded-sm px-1.5 text-micro` | 6 | 5 (uses `bg-surface-2`) |
| 7. Task row state language + sticky group header + priority tint | 7 | 5, 6 |
| 8. Shell chrome diet | 8 | 7 (`TaskList` header band) |
| 9. Motion upgrades (route fade, drag curve, sidebar pill) | 9 | 8 (shared `AppShell`/`Sidebar`) |
| 10. Copy consistency | 10 | none (independent files) |
| 11. Final gate and evidence | 11 | 1-10 |

---

## Task 1: Pin the design tokens (radii, sidebar width, scrim)

**Files:**
- Create: `apps/desktop/src/lib/design-tokens.test.ts`
- Modify: `apps/desktop/src/index.css:75-81` (`@theme inline` radii) and `:root`/`.dark` (add `--scrim`)
- Modify: `apps/desktop/src/components/ui/sidebar.tsx:29`
- Modify: `apps/desktop/src/components/ui/dialog.tsx:45`, `sheet.tsx:40`, `alert-dialog.tsx:46`
- Modify: `apps/desktop/src/components/ui/badge.tsx:7`, `button.tsx:25,26,30,32`, `toggle.tsx:20`, `toggle-group.tsx:55,66`, `select.tsx:44`

**Do not touch:** `src/lib/contrast.test.ts` (no colour change in this task), `src/app/QuickAddForm.tsx`, `src/components/ui/calendar.tsx` (its `rounded-(--cell-radius)` vocabulary is deliberately out of scope), anything under `.spec/`.

- [ ] **Step 1: Write the failing guard test**

Create `apps/desktop/src/lib/design-tokens.test.ts`:

```ts
/// <reference types="node" />
/**
 * Design-token pins (programme Slice A, item 1). The spec names literal radii
 * (design.md radii sm 4 / md 6 / lg 8 / xl 12), a 248px sidebar (desktop-app/design.md:75) and a
 * 40% scrim (design.md:118); this pins all three so they cannot drift back.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const CSS = read("../index.css").replace(/\/\*[\s\S]*?\*\//g, "");

function block(selector: string): Map<string, string> {
  const m = new RegExp(`^${selector.replace(".", "\\.")} \\{([\\s\\S]*?)^\\}`, "m").exec(CSS);
  if (!m) throw new Error(`${selector} block missing from index.css`);
  const vars = new Map<string, string>();
  for (const d of m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars.set(d[1], d[2].trim());
  return vars;
}

const ROOT = block(":root");
const DARK = block(".dark");

describe("radius tokens are literal spec steps", () => {
  it.each([
    ["--radius-sm", "4px"],
    ["--radius-md", "6px"],
    ["--radius-lg", "8px"],
    ["--radius-xl", "12px"],
  ])("%s is %s", (name, value) => {
    expect(ROOT.get(name)).toBe(value);
  });
});

describe("sidebar width", () => {
  it("SIDEBAR_WIDTH is 248px", () => {
    expect(read("../components/ui/sidebar.tsx")).toContain('const SIDEBAR_WIDTH = "15.5rem"');
  });
});

describe("overlay scrim", () => {
  it("is 40% in light and stronger in dark", () => {
    expect(ROOT.get("--scrim")).toBe("oklch(0.2 0 0 / 0.4)");
    expect(DARK.get("--scrim")).toBe("oklch(0 0 0 / 0.55)");
  });
  it.each(["dialog", "sheet", "alert-dialog"])("%s overlay uses bg-(--scrim)", (name) => {
    const src = read(`../components/ui/${name}.tsx`);
    expect(src).toContain("bg-(--scrim)");
    expect(src).not.toContain("bg-black/10");
  });
});
```

- [ ] **Step 2: Run it red**

Run: `pnpm -C apps/desktop test -- src/lib/design-tokens.test.ts`
Expected: FAIL. `--radius-sm` resolves to `calc(var(--radius) * 0.6)`, `SIDEBAR_WIDTH` is `"16rem"`, `--scrim` is `undefined`, and the overlays contain `bg-black/10`.

- [ ] **Step 3: Pin the radii**

In `apps/desktop/src/index.css`, replace lines 75-81 (the derived block):

```css
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
```

with:

```css
  /* design.md radii: literal spec steps, never derived (4 / 6 / 8 / 12). */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-2xl: 16px;
  --radius-3xl: 20px;
  --radius-4xl: 24px;
```

Leave `--radius: 0.5rem;` in `:root` (the bare `rounded` utility still reads it).

- [ ] **Step 4: Add the scrim token**

In `apps/desktop/src/index.css`, inside `:root`, after the `--ring` line (`--ring: oklch(0.556 0 0); /* Δ stock 0.708 */`), add:

```css
  --scrim: oklch(0.2 0 0 / 0.4); /* design.md:118, 40% scrim */
```

Inside `.dark`, after `--ring: oklch(0.556 0 0);`, add:

```css
  --scrim: oklch(0 0 0 / 0.55); /* a 40% black scrim is invisible on a near-black page */
```

- [ ] **Step 5: Use the scrim in the three overlays**

`apps/desktop/src/components/ui/dialog.tsx:45`, before:

```tsx
        "fixed inset-0 isolate z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs",
```

after:

```tsx
        "fixed inset-0 isolate z-50 bg-(--scrim) supports-backdrop-filter:backdrop-blur-xs",
```

`apps/desktop/src/components/ui/sheet.tsx:40`, before:

```tsx
      className={cn("fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs", className)}
```

after:

```tsx
      className={cn("fixed inset-0 z-50 bg-(--scrim) supports-backdrop-filter:backdrop-blur-xs", className)}
```

`apps/desktop/src/components/ui/alert-dialog.tsx:46`, before:

```tsx
        "fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs",
```

after:

```tsx
        "fixed inset-0 z-50 bg-(--scrim) supports-backdrop-filter:backdrop-blur-xs",
```

- [ ] **Step 6: Sidebar width**

`apps/desktop/src/components/ui/sidebar.tsx:29`, before `const SIDEBAR_WIDTH = "16rem"`, after `const SIDEBAR_WIDTH = "15.5rem"`.

- [ ] **Step 7: Drop the radius hacks and the pill badge**

`apps/desktop/src/components/ui/badge.tsx:7`: replace `rounded-4xl` with `rounded-full` inside the long `cva` base string (the only occurrence).

`apps/desktop/src/components/ui/button.tsx`: replace `rounded-[min(var(--radius-md),10px)]` with `rounded-md` on lines 25 and 30, and `rounded-[min(var(--radius-md),12px)]` with `rounded-md` on lines 26 and 32. Keep the `in-data-[slot=button-group]:rounded-lg` clauses untouched.

`apps/desktop/src/components/ui/toggle.tsx:20`: `rounded-[min(var(--radius-md),12px)]` -> `rounded-md`.

`apps/desktop/src/components/ui/toggle-group.tsx`: line 55 `data-[size=sm]:rounded-[min(var(--radius-md),10px)]` -> `data-[size=sm]:rounded-md`; line 66 `rounded-[min(var(--radius-md),12px)]` -> `rounded-md`.

`apps/desktop/src/components/ui/select.tsx:44`: `data-[size=sm]:rounded-[min(var(--radius-md),10px)]` -> `data-[size=sm]:rounded-md`.

Note: `--radius-md` is now literally 6px, so these replacements change a 6.4px corner to 6px. That is the intended, "obviously equal" case.

- [ ] **Step 8: Run it green, then the whole suite**

Run: `pnpm -C apps/desktop test -- src/lib/design-tokens.test.ts`
Expected: PASS, `Tests 9 passed (9)`.

Run: `pnpm -C apps/desktop test`
Expected: `Test Files 36 passed (36)`, `Tests 539 passed (539)` (530 + 9).

Run: `pnpm -C apps/desktop lint` -> `Found 25 warnings and 0 errors.`
Run: `pnpm -C apps/desktop build` -> `✓ built in`.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/lib/design-tokens.test.ts apps/desktop/src/index.css \
  apps/desktop/src/components/ui/sidebar.tsx apps/desktop/src/components/ui/dialog.tsx \
  apps/desktop/src/components/ui/sheet.tsx apps/desktop/src/components/ui/alert-dialog.tsx \
  apps/desktop/src/components/ui/badge.tsx apps/desktop/src/components/ui/button.tsx \
  apps/desktop/src/components/ui/toggle.tsx apps/desktop/src/components/ui/toggle-group.tsx \
  apps/desktop/src/components/ui/select.tsx
git commit -m "$(cat <<'EOF'
feat(desktop): pin radii, sidebar width and scrim

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>
EOF
)"
```

---

## Task 2: Elevation tokens

**Files:**
- Create: `apps/desktop/src/lib/elevation.test.ts`
- Modify: `apps/desktop/src/index.css` (`:root`, `.dark`, `@theme inline`)
- Modify: every `src/**` file listed by `rg -n 'shadow-(xs|sm|md|lg|xl|2xl)\b' src` (32 sites)

**Do not touch:** `src/lib/contrast.test.ts` (shadows are not colour tokens), any `shadow-none` occurrence (the guard does not cover it; several are deliberate cancellations, e.g. `src/components/ui/command.tsx:72` `shadow-none!`, `src/components/ui/tabs.tsx:65` `data-active:shadow-none`, `src/components/ui/input-group.tsx:67,123,139`, `src/components/memory/MemoryDetail.tsx:215,362`). Delete `shadow-none` only at `src/components/ui/sidebar.tsx:325` (a skeleton with nothing to cancel).

- [ ] **Step 1: Write the failing guard test**

Create `apps/desktop/src/lib/elevation.test.ts`:

```ts
/// <reference types="node" />
/**
 * Elevation guard (programme Slice A, item 2). Three named steps replace seven ad-hoc shadow
 * utilities, and no raw Tailwind shadow utility may remain in the app source.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const CSS = readFileSync(join(SRC, "index.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    if (!/\.(tsx?|jsx?)$/.test(e.name) || /\.test\.(ts|tsx)$/.test(e.name)) return [];
    return [p];
  });
}

describe("elevation tokens", () => {
  it("defines three steps in both themes and exposes them as shadow utilities", () => {
    for (const n of [1, 2, 3]) {
      expect(CSS).toContain(`--elevation-${n}:`);
      expect(CSS).toContain(`--shadow-elevation-${n}: var(--elevation-${n});`);
    }
    expect(CSS).toMatch(/^\.dark \{[\s\S]*--elevation-3:/m);
  });

  it("leaves no raw shadow-xs/sm/md/lg/xl/2xl utility in src", () => {
    const bad = sourceFiles(SRC)
      .map((f) => ({ file: relative(SRC, f), hits: [...readFileSync(f, "utf8").matchAll(/shadow-(xs|sm|md|lg|xl|2xl)(?![\w-])/g)].map((m) => m[0]) }))
      .filter((v) => v.hits.length > 0)
      .map((v) => `${v.file}: ${[...new Set(v.hits)].join(", ")}`);
    expect(bad).toEqual([]);
  });

  it("has no bare shadow-xl utility left", () => {
    expect(CSS.includes("shadow-xl")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it red**

Run: `pnpm -C apps/desktop test -- src/lib/elevation.test.ts`
Expected: FAIL on all three cases. `--elevation-1:` is undefined and the scan lists the 32 sites (for example `views/tasks/SearchView.tsx: shadow-xs`).

- [ ] **Step 3: Add the tokens**

In `apps/desktop/src/index.css`, inside `:root`, after the `--scrim` line, add:

```css
  /* Elevation: floating layers only (design.md:117). Regions never carry a shadow. */
  --elevation-1: 0 1px 2px oklch(0.2 0 0 / 0.05), 0 1px 1px oklch(0.2 0 0 / 0.04);
  --elevation-2: 0 4px 10px -2px oklch(0.2 0 0 / 0.1), 0 2px 4px -2px oklch(0.2 0 0 / 0.05);
  --elevation-3: 0 14px 40px -8px oklch(0.2 0 0 / 0.18), 0 2px 6px -2px oklch(0.2 0 0 / 0.08);
```

Inside `.dark`, after the `--scrim` line, add (shadows barely read on near-black, so the lift comes from a top edge highlight):

```css
  --elevation-1: 0 1px 2px oklch(0 0 0 / 0.4);
  --elevation-2: 0 6px 16px -4px oklch(0 0 0 / 0.55), inset 0 1px 0 oklch(1 0 0 / 0.05);
  --elevation-3: 0 20px 48px -12px oklch(0 0 0 / 0.65), inset 0 1px 0 oklch(1 0 0 / 0.07);
```

Inside the `@theme inline` block, after the `--animate-pulse-dot` line, add:

```css
  --shadow-elevation-1: var(--elevation-1);
  --shadow-elevation-2: var(--elevation-2);
  --shadow-elevation-3: var(--elevation-3);
```

- [ ] **Step 4: Migrate the utilities**

Run this from the repo root (it only rewrites the exact utility tokens, and never touches `shadow-none`):

```bash
cd apps/desktop && FILES=$(rg -l 'shadow-(xs|sm|md|lg|2xl)\b' src) && \
perl -pi -e 's/\bshadow-(xs|sm)\b/shadow-elevation-1/g; s/\bshadow-md\b/shadow-elevation-2/g; s/\bshadow-(lg|2xl)\b/shadow-elevation-3/g' $FILES && \
rg -n 'shadow-(xs|sm|md|lg|xl|2xl)\b' src || echo "migrated"
```

Expected: `migrated`, with 32 rewritten occurrences across 22 files. Spot-check three by hand: `src/app/QuickAdd.tsx:40` (`shadow-2xl` -> `shadow-elevation-3`), `src/components/ui/popover.tsx:39` (`shadow-md` -> `shadow-elevation-2`), `src/components/task/TaskRow.tsx:327` (`shadow-xs ... hover:shadow-sm` -> `shadow-elevation-1 ... hover:shadow-elevation-1`).

Then delete the dead `shadow-none` in `src/components/ui/sidebar.tsx:325`: `"h-8 w-full bg-background shadow-none"` -> `"h-8 w-full bg-background"`.

- [ ] **Step 5: Run it green, then the whole suite**

Run: `pnpm -C apps/desktop test -- src/lib/elevation.test.ts`
Expected: PASS, `Tests 3 passed (3)`.

Run: `pnpm -C apps/desktop test` -> `Test Files 37 passed (37)`, `Tests 542 passed (542)`.
Run: `pnpm -C apps/desktop lint` -> `Found 25 warnings and 0 errors.`
Run: `pnpm -C apps/desktop build` -> `✓ built in`.

- [ ] **Step 6: Commit**

```bash
git add -A apps/desktop/src
git commit -m "$(cat <<'EOF'
feat(desktop): add elevation shadow tokens

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>
EOF
)"
```

---

## Task 3: Motion defaults

**Files:**
- Create: `apps/desktop/src/lib/motion-defaults.test.ts`
- Modify: `apps/desktop/src/index.css` (`@theme inline`)

**Do not touch:** `src/components/animate-ui/motion-tokens.ts` (its `fast/base/slow` values are already correct and are asserted here, not changed), any `transition-*` or `duration-*` utility (that sweep is out of scope for this slice).

- [ ] **Step 1: Write the failing guard test**

Create `apps/desktop/src/lib/motion-defaults.test.ts`:

```ts
/// <reference types="node" />
/**
 * Motion defaults (programme Slice A, item 3). A bare Tailwind `transition-*` must speak the
 * spec's `fast` token (120ms, cubic-bezier(0.2, 0, 0, 1)) instead of Tailwind's stock
 * 150ms cubic-bezier(0.4, 0, 0.2, 1). The `motion` tokens stay in sync.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const CSS = read("../index.css").replace(/\/\*[\s\S]*?\*\//g, "");
const TOKENS = read("../components/animate-ui/motion-tokens.ts");

describe("tailwind default transition", () => {
  it("is the spec fast token", () => {
    expect(CSS).toContain("--default-transition-duration: 120ms;");
    expect(CSS).toContain("--default-transition-timing-function: cubic-bezier(0.2, 0, 0, 1);");
  });

  it("exposes the standard curve as an ease utility", () => {
    expect(CSS).toContain("--ease-standard: cubic-bezier(0.2, 0, 0, 1);");
  });
});

describe("motion tokens", () => {
  it("still matches the spec durations", () => {
    expect(TOKENS).toMatch(/fast:\s*0\.12/);
    expect(TOKENS).toMatch(/base:\s*0\.2\b/);
    expect(TOKENS).toMatch(/slow:\s*0\.3\b/);
  });
});
```

- [ ] **Step 2: Run it red**

Run: `pnpm -C apps/desktop test -- src/lib/motion-defaults.test.ts`
Expected: FAIL on the first two cases (`--default-transition-duration` is absent); the third PASSES (that is the point: it pins the values that must not move).

- [ ] **Step 3: Set the defaults**

In `apps/desktop/src/index.css`, inside `@theme inline`, after the three `--shadow-elevation-*` lines, add:

```css
  /* Bare Tailwind transitions speak the spec's `fast` token, not Tailwind's 150ms default. */
  --default-transition-duration: 120ms;
  --default-transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
```

- [ ] **Step 4: Run it green, then the whole suite**

Run: `pnpm -C apps/desktop test -- src/lib/motion-defaults.test.ts`
Expected: PASS, `Tests 3 passed (3)`.

Run: `pnpm -C apps/desktop test` -> `Test Files 38 passed (38)`, `Tests 545 passed (545)`.
Run: `pnpm -C apps/desktop lint` -> `Found 25 warnings and 0 errors.`
Run: `pnpm -C apps/desktop build` -> `✓ built in`.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/lib/motion-defaults.test.ts apps/desktop/src/index.css
git commit -m "$(cat <<'EOF'
feat(desktop): set default transition to 120ms

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>
EOF
)"
```

---

## Task 4: One type scale, and a sweep of all 201 arbitrary sizes

This is the largest diff in the slice and gets its own commit. It touches 46 files.

**Files:**
- Create: `apps/desktop/src/lib/type-scale.test.ts`
- Modify: `apps/desktop/src/index.css` (`@theme inline`)
- Modify: `apps/desktop/src/components/shared/PageHeader.tsx:24`
- Modify: `apps/desktop/src/components/shared/Avatar.tsx:12,13,14,87`
- Modify: all 46 files matched by `rg -l 'text-\[[0-9.]+px\]' src` (201 occurrences)

**Do not touch:** colour tokens, shadow utilities, `src/lib/contrast.test.ts` (type sizes are not pinned there), the four `text-[0.8rem]` occurrences (they are 12.8px, above the floor, and are not px literals), `src/app/QuickAddForm.tsx`.

- [ ] **Step 1: Write the failing guard test**

Create `apps/desktop/src/lib/type-scale.test.ts`:

```ts
/// <reference types="node" />
/**
 * Type scale (programme Slice A, item 4, decision D2: the floor is 12px). Seven named steps
 * replace 15 arbitrary pixel sizes in 201 places. Avatar initials keep one named token because
 * a 2-3 character glyph is the one place a smaller step is honest.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const CSS = readFileSync(join(SRC, "index.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    if (!/\.(tsx?|jsx?)$/.test(e.name) || /\.test\.(ts|tsx)$/.test(e.name)) return [];
    return [p];
  });
}

describe("type tokens", () => {
  it.each([
    ["--text-micro", "0.75rem", "1rem"], // 12 / 16
    ["--text-small", "0.8125rem", "1.125rem"], // 13 / 18
    ["--text-body", "0.875rem", "1.25rem"], // 14 / 20
    ["--text-heading", "0.9375rem", "1.375rem"], // 15 / 22
    ["--text-title", "1.125rem", "1.625rem"], // 18 / 26
    ["--text-display", "1.5rem", "2rem"], // 24 / 32
    ["--text-avatar", "0.625rem", "1"], // 10, initials only
  ])("%s is %s / %s", (name, size, leading) => {
    expect(CSS).toContain(`${name}: ${size};`);
    expect(CSS).toContain(`${name}--line-height: ${leading};`);
  });

  it("leaves no arbitrary pixel text size in src", () => {
    const bad = sourceFiles(SRC)
      .map((f) => ({ file: relative(SRC, f), hits: [...readFileSync(f, "utf8").matchAll(/text-\[[0-9.]+px\]/g)].map((m) => m[0]) }))
      .filter((v) => v.hits.length > 0)
      .map((v) => `${v.file}: ${[...new Set(v.hits)].join(", ")}`);
    expect(bad).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it red**

Run: `pnpm -C apps/desktop test -- src/lib/type-scale.test.ts`
Expected: FAIL. All seven token cases fail, and the scan lists 46 files with 201 occurrences.

- [ ] **Step 3: Add the tokens**

In `apps/desktop/src/index.css`, inside `@theme inline`, after the `--ease-standard` line, add:

```css
  /* design.md type roles. Nothing below 12px except avatar initials (decision D2). */
  --text-micro: 0.75rem;
  --text-micro--line-height: 1rem;
  --text-small: 0.8125rem;
  --text-small--line-height: 1.125rem;
  --text-body: 0.875rem;
  --text-body--line-height: 1.25rem;
  --text-heading: 0.9375rem;
  --text-heading--line-height: 1.375rem;
  --text-title: 1.125rem;
  --text-title--line-height: 1.625rem;
  --text-display: 1.5rem;
  --text-display--line-height: 2rem;
  --text-avatar: 0.625rem;
  --text-avatar--line-height: 1;
```

- [ ] **Step 4: Avatar first (the one file that keeps a named small token)**

`apps/desktop/src/components/shared/Avatar.tsx`, before:

```tsx
  xs: { box: "size-4", text: "text-[8px]", icon: "size-2.5" },
  sm: { box: "size-5", text: "text-[9px]", icon: "size-3" },
  md: { box: "size-7", text: "text-[11px]", icon: "size-4" },
```

after:

```tsx
  xs: { box: "size-4", text: "text-avatar", icon: "size-2.5" },
  sm: { box: "size-5", text: "text-avatar", icon: "size-3" },
  md: { box: "size-7", text: "text-avatar", icon: "size-4" },
```

and line 87, before:

```tsx
        <span className={cn("inline-flex items-center justify-center rounded-full bg-muted text-[9px] font-medium text-muted-foreground ring-2 ring-background", SIZE[size].box)}>
```

after:

```tsx
        <span className={cn("inline-flex items-center justify-center rounded-full bg-muted text-avatar font-medium text-muted-foreground ring-2 ring-background", SIZE[size].box)}>
```

- [ ] **Step 5: Sweep the rest**

From the repo root, run these in order (each pattern matches only a complete `text-[Npx]` utility):

```bash
cd apps/desktop
perl -pi -e 's/text-\[(8|9|10|10\.5|11|11\.5|12|12\.5)px\]/text-micro/g' $(rg -l 'text-\[(8|9|10|10\.5|11|11\.5|12|12\.5)px\]' src)
perl -pi -e 's/text-\[(13|13\.5)px\]/text-small/g' $(rg -l 'text-\[(13|13\.5)px\]' src)
perl -pi -e 's/text-\[(14|14\.5)px\]/text-body/g' $(rg -l 'text-\[(14|14\.5)px\]' src)
perl -pi -e 's/text-\[15px\]/text-heading/g' $(rg -l 'text-\[15px\]' src)
perl -pi -e 's/text-\[18px\]/text-title/g' $(rg -l 'text-\[18px\]' src)
perl -pi -e 's/text-\[22px\]/text-display/g' $(rg -l 'text-\[22px\]' src)
rg -n 'text-\[[0-9.]+px\]' src || echo "swept"
```

Expected: `swept`. Mapping (201 occurrences): micro 92 (minus the 4 avatar sites, already done) = 88, small 82, body 14, heading 11, title 1, display 1.

- [ ] **Step 6: The page title gets a real display step**

`apps/desktop/src/components/shared/PageHeader.tsx:24`, before:

```tsx
        <h1 className="flex items-center gap-2 text-[22px] leading-8 font-bold tracking-tight">
```

after (this file was swept to `text-display` in Step 5; the change here is weight and tracking):

```tsx
        <h1 className="flex items-center gap-2 text-display font-semibold tracking-[-0.02em]">
```

- [ ] **Step 7: Run it green, then the whole suite**

Run: `pnpm -C apps/desktop test -- src/lib/type-scale.test.ts`
Expected: PASS, `Tests 8 passed (8)`.

Run: `pnpm -C apps/desktop test` -> `Test Files 39 passed (39)`, `Tests 553 passed (553)`.
Run: `pnpm -C apps/desktop lint` -> `Found 25 warnings and 0 errors.`
Run: `pnpm -C apps/desktop build` -> `✓ built in`.

- [ ] **Step 8: Commit (alone)**

```bash
git add -A apps/desktop/src
git commit -m "$(cat <<'EOF'
refactor(desktop): sweep arbitrary type to tokens

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>
EOF
)"
```

---

## Task 5: Row tone scale (`surface-2` / `surface-3`) and retiring the dead tokens

**Files:**
- Create: `apps/desktop/src/lib/row-tone.test.ts`
- Modify: `apps/desktop/src/index.css` (`@theme inline` + `:root` + `.dark`)
- Modify: `apps/desktop/src/lib/contrast.test.ts` (`SURFACES` + 76 new pins + 4 new ring rows)
- Modify: `apps/desktop/src/app/QuickAddForm.tsx:101` (one string only), `src/components/task/pickers.tsx:56`, `src/views/settings/SettingsView.tsx:352`

**Do not touch:** `--accent`, `--muted`, `--muted-foreground`, `--foreground`, `--ring` values; any semantic token value; any `min` in `contrast.test.ts`; `src/app/QuickAddForm.tsx` beyond the single `due-week` string.

**Colour decision, with the numbers (computed with the repo's own oklch -> WCAG math):** the binding constraint is `--status-awaiting` in light, which measures exactly 4.50:1 on a `surface-3` of `oklch(0.96)` and 4.56:1 at `0.965`. So the light selected tone cannot go below ~0.96 without either failing AA for semantic text on a selected row or changing a semantic token (out of scope). Dark can go either way, and the values below also keep the focus ring at 3.08:1 or better.

| token | light | dark | role |
|---|---|---|---|
| `--surface-2` | `oklch(0.98 0 0)` | `oklch(0.28 0 0)` | hover |
| `--surface-3` | `oklch(0.965 0 0)` | `oklch(0.245 0 0)` | selected / picked |
| `--accent` (unchanged) | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` | legacy alias target |

All three are distinct in both themes. In light, selected is a deeper step than hover; in dark, selected sits closer to the page ground, which is the same "deeper" relationship.

- [ ] **Step 1: Write the failing guard test**

Create `apps/desktop/src/lib/row-tone.test.ts`:

```ts
/// <reference types="node" />
/**
 * Row tone scale (programme Slice A, item 6). Hover, selected and the legacy `accent` must be
 * three different tones, and the retired tokens must be gone.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const CSS = read("../index.css").replace(/\/\*[\s\S]*?\*\//g, "");

function block(selector: string): Map<string, string> {
  const m = new RegExp(`^${selector.replace(".", "\\.")} \\{([\\s\\S]*?)^\\}`, "m").exec(CSS);
  if (!m) throw new Error(`${selector} block missing from index.css`);
  const vars = new Map<string, string>();
  for (const d of m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars.set(d[1], d[2].trim());
  return vars;
}
const ROOT = block(":root");
const DARK = block(".dark");

describe("surface tones", () => {
  it.each([
    ["--surface-2", "oklch(0.98 0 0)"],
    ["--surface-3", "oklch(0.965 0 0)"],
  ])("light %s is %s", (name, value) => {
    expect(ROOT.get(name)).toBe(value);
  });

  it.each([
    ["--surface-2", "oklch(0.28 0 0)"],
    ["--surface-3", "oklch(0.245 0 0)"],
  ])("dark %s is %s", (name, value) => {
    expect(DARK.get(name)).toBe(value);
  });

  it("keeps hover, selected and accent distinct", () => {
    for (const theme of [ROOT, DARK]) {
      const tones = [theme.get("--surface-2"), theme.get("--surface-3"), theme.get("--accent")];
      expect(new Set(tones).size).toBe(3);
    }
  });

  it("aliases the row states to the new scale", () => {
    expect(ROOT.get("--row-hover")).toBe("var(--surface-2)");
    expect(ROOT.get("--row-selected")).toBe("var(--surface-3)");
  });

  it("retires the dead tokens", () => {
    for (const dead of ["--brand:", "--brand-soft:", "--primary-soft:", "--due-week:", "--surface-header:", "--identity-human:", "--identity-agent:"]) {
      expect(CSS.includes(dead)).toBe(false);
    }
    expect(CSS.includes("--color-brand:")).toBe(false);
    expect(CSS.includes("--color-surface-header:")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it red**

Run: `pnpm -C apps/desktop test -- src/lib/row-tone.test.ts`
Expected: FAIL. `--surface-2` is `undefined`, `--row-hover` is `var(--accent)`, and every dead token is still present.

- [ ] **Step 3: Add the tones, alias the row states, delete the dead tokens**

In `apps/desktop/src/index.css`, in `:root`, replace:

```css
  --surface-header: var(--sidebar);
  --row-hover: var(--accent);
```

with:

```css
  /* One state language for rows: hover is a whisper, selected is a deeper step (design.md:116). */
  --surface-2: oklch(0.98 0 0);
  --surface-3: oklch(0.965 0 0);
  --row-hover: var(--surface-2);
  --row-selected: var(--surface-3);
```

and delete the whole "Retired accents" block:

```css
  /* Retired accents, re-pointed to their monochrome replacements (research-b § "What replaces
     violet"); desktop-app/41 removes the remaining call sites. */
  --brand: var(--accent);
  --brand-soft: var(--accent);
  --primary-soft: var(--accent);
  --due-week: var(--muted-foreground);
  --identity-human: var(--foreground);
  --identity-agent: var(--foreground);
```

In `.dark`, after the `--elevation-3` line, add:

```css
  --surface-2: oklch(0.28 0 0);
  --surface-3: oklch(0.245 0 0);
```

In the `@theme inline` block, replace:

```css
  --color-surface-header: var(--surface-header);
  --color-row-hover: var(--row-hover);
```

with:

```css
  --color-surface-2: var(--surface-2);
  --color-surface-3: var(--surface-3);
  --color-row-hover: var(--row-hover);
  --color-row-selected: var(--row-selected);
```

and delete these three lines from the `@theme inline` block:

```css
  --color-brand: var(--brand);
  --color-brand-soft: var(--brand-soft);
  --color-primary-soft: var(--primary-soft);
```

and this one:

```css
  --color-due-week: var(--due-week);
```

- [ ] **Step 4: Inline the three real call sites**

`apps/desktop/src/app/QuickAddForm.tsx:101`, before:

```tsx
    ["Next week", addDays(today, 7), CalendarRangeIcon, "text-due-week"],
```

after:

```tsx
    ["Next week", addDays(today, 7), CalendarRangeIcon, "text-muted-foreground"],
```

`apps/desktop/src/components/task/pickers.tsx:56`, before:

```tsx
    { label: "Next week", date: nextMonday(today), icon: CalendarArrowUpIcon, tone: "text-due-week" },
```

after:

```tsx
    { label: "Next week", date: nextMonday(today), icon: CalendarArrowUpIcon, tone: "text-muted-foreground" },
```

`apps/desktop/src/views/settings/SettingsView.tsx:352`, before:

```tsx
                      m.kind === "agent" ? "bg-identity-agent/12 text-identity-agent" : "bg-identity-human/12 text-identity-human",
```

after:

```tsx
                      m.kind === "agent" ? "bg-muted text-foreground" : "bg-muted text-muted-foreground",
```

- [ ] **Step 5: Extend and re-pin the contrast table**

In `apps/desktop/src/lib/contrast.test.ts`:

(a) Extend `SURFACES`:

```ts
// Surfaces a text token sits on: content, navigation, hover/selected row.
const SURFACES = ["background", "sidebar", "accent", "surface-2", "surface-3"] as const;
```

(b) Add the 72 new `SEMANTIC_TEXT` pins (light then dark), each row now `[background, sidebar, accent, surface-2, surface-3]`:

```ts
  light: {
    "priority-urgent": [6.42, 6.15, 5.89, 6.06, 5.8],
    "priority-high": [5.23, 5.01, 4.79, 4.94, 4.72],
    "priority-normal": [5.26, 5.03, 4.82, 4.96, 4.75],
    "priority-low": [5.51, 5.28, 5.05, 5.2, 4.98],
    "due-overdue": [6.42, 6.15, 5.89, 6.06, 5.8],
    "due-today": [7.09, 6.79, 6.5, 6.7, 6.41],
    "due-tomorrow": [19.79, 18.96, 18.16, 18.68, 17.88],
    "due-later": [5.51, 5.28, 5.05, 5.2, 4.98],
    "status-queued": [5.51, 5.28, 5.05, 5.2, 4.98],
    "status-working": [5.26, 5.03, 4.82, 4.96, 4.75],
    "status-awaiting": [5.05, 4.84, 4.63, 4.77, 4.56],
    "status-done": [7.09, 6.79, 6.5, 6.7, 6.41],
    "status-error": [6.42, 6.15, 5.89, 6.06, 5.8],
    destructive: [6.42, 6.15, 5.89, 6.06, 5.8],
    info: [5.26, 5.03, 4.82, 4.96, 4.75],
    danger: [6.42, 6.15, 5.89, 6.06, 5.8],
    "muted-foreground": [5.51, 5.28, 5.05, 5.2, 4.98],
    foreground: [19.79, 18.96, 18.16, 18.68, 17.88],
  },
  dark: {
    "priority-urgent": [6.84, 6.19, 5.23, 5.05, 5.61],
    "priority-high": [8.32, 7.53, 6.35, 6.13, 6.82],
    "priority-normal": [7.51, 6.79, 5.73, 5.53, 6.15],
    "priority-low": [7.63, 6.91, 5.83, 5.63, 6.26],
    "due-overdue": [6.84, 6.19, 5.23, 5.05, 5.61],
    "due-today": [8.9, 8.06, 6.8, 6.56, 7.3],
    "due-tomorrow": [18.96, 17.16, 14.48, 13.98, 15.54],
    "due-later": [7.63, 6.91, 5.83, 5.63, 6.26],
    "status-queued": [7.63, 6.91, 5.83, 5.63, 6.26],
    "status-working": [7.51, 6.79, 5.73, 5.53, 6.15],
    "status-awaiting": [11.53, 10.43, 8.8, 8.5, 9.45],
    "status-done": [8.9, 8.06, 6.8, 6.56, 7.3],
    "status-error": [6.84, 6.19, 5.23, 5.05, 5.61],
    destructive: [6.84, 6.19, 5.23, 5.05, 5.61],
    info: [7.51, 6.79, 5.73, 5.53, 6.15],
    danger: [6.84, 6.19, 5.23, 5.05, 5.61],
    "muted-foreground": [7.63, 6.91, 5.83, 5.63, 6.26],
    foreground: [18.96, 17.16, 14.48, 13.98, 15.54],
  },
```

Leave the first three values of each row exactly as they are today (they are already pinned and my recomputation matches them to within 0.01). Only append the two new values.

(c) Add four ring rows at the end of `ROWS`, after the existing `["ring", "accent", "dark", NON_TEXT, 3.19]` line:

```ts
  ["ring", "surface-2", "light", NON_TEXT, 4.47],
  ["ring", "surface-3", "light", NON_TEXT, 4.28],
  ["ring", "surface-2", "dark", NON_TEXT, 3.08],
  ["ring", "surface-3", "dark", NON_TEXT, 3.43],
```

- [ ] **Step 6: Run the whole suite green**

Run: `pnpm -C apps/desktop test -- src/lib/contrast.test.ts`
Expected: PASS. The row count grows from 128 to 204, so vitest reports `Tests 204 passed (204)` for this file (was 128).

Run: `pnpm -C apps/desktop test -- src/lib/row-tone.test.ts` -> PASS, `Tests 8 passed (8)`.
Run: `pnpm -C apps/desktop test` -> `Test Files 40 passed (40)`, `Tests 637 passed (637)` (553 + 8 + 76).
Run: `pnpm -C apps/desktop lint` -> `Found 25 warnings and 0 errors.`
Run: `pnpm -C apps/desktop build` -> `✓ built in`.

- [ ] **Step 7: Commit**

```bash
git add -A apps/desktop/src
git commit -m "$(cat <<'EOF'
feat(desktop): add row surface tones

Retire the brand, primary-soft, due-week, surface-header and identity aliases.

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>
EOF
)"
```

---

## Task 6: A borderless tonal keycap

**Files:**
- Create: `apps/desktop/src/lib/kbd.test.ts`
- Modify: `apps/desktop/src/components/shared/Kbd.tsx`

**Do not touch:** the `inverted` variant's class string (keep it working), `aria-hidden` (the caps have none today; do not add or remove one), `src/components/ui/tooltip.tsx` (its `**:data-[slot=kbd]:rounded-sm` still matches `rounded-sm`).

- [ ] **Step 1: Write the failing guard test**

Create `apps/desktop/src/lib/kbd.test.ts`:

```ts
/// <reference types="node" />
/**
 * Keycap guard (programme Slice A, item 5). One borderless tonal cap, one size, text-micro.
 * The `inverted` variant stays for use on filled surfaces.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(fileURLToPath(new URL("../components/shared/Kbd.tsx", import.meta.url)), "utf8");

describe("keycap", () => {
  it("is one size and uses the micro type step", () => {
    expect(SRC).toContain("h-5 min-w-5");
    expect(SRC).toContain("rounded-sm");
    expect(SRC).toContain("px-1.5");
    expect(SRC).toContain("text-micro");
  });

  it("has no border and no arbitrary type size", () => {
    expect(SRC).not.toMatch(/\bborder\b(?!-)/);
    expect(SRC).not.toMatch(/text-\[/);
  });

  it("keeps the inverted variant", () => {
    expect(SRC).toContain("inverted");
    expect(SRC).toContain("border-white/25 bg-white/15 text-current");
  });
});
```

Note: the second case asserts no bare `border` utility; the `inverted` string contains `border-white/25`, which does not match `\bborder\b(?!-)` because it is followed by `-`.

- [ ] **Step 2: Run it red**

Run: `pnpm -C apps/desktop test -- src/lib/kbd.test.ts`
Expected: FAIL. The file has `h-[18px] min-w-[18px] rounded-[4px] border px-1 ... text-[10.5px]` (after Task 4 the type is `text-micro`), so the size, border and arbitrary-type cases fail.

- [ ] **Step 3: Restyle the cap**

`apps/desktop/src/components/shared/Kbd.tsx`, replace the `kbd` element's class expression (currently, after Task 4):

```tsx
          <kbd
            key={i}
            className={cn(
              "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border px-1 font-sans text-micro leading-none font-medium",
              inverted
                ? "border-white/25 bg-white/15 text-current"
                : "border-border bg-muted text-foreground shadow-[inset_0_-1px_0_var(--border)]",
            )}
          >
```

with:

```tsx
          <kbd
            key={i}
            className={cn(
              "inline-flex h-5 min-w-5 items-center justify-center rounded-sm px-1.5 font-sans text-micro leading-none font-medium",
              inverted ? "border border-white/25 bg-white/15 text-current" : "bg-surface-2 text-muted-foreground",
            )}
          >
```

and the `then` divider, before:

```tsx
          <span key={i} className="px-0.5 text-micro text-foreground">
```

after:

```tsx
          <span key={i} className="px-0.5 text-micro text-muted-foreground/60">
```

- [ ] **Step 4: Run it green, then the whole suite**

Run: `pnpm -C apps/desktop test -- src/lib/kbd.test.ts`
Expected: PASS, `Tests 3 passed (3)`.

Run: `pnpm -C apps/desktop test` -> `Test Files 41 passed (41)`, `Tests 640 passed (640)`.
Run: `pnpm -C apps/desktop lint` -> `Found 25 warnings and 0 errors.`
Run: `pnpm -C apps/desktop build` -> `✓ built in`.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/lib/kbd.test.ts apps/desktop/src/components/shared/Kbd.tsx
git commit -m "$(cat <<'EOF'
refactor(desktop): make the keycap tonal

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>
EOF
)"
```

---

## Task 7: Task row state language, sticky group headers, priority tint

**Files:**
- Create: `apps/desktop/src/lib/priority.test.ts`, `apps/desktop/src/lib/row-state.test.ts`
- Modify: `apps/desktop/src/lib/priority.ts`
- Modify: `apps/desktop/src/components/shared/PriorityCheckbox.tsx:36`
- Modify: `apps/desktop/src/components/task/TaskRow.tsx:324-338`
- Modify: `apps/desktop/src/components/task/TaskList.tsx:399-429`

**Do not touch:** `[data-task-row]` (the a11y runner measures it at 100% and 200% zoom), `RowPickerPopover`, the `ContextMenu` wrapper, `src/components/task/selection.ts` (the completion timing change is not in this slice), the board card variant's `border` (`TaskRow.tsx:327` keeps `rounded-lg border bg-card`), `spec.actions` inside group headers (for example Today's `Reschedule` button).

- [ ] **Step 1: Write the failing tests**

Create `apps/desktop/src/lib/priority.test.ts`:

```ts
/// <reference types="node" />
/**
 * Priority tint decision (programme Slice A, item 7). Colour is loud only at the top of the
 * scale: urgent and high tint the checkbox ring, everything else stays neutral.
 */
import { describe, expect, it } from "vitest";
import { priorityTinted } from "./priority";

describe("priorityTinted", () => {
  it("tints urgent and high", () => {
    expect(priorityTinted("urgent")).toBe(true);
    expect(priorityTinted("high")).toBe(true);
  });

  it("leaves normal and low neutral", () => {
    expect(priorityTinted("normal")).toBe(false);
    expect(priorityTinted("low")).toBe(false);
  });

  it("leaves an unset or unknown priority neutral", () => {
    expect(priorityTinted(null)).toBe(false);
    expect(priorityTinted(undefined)).toBe(false);
    expect(priorityTinted("")).toBe(false);
    expect(priorityTinted("p1")).toBe(false);
  });
});
```

Create `apps/desktop/src/lib/row-state.test.ts`:

```ts
/// <reference types="node" />
/**
 * Row and group-header state language (programme Slice A, item 7). One fill for hover, one for
 * selected/picked, no per-row hairline, and a sticky translucent group band.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("task row", () => {
  const row = read("../components/task/TaskRow.tsx");

  it("uses the row tones for hover and selection", () => {
    expect(row).toContain("hover:bg-row-hover");
    expect(row).toContain("bg-row-selected");
    expect(row).not.toContain("bg-accent before:absolute");
  });

  it("drops the list-row hairline but keeps the board card border", () => {
    expect(row).not.toContain("border-b border-border/70");
    expect(row).toContain("rounded-lg border bg-card px-3 py-2.5");
  });
});

describe("group header", () => {
  const list = read("../components/task/TaskList.tsx");

  it("is sticky, translucent and borderless", () => {
    expect(list).toContain("sticky top-0 z-10");
    expect(list).toContain("bg-background/85");
    expect(list).not.toContain("border-b border-border/80");
  });

  it("renders the count as a muted dot-N and makes the header one button", () => {
    expect(list).toContain("· {count}");
    expect(list).toMatch(/<button[\s\S]{0,400}aria-expanded=\{!collapsed\}/);
  });
});
```

- [ ] **Step 2: Run them red**

Run: `pnpm -C apps/desktop test -- src/lib/priority.test.ts src/lib/row-state.test.ts`
Expected: FAIL. `priorityTinted` is not exported, and the row/header strings are the old ones.

- [ ] **Step 3: Extract the tint decision**

`apps/desktop/src/lib/priority.ts`, add at the end (after `priorityRank`):

```ts
/**
 * Colour is loud only at the top of the scale: `urgent` and `high` tint the checkbox ring;
 * `normal`, `low` and an unset priority stay neutral, so blue stops meaning "has a priority".
 */
export function priorityTinted(p: string | null | undefined): boolean {
  const meta = priorityMeta(p);
  return meta.value === "urgent" || meta.value === "high";
}
```

`apps/desktop/src/components/shared/PriorityCheckbox.tsx:36`, before:

```tsx
  const tinted = m && m.value !== "low";
```

after:

```tsx
  const tinted = m ? priorityTinted(priority) : false;
```

and update the import on line 3, before:

```tsx
import { priorityMeta } from "@/lib/priority";
```

after:

```tsx
import { priorityMeta, priorityTinted } from "@/lib/priority";
```

- [ ] **Step 4: One state language for the row**

`apps/desktop/src/components/task/TaskRow.tsx`, replace the class expression at lines 324-338. Today (after Task 2 migrated the shadows):

```tsx
      className={cn(
        "group/row relative outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        card
          ? "rounded-lg border bg-card px-3 py-2.5 shadow-elevation-1 transition-[box-shadow,border-color,background-color] hover:border-foreground/15 hover:shadow-elevation-1"
          : "border-b border-border/70 transition-colors",
        !card &&
          (selected || open
            ? "bg-accent before:absolute before:inset-y-1.5 before:-left-2 before:w-[3px] before:rounded-full before:bg-foreground"
            : "hover:bg-row-hover"),
        card && (selected || open) && "border-ring ring-1 ring-ring",
        picked && (card ? "border-ring bg-accent" : "bg-accent"),
        drag?.isDragging && "opacity-40",
        drag?.isOverlay && (card ? "rotate-[1.5deg] shadow-elevation-3" : "rounded-lg border bg-background shadow-elevation-3"),
        (completing || done) && "text-muted-foreground",
        completing && !task.recur && "animate-out fade-out-0 fill-mode-forwards [animation-delay:250ms] [animation-duration:350ms]",
      )}
```

After:

```tsx
      className={cn(
        "group/row relative outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        card
          ? "rounded-lg border bg-card px-3 py-2.5 shadow-elevation-1 transition-[box-shadow,border-color,background-color] hover:border-foreground/15 hover:shadow-elevation-1"
          : "transition-colors",
        !card &&
          (selected || open
            ? "bg-row-selected before:absolute before:inset-y-1.5 before:-left-2 before:w-[3px] before:rounded-full before:bg-foreground"
            : "hover:bg-row-hover"),
        card && (selected || open) && "border-ring ring-1 ring-ring",
        picked && (card ? "border-ring bg-row-selected" : "bg-row-selected"),
        drag?.isDragging && "opacity-40",
        drag?.isOverlay && (card ? "rotate-[1.5deg] shadow-elevation-3" : "rounded-lg border bg-background shadow-elevation-3"),
        (completing || done) && "text-muted-foreground",
        completing && !task.recur && "animate-out fade-out-0 fill-mode-forwards [animation-delay:250ms] [animation-duration:350ms]",
      )}
```

Only three things change: the list variant loses `border-b border-border/70`, and the two `bg-accent` occurrences become `bg-row-selected`.

- [ ] **Step 5: Sticky group header, one button**

`apps/desktop/src/components/task/TaskList.tsx`, replace lines 399-426. Today (after Task 4, `text-[14px]` is `text-small`):

```tsx
      {spec.title && (
        <header className="group/gh flex h-9 items-center gap-1.5 border-b border-border/80">
          {collapsible ? (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={!collapsed}
              aria-label={`${collapsed ? "Expand" : "Collapse"} ${typeof spec.title === "string" ? spec.title : (spec.label ?? "section")}`}
              className="-ml-6 inline-flex size-5 items-center justify-center rounded text-muted-foreground/70 opacity-35 transition-opacity group-hover/gh:opacity-100 hover:bg-foreground/[0.06] hover:text-foreground focus-visible:opacity-100"
            >
              <ChevronRightIcon className={cn("size-3.5 transition-transform duration-150", !collapsed && "rotate-90")} />
            </button>
          ) : null}
          <h2
            onClick={collapsible ? onToggle : undefined}
            className={cn(
              "min-w-0 truncate text-small font-semibold tracking-tight",
              collapsible && "cursor-pointer select-none",
              spec.dim && "text-muted-foreground font-medium",
              spec.tone === "danger" && "text-due-overdue",
            )}
          >
            {spec.title}
          </h2>
          {count > 0 && <span className="text-xs text-muted-foreground tabular-nums">{count}</span>}
          <div className="ml-auto flex items-center gap-1">{spec.actions}</div>
        </header>
      )}
```

After:

```tsx
      {spec.title && (
        <header className={GH}>
          {collapsible ? (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={!collapsed}
              aria-label={`${collapsed ? "Expand" : "Collapse"} ${typeof spec.title === "string" ? spec.title : (spec.label ?? "section")}`}
              className="group/gh -ml-6 flex min-w-0 flex-1 items-center gap-1.5 text-left"
            >
              <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/70 opacity-35 transition-transform duration-150 group-hover/gh:opacity-100 group-focus-visible/gh:opacity-100 motion-safe:transition-opacity" />
              <span
                className={cn(
                  "min-w-0 truncate text-small font-semibold tracking-tight",
                  spec.dim && "font-medium text-muted-foreground",
                  spec.tone === "danger" && "text-due-overdue",
                )}
              >
                {spec.title}
              </span>
              {count > 0 && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">· {count}</span>}
            </button>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <span
                className={cn(
                  "min-w-0 truncate text-small font-semibold tracking-tight",
                  spec.dim && "font-medium text-muted-foreground",
                  spec.tone === "danger" && "text-due-overdue",
                )}
              >
                {spec.title}
              </span>
              {count > 0 && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">· {count}</span>}
            </div>
          )}
          <div className="ml-auto flex items-center gap-1">{spec.actions}</div>
        </header>
      )}
```

and add this constant just above `function Group(`:

```tsx
/** The sticky translucent band every group header wears (design.md:191,237 requires sticky). */
const GH =
  "group/gh sticky top-0 z-10 -mx-2 flex h-9 items-center gap-1.5 bg-background/85 px-2 backdrop-blur supports-backdrop-filter:bg-background/70";
```

Note the `h2` becomes a `span` inside the button: a heading is not valid inside a `<button>`, and the `<section>` already carries `role="group"` with `aria-label`, so the group keeps its accessible name. Verify with axe in Task 11.

- [ ] **Step 6: Run green, then the whole suite**

Run: `pnpm -C apps/desktop test -- src/lib/priority.test.ts src/lib/row-state.test.ts`
Expected: PASS, `Tests 9 passed (9)` in priority.test.ts and `Tests 4 passed (4)` in row-state.test.ts.

Run: `pnpm -C apps/desktop test` -> `Test Files 43 passed (43)`, `Tests 650 passed (650)`.
Run: `pnpm -C apps/desktop lint` -> `Found 25 warnings and 0 errors.`
Run: `pnpm -C apps/desktop build` -> `✓ built in`.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/lib/priority.test.ts apps/desktop/src/lib/row-state.test.ts \
  apps/desktop/src/lib/priority.ts apps/desktop/src/components/shared/PriorityCheckbox.tsx \
  apps/desktop/src/components/task/TaskRow.tsx apps/desktop/src/components/task/TaskList.tsx
git commit -m "$(cat <<'EOF'
feat(desktop): quiet task rows and group headers

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>
EOF
)"
```

---

## Task 8: Shell chrome diet

**Files:**
- Create: `apps/desktop/src/lib/shell-chrome.test.ts`
- Modify: `apps/desktop/src/app/AppShell.tsx` (Header, imports)
- Modify: `apps/desktop/src/app/Sidebar.tsx` (head icon, footer rule, count opacity, imports)
- Modify: `apps/desktop/src/app/CommandPalette.tsx` (legend footer)

**Do not touch (a11y-pinned or explicitly kept):** the `<nav aria-label="Breadcrumb">` wrapper and its `h1` (`AppShell.tsx:68-78`), the header `Search ⌘K` button and the `HeaderActions` portal slot, the palette dialog name `"Command menu"` and its placeholder, the quick-add placeholder, `SidebarRail`, and the sidebar project `⋯` button plus its right-click menu (decision D10 keeps both).

- [ ] **Step 1: Write the failing guard test**

Create `apps/desktop/src/lib/shell-chrome.test.ts`:

```ts
/// <reference types="node" />
/**
 * Shell chrome diet (programme Slice A, item 8). Deletions only, so this pins the absence of the
 * duplicated chrome and the presence of everything the a11y runner waits for.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const SHELL = read("../app/AppShell.tsx");
const SIDEBAR = read("../app/Sidebar.tsx");
const PALETTE = read("../app/CommandPalette.tsx");

describe("header", () => {
  it("is a plain h-10 strip with no duplicate capture button or separator", () => {
    expect(SHELL).toContain('"titlebar-drag flex h-10 shrink-0 items-center gap-2 px-3"');
    expect(SHELL).not.toContain("bg-background/85");
    expect(SHELL).not.toContain("backdrop-blur");
    expect(SHELL).not.toContain('aria-label="Add task"');
    expect(SHELL).not.toContain("Separator");
  });

  it("keeps the breadcrumb landmark and the one h1", () => {
    expect(SHELL).toContain('aria-label="Breadcrumb"');
    expect(SHELL).toContain("<h1");
    expect(SHELL).toContain("HEADER_ACTIONS_ID");
  });
});

describe("sidebar", () => {
  it("drops the duplicate search icon and the footer rule", () => {
    expect(SIDEBAR).not.toContain('aria-label="Search"');
    expect(SIDEBAR).not.toContain("border-t border-sidebar-border");
  });

  it("stops hiding counts on hover", () => {
    expect(SIDEBAR).not.toContain("group-hover/menu-item:opacity-0");
    expect(SIDEBAR).not.toContain("group-focus-within/menu-item:opacity-0");
  });
});

describe("command palette", () => {
  it("has no keycap legend footer and keeps its pinned dialog name", () => {
    expect(PALETTE).not.toContain("border-t px-3 py-2");
    expect(PALETTE).toContain('title="Command menu"');
  });
});
```

- [ ] **Step 2: Run it red**

Run: `pnpm -C apps/desktop test -- src/lib/shell-chrome.test.ts`
Expected: FAIL. The header carries `sticky top-0 z-20 ... bg-background/85 ... backdrop-blur`, `Separator` and `aria-label="Add task"`; the sidebar carries the search icon, the footer `border-t` and both count-opacity classes; the palette carries the legend footer.

- [ ] **Step 3: Diet the header**

`apps/desktop/src/app/AppShell.tsx`, replace the `<header>` open tag (currently lines 52-58):

```tsx
    <header
      data-tauri-drag-region="deep"
      className={cn(
        "titlebar-drag sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-backdrop-filter:bg-background/70",
        // Collapsed sidebar: the macOS traffic lights sit over the header's left edge.
        (state !== "expanded" || isMobile) && "titlebar-inset",
      )}
    >
```

with:

```tsx
    <header
      data-tauri-drag-region="deep"
      className={cn(
        "titlebar-drag flex h-10 shrink-0 items-center gap-2 px-3",
        // Collapsed sidebar: the macOS traffic lights sit over the header's left edge.
        (state !== "expanded" || isMobile) && "titlebar-inset",
      )}
    >
```

Delete the vertical separator (line 67):

```tsx
      <Separator orientation="vertical" className="mr-1 h-4! self-center!" />
```

Delete the round capture button and its tooltip (lines 86-95):

```tsx
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon-sm" aria-label="Add task" onClick={() => openQuickAdd()} className="rounded-full">
              <PlusIcon className="stroke-[2.5]" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Add task <Kbd keys="q" inverted className="ml-1" />
          </TooltipContent>
        </Tooltip>
```

Then fix the imports: line 2 becomes

```tsx
import { CloudOffIcon, RotateCwIcon, SearchIcon, TriangleAlertIcon } from "lucide-react";
```

line 8 (`import { Separator } from "@/components/ui/separator";`) is deleted, and line 25 (`import { openQuickAdd } from "./quickadd-store";`) is deleted. Leave `Tooltip`, `TooltipContent` and `TooltipTrigger` (still used by the sidebar trigger) and leave `Kbd` (still used by the Search button).

- [ ] **Step 4: Diet the sidebar**

`apps/desktop/src/app/Sidebar.tsx`, replace the head block (lines 409-421):

```tsx
          <div className="ml-auto flex items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Search" onClick={openCommandPalette}>
                  <SearchIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Command menu <Kbd keys="mod+k" inverted className="ml-1" />
              </TooltipContent>
            </Tooltip>
          </div>
```

with nothing (the header row keeps the logo and the name only). Then:

- line 1: remove `SearchIcon` from the lucide import.
- line 49: delete `import { openCommandPalette } from "./ui-store";`.
- line 480: `"gap-1 border-t border-sidebar-border px-3 py-2"` -> `"gap-1 px-3 py-2"`.
- line 284 (projects badge): `"text-muted-foreground transition-opacity group-focus-within/menu-item:opacity-0 group-hover/menu-item:opacity-0"` -> `"text-muted-foreground"`.
- line 371 (labels badge): same replacement.

Keep `Kbd` (still used by the Add task row's `q` hint and `NavItem`).

- [ ] **Step 5: Drop the palette legend**

`apps/desktop/src/app/CommandPalette.tsx`, delete the whole footer block (after Task 4 its size class is `text-micro`):

```tsx
        <div className="flex items-center gap-3 border-t px-3 py-2 text-micro text-foreground">
          <span className="flex items-center gap-1">
            <Kbd keys="arrowup" />
            <Kbd keys="arrowdown" /> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd keys="enter" /> open
          </span>
          <span className="ml-auto flex items-center gap-1">
            <Kbd keys="esc" /> close
          </span>
        </div>
```

`Kbd` stays imported (it is still used inline on palette items).

- [ ] **Step 6: Run green, then the whole suite**

Run: `pnpm -C apps/desktop test -- src/lib/shell-chrome.test.ts`
Expected: PASS, `Tests 6 passed (6)`.

Run: `pnpm -C apps/desktop test` -> `Test Files 44 passed (44)`, `Tests 656 passed (656)`.
Run: `pnpm -C apps/desktop lint` -> `Found 25 warnings and 0 errors.`
Run: `pnpm -C apps/desktop build` -> `✓ built in`.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/lib/shell-chrome.test.ts apps/desktop/src/app/AppShell.tsx \
  apps/desktop/src/app/Sidebar.tsx apps/desktop/src/app/CommandPalette.tsx
git commit -m "$(cat <<'EOF'
refactor(desktop): diet the shell chrome

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>
EOF
)"
```

---

## Task 9: Motion upgrades (route fade, drag curve, sidebar pill)

**Files:**
- Modify: `apps/desktop/src/app/AppShell.tsx` (`RouteView`, `ViewSkeleton`, imports)
- Modify: `apps/desktop/src/components/task/TaskView.tsx:58`
- Modify: `apps/desktop/src/components/shared/page-width.ts:3`
- Modify: `apps/desktop/src/components/task/TaskList.tsx` (`SortableNode`)
- Modify: `apps/desktop/src/app/Sidebar.tsx` (`Highlight`)
- Modify: `apps/desktop/src/lib/motion.test.ts` (extend)

**Do not touch:** `src/components/animate-ui/motion-tokens.ts` (no new durations), `src/components/ui/sheet.tsx` (the 300ms sheet stays), the group fold (that is a later slice), the functional programme's scroll **restore** (see Risks).

- [ ] **Step 1: Extend the failing guard test**

Append to `apps/desktop/src/lib/motion.test.ts` (it already imports `readdirSync, readFileSync, join, relative, fileURLToPath`):

```ts
const SRC = fileURLToPath(new URL("..", import.meta.url));
const src = (rel: string) => readFileSync(join(SRC, rel), "utf8");

describe("route and drag motion", () => {
  it("resets #main and fades the view on a route change", () => {
    const shell = src("app/AppShell.tsx");
    expect(shell).toContain('document.getElementById("main")?.scrollTo({ top: 0 })');
    expect(shell).toContain("animate-in fade-in-0 duration-100 fill-mode-both motion-reduce:animate-none");
    expect(shell).toContain("useEffect");
  });

  it("uses one drag transition with a zero-duration reduced-motion branch", () => {
    const list = src("components/task/TaskList.tsx");
    expect(list).toContain("useReducedMotion");
    expect(list).toContain("transition: reduce ? { duration: 0 } : { duration: 0.16, easing: \"cubic-bezier(0.2, 0, 0, 1)\" }");
  });

  it("puts the sidebar highlight pill on the base token", () => {
    const sidebar = src("app/Sidebar.tsx");
    expect(sidebar).toContain("transition={TRANSITION_BASE}");
    expect(sidebar).toContain('from "@/components/animate-ui/motion-tokens"');
  });

  it("uses the 760px list column everywhere", () => {
    expect(src("components/task/TaskView.tsx")).toContain("max-w-[760px]");
    expect(src("components/shared/page-width.ts")).toContain("max-w-[760px]");
    expect(src("components/task/TaskView.tsx")).not.toContain("860");
    expect(src("components/shared/page-width.ts")).not.toContain("860");
  });
});
```

- [ ] **Step 2: Run it red**

Run: `pnpm -C apps/desktop test -- src/lib/motion.test.ts`
Expected: FAIL on all four new cases.

- [ ] **Step 3: Reset scroll and fade the view**

`apps/desktop/src/app/AppShell.tsx`, line 4, before:

```tsx
import { Component, Suspense, useState, type ReactNode } from "react";
```

after:

```tsx
import { Component, Suspense, useEffect, useState, type ReactNode } from "react";
```

and `RouteView`, before:

```tsx
function RouteView() {
  const route = useRoute();
  const View = ROUTES[route.name].view;
  return (
    <ViewBoundary resetKey={route.path}>
      <Suspense fallback={<ViewSkeleton />}>
        <View key={route.name} />
      </Suspense>
    </ViewBoundary>
  );
}
```

after:

```tsx
function RouteView() {
  const route = useRoute();
  const View = ROUTES[route.name].view;
  // A new page starts at the top; the frame stays still and only the content fades in.
  useEffect(() => {
    document.getElementById("main")?.scrollTo({ top: 0 });
  }, [route.path]);
  return (
    <ViewBoundary resetKey={route.path}>
      <Suspense fallback={<ViewSkeleton />}>
        <div key={route.path} className="animate-in fade-in-0 duration-100 fill-mode-both motion-reduce:animate-none">
          <View />
        </div>
      </Suspense>
    </ViewBoundary>
  );
}
```

- [ ] **Step 4: Match the skeleton to the view**

`apps/desktop/src/app/AppShell.tsx`, `ViewSkeleton`, before:

```tsx
    <div className="mx-auto w-full max-w-3xl space-y-3 px-6 py-8">
      <Skeleton className="h-7 w-40" />
```

after:

```tsx
    <div className="mx-auto w-full max-w-[760px] space-y-3 px-5 pt-6 pb-8 sm:px-10 sm:pt-8">
      <Skeleton className="h-8 w-44" />
```

- [ ] **Step 5: The 760px list column**

`apps/desktop/src/components/task/TaskView.tsx:58`, before:

```tsx
    <div className={cn("@container/view mx-auto w-full px-5 pt-6 sm:px-10 sm:pt-8", wide ? "max-w-none" : "max-w-[860px]", className)}>
```

after:

```tsx
    <div className={cn("@container/view mx-auto w-full px-5 pt-6 sm:px-10 sm:pt-8", wide ? "max-w-none" : "max-w-[760px]", className)}>
```

`apps/desktop/src/components/shared/page-width.ts:3`, before:

```ts
  list: "mx-auto w-full max-w-[860px] px-5 pt-6 pb-10 sm:px-10 sm:pt-8",
```

after:

```ts
  list: "mx-auto w-full max-w-[760px] px-5 pt-6 pb-10 sm:px-10 sm:pt-8",
```

- [ ] **Step 6: One drag curve, with a reduced-motion branch**

`apps/desktop/src/components/task/TaskList.tsx`, add to the imports:

```tsx
import { useReducedMotion } from "motion/react";
```

and in `SortableNode`, before:

```tsx
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.task.id, disabled });
```

after:

```tsx
  const reduce = useReducedMotion();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.task.id,
    disabled,
    transition: reduce ? { duration: 0 } : { duration: 0.16, easing: "cubic-bezier(0.2, 0, 0, 1)" },
  });
```

- [ ] **Step 7: The sidebar pill on the base token**

`apps/desktop/src/app/Sidebar.tsx`, add to the imports:

```tsx
import { TRANSITION_BASE } from "@/components/animate-ui/motion-tokens";
```

and the highlight provider, before:

```tsx
        <Highlight
          controlledItems
          mode="parent"
          value={highlighted}
          click={false}
          exitDelay={0}
          className="inset-0 rounded-md bg-accent"
        >
```

after:

```tsx
        <Highlight
          controlledItems
          mode="parent"
          value={highlighted}
          click={false}
          exitDelay={0}
          transition={TRANSITION_BASE}
          className="inset-0 rounded-md bg-surface-3"
        >
```

- [ ] **Step 8: Run green, then the whole suite**

Run: `pnpm -C apps/desktop test -- src/lib/motion.test.ts`
Expected: PASS. `Tests 12 passed (12)` (the file had 8).

Run: `pnpm -C apps/desktop test` -> `Test Files 44 passed (44)`, `Tests 660 passed (660)`.
Run: `pnpm -C apps/desktop lint` -> `Found 25 warnings and 0 errors.`
Run: `pnpm -C apps/desktop build` -> `✓ built in`.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/lib/motion.test.ts apps/desktop/src/app/AppShell.tsx \
  apps/desktop/src/components/task/TaskView.tsx apps/desktop/src/components/shared/page-width.ts \
  apps/desktop/src/components/task/TaskList.tsx apps/desktop/src/app/Sidebar.tsx
git commit -m "$(cat <<'EOF'
feat(desktop): reset scroll and fade route changes

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>
EOF
)"
```

---

## Task 10: Copy consistency (unpinned strings only)

**Files:**
- Create: `apps/desktop/src/lib/copy.ts`, `apps/desktop/src/lib/copy.test.ts`
- Modify: `src/lib/query.ts:378`, `src/components/task/actions.ts:164,212`, `src/components/task/DeleteTaskConfirm.tsx:27,30`, `src/components/task/GettingStarted.tsx:37,78`, `src/components/task/TaskMenu.tsx:170`, `src/components/task/TaskDetail.tsx:922`, `src/components/task/AddProjectDialog.tsx:37`, `src/components/memory/MemoryDetail.tsx:62`, `src/components/memory/MemoryDialog.tsx:117`, `src/components/shared/open-in.ts:41`, `src/components/scratch/ScratchViewer.tsx:192,196`, `src/views/memories/MemoriesView.tsx:94,118,202,208`, `src/views/scratch/ScratchView.tsx:83,100,147,152,253`, `src/views/settings/SettingsView.tsx:104,116`

**Do not touch:** `"Inbox zero"`, `"Clear filters"`, the palette placeholder `"Type a command or search tasks…"`, the quick-add placeholder, anything in `src/lib/errors.ts` (out of scope), empty-state titles and descriptions other than the raw tool names, `src/app/QuickAddForm.tsx`. Verified: no test file and no a11y step pins any string this task changes (`rg` over `src/**/*.test.*` and `a11y/` returns nothing for `New memory`, `New scratchpad`, `New project`, `host_task_delete`, `shards_memory_new`, `shards_scratch_set`, `sub-task`, `Copied`, `Not saved`).

- [ ] **Step 1: Write the failing module and its test**

Create `apps/desktop/src/lib/copy.ts`:

```ts
/**
 * The two strings several surfaces share (programme Slice A, item 10). One clipboard rule and
 * one "not saved" warning, so the wording lives in one place and is testable.
 */

/** Bare clipboard action -> "Copied"; named payload -> "Copied the path". */
export function copied(noun?: string | null): string {
  return noun ? `Copied the ${noun}` : "Copied";
}

/** Fields a vault whose core predates them silently drops. */
export function notSaved(fields: readonly string[]): string {
  return `Not saved: ${fields.join(", ")}. This vault’s core is older than the app.`;
}
```

Create `apps/desktop/src/lib/copy.test.ts`:

```ts
/// <reference types="node" />
/**
 * Copy rules (programme Slice A, item 10). Six spellings of "Copied" and two contradictory
 * "Not saved" strings collapse to one of each.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { copied, notSaved } from "./copy";

const SRC = fileURLToPath(new URL("..", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    if (!/\.(tsx?|jsx?)$/.test(e.name) || /\.test\.(ts|tsx)$/.test(e.name)) return [];
    return [p];
  });
}
const ALL = sourceFiles(SRC).map((f) => ({ file: relative(SRC, f), text: readFileSync(f, "utf8") }));

describe("copied", () => {
  it("is bare for a bare action and named for a payload", () => {
    expect(copied()).toBe("Copied");
    expect(copied("path")).toBe("Copied the path");
    expect(copied("id")).toBe("Copied the id");
  });
});

describe("notSaved", () => {
  it("names the dropped fields and one reason", () => {
    expect(notSaved(["recur"])).toBe("Not saved: recur. This vault’s core is older than the app.");
    expect(notSaved(["due", "labels"])).toContain("due, labels");
  });
});

describe("no stale spelling survives in src", () => {
  it.each(["Copied path", "Copied body", "Copied to the clipboard", "not supported by this vault's core yet"])(
    "does not contain %s",
    (needle) => {
      expect(ALL.filter((f) => f.text.includes(needle)).map((f) => f.file)).toEqual([]);
    },
  );

  it("does not leak a raw tool name into user-facing text", () => {
    const leaks = ALL.filter((f) => /"(?:It needs |[^"]*\b)host_task_delete|shards_memory_new|shards_scratch_set/.test(f.text) && /toast|EmptyState|description=|DialogTitle|<code/.test(f.text)).map((f) => f.file);
    expect(leaks).toEqual([]);
  });

  it("spells subtask without a hyphen", () => {
    expect(ALL.filter((f) => f.text.includes("sub-task")).map((f) => f.file)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it red**

Run: `pnpm -C apps/desktop test -- src/lib/copy.test.ts`
Expected: FAIL. The first four cases fail because `./copy` does not exist; the stale-spelling, raw-tool-name and `sub-task` cases list the files.

- [ ] **Step 3: Apply the copy pass**

`src/views/settings/SettingsView.tsx:169`: `toast.success("Copied")` -> `toast.success(copied())`, and import `{ copied } from "@/lib/copy"`.
`src/components/shared/open-in.ts:41`: `toast.success("Copied path")` -> `toast.success(copied("path"))` (+ import).
`src/components/scratch/ScratchViewer.tsx:192`: `"Copied body"` -> `copied("body")`; `:196`: `"Copied path"` -> `copied("path")` (+ import).
`src/components/task/GettingStarted.tsx:37`: `toast.success("Copied to the clipboard")` -> `toast.success(copied())` (+ import).
`src/components/task/TaskMenu.tsx:170`: `` `Copied ${task.id}` `` -> `copied("id")` (+ import).
`src/components/task/TaskDetail.tsx:922`: `` `Copied ${what}` `` -> `copied(what)` (+ import).
`src/components/memory/MemoryDetail.tsx:62`: `` `Copied ${what}` `` -> `copied(what)` (+ import).
`src/lib/query.ts:378`, before:

```ts
      if (dropped.length) toast.warning(`Not saved: ${dropped.join(", ")} (not supported by this vault's core yet).`);
```

after:

```ts
      if (dropped.length) toast.warning(notSaved(dropped));
```

`src/components/task/actions.ts:164`, before:

```ts
      if (dropped.length) toast.warning(`Not saved: ${dropped.join(", ")} (this vault’s core is too old).`);
```

after:

```ts
      if (dropped.length) toast.warning(notSaved(dropped));
```

`src/components/task/actions.ts:212`, before:

```ts
          description: "It needs host_task_delete. You can cancel the task instead.",
```

after:

```ts
          description: "Update Shards, or cancel the task instead.",
```

`src/components/task/DeleteTaskConfirm.tsx:27`: `{n === 1 ? "sub-task" : \`${n} sub-tasks\`}` -> `{n === 1 ? "subtask" : \`${n} subtasks\`}`.
`:30`: `` `${n} sub-tasks are still open.` `` -> `` `${n} subtasks are still open.` ``.

`src/views/memories/MemoriesView.tsx:202`, before:

```tsx
                    Agents write memories with <code className="rounded bg-muted px-1 font-mono text-xs">shards_memory_new</code> — facts, preferences and procedures they recall next session.
```

after:

```tsx
                    Facts and preferences your agents keep. Write one, or let an agent add it.
```

`src/views/scratch/ScratchView.tsx:147`, before:

```tsx
                    Agents keep their session state here with <code className="rounded bg-muted px-1 font-mono text-xs">shards_scratch_set</code> — plans, checklists, notes to self. It shows up live.
```

after:

```tsx
                    Where agents keep plans and checklists between sessions. It shows up live.
```

Verb-first labels: `src/views/memories/MemoriesView.tsx:94` `"New memory"` -> `"Add memory"`; `:118` and `:208` `<PlusIcon /> New memory` -> `<PlusIcon /> Add memory`; `src/views/scratch/ScratchView.tsx:83` `"New scratchpad"` -> `"Add scratchpad"`; `:100` and `:152` and `:253` `New scratchpad` -> `Add scratchpad`; `src/views/settings/SettingsView.tsx:104` `["n", "New memory"]` -> `["n", "Add memory"]`; `:116` `["n", "New scratchpad"]` -> `["n", "Add scratchpad"]`; `src/components/memory/MemoryDialog.tsx:117` `"New memory"` -> `"Add memory"`; `src/components/task/AddProjectDialog.tsx:37` `<DialogTitle>New project</DialogTitle>` -> `<DialogTitle>Add project</DialogTitle>`; `src/components/task/GettingStarted.tsx:78` `New project` -> `Add project`.

Also add the `copied`/`notSaved` import line to each edited file (`import { copied } from "@/lib/copy";` or `import { notSaved } from "@/lib/copy";`).

- [ ] **Step 4: Run green, then the whole suite**

Run: `pnpm -C apps/desktop test -- src/lib/copy.test.ts`
Expected: PASS, `Tests 9 passed (9)`.

Run: `pnpm -C apps/desktop test` -> `Test Files 45 passed (45)`, `Tests 669 passed (669)`.
Run: `pnpm -C apps/desktop lint` -> `Found 25 warnings and 0 errors.`
Run: `pnpm -C apps/desktop build` -> `✓ built in`.

- [ ] **Step 5: Commit**

```bash
git add -A apps/desktop/src
git commit -m "$(cat <<'EOF'
refactor(desktop): unify copied and not saved copy

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>
EOF
)"
```

---

## Task 11: Final gate and evidence

**Files:**
- Modify: this plan (append the results note)

**Do not touch:** any source file. If the gate fails, fix it in a new commit on the task that owns the file, then re-run.

- [ ] **Step 1: Run the three gates**

```bash
pnpm -C apps/desktop lint     # Found 25 warnings and 0 errors.
pnpm -C apps/desktop test     # Test Files 45 passed (45) / Tests 669 passed (669)
pnpm -C apps/desktop build    # ✓ built in
```

- [ ] **Step 2: Try the a11y pass**

```bash
pnpm -C apps/desktop a11y
```

This builds, starts `vite preview` against `SHARDS_HOST_URL=http://127.0.0.1:9`, and drives Chromium (`~/.cache/ms-playwright/chromium-1248` is present). Expected: no new findings against `a11y-baseline.json`, and no `interactive-clipped` or `target-size` findings at 200% zoom (the group header band and the removed header hairlines are the two things most likely to move). If it cannot run (no browser, preview port, or a fixture failure), record the exact error in the results note and say so; do not silently skip it. If the header copy change legitimately shifts axe output, regenerate with `pnpm -C apps/desktop a11y -- --update-baseline` and review the diff.

- [ ] **Step 3: Re-shoot light and dark screenshots**

```bash
node /tmp/ui-review/shoot.mjs /tmp/ui-review/after light,dark
```

Then compare against `/tmp/ui-review/shots` (24 PNGs: agents, detail, inbox, memories, notes, palette, project-list, quickadd, scratch, settings, today, upcoming, each light and dark). Record per screen: type scale, radii, scrim, row tones, sticky group band, keycap. If the shooter cannot reach a host, record the error.

- [ ] **Step 4: Append the results note**

Append a `## Results (Slice A)` section to this plan with: the three command outputs (tail), the a11y outcome or the exact reason it could not run, the screenshot comparison, and the ticked checkboxes for every task. Keep it factual; do not restate the plan.

- [ ] **Step 5: Commit the note**

```bash
git add docs/superpowers/plans/2026-10-24-ui-visual-slice-a.md
git commit -m "$(cat <<'EOF'
docs(desktop): add slice a verification note

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>
EOF
)"
```

---

## Risks and rollbacks

**Colour.** Task 5 is the only colour change, and it is constrained: light `surface-3` cannot go below `oklch(0.96)` without `--status-awaiting` dropping under 4.5:1 on a selected row, and dark `surface-2` cannot go above `oklch(0.285)` without the focus ring dropping under 3:1. The chosen values are `0.965` (4.56:1 worst case, `status-awaiting`) and `0.28` (ring 3.08:1). If a later slice darkens `--ring` or a semantic token, re-run `src/lib/contrast.test.ts` first. Rollback: `git revert` the Task 5 commit; the contrast pins revert with it, which is why the pins live in the same commit.

**Radius hacks.** Replacing `rounded-[min(var(--radius-md),10px|12px)]` with `rounded-md` changes a 6.4px corner to 6px. That is intentional and invisible at 1x, but it is a visual delta, so it is called out rather than hidden. `src/components/ui/calendar.tsx` keeps its own `--cell-radius` vocabulary, deliberately out of scope.

**Type sweep.** Task 4 touches 46 files and is the biggest diff. It is one commit alone so it can be reverted alone. Two real deltas: every swept size now carries the token's line-height unless the call site already set `leading-*`, and `text-[11px]` (51 sites) becomes 12px. The a11y runner measures `[data-task-row]` heights and requires them not to shrink at 200% zoom; 12px is larger than 11px, so rows can only grow.

**Group header.** The `h2` becomes a `span` inside a `<button>` (a heading is invalid inside a button). The `<section>` keeps `role="group"` and `aria-label`, so the group stays named, but the document loses heading levels for groups. Verify with the a11y pass (Task 11); if `page-has-heading-one` or heading-order rules complain, restore a visually hidden `h2` next to the button.

**Sticky group header.** `sticky top-0 z-10` with `-mx-2 px-2` inside `#main`: check the 200% zoom pass for `interactive-clipped` findings, and check that the row hover cluster (which sits at `z` auto) still paints above the rows below it.

**Route scroll reset.** The functional programme (`/workspace/wiki/plans/ui-refinement-program.md`, item 6) wants scroll **restore** on back-navigation. This slice only resets on `route.path` change. Doing both naively conflicts; the rule recorded in the programme is reset on forward navigation, restore on back, and it belongs to the functional programme, not this slice.

**Motion defaults.** `--default-transition-duration: 120ms` changes every bare `transition-*` utility app-wide. The reduced-motion clamp in `index.css` (`transition-duration: 0.01ms !important`) still wins under `prefers-reduced-motion`.

**Copy.** All changed strings were grep-checked against every test file and `a11y/run.mjs`; the four pinned strings (breadcrumb, "Command menu", quick-add placeholder, and the two spec-pinned zero states) are untouched. The one place to watch is `MemoryDialog`'s title, which now reads "Add memory" for a new memory and "Supersede memory" when superseding; keep that pair meaningful.

**Reviewer claims that were false or stale (do not re-derive them):** the retired-token call-site counts (foundations F12), the `page-width.ts` location (foundations and shell cite `lib/`), the `border*` count disagreement, and the programme's D7 "delete the shell `h1`" (this slice keeps it, on purpose).

**Rollback for the whole slice.** Every task is one commit; tasks 1-4, 6, 8, 9 and 10 are independent by file. Revert in reverse order: 10, 9, 8, 7, 6, 5, 4, 3, 2, 1. Reverting 1 alone while 2-5 stand would leave the elevation/motion/type tokens present but the radii derived again, which is harmless.

---

## Results (Slice A)

Executed 2026-10-24 by DeepSeek V4.1 Flash subagents (one per task, `droid exec -m deepseek-v4.1-flash`), gated after each task by an independent script.

| Task | Commit | Tests after |
|---|---|---|
| 1 radii, sidebar 248px, scrim | `231c7fe` | 539 |
| 2 elevation tokens | `4204ed0` | 542 |
| 3 motion defaults | `02da567` | 545 |
| 4 type scale sweep | `8208fc7` | 553 |
| 5 row surface tones, contrast re-pin | `5ea42af` | 636 |
| 6 tonal keycap | `9c36a41` | 639 |
| 7 row state language, group headers | `a3eccfa` | 646 |
| 8 shell chrome diet | `40c848b` | 651 |
| 9 route fade, scroll reset, drag curve, sidebar pill | `2333b11` | 655 |
| 10 copy consistency | `21c2d58` | 663 |
| fix: a11y regressions found in Task 11 | `3a66c1f` | 664 |

Gates (lead, after the fix): `pnpm lint` -> `Found 25 warnings and 0 errors.`; `pnpm test` -> `Tests 664 passed (664)`; `pnpm build` -> `✓ built in 403ms`.

**a11y pass (`pnpm -C apps/desktop a11y`).** First run found 11 new violations: 8 `label-content-name-mismatch` (group header buttons had an `aria-label` that hid their visible text) and 3 `color-contrast` (palette keycaps, `then` separator at 60% alpha). Both were the risks this plan predicted. Fixed in `3a66c1f`; second run: `new violations: 0`, `zoom findings: 0`, `stale baseline entries: 0`.

**Deviations from the plan:** Task 1's guard reads the radii from the `@theme inline` block (the plan said `:root`); Task 5 left `--due-week` and `QuickAddForm.tsx` alone (issue #29 owns that file).

**Screenshots:** 24 PNGs in `/tmp/ui-review/after` (light and dark), compared with `/tmp/ui-review/shots`. Visible: slimmer header, no rules between rows or groups, sticky count-suffixed group headers, tonal keycaps. Known visual issue to review: the 24px page title truncates ("Shards …") beside the project toolbar at a 1024px viewport.
