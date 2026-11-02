---
type: tech
applies: "**"
updated: 2026-11-02
---

# tech: Design Philosophy

## Design Philosophy

1. **One dispatcher, three transports.** CLI, agent MCP and the app run the same domain calls
   through `mcp::tools::Server::call`; a UI bug is an agent bug and the reverse (research: tauri §4.1).
2. **The folder is the database.** Indexes, sync state and caches are rebuildable dot-paths.
3. **Sync core, async edges.** No async runtime in core; outer crates use `spawn_blocking`.
4. **Local trust, server enforcement.** Locally any process may act as anyone; on the server the
   actor comes from the token and nothing else (research: mcp-oauth §7).
5. **Optional processes.** The CLI never needs the app, the host, the watcher or sync.

Parent: [Section index](README.md).
