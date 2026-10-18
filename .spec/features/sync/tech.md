---
type: feature-tech
feature: sync
status: planned
sibling: product.md
parent: ../../tech.md
updated: 2026-10-15
---

# Feature: Sync — Architecture

Server-ordered, state-based record sync. Each Markdown entity is one record keyed by its
frontmatter id. The client computes local changes as `scan(files) − base`, pushes revisions,
pulls ordered revisions after its cursor, and applies them through the existing entity lock and
atomic write. The server orders accepted revisions with one per-workspace `seq`, merges
frontmatter per key (HLC LWW for scalars, three-way set merge for lists), merges bodies with
diff3 (`diffy`), arbitrates claims by compare-and-set plus lease, and keeps tombstones and
history. The pure engine (record, HLC, merge, state) lives in the root `shards` lib so the CLI
syncs without an async runtime. The server is `crates/shards-server` (axum + sqlx +
object_store).

**Parent:** [../../tech.md](../../tech.md)
**Requirements:** [product.md](product.md)
**Research:** [research.md](research.md)
**Consumer:** [../remote-mcp/tech.md](../remote-mcp/tech.md) runs tools against the server
replica defined in § Server replica.

---

## Root-spec reversals this feature carries

| Root rule today | Synced-vault rule | Why |
|---|---|---|
| Invariant 10: versioning and sync are the vault owner's job; hard delete with no recovery | Shards replicates the vault when the user opts in. Core delete stays a hard unlink; tombstones plus server history make deletes restorable | Product pivot (DECISIONS reversal 1) |
| Stack: no async runtime, no DB | The CLI stays async-free: the sync client uses blocking HTTP (`ureq`). SQLite (`rusqlite`, bundled) holds sync metadata in `.shards/sync/`, never content of record | The base store must be transactional and crash-safe |
| Claims never expire | Agent claims carry a server lease in synced vaults | No PID to check for a crashed remote agent |
| IDs: 4+ chars | New ids in synced vaults: 8+ chars, device id mixed into the hash input | 20 bits collide across offline devices |
| Identity is a spelling check | Unchanged locally. The server maps handle → member and checks "may act as" (Phase B) | DECISIONS reversal 3 |
| Root product R5 / tech principle 5: local commands never wait for sync or the network | Exception: in a synced vault, `claim`, `release` and `next` arbitrate with the server (≤ 3 s timeout, then tentative per `offline_claims`). Every other verb is unchanged | Cross-machine exclusivity needs one arbiter (R12). Root product R5 and tech principle 5 carry the same exception text |
| "Today" is `chrono::Local` | The clock function takes the zone from `Config` (`[core].timezone`, default `Local`); the server replica sets it per acting member | The replica runs on a UTC server (§ Server replica) |

---

## Files

```
src/sync/mod.rs          # run_once(), run_watch(), singleton lock, pass orchestration     ~250 LOC
src/sync/hlc.rs          # in-tree hybrid logical clock (no uhlc dep)                       ~90 LOC
src/sync/record.rs       # file <-> Record bijection; canonical hash; space-relative keys   ~300 LOC
src/sync/merge.rs        # pure merge rules; shared verbatim with shards-server             ~400 LOC
src/sync/state.rs        # .shards/sync/state.sqlite: bases, cursor, HLC, pending claims    ~350 LOC
src/sync/scan.rs         # changeset = scan(walk) - base, stat fast path                    ~200 LOC
src/sync/apply.rs        # apply remote revision under entity lock + atomic write           ~250 LOC
src/sync/claims.rs       # ClaimArbiter trait + HttpArbiter, tentative claims, lease renew  ~220 LOC
src/sync/conflicts.rs    # .shards/conflicts/<id>/<rev>.md store, resolve                   ~150 LOC
src/sync/transport.rs    # trait Transport + ureq impl (blocking, rustls)                   ~250 LOC
src/sync/creds.rs        # keychain (keyring crate) + 0600 file fallback                    ~100 LOC
src/cli/sync.rs          # `shards sync` command group                                      ~300 LOC
crates/shards-host/src/sync_loop.rs   # hosts run_watch on a blocking thread; emits sync events
crates/shards-server/                 # axum server (see § Server)
tests/sync_*.rs                       # bijection goldens, merge table, apply races, simulator
```

Root `Cargo.toml` adds, behind the **non-default** feature `sync`: `rusqlite` (bundled), `ureq` 3
(rustls), `diffy` 0.5, and `keyring` 4.2 (the root tech.md pin) with `default-features = false`
and only `apple-native-keyring-store`, `windows-native-keyring-store` and
`zbus-secret-service-keyring-store` (pure-Rust D-Bus, no `libdbus-sys`); headless Linux uses the
0600 file fallback (§ Security). A plain `cargo build` / `cargo install --path .` compiles none of
them. Release builds, `scripts/install.sh`, `crates/shards-host` and `crates/shards-server` enable
`sync` explicitly. Without the feature, `shards sync …` exits 2 "this build has no sync support".
CI gates: `cargo build --no-default-features`, and `cargo tree -p shards --no-default-features`
must list none of the four crates. The startup pin is measured on both builds.

---

## Contract / API

### Record (wire and state form)

```jsonc
{
  "key": "t-7KQ2M9XA",              // frontmatter id; scratch: "scratch:<agent>/<name>"
  "kind": "task",                   // note | task | memory | scratch | asset
  "space": "tasks",
  "rev": 42, "base_rev": 41,        // server rev; base the edit was made against
  "fields": {                       // every frontmatter key, per-key stamp
    "status":   {"v": "done", "hlc": "01JA…"},
    "priority": {"v": "urgent", "hlc": "01JA…"},
    "tags":     {"add": ["q4"], "rm": ["later"], "hlc": "01JA…"}
  },
  "body": {"hash": "sha256:…", "text": "…"},        // or {"hash", "blob": "sha256:…"} over 256 KiB
  "path_hint": "projects/alpha.md",                // notes only, space-relative
  "deleted": false,
  "device": "d_…", "actor": "lennard",             // actor = handle written; server adds member
  "e2ee": null                                      // reserved: {fields_ct, body_ct} (e2ee, #23)
}
```

Keys are never vault paths. Tasks carry no path (folder derives from merged `status` +
local `[spaces]`). Memories are flat. Assets: sidecar is a record; blob is content-addressed.

### HLC

`hlc = <physical_ms:13 digits>-<counter:4 hex>-<device_id>`, string-comparable. Local tick:
`max(now, last.physical)`; receive: standard Kulkarni merge. External edit detected late:
`physical = max(file_mtime, last.physical)` when `file_mtime ∈ [base_synced_at, now]`, else
`now`. Server clamps any stamp more than 300 s ahead of server time to server time and returns
`warnings: ["clock_skew"]` (R17).

### Local state: `.shards/sync/`

```
.shards/sync/state.sqlite   # WAL mode
.shards/sync/.lock          # singleton (reuses the watch.rs lock + TTL touch pattern)
.shards/sync/dirty          # touched by mutating verbs as a nudge; never required
.shards/conflicts/<id>/<rev>.md
```

```sql
meta(k TEXT PRIMARY KEY, v TEXT)          -- workspace_id, device_id, last_seq, hlc, server_url, schema
entities(key TEXT PRIMARY KEY, kind, space, local_rel_path, base_rev INT,
         base_fields TEXT /*json {k:{v,hlc}}*/, base_body_hash, size INT, mtime_ns INT, ino INT,
         content_hash, conflict INT, tombstoned_at TEXT NULL)
bodies(hash TEXT PRIMARY KEY, text TEXT)   -- base bodies, GC'd when unreferenced
pending_claims(key TEXT PRIMARY KEY, claimant, mode /*tentative|confirmed*/, created_at)
```

The base is the outbox: no op queue exists, so a crash cannot lose a pending change (R4).
Every base update commits in the same transaction as the cursor advance. Tombstoned bases keep
their body for 30 days to serve offline restore. Credentials are never stored here.

`[sync]` config table (per machine, in `~/.shards/config.toml`):

```toml
[sync]
server = "https://sync.shards.app"   # or self-host URL
workspace = "ws_…"                     # written by `shards sync setup`
spaces = ["notes", "tasks", "memories", "assets"]   # scratch off by default (R15)
offline_claims = "tentative"           # | "refuse"   (R12)
agent_lease_s = 1800                   # per-vault default, server is authoritative (R13)
```

### HTTP API (`/v1`, JSON over TLS, bearer token `aud=https://<host>/api`)

| Method + path | Purpose | Response |
|---|---|---|
| `POST /v1/ws/{ws}/push` | `{device, client_seq, revisions:[Record]}`; idempotent on `(device, client_seq)` | per record `{key, status: accepted\|merged\|conflict\|rejected\|remap\|tombstoned, rev, merged?: Record, remap?: {id}, reason?}`, plus `seq`, `warnings` |
| `GET /v1/ws/{ws}/pull?since={seq}&limit=500` | ordered revisions after `seq`, ACL-filtered (Phase B) | `{revisions:[Record], seq, more}`; `410 cursor_expired` beyond retention; `410 cursor_ahead` after server restore |
| `GET /v1/ws/{ws}/snapshot` | bootstrap; NDJSON stream of current visible records | trailer line `{seq}` |
| `GET /v1/ws/{ws}/notify` | SSE poke; `data: {"seq":N}` only; heartbeat 25 s | — |
| `POST /v1/ws/{ws}/claims/{key}` | `{op: claim\|release\|renew, expect: null\|handle, claimant, lease_s?}` | `200 {claimed_by, lease_until, rev}` · `409 {holder, lease_until}` |
| `HEAD/PUT/GET /v1/ws/{ws}/blobs/{sha256}` | content-addressed blobs, scoped to one workspace; `HEAD`/`GET` answer only when an entity in `ws` references the hash (else `404`, same as absent); hosted `GET` returns 307 to a presigned URL | `PUT` verifies sha256 |
| `GET /v1/ws/{ws}/entities/{key}/history` | revisions for history/restore | `[{rev, seq, hlc, actor, device, deleted, fields_delta}]` |
| `POST /v1/ws/{ws}/entities/{key}/restore` | `{rev?}` → new revision from history | Record |
| `GET /v1/ws/{ws}/conflicts` / `POST …/conflicts/{key}/resolve` | list / resolve `{take: mine\|theirs\|text}` | — |
| `GET/DELETE /v1/devices[/{id}]` | list / revoke devices (R19) | — |
| `POST /v1/auth/device` + `POST /v1/auth/token` | device authorization grant (RFC 8628) for the CLI | tokens |
| `GET /v1/auth/authorize` | auth code + PKCE S256, loopback redirect, for the desktop app | — |

Errors use the existing envelope (`kind`, `message`, `next_action`, `retry_after_ms`). Versioning:
`Shards-Sync-Version: 1` header; mismatch → `426 upgrade_required`.

### `shards sync` command group (CLI surface, all new)

| Command | Behaviour | Exit |
|---|---|---|
| `shards sync setup [--server URL] [--workspace ID]` | device-code login, attach or create workspace, snapshot up or down, double-sync guard | 0 / 1 / 2 |
| `shards sync --once` | one pass: scan → push → pull → apply | 0, 1 on transport error |
| `shards sync --watch` | `notify` events + SSE poke + 60 s periodic full scan; singleton | runs until SIGINT |
| `shards sync status [--json]` | state, unsynced, conflicts, foreign-file count (R18) | 0 |
| `shards sync conflicts [--json]` · `shards sync resolve <id> --take mine\|theirs\|file <path>` | R8 | 0 / 3 |
| `shards sync history <id>` · `shards sync restore <id> [--rev N]` | R10 | 0 / 3 |
| `shards sync devices [--revoke ID]` · `shards sync logout` | R19 | 0 |
| `shards sync agents [--revoke ID]` · `shards sync token create\|list\|revoke` | added by [remote-mcp](../remote-mcp/tech.md) in the same file | 0 |

`shards sync` with flags and subcommands uses clap `args_conflicts_with_subcommands`. All
subcommands are proposed surface growth pending owner sign-off (product Open Questions).

---

## Implementation Detail

### Client pass (`run_once`)

1. Take `.shards/sync/.lock` (exit 1 "sync already running (pid, host)" when held).
2. **Scan.** Walk the synced spaces with `storage::walk`. Fast path: `(size, mtime_ns, ino)` equal
   to base → unchanged. Else parse → canonical emit → `sha256`; equal to `content_hash` →
   refresh stat tuple only (R5). Else diff the parsed map key by key against `base_fields`;
   stamp changed keys with a fresh HLC. Files without an id in a notes space are counted as
   foreign and skipped (R15).
3. **Push** changed records in batches of 200 with `base_rev`. Apply each response:
   `merged` → write merged record locally (step 5 path); `conflict` → keep server text, store the
   local body in `.shards/conflicts/`, set `conflict=1`; `remap` → rename id (below);
   `tombstoned` → move file to `.shards/conflicts/`; `rejected` (Phase B ACL) → same as view-only.
4. **Pull** `since=last_seq` until `more=false`.
5. **Apply** each revision. First run record validation (§ Security); a failing record is skipped,
   logged with its key and seq, and counted in `shards sync status` as `rejected_records`. Derive
   the path from `key` + `space` only and pass it through `safe_resolve` against that one space's
   root. Then take the entity lock from `storage::lock`, re-resolve the path, re-read.
   If the canonical hash ≠ base hash, a local writer raced: run `merge::merge(base, local,
   remote)` and mark the result for the next push. Write via `storage::atomic`. On a status
   change, write the new path first, then unlink the old path under the same lock. Commit the
   base row and `last_seq` in one SQLite transaction.
6. Release the lock. `--watch` loops on `notify` debounce (500 ms), SSE poke, the `dirty` nudge or
   a 60 s timer; reconnect uses exponential backoff 1 s → 5 min with full jitter.

<!-- merge -->
### Merge rules (`src/sync/merge.rs`, identical on client and server)

| Field class | Rule |
|---|---|
| Scalars: `title`, `type`, `status` (except into or out of `claimed`), `priority`, `due`, `deadline`, `recur`, `recur_from`, `parent`, `section`, `order`, `completed`, `project`, `owner`, `kind`, `scope`, `importance`, `source`, `expires`, `superseded_by`, memory/asset scalars | LWW by `(hlc, device_id)` |
| Sets: `tags`, `related`, `blocks`, `blocked_by` | `(base ∪ addsA ∪ addsB) − (rmA ∪ rmB)`; output order = base order, then additions sorted |
| `claimed_by` | Never LWW. A change against base is a claim intent → server CAS (§ Claims) |
| `status` into or out of `claimed` | Part of the claim intent: goes through the claim CAS together with `claimed_by`, never through LWW |
| `updated` | Recomputed as the max field HLC's wall time; never merged on its own |
| `id`, `created` | Immutable. Same id with a different `(created, title)` = collision (§ Id collisions) |
| Unknown keys | LWW per key; round-trip preserved |
| Body | `diffy::merge(base, server, incoming)`. Clean → accept. Conflict → server text stays, incoming stored as conflict revision, `conflict` flag set. No markers are ever written |
| Post-merge validation | Same model validators as local writes; a dependency cycle or a > 4 MiB document turns the merge into a conflict, never a write. `status == claimed` ⇔ `claimed_by` non-null; a violation resolves to the server's claim state (`entities.claimed_by`) |

Recurring finish on two devices: both set `due` to the same next occurrence from the same base
and `status: open`; `completed` differs and resolves by LWW, so the replicas converge (R6).
Concurrent finish (status) and claim: the server claim CAS refuses a terminal task, matching the
local no-op rule.
<!-- /merge -->

### Claims (R12, R13)

- **Arbiter seam.** Domain functions stay pure. `domain::tasks::claim`/`release` and the note
  claim/release take an `Option<&dyn ClaimArbiter>` (`src/sync/claims.rs`):
  `fn arbitrate(&self, key, op, expect, claimant) -> Result<Arbitration, ShardsError>`.
  Implementations: `HttpArbiter` (ureq, CLI and `shards-host` when `[sync]` is set),
  `InProcessArbiter` (`shards-server` workspace actor; used by remote MCP and the lease sweeper),
  and `None` (no `[sync]`: today's local `O_EXCL` behaviour, unchanged).
- **Online.** With `HttpArbiter`, a claim verb never holds the entity lock across the network
  call. Order: 1) read the base `claimed_by` and `status` without the lock; 2) call
  `POST /claims/{key}` with `expect = base claimed_by` and a 3 s timeout; 3) take the entity lock,
  re-resolve and re-read. If `claimed_by` or `status` changed since step 1, call `op: release` for
  the server claim (best-effort) and exit 4 naming the current holder; else write.
  `200` → write the file with the returned `rev` recorded as base (no re-push). `409` → write the
  holder locally and exit 4 with `holder`. Timeout or no network → `offline_claims`:
  `tentative` writes locally, records `pending_claims(mode=tentative)`, output carries
  `claim: "tentative"`; `refuse` exits 4 `kind: offline_claim`.
- **Push of a `claimed_by` change** (editor edit, tentative claim) is a CAS with `expect` = base
  value. A mismatch rewrites the local file to the server holder and emits "claim lost to X".
- **Lease.** Server sets `lease_until = now + agent_lease_s` when the claimant's member kind is
  not `human` (unknown handles count as agents). Any accepted revision by the holder on that key,
  or a same-claimant claim, renews. Renewal does not depend on pushes: when `[sync]` is set, any
  local write by the claim holder to the claimed entity (append, update; scratch excluded) calls
  `HttpArbiter` `op: renew` when `lease_until − now < agent_lease_s / 2`, best-effort with a 1 s
  timeout, independent of any sync process. `shards task claim` by the same claimant always
  renews. The client caches `lease_until` in `pending_claims`. A server sweeper (every 30 s)
  releases expired leases as a normal revision (`claimed_by: null`, `status: open`, activity
  `claim_expired`). Human claims have `lease_until = NULL`.

### Deletes and tombstones (R9, R10)

A local delete is detected as "base row exists, file missing" and pushed as `deleted: true`.
Server rules, checked in order:

1. Delete with `base_rev < current rev` where the newer revisions changed content → **edit
   wins**; entity survives, activity `delete_superseded`.
2. Delete against current rev → tombstone (`deleted`, `tombstone_until = now + history window`,
   minimum 90 days).
3. Push of a create/edit for a tombstoned key from a device with no base or `base_rev ≥ delete
   rev` → `tombstoned`; client moves the file to `.shards/conflicts/` and prints the restore hint.
4. A device with an unchanged base pulls a tombstone → unlink under the entity lock.

### Id collisions (R14)

On create, if `key` exists with a different `(created, title)` the server returns
`remap: {id: <key + 1+ chars>}`, chosen globally unique. The client, under the entity lock,
rewrites `id`, renames the file when the name embeds the id, and rewrites references in its own
unpushed records (`blocks`, `blocked_by`, `related`, `parent`, `[[wikilinks]]`). Prevention:
`ids::generate_id` takes a `min_len` (8 when `[sync]` is set) and mixes `device_id` into the
hash input when synced. Existing ids are never recomputed.

### Assets (R16)

Sidecar = record. Blob: `HEAD /v1/ws/{ws}/blobs/{sha}` → `PUT` only when absent in that
workspace. Deduplication is per workspace, never across workspaces, so a hash probe reveals
nothing about other tenants and each workspace's blobs can use its own data key. Apply writes the
blob first, then the sidecar (existing rule). Blob cap: 100 MiB per file in Phase A.

### Selective spaces and visibility (R15, R20)

Client-side: only `[sync].spaces` are scanned and applied; pulled records for disabled spaces are
skipped but tracked so a later opt-in starts from the cursor. Server-side (Phase B): each entity
has a `visibility` derived on accept — `workspace`, `private:<member>` (private memories, synced
scratch). Pull and snapshot filter by the caller's member and sponsored agents.

### Server (`crates/shards-server`)

| Concern | Choice |
|---|---|
| HTTP | `axum` 0.8, `tower-http` 0.7 (trace, limits, CORS off for `/v1`) |
| Runtime | `tokio`; domain calls via `spawn_blocking` |
| DB | `sqlx` 0.8, Postgres (hosted) and SQLite (self-host), one migration set |
| Blobs | `object_store` 0.14: S3/R2 hosted, local FS self-host; key `ws/{ws_id}/blobs/{sha[0..2]}/{sha}` |
| Auth (first-party) | ES256 JWT (`jsonwebtoken`), argon2 passwords for self-host, upstream OIDC (`openidconnect`) on hosted |
| Observability | `tracing` + OTLP; content never logged |
| Rate limits | `governor`: 60 push/min and 600 pull/min per device; 10 auth attempts/min per IP |

```sql
members(id, workspace_id, account_id NULL /*humans*/, handle, kind /*human|agent*/,
        sponsor_member_id NULL, role, timezone NULL /*IANA*/, created_at, disabled_at,
        UNIQUE(workspace_id, handle))
accounts(id, email, password_hash NULL, created_at)            -- humans; members.account_id
workspaces(id, name, mode /*standard|e2ee*/, seq BIGINT, history_days INT, timezone /*IANA*/)
devices(id, member_id, workspace_id, name, last_seen, last_seq, revoked_at)
entities(workspace_id, key, kind, space, rev, deleted, tombstone_until, fields JSONB, body_hash,
         path_hint, conflict, claimed_by, lease_until, visibility, PRIMARY KEY(workspace_id, key))
revisions(workspace_id, seq, key, rev, base_rev, member_id, device_id, hlc, fields_delta JSONB,
          body_hash, deleted, merged_from JSONB, PRIMARY KEY(workspace_id, seq))
bodies(workspace_id, hash, text, PRIMARY KEY(workspace_id, hash)) -- or blob ref when large
blobs(workspace_id, sha256, size, PRIMARY KEY(workspace_id, sha256))  -- per-workspace blob index
conflicts(workspace_id, key, rev, losing_fields JSONB, losing_body_hash, resolved_by, resolved_at)
push_receipts(device_id, client_seq, response JSONB, PRIMARY KEY(device_id, client_seq))
refresh_tokens(hash PRIMARY KEY, aud /*api|mcp*/, family_id, device_id NULL /*api*/,
               grant_id NULL /*mcp, added by remote-mcp*/, expires_at, used_at)
```

Push transaction: lock the workspace counter row (`SELECT … FOR UPDATE` / SQLite `BEGIN
IMMEDIATE`), merge each record, insert revisions with `seq = seq + 1`, update `entities`, store
the receipt, commit, then publish `seq` to the notify fan-out (in-process broadcast; Postgres
`LISTEN/NOTIFY` when more than one node).

Commands: `shards-server serve --db <url> --blobs <url> --public-url <url> --data <dir>`,
`shards-server admin create-user <email>`, `shards-server migrate`. Self-host is one binary with
SQLite + local FS.

<!-- merge -->
### Server replica

Each active workspace has a materialized vault at `<data>/ws/<ws_id>/vault/`, owned by a
single-writer workspace actor (tokio task + mpsc). The actor applies every accepted revision to
the replica through the same `sync::apply` path, so the replica is a normal Shards vault. Server-
side writers (remote MCP tools, the lease sweeper) run the unchanged domain functions against the
replica inside the actor, then commit the resulting file diff through the same merge path as
device `d_server`. Domain date logic reads "today" only through the clock function
(`timefmt::today_in(cfg)`, zone carried in `Config`, default `Local`). The replica `Config` for
each server-side call carries the acting member's `timezone`, else the workspace `timezone`
(`[core].timezone` in the replica config), else UTC; the lease sweeper uses the workspace zone.
Cold start rebuilds the replica from `entities` + `bodies`. One workspace is
pinned to one node (consistent hashing on `ws_id`). A `Store` trait is introduced only if the
actor becomes a bottleneck.
<!-- /merge -->

### Failure modes

| Failure | Behaviour |
|---|---|
| Crash between file rename and base commit | Next scan: file hash equals the remote content → base refreshed, nothing pushed |
| Crash mid-push | Retry with the same `(device, client_seq)` returns the stored receipt |
| Server unreachable | Backoff 1 s → 5 min; status `offline · N unsynced`; local verbs unaffected |
| Access token expired | Refresh; refresh `invalid_grant` → status `signed out`, sync paused |
| Device revoked | `401 device_revoked`; sync stops; local files untouched |
| Cursor beyond retention / server restored from backup | `410` → re-bootstrap: snapshot, three-way merge against local bases, unknown bases become conflict copies |
| Merged document over 4 MiB, or cycle | Conflict instead of write |
| Two sync processes | Singleton lock; second exits 1 |
| Vault inside another sync tool | Setup warning; `.shards/` ignore rules documented |
| Disk full during apply | Atomic write fails before rename; base not advanced; retried next pass |
| Schema version mismatch | `426 upgrade_required` with the minimum client version |

### Security

- TLS only (HSTS on hosted). Access JWT 15 min, ES256, `aud=https://<host>/api`; refresh token
  30 days, rotated on use with reuse detection (revokes the family).
- Credentials in the OS keychain (`keyring`); headless Linux falls back to
  `~/.shards/credentials.toml` mode 0600 with a warning.
- Every endpoint checks device not revoked + member of `ws`. `path_hint` must be relative, have no
  `..`, and resolve inside the space; violations are `rejected`.
- **Record validation.** Pulled records are untrusted input (Phase B: written by other members).
  Server push (→ `rejected`, `reason: invalid_record`) and client apply (→ skipped, § Client
  pass step 5) MUST reject a record unless all hold:
  - `key` matches `^[ntma]-[0-9A-HJKMNP-TV-Z]{4,52}$` (Crockford, uppercase; 52 = a full
    SHA-256 in base-32), and its prefix agrees with `kind` and `space` (`n` note/notes,
    `t` task/tasks, `m` memory/memories, `a` asset/assets);
  - or `key` is `scratch:<agent>/<name>` with `kind: scratch`, `space: scratch`, where both parts
    are non-empty fixed points of the core `slugify` (`[a-z0-9]` runs joined by `-`; so no `/`,
    `.`, `..` or leading dot);
  - `remap.id` passes the same grammar with the same prefix as the original key;
  - every frontmatter value passes the same model validators as a local write.
  The on-disk path is derived from `key` + `space` (+ validated `path_hint` for notes) only, then
  passed through `safe_resolve` against that one space's root, never the union of enabled roots.
- Blobs are workspace-scoped (§ Assets): routes under `/v1/ws/{ws}`, storage keys prefixed
  `ws/{ws_id}/`, reads authorized only when an entity in `ws` references the hash. Blob `PUT`
  verifies the sha256; record size cap 4 MiB (same constant as the writer).
- Hosted: disk encryption at rest plus per-workspace data keys in a KMS. Logs carry keys and
  sizes, never content.
- `workspaces.mode = e2ee` is reserved; the record's `e2ee` slot keeps the wire format open.

## Performance Budget

| Path | Budget |
|---|---|
| No-change pass, 5,000 entities, stat fast path | ≤ 150 ms CPU |
| Push → poke → pull → apply, one edit, same region | p95 ≤ 5 s end to end; server push handling p95 ≤ 50 ms |
| Snapshot upload, 5,000 entities, no assets, 50 Mbit/s | ≤ 60 s |
| Claim CAS round trip | p95 ≤ 300 ms; client timeout 3 s |
| CLI startup pin | unchanged on both the default and the `--features sync` build |

## Verification strategy

- **Convergence simulator** (seeded, in-tree, no `proptest`): N replicas + server + K agents doing
  field edits, body edits, key-reordering rewrites, moves, deletes, claims, offline windows and
  clock skew. Invariants: byte-identical convergence; no lost edit (final state or conflict
  copy); at most one confirmed claimant; no duplicate ids on disk; every task in its routed
  folder; `status == claimed` ⇔ `claimed_by` non-null on every replica; no agent lease expires
  while its holder writes the claimed entity at least once per `agent_lease_s / 2` with no sync
  process running; no file written outside its record's own space root. CI runs 1,000 seeds;
  nightly 10,000.
- Golden tests for the record ↔ file bijection over the compat corpus.
- Unit and simulator cases for traversal and mismatched keys (`m-../tasks/open/t-XXXX`,
  `scratch:../../x/y`, `scratch:.hidden/a`, a `t-` key with `space: memories`, a traversal
  `remap.id`): server returns `rejected`, client skips, no file is written.
- Cross-tenant blob test: a device in workspace B gets `404` on `HEAD`/`GET` of a hash stored
  only in workspace A.
- Timezone test: finish a `FREQ=DAILY` task over the replica at 23:30 Europe/Berlin on a UTC
  server; next `due` is the Berlin tomorrow.
- Fault injection between rename and base commit.
- Race tests: concurrent CLI writers during apply (extend `tests/race*`); a local write that
  changes `claimed_by` or `status` between server arbitration and the claim's locked write → the
  server claim is released and the verb exits 4.

## Open Questions

1. **`ureq` vs a minimal `tokio` runtime inside `shards sync --watch` for SSE** — ureq streaming
   reads suffice for SSE; revisit only if reconnect handling grows complex.
2. **Word-level fallback merge** for single-line paragraph conflicts — measure the conflict rate
   in dogfood first (product metric ≤ 0.5%).
