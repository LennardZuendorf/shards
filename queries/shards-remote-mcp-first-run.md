# Private remote MCP — first loopback execution receipt

Date: 2026-11-04. **Result: local source path PASSED on loopback; deployment still UNPROVEN.**
First execution of the private remote MCP merged in #64 (`45f0f8b`), which until now carried only
local tests and an honest "UNPROVEN, zero instances" acceptance note.

Scope held: loopback only, throwaway vault, throwaway credentials, no Tailscale, no Funnel, no DNS
change, no public listener, no real vault, no OAuth. Everything below is verbatim output, trimmed
only in the middle of long JSON.

## What ran

| Element | Value |
| --- | --- |
| Commit | `45f0f8b` (origin/main, PR #64) |
| Toolchain | cargo/rustc 1.94.1, node v24.22.0, pnpm 12.6.0 |
| Receiver | `target/debug/shards-gateway serve` on `127.0.0.1:8791` |
| Adapter | `services/shards-remote` shipped modules on `127.0.0.1:8794` (`POST /mcp`) |
| Vault | fresh dir, one core config, one gateway config, one grants registry (mode 0600) |
| Grant | `bot` (agent), scopes `notes:write` + `memories:read`, expiry 2026-11-05 |
| Credentials | connector + grant minted by `shards-gateway connector|grant issue`; only sha256 stored; values never printed here |

Corrections to the assumptions in the task that authorised this run, found in the code first:
- The Rust receiver exposes `POST /v1/probe`, `/v1/describe`, `/v1/call`. `POST /mcp` is the Node
  adapter only. Both layers were exercised.
- There is no `not_available_remote` in this private surface; that error belongs to the feature-19
  public OAuth design (`docs/spec/features/remote-mcp/tech.md`). Here an unpermitted tool is
  refused as `forbidden / not_started`.
- `shards_search` is **permitted** to any read grant (it searches the grant's authorised corpus),
  not refused. The absent tools are the local-only ones.

## Step 1–2 — receiver, tokens, protocol

Envelope: `{"v":1,"request_id":"<uuid>","vault_id":"first-run-vault","deadline_ms":<now+10s>}`,
`Host: receiver.example.ts.net:8792`, `x-shards-connector: <connector>`,
`Authorization: Bearer <grant>`, `content-type: application/json`.

`POST /v1/probe` (connector only, no client token) — **200**
```
{"v":1,"request_id":"e8d88929-...","vault_id":"first-run-vault"}
```
`POST /v1/describe` (connector + grant) — **200**, 16,601 bytes, **17 tools**: `shards_note_get`,
`note_list`, `note_new`, `note_append`, `note_update`, `note_claim`, `note_release`, `memory_get`,
`memory_list`, `memory_recall`, `search`, `health`, `recent_activity`, `build_context`, `graph`,
`project`, `session_start`. No `host_*`, no `shards_note_adopt`, no `memory_supersede`/`forget`, no
`task_*`/`scratch_*`/`asset_*` (spaces not granted).
```
"instructions":"Shards private MCP acts as 'bot' from a verified grant. The local Rust authority enforces the grant on every call. ... never automatically replay a mutation."
```

## Step 3 — read, write, and refusals at the receiver

| Call | Status | Literal response (trimmed) | Verdict |
| --- | --- | --- | --- |
| `shards_note_list {}` | 200 | `{"mcp_result":{"content":[{"type":"text","text":"[]"}],"structuredContent":{"result":[]}}}` | read works on empty vault |
| `shards_note_new {title,body}` | 200 | `"structuredContent":{"id":"n-TDEG","owner":"bot",...}` | write lands; `owner` is the verified actor, not a caller claim |
| `shards_note_get {"id":"n-TDEG"}` | 200 | `...\"body\":\"written through the private gateway\",\"space\":\"notes\"` | read-back matches |
| `shards_search {"query":"private gateway"}` | 200 | `"mode":"fallback"`, hit `n-TDEG` | permitted for the grant's corpus (corrects the task assumption) |
| `shards_task_list {}` (space not granted) | **403** | `{"kind":"forbidden","message":"tool is not available to this grant","execution":"not_started"}` | ungranted space refused before dispatch |
| `shards_note_adopt` (local-only) | **403** | same body | local-only tool never routable |
| `host_note_delete {}` (UI-only) | **403** | same body | `host_*` absent and refused |

## Step 4 — bad credentials and bad transport

| Request | Status | Literal response / headers | Verdict |
| --- | --- | --- | --- |
| `describe`, wrong client token | **401** | `www-authenticate: Bearer realm="shards"` + `{"error":{"kind":"unauthorized","message":"invalid or expired credential","execution":"not_started"}}` | fail closed, no `resource_metadata` |
| `describe`, no client token | **401** | `request_id:null`, `"client credential required"` | connector alone cannot read |
| `probe`, wrong connector | **401** | `"invalid or expired credential"` | connector is a separate credential |
| `call`, no connector | **401** | `"connector credential required"` | both credentials are required |
| wrong `Host: attacker.example` | **403** | `{"kind":"forbidden","message":"untrusted request origin"}` | origin guard before authority lookup |
| wrong `Origin: https://attacker.example` | **403** | same body | browser-origin guard holds |

Vault state after all refusals: only `notes/n-TDEG.md` exists. No `tasks/`, `memories/`, `scratch/`
or `assets/` directory was created — a refused call prepares nothing.

## Step 5 — the real `POST /mcp` path

The adapter cannot reach a loopback receiver by design: it requires `https://*.ts.net` origins, a
verified TLS certificate and an explicit userspace CONNECT proxy. To keep this run loopback-only and
tailnet-free, a local stand-in supplied exactly that path without DNS or public exposure: a TLS
terminator for `receiver.example.ts.net` on `127.0.0.1:8792` in front of the gateway, a CONNECT proxy
on `127.0.0.1:8793` that maps that one authority to loopback, and `NODE_EXTRA_CA_CERTS` pointing at
the run's own throwaway CA. Two deviations, both recorded: (a) the stand-in replaces Tailscale — so
this proves the adapter's protocol path, not tailnet ingress; (b) the shipped entrypoint binds
`127.0.0.1:8787`, already held by an unrelated process on this host, so the launcher ran the same
shipped modules (`readConfig`, `GatewayClient`, `createMcpListener`) on `127.0.0.1:8794`.

Requests: `Host: vault.example.ts.net`, `Authorization: Bearer <grant>`,
`content-type: application/json`, `accept: application/json, text/event-stream`.

| JSON-RPC | Status | Literal response (trimmed) | Verdict |
| --- | --- | --- | --- |
| `initialize` (2025-06-18) | 200 | `"serverInfo":{"name":"shards-private","version":"0.1.0"}`, instructions naming `bot` | handshake reaches Rust (no cached authority) |
| `tools/list` | 200 | 17 tools, identical set to `/v1/describe` | SDK discovery is the principal's filtered table |
| `tools/call shards_memory_recall` | 200 | `{"content":[{"type":"text","text":"[]"}],"structuredContent":{"result":[]}}` | read through the adapter |
| `tools/call shards_note_new` | 200 | `"structuredContent":{"id":"n-5QT5","owner":"bot",...}` | write through the adapter |
| `tools/call host_note_delete` | 200 | `"structuredContent":{"kind":"forbidden","message":"Private gateway request failed","execution":"not_started"},"isError":true` | refused as a tool result, not silently dropped |
| `tools/call shards_task_list` | 200 | same `forbidden / not_started` result | ungranted space refused at the adapter edge |
| `tools/call shards_note_new owner:"someone-else"` | 200 | `{"kind":"identity_mismatch",...},"isError":true` | caller-supplied identity is rejected by Rust |
| bad bearer token | **401** | `www-authenticate: Bearer realm="shards-private"`, empty body, no `resource_metadata` | matches the design intent |
| missing bearer token | **401** | same challenge, empty body | — |
| wrong `Host` | **403** | empty body | host guard |
| wrong `Origin` | **403** | empty body | origin guard |
| `GET /mcp` | **405** | `allow: POST` | only POST exists |
| `tools/list` after `grant revoke` | **401** | same challenge | revocation takes effect on the next POST |

## Verdict

**PASS for what was actually run:** the merged source executes end to end on loopback. A grant can
read and write only its scoped space; unpermitted tools, ungranted spaces, foreign identities,
wrong hosts/origins, missing credentials, invalid tokens and revoked grants are all refused before
dispatch with explicit, non-misleading envelopes; the receiver's own logs and the adapter's stderr
stayed empty (no token or host-path leakage); refused calls created no directories.

**Still UNPROVEN, unchanged by this run:** the pinned image build, real Tailscale Serve ingress and
the userspace CONNECT leg, TLS/DNS from a real client, Vercel's overlay ingress and its support
clarification, 39-tool policy coverage on a real deployment, overload, uncertain-write handling,
restart/rollout overlap, and cleanup of real resources. This run used a local TLS/CONNECT stand-in,
so it does not close the deployment gate in
[plan-private-mcp-deployment-acceptance](../docs/spec/flows/delivery/plan-private-mcp-deployment-acceptance.md).
Feature 19 (public OAuth, synced vault) remains NOT STARTED.

**Security read:** the parts most likely to hide a flaw (authority lookup per request, actor
binding, space scoping, refusal envelopes, revocation) behaved correctly on the first real
execution. The residual risk is concentrated in the untested transport/deployment leg, not in the
authorization path.

## Cleanup

Gateway, TLS/CONNECT stand-in and adapter were stopped (no remaining listeners on 8791–8794); the
throwaway vault, configs, CA and tokens stay under the run's scratch dir and are safe to delete. No
system, DNS, tailnet or live-vault state was touched.
