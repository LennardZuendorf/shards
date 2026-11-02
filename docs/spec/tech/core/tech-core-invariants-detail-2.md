---
type: tech
applies: "**"
updated: 2026-11-02
---

# tech-core: Invariants (detail) (2/3)

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

Parent: [Section index](README.md).
