---
type: tech
applies: "**"
updated: 2026-11-02
---

# tech: Security Model

## Security Model

| Boundary | Rule |
|---|---|
| Local (CLI, stdio MCP, app) | Same-user trust. Identity is a spelling convention; `private` memory is a courtesy filter |
| Tauri webview | No filesystem plugin; vault I/O only through `shards_call`. One capability (`apps/desktop/src-tauri/capabilities/default.json`, window `main`) grants exactly `allow-shards-call`, `core:event:allow-listen`/`allow-unlisten`, `core:window:allow-start-dragging`/`allow-internal-toggle-maximize`, `opener:allow-open-url`, `opener:allow-default-urls`, `allow-shards-open`; `host_pick_vault` is registered but not granted. `shards_open {path, with: obsidian|default|reveal}` opens a file outside the app from Rust: the path must canonicalise to a regular file inside an enabled space root of the current vault, so the webview gets no general `opener:allow-open-path` scope. Production CSP `default-src 'self'; script-src 'self'`, `connect-src 'self' ipc: http://ipc.localhost`, `img-src` adds `data: blob: asset: https:`, `object-src`/`frame-src 'none'`, `form-action 'none'`; `dangerousDisableAssetCspModification: ["style-src"]` (gap: owner review). Markdown via react-markdown without raw HTML; links open outside the app, remote images load on click (`safe-markdown.tsx`). No `quickadd` window yet |
| `shards-host` HTTP (dev/browser) | Binds 127.0.0.1 only (`--port`, `$SHARDS_HOST_PORT`, default 7878). Every route: `Host` must be `localhost`, `127.0.0.1` or `[::1]` with an optional port (DNS-rebinding guard), else 403. An `Origin`, when present, must be `http://` + a loopback host on **any** port (each worktree's Vite has its own port); `null`, `https:` and `tauri://localhost` are refused (403). `/api/call` needs `x-shards-client: 1` (forces a CORS preflight the server never answers), else 403. `/api/call` and `/api/events` need `x-shards-token` (constant-time compare), else 401. The token is 32 random bytes hex, new per launch, written 0600 to `$SHARDS_HOST_TOKEN_FILE` or `~/.shards/run/host-<port>.token` (stale file or symlink unlinked, then exclusive create) after the port is bound. The Vite dev proxy reads the file on every request and adds the header, so the browser never holds the token. `/api/health` needs only the `Host` check. No CORS headers at all |
| `shards-server` (reserved) | OAuth 2.1 AS: PRM (RFC 9728), AS metadata (RFC 8414) + RFC 9207 `iss`, CIMD preferred, DCR behind a flag, PKCE S256, RFC 8707 audience (`/mcp` and `/api` separate), refresh rotation, PATs for headless agents. Actor injected from the token. Actor args (`claimer`, release `owner`, author `owner`, write `agent`) absent or equal to it, else tool error `identity_mismatch` (exit 2); assignee `owner` on `task_new`/`task_update` may name any active member; HTTP 403 only for missing scope. Scopes `notes\|tasks\|memories\|scratch\|assets:read\|write` + `offline_access`; cross-space tools filter to readable spaces. Absolute paths stripped to `rel_path` |

**Private MCP (local implementation):** a protected local grant file supplies actors, sponsors, scopes and
credential verifiers without sync. A separate connector credential authenticates the cloud
forwarder. Rust constructs immutable per-call authority and checks visibility before
selection. No host tools, UI, public OAuth or cloud grant-authority cache. The
[persistent contract](../surfaces/tech-surfaces-private-remote-mcp-1.md#private-remote-mcp) owns the full rules;
the public `shards-server` row above is a separate later profile.
Private MCP extends S1 with principal-aware `call_in`, keeping desktop's principal-free
`call_with(cfg, name, args)` convenience wrapper over the same implementation. Both are built;
desktop adoption remains separate. No desktop work depends on the private deployment's
platform gate.

Parent: [Section index](README.md).
