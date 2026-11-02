---
type: concept
updated: 2026-11-02
---

# product: Overview

# Shards — Product

Shards is a task manager that humans and their agents share. A Todoist-grade desktop app, the
`shards` CLI and the `shards-mcp` server all work on one local folder of Markdown files. That
folder holds tasks, notes, agent memories, agent scratchpads and assets. Solo use is free,
offline and needs no account. A paid server adds multi-device sync, a hosted MCP endpoint for
cloud agents and, later, shared team workspaces.

Citations `(research: <name> §n)` and `DECISIONS Dn` across `docs/spec/` resolve to
[docs/research/](../../../research/README.md).

**Category (D2, long term):** the multiplayer task manager for humans and agents — backed by
Markdown you own. **Public tagline (Now and Next):** "Todoist-grade tasks for you and your
agents — on Markdown you own." "Multiplayer" enters public copy only at the Team launch.

**Formerly mesh.** Shards grows out of mesh, the Rust CLI and stdio MCP core that is already
delivered: five spaces, atomic claims, a live dependency graph, memories and 42 MCP tools. All
of it stays true unless § Non-goals reverses it. Peers: [tech.md](../../tech/architecture/README.md), [design.md](../../tech/design-system/README.md),
[plan.md](../../flows/delivery/README.md). Branches: roadmap and KPIs ([product-roadmap.md](../roadmap/README.md)), market
([product-market.md](../market/README.md)), hosting ([product-hosting.md](../hosting/README.md)), CLI ([product-cli.md](../../flows/cli/README.md)).

The locally implemented [private MCP profile](../../tech/surfaces/tech-surfaces-private-remote-mcp-1.md#private-remote-mcp) forwards
calls to the authoritative local vault without a cloud content replica. Separate client
grants identify actors and per-space permissions; the local gateway owns authorization.
Its Vercel/Tailscale deployment remains UNPROVEN and unapproved. It is separate from the
later synced-vault OAuth profile; see the [deployment gate](../../flows/delivery/plan-private-mcp-deployment-acceptance.md#private-mcp-deployment-acceptance).

Parent: [Section index](README.md).
