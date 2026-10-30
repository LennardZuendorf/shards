---
type: feature-plan
feature: private-remote-mcp
parent: plan.md
updated: 2026-10-30
---

# Private Remote MCP Implementation Plan

> For agentic workers: use superpowers:executing-plans or superpowers:subagent-driven-development
> after approval. Execute the stable units below in order. No commits unless requested.

**Goal:** a Vercel-hosted TypeScript MCP process accepts tailnet-only calls and executes them
through an authorized local Rust gateway against one existing Markdown vault.

**Architecture:** userspace Tailscale and Node run in a Vercel Daemon. The Mac gateway owns
credentials, principals and domain execution. The cloud is an MCP adapter, not a data replica.

**Tech stack:** existing synchronous Rust core, an async Rust receiver crate, TypeScript/Node,
official MCP SDK, pnpm, Docker and official Tailscale userspace binaries.

**Spec:** [design](../specs/2026-10-28-private-remote-mcp-design.md).
**Sequence:** [root plan](../../../.spec/plan.md).
**Status:** implementation approved 2026-10-30; /1 IN PROGRESS. Deployment unapproved and
platform feasibility UNPROVEN. Owner requested code first, repository connection to Vercel later.

## Local implementation evidence (2026-10-30)

The repository now contains the cloud adapter/lifecycle package, local gateway/administration,
and principal-aware core policy. The disposable spike scaffolding has been removed.

| Unit | Current state |
|---|---|
| /1 | Local SDK/Rust schema, read/write, error and integer boundaries verified; real image/platform trial UNPROVEN |
| /2 | Local registry/config/CLI implemented; 16 registry tests pass |
| /3 | Core policy/seam implemented; 28 remote regressions and the full core suite pass |
| /4 | Private RPC implemented; protocol, executor and real-core RPC tests pass |
| /5 | SDK/Node adapter implemented; all 39 Rust schemas match official-client discovery |
| /6 | Image/config/supervisor source implemented; local lifecycle tests pass; image and real overlay execution unverified |
| /7 | Local checks/runbook implemented; live network/platform acceptance and verify-to-ship approval remain open |

Final workspace tests: **1,598 passed, zero failed/ignored** across core, host and gateway.
Workspace Clippy with denied warnings passes. TypeScript strict checking/build pass. The
official-client suite has 22 tests, including actual Rust gateway integration. See
[feasibility receipt](../../research/private-remote-feasibility.md) and
[operator runbook](../../private-remote-mcp.md). No release or deployment PASS is implied.

Publication integration includes `origin/main` through `bd8a4ad`. Two regression tests first
failed when blank-owner normalization followed authorization and remote search bypassed blank
filter validation; both pass after moving these checks to the shared request entrypoints.

## Global constraints

- No UI, public MCP route, Funnel, cloud content replica, sync dependency or OAuth in v1.
- Keep all domain logic, file access and authoritative authorization in Rust.
- Preserve local CLI/stdio semantics and the CLI's existing cold-start dependency boundary.
- Use actor-bound credentials and per-space scopes. Never mutate environment identity per call.
- Preserve canonical schemas and MCP error/result envelopes; expose no host tools or note adoption.
- Run meaningful failing tests before production implementation; use disposable vaults.
- Under the owner's 2026-10-30 amendment, local code/tests for later units may proceed before
  /1's real deployment PASS. Do not release or claim Vercel support until it passes. No silent
  hosting fallback.
- Actual commands below are planned verification targets, not evidence already obtained.

## Review focus

1. An overlay that works locally but is unsupported or unstable on Vercel must block deployment.
2. Reused permission logic must have local membership/sponsorship data and cover indirect reads.
3. A grant revoked while queued must not execute; a write already executing cannot be rolled back.
4. Schema conversion, numeric values and result wrappers must not drift across Node/Rust.
5. Restart, overlap and retry behavior must not duplicate mutations or lose private discovery.

## Requirements trace

| Requirement | Units |
|---|---|
| R1 Tailnet-only ingress | /1, /5, /6, /7 |
| R2 Verified Vercel feasibility | /1 |
| R3 One authoritative vault | /2, /3, /4, /7 |
| R4 Local grants and verified actors | /2, /3, /4, /5 |
| R5 Per-space and object visibility | /2, /3, /4, /7 |
| R6 One agent tool implementation | /1, /3, /4, /5, /7 |
| R7 No write replay | /4, /5, /6, /7 |
| R8 Lifecycle and confidentiality | /1, /2, /4, /5, /6, /7 |

The prefix for every abbreviated unit in this table is `private-remote-mcp`.
Units are stable; dependencies below refer only to this feature's units.

### private-remote-mcp/1 — Prove the deployment and adapter boundary

**Requirements:** R1, R2, R6, R8. **Dependencies:** none.

**Files:** disposable `services/shards-remote/spike/`; evidence
`docs/research/private-remote-feasibility.md`. Do not install a production service or use a
live vault. Discard spike implementation before delivery.

**Interfaces produced:** a PASS/FAIL/UNPROVEN receipt with pinned runtime/image/SDK versions,
supported raw-schema registration API, private Service configuration and tested lifecycle.

- [ ] Build a minimal loopback Node HTTP MCP endpoint and a disposable local receiver fixture.
  Prove stateless JSON-response transport with a real client, one read/write and canonical
  tool/error registration without a domain rewrite.
- [ ] Compare a real Rust-produced schema and result, including list wrappers and numeric
  values such as `bytes: u64`. Record any SDK limitations before selecting implementation APIs.
- [ ] In an explicitly approved disposable Vercel project, run userspace Tailscale with the
  candidate tagged ephemeral Service. Prove tailnet ingress and private receiver forwarding.
- [ ] Probe the deployment's public hostname and an unenrolled client: no MCP route works.
  Restart and redeploy; verify stable private discovery and old/new host overlap.
- [ ] Record Vercel support clarification for userspace overlay listeners despite documented
  inbound restrictions. Missing clarification or missing behavior is UNPROVEN, not PASS.
- [ ] Write the receipt and clean up trial devices, services, credentials and cloud resources.
  FAIL/UNPROVEN blocks release for an owner decision; never switch provider or expose publicly.

**Verification:** receipt contains the real client commands, sanitized outputs, resource IDs
and cleanup result. No later unit may cite a proposed command as passed evidence.

### private-remote-mcp/2 — Local grant registry and administration

**Requirements:** R3, R4, R5, R8. **Dependencies:** /1.

**Files:** `crates/shards-gateway/{Cargo.toml,src/config.rs,src/grants.rs,src/cli.rs,src/lib.rs}`,
new tests `crates/shards-gateway/tests/grants.rs`, root Cargo workspace/lock.

**Interfaces produced:** `GatewayConfig`, `GrantRegistry` and verified `Principal` inputs
matching the design's field names; local issue/revoke administration and connector proof.

- [ ] Write grant tests first: valid actor/sponsor/scopes, token absence/mismatch, expiry,
  revocation, unknown members and grants bound to a different vault.
- [ ] Test the real binary's issue-once output separately from registry return values; ensure
  logs never contain credentials. Reject symlink/non-regular/unsafe-permission state files.
- [ ] Implement the protected registry and local administration. Acquire the administration
  lock before reading the write plan; use exclusive regular outputs and atomic replacement.
- [ ] Race two administrators and prove no update disappears. Revalidate grants after a
  simulated queue wait. Use the stable shared/exclusive registry lock and barriers to prove
  revoke-before-admission refuses queued work, while admission-before-revoke may complete.
- [ ] Run `cargo test -p shards-gateway --test grants`; all cases pass without a live vault.

### private-remote-mcp/3 — Authoritative principal-aware core dispatch

**Requirements:** R3, R4, R5, R6. **Dependencies:** /2.

**Files:** `src/mcp/{remote.rs,tools.rs,mod.rs}`, `src/ctx.rs`, the existing affected domain
and search modules; `tests/remote_policy.rs`, existing `tests/mcp_cli.rs`.

**Interfaces:** consumes verified registry data; produces the design's `CallCtx`,
`Principal` and `Server::call_in`. Desktop S1's `call_with(cfg: Config, name: &str, args: &Json)`
is a principal-free convenience wrapper over the same dispatcher. `Server::call` loads config
and delegates locally. Desktop may land its local `call_with` first without waiting for /1;
this unit extends and reuses it, or adds it if absent. Coordinate shared-file edits and keep
one dispatcher. Desktop has no dependency on Vercel feasibility.

- [ ] Write tests for two concurrent actors, spoofed actor arguments, assignment distinct from
  acting identity, private memory, sponsored scratch and `all_agents`.
- [ ] Enumerate every canonical tool into one policy table; test missing scopes, absent tools,
  guessed `host_*` names and note adoption. Fail when a tool lacks a policy.
- [ ] Add the explicit-context seam. Carry authority into existing readers/selectors and locked
  mutation paths; do not maintain another parser, walker or domain implementation.
- [ ] Test hidden records before a list limit, private search/context/activity and hidden graph
  edges/candidates. Test scopes for dependencies, mirrors and asset attach before any write.
- [ ] Test a visible task with a hidden blocker: list/next retain full-graph readiness, strict
  claim refuses it, and graph/cascade/errors reveal no hidden IDs, titles, edges or counts.
  Test `call_with(cfg.with_agent(Some("lennard")), ...)` uses that config identity even when
  the process environment names another actor.
- [ ] Test output redaction and sidecar metadata without inventing asset byte downloads.
  For authorized-corpus search, reuse the existing built-in engine when indexed cannot enforce
  the policy; local indexed behavior stays unchanged.
- [ ] Run `cargo test -p shards --test remote_policy` and
  `cargo test -p shards --test mcp_cli`; local fixtures preserve their existing envelopes.

### private-remote-mcp/4 — Bounded private Rust RPC receiver

**Requirements:** R3–R8. **Dependencies:** /3.

**Files:** `crates/shards-gateway/src/{http.rs,protocol.rs,executor.rs,main.rs}`,
`crates/shards-gateway/tests/{rpc.rs,failures.rs}`.

**Interfaces:** the three `/v1/*` routes, exact request/control-error envelopes and canonical
`mcp_result` in the design. Bind to the configured vault and loopback listener.

- [ ] Write protocol tests for version/vault mismatch, unknown fields, invalid types, expired
  deadline, connector/client proof, wrong Host/Origin and redirect refusal.
- [ ] Implement probe, describe and call over a bounded blocking executor. Verify both
  credentials for client operations; obtain all principal fields from the local registry.
- [ ] Test 16 MiB limits, 32 workers, 32 queue entries, overload and post-queue revocation.
  Capture a completed result that is too large without claiming its mutation never executed.
- [ ] Drop a response after a committed append and recurring finish; test the explicit unknown
  state and absence of automatic replay. Distinguish completed domain `Partial` from transport
  uncertainty. Cancel queued versus running work separately.
- [ ] Change the resolved vault/roots after startup and prove the instance fails closed.
- [ ] Run `cargo test -p shards-gateway --test rpc` and
  `cargo test -p shards-gateway --test failures`.

### private-remote-mcp/5 — TypeScript MCP adapter

**Requirements:** R1, R4, R6, R7, R8. **Dependencies:** /4.

**Files:** `services/shards-remote/{package.json,pnpm-lock.yaml,tsconfig.json}`,
`src/{mcp.ts,gateway-client.ts,protocol.ts,config.ts}`, `test/{mcp,protocol,failures}.test.ts`.

**Interfaces:** consumes RPC v1; exposes authenticated Streamable HTTP `/mcp` on loopback
behind Tailscale in stateless JSON-response mode. Canonical tool tables/results arrive from
Rust. No SDK session, SSE stream, resume state or cross-request cancellation is exposed.

- [ ] Define package scripts `test`, `lint` and `build`; pin dependencies to APIs verified
  in /1. Resolve library docs before dependency code.
- [ ] Write a real SDK HTTP-client test for discovery, one read/write, denial, schema/annotation
  parity, bare-array text plus `structuredContent.result`, and canonical domain error text.
- [ ] Test authenticated initialize/notifications, foreign session/resume headers, GET/DELETE
  405, repeated request IDs across grants, revocation and reconnect. Each POST has isolated
  transport state; a notification must not cancel or receive another POST's result.
- [ ] Implement the adapter with no local credential-authority cache, schema duplication,
  dynamic backend URL or retries. Forward only to the configured private receiver.
- [ ] Test spoofed principal fields, absent bearer, malformed/oversized payloads, integer
  boundaries and all control-error execution states. Do not log request/response payloads.
- [ ] Run `pnpm -C services/shards-remote test`, `lint` and `build`.

### private-remote-mcp/6 — Built-in networking and lifecycle package

**Requirements:** R1, R7, R8. **Dependencies:** /5.

**Files:** `services/shards-remote/{Dockerfile,.dockerignore,src/supervisor.ts}`,
`test/supervisor.test.ts`, root `vercel.json`.

**Interfaces:** a versioned Linux amd64 image and production daemon declaration. Runtime
secrets name the receiver, connector credential and Tailscale enrollment; no secret is baked.

- [ ] Write supervisor tests for enrollment failure, failed receiver probe, unexpected child
  exit, SIGTERM drain and no orphan Node/Tailscale child. Never advertise an unready endpoint.
- [ ] Implement the pinned userspace Tailscale/Node lifecycle proved in /1, with a stable
  private Service and narrowly scoped tags. No Vercel public routes or Funnel.
- [ ] Test rolling version mismatch, overlapping hosts, gateway unavailability and reconnects.
  Reconnect restores transport only; it must not resubmit mutations.
- [ ] Build and smoke-test the image locally, then verify an approved disposable cloud rollout.
  Check that logs contain no fixture secrets, titles, bodies, arguments, results or paths.
- [ ] Run package checks and preserve the /1 evidence with the final pinned configuration.

### private-remote-mcp/7 — Whole-feature acceptance and operator runbook

**Requirements:** R1, R3, R5–R8. **Dependencies:** /6.

**Files:** `services/shards-remote/test/e2e.test.ts`,
`crates/shards-gateway/tests/parity.rs`, `docs/private-remote-mcp.md`, relevant root spec
and AGENTS drift only after verification. No UI files are owned by this feature.

- [ ] Exercise all 39 remote policies with human and agent credentials over disposable vaults,
  including mixed spaces, private content, actor races and write refusals with unchanged bytes.
- [ ] Use an actual selected MCP client on another tailnet device/environment. Test remote
  reachability, negative public reachability, restart/redeploy and credential/node removal.
- [ ] Stop all new processes and run existing local CLI/stdio operations. No network or
  gateway becomes a dependency.
- [ ] Document grant issuance/revocation, separate enrollment/connector/client credentials,
  explicit config/vault selection, Mac awake requirement, service cleanup and failure recovery.
- [ ] Run `cargo test -p shards`, `cargo test -p shards-host`,
  `cargo test -p shards-gateway`, `cargo fmt --all --check`, and
  `cargo clippy --workspace --exclude shards-desktop --all-targets --locked -- -D warnings`.
  Run the TypeScript package's test/lint/build and the relevant deployment acceptance cases.
- [ ] Run `vibe-spec validate`; compare findings with the pre-change baseline. Report actual
  outputs, limitations and unresolved items for the verify-to-ship gate.

Do not install the local service against the owner's live vault, publish a production cloud
daemon, commit, push or open a PR merely because implementation was approved. Those actions
remain outside this code-first work.
