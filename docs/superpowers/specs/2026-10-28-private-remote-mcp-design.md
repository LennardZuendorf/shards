---
type: feature-design
feature: private-remote-mcp
parent: product.md
updated: 2026-10-30
---

# Private Remote MCP — Design

Status: implementation approved; deployment remains unverified and unapproved.
Parents: [product](../../../.spec/product.md), [architecture](../../../.spec/tech.md),
[sequence](../../../.spec/plan.md). Execution: [implementation plan](../plans/2026-10-28-private-remote-mcp-plan.md).

## Intent and decisions

Expose the existing local Shards vault to authorized MCP clients through a TypeScript server
hosted on Vercel. Both the client-facing endpoint and its connection to the vault machine use
Tailscale. The local Markdown files remain authoritative. The cloud server adds reach, not a
second task store.

Owner decisions in this conversation:

- Host the MCP/server process on Vercel; do not host a UI there.
- Include Tailscale support and expose the server only inside the tailnet.
- Permit clients running on enrolled devices or enrolled cloud execution environments.
- Use separate actors and per-space permissions.
- Preserve the local vault and Rust domain implementation; no cloud content replica.

Engineering choices in this draft: Node.js for the TypeScript process, a Vercel Daemon
container, userspace Tailscale, a stable Tailscale Service, local opaque credentials, and the
RPC contract below. Vercel networking is a candidate until the feasibility gate passes.

Owner sequencing amendment (2026-10-30): write and test the code in this repository first;
connect the repository to Vercel later. A build command compiles TypeScript; the Daemon
entrypoint runs Node. The real Vercel/Tailscale PASS remains a release gate, not a prerequisite
for local implementation. No public route or alternate hosting fallback is authorized.

## Scope

| Owns | Does not own / deferred |
|---|---|
| Private TypeScript HTTP MCP gateway, container lifecycle and bundled userspace Tailscale | UI hosting, browser sessions, remote desktop web app |
| Local Rust receiver, actor/grant enforcement and the additive shared dispatch seam | Domain rewrite, second parser/walk/search implementation |
| Local grant administration, private service configuration, restart and failure behavior | OAuth consent, public connectors, Funnel, public MCP routes |
| Agent tool parity under explicit remote restrictions | Sync, replicas, HLCs, billing, multiplayer accounts |
| Metadata-only asset operations already on agent MCP | Blob upload/download API, signed URLs, filesystem opening |

The existing CLI, stdio MCP, desktop IPC and localhost development server remain independent.
Existing local trust semantics remain unchanged when no remote principal is present.

## Requirements

### Requirement: Tailnet-only ingress (R1)

The server SHALL accept MCP traffic only through Tailscale. It MUST NOT publish a Vercel HTTP
route, rewrite, service binding or Funnel for MCP. Tailnet policy SHALL separately restrict
clients reaching the MCP service and the cloud service reaching the local receiver.

#### Scenario: Private reachability

- **Given** an allowed enrolled client and a client outside the tailnet.
- **When** each attempts the same MCP operation.
- **Then** only the enrolled client can establish the private connection; there is no working
  public MCP URL.

### Requirement: Verified Vercel feasibility (R2)

A disposable real Vercel Daemon test SHALL prove private ingress, cloud-to-local forwarding,
stable discovery after restart/redeploy, and the applicability of Vercel's platform restrictions.
An unproven or failed result MUST block selecting Vercel for delivery. No public-route or
alternate-provider fallback is authorized by this spec.

#### Scenario: Overlay unavailable on the target platform

- **Given** the daemon cannot advertise its private service, or platform support is unresolved.
- **When** the feasibility result is recorded.
- **Then** the result is FAIL or UNPROVEN, release remains blocked, and the owner receives the
  evidence needed to choose a revised deployment. Local implementation may proceed under the
  owner's code-first amendment; it does not establish platform support.

### Requirement: One authoritative vault (R3)

Each deployment SHALL bind to one explicit local vault identity and configuration. The cloud
server MUST NOT retain entity content in files, caches, queues, logs or a replicated database.
Calls SHALL read and mutate the local files through the existing Rust core.

#### Scenario: Local edit

- **Given** a note changed through the local CLI or editor.
- **When** an authorized remote read runs.
- **Then** it reads the current local state without a sync/import step.

### Requirement: Local grants and verified actors (R4)

The local receiver SHALL own the credential verifiers and grant metadata. Each grant SHALL
bind one vault, one declared actor, scopes, expiry and revocation. It MUST reject actor
spoofing, an unknown actor, and an invalid sponsor relationship. Cloud-supplied actor/scope
fields and Tailscale identity headers MUST NOT establish application authority.

#### Scenario: Concurrent identities

- **Given** two credentials bound to different actors.
- **When** their operations overlap and one supplies the other's acting identity.
- **Then** each legitimate call retains its own actor and the spoofed call is refused before
  mutation; process environment variables never change per call.

### Requirement: Per-space and object visibility (R5)

Every exposed operation SHALL enforce its space scopes and private-memory/scratch rules.
Visibility SHALL be applied before limits, ranking, counts and cross-space aggregation.
Mutation checks on mutable target fields SHALL occur inside the target's entity lock.

#### Scenario: Hidden records and a result limit

- **Given** hidden records precede readable records and the caller requests one result.
- **When** a list, search or context operation runs.
- **Then** the caller receives the first eligible record, and no hidden record, count, edge,
  candidate or private namespace leaks through the result or error.

### Requirement: One agent tool implementation (R6)

The remote surface SHALL reuse canonical Rust tool schemas and domain calls. It SHALL support
the existing 39 agent tools other than note adoption, subject to scopes. It MUST NOT expose
`host_*`, delete, forget, clear, restore, arbitrary paths or grant administration as agent tools.
Every shipped tool's remote policy SHALL have positive and negative tests.

#### Scenario: Tool parity and exclusion

- **Given** a fully authorized grant and equivalent vault fixtures.
- **When** agent tools are listed and called locally and remotely.
- **Then** names, arguments, annotations and core results match except documented redaction and
  visibility; note adoption and host tools are absent and cannot be called by guessing names.

### Requirement: Failures do not replay writes (R7)

Calls SHALL have bounded size, concurrency and deadlines. The system MUST distinguish a
known refusal from a mutation whose response was lost after possible execution. It MUST NOT
automatically retry mutations or queue them while the vault machine is unavailable.

#### Scenario: Response lost after a write

- **Given** an append or recurring finish has reached the local executor.
- **When** the connection is lost before the result reaches the client.
- **Then** the client receives an outcome-unknown error if a response is still possible, or
  observes a transport failure; neither server retries the mutation.

### Requirement: Safe lifecycle and confidentiality (R8)

Restart, upgrade overlap and credential rotation SHALL fail closed. Only non-content
operational metadata may be logged. Secrets SHALL be injected at runtime and never baked
into images or committed configuration. Absolute host paths SHALL be removed from generated
response metadata and diagnostics.

#### Scenario: Expiry during a queued operation

- **Given** an operation waiting for a worker and a grant that expires or is revoked.
- **When** the worker becomes available.
- **Then** the receiver rechecks current authority before execution and refuses the operation.
  Revocation does not undo a mutation already executing.

## Architecture and boundaries

```text
Tailnet MCP client
  -> stable private Tailscale Service
  -> Vercel Daemon: userspace tailscaled + Node/TypeScript MCP
  -> private HTTPS RPC over the same tailnet
  -> vault machine: Tailscale Serve -> loopback Rust shards-gateway
  -> existing synchronous Rust core -> local Markdown vault
```

Planned ownership:

| Path | Responsibility |
|---|---|
| `services/shards-remote/` | Independent pnpm package; MCP SDK adapter, private RPC client, runtime supervision and Docker image |
| `crates/shards-gateway/` | Local receiver binary/library; configuration, grant registry, local administration and bounded HTTP execution |
| `src/mcp/remote.rs` | Principal/scope context, actor rules, operation policy and structured output redaction |
| `src/mcp/tools.rs`, `src/ctx.rs` | Additive explicit-context dispatch; local callers retain their current path |
| Existing `src/domain/**`, `src/search/**` | Apply remote visibility/checks in their existing read/select and locked mutation paths |
| Root `vercel.json` | Daemon declaration only; no public MCP routing |

Do not use the current `shards-host` HTTP API as an unrestricted network backend. There is
no browser API, browser cookie/session implementation or watcher subscription in this slice.
The planned Rust `crates/shards-server` for sync/public OAuth remains a separate later feature.

### Vercel and built-in Tailscale

- The container includes Node, official Tailscale binaries and a supervisor. It needs no TUN
  device or privileged kernel networking. Our network code stays TypeScript; no custom VPN or
  cryptographic protocol is introduced.
- Node binds only to `127.0.0.1`. Tailscale Serve advertises it through a stable Service name
  and TailVIP. Use tagged ephemeral hosts and narrow enrollment credentials.
- Service advertisement in userspace mode on Vercel, private DNS/TLS, outbound relay
  connectivity and simultaneous old/new hosts MUST pass R2. The service is not advertised
  ready until enrollment and the local receiver's version/vault probe succeed.
- Ephemeral disk is not the source of a persistent node identity. No node private key is
  silently copied between running instances. If stable Service discovery cannot be proved,
  stop and revise this deployment choice.
- Vercel project root is the repository root; daemon root is `services/shards-remote`.
  Pin the container/runtime and Tailscale versions/digests in the feasibility evidence before
  implementation depends on them. Verify required SDK/library APIs from primary docs then.
- Shutdown withdraws readiness, stops accepting new work, drains bounded work, terminates Node
  and Tailscale children and exits within the configured platform grace period.

Vercel Daemons currently document no supported platform inbound HTTP/TCP or persistent local
storage. Userspace overlay ingress is technically plausible, not established platform support.
R2 requires a real deployment result and documented support clarification, not just a local
Docker success. An unreachable Mac returns unavailable; cloud uptime cannot make its vault
available while it is asleep.

### Local configuration and authority

The receiver requires explicit `vault_id`, canonical vault path, core config path, private
external origin and a grant-file path. An opaque operator-assigned `vault_id` is not a host
path. Pin the resolved enabled roots at startup; config/vault drift makes the receiver
unavailable until the operator deliberately restarts it against the intended configuration.

The protected local grant file contains:

- A schema version and the pinned vault identity.
- Local member records `id`, `kind: human|agent`, and optional human `sponsor`. Validate IDs
  against the core's configured identity rules; require declared records for remote actors.
- Client grants `grant_id`, `token_sha256`, `actor`, `scopes`, `expires_at`, `revoked_at`.
- Connector records `connector_id`, `token_sha256`, `expires_at`, `revoked_at` for the cloud
  daemon's separate machine credential.

Bearer tokens are random 256-bit secrets issued once to the operator, stored only as verifiers
locally and compared in constant time. Grant files are regular non-symlink files, mode 0600,
under an operator-owned directory. Updates take an exclusive administration lock before
reading and atomically replacing state. Concurrent local administrators must not lose updates.
Use a separate stable lock file for that registry. Worker admission takes a shared lock on
the same file, rereads and validates both credentials and expiry, and transitions queued work
to running before releasing it. That transition is the authority linearization point. A
completed revocation wins over work still queued; admitted work may finish. Atomic registry
replacement never replaces the lock file. Test the two orderings with barriers, not sleeps.

Local-only administration is `shards-gateway grant issue`, `grant revoke`, `connector issue`
and `connector revoke`, each requiring `--config`. Issue takes explicit identity/scopes or
connector identity and expiry, writes safely and displays the secret once. No administrative
HTTP endpoint or core `shards` flag is added. Execution is
`shards-gateway serve --config <gateway.toml>`; the receiver binds loopback only.

The cloud authenticates to the receiver with its connector credential and presents the
original Shards private client bearer for validation on every MCP operation, including
discovery. Both are required. The receiver derives the principal from its own registry and
ignores any purported actor/scope from the cloud. There is no cloud authorization cache.
Tagged Tailscale nodes need not emit user-login headers; those headers are not an auth source.

Both processes are parts of the same private Shards resource. They do not accept or forward
third-party OAuth tokens. Future OAuth needs a separately specified audience/exchange design.
The cloud sees transient bearer credentials and content while forwarding. This is not a
zero-knowledge cloud process; a compromised cloud process can misuse credentials it has seen.

### Scope and actor rules

Scopes are `notes|tasks|memories|scratch|assets:read|write`. Write implies read for that space
in this private profile. Local membership/sponsorship is explicit; no sync database is needed.

| Family / operation | Required authority |
|---|---|
| Per-space reads/lists | Matching read scope, plus object visibility |
| Per-space mutations, claims/releases, finish/cancel, task next | Matching write scope; claim/next use the same local core locks |
| Search, graph, project, context, activity and session start | Readable corpus only; filter before ranking/limits/aggregation |
| Private memories | Owner actor or the owner's declared human sponsor; apply on every read and write path |
| Scratch | Own namespace; a human may access explicitly sponsored agents; `all_agents` never bypasses this |
| Task create/update `owner` | Assignment to any declared valid member; it does not change the acting principal |
| Claim `claimer`, release/author acting `owner`, scratch write `agent` | Absent or exactly the authenticated actor; otherwise `identity_mismatch` |
| Memory reassignment / force release | Human-only where existing remote rules require it, with explicit sponsored-member validation |
| Asset attach | Asset write and target-space write; validate both objects before the first write and again inside affected locks |
| Health | Authenticated; exclude unreadable counts, configuration, paths and binary locations |

Task readiness and strict claim gates still use the full dependency graph. Visibility must
never turn a blocked task into a ready task. A caller may see a visible task's derived
`ready`/blocked state, but no hidden blocker IDs, titles, edges or counts. List and next apply
visibility and full-graph readiness before their result limit; next never selects a task
blocked by a hidden dependency. Claim refusal gives a generic not-ready explanation when
its blocker is hidden. Graph and unblock-cascade results omit hidden entities and references.
This derived readiness disclosure is the only exception to filtering aggregates to the
readable corpus; it preserves the core's coordination rules without disclosing blockers.

Restricted remote search/recall must operate on an authorized corpus. If the configured
external indexed engine cannot enforce that contract, use the existing built-in engine on
the authorized corpus for remote calls; do not change local search routing or add a second
walk/parser. References to hidden entities, candidates and aggregates must not reveal them.

The implementation owns a complete tool-to-policy matrix over the canonical table; no
wildcard tool dispatch is permitted. Full-authority grants receive 39 tools. Less privileged
grants receive the tools usable with their scopes; calling a guessed unauthorized tool still
fails closed. Exclude `shards_note_adopt` because v1 accepts entity IDs rather than foreign
file paths, independent of sync. Unsupported policy is a failure to complete this feature,
not permission to publish an unchecked tool.

### Shared Rust dispatch and private RPC v1

Add `CallCtx { cfg: Arc<Config>, principal: Option<Principal> }` and
`Server::call_in(&self, ctx: &CallCtx, name: &str, args: &Json) -> Result<Outcome>`.
The remote principal is immutable. Preserve desktop S1's planned convenience method as
`Server::call_with(&self, cfg: Config, name: &str, args: &Json) -> Result<Outcome>`; it creates
`CallCtx { cfg: Arc::new(cfg), principal: None }` and delegates to `call_in`. `Server::call`
loads its configuration and delegates through the same local wrapper. Both methods reach
one dispatcher; neither has a second tool implementation. Desktop may land its local
`call_with` seam independently, before this feature's platform gate. Private MCP reuses that
method and extends the same dispatcher with `call_in` and principal policy. If the local
wrapper is still absent, this feature adds both. Serialize changes to these files; neither
feature waits for the other to reach DONE. Public OAuth later reuses `call_in`.
The gateway supplies the verified context. There is no async runtime, HTTP SDK or
environment mutation in the core.

### Client-facing MCP transport

Use stateless Streamable HTTP with JSON responses. Each `POST /mcp` creates isolated SDK
request/transport state and obtains current authority through the receiver. It never issues
an `Mcp-Session-Id`, retains an authenticated session or provides resumable events. Reject
incoming session/resume headers; `GET /mcp` and `DELETE /mcp` return 405. No SSE, subscriptions
or server-initiated requests are part of v1. The feasibility test must prove this mode works
with the selected SDK and real client before implementation proceeds.

Authenticate every POST, including initialize and notifications, before SDK handling.
Repeated client request IDs across credentials or HTTP requests share no result, request
state or authority. Notifications have no response body; a cross-request cancellation
notification cannot cancel another POST. HTTP disconnect/deadline cancellation removes work
that has not started; executing synchronous work may finish. Reconnect starts a new request
only when the client explicitly asks; the adapter does not replay a prior call. Test foreign
session headers, reused request IDs across grants, expiry/revocation and reconnect behavior.

### Gateway HTTP contract

Gateway routes are private HTTPS behind Tailscale Serve:

| Route | Purpose |
|---|---|
| `POST /v1/probe` | Connector-authenticated compatibility/readiness: protocol version and pinned vault identity only |
| `POST /v1/describe` | Connector + client authentication; authorized canonical tool descriptions and instructions |
| `POST /v1/call` | Connector + client authentication; one authorized agent tool operation |

Probe responds with `{v,request_id,vault_id}`. Describe adds canonical `tools` and
`instructions` fields to that envelope. Neither returns grant secrets or membership data.

Headers: `Authorization: Bearer <client-token>` where required and
`x-shards-connector: <connector-token>`. Secrets never appear in URLs or response diagnostics.
Use fixed configured receiver origins, verified HTTPS and no redirects. No user-selected
backend URL, target path or principal is accepted.
Both listeners validate Host against their exact configured private origin. Machine clients
may omit Origin. A present Origin must match that listener's configured private origin;
reject null and all other values. No wildcard CORS or browser authentication is added.
Missing/invalid client credentials return HTTP 401 with a Bearer challenge; v1 does not
advertise an OAuth authorization server.

Request:

```json
{"v":1,"request_id":"uuid","vault_id":"opaque-id","deadline_ms":0,"tool":"shards_task_get","arguments":{"id":"t-example"}}
```

`deadline_ms` is the absolute UTC Unix-millisecond deadline; zero is invalid. The example
shows shape, not a valid request. Describe/probe omit `tool` and `arguments`. Reject unknown
envelope fields, wrong types, unsupported versions, vault mismatch and expired deadlines
before dispatch. The server permits at most 30 seconds from admission and rechecks expiry
and authority after queueing. Tool arguments use the canonical per-tool schema.

Successful call response:

```json
{"v":1,"request_id":"uuid","vault_id":"opaque-id","mcp_result":{"content":[{"type":"text","text":"..."}],"structuredContent":{}}}
```

Rust creates `mcp_result` with `mcp::errors::success` or `failure`; the TypeScript adapter
does not wrap `Host::call`'s `{value,list}` as an MCP result. Lists retain bare-array text
and `structuredContent.result`. Completed domain errors retain `isError: true` with
the canonical JSON text fields `kind`, `message`, `next_action`, structured details and
optional `retry_after_ms`. They are not replaced by transport JSON-RPC errors.

Control failures use
`{v,request_id,error:{kind,message,execution:"not_started"|"unknown"|"completed"}}`.
`request_id` is null only when refusal occurs before a valid correlation ID can be established;
successful responses and known valid requests retain their exact request ID.
Kinds: `unauthorized` (401), `forbidden` (403), `invalid_request` (400),
`version_mismatch` / `vault_mismatch` (409), `busy` (429), `unavailable` (503),
`deadline_exceeded` / `outcome_unknown` (504), `payload_too_large` /
`response_too_large` (413). These are gateway control errors, not new
core CLI exit codes. The cloud maps them to a failed MCP tool result when the protocol call
is still open, preserving the explicit execution state. Authentication fails at HTTP level
before MCP tool dispatch. Broken client connections may prevent any final response.

Canonical schemas come from `schema::tools_list()`, not a second TypeScript table. Descriptions
and results must preserve field types and numbers across Rust/TypeScript. The feasibility
unit must confirm raw-schema registration in the selected SDK and safe handling of integer
values, including the existing asset `bytes: u64`; silently rounding values is forbidden.
If the SDK cannot carry a required schema/value, record the limitation and revise the
contract before proceeding rather than inventing a second schema.

Generated metadata uses space-relative paths with its space name; no absolute receiver
paths. User-authored bodies and unknown frontmatter remain inert data and are not rewritten
by a generic path scrubber. Asset get/list return sidecar metadata/caption, not blob bytes.
There is no new binary endpoint or cloud download URL in v1.

### Resource and failure limits

- Bound each private request/response to 16 MiB, maximum 32 executing calls and 32 queued
  calls per receiver. Reject overload before execution. The core's existing file-size rules
  remain unchanged. An oversized request is `payload_too_large/not_started`. An oversized
  result is `response_too_large/completed`: execution finished, but the result could not be
  delivered. Completed does not assert domain success or rollback and must not trigger a retry.
- A request ID is correlation, not a durable deduplication key. Repeated mutations are not
  automatically coalesced, retried or claimed exactly-once.
- Cancellation removes work that has not started. A synchronous write that has started may
  complete; cancellation, deadlines, rollout and SIGTERM do not imply rollback.
- After a possible dispatch, response loss is unknown execution. After known rejection
  before dispatch, execution is not started. Existing domain partial-success semantics stay
  distinct from a transport whose outcome is unknown.
- Grant/connector expiry and revocation apply before new execution; reread current registry
  state at the locked admission point after queueing. Admitted writes may finish under that
  authority even if a later revocation completes before a core entity lock becomes available.
- Logs contain request/grant/connector IDs, operation, status and duration only. No tokens,
  tool arguments, results, bodies, titles or host paths. Vercel log collection does not make
  unredacted application logging acceptable.

## Acceptance and rollout

Implementation is approved. No deployment or real-network acceptance has occurred.
Before any live vault or cloud trial, identify the exact vault/config, enrolled clients,
tailnet grants, cloud project, deployment credentials and cleanup owner. Use synthetic data
for feasibility and integration. Do not auto-install Tailscale, change existing Serve routes
or enroll devices as a side effect of a read-only command.

Acceptance requires a real chosen HTTP MCP client, a second tailnet device/environment,
negative reachability outside the tailnet, all 39 tool policies, mixed-space/private fixtures,
actor races, expiry/revocation, overload, unknown writes, restart/rollout, log redaction and
CLI/stdio operation with every new process stopped. No browser or web UI acceptance is
required. Unit tests alone cannot prove the Vercel network topology.

## Sources and current evidence

- Live seams: `src/mcp/{tools,schema,errors}.rs`, `src/ctx.rs`,
  `src/domain/assets.rs`, `crates/shards-host/src/{lib,tools}.rs`.
- [Three-agent review](../../research/private-remote-review.md): security findings and runtime comparison.
- [Vercel Daemons](https://vercel.com/docs/daemons) and
  [limitations](https://vercel.com/docs/daemons/limits): continuous containers, ephemeral storage,
  production-only beta and unsupported platform inbound HTTP/TCP.
- [Tailscale userspace ingress](https://tailscale.com/docs/reference/faq/other-vpns),
  [Serve](https://tailscale.com/docs/reference/tailscale-cli/serve) and
  [Services](https://tailscale.com/docs/features/tailscale-services): networking building blocks,
  not proof that their combination is supported on Vercel.
- [TypeScript MCP HTTP guide at the reviewed revision](https://github.com/modelcontextprotocol/typescript-sdk/blob/951fe5603a7ec0b2dcb6a0b95d92cd86f93ad9e5/docs/serving/http.md):
  transport support does not supply application authorization.

Local implementation and cross-language verification now exist. Image execution, Vercel
deployment and real private-network feasibility remain unverified; see the
[feasibility receipt](../../research/private-remote-feasibility.md).
