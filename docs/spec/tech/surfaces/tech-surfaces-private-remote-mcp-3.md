---
type: tech
applies: "**"
updated: 2026-11-02
---

# Private remote RPC envelopes

**RPC v1 and envelopes.** Fixed private HTTPS endpoints are `POST /v1/probe` (connector),
`/v1/describe` and `/v1/call` (connector plus client). Headers are
`x-shards-connector` and `Authorization: Bearer …`; no secret enters URLs or diagnostics.
Requests carry `v: 1`, correlation `request_id`, opaque `vault_id`, absolute positive
Unix-millisecond `deadline_ms`, and call-only `tool`/`arguments`. Reject unknown fields,
wrong types, versions, vault mismatch and expired deadlines before domain dispatch.
Probe returns `{v,request_id,vault_id}`; describe adds canonical `tools`/`instructions`;
call adds Rust-produced `mcp_result` via `mcp::errors::success|failure`.
Lists keep bare-array text plus `structuredContent.result`. Domain failures retain
`isError: true` and canonical JSON text `kind`, `message`, `next_action`, structured details
and optional `retry_after_ms`; never wrap host `{value,list}` or replace these with transport
JSON-RPC errors. Lossless numeric decoding/serialization preserves integer tokens including
`9007199254740993` and asset `u64`; ordinary JavaScript client objects can still round values,
so clients needing full-width numbers must use canonical text or lossless decoding.

Control failures are `{v,request_id,error:{kind,message,execution}}`, with execution
`not_started|unknown|completed`; null correlation is allowed only before a valid ID exists.
HTTP kinds: `unauthorized` 401, `forbidden` 403, `invalid_request` 400,
`version_mismatch|vault_mismatch` 409, `busy` 429, `unavailable` 503,
`deadline_exceeded|outcome_unknown` 504, `payload_too_large|response_too_large` 413.
Authentication fails before MCP dispatch with a Bearer challenge. Open tool calls map
control failures to failed MCP results preserving execution state; disconnected clients may
receive no final response. These add no core CLI exit codes.

Parent: [Section index](README.md).
