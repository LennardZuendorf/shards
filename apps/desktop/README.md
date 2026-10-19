# Shards desktop

Tauri 2.12 shell + React 19 / Vite / Tailwind 4 / shadcn (radix) UI over `shards-host`.

## Commands (from the repo root)

```bash
pnpm -C apps/desktop install          # deps
cargo run -p shards-host              # host API on 127.0.0.1:7878 (browser mode)
pnpm -C apps/desktop dev              # Vite on :5173, proxies /api → host
pnpm -C apps/desktop tauri dev        # desktop app (Tauri shell + Vite)
pnpm -C apps/desktop build            # tsc -b + vite build
pnpm -C apps/desktop test             # vitest (quick-add parser, dates, recurrence)
pnpm -C apps/desktop lint             # oxlint
pnpm -C apps/desktop exec playwright install chromium  # a11y browser prerequisite
pnpm -C apps/desktop a11y             # axe-core browser scan (builds first)
```

Point the dev server at another host instance (several worktrees at once):

```bash
cargo run -p shards-host -- --config /path/config.toml --port 7981
SHARDS_HOST_URL=http://127.0.0.1:7981 pnpm -C apps/desktop exec vite --port 5181 --strictPort
```

(`pnpm -C apps/desktop dev -- --port N` does not reach Vite: it stays on 5173.)

Demo data: `bash scripts/demo-vault.sh --force [DIR]` builds a full vault;
`--empty` builds only the config, which shows the Inbox "Getting started" onboarding.

## Accessibility CI

`pnpm -C apps/desktop a11y` builds the app and scans Tasks list, Tasks board, Memories and the
⌘K command palette in light and dark themes. Notes tree, Agents, Search and Quick Add remain
follow-up scan targets. Playwright intercepts host API requests with checked-in fixtures, so the
same browser path runs locally and in CI without starting a Rust host. Axe checks WCAG 2.0 A/AA
and WCAG 2.1 A/AA. The checked-in baseline is keyed by view, theme, rule and target; only new
findings fail the run. Never add a violation silently: fix it or re-baseline in the same PR and
explain the reason in the PR body. Regenerate intentionally with
`pnpm -C apps/desktop a11y -- --update-baseline`.
Color-contrast findings are the flaky class; stale baseline entries are printed but do not fail
the run.

The automated scan does not replace a VoiceOver scenario pass or a 200 % zoom clipping review.

## Layout

| Path | What |
| --- | --- |
| `src/index.css` | Design tokens (violet brand, priority/due/status/identity colors, light + dark) |
| `src/lib/transport.ts` | `call(tool, args)` over Tauri IPC or HTTP; `onVaultChanged` |
| `src/lib/api/*` | Typed wrappers for every agent tool + host tool; `createTask` is v1-core safe |
| `src/lib/query.ts` | QueryClient, `qk` key factory, `useVaultEvents`, optimistic task mutations + Undo toasts |
| `src/lib/hooks.ts` | Shared data hooks: `useTasks`, `useProjects`, `useMembers`, `useLabels`, `useTaskCounts` |
| `src/lib/quickadd/parse.ts` | Quick-add grammar (`#project /section @label p1 +owner every … {deadline}` + chrono dates) |
| `src/lib/{dates,recur,priority,status,color}.ts` | Due buckets/labels, RRULE subset, display config |
| `src/lib/router.ts` | Hash router: `useRoute`, `useRouteParams`, `paths`, `navigate` |
| `src/lib/hotkeys.ts` | Global shortcut registry (`useHotkey("g t", …)`) |
| `src/app/*` | Shell: sidebar, header, routes, ⌘K palette, quick add, detail pane, theme |
| `src/components/shared/*` | Avatar, PriorityCheckbox, PriorityFlag, DueChip, LabelChip, StatusBadge, EmptyState, Kbd |
| `src/views/**` | Route views (named exports, no props) |

## Keyboard

`q` quick add · `⌘K` command menu · `/` search · `g i/t/u/a/m/s/n` go to view · `[` / `⌘B` sidebar ·
`⌘Z` undo last action · `Esc` close detail · `?` all shortcuts.
