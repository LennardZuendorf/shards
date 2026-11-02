---
type: tech
applies: "**"
updated: 2026-11-02
---

# tech: Overview

# Shards — Technical Architecture

One synchronous Rust core over one Markdown folder, reached through three surfaces: the `shards`
CLI, the `shards-mcp` stdio server, and a desktop app that calls the same dispatcher through
`shards-host`. Markdown on disk stays the only source of truth; every long-running process is
optional. A reserved `shards-server` adds sync, remote MCP and OAuth later. Delivered contracts:
[tech-core.md](../core/README.md), [tech-surfaces.md](../surfaces/README.md).

Release and installation architecture is defined in
[release-pipeline](../../features/release-pipeline/tech.md): CLI/MCP, desktop with embedded tools,
and a separately gated future server target. v0.1.0 is published; native lifecycle and
public-URL Homebrew installation checks passed on both Mac architectures.

Parent: [Section index](README.md).
