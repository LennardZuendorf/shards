---
type: tech
applies: "**"
updated: 2026-11-23
---

# tech: Invariants

## Invariants

The eleven core invariants are detailed in [tech-core.md](../core/README.md) § Invariants. Status
after the Shards pivot ([product.md](../../concepts/product/README.md) § Non-goals, principle reversals 1–8):

| # | Invariant | Status |
|---|---|---|
| 1 | No daemon | **Amended.** Holds for CLI and core. The app, `shards-host` and `shards sync --watch` run long by choice; no command depends on them |
| 2–6, 8, 9, 11 | Spaces, derived state, canonical frontmatter, one walk, atomic single-entity writes, no panics, inert content, minted-name ownership | **Hold.** Recurring finish rewrites only the task's own file. Remote sync applies changes through the same lock + rename. The CLI `main` catches panics; the host has no `catch_unwind` yet (a panic in a blocking call surfaces as HTTP 500 `unknown`) |
| 7 | Identity is a spelling check | **Amended.** Still true locally; `shards-server` enforces identity from the token |
| 10 | Sync/versioning is the vault owner's job | **Amended.** Shards owns record sync (never git sync), and undo is still app-level via `host_restore`. Every core, CLI and host delete **moves** the file to the platform Trash — the XDG trash on Linux, so `mv ~/.local/share/Trash/files/<file> <vault>/tasks/open/<id>.md` puts it back, and the Finder's Trash on macOS. When no Trash is reachable the file moves to `<vault>/.shards/trash/<the path it had>` and the command names that path; `SHARDS_TRASH=off` refuses the delete instead of unlinking. Sync tombstones stay sync-layer records |
| + | No async runtime, no MCP SDK | **Scoped** to the root crate. Host, app and server use tokio; the server uses `rmcp`; stdio MCP stays hand-rolled |
| + | **New:** UI-only tools stay UI-only | `host_*` never appear in any agent MCP `tools/list`, local or remote |

Parent: [Section index](README.md).
