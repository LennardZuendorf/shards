---
type: tech
applies: "**"
updated: 2026-11-02
---

# tech: Risks & Mitigations

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `shards` binary collides with Crystal's `shards` (research: market §7) | Accepted by owner (D1); install docs name the conflict; `MESH_*`/`~/.mesh` fallbacks for one release |
| Local HTTP reachable by other processes or DNS rebinding | Loopback bind, Host/Origin checks, per-launch token (§ Security Model) |
| Tauri v3 lands mid-build | Pin `^2.12`; one generic command keeps a migration to one file |
| UI writes race agents | Same per-entity locks. Gap: body replace has no precondition yet (`expected_body_sha256` planned), so an app save can overwrite an agent's or editor's newer body; the UI does not retry `lock_conflict` (it retries only offline errors) |
| Watcher misses events (FSEvents coalescing, cloud folders) | Invalidation by space, not by path; a lagging SSE subscriber gets an all-spaces event; an SSE reconnect invalidates every query. `refetchOnWindowFocus` is off (`staleTime` 30 s) |
| Sync/remote MCP scope creep into Now | `shards-server` stays reserved until features 18–19 start |

Parent: [Section index](README.md).
