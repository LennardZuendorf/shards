---
type: feature-research
feature: remote-mcp
parent: product.md
updated: 2026-10-15
---

# remote-mcp — Research

Discovery artifacts for remote MCP, condensed from the 2026-10-15 MCP + OAuth research. Deleted
with the feature folder at wrap-up. Durable findings go to root `tech.md` through the merge blocks
in [tech.md](tech.md).

## Question

How should Shards expose its MCP tools to cloud agents (Claude, ChatGPT, IDEs, headless agents)
over the network, with OAuth that real clients accept, and with identity that is enforced rather
than self-asserted?

## Findings

### §1 Spec landscape (2026-10-15)

| Revision | Status | What matters |
|---|---|---|
| 2025-06-18 | Final | Streamable HTTP; MCP server is an OAuth resource server; PRM (RFC 9728) and RFC 8707 `resource` required; no token passthrough. Today's stdio server speaks it (`src/mcp/mod.rs`) |
| 2025-11-25 | Final | CIMD recommended (SEP-991), DCR demoted to MAY; step-up via `WWW-Authenticate` (SEP-835); 403 on bad `Origin` ([changelog](https://modelcontextprotocol.io/specification/2025-11-25/changelog)) |
| **2026-07-28** | Current | Stateless core: no `initialize`, no `Mcp-Session-Id`; `Mcp-Method`/`Mcp-Name` headers; `server/discover`; RFC 9207 `iss`; DCR deprecated in favour of CIMD ([changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog), [transports](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports), [blog](https://blog.modelcontextprotocol.io/posts/2026-07-28/)) |

Shards' tools are request/response over files and need no session state, so the stateless core
fits and any node can answer (with workspace pinning for writes).

### §2 Authorization profile the server must meet

- 401 with `WWW-Authenticate: Bearer resource_metadata=…, scope=…`; PRM at the path-suffixed and
  root well-known URLs; AS metadata with `code_challenge_methods_supported: ["S256"]` or clients
  refuse ([2025-11-25 authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization),
  [2026-07-28 authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)).
- Client registration order: pre-registered, CIMD, DCR, ask the user.
- Validate audience; 401 for invalid/expired; 403 `insufficient_scope` with `scope` for step-up;
  rotate refresh tokens for public clients; tokens only in the header.
- CIMD duties: SSRF-safe fetch, show client and redirect hostnames on consent, warn on
  loopback-only clients.

### §3 Rust stack

| Concern | Crate | Notes |
|---|---|---|
| MCP transport | `rmcp` 3.5.1 | Serves 2026-07-28 and legacy from one `StreamableHttpService`; Tower service; no built-in resource-server auth (use an axum layer, see [auth example](https://github.com/modelcontextprotocol/rust-sdk/blob/main/examples/servers/src/simple_auth_streamhttp.rs)); its `auth` feature is client-side ([OAUTH_SUPPORT.md](https://github.com/modelcontextprotocol/rust-sdk/blob/main/docs/OAUTH_SUPPORT.md), [3.0 migration](https://github.com/modelcontextprotocol/rust-sdk/discussions/969)) |
| HTTP | `axum` 0.8.9, `tower-http` 0.7.1 | |
| JWT | `jsonwebtoken` 11.1.0 | ES256 |
| AS core | `oauth-as` 1.0.0 | Claims PKCE, rotation with reuse detection, RFC 8414/9207/8707, CIMD validation, axum adapter; created 2026-08-08, 5 stars, single maintainer — **unverified, spike first** ([repo](https://github.com/MattJackson/oauth-as)) |
| Legacy AS | `oxide-auth` 0.6 | No CIMD, no RFC 8707 — rejected |
| Upstream login | `openidconnect` 4.0.1, `oauth2` 5.0.0 | Google/GitHub on hosted |
| Rate limits | `governor` 0.10.4 | |

rmcp settings: `with_legacy_session_mode(false)`, `with_json_response(true)`; do **not** set
`with_stateless_protocol_metadata_required(true)` (rejects legacy-handshake clients).

### §4 How real clients connect

**Claude** ([authentication](https://claude.com/docs/connectors/building/authentication),
[lazy auth](https://claude.com/docs/connectors/building/lazy-authentication),
[troubleshooting](https://claude.com/docs/connectors/building/troubleshooting),
[help center](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)):

- Connects from Anthropic's cloud even on Desktop; server and AS must be public.
- Auth types: `oauth_dcr`, `oauth_cimd`, `none`, `static_headers` (beta); no client-credentials.
- 401 must come from the HTTP handler before the MCP SDK; PRM `resource` must equal the typed URL;
  only `authorization_servers[0]` is used.
- CIMD is used only when AS metadata has `client_id_metadata_document_supported: true` **and**
  `none` in `token_endpoint_auth_methods_supported`.
- CIMD URLs: `https://claude.ai/oauth/mcp-oauth-client-metadata` (Desktop/hosted),
  `https://claude.ai/oauth/claude-code-client-metadata` (Claude Code)
  ([Keycloak docs](https://www.keycloak.org/securing-apps/mcp-authz-server)).
- Redirects: `https://claude.ai/api/mcp/auth_callback`; Claude Code loopback on any port for both
  `localhost` and `127.0.0.1`.
- Scopes from the 401 `scope`, else PRM; appends `offline_access` when listed. Token endpoint
  must take form encoding. Timeouts: 10 s discovery/token, 30 s refresh.

**ChatGPT** ([plugin auth](https://developers.openai.com/plugins/build/auth),
[Apps SDK](https://developers.openai.com/apps-sdk/llms-full.txt),
[custom MCP server](https://developers.openai.com/api/docs/guides/custom-mcp-server),
[developer mode](https://help.openai.com/en/articles/12584461)):

- Uses the stable `https://chatgpt.com/oauth/client.json` only if the AS advertises
  `authorization_response_iss_parameter_supported: true` and returns `iss`; otherwise a
  per-callback CIMD.
- Its CIMD uses the plural `token_endpoint_auth_methods_supported`; Keycloak rejects it, so the
  validator must accept it.
- Advertise `offline_access`. Tool-level auth through `securitySchemes` and
  `_meta["mcp/www_authenticate"]` on tool errors.
- Full write MCP only on Business and Enterprise/Edu plans.

**Others:** VS Code CIMD at `https://vscode.dev/oauth/client-metadata.json`. Cursor and Windsurf
CIMD support is **unverified**.

### §5 Embedded AS vs delegated IdP

| Option | CIMD | RFC 8707 aud | RFC 9207 iss | Custom act-as consent | Self-host |
|---|---|---|---|---|---|
| Embedded in `shards-server` | build | build | build | full control | best |
| WorkOS AuthKit | yes ([docs](https://workos.com/docs/authkit/mcp)) | yes | unverified | via Standalone Connect | hosted only |
| Auth0 | blogged ([post](https://auth0.com/blog/cimd-vs-dcr-mcp-registration/)) | partial | — | Actions | hosted |
| Stytch | yes ([post](https://stytch.com/blog/stytch-supports-cimd/)) | — | — | component | hosted |
| Keycloak 26.7/26.8 | experimental | 26.8 experimental | yes | SPI | heavy; rejects ChatGPT CIMD ([issue](https://github.com/keycloak/keycloak/issues/45106)) |
| Ory Hydra / Entra | no | no | — | — | unsuitable |

Matrix source also: [Zuplo IdP compatibility](https://zuplo.com/learn/mcp/compatibility/identity-providers).
Conclusion: embedded AS by default (self-host needs no account; consent must pick the agent
identity), external IdP as a config mode.

### §6 Identity model

- A CIMD `client_id` is shared by every user of that client, so it is not an agent identity. The
  agent principal is per grant: (human, workspace, client, grant). The token `sub` is the acting
  member; `act.sub` (RFC 8693 actor-claim shape) is the consenting human.
- Universal URL with workspace picked at consent (`ws` claim) works with Claude's directory
  listing; per-workspace URLs force one connector per workspace. Chosen: universal URL.
- PATs (`shd_pat_…`) for Claude Code `--header`, CI, the OpenAI Responses API `authorization`
  field and Claude `static_headers`.
- Required code changes: today `owner`/`claimer` are "trusted local input, not a verified caller
  identity" (`src/mcp/schema.rs`), `private` memory scope is "a courtesy filter, never
  authorisation" (`src/model/memory.rs`), and `Ctx::actor()` prefers the `owner` argument
  (`src/ctx.rs`). Remote calls must take the actor from the token.

### §7 Market context

Todoist (`ai.todoist.net/mcp`) and TickTick (`mcp.ticktick.com`) ship hosted MCP with OAuth; at
least eight agent-kanban startups do too. Their agents act as the user, with no separate agent
identity (market research §0, §3). Shards' per-grant agent identity and enforced private memory
are the differentiators; hosted MCP is part of Personal Sync pricing.

## Approaches tried

| Approach | Result | Notes |
|---|---|---|
| Rewrite tools with rmcp `#[tool]` macros | rejected | Keep the hand-written schema table; wrap `Server::call` |
| HTTP server inside the CLI crate | rejected | Would pull tokio into the CLI; lives in `shards-server` |
| Bind agent identity to `client_id` | rejected | All Claude.ai users share one CIMD URL |
| Client-credentials grant for headless agents | rejected | Claude does not support it; PATs instead |
| Delegated IdP only | rejected as default | Self-host must not need a vendor account; kept as a mode |
| Embedded AS + rmcp + axum auth layer + per-grant agent members | chosen | |

## Decision

`shards-server` serves `/mcp` with rmcp (stateless 2026-07-28 plus legacy 2025-06-18/11-25),
an axum layer for Origin, bearer, revocation cache, scope gate and rate limits, and an embedded
OAuth 2.1 AS (PRM, RFC 8414 + RFC 9207, CIMD first, DCR behind a flag, PKCE S256, RFC 8707
audience, refresh rotation) plus PATs. The actor comes from the token. Ruled out: macro rewrite,
client-credentials, identity by client id, mandatory third-party IdP.
