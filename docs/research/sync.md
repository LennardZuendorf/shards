# Shards: remote sync and remote MCP research

Research date: 2026-10-15. Scope: sync for a Markdown-folder-as-truth app. The writers are a Tauri desktop app, the `shards` CLI, agents (local MCP and remote MCP), external editors (Obsidian, VS Code, vim), and a hosted server. The repo was read without edits (`mesh/` at `villain/mesh-improvements`).

---

## 0. Recommendation

**Build a server-ordered, state-based record sync. Do not build a CRDT-first sync.**

1. **Sync unit.** One *entity* per Markdown file, keyed by frontmatter `id` and never by path. Scratch files have no id, so they are keyed by `<agent>/<name>`. Asset blobs are content-addressed.
2. **Frontmatter.** Frontmatter is parsed into a map. Scalar keys merge as **per-key LWW registers with Hybrid Logical Clock (HLC) stamps**. List keys (`tags`, `related`, `blocks`, `blocked_by`) merge as **three-way set merges against the base**.
3. **Body.** The body merges as a **three-way line merge (diff3) against the last-synced base**, the same approach as Obsidian Sync. A conflict that cannot be merged never puts markers into the file. The losing side is kept as a *conflict revision*. The UI, CLI and MCP all show it.
4. **Ordering.** The server orders all accepted revisions with a per-workspace monotonic `seq`, the Linear model. Clients pull `changes?since=seq`. A WebSocket or SSE "poke" signals that new changes exist.
5. **Claims.** A claim is a server-arbitrated **compare-and-set plus a lease**, not LWW. This replaces the local-only `O_EXCL` claim for synced workspaces.
6. **Local state.** Sync metadata lives in `.shards/sync/` (SQLite: base snapshots, per-key HLCs, cursor). Files stay clean, plain Markdown. The existing walk already skips dot-paths, so this sidecar is invisible to every scan.
7. **Runtime.** Sync is an optional *agent*, not a daemon requirement. Three hosts can run it: the desktop app in-process, `shards sync --watch` in the foreground, or `shards sync --once` from cron. A singleton lock (reused from `mesh watch`) keeps it to one per vault. Local verbs stay correct when no sync agent runs.
8. **Server.** Rust: `axum` + `tokio` + `sqlx` (Postgres hosted, SQLite self-hosted) + `object_store` (S3, R2, GCS or local FS) + `rmcp` 3.x (Streamable HTTP) for the remote MCP. The remote MCP runs the **same domain code** against a server-side materialized replica of the workspace. Local and remote agent semantics are therefore identical.
9. **Real-time co-editing** of note and task bodies inside the app is a later phase. Use **Loro** session documents bound to CodeMirror or ProseMirror. These documents collapse back into the file on save and into the same revision log. CRDT is not the storage-of-record.
10. **E2EE** is a per-workspace mode and is deferred. It conflicts with the remote MCP, server-side search and server-arbitrated claims. Do not hand-roll it.

Why: every write by an agent, the CLI or an external editor reaches sync as a *whole-file change*. A CRDT that ingests whole-file diffs merges at about diff3 quality. It also adds a second history store that can drift from the file, plus format lock-in. Automerge's own docs say that `updateText` "will produce results which don't merge as well as directly capturing the user input actions" ([docs.rs Transactable::update_text](https://docs.rs/automerge/latest/automerge/transaction/trait.Transactable.html), [automerge.org text docs](https://automerge.org/docs/reference/documents/text/)). Linear, the reference multiplayer task tool, uses a server-ordered sync id with LWW properties and uses CRDTs only for issue descriptions ([fujimon.com](https://www.fujimon.com/blog/linear-sync-engine), [reverse-linear-sync-engine](https://github.com/wzhudev/reverse-linear-sync-engine)).

---

## 1. Constraints from the current mesh codebase

Each constraint below is a hard input to the design.

| # | Constraint | Source | Consequence for sync |
|---|---|---|---|
| C1 | "**Mesh owns the interface, not the vault** — versioning, sync and backup are the vault owner's job." | `mesh/.spec/tech.md:102-104`, `.spec/product.md:123` | **Shards supersedes this invariant.** New wording: *"The file is the source of truth; Shards may replicate it. Sync is optional, lives in `.shards/`, and never changes what a local verb does."* The spec must be amended in the same change that adds sync. |
| C2 | Hard delete: "no trash, no promised recovery" is justified by C1. | `tech.md:103` | With sync, a stale replica **resurrects** deleted files. This needs server-side **tombstones keyed by id** and a delete-vs-edit policy (§5.9). The server revision history also gives a trash/restore feature. |
| C3 | Tasks move folders on status: `open\|claimed → <tasks>/open/`, `done\|cancelled → <tasks>/done/`. | `tech.md:154` | **Path is not identity.** A path-keyed sync (Syncthing, Dropbox, Obsidian Sync) turns every `finish` into delete+create, and concurrent edits then duplicate the task. The key is the `id`. The path is derived locally from the merged status and the local space config (§5.2). |
| C4 | Two separate mechanisms. (a) The per-entity `O_EXCL` lock under `.locks/` makes the claim's read-check-write atomic. That *lock* goes stale after a dead PID or 300 s. (b) The *claim* itself is `claimed_by` in frontmatter and **never expires** today. Exit 4 on a claim conflict. | `tech.md:156-158`, `src/domain/tasks.rs:396-425` | Atomicity is **local only**. LWW on `claimed_by` lets two agents on two machines both "win". A synced claim needs a **server CAS** (§5.8). Agent claim **leases** are a *new* synced-mode behaviour, not a port of the lock staleness rule. |
| C5 | IDs are `prefix + Crockford32(SHA-256(created_iso \0 title))`, minimum **4 chars**, **extended on collision against local files only**. | `src/ids.rs:1,41-75`, `tech.md:153` | Two devices that mint ids offline can collide. 4 chars is only 20 bits. Cron agents that create same-titled tasks in the same second collide deterministically. The server must detect *same id, different create-identity* and force a remap (§5.10). New ids in synced workspaces should use ≥ 8 chars. |
| C6 | Canonical frontmatter: mesh re-emits its own key order and timestamp form. Unknown keys round-trip. "Compatibility is semantic, not byte-level." | `tech.md:79-83` | Byte-level diffs produce false conflicts: an external editor reorders keys, then mesh rewrites them. **Merge on the parsed map, never on bytes.** Hash *canonicalized* content for change detection. |
| C7 | One walk with one skip set: dot-prefixed components, files over 4 MiB, non-UTF-8. The writer refuses anything over 4 MiB. | `tech.md:84-89`, `src/storage/walk.rs:8,27,51` | `.shards/` (sync DB, conflict copies, base snapshots) is invisible to all scanners **for free**. Conflict copies must **never** be siblings inside a space: a `foo (conflicted copy).md` holds the same `id` and creates duplicate entities. A merge result must also respect the 4 MiB cap. |
| C8 | Writes are atomic (temp + rename, fsync, mode-preserving) and single-entity. They are taken under the entity lock and re-resolved inside it. | `tech.md:86-93`, `src/storage/atomic.rs`, `src/storage/lock.rs` | The sync agent applies remote revisions **through the same lock + atomic write**, re-reading inside the lock. This is how sync coexists with concurrent CLI and MCP agents (§5.7). |
| C9 | Derived state is never stored: readiness comes from both edge directions, and the unblock cascade is only a report. | `tech.md:73-76` | Good for sync: there is no derived state to replicate. `blocks` mirrors are best-effort single-entity writes, so they merge as sets per entity. |
| C10 | "No daemon." `mesh watch` is an optional foreground accelerator with a **singleton lock**. | `tech.md:65-68`, `src/cli/watch.rs:1-29`, `.spec/product.md:53` | The sync agent reuses the watch singleton-lock pattern. One sync agent per vault, whether the app or the CLI hosts it (§12). |
| C11 | Identity is "a spelling check, never authorisation". `agent` comes from config or `$MESH_AGENT`. `owner` and `claimed_by` are free strings. | `tech.md:94-100` | Multiplayer needs a **handle → principal** mapping per workspace, enforced server-side (§7). The files keep human-readable handles. |
| C12 | Scratch is `<scratch>/<agent>/<name>.md`, name-addressed, no id. Memories are flat and never moved. Assets are blob + sidecar, and the asset id is the content digest. | `tech.md:154,171-174` | Scratch key = `(agent, name)`, single-writer per agent, so LWW is fine. Memories key by id. Asset blobs are immutable and dedupe in object storage by sha256. |
| C13 | Spaces can be relative, absolute, `"."`, or disabled. They are configured **per machine**. | `tech.md:69-72` | Sync must transmit **space-relative** paths tagged with a space kind, never vault-relative or absolute paths. Each replica routes into its own layout. |

The UI reference (`obsidian-taskui`) has no sync code. It relies on Obsidian's vault, so it offers no prior art here.

---

## 2. Requirements derived for Shards sync

- R1 **File is truth.** Any process can edit any file at any time without the app running. Sync discovers changes by scan and hash, not by event capture.
- R2 **No silent loss.** Every concurrent edit survives, either merged or as a retrievable conflict revision.
- R3 **Structured task semantics.** Concurrent `status` / `priority` / `due` / `tags` edits merge per field. Claims are exclusive across machines.
- R4 **Offline-first.** Everything works offline. Claims are tentative while offline (§5.8).
- R5 **Multiplayer.** Workspaces have members (humans and agents), roles, scoped sharing and an activity history.
- R6 **Remote MCP over OAuth** sees the same data and semantics as local MCP.
- R7 **Self-hostable** as a single binary. Hosted multi-tenant uses Postgres + S3.
- R8 **No daemon required** for correctness (C10).
- R9 **Cheap** in steady state. Scans of thousands of files take milliseconds (`tech.md` § Performance). Sync must not rescan blobs needlessly.

---

## 3. Options compared

### 3a. CRDT per document (Automerge, Yjs/yrs, Loro)

Model: each Markdown file has a CRDT doc, with a map for frontmatter and a text object for the body. The CRDT is persisted beside the file. Remote ops apply to the CRDT and the file is re-rendered from it. External file edits are ingested by diffing the new file against the CRDT text (`update_text` / `LoroText::update`).

| | **Automerge** (Rust `automerge` 0.12.0, JS 3.5.0) | **Yjs / yrs** (`yrs` 0.28.0) | **Loro** (`loro` 1.16.2) |
|---|---|---|---|
| Core language | Rust core, JS via WASM | JS reference (Yjs); yrs is a Rust port | Rust-native, JS via WASM, Swift |
| Status 2026 | Automerge 3 (Jul 2025): runtime columnar compression, memory "over 10x" lower ("Moby Dick … 700Mb → 1.3Mb"), same file format as v2 ([blog](https://automerge.org/blog/automerge-3/)). Active releases ([releases](https://github.com/automerge/automerge/releases)) | Steady releases (0.27→0.28, Sep 2026); "a single contributor accounts for most of its recent work" ([inspect.software](https://inspect.software/software/y-crdt/y-crdt), [crates.io](https://crates.io/crates/yrs)) | 1.0 stable encoding (2024). Frequent 1.x releases; recent changelog shows convergence/correctness fixes between JS and Rust ([releases](https://github.com/loro-dev/loro/releases)) |
| Frontmatter + body | Map + Text in one doc | Y.Map + Y.Text | LoroMap + LoroText (+ MovableList, MovableTree, Counter) |
| Ingest whole-file external edit | `update_text` (Myers diff → splices). Merges worse than captured keystrokes ([docs](https://docs.rs/automerge/latest/automerge/transaction/trait.Transactable.html)) | No built-in; diff it yourself | `LoroText::update` (Myers, slow > ~50k chars) and `update_by_line` + `timeout_ms` ([docs.rs](https://docs.rs/loro/latest/loro/struct.LoroText.html)) |
| Text algorithm | RGA-family | YATA | Fugue (no interleaving anomalies), Eg-walker-based ([Loro 1.0](https://www.loro.dev/blog/v1.0)) |
| Sync stack in Rust | `samod` 0.15 (automerge-repo in Rust): "experimental … don't use this anywhere serious yet" ([README](https://github.com/alexjg/samod/blob/main/README.md)). Subduction and Keyhive coming ([I&S dispatch 014](https://www.inkandswitch.com/newsletter/dispatch-014/)) | y-sync protocol in `yrs::sync`, awareness | Build your own over `export(from=version)` / `import`; EphemeralStore for presence |
| Editor bindings (Tauri webview) | automerge-codemirror / prosemirror | Most mature ecosystem (y-codemirror, y-prosemirror, TipTap) | Official `loro-codemirror` and `loro-prosemirror` (TipTap-compatible), with cursors and undo ([Loro text docs](https://loro.dev/docs/tutorial/text)) |
| E2EE roadmap | Best: Keyhive + BeeKEM + Beelay "able to synchronize end-to-end encrypted payloads that a server cannot decrypt" ([Keyhive](https://www.inkandswitch.com/project/keyhive/)). Still pre-alpha/unaudited ([notebook 04](https://www.inkandswitch.com/keyhive/notebook/04/)); PRs merging mid-2026 ([PR #208](https://github.com/inkandswitch/keyhive/pull/208)) | None built-in | None built-in |
| Size | Benchmarks: larger updates for map-heavy workloads ([Loro perf](https://www.loro.dev/docs/performance)) | Smallest updates in most benches | Middling. Shallow snapshots trim history |

**Closest prior art.** **darn** (Ink & Switch) is a Rust CLI that maps a directory to Automerge docs. Text gets a character-level CRDT and binaries get LWW. It detects changes with a BLAKE3 hash, syncs over Subduction, and offers `darn watch` ([GitHub](https://github.com/inkandswitch/darn/), [docs.rs darn_core](https://docs.rs/crate/darn_core/latest)). **teamtype** (formerly Ethersync) is a Rust Automerge daemon. It ingests offline file changes by diffing with `dissimilar` and applying the delta, which is exactly the "external edit" path ([docs.rs teamtype](https://docs.rs/teamtype/latest/src/teamtype/document.rs.html)). Both are research-grade. Neither covers tasks, permissions or OAuth.

**Verdict for Shards storage-of-record: no.**
- External writes (the majority here: agents, the CLI and editors) arrive as whole-file diffs. Merge quality is then roughly diff3, and you pay a permanent history store per file.
- The CRDT state becomes a second source of truth beside the file. Divergence bugs (file edited, CRDT not updated, or the reverse) are a new failure class.
- Server-side semantics are awkward in CRDTs: claim exclusivity, permission checks per field, validation, the remote MCP reading tasks as rows.
- Rust sync stacks are not production-grade for Automerge (`samod` self-described experimental). yrs has a bus factor of about one.
- **Yes for live co-editing later** (§13). Loro is the pick: Rust-native core shared by the Tauri backend and the webview, official CodeMirror/ProseMirror bindings, a diff-ingest API, stable format.

### 3b. File-level versions + three-way merge (Obsidian Sync, Syncthing, Dropbox, iCloud)

- **Obsidian Sync.** Markdown conflicts merge with Google diff-match-patch. Other files use "last modified wins". JSON settings merge by key. Since 1.9.7 users can choose "Create conflict file" ([help](https://obsidian.md/help/sync/troubleshoot)). The headless client's algorithm is `merged = patch_apply(patch_make(diff(base, local)), remote)`. Conflict detection is "remote hash ≠ synchash recorded at last sync" ([DeepWiki obsidian-headless](https://deepwiki.com/obsidianmd/obsidian-headless/3.1-sync-modes-and-conflict-strategies)). Known failure: notes auto-created on two devices (daily notes, Templater) can lose the local version.
- **Syncthing.** Per-file **version vectors** detect concurrency. A real content conflict renames the older-mtime file to `.sync-conflict-<date>-<time>-<device>.<ext>`, and that file then propagates as a normal file. In modify-vs-delete, if the delete wins, the modified file becomes a conflict copy ([docs](https://docs.syncthing.net/users/syncing.html), [forum](https://forum.syncthing.net/t/version-vector/14594)).
- **Dropbox.** Never merges. It creates `(… conflicted copy …)` files. A separate "**view-only conflict**" folder is used when someone edits a file they may only view ([conflicted copy](https://help.dropbox.com/organize/conflicted-copy), [view-only conflict](https://help.dropbox.com/share/view-only-conflict)).
- **iCloud Drive.** Exposes conflicts as `NSFileVersion` unresolved versions that a coordinated app must resolve. Non-coordinated apps typically see duplicated files. *(General platform knowledge, not re-verified this session.)*

**Lessons kept:** a base hash per file, three-way merge for Markdown, conflict copies as the fallback, modify beats delete, version history as the safety net. **Lessons rejected:** path identity (breaks C3), sibling conflict files inside spaces (breaks C7, duplicate ids), whole-file LWW for task metadata (loses concurrent field edits), mtime as the arbiter (clock skew).

### 3c. Git-based sync

- Strengths: full history, free hosting, diff3, human-auditable, and developers already trust it.
- Weaknesses for this product:
  - There is no native git on iOS or Android. The JS reimplementation (isomorphic-git) is "very unstable", "may crash on clone/pull", has no SSH and limits repo size ([obsidian-git](https://github.com/Vinzent03/obsidian-git)). Criss-cross histories from multi-device use raise `MergeNotSupportedError` ([PR #1097](https://github.com/Vinzent03/obsidian-git/pull/1097)).
  - Conflict markers in YAML frontmatter make the mesh safe reader yield *nothing* for that file (`tech.md` § Shared primitives: "yields nothing on … malformed YAML"). A task silently disappears from every listing.
  - Commit noise from agents in hot loops. There is no per-field semantics, no server-arbitrated claims and no permissions finer than a repo.
  - Multiplayer access control means a git host per workspace.
- **Verdict:** not the sync engine. Ship a **git export/backup** integration later (`shards backup git`), because developer users will ask for it.

### 3d. Structured-record sync (frontmatter as per-key LWW with HLC) + three-way merge for bodies

- Linear: transactions are executed **on the server**, which assigns a monotonically increasing **sync id**. Clients keep `lastSyncId`, request deltas, and receive delta packets over WebSocket. Conflicts resolve by **last-writer-wins**. Offline transactions queue locally. Sync groups enforce access ([reverse-linear-sync-engine](https://github.com/wzhudev/reverse-linear-sync-engine/blob/main/SUMMARY.md), [marknotfound](https://marknotfound.com/posts/reverse-engineering-linears-sync-magic/), [Linear talk](https://www.youtube.com/watch?v=Wo2m3jaJixU)). Linear uses CRDTs only for issue descriptions ([fujimon.com](https://www.fujimon.com/blog/linear-sync-engine)).
- Per-field LWW with HLC: Kulkarni et al. hybrid logical clocks give a timestamp that is causally monotonic and close to wall time, with a deterministic node-id tiebreak. Rust crates: `uhlc` 0.9.0 and `crdt-kit` (LWWRegister/LWWMap on HLC) ([crdt-kit docs](https://docs.rs/crate/crdt-kit/latest)). The known trade-off is that per-field LWW does not merge *inside* a nested object, and wall-clock skew biases wins ([taladb CRDT guide](https://github.com/thinkgrid-labs/taladb/blob/main/docs/guide/crdt-sync.md)).
- Body three-way merge in Rust: `diffy::merge(original, a, b)` is diff3-style and returns either merged text or conflict-marked text ([docs.rs diffy](https://docs.rs/diffy/latest/diffy/)). `diffy` 0.5.2 and `similar` 3.2.0 are both current.

**Verdict: chosen.** It fits a file-truth model, because state-based diffing against a stored base needs no keystroke capture. It gives tasks per-field semantics and makes server-side permissions, claims and remote MCP straightforward. Body merge quality matches Obsidian Sync, which users already accept.

### Scorecard (5 = best)

| Criterion | 3a CRDT | 3b file-level | 3c git | **3d record + 3-way** |
|---|---|---|---|---|
| File stays truth / external editors | 3 | 5 | 4 | **5** |
| Task field-level merge | 5 | 1 | 2 | **5** |
| Exclusive claims, server rules, permissions | 2 | 1 | 1 | **5** |
| Body merge quality (external edits) | 3 | 3 | 3 | **3** |
| Body merge quality (live co-editing) | 5 | 1 | 1 | 2 → **5 with phase-4 Loro** |
| Remote MCP over the same data | 2 | 2 | 2 | **5** |
| Mobile feasibility | 4 | 4 | 1 | **5** |
| Rust maturity of the pieces | 3 | n/a | 4 | **5** (axum/sqlx/diffy/uhlc) |
| E2EE path | 4 (Keyhive, future) | 4 | 3 | 3 |
| Implementation risk | 2 | 4 | 3 | **4** |

---

## 4. The trade-off that decides the architecture

With the file as truth, there are only two kinds of writes:

1. **Coarse writes**: CLI verbs, local MCP tool calls, external editors, other sync tools, `git checkout`. Sync only ever sees `(base, new_file)`. Every algorithm, CRDT included, reduces to diffing these two states. A CRDT adds history, not merge quality.
2. **Fine writes**: keystrokes in the Shards editor while another person or agent edits the same body. Only here does a CRDT beat diff3 (character-level, intention-preserving, cursors, no conflicts).

Kind 1 is about 100% of agent traffic and most human traffic in a task app. Kind 2 is a small, latency-sensitive slice. So the **record + 3-way** model is the storage and sync of record, and a **Loro session layer** is added later for kind 2 only. This is Linear's split: LWW records plus a CRDT for descriptions.

---

## 5. Recommended architecture

### 5.1 Components

```
 ┌─────────── device (desktop / CLI host) ───────────┐        ┌──────────── shards-server ────────────┐
 │ vault/ (Markdown, the truth)                      │        │ axum router                            │
 │   notes/ tasks/open tasks/done memories/ scratch/ │  HTTPS │  /v1/sync/*   push, pull, blobs, poke  │
 │   assets/  .locks/                                │◀──────▶│  /mcp         rmcp StreamableHttp      │
 │ .shards/sync/state.sqlite  (bases, HLCs, cursor)  │  WS/SSE│  /oauth/*, /.well-known/*  (AS or IdP) │
 │ .shards/conflicts/<id>/<rev>.md                   │        │ sqlx → Postgres | SQLite               │
 │ shards-core (domain, fs store, sync engine)       │        │ object_store → S3/R2/GCS/FS (blobs)    │
 │ hosts: Tauri app │ shards sync --watch │ --once   │        │ workspace actors + server replica dir  │
 └───────────────────────────────────────────────────┘        └────────────────────────────────────────┘
```

- **`shards-core`** (lib crate): the existing mesh domain plus a new `sync` module. It is pure and synchronous like today. The network layer sits behind a trait so the CLI stays free of async (`tech.md` rejects an async runtime for the CLI). `shards sync` can run its own small runtime only when invoked, or use blocking `ureq`. The desktop and server use tokio.
- **`shards-server`** (bin): the sync API, the remote MCP, auth, and per-workspace actors.
- **`shards-desktop`** (Tauri): links `shards-core` directly and hosts the sync loop while open.

### 5.2 Entity model and identity

| Space | Sync key | Path on apply | Notes |
|---|---|---|---|
| tasks | frontmatter `id` (`t-…`) | derived from merged `status` via local routing (`open/` or `done/`) | path is **never** synced for tasks |
| notes | `id` (`n-…`) | `space_rel_path` field (LWW), routed under the local notes root | notes may live in user subfolders |
| memories | `id` (`m-…`) | flat, from id/slug | `scope` field later drives sharing |
| scratch | `scratch:<agent>/<name>` | `<scratch>/<agent>/<name>.md` | single-writer per agent; private by default (§7) |
| assets | sidecar `id` (`a-…` = content digest) + blob `sha256` | minted name (Invariant 11 inverse namer) | blob immutable, upload-once to object storage |
| foreign `.md` (no id) | `path:<space>/<rel_path>` | same path | phase 2; whole-entity is "body only" |
| foreign non-md | `path:` key, LWW + conflict copy | same path | phase 2+, size-capped |

An entity revision on the wire looks like this:

```jsonc
{
  "entity": "t-7KQ2M9XA", "kind": "task", "space": "tasks",
  "rev": 42, "base_rev": 41,                // server rev this edit was made against
  "fields": { "status": {"v":"done","hlc":"…"}, "tags": {"set_ops":{"add":["q4"],"rm":[]}, "hlc":"…"} },
  "unknown_keys": { "x-foo": {"v": …, "hlc": "…"} },   // round-trip keys mesh does not model
  "body": { "base_hash": "sha256:…", "text": "…" },     // or {"blob": "sha256:…"} when large
  "path_hint": "notes/projects/foo.md",                 // notes/foreign only, space-relative
  "deleted": false, "actor": "p_…", "device": "d_…"
}
```

### 5.3 Local sync state: `.shards/sync/state.sqlite`

Each tracked entity has a row holding:
- `entity_key`, `space`, `local_rel_path`
- the **base**: last-synced canonical frontmatter map + body text, or its hash plus content in a CAS dir
- `base_rev`
- per-key `hlc`
- the fast-path stat tuple `(size, mtime_ns, inode)`
- `content_hash`

Globals: `workspace_id`, `device_id`, `last_seq`, the HLC state, and the auth token reference (stored in the OS keychain, not in the DB).

The base *is* the outbox. Local changes are computed as `scan(files) − base`, so there is no separate op queue that a crash can lose. This is the property that makes "file is truth" safe: if the app dies mid-sync, the next scan re-derives the pending changes.

### 5.4 Change detection

1. **Scan** with the existing single walk. The fast path compares `(size, mtime, inode)` with the base. On a mismatch, hash the **canonicalized** content (parse → canonical emit → sha256), so a pure key reorder by an editor is *not* a change (C6).
2. When the desktop app runs, `notify` events (already a dependency) trigger targeted rescans. Periodic full scans remain the correctness backstop.
3. **HLC stamping for external edits.** The HLC is assigned at *detection* time, because external writers do not stamp. Use `physical = max(file_mtime, last_hlc.physical)` when `file_mtime` is in `[base_sync_time, now]`. This approximates edit time for offline edits detected late. Otherwise use `now`. Document this rule: "your offline edit counts as of when you saved it, if the filesystem clock is sane".
4. Diff the parsed frontmatter map **key by key** against the base. Only changed keys get new HLC stamps. Body changes are detected by hash.

### 5.5 Merge rules (server-side, deterministic, mirrored on the client)

| Field class | Rule |
|---|---|
| Scalars (`title`, `status`, `priority`, `due`, `project`, `importance`, `kind`, `expires`, …) | LWW by `(hlc, actor_id)` |
| `claimed_by` | **server CAS** (§5.8), never LWW |
| Sets (`tags`, `related`, `blocks`, `blocked_by`, `superseded_by` if list) | three-way set merge: `result = (base ∪ adds_A ∪ adds_B) − (rm_A ∪ rm_B)`, where adds/rms are computed against each side's base |
| `updated` | recomputed as max of the merged field HLCs, never merged on its own |
| `created`, `id` | immutable after creation; conflicting values = id collision (§5.10) |
| Unknown keys | LWW per key (round-trip guarantee, C6) |
| Body | `diffy::merge(base, server, incoming)`. Clean → accept. Conflict → server text stays authoritative; the incoming body is stored as a **conflict revision**; the entity is flagged `conflict` |
| Append sections (`## Outcome`, `## Cancelled`) | Typical concurrent appends merge cleanly under diff3. If not, they fall into the conflict path above |
| Status vs folder | status is a field; folder is derived on apply, so concurrent finish + edit never duplicates |

Validation runs **after** merge, through the same model validators as local writes. A merge whose result is invalid becomes a conflict instead of being written. Examples: a cycle introduced by two concurrent `block` edits, which `tech.md` says is checked against the whole graph, or a document over 4 MiB. Cycles are a *workspace-level* invariant, so the server is the right place to check them.

### 5.6 Protocol

HTTP/JSON (later CBOR) over HTTPS. A WebSocket or SSE `poke` channel tells clients to pull.

| Endpoint | Purpose |
|---|---|
| `POST /v1/ws/{ws}/push` | `{client_seq, device, revisions:[…]}`. Each revision carries `base_rev`. Fast-forward if `base_rev == current`, else merge per §5.5. Response: per-entity `{accepted, rev, merged?, conflict?, remap?}` plus the new `seq` |
| `GET /v1/ws/{ws}/changes?since={seq}&limit=` | ordered revisions after `seq`, ACL-filtered (sync groups) |
| `GET /v1/ws/{ws}/snapshot` | bootstrap: current state of all visible entities + `seq`, streamed (Linear's bootstrap/delta split) |
| `PUT/GET /v1/blobs/{sha256}` | content-addressed blobs. Presigned URLs to object storage when hosted. `HEAD` first for dedupe |
| `POST /v1/ws/{ws}/claims/{id}` | claim CAS + lease (§5.8); also `release`, `renew` |
| `GET /v1/ws/{ws}/poke` (WS/SSE) | `{"seq": N}` notifications only; no payload, no secrets |
| `GET /v1/ws/{ws}/entities/{id}/history` | revisions for restore and diff UI |

The client loop is `scan → push(local changes) → pull(changes since last_seq) → apply → update bases`. It is idempotent: replaying a push with the same `(device, client_seq)` returns the same result.

### 5.7 Applying remote revisions safely (coexistence with local agents)

For each incoming revision:
1. Take the entity's `.locks/` lock with the existing lock module (C8). Re-resolve the target path inside the lock.
2. Re-read the file. If its canonical hash ≠ base hash, a local writer changed it since the last scan. Run the §5.5 merge locally (base, local, remote), write the result, and enqueue it for push.
3. Write with temp + rename (`storage::atomic`). On a status change, write the new path first, then unlink the old path under the same lock. This is the existing move discipline, applied to remote moves.
4. Update the base row in the same SQLite transaction as the cursor advance, which is crash-safe.

External editors with open buffers (VS Code, Obsidian) see the file change and reload. The residual TOCTOU window between the hash check and the rename is the same one mesh already accepts for editors that do not take mesh locks.

**Read-only membership.** A viewer whose local CLI writes to a synced file gets a Dropbox-style **view-only conflict**. The server rejects the revision, the local edit moves to `.shards/conflicts/`, and the file reverts. Do not let the write silently diverge ([Dropbox](https://help.dropbox.com/share/view-only-conflict)).

### 5.8 Claims: server-arbitrated CAS + lease

- In a synced workspace, `task claim` = `POST /claims/{id} {expect_claimed_by: null | self, lease_s: 1800}`. The server takes a row lock on the entity, checks `claimed_by` and lease expiry, sets `claimed_by`, `claimed_at` and `lease_until`, and emits a revision. On a lost race it returns `409` with the current holder. That maps to **exit 4** and the existing error envelope with `retry_after_ms`.
- **Online (default for agents):** a claim needs a server ack. This is the only way to give agents the mutual exclusion mesh promises today.
- **Offline:** the claim is written locally as **tentative**: `claimed_by: me` plus a `.shards/sync` marker. The UI shows a hollow claim badge. On reconnect it is pushed as a CAS. If it loses, the local file is rewritten to the winner, and a notification plus activity entry says "claim lost to X". Agents can choose `--require-online` (recommended default for MCP tool calls in synced workspaces).
- **Lease** for agents (a **new rule** for synced workspaces): agent claims expire unless renewed (`task heartbeat`, or implicitly on any write to the task). Today a claim never expires, and only the `.locks/` *lock* has PID/300 s staleness. Leases exist because a crashed remote agent would otherwise hold a task forever with no local PID to check. The synced-mode spec must state this explicitly. Humans' claims stay lease-less by default (`lease_s: null`), which matches today's semantics.
- `release`, `finish` and `cancel` are idempotent, as today, and validate that the caller holds the claim or is an admin.
- The remote MCP calls the same CAS in-process, so remote agents get exclusivity for free.

### 5.9 Deletes and tombstones

- A delete is a revision with `deleted: true` and an HLC. The server keeps tombstones ≥ 90 days, longer than any plausible offline window. A replica offline beyond that must re-bootstrap.
- **Edit beats delete.** If a delete and an edit are concurrent (neither causally after the other, per `base_rev`), the entity survives, and the delete is recorded in the activity log as "delete superseded by X's edit". This mirrors Syncthing's guarantee that the modified content survives.
- When a file's id is tombstoned on the server, the client picks one of three cases, checked in this order:
  1. **Has a base row, `base_rev` < delete rev, and the file changed since the base:** this is a concurrent edit, so *edit beats delete*. The push resurrects the entity as a new revision, and the activity log records the superseded delete.
  2. **Has a base row and the file is unchanged since the base:** the client applies the tombstone locally on pull (unlinks the file under its lock). It pushes nothing.
  3. **No base row, or `base_rev` ≥ the delete rev:** the file was re-introduced, for example by a backup restore, a copy from another vault, or a stale replica that re-bootstrapped. The **resurrection guard** fires: the server rejects the push as `tombstoned`, the client moves the file to `.shards/conflicts/`, and the user is told ("restored copy kept, use `shards restore` to bring it back").
- The server history turns "hard delete, no recovery" (C2) into "hard delete locally, restorable from history for N days". This is a product upgrade.

### 5.10 Id collisions across devices

- Server check: on create, if `id` exists with a different `(created, title, creator device)`, return `remap: {id: new_id}`. The client renames its local entity under its lock. It extends the id by one char, the same rule as `ids.rs:41`, but chosen by the server to be globally unique. It also rewrites references in *its own unpushed* entities (`blocks`, `related`, wikilinks `[[t-…]]`) in the same pass.
- Prevention: in synced workspaces new ids use **≥ 8 Crockford chars** (40 bits), and the device id is mixed into the hash input. Existing ids are never recomputed, which keeps `tech.md:153`.

### 5.11 Assets

- The blob is content-addressed (`sha256`). Upload once with `HEAD`-then-`PUT` dedupe. The sidecar syncs as an entity. Apply writes the blob first, then the sidecar, which is today's rule.
- Large binaries go straight to object storage via presigned URLs. Selective sync can leave blobs remote until opened ("download on demand", phase 3).

### 5.12 Foreign files (no mesh id)

Phase 2: key `.md` files without an id by `path:`. Treat the whole file as body (three-way merge). A rename looks like delete + create unless a similarity heuristic links them (same content hash). Non-Markdown foreign files use LWW + conflict copy, size-capped. Many users' notes spaces are Obsidian vaults, so this matters for adoption, but it is not needed for the task MVP.

---

## 6. Server stack (Rust)

| Concern | Choice | Notes |
|---|---|---|
| HTTP | `axum` 0.8 + `tower` | rmcp's `StreamableHttpService` "is a Tower service — mount it on any router" ([rust-sdk](https://github.com/modelcontextprotocol/rust-sdk)) |
| Runtime | `tokio` | server and desktop only; the CLI stays sync |
| DB | `sqlx` with **Postgres** (hosted) and **SQLite** (self-host single binary) | One schema, two backends. A per-workspace `seq` comes from a counter row updated in the push transaction, which serializes writers per workspace (fine at team scale) |
| Blobs | `object_store` 0.14 (S3, R2, GCS, Azure, local FS) | content-addressed keys `blobs/{sha256[0..2]}/{sha256}` |
| MCP | `rmcp` 3.5.x, Streamable HTTP | implements MCP **2026-07-28**; serves 2026-07-28 clients **statelessly** (SEP-2567: no `Mcp-Session-Id`), legacy clients via `legacy_session_mode` ([crates.io rmcp](https://crates.io/crates/rmcp)). Stateless fits horizontally scaled axum |
| Merge | `diffy` 0.5 (`merge`), `similar` for UI diffs | |
| Clocks | `uhlc` 0.9 or a 60-line HLC in-tree | mesh's "small deps" culture suggests in-tree |
| Push notifications | axum WebSocket or SSE | payload = `seq` only |
| Observability | `tracing` + OTLP | |

**Schema sketch:**

```
principals(id, kind: human|agent|service, handle_default, created_at)
identities(principal_id, provider, subject)                 -- OIDC subjects for humans
workspaces(id, name, mode: standard|e2ee, seq bigint, created_by)
members(workspace_id, principal_id, handle, role, scopes jsonb, UNIQUE(workspace_id, handle))
devices(id, principal_id, workspace_id, name, last_seen, last_seq)
entities(workspace_id, key, kind, space, rev, deleted, tombstone_until,
         fields jsonb /* {k:{v,hlc,actor}} */, body_hash, path_hint, conflict bool,
         claimed_by_principal, lease_until, sync_group, PRIMARY KEY(workspace_id,key))
revisions(workspace_id, seq, key, rev, base_rev, actor, device, hlc, fields_delta jsonb,
          body_hash, merged_from jsonb, PRIMARY KEY(workspace_id, seq))
bodies(hash, text | blob_ref)                               -- dedup body texts
conflicts(workspace_id, key, rev, losing_body_hash, losing_fields, resolved_by, resolved_at)
oauth_clients / grants / refresh_tokens (if embedded AS)
audit_log(...)
```

**Remote MCP = server replica.** The mesh domain reads and writes a folder directly (`tech.md` § Invariants 5–6). The fastest correct path to a remote MCP is to give each active workspace a **materialized vault directory on the server**, owned by a single-writer **workspace actor**. A remote tool call (`task_next`, `task_claim`, `memory_recall`, `search`) runs the *unchanged* domain functions against that directory, under the same locks. The actor's sync engine then commits the file diff as a revision, exactly like a desktop replica (with claim CAS done in-process).
- Benefits: 100% semantic parity with local MCP, no domain rewrite, and server-side search reuses the built-in engine.
- Scaling: pin workspace actors to nodes (consistent hashing) and rebuild the directory from Postgres on cold start.
- Long-term: introduce a `Store` trait (`FsStore`, `DbStore`) only when the actor model becomes the bottleneck.

---

## 7. Identity, workspaces, sharing, permissions

- **Principals.**
  - *Human*: OIDC login.
  - *Agent*: owned by a human or by the workspace. It acts through a token bound to `(agent principal, workspace, scopes)`.
  - *Service*: CI/cron, which uses client credentials or a PAT.
  - *Device*: a sync client install, not a principal. It is bound to a principal and used for audit, HLC node id and revocation.
- **Handles.** Frontmatter keeps human-readable handles (`owner: lennard`, `claimed_by: flights-agent`). The file stays truth and readable. The server maps `handle → principal` per workspace (`members.handle`, unique). On push, the server checks that the principal may *act as* the handle it writes:
  - A principal claims only as itself.
  - Assigning `owner` to another member is allowed for editors.
  - An agent token may write only its own scratch namespace.
  - An unknown handle in `owner` is allowed but flagged as unknown (keeps C11's "an empty owner reads as absent").
- **Local config.** `[core].agent` / `$MESH_AGENT` becomes the *default handle* for that device's CLI and local MCP. In synced workspaces it must match a member handle that the device's token can act as. On a mismatch, the CLI refuses with exit 2 and a `next_action`.
- **Workspaces.** One workspace = one synced vault (a set of spaces). A device can attach several vaults to several workspaces.
- **Roles.** `owner`, `admin`, `editor`, `commenter`, `viewer`. Agents get `editor` or a **scoped** role. Scopes: `tasks:read`, `tasks:write`, `tasks:claim`, `notes:read`, `notes:write`, `memories:read`, `memories:write`, `scratch:own`, `assets:read`, `assets:write`, `admin`.
- **Per-space policy.**
  - `scratch` is **private to the owning agent** by default (synced to the owner's devices, invisible to others). It can be shared.
  - `memories` default to workspace-visible. The existing `scope` field (`m-…` memories) maps to sync groups later (`scope: private|project:x|workspace`).
- **Sharing a subset (Phase 3+).** Use Linear-style **sync groups**: each entity belongs to groups (workspace, project:X, private:principal), and pull is filtered by the caller's groups ([reverse-linear SUMMARY](https://github.com/wzhudev/reverse-linear-sync-engine/blob/main/SUMMARY.md)). Moving an entity between groups is a revision. Clients that lose access receive a "drop" action and delete their local copy, after moving it to `.shards/conflicts/` if it has unpushed edits.
- **Audit.** Every revision records the principal, the device and the MCP client id (from the OAuth token). The activity feed ("flights-agent finished t-… via Claude Code") comes straight from revisions. That is the core of the "multiplayer for humans and agents" story.

---

## 8. OAuth and remote MCP

**Spec target.** The current MCP authorization spec is **2026-07-28** ([spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)):
- The MCP server is an OAuth 2.1 **resource server**.
- It **MUST** publish Protected Resource Metadata (RFC 9728) with `authorization_servers`.
- It must answer unauthenticated requests with `401` + `WWW-Authenticate: Bearer resource_metadata=…, scope=…`.
- Clients and AS **SHOULD** support **Client ID Metadata Documents (CIMD)**. **Dynamic Client Registration is now "deprecated and retained for backwards compatibility"**.
- RFC 8707 resource indicators are required, and the server **MUST** validate token audience.
- RFC 9207 issuer identification is newly listed.
- Compared with 2025-11-25 ([spec](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), [den.dev](https://den.dev/blog/mcp-november-authorization-spec/)), the direction is CIMD-first.

**What rmcp gives you.** Server side: the Streamable HTTP transport plus access to `http::request::Parts` inside tool handlers, so the axum auth middleware can inject the authenticated principal ([docs.rs StreamableHttpService](https://docs.rs/rmcp/latest/rmcp/transport/streamable_http_server/tower/struct.StreamableHttpService.html), [auth example](https://github.com/modelcontextprotocol/rust-sdk/blob/main/examples/servers/src/simple_auth_streamhttp.rs)). rmcp's OAuth module (PKCE, PRM discovery, CIMD, DCR, refresh) is **client-side** ([OAUTH_SUPPORT.md](https://github.com/modelcontextprotocol/rust-sdk/blob/main/docs/OAUTH_SUPPORT.md)). That is useful for `shards` itself connecting to *other* MCP servers, and for testing. **You still need an authorization server.**

**Open decision: embed an AS or delegate to an external IdP.**

| | Embedded AS in `shards-server` | External IdP (managed auth provider with MCP/CIMD support) |
|---|---|---|
| Self-host story | single binary, works offline-LAN | needs an IdP account or a self-hosted IdP (e.g. Keycloak/Authentik) |
| Effort/risk | must implement authorize/token/refresh rotation, CIMD fetch with SSRF guards, PKCE, consent UI, revocation — security-critical | low code; vendor must support CIMD + RFC 8707 audience binding (verify per vendor) |
| Agent identity binding | full control (consent screen: "act as agent handle X in workspace Y with scopes …") | need custom claims or token exchange |
| Recommendation | **self-host edition**: minimal embedded AS, humans log in via upstream OIDC (GitHub/Google) or local password | **hosted edition**: delegate, if a vendor passes a CIMD + audience conformance test; otherwise embedded AS |

No Rust AS crate is recommended here because none was verified for CIMD in this session. Evaluate candidates before committing.

**Token → principal binding.**
- The consent screen picks *workspace* and *acting handle*: "your own handle", or "agent `research-bot` owned by you".
- The token carries `sub` (human), `act` (agent principal, RFC 8693-style actor claim), `ws` and `scope`. The resource server checks the audience (`aud` = canonical MCP URL) and maps `act` or `sub` to the member handle used for writes.
- Headless agents (cron, CI) use the client-credentials grant with a pre-registered client, or a workspace-scoped PAT for self-host.
- The sync API (`/v1/*`) uses the **same AS and tokens** with different scopes (`sync`). The desktop app does auth-code + PKCE with a loopback redirect. The CLI uses the **device authorization grant** (`shards login`).

**Remote MCP tool surface** is the same 37-tool table as local (`tech.md` layout `mcp/`), plus multiplayer tools: `members_list`, `activity_feed`, `conflicts_list`, `conflict_resolve`, `claim_renew`. Tools return the same error envelope as local (exit codes become `kind`). The stateless Streamable HTTP mode means each request carries auth, and any node can serve any request once workspace actors are addressable.

---

## 9. End-to-end encryption feasibility

**It conflicts with the core value proposition.** A hosted MCP that answers `task next`, `search` and `memory recall`, arbitrates claims, validates merges and checks cycles needs **plaintext on the server**. E2EE workspaces can therefore *not* offer:
- the remote MCP
- server-side agents and automations
- server search
- the web app without client-side decryption
- server-side merge

Merges would have to run on clients. That is possible, because the merge is deterministic and clients hold bases, but conflicts would surface later.

**Bespoke E2EE goes wrong even at well-resourced teams.**
- Trail of Bits' 2025 audit of Obsidian Sync found a high-severity weak-randomness bug that "could allow an attacker to recover encrypted files". It also found metadata leakage, and noted that "the Sync protocol does not sufficiently achieve the expected security guarantees" ([audit PDF](https://obsidian.md/files/security/2025-Obsidian-TrailofBits-Sync-Audit.pdf)).
- Cure53's 2024 audit flagged key-separation problems ([audit PDF](https://obsidian.md/files/security/2024-Obsidian-Cure53-Sync-Audit-Full.pdf)).
- Obsidian documents that path↔content mapping and device metadata are not E2EE ([security](https://obsidian.md/help/sync/security)).

**Multi-member group keys are the hard part.** Keyhive/BeeKEM is a CGKA designed for this. It is still described as early and pre-audit, with PRs landing in mid-2026 ([Keyhive](https://www.inkandswitch.com/project/keyhive/), [notebook 06](https://www.inkandswitch.com/keyhive/notebook/06/), [PR #208](https://github.com/inkandswitch/keyhive/pull/208)). MLS (RFC 9420) via a maintained Rust implementation is the other candidate.

**Recommendation.**
- Ship **standard mode** first: TLS + encryption at rest + per-workspace data keys in a KMS, plus an honest privacy page.
- Design the wire format so a later **E2EE "private workspace" mode** is possible:
  - The server sees opaque `body_ciphertext` and `fields_ciphertext`, and keeps plaintext only for `entity key`, `rev`, `hlc`, `deleted` and (optionally) `claimed_by_principal`.
  - Merge happens client-side.
  - The remote MCP is disabled, while the local MCP still works.
- Adopt an audited group-key protocol (MLS or Keyhive once audited) and never a custom one. Target Phase 5 at the earliest.
- A cheaper alternative for privacy-sensitive users is **self-hosting** the single-binary server.

---

## 10. Offline behaviour

| Action offline | Behaviour |
|---|---|
| Create, edit, finish, cancel, tag, block | Fully local. Pending changes = scan − base. Status bar shows "N unsynced" |
| Claim | **Tentative** claim badge. Agents with `--require-online` get exit 4 `kind: offline_claim` + `next_action`. Confirmed or reverted on reconnect, with a notification on loss |
| Delete | Local hard delete. A tombstone is pushed on reconnect. Edit-beats-delete may resurrect it, and the UI says so |
| Remote MCP | Unavailable (server side); local MCP unaffected |
| Long offline (> tombstone retention) | Forced re-bootstrap. Local unpushed edits are three-way merged against the snapshot. Unknown bases go to conflict copies |
| Clock skew | HLC bounds the damage. If a push's HLC physical part is more than 5 minutes ahead of server time, the server **clamps** it to server time and returns a clock-skew warning that the client shows. A broken device clock therefore cannot win every LWW |

---

## 11. Conflict UX

Principle: **merge silently when safe, surface loudly when not, never put markers inside frontmatter, never create duplicate-id files inside spaces.**

- **Field conflicts** (concurrent LWW) resolve silently. The activity entry shows the overwritten value ("priority p1 → p3 by X, your p2 was overwritten · undo"). Undo is just a new revision.
- **Body conflicts** set the entity's `conflict` flag. Task and note views show a banner, "Edited in two places", with a three-pane diff (base / theirs / yours, rendered with `similar`) and the actions **Keep theirs**, **Keep mine**, **Merge manually**. The losing text is stored in `.shards/conflicts/<id>/<rev>.md` and in server `conflicts`. Opt-in per workspace: write git-style markers into the **body only** for users who prefer an Obsidian-like experience. Default off.
- **CLI:** `shards sync status`, `shards sync conflicts [--json]`, `shards sync resolve <id> --take theirs|mine|file <path>`, `shards history <id>`, `shards restore <id> --rev N`.
- **MCP:** `conflicts_list`, `conflict_resolve`. Tool responses for an entity in conflict include `conflict: true`, so agents can notice and escalate rather than overwrite.
- **Claim lost:** a toast/notification plus activity entry. For agents, the next tool call on that task returns exit 4 with the holder.
- **Resurrected deletes and view-only rejections** have dedicated notices (§5.7, §5.9).
- **Double-sync guard.** If the vault sits inside Dropbox, iCloud or Obsidian Sync, warn on setup. Obsidian documents double-syncing as a cause of disappearing files ([troubleshoot](https://obsidian.md/help/sync/troubleshoot)). Offer `.shards/` ignore rules for those tools.

---

## 12. "No daemon" coexistence

- **Invariant kept:** every local verb (CLI, local MCP) reads and writes disk directly and is correct with **no sync agent running**. Sync is never on the critical path of a verb.
- **Where sync runs.** All three hosts call the same `sync::run_once()` / `sync::run_watch()`:
  1. **Desktop app** runs the loop in-process while open (`notify` + poke + periodic scan).
  2. `shards sync --watch` runs it in the foreground (like `mesh watch`, and can share its process: one watcher drives reconcile + search refresh + sync).
  3. `shards sync --once` runs one pass for cron, launchd, systemd timers, git hooks or CI.
- **Singleton.** One sync agent per vault via a lock in `.shards/sync/.lock`. This reuses `watch.rs`'s singleton-lock-plus-TTL-touch pattern (`src/cli/watch.rs:1,29`). The desktop app and `shards sync --watch` therefore never double-run. The second instance reports "sync already running (pid, host)".
- **Optional nudge.** After a mutating verb in a synced vault, the CLI and local MCP may *try* a non-blocking nudge (touch `.shards/sync/dirty`). The running agent picks it up. If none is running, nothing happens and `shards status` reports "N unsynced changes; run `shards sync`". Agents get a `sync_hint` field in JSON output, never a failure.
- **Optional always-on** (launchd/systemd unit via `shards sync install-agent`) is a user choice for headless servers where agents run. It is not a requirement, and its absence is not an error.

---

## 13. Live co-editing (later phase): Loro session documents

- Scope: two or more people/agents in the **Shards editor** on the same body at the same time.
- Mechanism:
  - On open, the client fetches or creates a **Loro session doc** for `(entity, rev)`. It is seeded from the current body. Participants exchange Loro updates over the workspace WebSocket (server relays, optionally persists for late joiners). Presence uses Loro EphemeralStore.
  - Fields (title, status) still go through the record path. Only the body is in Loro.
  - The editor saves to the file debounced (~1–2 s idle) and on close. Each save is an ordinary revision with `base_rev`. Since all live participants converge, the revisions fast-forward.
  - If an external writer changes the file mid-session, ingest it via `LoroText::update_by_line` with `timeout_ms`. `update` is documented as slow for > ~50k chars, and files can be up to 4 MiB ([docs.rs](https://docs.rs/loro/latest/loro/struct.LoroText.html)).
  - When the last participant leaves, the session doc is discarded or kept only as an optimization. The **file + revision log stays the record**.
- Why Loro: Rust-native (same crate in Tauri backend and server), JS/WASM in the webview, official CodeMirror 6 and ProseMirror/TipTap bindings with cursors and undo ([loro-codemirror](https://github.com/loro-dev/loro-codemirror/), [loro-prosemirror](https://github.com/loro-dev/loro-prosemirror/)), Fugue (no interleaving), stable encoding since 1.0.
- Fallback: Yjs/yrs has the deepest editor ecosystem if Loro bindings disappoint.

---

## 14. Verification strategy

- **Convergence simulator** (deterministic, seeded). N replicas + server + K agents perform random interleaved ops (field edits, body edits, external rewrites with key reordering, moves, deletes, claims, offline windows, clock skew). Assert:
  1. all replicas converge byte-identically after quiescence
  2. no edit is lost (each is either in the final state or in a conflict revision)
  3. at most one confirmed claimant at any time
  4. no duplicate ids on disk
  5. no file outside its routed folder
- mesh currently rejects `proptest` on purpose (`tech.md` § Stack). Use a hand-rolled seeded generator in-tree, or revisit that decision for this module only.
- **Golden tests** for the frontmatter ↔ record bijection: parse → record → canonical emit is stable, and unknown keys round-trip (C6).
- **Fault injection**: kill the sync agent between rename and base update. Expect no loss and no double-apply on restart.
- **Race tests** against concurrent CLI writers (extend the existing race tests in `tests/`).
- **MCP auth conformance** against the 2026-07-28 spec (PRM, 401 challenge, audience validation, CIMD).

---

## 15. Phased delivery

| Phase | Deliverable | Exit criteria |
|---|---|---|
| **S0 — Sync-ready core** (with the rename to Shards) | Crate split (`shards-core` lib). `.shards/` state dir. HLC module. Record ↔ file bijection. Base store. `shards sync status --dry-run` computing the local changeset. ≥ 8-char ids in synced mode. Amend invariants C1/C2 in `.spec/tech.md` | bijection golden tests green; dry-run changeset correct on the compat corpus |
| **S1 — Personal multi-device sync** | `shards-server` single binary (SQLite + FS blobs) and hosted (Postgres + S3). push/pull/snapshot/poke. Field LWW + set merge + diff3 body. Tombstones. Id remap. Assets. Device-code login with PATs. Desktop app hosts the loop. `shards sync --once/--watch` | convergence simulator 10k seeds green; 2 devices + CLI agents for a week of dogfooding without loss |
| **S2 — Multiplayer workspaces** | OIDC login. Members, roles, handles. Server-arbitrated claims with leases. Activity feed. Conflict UI (desktop) + CLI + MCP conflict tools. Per-space policy (private scratch). Revision history + restore | claim exclusivity property holds under simulator; two humans + two agents share a project |
| **S3 — Remote MCP over OAuth** | Streamable HTTP `/mcp` via rmcp (stateless). PRM + 401 challenges. AS (embedded or delegated, §8). Agent principals + scopes + `act` binding. Server replica actors | passes MCP 2026-07-28 auth conformance; Claude Code / other clients connect via CIMD; parity tests local vs remote MCP |
| **S4 — Real-time + web** | Loro session docs for bodies, presence, web client (same React UI), sync groups / project-level sharing, selective sync of assets | co-editing latency < 150 ms p95 on one region; sharing a single project to an outsider works |
| **S5 — Privacy & ecosystem** | E2EE private workspaces (audited MLS/Keyhive, client-side merge, remote MCP off). Git backup/export. Foreign-file sync hardening. Mobile clients (Tauri mobile) | external security audit before GA of E2EE |

The immediate-development slice is S0 plus the *protocol spec* for S1. Server work can start in parallel once the record format (§5.2) is frozen.

---

## 16. Risks and open decisions

1. **Embedded AS vs external IdP** (§8). This decision has the largest security surface. Decide before S3.
2. **Body merge quality**: diff3 is line-based. Long single-line paragraphs conflict more often. Mitigations: word-level fallback merge for small conflicting hunks (diff-match-patch style, as Obsidian does), then the Loro live path in S4.
3. **HLC at detection time** can misorder edits made offline on a device with a wrong clock. Bounded by the server clamp. Document it.
4. **Server replica scaling** (one actor per active workspace): fine to thousands of workspaces per node. Revisit with a `Store` trait if hot workspaces appear.
5. **Foreign files** in Obsidian-style notes spaces (renames without ids) will be the noisiest source of conflicts. Keep them out of S1.
6. **Invariant churn**: C1, C2, C4 and C11 change meaning in synced workspaces. The spec must state the *synced-mode* semantics explicitly so tests can pin them. This includes the **new agent claim lease** (claims never expire today), the tombstone cases in §5.9, and the server-clamped HLC.
7. **Vendor checks before committing**: whether candidate IdPs support CIMD and RFC 8707 audience, Loro binding maturity in the chosen editor (CodeMirror vs TipTap), and samod/Subduction maturity if Automerge is reconsidered for E2EE.

---

## 17. Sources

**Repo (read-only):**
- `mesh/.spec/tech.md:65-104` (invariants), `:153-158` (IDs, folders, locks, exit codes), `:171-174` (per-space fields)
- `mesh/.spec/product.md:53,123`
- `mesh/src/ids.rs:1,41-75`
- `mesh/src/domain/tasks.rs:396-425`
- `mesh/src/storage/walk.rs:8,27,51`
- `mesh/src/cli/watch.rs:1-29`
- `mesh/Cargo.toml`

**CRDTs:**
- https://automerge.org/blog/automerge-3/
- https://github.com/automerge/automerge/blob/main/rust/CHANGELOG.md
- https://docs.rs/automerge/latest/automerge/transaction/trait.Transactable.html
- https://automerge.org/docs/reference/documents/text/
- https://www.loro.dev/blog/v1.0
- https://www.loro.dev/changelog
- https://github.com/loro-dev/loro/releases
- https://www.loro.dev/docs/performance
- https://docs.rs/loro/latest/loro/struct.LoroText.html
- https://loro.dev/docs/tutorial/text
- https://github.com/loro-dev/loro-codemirror/
- https://github.com/loro-dev/loro-prosemirror/
- https://crates.io/crates/yrs
- https://github.com/y-crdt/y-crdt/releases
- https://inspect.software/software/y-crdt/y-crdt
- https://github.com/alexjg/samod/
- https://docs.rs/crate/samod/latest
- https://github.com/inkandswitch/darn/
- https://docs.rs/crate/darn_core/latest
- https://docs.rs/teamtype/latest/src/teamtype/document.rs.html

**File sync:**
- https://obsidian.md/help/sync/troubleshoot
- https://deepwiki.com/obsidianmd/obsidian-headless/3.1-sync-modes-and-conflict-strategies
- https://obsidian.md/help/sync/vault-types
- https://docs.syncthing.net/users/syncing.html
- https://forum.syncthing.net/t/version-vector/14594
- https://help.dropbox.com/organize/conflicted-copy
- https://help.dropbox.com/share/view-only-conflict

**Git:**
- https://github.com/Vinzent03/obsidian-git
- https://github.com/Vinzent03/obsidian-git/pull/1097

**Records/LWW:**
- https://github.com/wzhudev/reverse-linear-sync-engine/blob/main/SUMMARY.md
- https://marknotfound.com/posts/reverse-engineering-linears-sync-magic/
- https://www.fujimon.com/blog/linear-sync-engine
- https://www.youtube.com/watch?v=Wo2m3jaJixU
- https://docs.rs/crate/crdt-kit/latest
- https://github.com/thinkgrid-labs/taladb/blob/main/docs/guide/crdt-sync.md
- https://docs.rs/diffy/latest/diffy/

**MCP/OAuth:**
- https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
- https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- https://den.dev/blog/mcp-november-authorization-spec/
- https://modelcontextprotocol.io/docs/tutorials/security/authorization
- https://github.com/modelcontextprotocol/rust-sdk
- https://github.com/modelcontextprotocol/rust-sdk/blob/main/docs/OAUTH_SUPPORT.md
- https://docs.rs/rmcp/latest/rmcp/transport/streamable_http_server/tower/struct.StreamableHttpService.html

**E2EE:**
- https://obsidian.md/help/sync/security
- https://obsidian.md/blog/verify-obsidian-sync-encryption/
- https://obsidian.md/files/security/2025-Obsidian-TrailofBits-Sync-Audit.pdf
- https://obsidian.md/files/security/2024-Obsidian-Cure53-Sync-Audit-Full.pdf
- https://www.inkandswitch.com/project/keyhive/
- https://www.inkandswitch.com/keyhive/notebook/04/
- https://www.inkandswitch.com/keyhive/notebook/06/
- https://github.com/inkandswitch/keyhive/pull/208
- https://www.inkandswitch.com/newsletter/dispatch-014/

**Crate versions** (crates.io API, 2026-10-15): loro 1.16.2, automerge 0.12.0, yrs 0.28.0, samod 0.15.0, rmcp 3.5.1, object_store 0.14.2, uhlc 0.9.0, diffy 0.5.2, similar 3.2.0.
