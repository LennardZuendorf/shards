# Shards Remote MCP Server with OAuth: Technical Research

Date: 2026-10-15. Scope: a remote MCP server for Shards (the pivot of `mesh`). Topics: the spec revisions, Streamable HTTP, the OAuth authorization profile, how Claude and ChatGPT connect, the Rust stack, embedded vs delegated authorization server, per-agent identity, and the mapping of the 37 existing `mesh_*` tools.

Repo paths are relative to `~/.villain-worktrees/villain-mesh-improvements/mesh`.

---

## 0. Answer first

1. **Target two protocol eras at once.**
   - **2026-07-28** is the current revision. It is stateless: no `initialize`, no `Mcp-Session-Id`, and every request carries its metadata in `_meta`.
   - **2025-11-25** and **2025-06-18** are legacy revisions that still use the `initialize` handshake. Claude's connector docs still state the 2025-03-26, 2025-06-18 and 2025-11-25 authorization specs.
   - `rmcp` 3.5.1 serves both eras from one `StreamableHttpService`.
2. **Use `rmcp` 3.x + `axum` 0.8 for the transport.**
   - Implement `ServerHandler` by hand over the existing dispatch: `schema::find` plus `Tools::call` (`src/mcp/tools.rs:220-260`).
   - Do not rewrite the 37 tools with `#[tool]` macros.
   - Put the HTTP server in a separate binary (`shards-server`). The CLI then keeps its sync, no-async, millisecond start (`src/mcp/mod.rs:1-5`, `src/mcp/proto.rs:3-4`).
3. **Build the resource server first, then an embedded authorization server (AS).**
   - Resource server: validate JWTs (`iss`, `aud` = canonical MCP URL, `exp`, scopes). Through a config switch, this alone works with a delegated IdP such as WorkOS AuthKit.
   - Embedded AS: OAuth 2.1 auth code + PKCE S256, CIMD, refresh rotation, RFC 9207 `iss`.
   - Self-hosting must not need a third-party account.
   - DCR comes last. It is deprecated in 2026-07-28.
4. **Identity becomes authorization. This is the biggest change to the existing code.**
   - Today `owner`, `claimer` and `private` memory scope are self-asserted and documented as *not* verified:
     - `src/mcp/schema.rs:205-206`: "trusted local input, not a verified caller identity"
     - `src/model/memory.rs:11`: "`private` is a courtesy filter, never authorisation"
     - `src/ctx.rs:70-75`: `actor()` = explicit `owner`, else `[core].agent`
   - Remotely, the actor must come from the token subject. `owner` and `claimer` arguments must be rejected or checked. `private` must become real access control.
5. **A CIMD `client_id` is not an agent identity.**
   - Every Claude.ai user presents the same Anthropic-hosted client URL.
   - The agent principal must therefore be **per grant**: (human member, workspace, client_id, grant_id). The human names this principal on the consent screen ("act as agent `claude-lennard`").
   - The token `sub` is that agent member. `act` / on-behalf-of is the human.

---

## 1. MCP spec landscape (as of 2026-10-15)

| Revision | Status | What matters for Shards |
|---|---|---|
| 2025-06-18 | Final | Streamable HTTP with optional `Mcp-Session-Id`. MCP server = OAuth resource server. PRM (RFC 9728) is required. RFC 8707 `resource` is required. Token passthrough is forbidden. The repo speaks this revision today over stdio (`src/mcp/mod.rs:67`, `PROTOCOL_VERSION = "2025-06-18"`). |
| 2025-11-25 | Final | Adds OIDC Discovery as an alternative to RFC 8414 (PR #797), **CIMD as the recommended registration (SEP-991)** with DCR demoted to MAY, incremental scope consent via `WWW-Authenticate` / step-up (SEP-835), tool icons (SEP-973), tool-name guidance (SEP-986), URL-mode elicitation, experimental Tasks (SEP-1686), 403 for a bad `Origin`, input-validation errors as tool errors (SEP-1303), and JSON Schema 2020-12 as the default dialect. Source: https://modelcontextprotocol.io/specification/2025-11-25/changelog |
| **2026-07-28** | **Current** (released 2026-07-28, RC 2026-05-21) | **Stateless core**: `initialize` and `Mcp-Session-Id` are removed (SEP-2575, SEP-2567). Version, capabilities and clientInfo travel in `_meta` on every request. `server/discover` is mandatory. `subscriptions/listen` replaces the GET stream and `resources/subscribe`. **Multi Round-Trip Requests** replace server-initiated sampling, elicitation and roots (SEP-2322). `Mcp-Method` / `Mcp-Name` headers are required on POST (SEP-2243). `ttlMs` / `cacheScope` on list results (SEP-2549). SSE resumability (`Last-Event-ID`) is removed. Tasks move to the `io.modelcontextprotocol/tasks` extension (SEP-2663). Extensions framework, including MCP Apps (SEP-1865). Roots, Sampling and Logging are deprecated. **Auth hardening**: RFC 9207 `iss` (SEP-2468), `application_type` in DCR (SEP-837), credentials bound to issuer (SEP-2352), OIDC refresh guidance (SEP-2207), scope accumulation (SEP-2350), and **DCR formally deprecated in favour of CIMD** (PR #2858). Twelve-month minimum deprecation window (SEP-2596). Sources: https://modelcontextprotocol.io/specification/2026-07-28/changelog and https://blog.modelcontextprotocol.io/posts/2026-07-28/ |

No revision newer than 2026-07-28 exists as of today. The versioning page says "The current protocol version is 2026-07-28" (https://modelcontextprotocol.io/docs/2026-07-28/learn/versioning).

**What this means for Shards:**
- The stateless core fits Shards well. The tools are request/response over files and need no session state, so any instance behind a round-robin load balancer can answer.
- MRTR is the 2026 way to ask a human mid-call. Example: "confirm cancel of task t-123?" for `mesh_task_cancel`, the only `destructiveHint` tool (`src/mcp/mod.rs:64`).
- `subscriptions/listen` is the future push channel. An agent could watch "tasks assigned to me". This is not in the MVP.
- MCP Apps is the route to render a Shards task board inside Claude or ChatGPT. Plan it as a later phase.

---

## 2. Streamable HTTP transport

**Shape (all eras):**
- One endpoint, for example `https://shards.example.com/mcp`.
- Each JSON-RPC message is an HTTP POST.
- The reply is either one `application/json` body or a request-scoped `text/event-stream`.
- Servers MUST validate `Origin` and return 403 when it is invalid (2025-11-25 minor change #3). This protects against DNS rebinding.

**Legacy era (2025-06-18 / 2025-11-25):**
- `initialize` handshake.
- Optional `Mcp-Session-Id`.
- Optional GET stream for server-to-client messages.
- DELETE ends the session.
- `Last-Event-ID` resumption.

**2026-07-28:**
- No handshake and no sessions. No GET, DELETE or resumption.
- `Mcp-Method` and `Mcp-Name` headers are required, and the body is the source of truth (a mismatch returns `HeaderMismatchError`, -32020).
- A broken stream loses the request, and the client re-issues it.
- Source: https://modelcontextprotocol.io/specification/2026-07-28/basic/transports

**rmcp configuration** (from the rmcp README and the 3.0 migration guide, https://github.com/modelcontextprotocol/rust-sdk/discussions/969):
- Requests that negotiate 2026-07-28 are **always** served statelessly.
- `with_legacy_session_mode(false)` also serves legacy clients without sessions. Use it: Shards needs no per-session state.
- `with_json_response(true)` gives plain JSON replies for simple tools.
- **Do not** set `with_stateless_protocol_metadata_required(true)`. It rejects clients that are still on the legacy handshake. Claude is likely one of them, but this is unverified: its docs list only the *authorization* spec versions it follows (see §11).
- `StreamableHttpService<S, M>` requires `S: ServerHandler`. It is a Tower service, so mount it with `Router::nest_service("/mcp", svc)` and put an auth middleware layer in front.
- rmcp builds a fresh handler per request, so state must live outside the handler. This matches mesh's per-call `ctx()` (`src/mcp/tools.rs:207-218`).

**Bridging sync tools.** The existing tools are synchronous file I/O. Run `Tools::call` inside `tokio::task::spawn_blocking`.

**Per-call config load.** `ctx()` reloads the config from disk on every call (`src/mcp/tools.rs:209`). Remotely, replace it with a per-request `Ctx` built from:
- the resolved workspace vault root
- the authenticated actor (instead of `GlobalOpts.owner`)

---

## 3. The authorization profile (what the server must do)

Source: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization, plus the 2026-07-28 deltas above.

**Roles.**
- The MCP server is an OAuth 2.1 **resource server**.
- The AS can be co-hosted or separate.
- stdio transports SHOULD NOT use this flow; they take credentials from the environment. So `mesh mcp` over stdio stays as it is.

**Discovery chain.**
1. An unauthenticated or invalid request gets **401** with `WWW-Authenticate: Bearer resource_metadata="https://host/.well-known/oauth-protected-resource/mcp", scope="tasks:read ..."`.
2. Serve the PRM (RFC 9728) at the path-suffixed URL `/.well-known/oauth-protected-resource/mcp` **and** at the root `/.well-known/oauth-protected-resource`. Fields:
   - `resource`: the exact MCP URL
   - `authorization_servers`: issuer(s). Claude uses only the first.
   - `scopes_supported`
   - `bearer_methods_supported: ["header"]`
3. The AS serves RFC 8414 metadata at `/.well-known/oauth-authorization-server` (or OIDC Discovery at `/.well-known/openid-configuration`). It must include `code_challenge_methods_supported: ["S256"]`. If this is missing, clients MUST refuse to proceed.

**Client registration, in client priority order:**
1. Pre-registered client
2. **CIMD**: `client_id` is an HTTPS URL to a JSON doc. The AS fetches it, validates that `client_id` equals the URL exactly, and validates `redirect_uris`. Advertised by `client_id_metadata_document_supported: true`.
3. **DCR** (RFC 7591): advertised by `registration_endpoint`. It is MAY in 2025-11-25 and **deprecated** in 2026-07-28.
4. Ask the user.

**PKCE.** S256 is mandatory.

**Resource indicators (RFC 8707).** Clients MUST send `resource=<canonical MCP URL>` on both the authorize and the token request.
- Canonical form: lowercase scheme and host, no fragment, no trailing slash (preferred).
- The AS should put this value into `aud`.

**Token validation.** The server MUST:
- validate that the token was issued **for it** (audience)
- return 401 for an invalid or expired token
- return 403 with `error="insufficient_scope"` and a `scope="..."` list for missing scope, which triggers step-up
- **never pass the token through** to any upstream service

**Other rules.**
- Tokens go in the `Authorization` header on every request, never in the query string.
- All AS endpoints use HTTPS.
- Redirect URIs are HTTPS or loopback.
- Refresh tokens for public clients MUST rotate.

**CIMD security (the AS's duties):**
- Protect the metadata fetch against SSRF: HTTPS only, block private and link-local IPs, set a size cap and a timeout, cache by HTTP headers.
- Show the **hostname of the client_id and the redirect URI** on consent. Do not rely on the self-asserted `client_name`.
- Show an extra warning when the client has only loopback redirects, because any local process can claim one.

**2026-07-28 auth deltas:**
- Return `iss` in every authorization response (RFC 9207) and advertise `authorization_response_iss_parameter_supported: true`.
- Clients bind credentials to the issuer.
- DCR clients send `application_type: "native"` for loopback redirects.

---

## 4. How real clients connect (conformance checklist for Shards' AS)

### 4.1 Claude (claude.ai, Desktop, mobile, Cowork, Claude Code)

Sources: https://claude.com/docs/connectors/building/authentication, https://claude.com/docs/connectors/building/lazy-authentication, https://claude.com/docs/connectors/building/troubleshooting, https://support.claude.com/en/articles/11175166

- **Origin of requests.** Custom connectors connect **from Anthropic's cloud**, even from Desktop. The server must be publicly reachable from Anthropic's egress range, and so must the AS host, because discovery requests come from the same range. A localhost Shards server needs a tunnel.
- **Supported auth types.** `oauth_dcr`, `oauth_cimd`, `none` (by default), `static_headers` (beta), and `oauth_anthropic_creds` / `custom_connection` (by contacting Anthropic). There is **no `client_credentials` M2M grant**.
- **Connect dialog.** Options are "Sign in now", "Sign in when needed" (lazy auth) and "No sign-in". The OAuth client choices are "Use Claude's published identity (CIMD, recommended)", "Register automatically (DCR)" and "Use your own OAuth client".

| Requirement | Detail |
|---|---|
| 401 starts sign-in | A `WWW-Authenticate` header on a 200 is ignored. For lazy auth, the 401 must be produced **in the HTTP handler before the MCP SDK runs**. A tool result cannot produce it. |
| `resource` equals the URL as typed | The PRM `resource` must equal the URL the user enters, path included. |
| First AS only | Claude uses only `authorization_servers[0]`. |
| CIMD selection | CIMD is used only if AS metadata has **both** `client_id_metadata_document_supported: true` **and** `"none"` in `token_endpoint_auth_methods_supported`. Otherwise Claude falls back to DCR. |
| CIMD URLs seen in the wild | Claude Desktop: `https://claude.ai/oauth/mcp-oauth-client-metadata`. Claude Code: `https://claude.ai/oauth/claude-code-client-metadata` (Keycloak docs, https://www.keycloak.org/securing-apps/mcp-authz-server). |
| Redirects | Hosted surfaces: `https://claude.ai/api/mcp/auth_callback`. Claude Code: loopback `http://localhost:<any>/callback` **and** `http://127.0.0.1:<any>/callback`. Match both with the port ignored. |
| Scopes | Claude takes them from the 401 `scope`, else from PRM `scopes_supported`. It appends `offline_access` if the AS lists it, to obtain a refresh token. |
| Token endpoint | Must accept `application/x-www-form-urlencoded`. DCR uses JSON. |
| Refresh | Reactive on 401, and proactive up to 5 minutes before expiry. **Rotate** refresh tokens for public clients. A dead refresh token must return `invalid_grant`. |
| Latency limits | 10 s for discovery, registration and token. 30 s for refresh. |
| DCR volume | DCR registers a new client on **every fresh connection**. Prefer CIMD. |
| Plans | On Team and Enterprise, Owners add custom connectors and users connect individually. Individual plans add them under Customize → Connectors. The plan list in the help-center text was truncated, so verify it. |

### 4.2 ChatGPT (Apps / custom MCP plugins, Codex)

Sources: https://developers.openai.com/plugins/build/auth, https://developers.openai.com/apps-sdk/llms-full.txt, https://developers.openai.com/api/docs/guides/custom-mcp-server, https://help.openai.com/en/articles/12584461

- **Transports.** "SSE and streaming HTTP". Auth modes are OAuth, none, and mixed.
- **Client identity.**
  - CIMD is prioritized when advertised, with `none` or `private_key_jwt` at the token endpoint.
  - ChatGPT uses the **stable `https://chatgpt.com/oauth/client.json` only if the AS meets issuer identification**: `authorization_response_iss_parameter_supported: true` and `iss` returned on every response. Otherwise it uses a per-callback CIMD.
  - DCR is used if the plugin builder chooses it.
- **Redirect.** `https://chatgpt.com/connector/oauth/{callback_id}`, which is shown on the app management page. This only matters with DCR or a predefined client. CIMD carries it in the document.
- **CIMD quirk.** ChatGPT's CIMD document uses `token_endpoint_auth_methods_supported` (plural, from OIDC RP Metadata Choices) instead of `token_endpoint_auth_method`. Keycloak rejects it for that reason. **Shards' CIMD validator must accept the plural form** and pick `none` or `private_key_jwt`.
- **Refresh.** Advertise `offline_access`, or ChatGPT may lose access when the token expires.
- **Tool-level auth.** Per-tool `securitySchemes` (`noauth` / `oauth2` + scopes) and error results carrying `_meta["mcp/www_authenticate"]`. This is ChatGPT's version of lazy auth. It differs from Claude's 401-before-SDK pattern, so Shards needs **both**.
- **Plan gating.** Full MCP with writes is available only on Business and Enterprise/Edu. Pro gets read/fetch in developer mode. This limits "agents write tasks from ChatGPT" for individual users.
- **Responses API.** It passes a bearer in `authorization` and the app handles OAuth itself. Shards personal access tokens fit here.

### 4.3 Others

- **VS Code.** CIMD at `https://vscode.dev/oauth/client-metadata.json`, and it sends `resource` (Keycloak docs).
- **Claude Code.** Uses CIMD and loopback; see above. It can also take a static header, which is the PAT path for headless use.
- **Cursor and other IDEs.** CIMD support is **unverified** in this research. Keep DCR as a fallback flag, and keep PATs.

---

## 5. Rust stack

Versions are from `cargo search`, 2026-10-15.

| Concern | Crate | Version | Notes |
|---|---|---|---|
| MCP server and transport | `rmcp` (official) | **3.5.1** (2026-10-05) | Implements stable 2026-07-28 and stays compatible with 2025-11-25 and earlier. Conformance at 3.0.0: core server 40/40 scenarios. Features: `server`, `transport-streamable-http-server`, `schemars` (optional). 4,016 GitHub stars, pushed today. The 2026-07-28 launch blog listed Rust as beta, "beyond Tier 1"; it is stable now. MSRV 1.88; the repo pins 1.94 (`Cargo.toml:5`). The server side has **no built-in resource-server auth**: the examples use an axum middleware (`examples/servers/src/simple_auth_streamhttp.rs`, `complex_auth_streamhttp.rs`). Its `auth` feature is **client-side** (OAuthState, CIMD, DCR, step-up), which is useful for testing and for a future Shards CLI that talks to a remote server. |
| HTTP | `axum` | 0.8.9 | Plus `tower-http` 0.7.1 (CORS for the `.well-known` routes and the token endpoint, tracing, limits). |
| JWT validation and signing | `jsonwebtoken` | 11.1.0 | ES256/EdDSA. Cache the JWKS for the delegated-IdP mode. Alternative: `jwt-simple` 0.15. |
| Embedded AS core | `oauth-as` | 1.0.0 | MIT OR Apache-2.0. Has auth code + mandatory PKCE S256, refresh rotation with reuse detection, RFC 8414, RFC 9207 `iss`, RFC 8707 into `aud`, RFC 9728 types, `cimd` validation (the host does the fetch), DCR off by default, RFC 7662/7009, an axum adapter, and a `Storage` trait. **Risk:** created 2026-08-08, 5 stars, about 29k downloads, single maintainer. **Evaluate in a spike.** The fallback is a thin hand-rolled AS of about 1-1.5k LOC: authorize, token, metadata, CIMD fetch, consent. |
| Legacy AS lib | `oxide-auth` / `oxide-auth-axum` | 0.6 | OAuth 2.0-era design. No CIMD, no RFC 8707. Not recommended. |
| Upstream login (human SSO) | `openidconnect` 4.0.1, `oauth2` 5.0.0 | | "Sign in with Google/GitHub/Entra" on the AS login page. Also used by the Tauri app as a native public client. |
| Passkeys | `webauthn-rs` | (check the version; `cargo search` showed 0.6.1-dev) | Phase 2 human login. There is precedent: `pecheriere/mcp-oauth` is an axum OAuth layer with WebAuthn approval that targets Claude.ai. |
| Rate limiting | `governor` | 0.10.4 | Per-IP and per-client limits on `/authorize`, `/token`, and the CIMD fetch. |
| Password hash (if used) | `argon2` | | Only for the bootstrap or self-host owner. |

---

## 6. Embedded AS vs delegated IdP

| Option | CIMD | DCR | RFC 8707 → `aud` | RFC 9207 `iss` | Custom consent (pick agent identity) | Self-host fit | Notes |
|---|---|---|---|---|---|---|---|
| **Embedded AS in `shards-server`** | You build it | Optional | You build it | You build it | **Full control** | **Best**: no external account | One binary, one SQLite `auth.db`. You own security and SSRF hardening. |
| WorkOS AuthKit | Yes (since 2025-11-30, toggle in Connect → Configuration) | Yes | Yes (with a default resource indicator) | (check) | Through **Standalone Connect**: AuthKit redirects to your login URI, you call the completion API | Hosted only | Agent Registration / `auth.md` (Aug 2026) and ID-JAG (EMA/XAA) for enterprise. https://workos.com/docs/authkit/mcp, https://workos.com/blog/mcp-client-identity-dcr-cimd-auth-md |
| Auth0 | (blogged in favour; check the tenant feature) | Per tenant | Partial: `audience` wins over `resource` | | Actions | Hosted | https://auth0.com/blog/cimd-vs-dcr-mcp-registration/ ; Zuplo matrix https://zuplo.com/learn/mcp/compatibility/identity-providers |
| Clerk | **Beta** (2026-08-06, per workspace) | Yes | | | Limited | Hosted | CIMD clients tab with allowlist and blocklist. |
| Stytch Connected Apps | Yes (2025-10) | Yes | | | React consent component | Hosted | https://stytch.com/blog/stytch-supports-cimd/ |
| Keycloak 26.7 / 26.8 | Experimental (`--features=cimd`), preview in 26.8 | Yes | 26.7: no (audience-mapper workaround). 26.8: experimental | Yes | Themes and SPI | Self-host (heavy JVM) | **Rejects ChatGPT's CIMD.** https://www.keycloak.org/securing-apps/mcp-authz-server, https://aaif.io/blog/using-keycloak-as-an-mcp-authorization-server |
| Ory Hydra | No | Yes (off by default) | No | | Login and consent apps | Self-host | Empty `client_uri`/`logo_uri` breaks some clients (Zuplo). |
| Microsoft Entra | No | No | No (`scope={resource}/.default`) | | | | Unsuitable as a direct MCP AS. |

**Decision: embedded AS as the default; delegated IdP as a supported mode.**

- **Shards is self-hostable and local-first.** A self-host user must not need a WorkOS or Auth0 account to connect Claude to their vault.
- **The consent step is product-critical.** It is where a human picks or creates the **agent member** a connection acts as, and picks the workspace. Hosted IdPs make that awkward (WorkOS needs Standalone Connect), and Keycloak and Hydra need custom consent apps.
- **Shards already needs accounts.** The Tauri app and sync need users, sessions and devices, so the AS reuses that member table.
- **Delegated mode stays available.** `[auth] mode = "external"` with `issuer`, `jwks_uri`, `audience` and a claim→member mapping. Enterprise teams that require their own IdP plug in here. A middle path is upstream OIDC on the embedded AS login page (federated login, Shards still issues tokens). That gives SSO without giving up the consent step.

---

## 7. Identity model: humans and agents as members

### 7.1 Principals

```
Member { id, workspace_id, kind: human|agent, handle, display_name,
         sponsor_member_id? (agent → human), roles, created_at, disabled_at }
Grant  { id, member_id (the agent or human acted as), sponsor_member_id (human who consented),
         client_id (CIMD URL | DCR id | "pat"), client_host, redirect_host,
         scopes[], workspace_id, created_at, last_used_at, revoked_at }
RefreshToken { hash, grant_id, family_id, expires_at, used_at }   // rotate, detect reuse
```

- **One grant per connection.** Consent screen: "**Claude** (claude.ai → redirect claude.ai) wants access to workspace **Acme**. Act as: [ new agent `claude-lennard` ▾ | existing agent … | myself ]. Permissions: ☑ Read tasks ☑ Write tasks ☑ Write memories …"
- **Why per grant.** Two users who both connect "Claude" share one CIMD URL. A single user may also want "Claude-research" and "Claude-coding" as separate agent members with separate memories. Binding to `client_id` alone would merge them.
- **Access token claims (JWT, ES256, 15-60 min):**

  ```json
  { "iss": "https://shards.example.com", "aud": "https://shards.example.com/mcp",
    "sub": "mem_agent_7f…", "act": { "sub": "mem_human_lennard" },
    "client_id": "https://claude.ai/oauth/mcp-oauth-client-metadata",
    "ws": "ws_acme", "scope": "tasks:read tasks:write memories:read memories:write",
    "grant_id": "gr_…", "exp": …, "iat": …, "jti": "…" }
  ```

  `act` follows RFC 8693's actor-claim shape. On every request, check that the grant is not revoked: keep a small revocation cache keyed by `grant_id`. Without it, revoking access in the Tauri "Connected agents" page would not take effect until the token expires.
- **Audiences are separate.** MCP tokens have `aud=…/mcp`. The Tauri app and sync API have `aud=…/api`. An MCP token cannot call the sync API, and the reverse also fails.

### 7.2 Workspace binding: decision

- **Option A: one universal URL `https://host/mcp`, workspace chosen at consent, carried as the `ws` claim.**
  - Works with Claude's "Universal URL" directory listing and with `oauth_anthropic_creds` (which does not support URL patterns).
  - One connector for every workspace a user belongs to.
- **Option B: per-workspace URL `https://host/w/<slug>/mcp`, giving a distinct `aud` per workspace.**
  - Stronger isolation.
  - Claude requires `resource` to equal the typed URL exactly, so each workspace is a separate connector. A directory listing then needs a URL pattern.
- **Pick A for the MVP, with a grant bound to exactly one workspace.**
  - Optionally add B-style path aliases later for users who want two Claude connectors to two workspaces at once.
  - With A, aud validation proves "token for this server". The `ws` claim, checked against the grant, proves "token for this workspace".

### 7.3 Non-interactive agents

- **Personal access tokens (PAT)**, `shd_pat_…`. Created in the app or CLI for an agent member, with scopes and an expiry, and stored hashed.
- Uses: Claude Code (`--header "Authorization: Bearer …"`), CI agents, the OpenAI Responses API `authorization` field, and Claude `static_headers`.
- The resource server accepts a JWT or a PAT and resolves both to the same `Principal { member, sponsor, ws, scopes, grant_id }`.
- Do not implement `client_credentials` for MCP: Claude does not support it.
- Later: EMA/ID-JAG (rmcp `auth-enterprise-managed`, WorkOS XAA) for enterprise SSO without a consent screen.

---

## 8. Mapping the 37 `mesh_*` tools to remote Shards

Tool list: `src/mcp/mod.rs:23-61`. Annotations: `src/mcp/schema.rs:229-660`.

### 8.1 Naming

- Rename to `shards_*`, or drop the prefix. MCP clients already namespace tools by server, and SEP-986 gives tool-name guidance.
- Keep a `mesh_*` alias table on stdio for one release, so existing plugin bundles keep working.
- Return `tools/list` in a deterministic order. This is a SHOULD in 2026-07-28, and it is already true here: the order is `TOOL_NAMES` order.

### 8.2 Scope map

| Scope | Tools |
|---|---|
| `notes:read` | `note_get`, `note_list` |
| `notes:write` | `note_new`, `note_append`, `note_update` |
| `tasks:read` | `task_get`, `task_list` |
| `tasks:write` | `task_new`, `task_append`, `task_update`, `task_claim`, `task_release`, `task_finish`, `task_cancel` (destructive: also ask via MRTR or elicitation), `task_block`, `task_unblock`, `task_next` (it **claims**, so it is a write; `Ann::Write` at `schema.rs:660`) |
| `memories:read` | `memory_get`, `memory_list`, `memory_recall` |
| `memories:write` | `memory_new`, `memory_append`, `memory_update` |
| `scratch:read` / `scratch:write` | `scratch_get`, `scratch_list` / `scratch_set`, `scratch_append` |
| `assets:read` / `assets:write` | `asset_get`, `asset_list` / `asset_attach` (also needs write on the **target** space, because it edits a note, task or memory body) |
| any read scope; results **filtered to readable spaces** | `search`, `recent_activity`, `build_context`, `graph`, `project`, `session_start` |
| authenticated, no scope (redacted) | `health` |
| `offline_access` | refresh tokens |

**Why filter rather than require.** When the 401 has no `scope`, clients request **all** of `scopes_supported`. Cross-space tools should therefore filter their output, not demand every read scope. A grant without `memories:read` gets search hits with memories removed.

**Two ways to hide tools.**
- Option: hide tools whose scope is missing from `tools/list`, per token. Under 2026-07-28 caching, set `cacheScope: "private"`.
- Simpler MVP: list every tool, and answer a missing scope with a 403 `insufficient_scope` challenge so step-up happens.
  - That is an **HTTP 403**, so it must be produced in the HTTP layer before the SDK runs. The middleware must parse `Mcp-Name` (2026) or the JSON-RPC body (legacy) to know which tool is called.
  - ChatGPT also needs `_meta["mcp/www_authenticate"]` on a tool error result, plus per-tool `securitySchemes`.

### 8.3 Identity arguments: required semantic changes

| Today (stdio, trusted) | Remote (token-bound) |
|---|---|
| `actor()` = `owner` argument, else `[core].agent` (`src/ctx.rs:70-75`) | The actor is **always** `principal.member.handle`. `GlobalOpts.owner` is set from the token, never from arguments. |
| `owner` on `*_new` / `*_append` ("a value check, not a verified identity", `schema.rs:206`) | Must be absent or equal to the actor. Any other value returns a tool error. |
| `claimer` on `task_claim` (`tools.rs:505-511`), `owner` on `task_release` (`tools.rs:523-527`) | Same rule: absent or equal to the actor. Breaking another member's claim stays human-only (`tools.rs:528`). Gate it behind a `tasks:admin` role later. |
| `owner` on `task_update` reassigns accountability (`tools.rs:487`) | Legitimate assignment. Allowed with `tasks:write` if the target is a workspace member. This replaces the `[tasks].collections` roster. |
| `owner` filters on list and search ("not a verified caller identity") | Still fine as **filters**. `mine` = the actor. |
| `session_start.owner` "show this agent's warm start" (`schema.rs:352`) | Restricted to the actor, or to agents the human sponsors. |
| Memory `scope: private` is a courtesy filter (`model/memory.rs:11, 86-89`) | **Enforced**: readable only by the owner member and its sponsoring human. Search, recall, graph and build_context must also apply it. |
| `asset_get` returns a filesystem `path` (`tools.rs:865-873`) | Return a vault-relative path plus a signed, short-lived download URL. Never a host path. There is no remote asset upload tool today (ingest is CLI-only), so add an upload endpoint or a tool that takes base64 with a size cap. |
| `health` returns host details | Redact host paths and binaries for remote callers. |

### 8.4 Tenancy and storage

- Remote tools run against **a workspace vault root** resolved from `ws`. The Markdown folder stays the source of truth.
- Auth state (members, grants, refresh tokens, PATs, CIMD cache, audit log) is **not content**. Keep it in SQLite beside the vault, outside the Markdown tree.
- This bends the "no DB" principle (`README.md:6`) **only for the server**. Say so in the spec.
- Every write records the actor and the `client_id` in frontmatter or the activity log. The Shards activity feed can then show "claude-lennard via Claude.ai claimed t-123". Existing `recent_activity` rows already carry identity (`schema.rs:309`).

---

## 9. Recommended architecture

```
                         Internet (Anthropic / OpenAI egress, IDEs, Tauri app)
                                            │ HTTPS
┌───────────────────────────────── shards-server (axum, tokio) ─────────────────────────────────┐
│  /.well-known/oauth-protected-resource[/mcp]   (RFC 9728, resource=https://host/mcp)          │
│  /.well-known/oauth-authorization-server        (RFC 8414: S256, CIMD=true, none, iss=true,    │
│                                                  offline_access, registration_endpoint? [flag])│
│  /authorize  → login (session cookie; password|passkey|upstream OIDC) → consent:              │
│                 workspace + "act as" agent member + scopes; shows client & redirect hosts     │
│  /token (form-urlencoded; code+PKCE, refresh w/ rotation+reuse detection; aud from resource)  │
│  /revoke  /jwks.json  /register (DCR, off by default)                                         │
│  CIMD fetcher: https-only, SSRF guard, 5 KB cap, 3 s timeout, HTTP-cache; accepts plural      │
│                token_endpoint_auth_methods_supported (ChatGPT)                               │
│                                                                                              │
│  /mcp  ── Origin check (403) ── BearerAuth layer (JWT|PAT → Principal; 401/403 challenges;   │
│            reads Mcp-Name or JSON-RPC body for per-tool scope + lazy auth) ──┐              │
│            rmcp StreamableHttpService (legacy_session_mode=false, json_response=true)        │
│              └ ShardsHandler: ServerHandler → tools/list from schema.rs,                    │
│                 tools/call → spawn_blocking(Tools::call(name, args, Ctx{vault(ws), actor})) │
│  /api/...  sync + app API (aud=https://host/api)                                             │
│  SQLite auth.db (members, grants, tokens, PATs, audit)   Vaults: /data/<ws>/ (Markdown)      │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
   Local, unchanged: `shards mcp` stdio (env/config identity, no OAuth, per spec)
```

**Crate layout.** Split the current single crate into a workspace:
- `shards-core`: today's `src/` minus the CLI.
- `shards-cli`: sync. Today's `mesh` and `mesh-mcp` binaries.
- `shards-server`: tokio, axum, rmcp. It depends on `shards-core`, so the CLI never links tokio.
- `src-tauri`: links `shards-core` directly for local vaults, and talks to `shards-server` `/api` for sync.

---

## 10. Minimal-viable path

Ordered by dependency. Each phase can ship on its own.

**Phase R0: refactor seams (no network).**
- Make `Tools::call` take an explicit `Ctx { vault_root, actor: Option<Principal> }` instead of loading config (`tools.rs:207-218`).
- Add an "identity enforced" mode that applies the §8.3 rules. Unit-test it through stdio with a fake principal.
- Fix `asset_get` path exposure behind a flag.
- Exit check: the existing tests are green, and new tests show that `owner` ≠ actor is rejected in enforced mode.

**Phase R1: remote MCP, resource server only.**
- `shards-server serve --vault … --public-url https://host`.
- rmcp `StreamableHttpService` at `/mcp`.
- PRM endpoint. Bearer layer that validates **external** JWTs via JWKS (`[auth] mode="external"`), plus PATs from SQLite.
- Origin check and rate limits.
- Test with WorkOS AuthKit (CIMD on) and a PAT through Claude Code's `--header`.
- Exit check: Claude.ai custom connector → AuthKit login → tools work. The MCP Inspector passes. The rmcp conformance client passes.

**Phase R2: embedded AS (default mode).**
- `/authorize`, `/token`, `/revoke`, `/jwks.json`, RFC 8414 metadata, CIMD fetch and validation, PKCE S256, `iss` in responses, refresh rotation, and `offline_access`.
- Login: owner bootstrap via `shards-server admin create-user` (argon2 password) or a one-time setup link printed on first start.
- Consent: workspace + act-as agent + scopes.
- Spike `oauth-as` 1.0 for the protocol core during the first 2 days. If it fails the checklist in §4, hand-roll it.
- Exit check: Claude.ai (CIMD), Claude Code (CIMD + loopback on any port), ChatGPT developer mode (stable `chatgpt.com/oauth/client.json` via `iss`), and VS Code all connect, refresh, and get 403 → step-up on a missing scope.

**Phase R3: product surface.**
- Tauri "Connected agents" page: list grants, last used, scopes, revoke.
- Agent members visible in assignment pickers. The activity feed shows the actor and the client.
- Lazy auth: read-only public workspaces without sign-in, with the 401 gate in the HTTP layer and ChatGPT `securitySchemes`.

**Phase R4: hardening and breadth.**
- DCR (`application_type` aware) behind a flag, for clients without CIMD.
- Upstream OIDC login (Google/GitHub) and passkeys.
- MRTR confirmation for `task_cancel`. This reaches only 2026-07-28 clients. Server-initiated elicitation is unlikely to reach legacy clients in stateless mode, so they rely on `destructiveHint`.
- `subscriptions/listen` for "my tasks changed".
- MCP Apps task-board widget.
- EMA/ID-JAG for enterprise.
- Audit export.

**MVP cut for "agents on Claude.ai write to a hosted Shards workspace": R0 + R1 + R2.** Estimate: about 3-4 engineer-weeks for R0-R2 with the hand-rolled AS, or about 2-3 weeks if `oauth-as` holds up.

---

## 11. Risks and open questions

- **Protocol-era drift.** Claude documents the 2025-era auth specs, and its transport may still send `initialize`. ChatGPT also lists "SSE". Keep the legacy path on, and do not enforce 2026-only metadata. rmcp deliberately does not ship the legacy HTTP+SSE (2024-11-05) transport; ChatGPT's Streamable HTTP support covers this.
- **Exposure.** Anthropic-side connections require a public server. Self-hosters need a domain and TLS, or a tunnel. Document Cloudflare Tunnel.
- **CIMD SSRF and phishing.** The AS fetches arbitrary URLs. Apply the controls in §3, and add an optional allowlist (claude.ai, chatgpt.com, vscode.dev) for locked-down servers.
- **Prompt injection across members.** An agent with `tasks:write` can read task bodies written by other members. Treat tool output as untrusted in clients. Keep `destructiveHint` accurate and add MRTR confirmation.
- **Concurrency on Markdown.** Many remote agents now write one vault concurrently. The existing atomic claim (test-and-set, `schema.rs:420`) and the `lstat` / exclusive-temp-file rules (global lessons) must hold under multi-process and multi-instance servers. Pin a vault to one server instance, or add file locks.
- **Unverified items.**
  - Cursor's and Windsurf's CIMD support.
  - Whether WorkOS returns RFC 9207 `iss`.
  - Whether Auth0 CIMD is GA.
  - Whether Claude's transport already negotiates 2026-07-28.
  - Verify each in R1 or R2 testing.

---

## 12. Sources

- MCP authorization 2025-11-25: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- MCP changelog 2025-11-25: https://modelcontextprotocol.io/specification/2025-11-25/changelog
- MCP changelog 2026-07-28: https://modelcontextprotocol.io/specification/2026-07-28/changelog
- MCP transports 2026-07-28: https://modelcontextprotocol.io/specification/2026-07-28/basic/transports
- 2026-07-28 release blog: https://blog.modelcontextprotocol.io/posts/2026-07-28/ ; RC blog: https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/
- Spec releases: https://github.com/modelcontextprotocol/modelcontextprotocol/releases
- rmcp repo and README: https://github.com/modelcontextprotocol/rust-sdk ; changelog: https://docs.rs/crate/rmcp/latest/source/CHANGELOG.md ; 3.0 migration: https://github.com/modelcontextprotocol/rust-sdk/discussions/969 ; OAuth doc: https://github.com/modelcontextprotocol/rust-sdk/blob/main/docs/OAUTH_SUPPORT.md ; auth examples: https://github.com/modelcontextprotocol/rust-sdk/blob/main/examples/servers/src/simple_auth_streamhttp.rs
- Claude connector auth: https://claude.com/docs/connectors/building/authentication ; lazy auth: https://claude.com/docs/connectors/building/lazy-authentication ; troubleshooting: https://claude.com/docs/connectors/building/troubleshooting ; build overview: https://claude.com/docs/connectors/building ; custom connectors: https://claude.com/docs/connectors/custom/remote-mcp ; help center: https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp ; Desktop managed MCP sign-in: https://claude.com/docs/third-party/claude-desktop/mcp-sign-in
- OpenAI plugin auth: https://developers.openai.com/plugins/build/auth ; Apps SDK full text: https://developers.openai.com/apps-sdk/llms-full.txt ; custom MCP server: https://developers.openai.com/api/docs/guides/custom-mcp-server ; developer mode: https://help.openai.com/en/articles/12584461 ; Responses API MCP: https://developers.openai.com/api/docs/guides/tools-connectors-mcp
- WorkOS AuthKit MCP: https://workos.com/docs/authkit/mcp ; DCR vs CIMD vs auth.md: https://workos.com/blog/mcp-client-identity-dcr-cimd-auth-md ; CIMD explainer: https://workos.com/blog/client-id-metadata-documents-cimd-oauth-client-registration-mcp
- Keycloak MCP: https://www.keycloak.org/securing-apps/mcp-authz-server ; AAIF Keycloak post: https://aaif.io/blog/using-keycloak-as-an-mcp-authorization-server ; Keycloak CIMD issue: https://github.com/keycloak/keycloak/issues/45106
- IdP matrix: https://zuplo.com/learn/mcp/compatibility/identity-providers
- Auth0 CIMD: https://auth0.com/blog/cimd-vs-dcr-mcp-registration/ ; Stytch CIMD: https://stytch.com/blog/stytch-supports-cimd/ ; Stytch MCP flow: https://stytch.com/docs/connected-apps/guides/mcp-auth-overview
- oauth-as: https://github.com/MattJackson/oauth-as , https://docs.rs/oauth-as ; oxide-auth-axum: https://crates.io/crates/oxide-auth-axum ; mcp-oauth (axum + WebAuthn): https://github.com/pecheriere/mcp-oauth
- Anthropic MCP server-dev skill auth notes: https://github.com/anthropics/claude-plugins-official/blob/main/plugins/mcp-server-dev/skills/build-mcp-server/references/auth.md
- Repo: `src/mcp/mod.rs:1-5,23-67`, `src/mcp/proto.rs:1-4`, `src/mcp/schema.rs:205-206,229-660`, `src/mcp/tools.rs:207-260,487-528,865-913`, `src/ctx.rs:70-75`, `src/model/memory.rs:11,86-89`, `src/config.rs:73`, `config.example.toml:34-39`, `Cargo.toml:5`, `README.md:6`
