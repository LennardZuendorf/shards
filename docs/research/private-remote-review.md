# Private remote access: three-agent review

Date: 2026-10-28. Status: research and recommendations, not an approved implementation design.

The owner requested three independent subagent reviews: the Shards proposal, Paseo's actual
implementation and development history, and TypeScript versus Rust for the remote runtime.
The coordinator checked the principal source claims and reconciled the reports below.

The reviewed proposal is [remote-mcp research](../../.spec/features/remote-mcp/research.md#private-tailscale-first--proposed-first-delivery-2026-10-28).
The owner has selected private Tailscale access first. Clients may include a cloud execution
environment enrolled in the tailnet. The local Markdown vault remains authoritative. Runtime,
the first authorization profile, detailed contracts and deployment remain unapproved.

## Recommendation

Revise the proposal before implementation. TypeScript on Node.js is a reasonable preferred
candidate for HTTP, browser sessions and MCP transport, with a small private Rust execution
bridge retaining the core, host operations and authoritative authorization. Test that boundary
with a bounded throwaway spike before fixing the runtime choice. Rust remains the simpler
operational alternative because it can call the core directly in one process.

This recommendation adds no cloud content replica or relay. Tailscale Serve routes private
HTTPS to the local network daemon. Neither runtime requires sync, a database of replicated
tasks or a server claim arbiter for one authoritative vault.

Decide the first authorization profile explicitly:

| Profile | Meaning | Consequence |
|---|---|---|
| Trusted owner | Every authenticated client has the owner's full vault authority. | Smaller personal first delivery. No per-agent privacy or per-space isolation promises. Application authentication, a web action allowlist, safe files and conflict handling still apply. |
| Restricted principals | Each credential identifies an actor with space scopes and private-memory/scratch rules. | Define local membership and sponsorship data, then enforce visibility before queries are limited or aggregated. The planned sync database cannot supply this in v1. |

The trusted-owner profile is an option for owner approval, not an implicit downgrade of the
earlier proposal. If the owner wants credentials restricted to different spaces or agents,
retain the second profile and build its complete Rust policy boundary first.

## Review 1: Shards proposal

**Verdict: revise before approval.** The topology is coherent. Several imported authorization
and browser contracts are incomplete. The earlier builder check tested whether the scope was
understandable; it was not a full security or code review.

| Severity | Finding and failure scenario | Required correction |
|---|---|---|
| High | Authorization can be bypassed through an alternate operation. `Host::call` forwards names without a principal; host body setters take a separate path. An actor argument can also select another scratch namespace. | Define one fail-closed operation matrix for both agent and human surfaces. Carry an immutable principal into Rust; check mutable target ownership under the entity lock. |
| High | The proposed private-memory rules require sync-owned sponsorship data. Filtering finished responses also produces incorrect limits and can disclose aggregate relationships. | Specify the selected profile and its local data source. For restricted profiles, apply visibility before limits, counts, ranking, graph expansion and cross-space aggregation. |
| High | Browser login, expiry, logout, revocation and streaming authorization are only named, not defined. An already-open event stream could continue after logout. | Define high-entropy hashed credentials, expiry and rotation; secure, HttpOnly, host-only cookies; SameSite and CSRF behavior; exact external Host/Origin rules; session-bound SSE that closes on expiry or revocation. |
| High | Events and file responses can leak information even when a read operation is denied. The current watcher sends absolute paths and the note browser exposes `abs_path`. | Use authorized, path-free invalidations. Redact success and error outputs. Resolve authenticated asset IDs in Rust and serve downloads with safe headers; prevent HTML/SVG execution in the application origin. |
| Medium | File locks serialize writes but do not prevent stale editors overwriting one another. A response can also disappear after a successful mutation. | Check an expected content revision under the same lock. Return a conflict for stale edits. Report uncertain outcomes after disconnect and never blindly replay writes. |
| Medium | The referenced hosted design assumes a replica, sync database, workspace actor, signed asset URLs and claim arbiter. | Publish an explicit private-profile tool and contract table. Replace those assumptions with local vault execution, local membership if needed and authenticated asset downloads. Pin the vault identity and fail closed if configuration resolves elsewhere. |

Code evidence:

- [`Host::call`](../../crates/shards-host/src/lib.rs#L81) routes core and host operations without
  a remote principal. [`Server::ctx`](../../src/mcp/tools.rs#L221) loads configuration and
  uses caller-supplied owner context. [`Ctx::actor`](../../src/ctx.rs#L69) prefers that owner.
- [Host body setters](../../crates/shards-host/src/tools.rs#L132) call domain mutations outside
  the MCP dispatcher. [Scratch operations](../../src/mcp/tools.rs#L904) accept an agent selector.
- [Memory reads and listing](../../src/mcp/tools.rs#L819) expose the existing local semantics;
  current filtering is not a substitute for remote visibility policy.
- [The watcher](../../crates/shards-host/src/lib.rs#L227) emits absolute paths, and
  [note browse rows](../../crates/shards-host/src/tools.rs#L152) contain `abs_path`.
- [`tasks::set_body`](../../src/domain/tasks.rs#L1045) locks and replaces without the editor's
  expected revision. [Browser transport](../../apps/desktop/src/lib/transport.ts#L62) reports a
  failed fetch as a network error. [EventSource](../../apps/desktop/src/lib/transport.ts#L165)
  does not send the current development host's token header itself.
- [The planned auth store](../../.spec/features/remote-mcp/tech.md#L152) explicitly uses sync's
  members and sponsor records. Those records do not exist for the proposed private delivery.

For the smallest useful v1, defer OAuth, public discovery, replicas, sync accounts, signed
download URLs, native filesystem actions and destructive remote host actions. Choose actual
first MCP clients and browser operations before promising a broad compatibility matrix.
Tailscale membership is not a replacement for application credentials.

## Review 2: how Paseo developed it

Inspected source: [Paseo `83ed52669da0ea1354ac1bf7343ca15723a33368`](https://github.com/getpaseo/paseo/tree/83ed52669da0ea1354ac1bf7343ca15723a33368)
and [Paseo Relay `5f4b7636af41a85ef20200c0b7e99dd1ea2ee1f2`](https://github.com/getpaseo/paseo-relay/tree/5f4b7636af41a85ef20200c0b7e99dd1ea2ee1f2),
both dated 2026-10-28 by the research agent. These are point-in-time source snapshots.

### Current architecture

Paseo's local daemon is a Node.js process. It manages agent processes and serves a WebSocket
API. Its desktop application supervises a daemon subprocess. The daemon can serve the bundled
browser UI from the same origin and optionally connect outbound to a relay. Its detached
terminal worker is a separate lifecycle choice for persistent PTYs, which Shards does not
need to reproduce. [Architecture at the inspected revision](https://github.com/getpaseo/paseo/blob/83ed52669da0ea1354ac1bf7343ca15723a33368/docs/architecture.md)

The current production relay is a separate Elixir/OTP service. The Node daemon and relay are
different runtime decisions. For Shards' private first delivery, Tailscale supplies connectivity,
so neither a custom relay nor Paseo's endpoint encryption protocol is needed.
[Relay README](https://github.com/getpaseo/paseo-relay/blob/5f4b7636af41a85ef20200c0b7e99dd1ea2ee1f2/README.md)

The bundled UI stays version-matched with its daemon. Its implementation handles same-origin
connection hints and trusted proxy behavior. These are useful patterns for Shards regardless
of the chosen backend runtime.
[Web UI source](https://github.com/getpaseo/paseo/blob/83ed52669da0ea1354ac1bf7343ca15723a33368/packages/server/src/server/web-ui.ts)

### Verified milestones

| Date | Evidence | Lesson for Shards |
|---|---|---|
| May 2026 | [Password-auth documentation](https://github.com/getpaseo/paseo/commit/f2a23039cb3c730f8c6e476f0e754fea1a52f21f) | Connectivity and application admission are separate concerns. |
| June 2026 | [Injected MCP authentication fix](https://github.com/getpaseo/paseo/commit/f05544ef8f4211dba6e56e53cbd1bd268b8ad10f) | Test managed-agent credentials as well as browser credentials. |
| 2026-06-26 | [Serve the web client from the daemon](https://github.com/getpaseo/paseo/commit/4e2c06ec71dfe05cda6f9768e491f8783395fbf5) | Keep UI/API versions together and explicitly opt in to remote serving. |
| Follow-up work | [Trusted proxy handling](https://github.com/getpaseo/paseo/commit/8c3b70979484e31af2cac55b32138a377b003b95), [Nix packaging](https://github.com/getpaseo/paseo/commit/3b078240a84d55c88f16ee425e1489003235c678) | Packaging, origin bootstrap and process management are part of delivery. |
| 2026-09-26 | [Session credential negotiation](https://github.com/getpaseo/paseo/commit/e1c769c018cb9813c04749ef85008866433f1130) | Compatibility exceptions can keep an old admission path open. |
| 2026-10-22 | [Replay-protected relay mode](https://github.com/getpaseo/paseo/commit/793b16c0df93ef378d95edeaab281ea19ab4c975) | Prefer an established secure transport to custom relay cryptography. |
| 2026-10-23 | [Require passwords on relay connections](https://github.com/getpaseo/paseo/commit/89727f43bc47caecc893ac3ad3326039915e15f0) | The same authorization policy must cover every ingress path. |

This is an evidence-backed milestone sequence, not the complete origin history of Paseo's
relay or MCP implementation. The coordinator independently checked the June 26, October 22
and October 23 commit records.

### MCP and security distinctions

Paseo's `/mcp/agents` is an agent orchestration adapter over its shared tool catalog. Its
authorization accepts an injected per-daemon capability bearer or daemon-password bearer.
This source does not establish generic OAuth connector support. The reviewed code also leaves
the endpoint open when no daemon password is configured; Shards should not inherit that
default for its private remote endpoint.
[MCP adapter](https://github.com/getpaseo/paseo/blob/83ed52669da0ea1354ac1bf7343ca15723a33368/packages/server/src/server/agent/mcp-server.ts),
[auth source](https://github.com/getpaseo/paseo/blob/83ed52669da0ea1354ac1bf7343ca15723a33368/packages/server/src/server/auth.ts)

There is a documentation discrepancy. Paseo's public security page describes NaCl and asserts
replay protection. Its internal endpoint-security document says legacy sessions have no replay
protection and remain replayable while legacy admission is enabled. New peers negotiate Noise
NK; the October 22 commit states that specialist cryptographic review remained required before
release or deployment. These are source observations, not an independent crypto audit or a
claim about which version the owner's installation runs.
[Public page](https://paseo.sh/docs/security.md),
[endpoint-security document](https://github.com/getpaseo/paseo/blob/83ed52669da0ea1354ac1bf7343ca15723a33368/docs/relay-endpoint-security.md),
[October 22 change](https://github.com/getpaseo/paseo/commit/793b16c0df93ef378d95edeaab281ea19ab4c975)

Both inspected repositories identify Apache 2.0 in their license files; third-party components
retain their own licenses. Architectural learning does not require copying their code.
[Paseo license](https://github.com/getpaseo/paseo/blob/83ed52669da0ea1354ac1bf7343ca15723a33368/LICENSE),
[relay license](https://github.com/getpaseo/paseo-relay/blob/5f4b7636af41a85ef20200c0b7e99dd1ea2ee1f2/LICENSE)

## Review 3: TypeScript versus Rust

The core stays Rust in every viable option. The choice is the remote transport runtime and
how that runtime reaches the core without a second parser, vault walk or domain implementation.

| Option | Benefits | Costs and verdict |
|---|---|---|
| Rust daemon calling the core directly | One process; typed internal calls; one authorization boundary; existing Rust host/watch reuse. | HTTP/session work stays in Rust. Lowest deployment and IPC burden. Keep as the comparison baseline. |
| TypeScript/Node daemon with a private Rust child | Network, sessions and MCP in the owner's preferred language; reuse React types where useful; official MCP SDK. | Requires a versioned IPC contract, two-process recovery and joint packaging. Preferred candidate to test. |
| TypeScript proxy over today's stdio MCP plus current host API | Appears to reuse existing transports with little code. | Current transports cannot carry a verified per-call principal; policy is split and the host has privileged alternate paths. Not acceptable unchanged. |
| Native Node/Rust binding | One OS process and direct Rust calls. | Native build and ABI packaging, crash coupling and runtime compatibility. Defer unless IPC proves inadequate. |

### Candidate process boundary

```text
Tailscale Serve
       |
TypeScript / Node daemon
  HTTP MCP, browser API, sessions, static UI, process supervision
       |
Private, versioned IPC
       |
Rust execution child
  authoritative operation policy, core/host dispatch, files, locks, visibility
       |
Explicitly selected local Markdown vault
```

The Node parent authenticates the client. Only that trusted parent can send an authenticated
principal/profile to the child over inherited pipes or a protected local socket. The child
validates the operation, actor, target and visibility policy before calling the domain code.
Remote callers cannot submit their own principal. Neither process changes environment identity
per request. Keep the existing local development server's guard unchanged.

The private RPC contract needs protocol/build version, request correlation, pinned vault
identity, immutable principal/profile, operation, bounded arguments and canonical results/errors.
Use one Rust source for tool schemas. Do not hand-maintain a second TypeScript schema table.
Do not assume JSON Schema-to-SDK conversion preserves every canonical schema; prove it.

Rust remains responsible for lock-time checks, authorized filtering before limits/aggregates,
safe asset opens and path-free events. Node handles client and transport lifecycle. If the child
dies or an exchange disconnects during a mutation, the outcome may be unknown. Cancellation
does not roll back a write that already started. Bound concurrency and queues, fail closed
while the child is unavailable, and do not automatically retry mutations.

Ship the UI, Node layer and Rust child as one versioned release. One macOS supervisor can
manage the parent, which owns child startup, shutdown and recovery. Test orphan cleanup,
version mismatch, config drift and restart behavior. A TypeScript choice does not eliminate
the Rust build or create a pure JavaScript deployment.

### SDK and runtime evidence

- Official TypeScript SDK reviewed at [2.4.0 commit `951fe5603a7ec0b2dcb6a0b95d92cd86f93ad9e5`](https://github.com/modelcontextprotocol/typescript-sdk/commit/951fe5603a7ec0b2dcb6a0b95d92cd86f93ad9e5).
  Its [HTTP guide at that revision](https://github.com/modelcontextprotocol/typescript-sdk/blob/951fe5603a7ec0b2dcb6a0b95d92cd86f93ad9e5/docs/serving/http.md)
  describes per-request factories, Node and web-standard runtime mounting, and explicit
  authentication-context forwarding. The handler itself does not validate tokens, Host or Origin.
- Official Rust SDK reviewed at [rmcp 3.8.0 commit `cd88056ffdc97756fbd98e5a12bbeb41758f0ce8`](https://github.com/modelcontextprotocol/rust-sdk/commit/cd88056ffdc97756fbd98e5a12bbeb41758f0ce8).
  Its [README at that revision](https://github.com/modelcontextprotocol/rust-sdk/blob/cd88056ffdc97756fbd98e5a12bbeb41758f0ce8/README.md)
  documents current and legacy protocol support. Its OAuth client support does not supply the
  Shards authorization server or access policy.
- Prefer Node to Bun as the initial TypeScript deployment candidate. Bun is supported by the
  SDK, but there is no demonstrated Shards-specific benefit that justifies adding that choice
  to the first comparison. Reconsider if packaging or existing operations favor Bun.
- Choose a supported LTS major at implementation time. The [official Node schedule](https://github.com/nodejs/Release/blob/main/schedule.json)
  schedules Node 26's LTS transition for 2026-10-28 and Node 24 maintenance for 2026-10-20.
  At review time the release page still labelled 26 Current and 24 LTS. A scheduled transition
  is not proof that the release has happened. Do not freeze a runtime version from this note.

The coordinator independently read the pinned TypeScript HTTP guide, pinned Rust README and
Node schedule. No dependency has been installed, upgraded or added to Shards.

### Bounded runtime spike, proposed only

Use a disposable vault and one real selected HTTP MCP client. Compare a minimal TypeScript
adapter with a minimal Rust adapter on the same cases:

1. One core read and one core write, without reimplementing domain logic.
2. Canonical tool-schema and error-envelope parity.
3. Two concurrent synthetic principals and actor-spoof rejection through the candidate boundary.
4. Rust child failure during a write, with an uncertain outcome and no automatic replay.
5. Packaging/startup steps and the amount of IPC-specific code each option needs.

Asset delivery and live events still need design and tests before shipping, but are not
required to decide the runtime. This spike cannot establish that all operations implement
complete authorization. It is not built or authorized by this research task.

Choose Rust if IPC, schema conversion, packaging or two-process recovery makes TypeScript
fragile. Choose TypeScript if it preserves one Rust policy implementation and the network
development benefits justify the bridge and deployment costs. No synthetic speed claim is
needed; the existing CLI cold-start budget remains unchanged either way.

## Required delivery verification

| Area | Evidence required before shipping |
|---|---|
| Authorization | Every exposed operation has positive and negative cases; unknown operation, spoofed actor, mutable ownership under lock and concurrent callers. Restricted profiles also cover private reads, scratch and cross-space aggregates before limits. |
| Browser | Exact Host/Origin rules; login CSRF; cookie flags; logout, expiry and revocation; an open SSE connection closes when authority ends; reconnect refreshes. |
| Files and metadata | Traversal, symlink escape, external space roots, unauthorized asset IDs, active downloads and scans for host paths in successful/error/event output. |
| Concurrency | Two stale editors produce a conflict; a lost response after create, append or recurring finish does not trigger duplicate automatic writes. |
| IPC and lifecycle | Mismatched protocol/build/vault is refused; bounded queues; child crash and parent restart; no orphan backend; fail closed while unavailable. |
| End to end | Throwaway vault, real chosen browser/MCP clients, second tailnet device or enrolled environment, and local CLI/stdio working with the daemon stopped. |
| Deployment | Preserve existing Serve routes; verify private-only reachability, credential rotation and supervised restart before exposing the selected live vault. |

Implementation gates remain the affected Rust and frontend commands in `AGENTS.md`. This review
ran no application tests and makes no implementation-passing claim.

## Decisions still needed

1. Approve the runtime candidate after the bounded comparison, rather than treating the old
   `shards-server` crate sketch as a Rust-only commitment.
2. Choose trusted-owner access versus restricted principals for v1.
3. Name the first real MCP client and browser operations for acceptance. Live vault/config,
   actor credentials and tailnet policy are deployment inputs, not research blockers.

No service, Tailscale route, live vault, dependency or product implementation changed in this
review. The canonical product and architecture specs still need revision after these decisions.
