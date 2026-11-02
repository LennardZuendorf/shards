---
type: tech
applies: "**"
updated: 2026-11-02
---

# tech-core: Overview

# Shards core — Tech

The delivered core: the root crate `shards` (lib + `shards` CLI + `shards-mcp` stdio server). One
Rust binary over one Markdown folder. Parse, dispatch into pure domain functions that read and
write the folder directly, map one error enum onto a fixed exit code, exit. No daemon, no
database, no async runtime. Ranking is delegated to `indexed` when it is configured and present.
CLI and MCP are two thin renderers over the same domain. Every later process (`shards-host`, the
desktop app, `shards-server`) calls this crate and adds nothing to its contracts except what
[tech.md](../architecture/README.md) § Invariants records as amended. This file describes the committed code
(PR #11 merged in: note adopt/claim/release, memory `project`, the dashboard, 40 MCP tools).
Task model v2 is landed in the working tree, uncommitted, with units 8–9 and a few rules still
open; its contract lives in [features/task-model-v2/](../../features/task-model-v2/tech.md) until that
arc is compounded.
Per-verb behaviour: [tech-surfaces.md](../surfaces/README.md).

Parent: [Section index](README.md).
