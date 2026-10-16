---
type: feature-research
feature: sync
parent: product.md
updated: 2026-10-15
---

# sync — Research

Discovery artifacts for the sync feature, condensed from the 2026-10-15 sync research. Deleted
with the feature folder at wrap-up. Durable findings go to root `tech.md` through the merge
blocks in [tech.md](tech.md).

## Question

How should Shards replicate a Markdown vault across devices and members when every writer
(desktop app, CLI, local and remote agents, external editors) writes whole files, tasks move
between folders on status change, and claims must stay exclusive?

## Findings

### §1 Constraints from the current codebase

| # | Constraint | Consequence |
|---|---|---|
| C1 | Root invariant 10: sync and versioning are the vault owner's job | Must be reversed for synced vaults (DECISIONS reversal 1) |
| C2 | Hard delete, no trash | A stale replica resurrects deletes → tombstones keyed by id |
| C3 | Tasks move `open/` ↔ `done/` on status | Path is not identity; key by frontmatter id |
| C4 | Claim atomicity is a local `O_EXCL` lock; claims never expire | Cross-machine exclusivity needs a server CAS; agent leases are a new rule |
| C5 | Ids are 4+ Crockford chars, extended on collision against local files only (`src/ids.rs`) | Offline devices can collide; server remap + 8-char ids in synced vaults |
| C6 | Canonical frontmatter; compatibility is semantic | Merge the parsed map, hash canonical content |
| C7 | One walk skips dot-paths and files over 4 MiB | `.shards/` is invisible to scans for free; conflict copies must never sit inside a space |
| C8 | Writes are atomic and single-entity under the entity lock | Apply remote revisions through the same lock and atomic write |
| C10 | No daemon; `watch` uses a singleton lock (`src/cli/watch.rs`) | Sync is an optional process with the same singleton pattern |
| C12 | Scratch is `<agent>/<name>`, no id; assets are content-addressed | Scratch key `scratch:<agent>/<name>`; blobs dedupe by sha256 |
| C13 | Spaces are configured per machine | Wire carries space-relative keys, never vault paths |

### §2 Path-keyed sync tools break Shards

- **Obsidian Sync** merges Markdown with diff-match-patch against the last synced base and can
  create conflict files since 1.9.7 ([help](https://obsidian.md/help/sync/troubleshoot),
  [headless client](https://deepwiki.com/obsidianmd/obsidian-headless/3.1-sync-modes-and-conflict-strategies)).
  Notes created on two devices at once can lose one side.
- **Syncthing** detects concurrency with version vectors and renames the older file to
  `.sync-conflict-…`; modify beats delete ([docs](https://docs.syncthing.net/users/syncing.html)).
- **Dropbox** never merges; it creates conflicted copies and a separate view-only conflict path
  ([conflicted copy](https://help.dropbox.com/organize/conflicted-copy),
  [view-only](https://help.dropbox.com/share/view-only-conflict)).
- Kept: base hash per file, three-way Markdown merge, conflict copy fallback, modify beats delete,
  history. Rejected: path identity (breaks C3), sibling conflict files (duplicate ids, C7),
  whole-file LWW for task metadata, mtime as arbiter.

### §3 CRDT per document (Automerge, Yjs/yrs, Loro)

- External writers (agents, CLI, editors) arrive as whole-file diffs. Automerge's own docs say
  `update_text` "will produce results which don't merge as well as directly capturing the user
  input actions" ([docs.rs](https://docs.rs/automerge/latest/automerge/transaction/trait.Transactable.html)).
  Merge quality is about diff3, plus a second history store that can drift from the file.
- Rust sync stacks are immature: `samod` calls itself "experimental … don't use this anywhere
  serious yet" ([README](https://github.com/alexjg/samod/blob/main/README.md)); yrs has one main
  contributor ([inspect.software](https://inspect.software/software/y-crdt/y-crdt)).
- Loro (1.16.2) is the best fit for later live co-editing: Rust core, official CodeMirror and
  ProseMirror bindings, `update_by_line` for external edits
  ([docs.rs](https://docs.rs/loro/latest/loro/struct.LoroText.html),
  [loro-codemirror](https://github.com/loro-dev/loro-codemirror/)).
- Verdict: not the record store; Loro session documents later for live body co-editing only.

### §4 Git-based sync

No native git on mobile; isomorphic-git is unstable and fails on criss-cross merges
([obsidian-git](https://github.com/Vinzent03/obsidian-git),
[PR #1097](https://github.com/Vinzent03/obsidian-git/pull/1097)). Conflict markers in YAML make the
safe reader drop the file. Commit noise from agent loops; no per-field semantics or server claims.
Verdict: not the sync engine.

### §5 Structured record sync (chosen)

- Linear executes transactions on the server, assigns a monotonic sync id, and clients pull
  deltas after `lastSyncId`; LWW resolves conflicts; CRDTs only for issue descriptions
  ([reverse-linear-sync-engine](https://github.com/wzhudev/reverse-linear-sync-engine/blob/main/SUMMARY.md),
  [fujimon.com](https://www.fujimon.com/blog/linear-sync-engine)).
- Hybrid logical clocks give causally monotonic stamps near wall time with a node tiebreak
  ([crdt-kit](https://docs.rs/crate/crdt-kit/latest)); skew biases wins, so the server clamps.
- `diffy::merge(original, a, b)` is diff3-style and returns merged or conflicted text
  ([docs.rs diffy](https://docs.rs/diffy/latest/diffy/)).

| Criterion (5 = best) | CRDT | File-level | Git | **Record + 3-way** |
|---|---|---|---|---|
| File stays truth | 3 | 5 | 4 | **5** |
| Task field-level merge | 5 | 1 | 2 | **5** |
| Exclusive claims, server rules | 2 | 1 | 1 | **5** |
| Remote MCP over the same data | 2 | 2 | 2 | **5** |
| Implementation risk | 2 | 4 | 3 | **4** |

### §6 Market signals

Beads moved its source of truth to Dolt because of multi-writer merge pain; Basic Memory Cloud
uses push/pull with conflict files; Logseq Sync overwrote whole pages (market research §8).
Obsidian Sync ($4/$8) and Anytype ($4) set the price anchor for Personal Sync at $5.

### §7 E2EE

E2EE conflicts with server merge, server claims, server search and remote MCP. Bespoke E2EE fails
audits at well-funded teams: Trail of Bits found a high-severity randomness bug in Obsidian Sync
([2025 audit](https://obsidian.md/files/security/2025-Obsidian-TrailofBits-Sync-Audit.pdf));
Cure53 flagged key separation
([2024 audit](https://obsidian.md/files/security/2024-Obsidian-Cure53-Sync-Audit-Full.pdf)).
Group-key options (Keyhive/BeeKEM, MLS RFC 9420) are pre-audit or need a maintained Rust
implementation ([Keyhive](https://www.inkandswitch.com/project/keyhive/)). Deferred to e2ee (#23).

## Approaches tried

| Approach | Result | Notes |
|---|---|---|
| CRDT per file as record store | rejected | diff3-level merge for whole-file writers; second history store; immature Rust sync |
| Path-keyed file sync | rejected | Duplicates tasks on status moves; no field merge |
| Git sync | rejected | Mobile, YAML markers, no claims |
| Record sync + HLC per-key LWW + diff3 bodies + server CAS claims | chosen | Fits file-as-truth; enables remote MCP over a server replica |

## Decision

Server-ordered record sync keyed by frontmatter id; per-key HLC LWW for scalars, three-way set
merge for lists, diff3 for bodies with conflict copies in `.shards/conflicts/`; tombstones with
edit-beats-delete; server CAS + lease claims; `.shards/sync/` SQLite state; hosts are the desktop
app, `shards sync --watch` and `shards sync --once`. Server: axum + sqlx (Postgres / SQLite) +
object_store. Ruled out: CRDT record store, git sync, path keys, bespoke E2EE.

Crate versions checked 2026-10-15: diffy 0.5.2, similar 3.2.0, object_store 0.14.2, loro 1.16.2,
automerge 0.12.0, yrs 0.28.0, uhlc 0.9.0 (not used; HLC is in-tree), rmcp 3.5.1.
