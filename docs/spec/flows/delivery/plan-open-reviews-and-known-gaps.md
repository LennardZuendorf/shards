---
type: flow
updated: 2026-11-02
---

# plan: Open Reviews and Known Gaps

## Open Reviews and Known Gaps

- **`shards watch` leaks its lock on SIGINT.**
  - `run` holds the singleton `LockGuard`, and a signal skips `Drop`. An interrupted watcher
    therefore leaves the lock behind and never emits its closing `stop` event.
  - The lock self-heals on its TTL, so this is a hygiene gap, not a wedge.
  - The fix needs a signal-handling crate, because `#![forbid(unsafe_code)]` rules out a
    hand-written handler. That is a dependency change, so it waits for a decision.
    → [tech-core.md](../../tech/core/README.md) § Stack.
  - desktop-app adds a second watcher in `shards-host`. That watcher must not reuse the CLI
    singleton lock.
- **Name collision (known risk, accepted).** Crystal ships a `shards` binary; `shards` and `shard`
  are taken on crates.io and npm. The owner chose the name anyway (D1). Mitigation:
  `publish = false`, install from source or the app bundle; the trademark knockout gates 14.

Parent: [Section index](README.md).
