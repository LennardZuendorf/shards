---
type: tech
applies: "**"
updated: 2026-11-02
---

# Private remote admission and lifecycle

**Admission, pins and limits.** The receiver permits 32 running and 32 queued calls,
16 MiB per request/response and at most 30 seconds from receiver admission, bounded by the
caller deadline. Recheck authority and deadline after queueing. A shared registry lock
covers reread/credential validation and the atomic queued-to-running transition; revocation
uses an exclusive lock on the same stable anchor. Completed revocation beats queued work;
admitted work may finish, even while later waiting on an entity lock. Cancellation removes
queued work atomically before promising `not_started`. Started synchronous writes may
complete after cancellation, deadline or shutdown; lost post-dispatch responses are
`unknown`, never rollback. Oversized requests are `payload_too_large/not_started`; oversized
results are `response_too_large/completed`. Completed means execution finished, not domain
success. Correlation IDs are not durable deduplication keys. Neither process retries or
replays writes; reconcile uncertain vault state before explicit resubmission.

Startup pins canonical vault/config, enabled roots and existing directory identities.
Configuration/root replacement requires deliberate restart. Reads create no directories;
authorized creation prepares and pins a missing enabled space root lazily. A disabled
space preserves its canonical core error, rather than becoming a drift/control failure.

**Candidate topology and lifecycle.** Client → private stable Tailscale Service → userspace
Tailscale plus loopback Node adapter → explicit CONNECT proxy with verified TLS → local
Tailscale Serve → loopback Rust gateway. Both listeners enforce exact configured Host and
present Origin; missing Origin is allowed, null/foreign values are refused. No redirects,
user-selected backend URLs, wildcard CORS, public MCP route or Funnel fallback exists.
Node/Tailscale images are pinned by digest; project root is repository root and Docker
context is `services/shards-remote`. The static output is empty and daemon instances are zero.
Supervision advertises only after listener readiness and a compatible receiver probe,
removes publication on failure, and bounds shutdown/reaps children. Enrollment alone proves
no readiness. Ephemeral disk is not persistent node identity. Logs contain correlation,
grant/connector IDs, operation, status and duration, never tokens, arguments/results, bodies,
titles or host paths. CLI/stdio/app remain independent when these processes stop.

Parent: [Section index](README.md).
