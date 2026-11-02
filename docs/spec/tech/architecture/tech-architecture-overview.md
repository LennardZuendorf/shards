---
type: tech
applies: "**"
updated: 2026-11-02
---

# tech: Architecture Overview

## Architecture Overview

```
               humans                         agents (Claude Code, Cowork, scripts)
                 │                                  │                     │
     ┌───────────▼───────────┐                      │ stdio JSON-RPC      │ argv / --json
     │ apps/desktop (Tauri)  │               ┌──────▼──────┐       ┌──────▼──────┐
     │ React UI ─ invoke ────┼─┐             │ shards-mcp  │       │ shards CLI  │
     └───────────────────────┘ │             └──────┬──────┘       └──────┬──────┘
     browser dev: fetch/SSE    │                    │                     │
            │                  ▼                    │                     │
     ┌──────▼──────────────────────────┐            │                     │
     │ crates/shards-host              │            │                     │
     │ Host::call(tool,args)           │            │                     │
     │  shards_* ──────────────────────┼──┐         │                     │
     │  host_*  (UI-only)              │  │         │                     │
     │ watcher → {spaces,paths} events │  ▼         ▼                     ▼
     │ bin: axum 127.0.0.1 /api, SSE   │ ┌───────────────────────────────────────────┐
     └─────────────────────────────────┘ │ shards (root crate, sync): config, spaces,│
                                         │ domain, model, fm, storage, search, mcp   │
     ┌─────────────────────────────────┐ └──────────────────────┬────────────────────┘
     │ crates/shards-server (RESERVED) │  same core per          │ atomic write, O_EXCL locks
     │ sync API · remote MCP (rmcp) ·  │  workspace replica      ▼
     │ OAuth 2.1 AS · Postgres/SQLite  │◄──── record sync ── vault/  notes/ tasks/ memories/
     └─────────────────────────────────┘   (designed, later)        scratch/ assets/ .shards/
```

Workspace members: `.`, `crates/shards-host`, `apps/desktop/src-tauri`; the root package does not
move (research: codebase §5, tauri §3). `crates/shards-server` joins when feature 18 starts.

Parent: [Section index](README.md).
