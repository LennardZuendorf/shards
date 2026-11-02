---
type: concept
updated: 2026-11-02
---

# product: Requirements (3/3)

8. **R8 Multiplayer** *(Later)*. Teams SHALL share workspaces with verified human and agent
   members. A workspace has roles, invites, shared projects, comments and @mentions,
   notifications, an activity feed and presence. Agents never cost a seat.
9. **R9 Desktop app.** Shards SHALL ship a keyboard-first desktop app, macOS first, with Inbox,
   Today, Upcoming, Projects (list and board), Labels, Search, Agents, Memories, Scratchpads and
   Notes; a command palette, quick add, a detail pane, light and dark themes. Changes from any
   writer appear within 1 s with no reload; destructive actions are undoable in the session.
10. **R10 CLI and stdio MCP retained.** The `shards` CLI and `shards-mcp` SHALL stay first-class.
    Every app capability an agent may use is on both, with identical results. Delete, forget,
    clear and restore are never exposed over agent MCP; they stay operator verbs on the CLI and
    the app. CLI cold start stays under 10 ms ([tech.md](../../tech/architecture/README.md) § Performance Budgets).
11. **R11 Spaces and sandbox (carried over).** The five spaces SHALL stay configuration, not
    layout. An existing vault is exposed as it is. A foreign file changes only on explicit adopt.
    No path ever leaves the vault.
12. **R12 One name, safe upgrade.** Everything the user sees SHALL say Shards: `shards`,
    `shards-mcp`, `shards_*`, `SHARDS_*`, `~/.shards`. For one release, `MESH_*` and `~/.mesh` are
    read when the Shards equivalent is absent. Tool names get no aliases.

Parent: [Section index](README.md).
