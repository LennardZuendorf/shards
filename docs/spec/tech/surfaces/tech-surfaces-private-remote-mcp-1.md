---
type: tech
applies: "**"
updated: 2026-11-02
---

# Private remote MCP

Private v1 adds a TypeScript MCP adapter and a local Rust gateway over the authoritative
Markdown vault. No cloud replica, sync, UI or public OAuth is included. The future
[public OAuth profile](../../features/remote-mcp/tech.md) remains designed, NOT STARTED.
Local source and protocol tests do not establish deployment: image execution and real
Tailscale/Vercel acceptance are UNPROVEN, the declared daemon has zero instances, and no
activation is approved. The [runbook](../../../private-remote-mcp.md),
[feasibility receipt](../../../research/private-remote-feasibility.md) and
[deployment checklist](../../flows/delivery/plan-private-mcp-deployment-acceptance.md#private-mcp-deployment-acceptance) retain the operating gate.

**Built places (+code:).** [services/shards-remote](../../../../services/shards-remote/) owns the
official MCP SDK/Node adapter, lossless wire bridge, HTTPS/CONNECT client and supervisor.
[crates/shards-gateway](../../../../crates/shards-gateway/) owns local config, registry administration,
RPC v1 and bounded execution. [src/mcp/remote.rs](../../../../src/mcp/remote.rs) owns the explicit
tool-policy matrix and visibility; [CallCtx](../../../../src/ctx.rs) carries immutable
`cfg: Arc<Config>` and optional `Principal`. The shared
[dispatcher](../../../../src/mcp/tools.rs) implements `Server::call_in(&CallCtx, name, args)`;
`call_with(cfg, name, args)` creates a principal-free context, and `call` loads configuration
and delegates through it. These reach one implementation. Desktop adoption stays separate;
core and CLI gain no async runtime, HTTP SDK or network dependency, and calls never mutate
process identity environment variables.

**Local authority.** A protected, operator-owned, regular non-symlink grant file (0600)
contains schema/vault identity, declared human/agent members and human sponsorship,
client grants and separate connector credentials. Tokens are random 256-bit secrets,
displayed once and stored as constant-time-compared SHA256 verifiers. Expiry/revocation
are local. `shards-gateway grant issue|revoke` and `connector issue|revoke` require explicit
`--config`; no HTTP administration endpoint exists. Registry updates lock before reading
and atomically replacing state. Membership edits require stopped gateway/administrators.
The cloud forwards the original client bearer plus its connector credential; Rust derives
the actor and scopes from its own registry on every operation, including discovery.
No cloud actor/scope assertion, Tailscale identity header or cloud authority cache grants
access. The cloud sees transient credentials/content; it is not a zero-knowledge boundary.

Scopes are `notes|tasks|memories|scratch|assets:read|write`; write implies read. Acting
claimer, author/releaser owner and scratch-write agent must be absent or match the actor;
mismatch is canonical `identity_mismatch`. Task assignees may name any declared valid member.
Private memories require their owner or declared human sponsor on reads and writes.
Scratch resolves the real namespace before ownership checks; humans may access sponsored
agents, and `all_agents` grants no bypass. Human-only reassignment/force-release rules remain.
Asset attachment requires asset and target-space write authority, checked before writes and
again under affected locks. Local CLI identity remains a spelling convention.

The owner approved the TypeScript/Node private cloud adapter exception on 2026-10-30.
Rust retains native domain, authority and harness behavior; this exception adds no activation approval.

Parent: [Section index](README.md).
