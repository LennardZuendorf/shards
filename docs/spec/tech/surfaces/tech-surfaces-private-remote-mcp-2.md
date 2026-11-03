---
type: tech
applies: "**"
updated: 2026-11-02
---

# Private remote visibility and transport

**Visibility and coordination.** Authorize the exact metadata/body snapshot returned or
ranked, including concurrent privacy edits and overlapping space roots. Object privacy
survives an overlapping readable root. Filter hidden candidates, references, aggregates and
generated paths before ranking, limits and result construction; health reveals no hidden
counts/config/paths. Restricted search/recall uses the existing built-in engine over the
authorized corpus when the external engine cannot enforce this boundary. Reuse the core
walk and parsers. Task readiness and strict claim use the full graph before visible result
limits: a hidden blocker still blocks. The visible task may expose derived readiness only;
hidden blocker IDs, titles, edges and counts remain absent, with generic claim refusal.
Graph and unblock reports omit hidden references. Asset get/list returns metadata/caption,
not blob bytes. Generated paths are space-relative with their space; inert authored content
and unknown frontmatter are never generically scrubbed.

**MCP transport and parity.** Stateless Streamable HTTP accepts one JSON-RPC message per
`POST /mcp`; batches are rejected. Authenticate initialize and notifications through the
gateway before SDK handling. Each POST has isolated request/transport state, no retained
authenticated session, `Mcp-Session-Id`, resumable events, SSE or server-initiated requests.
Reject incoming session/resume headers; GET and DELETE return 405. Reused request IDs
share no state or authority; cancellation in another POST cannot cancel a call. Notifications
have no response body. One SDK response writer owns completion after dispatch.
Full-authority discovery exposes 39 of the 42 canonical tools; scope-limited discovery exposes usable
tools only, and guessed forbidden names fail closed. `shards_note_adopt` is excluded because
this profile accepts entity IDs, not foreign paths. `shards_memory_supersede` and
`shards_memory_forget` also remain excluded from this private policy. The local 42-tool and
future public OAuth 41-tool surfaces retain their separate memory lifecycle contracts. Every `host_*` tool and the core's
withheld removal/admin/ingest tools remain excluded. No wildcard policy dispatch exists.
Schemas come from Rust `schema::tools_list()`, not a second TypeScript table.

Parent: [Section index](README.md).
