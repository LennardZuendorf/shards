---
type: flow
updated: 2026-11-02
---

# product-cli: MCP surface

## MCP surface

- Agent tools are named `shards_*` only. `mesh_*` names are not aliased; an agent configured with
  old names reconnects to `shards-mcp` and re-reads the tool list.
- UI-only host tools (`host_*`, [tech.md](../../tech/architecture/README.md) § Host Tool Contract) are reachable only through
  `shards-host`. They never appear on the agent MCP surface.
- No agent tool name contains delete, forget, remove, clear, status, reindex or daemon; those
  verbs stay CLI- and host-only (pinned by the MCP name-ban test).
- Every tool parameter carries a description; enums list the real domain literals.
- Failures cross as the same structured envelope the CLI emits, never a stack trace.

---

Parent: [Section index](README.md).
