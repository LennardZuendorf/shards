# Private remote MCP

The repository contains the TypeScript MCP service and its local Rust gateway. It uses the
official MCP TypeScript SDK with its Node adapter. Hono is not a separate application layer.
All records remain in the local Markdown vault. The cloud holds no content replica.

**Code-first status:** local implementation and integration tests are available. Docker image
execution, real Tailscale networking and Vercel support are unverified. The root Vercel daemon
has zero instances. No live service, tailnet change, deployment or installation has occurred.
See the [feasibility receipt](research/private-remote-feasibility.md),
[design](superpowers/specs/2026-10-28-private-remote-mcp-design.md) and
[plan](superpowers/plans/2026-10-28-private-remote-mcp-plan.md).

## Local gateway configuration

Use a protected directory owned by the operator, with no group/world write access. The grant
file must be a regular non-symlink file with mode `0600`. Paths below are examples, not defaults.
Use the exact canonical paths for the intended existing vault and its core config. The core
config must declare the same explicit vault path. Gateway startup pins config and root identity;
changing them requires a deliberate restart. Grant rotation does not require restart.

`gateway.toml`:

```toml
vault_id = "my-private-vault"
vault_path = "/absolute/path/to/vault"
core_config = "/absolute/path/to/shards/config.toml"
external_origin = "https://vault.example-tailnet.ts.net"
grants_file = "/absolute/path/to/private-gateway/grants.json"
listen_port = 8787
```

Provision the initial `grants.json` offline before serving it:

```json
{
  "schema_version": 1,
  "vault_id": "my-private-vault",
  "members": [
    {"id": "lennard", "kind": "human", "sponsor": null},
    {"id": "codex", "kind": "agent", "sponsor": "lennard"}
  ],
  "grants": [],
  "connectors": []
}
```

Member IDs must satisfy the core identity rules and configured collections. Sponsorship must
name a declared human. Make member edits only while the gateway and local administrators are
stopped; never hand-edit an active registry. Use the CLI for grant/connector rotation.

```sh
cargo build -p shards-gateway --locked
./target/debug/shards-gateway connector issue --config /absolute/path/to/gateway.toml --connector-id vercel-trial --expires-at 2026-11-30T00:00:00Z
./target/debug/shards-gateway grant issue --config /absolute/path/to/gateway.toml --grant-id codex-trial --actor codex --scope notes:write --scope tasks:write --scope memories:read --expires-at 2026-11-30T00:00:00Z
./target/debug/shards-gateway serve --config /absolute/path/to/gateway.toml
```

Each issue command prints one new random token once. Keep it in the intended secret store;
only a hash is persisted locally. The connector token belongs to the cloud service. The client
grant token is its MCP caller's bearer token. A Tailscale enrollment key is a third, separate
credential. Choose expiry deliberately rather than copying the example date indefinitely.

The receiver binds loopback only. A later approved Tailscale Serve configuration terminates
HTTPS and forwards to this port. Inspect existing Serve configuration before changing it;
do not replace another service's routes. Tailnet rules must separately allow clients to the
MCP Service and the cloud host to the receiver. Tagged nodes' identity headers grant no
application authority. The Mac must remain awake and reachable.

Revocation takes effect before the next operation is admitted, including a queued one:

```sh
./target/debug/shards-gateway grant revoke --config /absolute/path/to/gateway.toml --grant-id codex-trial
./target/debug/shards-gateway connector revoke --config /absolute/path/to/gateway.toml --connector-id vercel-trial
```

Already admitted writes may finish. A lost response is not proof that a write failed. Inspect
vault state before explicitly submitting another mutation. Neither process retries writes.
`completed` means execution finished; it does not assert domain success or rollback.

## TypeScript build and later Vercel connection

The independent package lives in [services/shards-remote](../services/shards-remote/README.md).
Its README includes environment variables, exact checks, pinned image manifests, native
lifecycle behavior, numeric precision limits and the deployment acceptance list.

```sh
pnpm -C services/shards-remote install --frozen-lockfile --ignore-scripts
pnpm -C services/shards-remote build
```

Keep the Vercel project's root at the repository root. The daemon Dockerfile's build context
is `services/shards-remote`. Docker installs dependencies and compiles TypeScript; its
entrypoint starts the Node supervisor and bundled userspace Tailscale. A normal Vercel build
command does not run a persistent server. The root build publishes an empty static directory,
so no UI or repository files become a site.

Set runtime values using the package's `.env.example`; never commit real credentials. Both
origins use private `https://*.ts.net` names. The service uses an explicit userspace CONNECT
proxy and advertises only after the receiver compatibility probe succeeds. The Dockerfile
does not consume secret build arguments. Vercel also supplies deployment environment values
as build arguments, so the chosen secret-injection policy still needs confirmation.

Before activating an instance, complete the disposable trial and verify private ingress,
receiver forwarding, public negative reachability, stable discovery, rollout overlap,
shutdown and cleanup. Obtain the platform support clarification required by the design.
Do not use a public route or Funnel as a fallback. Removing an enrollment key alone does not
remove an enrolled host; remove the disposable node and Service resources during cleanup.

The CLI, stdio MCP and desktop remain usable with both new processes stopped. No cloud process
or daemon becomes a local command dependency.
