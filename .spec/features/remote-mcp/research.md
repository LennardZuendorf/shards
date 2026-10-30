---
type: feature-research
feature: remote-mcp
parent: product.md
updated: 2026-10-30
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

## Private Tailscale first — proposed first delivery (2026-10-28)

**Historical proposal, superseded:** the following scope and review outcome describe an
earlier draft. The accepted [private MCP design](../../../docs/superpowers/specs/2026-10-28-private-remote-mcp-design.md)
now selects the TypeScript cloud adapter, local Rust authority and actor/space grants, with
local implementation complete. Its [receipt](../../../docs/research/private-remote-feasibility.md)
keeps real Vercel/Tailscale acceptance open. The historical UI scope below is not v1 scope.

**Owner direction:** start with private VPN access through the owner's existing Tailscale
installation. The first version may support only clients that can reach the tailnet. This
includes an owner-managed cloud execution environment enrolled in Tailscale. Direct access
from ordinary hosted MCP connectors remains outside this first delivery.

**Status:** reviewed proposal requiring revision; not implemented. The runtime and authorization
profile remain open after the [three-agent review](../../../docs/research/private-remote-review.md).
The hosted replica and OAuth design
above remains a later profile. This proposal does not mark the existing feature or its sync
dependency complete. Product, architecture and root sequence changes follow approval of this
scope, before implementation.

### Proposed scope

| Area | First delivery |
|---|---|
| Data | One explicitly configured local vault. Calls use the existing Rust core and its file locks; no cloud content replica, sync engine or new claim arbiter. |
| Process | Optional local daemon; TypeScript/Node plus a private Rust execution bridge and a direct Rust daemon are under review. CLI, stdio MCP and desktop operation remain independent of this process and the network. |
| Web | Serve the built React app, browser API and live change events from one origin. Keep the current loopback development host separate. |
| MCP | A real Streamable HTTP endpoint over the existing agent schema and dispatcher, with the remote tool exclusions already defined in [tech.md](tech.md). The browser API is not an MCP transport. |
| Network | Tailscale Serve forwards one private HTTPS hostname to the daemon on loopback. Tailnet policy restricts the service to approved devices or users. No Funnel or public route in this delivery. |
| Authentication | Owner-issued credentials bound to one vault, acting member and per-space scopes. Browser login exchanges a human credential for a secure session; MCP uses bearer credentials. OAuth consent and public client discovery are deferred. |
| Authorization | Explicit per-call context; reuse the remote actor, private-memory, scratch and scope rules in [tech.md](tech.md). Never change process environment variables per request. MCP cannot dispatch `host_*`; web calls use an explicit human-action allowlist. |
| Trust | Tailscale provides private connectivity. The application still validates credentials; loopback or a client-supplied Tailscale identity header alone does not authorize a call. |
| Availability | The vault machine must be awake and connected. No queued offline writes. After a lost response, report an uncertain mutation outcome instead of blindly retrying it. |
| UI limits | Native file-opening, vault switching and general local filesystem actions are unavailable remotely. Human hard-delete actions remain unavailable until their OS Trash and undo contract is implemented. |

The authentication and authorization rows are proposed defaults, not additional owner decisions.
The owner has selected the network and reachable-client scope. This proposal has not selected
the live vault or authorized deployment.

### Proposed build order and evidence

1. **Principal-aware shared dispatch.** Add the existing planned context seam to the core and
   host. Test two concurrent actors, spoofed actor arguments, unreadable spaces, private-memory
   and scratch isolation, while preserving local CLI and stdio behavior.
2. **Private web daemon.** Add the server package and any private Rust bridge selected by the
   runtime comparison, with explicit vault/config selection, production
   static assets, credential/session validation, exact Host/Origin checks and filtered events.
   Test missing/invalid credentials, cookie CSRF, traversal and forbidden UI/native actions.
3. **HTTP MCP adapter.** Reuse schemas and domain calls through the authenticated context.
   Test current/legacy transport compatibility, tool parity, scope refusal and `host_*` refusal
   with a real HTTP MCP client; do not substitute tests of the browser API.
4. **Private deployment runbook.** Document foreground and macOS supervised operation, scoped
   Tailscale Serve setup and removal, credential rotation, and offline behavior. Verify with a
   throwaway vault locally, then from a second tailnet client. An enrolled execution environment
   can be that client. Run the affected Rust/frontend gates before requesting live deployment.

**First deployment inputs:** the exact vault/config path, selected human and agent identities,
and the tailnet users/devices allowed to reach the endpoint. Confirm these before exposing live
data. Verify that existing Serve routes are preserved rather than resetting all routes.

**Sources checked:** [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve)
documents private HTTPS, access-control policy and identity-header replacement;
[Serve CLI](https://tailscale.com/docs/reference/tailscale-cli/serve) documents background
proxying. Serve forwards to a service; it does not itself implement Shards authentication or
MCP. Existing local boundaries are `crates/shards-host/src/{lib.rs,bin/shards-host.rs}` and
`apps/desktop/src/lib/transport.ts`.

### Three-agent review outcome (2026-10-28)

The [full review](../../../docs/research/private-remote-review.md) found that the draft imports
sync-owned membership/sponsorship data and leaves sessions, event isolation, asset delivery and
conflicting edits underspecified. The prior builder check did not establish security readiness.
Runtime is open: the preferred candidate is TypeScript/Node for network transport with one
authoritative Rust execution/policy bridge; direct Rust remains the simpler process baseline.
Compare the two with a bounded throwaway spike before fixing that decision. No spike was built.

The proposed per-space/private-principal model above has not been accepted by the owner. A
single-owner full-vault profile could reduce v1 scope only with explicit approval and no claims
of per-agent privacy. Public OAuth, custom relays and record sync stay outside the first slice.
