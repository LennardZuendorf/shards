---
type: feature-tech
feature: remote-mcp
status: planned
sibling: product.md
parent: ../../tech.md
updated: 2026-10-26
---

# Feature: Remote MCP — Architecture

`crates/shards-server` mounts an `rmcp` 3.x `StreamableHttpService` at `/mcp` behind an axum
auth layer. The layer turns a JWT or PAT into a `Principal`, answers 401/403 challenges before
rmcp runs, and enforces per-space scopes. A hand-written `ServerHandler` maps `tools/list` to the
existing schema table and `tools/call` to `mcp::tools::Server::call`, run with `spawn_blocking`
inside the workspace actor against the server replica that sync maintains, with sync's `InProcessArbiter` for claims. The same binary embeds
an OAuth 2.1 authorization server (PRM, RFC 8414 metadata with RFC 9207 `iss`, CIMD, PKCE S256,
RFC 8707 audience, refresh rotation, PATs); an external IdP mode validates foreign JWTs instead.

**Parent:** [../../tech.md](../../tech.md)
**Requirements:** [product.md](product.md)
**Research:** [research.md](research.md)
**Depends on:** [../sync/tech.md](../sync/tech.md) § Server replica, § Claims, server accounts
and first-party tokens.

---

## Files

```
src/mcp/tools.rs                     # fills CallCtx.principal (seam owned by desktop-app S1:
                                     #   CallCtx { cfg, principal } + Server::call_in); identity rules
src/mcp/remote.rs                    # Principal, identity-argument rules, output path redaction ~300 LOC
crates/shards-server/src/mcp/handler.rs   # rmcp ServerHandler over schema + Server::call_in   ~250 LOC
crates/shards-server/src/mcp/layer.rs     # Origin check, bearer auth, scope gate, challenges ~350 LOC
crates/shards-server/src/mcp/scopes.rs    # TOOL_SCOPES table (40 rows), filtered-read set     ~120 LOC
crates/shards-server/src/oauth/metadata.rs  # PRM (RFC 9728) + AS metadata (RFC 8414)         ~120 LOC
crates/shards-server/src/oauth/authorize.rs # /authorize, login session, consent              ~400 LOC
crates/shards-server/src/oauth/token.rs     # /token: code+PKCE, refresh rotation, PAT n/a    ~350 LOC
crates/shards-server/src/oauth/cimd.rs      # CIMD fetch + validate, SSRF guard, cache        ~250 LOC
crates/shards-server/src/oauth/dcr.rs       # RFC 7591, off by default                        ~150 LOC
crates/shards-server/src/oauth/pat.rs       # create/hash/verify/revoke PATs                  ~120 LOC
crates/shards-server/src/oauth/revocation.rs # /revoke + grant revocation cache              ~120 LOC
crates/shards-server/templates/consent.html  # server-rendered consent + login (no JS required)
crates/shards-server/migrations/*_oauth.sql
src/cli/sync.rs                      # adds `shards sync agents` and `shards sync token`
tests/remote_mcp_*.rs, crates/shards-server/tests/*   # conformance, parity, isolation
```

The dispatch seam is defined once, in desktop-app tech S1: `pub struct CallCtx { pub cfg:
Arc<Config>, pub principal: Option<Principal> }` and `Server::call_in(&self, ctx: &CallCtx, name,
args)`; every tool method builds its `Ctx` through `ctx_from(&CallCtx, owner)` (`Ctx::with_config`),
and `Server::call` loads the config and delegates. desktop-app lands it with `principal` always
`None`. This feature does not redefine the seam: it adds the `Principal` type, sets `principal` to
`Some` on the server, and gates identity rules and output redaction on it. Stdio behaviour stays
byte-identical when `principal` is `None` (pinned by `tests/mcp_cli.rs`).

---

## Contract / API

### Endpoints

| Path | Spec | Notes |
|---|---|---|
| `POST /mcp` (+ `GET`/`DELETE` for legacy sessions, disabled) | MCP Streamable HTTP | rmcp `with_legacy_session_mode(false)`, `with_json_response(true)`; never `with_stateless_protocol_metadata_required(true)` |
| `GET /.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp` | RFC 9728 | `resource` = canonical `https://<host>/mcp` |
| `GET /.well-known/oauth-authorization-server` | RFC 8414 | also served at `/.well-known/openid-configuration` |
| `GET /authorize` | OAuth 2.1 + PKCE S256 + RFC 8707 `resource` | login (session cookie) → consent → redirect with `code`, `state`, `iss` |
| `POST /token` | `application/x-www-form-urlencoded` | `authorization_code`, `refresh_token`; public clients `none`; `private_key_jwt` accepted |
| `POST /revoke` | RFC 7009 | refresh tokens and PATs |
| `GET /jwks.json` | JWKS | ES256 keys, rotated every 90 days, two keys published |
| `POST /register` | RFC 7591 | only when `[auth] dcr = true`; honours `application_type` |
| `GET/DELETE /v1/grants[/{id}]`, `POST/GET/DELETE /v1/pats[/{id}]` | first-party API (`aud=…/api`) | backs Connected agents in the app and `shards sync agents` / `shards sync token` |

PRM body:

```json
{ "resource": "https://mcp.shards.app/mcp",
  "authorization_servers": ["https://mcp.shards.app"],
  "scopes_supported": ["tasks:read","tasks:write","notes:read","notes:write",
    "memories:read","memories:write","scratch:read","scratch:write",
    "assets:read","assets:write","offline_access"],
  "bearer_methods_supported": ["header"] }
```

AS metadata (fields that decide client behaviour):

```json
{ "issuer": "https://mcp.shards.app",
  "authorization_endpoint": "https://mcp.shards.app/authorize",
  "token_endpoint": "https://mcp.shards.app/token",
  "revocation_endpoint": "https://mcp.shards.app/revoke",
  "jwks_uri": "https://mcp.shards.app/jwks.json",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code","refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none","private_key_jwt"],
  "client_id_metadata_document_supported": true,
  "authorization_response_iss_parameter_supported": true,
  "scopes_supported": ["…same as PRM…"] }
```

Claude uses CIMD only when both `client_id_metadata_document_supported: true` and `"none"` in
`token_endpoint_auth_methods_supported` are present; ChatGPT uses its stable
`https://chatgpt.com/oauth/client.json` only when `authorization_response_iss_parameter_supported`
is true and `iss` is returned on every authorization response (research §4). `registration_endpoint`
appears only when DCR is on.

### Protocol versions

Served: `2026-07-28` (stateless, `Mcp-Method`/`Mcp-Name` headers, `server/discover`) and legacy
`2025-11-25`, `2025-06-18` (initialize, no session id kept). The stdio server's
`PROTOCOL_VERSION` (`2025-06-18`, `src/mcp/mod.rs`) is unchanged by this feature.

### Access token (JWT, ES256, 30 min)

```json
{ "iss": "https://mcp.shards.app", "aud": "https://mcp.shards.app/mcp",
  "sub": "mem_agent_7f2a", "act": { "sub": "mem_human_lennard" },
  "client_id": "https://claude.ai/oauth/mcp-oauth-client-metadata",
  "ws": "ws_lennard", "scope": "tasks:read tasks:write memories:read offline_access",
  "grant_id": "gr_7f2a", "jti": "…", "iat": 1760500000, "exp": 1760501800 }
```

- `sub` = the acting member (agent or human). `act.sub` = the sponsoring human who consented;
  omitted when the human acts as themselves.
- `aud` MCP tokens are `…/mcp`; first-party sync/app tokens are `…/api`. Neither is accepted at
  the other.
- Refresh token: opaque 256-bit, stored hashed, 30 days sliding, rotated on every use; reuse of a
  used token revokes the whole family and the grant.
- Authorization code: single-use, 60 s. Reuse of a used code revokes the grant and every access
  and refresh token issued from it (OAuth 2.1 §4.1.3).
- PAT: `shd_pat_<32 base62>`; stored as SHA-256; resolves to the same `Principal` with
  `client_id = "pat"`, `grant_id = pat id`.

```rust
// src/mcp/remote.rs
pub struct Principal {
    pub member: String,            // handle of sub
    pub member_kind: MemberKind,   // Human | Agent
    pub sponsor: Option<String>,   // handle of act.sub
    pub workspace: String,         // ws
    pub scopes: ScopeSet,          // parsed scope claim
    pub grant_id: String,
    pub client_host: String,       // claude.ai | chatgpt.com | "pat" | …
}
// CallCtx { cfg: Arc<Config>, principal: Option<Principal> } is desktop-app S1's struct;
// the server builds cfg with the vault root = replica(ws).
```

### Auth storage (same DB as sync; `sqlx`, Postgres or SQLite)

```sql
oauth_clients(client_id PRIMARY KEY, kind /*cimd|dcr|pre*/, metadata JSONB, fetched_at, expires_at)
grants(id PRIMARY KEY, workspace_id, member_id, sponsor_member_id NULL, client_id, client_host,
       redirect_host, scopes TEXT, created_at, last_used_at, revoked_at)
auth_codes(code_hash PRIMARY KEY, grant_id, code_challenge, redirect_uri, resource, expires_at, used_at)
-- refresh_tokens is sync's table; MCP rows use aud = 'mcp' and set grant_id (device_id NULL)
pats(id PRIMARY KEY, hash UNIQUE, workspace_id, member_id, sponsor_member_id, scopes, expires_at,
     created_at, last_used_at, revoked_at)
audit_log(id, at, workspace_id, member_id, sponsor_member_id, client_host, grant_id, tool, entity, outcome)
```

`members` (with `kind`, `sponsor_member_id`) is owned by sync. Creating a new agent member at
consent inserts a `members` row with `kind = agent`, `sponsor_member_id = human`.

---

## Implementation Detail

### Request pipeline for `/mcp`

1. **Origin** — if an `Origin` header is present and not in `[mcp].allowed_origins`, return 403.
2. **Bearer** — missing/invalid/expired → `401` with
   `WWW-Authenticate: Bearer resource_metadata="https://<host>/.well-known/oauth-protected-resource/mcp", scope="<all read+write scopes> offline_access"`.
   JWT checks: signature (local JWKS or, in external mode, cached remote JWKS), `iss`, `aud ==
   canonical /mcp`, `exp`, `ws` present. PAT: hash lookup, not expired, not revoked.
3. **Revocation cache** — `grant_id` checked against an in-memory set refreshed from `grants` /
   `pats` every 30 s and on local revoke; worst case 60 s with clock and propagation slack (R10).
4. **Scope gate** — always parse the JSON-RPC body and take `params.name` for `tools/call`, in
   every protocol version. If `Mcp-Name` (2026-07-28) is present and differs from the body name,
   return `400` `invalid_request`. The scope check uses the body name only; the header is never
   trusted for authorization. If the tool's required scope is missing → `403` with
   `WWW-Authenticate: Bearer error="insufficient_scope", scope="<required>", resource_metadata="…"`.
   Filtered-read tools need any one read scope.
5. **Rate limit** — `governor`: 600 calls/min and 20 concurrent per grant; over → 429 with
   `Retry-After`.
6. **rmcp** — handler builds `CallCtx { cfg: replica_config(ws), principal: Some(..) }`, then
   sends the call to the workspace actor, which runs `Server::call_in` in `spawn_blocking`. Tool errors
   for ChatGPT that relate to auth also carry `_meta["mcp/www_authenticate"]`; tools declare
   `securitySchemes` (`oauth2` + scopes) in `_meta` for ChatGPT.

<!-- merge -->
### Identity rules (`src/mcp/remote.rs`, active only when `principal` is `Some`)

| Argument | Tools | Remote rule |
|---|---|---|
| `GlobalOpts.owner` (actor) | all | Set from `principal.member`; never from arguments |
| `claimer` | `task_claim`, `note_claim` | absent or == actor, else exit-2 `identity_mismatch` |
| `owner` (acting identity) | `task_release`, `note_release` | absent or == actor; `force` on `note_release` allowed only when `member_kind = Human` |
| `owner` (author) | `note_new`, `memory_new` | absent or == actor |
| `owner` (memory reassignment) | `memory_update` | absent, == actor, or (human actor only) an agent the actor sponsors; a private memory is updatable only by its owner or sponsor |
| `owner` (assignee) | `task_new`, `task_update` | any active member of `ws` (assignment, D4); unknown handle → exit 2 |
| `agent` | `scratch_set`, `scratch_append` | absent or == actor |
| `agent` | `scratch_get`, `scratch_list` | actor, or an agent the actor sponsors |
| `owner` | `session_start` | actor, or an agent the actor sponsors |
| `owner`, `mine` filters | `note_list`, `task_list`, `memory_list`, `memory_recall`, `asset_list`, `search`, `recent_activity` | unchanged filters; `mine` = actor |
| `timestamp` attribution | `*_append` | names the actor |
| memory `scope: private` | every read path | visible only to owner member and its sponsor (R9) |

The rules sit at the single write boundary that already validates identity (root invariant 7),
so CLI and stdio behaviour is unchanged when `principal` is `None`.
<!-- /merge -->

### Tool → scope map (all 42 tools)

| Tool | Required scope | Remote notes |
|---|---|---|
| `shards_note_get`, `shards_note_list` | `notes:read` | |
| `shards_task_get`, `shards_task_list` | `tasks:read` | responses carry `conflict: true` when flagged by sync |
| `shards_search` | any read; filtered | drops hits from unreadable spaces and private memories of others |
| `shards_health` | authenticated, none | redacted: no paths, binaries or host details |
| `shards_recent_activity` | any read; filtered | |
| `shards_build_context` | any read; filtered | |
| `shards_graph` | any read; filtered | |
| `shards_project` | any read; filtered | |
| `shards_session_start` | any read; filtered | `owner` rule above |
| `shards_note_new`, `shards_note_append`, `shards_note_update` | `notes:write` | author rule on `note_new`; `timestamp` names the actor |
| `shards_note_adopt` | — | **not exposed**; absent from `tools/list`; call → `not_available_remote` |
| `shards_note_claim`, `shards_note_release` | `notes:write` | claim CAS + lease via `InProcessArbiter` (sync tech § Claims) |
| `shards_task_new`, `shards_task_append`, `shards_task_update` | `tasks:write` | assignee rule on `task_new`/`task_update` |
| `shards_task_claim`, `shards_task_release`, `shards_task_next` | `tasks:write` | `task_next` claims, so it is a write; claim CAS + lease via `InProcessArbiter` |
| `shards_task_finish`, `shards_task_cancel` | `tasks:write` | `task_cancel` keeps `destructiveHint` |
| `shards_task_block`, `shards_task_unblock` | `tasks:write` | |
| `shards_memory_new`, `shards_memory_append`, `shards_memory_update` | `memories:write` | author rule on `memory_new`; reassignment rule on `memory_update`; private rule |
| `shards_memory_supersede`, `shards_memory_forget` | `memories:write` | the agent-side lifecycle. `supersede {target, by}` is idempotent and stamps `superseded_by`; `forget {target}` keeps `destructiveHint: true`, so a client gating destructive tools prompts first, and a second forget is `not_found`. Both are the *only* removal path exposed remotely and neither widens the withheld-substring ban |
| `shards_memory_get`, `shards_memory_list`, `shards_memory_recall` | `memories:read` | private rule |
| `shards_scratch_set`, `shards_scratch_append` | `scratch:write` | own namespace only; scratch lives in the replica, synced only to devices that opted in |
| `shards_scratch_get`, `shards_scratch_list` | `scratch:read` | own or sponsored namespaces |
| `shards_asset_get`, `shards_asset_list` | `assets:read` | `asset_get` returns vault-relative path + signed URL (10 min), never a host path |
| `shards_asset_attach` | `assets:write` + write scope of the target's space | target space from id prefix |

41 tools are listed remotely. `offline_access` only enables refresh tokens. `host_*` tools exist
only in `shards-host` and are never registered here.

### Output path redaction (`src/mcp/remote.rs`, active only when `principal` is `Some`)

`render::entry` puts an absolute `path` in every get/list/write payload, and error messages embed
paths (for example `lock is held: /…`). When `principal` is `Some`, after the tool returns and
before the envelope is serialised:

- every payload's `path` is replaced by `rel_path` (vault-relative; a space outside the vault uses
  the `@<space>/…` form from desktop-app tech);
- the envelope `message` and every structured string field are rewritten through the same
  vault-prefix strip: any occurrence of the replica root (canonical and as configured) becomes the
  vault-relative form;
- `shards_health` and `shards_asset_get` keep their stricter rules in the table above.

The strip is one function applied to the whole JSON value, so new fields are covered without a
per-tool list. With `principal` `None` (CLI, stdio, host) output is unchanged.

### Consent and login

- Login: session cookie (`SameSite=Lax`, `Secure`, 12 h). Self-host: argon2 password; hosted:
  upstream OIDC (Google, GitHub) via `openidconnect`. Accounts are sync's.
- Consent shows `client_id` host, `redirect_uri` host, and a warning when every redirect is
  loopback. Inputs: workspace (only `mode = standard`), act-as (myself | sponsored agent | new
  agent handle, validated like any identity), scope checkboxes pre-filled from the request.
- The consent POST carries a per-session CSRF token bound to the `/authorize` request
  (`client_id`, `redirect_uri`, `code_challenge`, `state`); a missing or mismatched token → 403.
  Login and consent responses send `Content-Security-Policy: frame-ancestors 'none'` and
  `X-Frame-Options: DENY`.
- A grant is upserted per `(member, client_id, workspace)`; re-consent narrows or widens scopes.
- Redirect matching: exact for HTTPS; loopback `http://localhost:<any>/…` and
  `http://127.0.0.1:<any>/…` match with the port ignored.

### CIMD fetch

HTTPS only. Resolve the host once and validate every returned address (refuse private, loopback,
link-local, multicast and unspecified, IPv4 and IPv6, including IPv4-mapped); then connect to the
validated IP through a custom resolver, with SNI and `Host` set to the hostname, so a DNS-rebinding
answer cannot change the target between check and connect. If an egress proxy is configured, the
proxy's resolved target is re-validated. 5 KiB cap; 3 s timeout; no redirects; cache by `Cache-Control` (min 5 min, max 24 h). Validate
`client_id == URL`, `redirect_uris` non-empty. Accept `token_endpoint_auth_method` or the plural
`token_endpoint_auth_methods_supported` (ChatGPT) and pick `none`, else `private_key_jwt`.
Optional `[auth].cimd_allowlist` (e.g. `claude.ai`, `chatgpt.com`, `vscode.dev`).

### External IdP mode

`[auth] mode = "external"`, `issuer`, `jwks_uri`, `audience`, `member_claim` (claim → member
handle), `workspace_claim` or a fixed `workspace`. The server then serves only PRM (pointing to
the external issuer) and `/mcp`; consent and act-as are the IdP's job. PATs keep working.

### Rate limits

| Bucket | Limit |
|---|---|
| `/mcp` per grant | 600 calls/min, 20 concurrent |
| `/authorize`, `/token` per IP | 30/min |
| `/token` per client_id | 120/min |
| CIMD fetch per host | 10/min |
| PAT creation per member | 20/day |

### Security notes

- Tokens only in the `Authorization` header; query-string tokens are rejected.
- No token passthrough: the server never forwards a client token anywhere.
- Every auth decision and every write goes to `audit_log`; content is never logged.
- E2EE workspaces (`workspaces.mode = e2ee`) are excluded at consent and any token for one is
  refused with 403 `workspace_encrypted`.

## Performance Budget

| Path | Budget |
|---|---|
| Auth layer (JWT verify + cache lookups) | p95 ≤ 2 ms |
| Tool call server time, 10,000-entity replica | p95 ≤ 300 ms |
| `/token` | p95 ≤ 200 ms (Claude limit 10 s, refresh 30 s) |
| CIMD fetch cold | ≤ 3 s timeout |

## Verification

- Conformance: PRM, 401 challenge before rmcp, 403 `insufficient_scope`, audience check, CIMD,
  PKCE, `iss`, refresh rotation and reuse detection — against the 2026-07-28 auth spec and the
  rmcp client (`auth` feature) as a test client.
- Scope bypass: a `tasks:read` token sends `Mcp-Name: shards_task_list` with a body calling
  `shards_task_cancel` → 400 `invalid_request`, task unchanged; the same body without the header
  → 403 `insufficient_scope`.
- OAuth hardening: CIMD host whose DNS answers a public IP at check and `169.254.169.254` /
  `10.0.0.1` on a second lookup → no connection to the private address (pinned-IP resolver);
  consent POST without or with a foreign CSRF token → 403, and responses carry
  `frame-ancestors 'none'` and `X-Frame-Options: DENY`; a second `/token` exchange of the same
  code → `invalid_grant`, and the access and refresh tokens from the first exchange are refused.
- Parity: each of the 39 exposed tools, stdio vs remote on the same replica, identical JSON except
  documented redactions. Every remote response, success and error (including `lock is held`),
  is scanned: no string contains the replica root path; `path` fields equal `rel_path`.
- Isolation: per tool, a second workspace and a second agent's private memory never leak.
- Manual client pass per release: Claude.ai, Claude Desktop, Claude Code, ChatGPT developer mode,
  VS Code.

## Open Questions

1. **`oauth-as` 1.0 vs hand-rolled AS core** — the crate claims PKCE, rotation, RFC 8414/9207/8707
   and CIMD validation but is new (created 2026-08, single maintainer). Spike for 2 days against
   the § Endpoints checklist; fall back to about 1.5k LOC hand-rolled.
2. **Unverified client behaviour** — whether Claude's transport already negotiates 2026-07-28,
   Cursor and Windsurf CIMD support, and whether WorkOS returns RFC 9207 `iss` in external mode.
   Verify in the first integration spike; keep DCR behind a flag as fallback.
3. **Token lifetime** — 30 min access tokens with a 60 s revocation cache; shorten if audit shows
   risk.
