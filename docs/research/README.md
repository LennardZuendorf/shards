# Shards research and decision brief (2026-10-15)

Snapshot of the research and the PM decision brief behind the Shards pivot. The specs in
`.spec/` cite these files:

- `(research: <name> §n)` → `docs/research/<name>.md`, section n.
- `DECISIONS Dn` → [DECISIONS.md](DECISIONS.md), decision Dn.

| File | Covers |
|---|---|
| [DECISIONS.md](DECISIONS.md) | Authoritative PM decisions: name, positioning, personas, delegation, pricing, task model v2, identity, architecture, principle reversals, roadmap |
| [BUILD.md](BUILD.md) | Build contract used for the first prototype (workspace layout, transport, host tools, frontend ownership) |
| [market.md](market.md) | Competitors, parity matrix, human+agent task category, memory tools, pricing, name collisions |
| [taskui.md](taskui.md) | Analysis of the obsidian-taskui reference UI: features, anatomy, what to port |
| [memory-ux.md](memory-ux.md) | Memory and scratchpad management UX across products; screens and gaps |
| [codebase.md](codebase.md) | Pre-pivot core map: embedding API, rename blast radius, task-model gaps |
| [sync.md](sync.md) | Sync architecture options and the chosen record-sync design |
| [mcp-oauth.md](mcp-oauth.md) | Remote MCP over Streamable HTTP with OAuth 2.1: spec, clients, crates, identity |
| [tauri.md](tauri.md) | Tauri 2.12 + React stack, IPC, plugins, browser mode, versions |

These are point-in-time research notes, not specs. Pre-rename names (`mesh`) are kept as written.
Where a note and a spec disagree, the spec wins.

Additional reviews:

- [Private remote access: three-agent review](private-remote-review.md) (2026-10-28): proposal
  findings, Paseo source/history, TypeScript versus Rust and a proposed runtime spike. Research
  recommendations only; not an approved implementation design.
