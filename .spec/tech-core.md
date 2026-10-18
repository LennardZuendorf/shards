---
type: tech-topic
parent: tech.md
scope: delivered core
covers: core stack, source layout, core invariants detail, performance pin, shared primitives, contracts, exit codes, error kind registry, entity fields, core risks
updated: 2026-10-16
---

# Shards core — Tech

The delivered core: the root crate `shards` (lib + `shards` CLI + `shards-mcp` stdio server). One
Rust binary over one Markdown folder. Parse, dispatch into pure domain functions that read and
write the folder directly, map one error enum onto a fixed exit code, exit. No daemon, no
database, no async runtime. Ranking is delegated to `indexed` when it is configured and present.
CLI and MCP are two thin renderers over the same domain. Every later process (`shards-host`, the
desktop app, `shards-server`) calls this crate and adds nothing to its contracts except what
[tech.md](tech.md) § Invariants records as amended. This file describes the committed code
(PR #11 merged in: note adopt/claim/release, memory `project`, the dashboard, 40 MCP tools).
Task model v2 is landed in the working tree, uncommitted, with units 8–9 and a few rules still
open; its contract lives in [features/task-model-v2/](features/task-model-v2/tech.md) until that
arc is compounded.
Per-verb behaviour: [tech-surfaces.md](tech-surfaces.md).

## Stack

| Layer | Choice |
|---|---|
| Runtime | Rust, edition 2021, `rust-version = "1.94"`, toolchain pinned `1.94.1` (`rust-toolchain.toml`; a Homebrew rustc without rustup ignores the pin — research: codebase §1). Single binary, no async runtime |
| CLI | `clap` 4 (derive) + `clap_complete` |
| Data | Markdown + `yaml-rust2` (read) + a hand-rolled canonical emitter (write); `serde_json` with `preserve_order`; `indexmap` |
| Config | `toml` (read) + `toml_edit` (format-preserving edits) |
| Time / hashing / syscalls | `chrono`, `sha2`, `rustix` (O_EXCL, flock, fstat, kill, umask) |
| Walking / watching | `walkdir`, `notify` 8 + `notify-debouncer-full` 0.6 |
| Terminal UI | `ratatui` 0.30 + `crossterm` 0.29, crossterm backend only, imported only by `src/cli/dashboard.rs` |
| Agents | Hand-rolled JSON-RPC 2.0 over stdio (no MCP SDK) |
| Search engine | `indexed` (first-party hybrid; Shards wraps its CLI) |
| Dev | `assert_cmd`, `predicates`, `tempfile`, `serial_test`; `cargo llvm-cov`, `cargo deny` |

Rejected on purpose: `regex` (five hand-written scanners, one needing a negative lookahead),
`anyhow` (exit codes are a typed contract), any MCP SDK in this crate (it would pull an async
runtime and cost byte control over the tool schemas), `mime_guess`, `insta`, `proptest`. Core code
stays small — wrapper, locks, walk, wikilinks.

**Platform.** POSIX only: `rustix` flock/kill/umask and `std::os::unix` appear in
`storage/atomic.rs`, `storage/lock.rs` and `domain/assets.rs`. macOS and Linux build; Windows does
not compile without `cfg(windows)` shims (research: codebase §2.6).

**Vault requirement.** Shards needs only a directory it can write into. No notes application need
be installed, running or detected; `shards init` creates the folder when none exists. Obsidian is
the maintainer's reference pairing, not a dependency: the notes space can *be* an Obsidian vault,
and nothing checks for one.

## Layout

```
src/
├── main.rs, lib.rs, ctx.rs      # parse -> dispatch -> exit code; module surface; invocation context
├── bin/shards-mcp.rs            # shim binary for the plugin bundle (calls shards::mcp::serve_stdio)
├── error.rs config.rs spaces.rs ids.rs timefmt.rs text.rs render.rs
├── fm/                          # frontmatter: value, load, canonical emit, doc
├── storage/                     # atomic write, O_EXCL locks, sandbox, THE walk
├── model/                       # per-space typed views + FieldOrder (note, task, memory, scratch, asset)
├── domain/                      # verbs + select/tags/owner/wikilinks/deps/activity/context/lenses
├── search/                      # route, corpus, tokenize, builtin, tagpull, indexed, health
├── cli/                         # one file per verb family + globals, out, admin, watch, dashboard
└── mcp/                         # stdio JSON-RPC server, schemas, 40-tool table, instructions
tests/                           # one per verb family + compat corpus, race, bundle, review regressions
plugins/shards/                  # Claude Code plugin: .mcp.json -> shards-mcp, skill, session hook
```

**Library seams the outer crates use** (research: codebase §2.6–2.7): `config::from_table` and
`Config::with_agent` (in-memory config, per-request identity), `mcp::tools::Server::call(name,
&Json)` (the dispatcher), `cli::out::error_envelope`. Five edges still run from non-CLI code into
`crate::cli` (`ctx.rs` → `GlobalOpts`; `mcp/tools.rs` → `GlobalOpts`, `TASK_SORT_KEYS`,
`NO_READY_TASK`; `mcp/errors.rs` → `error_envelope`; `search/health.rs` and `domain/lenses.rs` →
`watcher_pid`). They stay: `shards-host` links the whole lib, CLI module included, and builds
its envelope with `mcp::tool_error` (the CLI envelope as a string). No feature schedules cutting
them.

**Seams added for the desktop app** (delivered, additive; used only by `shards-host`):
`tasks::{delete_raw, set_body}`, `notes::{delete_raw, set_body, set_meta}`,
`memories::{forget_raw, set_body}`, `scratch::clear_raw` (each runs under the entity lock and
returns the raw bytes or the updated entity), `storage::raw::write_new` (no-clobber atomic
create), `cli::dashboard::snapshot`. `notes::set_meta(cfg, target, &[(key, Option<Value>)])`
writes non-core frontmatter keys in one locked atomic write and bumps `updated`; it refuses the
core keys (`id`, `type`, `tags`, `owner`, `claimed_by`, `created`, `updated`, `related`) and a
blank `title`.

## Invariants (detail)

Root [tech.md](tech.md) § Invariants states which of these still hold and which the Shards pivot
amends. The detail below is the delivered core contract.

1. **No daemon.** Every command reads disk directly and behaves identically whether or not any
   watcher runs. `shards watch` is an optional foreground accelerator for search freshness and
   folder reconciliation only. *(Amended at root for the app and sync processes, never for core.)*
2. **Spaces.** The vault is five configurable spaces — notes, tasks, memories, scratch, assets —
   each a folder relative to the vault root, an absolute folder, the vault root itself, or
   disabled. The sandbox is the union of the enabled roots; type/status routing is relative to a
   space root, never the vault root; folders are created lazily on first write. An omitted
   `[spaces]` table reproduces the pre-rewrite layout exactly.
3. **Derived state is never stored.** Task readiness is computed at read time from the union of
   both edge directions. No verb writes another entity's file as part of its own transaction: the
   unblock cascade is a report, and `blocks` mirrors are single-lock, one at a time, best-effort.
4. **Canonical frontmatter.** Shards reads everything the Python era wrote and writes its own
   canonical form: model-declaration key order, RFC 3339 `T…Z` timestamps for values it sets,
   unmodified scalars re-emitted from preserved raw text, no anchors, no line folding, one
   trailing newline. Unknown keys round-trip in place. Compatibility is semantic, not byte-level;
   machine JSON pins key *order*, not whitespace.
5. **One walk, one skip set.** Every scan goes through a single walk that skips dot-prefixed path
   components, nested space roots, files over 4 MiB and non-UTF-8 files, and through a single safe
   reader that yields nothing rather than failing. The **writer is bounded by the same constant**:
   a document that would exceed it is refused (exit 2) rather than written into permanent
   unaddressability.
6. **Writes are atomic and single-entity.** Temp file plus rename, preserving an existing file's
   mode; every mutation holds that entity's lock and re-resolves its target inside it; lock
   removal is always a compare-and-swap on `(dev, ino)`, never a blind unlink. Whatever the write
   commits — an edge list, a deletion predicate, a reference guard — is **recomputed inside the
   lock**: the edit is replayed against the value the locked read returns, never a result derived
   from an earlier unlocked scan. A scan may still feed a decision that needs the whole graph
   (the cycle check), never the list that gets written.
7. **Identity is validated across every space** at one core write boundary — notes, tasks,
   memories, assets and the scratch namespace. A spelling check, never authorisation; every
   identity that becomes part of a path is normalised first **and rejected when the normal form
   is empty** (exit 2), so no identity can collapse the layout it is a component of. An empty
   `--owner` reads as absent everywhere rather than landing on disk as an identity no roster,
   filter or `--mine` can match. *(Enforcement is added on the server only; see root.)*
8. **No panics on user input.** `unwrap`/`expect`/`panic` are lint-denied in the library; `main`
   catches anything that escapes and prints one line instead of a trace.
9. **Agent content is inert data**, never instructions or shell input.
10. **Core owns the interface, not the vault's history.** Core never versions or backs up; that is
    the basis for hard delete (no trash, no promised recovery) and for skipping and round-tripping
    any file or key Shards did not write. *(Amended at root: record sync becomes Shards' job in
    a separate layer; undo is app-level. Core delete stays a hard unlink.)*
11. **A shared space is not Shards' to delete.** A space may resolve to a folder the operator also
    writes (`assets = "."` puts one at the vault root), so "nothing else names this file" is not
    an ownership test. A file is Shards' exactly when its **name is one Shards itself would have
    minted**, and that test is derived as the inverse of the namer so the two cannot drift; it
    must match *this* entity's id before any unlink. Frontmatter an agent or an editor can write
    (an asset's `blob`) names a file only through that test — passing the sandbox check answers
    "inside the vault", never "mine".

## Performance

**Goal:** instant CLI. **Target:** cold start under 10 ms for a read command on a warm
filesystem. **Pin:** a wall-clock test (`tests/foundation_cli.rs`,
`a_warm_read_command_starts_under_the_cold_start_bound`) asserts the **minimum of ten** warm
end-to-end runs of the suite's own binary stays under 50 ms — min-of-N is monotone against
scheduling noise, so it is stable under CI load while still lifting on a real regression — with
~6× headroom over the measured ~7.5 ms idle floor. The same pin proves the MCP tool table is never
constructed off the MCP path and that the dashboard's TUI crates, linked but imported only by
`src/cli/dashboard.rs`, tax no other verb's startup. A full-vault scan of thousands of files in
Rust is milliseconds, which is what let the warm daemon be deleted rather than ported.

**Known hot spots for long-running callers** (research: codebase §2.6): every list is a full
disk scan; `tasks::list` with `--ready`/`--blocked` is O(n²) because `deps::readiness` rebuilds the
index per row; `Filter::default()` caps at 20 rows; `Server::ctx` reloads config on every call.
The CLI does not care; `shards-host` budgets in [tech.md](tech.md) § Performance budgets do.

**The Rust rewrite decision was reversed (2026-09).** It was shelved when the trade was a ~2–10 ms
Rust floor against a ~150–180 ms Python floor for a three-verb CLI a human invoked occasionally.
What changed is the product shape: a granular multi-space surface called by agents in hot loops
pays that floor on every call, and the daemon that used to hide it became the thing most in the
way.

## Shared primitives (DRY)

Every space is note-shaped, so each cross-cutting mechanic has **one** implementation the verb
families share — never per-verb copies: one frontmatter loader/emitter/document reader-writer;
one safe reader (yields nothing on I/O error, malformed YAML or non-UTF-8); one vault walk with
one skip set; one select engine (filter/sort/limit, generic over a typed view — every list verb
and the tag pull use it); one lock module and one atomic-write function; one CLI output surface
(mutation/rows/object emitters, notices, the delete guard, the error envelope); one error enum
whose `code()` is the exit status, mapped once in `main`.

## Contracts

| Contract | Rule |
|---|---|
| Config | `~/.shards/config.toml`. `[core]` `vault_path` + `agent`; `[spaces]` notes/tasks/memories/scratch/assets (relative path, absolute path, `"."`, or `false`; every key optional); `[search]` collection, hybrid, threshold, engine, spaces; `[tasks]` collections, strict. `vault_path` is expanded then canonicalised at the parse boundary; `path` and `tolaria_path` are permanent input aliases. Unknown tables and keys are ignored. Precedence: `--config` > `$SHARDS_CONFIG_PATH` > default; `--vault` > `$SHARDS_VAULT` > file; `$SHARDS_AGENT` > file (v2 adds `[core].me`; the full chain is owned by [product-cli.md](product-cli.md) § Configuration and identity precedence). Missing config → exit 2. `[search].threshold` applies **only when explicitly set**, on both engine branches; every `--threshold` takes a finite number (`nan`/`inf` are exit 2). `config set` writes only keys a reader consumes and parses each as that reader's own type; an unknown key or a wrong type is exit 2. |
| Rename compat (one release) | `config::env_var` reads `SHARDS_*` and falls back to the `MESH_*` spelling when the new one is unset or empty (`CONFIG_PATH`, `AGENT`, `VAULT`, `INDEXED_BIN`, `INDEXED_TIMEOUT_MS`). `config::home_path` uses `~/.mesh/<leaf>` (config, vault) only when `~/.shards/<leaf>` is absent. `mesh_*` tool names are **not** aliased. No frontmatter key or id prefix changed, so vaults need no migration. |
| IDs | `n-` / `t-` / `m-` / `a-` + Crockford base32 over `SHA-256(created_iso \0 title)`, 4+ chars, extended on collision. Asset ids digest the content instead, making the id the content address. Never sequential; existing ids are never recomputed. |
| Folders | Routing is relative to the **space root**. Notes: `note→<notes>/`, `log/decision/reference/project→<notes>/{logs,decisions,references,projects}/`, recursive. Tasks: `open\|claimed→<tasks>/open/`, `done\|cancelled→<tasks>/done/`, non-recursive. Memories: flat, never moved. Scratch: `<scratch>/<agent>/<name>.md`, both components rejected when they normalise to empty. Assets: blob plus sidecar sharing one stem; a blob is Shards' only when its name is one Shards would mint for that id (§ Invariants 11). |
| Atomic write | Temp file plus rename, mode-preserving, `fsync`ed; the destination is untouched on any failure before the rename. |
| Locks | `O_EXCL` per entity under the space's `.locks/`; stale when the PID is dead or older than 300 s; reclaim and release are `(dev, ino)` compare-and-swaps under an exclusive `flock`. `shards status` reports stale locks. The `shards watch` singleton lock is `$XDG_RUNTIME_DIR/shards-<hash12>.watch.lock`, else `~/.shards/run/`. |
| Sandbox | Every resolved path must equal or sit beneath one enabled space root. |
| Exit codes | 0 ok · 1 io/infrastructure or declined confirmation · 2 validation · 3 not found (incl. corrupt frontmatter on read/amend, foreign seed, empty `task next`) · 4 claim conflict or contended lock · 5 blocked. Codes live on `ShardsError`; `main` maps them once. |
| Error envelope | Under `--json`, one JSON object on stderr: `kind`, `message`, `next_action`, the structured fields (`task_id`, `existing_owner`, `id_or_slug`, `slug`/`ids`, `seed_id`, …), plus `candidates` on not-found and `retry_after_ms` on a lock conflict. MCP renders the identical object. A verb spanning several transactions names **what already committed** and the repair command; that wrapper changes the message only — `kind`, `code` and `candidates` read through. Consumers key on `kind`, never on `message` (messages name CLI verbs such as `shards init`). Every kind is listed in § Error kind registry. |

### Error kind registry

The one list of envelope kinds. A feature that adds a kind adds its row here first. Exit is the
CLI and stdio MCP code; HTTP is the status `shards-host` and `shards-server` return. A remote
`tools/call` failure is an `isError` result inside HTTP 200; the HTTP column then applies only
to transport-level refusals. **Delivered `shards-host` deviates:** every domain error is HTTP
422 with body `{kind: "domain", message: <envelope JSON string>}`; the guard answers 401
`unauthorized` and 403 `forbidden`; a host fault is 500 `unknown`. The per-kind HTTP column is
the planned map (desktop-app gap).

| Kind | Exit | HTTP | Owner |
|---|---|---|---|
| `validation` (incl. unknown tool: `mcp/errors.rs::unknown_tool`) | 2 | 422 | core |
| `ambiguous_slug` | 2 | 422 | core |
| `config_missing` | 2 | 503 | core |
| `not_found` (incl. corrupt frontmatter on read, foreign seed, empty `task next`) | 3 | 404 | core |
| `claim_conflict` | 4 | 409 | core |
| `lock_conflict` | 4 | 409 + `Retry-After` | core |
| `blocked` | 5 | 409 | core |
| `io_error` | 1 | 500 | core |
| `error` (declined confirmation, planned host panic guard; a partial-batch wrapper reads its inner kind through) | 1 | 500 | core |
| `conflict` (stale body hash, occupied restore target) — **planned, not built**; today an occupied restore target is `validation` | 4 | 409 | desktop-app (S2, S4) |
| `unauthorized` (missing or bad `x-shards-token`; later a bearer) | — | 401 | desktop-app (host, delivered), remote-mcp |
| `forbidden` (host: foreign `Host`/`Origin`, missing `x-shards-client`) / `insufficient_scope` | — | 403 | desktop-app (host, delivered), remote-mcp |
| `identity_mismatch` | 2 | tool error | remote-mcp |
| `not_available_remote` | — | tool error | remote-mcp |
| `workspace_encrypted` | — | 403 | remote-mcp, e2ee |
| `offline_claim` | 4 | — | sync (client, `offline_claims = "refuse"`) |
| `cursor_expired`, `cursor_ahead` | — | 410 | sync |
| `device_revoked` | — | 401 | sync |
| `upgrade_required` | — | 426 | sync |

### Entity fields

`id`, `type` (any string on read; `note|log|decision|reference|project` on Shards writes),
`title`, `tags`, `owner`, `claimed_by` (absent when never claimed, `null` after release),
`created`, `updated`, `related` — the shared base block, in declaration order. Shards-native is
the frontmatter id, never the stem: an adopted file keeps its foreign filename.

| Space | Adds (delivered) |
|---|---|
| tasks | `status` (open\|claimed\|done\|cancelled), `priority` (v1 writes `high\|normal\|low`, v2 adds `urgent` → [tech.md](tech.md) § Data Contracts; reads free-form, unknown sorts last), `claimed_by`, `project`, `blocks`, `blocked_by` — readiness derived from both directions |
| memories | `kind` (default `fact`), `scope` (default `shared`; `private` is a courtesy filter, not authorisation), `project` (optional raw string; workstream-envelope membership), `importance` (1–5, default 3), `source`, `expires`, `superseded_by` |
| scratch | `type`, `name`, `agent`, `tags`, `created`, `updated` — name-addressed, no id |
| assets | `filename`, `media_type`, `bytes`, `sha256`, `blob` on the sidecar; the blob is written first |

**Appends:** finish → `## Outcome` + timestamp; cancel → `## Cancelled` + timestamp.
**Payloads:** `render::entry` emits owned keys in declaration order, then unknown keys in file
order, then `body` (when asked), then an **absolute** `path`.

## Build order

`foundation → note → task+graph → memory → scratch → asset → search → lenses → mcp → admin/watch
→ verify` — the order the rewrite was built in, and the order to re-derive the tree in if it ever
has to be rebuilt. The live sequence is in [plan.md](plan.md).

## Risks

| Risk | Mitigation |
|---|---|
| YAML compatibility with Python-era vaults | The read side accepts every form PyYAML wrote; a byte-frozen Python-written corpus gates semantic round-trip → `tests/compat_corpus.rs` |
| Lock-semantics parity | Staleness table, the alive rule and both compare-and-swaps pinned by real multi-process race tests → `tests/race.rs` |
| `indexed` contract drift | One wrapper, byte-identical argv, machine output via the child's `INDEXED_SIMPLE_OUTPUT` env, a tolerant decode (v2 `relevance` as-is, v1 squared-L2 via `1/(1+s)`, chunks deduped), a stub-engine fixture. `shards reindex` routes update-when-exists. Ingest runs on a 600 s clock, search on 30 s; `$SHARDS_INDEXED_TIMEOUT_MS` overrides both; every clock degrades instead of failing |
| A hostile or huge file in a vault-root notes space | One walk, one skip set; the safe reader yields nothing rather than failing |
| Windows | POSIX-first; desktop targets macOS then Linux; Windows needs `cfg(windows)` lock/mode shims first |
| Untrusted content | Multi-root sandbox on every resolved path; agent content is never shell input |
| Unbounded memory growth | Nothing prunes memories by design; expiry and supersession control visibility |
| Rename churn (`mesh` → `shards`) | Plain substring replace, then grep for doubled tokens (lessons: word-boundary regex, self-referential phrase); one-release `MESH_*` / `~/.mesh` fallbacks |
