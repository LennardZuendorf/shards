# Private Shards MCP adapter

This independent Node package forwards authenticated MCP requests to one fixed private Rust
receiver. Rust owns credentials, actor grants, canonical schemas and domain execution.
The package uses the official MCP SDK and Node adapter. It adds no Hono router; the Node
adapter's transitive Hono dependency stays inside the SDK.

**Local implementation is available. Delivery remains blocked.** No real Vercel/Tailscale
feasibility PASS, image build, deployment, tailnet enrollment or live-vault trial is recorded.
The root `vercel.json` declares a daemon with zero instances. Connecting this repository to
Vercel later does not approve activating it. Vercel documents unsupported inbound HTTP/TCP;
userspace overlay ingress and stable Services must pass the approved disposable trial first.

## Local checks

Use Node 24.15.0 and pnpm 12.6.0:

```sh
pnpm -C services/shards-remote install --frozen-lockfile --ignore-scripts
pnpm -C services/shards-remote test
pnpm -C services/shards-remote lint
pnpm -C services/shards-remote build
```

`test` runs real official SDK HTTP clients against disposable loopback TLS receivers. It needs
OpenSSL and permission to bind loopback sockets. `lint` runs strict TypeScript checking.
`build` compiles TypeScript to `dist/`; it does not start Node or enroll a device.

The optional real Rust integration test needs a built gateway binary. It launches that
binary against a disposable vault behind a test TLS terminator. It compares all 39 actual
Rust tool schemas with official SDK discovery, exercises note writes/reads/lists and domain
errors, then revokes its synthetic grant through the real local CLI:

```sh
cargo build -p shards-gateway
SHARDS_GATEWAY_BIN="$PWD/target/debug/shards-gateway" pnpm -C services/shards-remote test
```

This local cross-language check passed during implementation. It does not test Tailscale or
Vercel. The test skips explicitly when `SHARDS_GATEWAY_BIN` is absent.

## Runtime contract

Supply the values documented in `.env.example` through runtime secret injection. Do not put
real values in this directory. Use one explicit opaque vault identity and private HTTPS
receiver origin. The receiver's private Tailscale Serve hostname must present a valid TLS
certificate. Both configured origins must be exact `https://*.ts.net` origins without paths,
credentials, fragments or queries.

The enrollment key joins a narrowly tagged ephemeral Tailscale node. A separate locally
issued connector token authenticates this daemon to Rust. A separate client grant token is
the caller's MCP bearer. Tailscale tags and identity headers do not replace client grants.
Grant issuance/revocation happens locally through `shards-gateway`; this service exposes no
grant administration endpoint. The Mac must remain awake and reachable.

Node binds `127.0.0.1:8787` only. The supervisor launches `tailscaled` with in-memory node
state and an explicit userspace HTTP proxy on `127.0.0.1:1055` by default. A configured
`SHARDS_OUTBOUND_PROXY` loopback port sets both the listener and gateway client destination.
The gateway client explicitly
uses CONNECT through that proxy, validates the receiver certificate and sends no redirects
or retries. Proxy environment variables alone do not route Node traffic.

The supervisor waits for the LocalAPI socket, enrolls using a temporary mode-0600 key file,
starts Node, checks listener readiness, and probes the receiver's protocol/vault identity.
Only then does `tailscale serve --service=... --https=443 --bg` advertise the stable Service.
It invokes bare Tailscale binaries; it does not invoke `containerboot`. Automatic Service
advertisement is explicitly disabled as well. Tailnet administrators must preconfigure the
Service, HTTPS, service-host approval and narrow client/receiver access. The code does not
change tailnet policy or existing Serve routes.

SIGTERM drains the Service before draining admitted HTTP work. Node allows 20 seconds for
that work. The supervisor reaps Node and Tailscale children within the configured 30-second
grace period. An unexpected child exit, failed enrollment or incompatible receiver stops the
instance. Restart never retains authenticated sessions or replays a tool call. A receiver
probe checks compatibility at startup; each later MCP POST obtains current authority from
Rust, including initialize and notifications.

Only `POST /mcp` exists. GET and DELETE return 405. Host must exactly match the configured
private authority. A present Origin must exactly match its private origin. Session and resume
headers are rejected. Each POST owns a fresh low-level SDK `Server` and JSON-only stateless
transport. Notifications return no body and cannot cancel another POST. Request, response,
deadline and admission bounds fail closed. The adapter stores no grant, content, result or
request-ID cache. Logs contain only fixed lifecycle events; child command output is discarded.

Receiver control errors become failed MCP tool results with an explicit `execution` state.
Canonical Rust domain results, including `isError: true`, pass through unchanged. A response
lost after possible dispatch is `outcome_unknown/unknown`; users must inspect vault state
before explicitly deciding whether to submit another mutation. `completed` does not mean
domain success or rollback. Never retry these errors automatically.

## Number fidelity

Node 24's JSON reviver `context.source` and `JSON.rawJSON` preserve unsafe integer decimal
tokens through SDK serialization. A wire test asserts that `9007199254740993` remains that
exact JSON number in `structuredContent`. A separate test confirms unsafe integer call
arguments retain their exact decimal tokens from MCP input through the SDK to the Rust RPC
wire. The adapter does not convert these values to strings.
Ordinary JavaScript clients, including the tested SDK's default JSON decoder, may still round
that number in their own objects. Clients that need full u64 precision must use a lossless JSON
decoder or read the canonical text content; the exact numeric token is available on the wire.

## Image and later Vercel trial

The official Docker registry manifests were read on 2026-10-30:

| Image | Manifest digest |
| --- | --- |
| `node:24.15.0-bookworm-slim` | `sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d` |
| `tailscale/tailscale:v1.104.4` | `sha256:ed6480b33c6eb67c9cbd203ed42b9fb57e361986725b6856def71b7a3d9e276c` |

The Dockerfile pins these manifests. No TUN device or privileged mode is required by the
userspace design. Building and running the image has not been verified on this host because
Docker is unavailable. An approved local image check would use:

```sh
docker build --platform linux/amd64 -t shards-remote:trial services/shards-remote
```

Keep the Vercel project's root at the repository root. The daemon's root is this package;
its Dockerfile directory is the image build context. The Dockerfile therefore uses package-
relative COPY paths. The root project disables framework detection and root dependency
installation. Its build command creates an empty `.vercel-empty` output directory, which
prevents the framework-Other default from publishing repository files as static output.
That command does not start a process; the Dockerfile installs pnpm dependencies and compiles
TypeScript, and its entrypoint runs Node. No frontend or root package.json is required.
The config fields were checked against the published Vercel schema; a real Vercel build has
not been run. Do not configure a public route, rewrite, service binding or Funnel.
Vercel supplies deployment environment variables as build arguments too. The Dockerfile
declares and consumes no secret ARG and starts no secret-bearing process while building.
This avoids baking credentials, but it does not remove Vercel's documented build-argument
handling; confirm the chosen secret-injection policy before an approved cloud trial.

Before activation, record the chosen synthetic receiver, vault/config, enrolled test clients,
tailnet grants, disposable cloud project and cleanup owner. Prove private ingress from a
second enrolled client, negative reachability outside the tailnet and at the public Vercel
hostname, stable Service discovery after restart/redeploy, overlapping host behavior, grant
revocation and unknown-write behavior. Obtain Vercel support clarification for overlay
ingress. Then remove disposable hosts, Service configuration, keys and cloud resources under
the same approved trial. No public-route or alternate-provider fallback is authorized.

Sources: [Vercel daemon config](https://vercel.com/docs/daemons/config-reference),
[Vercel build settings](https://vercel.com/docs/builds/configure-a-build),
[Vercel limits](https://vercel.com/docs/daemons/limits),
[Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve),
[container parameters](https://tailscale.com/docs/features/containers/docker/docker-params),
[official Node image](https://hub.docker.com/_/node),
[official Tailscale image](https://hub.docker.com/r/tailscale/tailscale).
