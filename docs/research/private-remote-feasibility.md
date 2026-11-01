# Private remote MCP feasibility receipt

Date: 2026-11-01. **Overall result: UNPROVEN for deployment.** The owner requested code first
and repository connection to Vercel later. Local implementation may proceed; real platform
acceptance remains a release gate. No cloud project, live vault or tailnet was changed.

## Local evidence

- Official MCP server/client `2.4.0`, Node adapter `2.1.2`; Node `24.15.0`, pnpm `12.6.0`.
- Real Rust gateway through disposable TLS to the official SDK HTTP client: all 39 canonical
  schemas match, representative note writes/reads/lists and domain errors work, and local CLI
  grant revocation rejects the next request. This tests protocol boundaries, not Tailscale.
- Integer decimal tokens, including `9007199254740993`, remain exact in both call arguments
  and returned structured JSON. Ordinary JavaScript client objects may still round them;
  lossless decoding or canonical text is required when a client needs full-width integers.
- Per-request authority, bounded work, expiry/revocation, local private visibility, full-graph
  readiness, unknown/completed write states, no replay, proxy routing and child reaping have
  controlled local tests. See the final check counts below.
- The independent implementation review reported no remaining confirmed actionable finding.

Final local checks: **1,762 Rust workspace tests passed**, **23 TypeScript/SDK tests passed
with zero skipped**, workspace Clippy and formatting passed, and strict TypeScript checking
and compilation passed. Spec validation had zero errors and 58 warnings before commit; the
committed-history audit has zero errors and 63 inherited spec warnings (initial baseline 66).
A final default-HTTPS CONNECT regression failed before the authority/Host fix and passed with
the full SDK suite afterward.

The publication branch includes main through `bd8a4ad`. Blank-owner authorization and remote
search blank-filter integration tests each failed before the shared-entrypoint merge fix;
all 28 remote-policy tests and the full workspace pass afterward.

The 2026-10-31 internal code review identified and resolved three implementation defects:

- SDK batch messages bypassed the aggregate response/work budget. The listener now rejects
  arrays before authority lookup or dispatch; empty, one-call and two-call batches do no work.
- Roots absent at gateway startup stayed unpinned. Config clones now share immutable directory
  identities, and admitted creations pin only their target space before dispatch. Disabled
  spaces retain canonical domain errors. A later argument error can leave an empty pinned
  directory; this does not change the local CLI's lazy creation behavior. These checks do not
  remove the existing local pathname race between validation and I/O.
- Session context reopened task bodies after selecting metadata. Refreshed task metadata/body
  now share one authorized read and retain selection predicates. Task-next hydration also
  repeats selection/readiness checks, and claims retain the document read under their lock.

Each reported defect produced an assertion failure before its correction. Follow-up tests
also caught and closed disabled-space error mapping and refreshed ownership-filter regressions.
Initial test fixture API/authority mistakes were setup errors, not behavioral RED. Independent
core, gateway and cloud reviewers accepted the final corrections. The final Rust check covers
core (including the native harness), host and gateway; the SDK run uses the freshly built real Rust gateway with no skipped
tests. Watcher checks required the same authorized access documented below.

The final branch reconciles main through `857f33c`. Desktop verification passed 731 tests,
lint and production build; existing frontend lint warnings remain unchanged. Formatting,
workspace Clippy and TypeScript checks passed. Both spec validators exit zero; the pre-merge
drift check reports zero errors and 15 inherited incomplete-unit warnings. All 268 checked
local Markdown links resolve. Source compounding is complete; deployment acceptance is open.

Reproduce the cross-language check with the final gateway binary:

```sh
cargo build -p shards-gateway --locked
SHARDS_GATEWAY_BIN="$PWD/target/debug/shards-gateway" pnpm -C services/shards-remote test
pnpm -C services/shards-remote lint
pnpm -C services/shards-remote build
```

The initial core baseline was 1,477 passing tests. A sandbox run could not write the watcher
runtime lock; a later sandbox run also lacked watcher telemetry despite a writable runtime
directory. Authorized runs outside the sandbox passed. Socket-based Node tests require local
listen permission; sandbox `EPERM` is not evidence that application assertions failed.

The affected Rust cases were
`cli::watch::tests::watcher_pid_reads_the_lock_and_ignores_a_dead_one` and
`watch_cli::a_live_watcher_reports_the_file_it_healed`. Both passed outside the sandbox.
The independent reviewer's sandbox Node run had nine passes, eleven socket-bind failures,
and the optional Rust integration skipped without its binary setting. The eleven were the
four then-existing receiver/proxy failure tests plus these seven MCP integration cases:
canonical raw tools/read/write; HTTP session isolation/revocation; gateway control families;
integer-wire/lost-write behavior; integer call arguments; cross-POST cancellation; and admitted
deadline handling. The final authorized run includes all of them, the real Rust integration
and the later default-port and batch regressions: 23 pass, none fail or skip.

## Candidate runtime and configuration

The [package README](../../services/shards-remote/README.md) records verified official image
manifest digests for Node `24.15.0-bookworm-slim` and Tailscale `1.104.4`. The images are pinned
in the Dockerfile. Root `vercel.json` declares an inactive Daemon, repository-root project,
package-relative Docker build context, and empty static output. Published schema checks passed.

Docker is absent on this host. No image build, native container Tailscale run, Vercel build,
enrollment, Service advertisement, second-device test or rollout/shutdown trial was performed.
No trial resource IDs or cleanup receipt exist because no resources were created.

## Platform evidence and remaining gate

Vercel documents continuous Daemons in public beta, production-only activation, ephemeral
storage, and unsupported inbound HTTP/TCP. Userspace Tailscale provides plausible overlay
ingress, not an established Vercel exception. The real trial and written support clarification
remain required. FAIL or UNPROVEN blocks release; no public-route/provider fallback is selected.

Userspace outbound traffic needs an explicit proxy. The implementation tests a destination
that cannot resolve locally to prove CONNECT is used. A CONNECT counter alone would not prove
that the final request used the tunnel. Service advertisement follows listener readiness and
the receiver probe; it never follows enrollment alone.

Later trial inputs: approved disposable team/project and spend limit, synthetic receiver,
test tailnet/Service/tags/HTTPS grants, enrollment identity, short-lived connector and caller
tokens, second enrolled environment, and cleanup owner. None is inferred from this checkout.

Sources: [Vercel Daemons](https://vercel.com/docs/daemons),
[configuration](https://vercel.com/docs/daemons/config-reference),
[limits](https://vercel.com/docs/daemons/limits),
[Tailscale userspace networking](https://tailscale.com/docs/concepts/userspace-networking),
[Services](https://tailscale.com/docs/features/tailscale-services),
[Serve](https://tailscale.com/docs/reference/tailscale-cli/serve),
[official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).
