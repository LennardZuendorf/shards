---
type: tech
applies: "**"
updated: 2026-11-02
---

# tech: Tech Stack

## Tech Stack

| Layer | Choice (pinned major/minor) |
|---|---|
| Core | Rust 1.94.1 toolchain, edition 2021, sync, no MCP SDK → [tech-core.md](../core/README.md) § Stack |
| Host | `axum` 0.8.9, `tokio` 1.53, `tokio-stream` 0.1, `futures-util` 0.3, `toml` 0.9 (reads `[core].me` / `[[members]]`), `notify` 8 + `notify-debouncer-full` 0.6 (shared with core) |
| Desktop shell | `tauri` 2.12.4 / `tauri-build` 2.7.3 / `@tauri-apps/api` 2.12.4 / CLI 2.12.3. **Never v3** (alpha, MSRV 1.95, edition 2024). Plugins delivered: single-instance 2.5, window-state 2.5, dialog 2.8, opener 2.7. Planned (app-polish): global-shortcut, notification, deep-link, store, updater, autostart, log. No `plugin-fs` (research: tauri §1, §2, §6) |
| Frontend | React 19.3, Vite 8.3, TypeScript 7.0, Tailwind 4.3 (`@tailwindcss/vite`), shadcn CLI 4.21 + `radix-ui` 1.8, TanStack Query 5.104, dnd-kit core 6.3 / sortable 10, cmdk 1.1, chrono-node 2.10, date-fns 4.4, sonner 2.0, lucide-react 1.57, react-markdown 10 + remark-gfm 4, react-day-picker 10, locally bundled Newsreader, Hanken Grotesk and JetBrains Mono; routing is a hand-written hash router (`src/lib/router.ts`), UI state small `useSyncExternalStore` stores; TanStack Virtual 3.14.13 for long lists; no TanStack Router or zustand; lint oxlint; tests vitest 5; pnpm |
| Build targets | macOS ≥ 13.3, Vite `build.target: safari16.4` (Tailwind 4 floor); Linux best-effort; Windows blocked on core POSIX shims |
| Server (reserved) | `rmcp` 3.5.1 (Streamable HTTP), `axum`, `sqlx` (Postgres hosted / SQLite self-host), `object_store`, `diffy`, `jsonwebtoken` 11; desktop tokens in OS keychain via `keyring` 4.2 (research: sync §6, mcp-oauth §5) |

Recurrence (task model v2) is a hand-rolled RRULE-subset evaluator in core; the `rrule` crate is
rejected because it pulls `chrono-tz` into the CLI binary.

Parent: [Section index](README.md).
