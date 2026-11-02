---
type: concept
updated: 2026-11-02
---

# product-hosting: Plan limits

## Plan limits

| Limit | Personal Sync | Team (per workspace) | When exceeded |
|---|---|---|---|
| Storage (Markdown + assets) | 5 GB | 20 GB | Writes refused with a clear error; reads and export keep working |
| Remote MCP calls | 20,000 per day | 100,000 per day | 429 with `Retry-After`; local CLI and stdio MCP are unaffected |
| Devices | 10 | 10 per human seat | New device refused until one is revoked |
| Agents | Unlimited count | Unlimited count; agents are free members | — |

The per-grant burst limits in features/remote-mcp/tech.md (600 calls per minute, 20 concurrent)
sit under these daily limits.

Parent: [Section index](README.md).
