---
type: flow
updated: 2026-11-02
---

# product-cli: Overview

# CLI and MCP conventions — Product

`shards` (CLI) and `shards-mcp` (stdio MCP) are the surfaces agents live on, and the desktop app
reaches the same core through `shards-host`. These conventions span every verb family and every
feature, so they live here rather than in a feature folder. **Tone:** quiet, deterministic,
instant. Humans get terse text; agents get strict JSON. A command never depends on another
process being up. Moved from the pre-Shards `design.md`, which now holds the visual design system.

**Parent:** [product.md](../../concepts/product/README.md) · **Architecture:** [tech.md](../../tech/architecture/README.md) · **Visual design:** [design.md](../../tech/design-system/README.md)

---

Parent: [Section index](README.md).
