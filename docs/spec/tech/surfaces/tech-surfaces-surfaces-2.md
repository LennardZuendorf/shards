---
type: tech
applies: "**"
updated: 2026-11-02
---

# tech-surfaces: Surfaces (2/4)

## Surfaces

- **Adoption & note claims** — `note adopt` mints a Shards id into an existing foreign file in
  place: insert-only-absent keys (`id`, `title`, `created`, `updated`; `owner` only when the flag
  is given), foreign keys and the filename untouched, byte-identical re-run. Adopt refuses (exit 2,
  file untouched) a file the walk cannot see — a dot component, a non-`.md` extension, over 4 MiB
  — and a file whose existing keys fail the note schema. A batch is a sequence of single-entity
  transactions: the first failure stops the run naming what committed; the idempotent re-run
  heals. `note claim`/`release` are the task machinery minus the lifecycle: test-and-set on
  `claimed_by` only, conflict = the shared claim-conflict envelope, `--force` on release breaks a
  foreign holder. `--mine` on note list is owner-or-claimed_by. The status census carries
  per-agent `notes_owned`/`notes_claimed`, appended last. Pinned by `tests/note_cli.rs`,
  `tests/race.rs` (8-way real-process claim race), `tests/review_regressions.rs`,
  `tests/mcp_cli.rs`, `tests/bundle.rs`.
- **Project envelope** — one membership rule per space, all read-time: tasks by `project`
  equality, notes by `related` containment, memories by `project` equality. The `project` lens
  appends `notes` then `memories` last; `search --project` and `memory recall --project` scope to
  the members and compose with every other filter as a plain conjunction (zero rows is an empty
  result, never an error). The seed gate is shared: unknown id → exit 3 with candidates; a foreign
  seed → `seed is not shards-native (no shards id)`. Unknown and dangling `project` values are
  tolerated. MCP carries `project` on `shards_search`, `shards_memory_recall` and the memory
  write tools. Pinned by `tests/{lens,search,memory,mcp}_cli.rs`.
- **Wikilinks** — `[[Title]]` → id by title match against the notes index; `[[n-id]]`/`[[t-id]]`/
  `[[m-id]]`/`[[a-id]]` pass through; alias and anchor forms (`|`, `#`, `^`) strip at the lookup
  boundary; `related` is deduped; unresolvable links are dangling and counted by `shards status`.
- **Search** — hit shape `{id,type,title,score,path}` plus conditional `tags`/`owner`/`updated`/
  `snippet`/`space`; foreign files surface with `id: null`. Routing: `indexed` when `[search].hybrid`
  is on, a collection is configured and the binary is on PATH; otherwise a built-in BM25-lite engine
  whose four legacy tiers (title-exact 1.0, title-substring 0.8, tag 0.6, body 0.4) remain floors;
  `--engine substring` restores the legacy scoring. `indexed` is a dense-vector engine: the
  `hybrid` key selects that branch, it does not fuse a lexical leg, and the built-in BM25-lite
  engine is what matches exact identifiers. Ordering is score desc, updated desc, path asc
  (±0.02 recency band on the `indexed` path only). `--tags` is repeatable, comma-split and ANDed;
  `--status` is a membership union (unknown value exit 2). Under an active filter, an explicit
  `--limit=-1`, and `memory recall`, the `indexed` fetch asks for the positive `MAX_FETCH_DOCS`
  sentinel (1,000 documents) because the CLI reads a negative limit as a valid empty result; the
  real filter and display limit are applied in Rust afterwards.
- **Tasks** — atomic `O_EXCL` claim; idempotent release/finish/cancel that never rewrite a no-op
  and report the status they *found*; `--available` is dependency-blind; `--ready`/`--blocked` are
  dependency-aware; a strict claim on a blocked task exits 5; `task next` selects and optionally
  claims in one invocation, retrying across up to 3 candidates on a race. `block`/`unblock` replay
  their add/remove sets against the locked read (§ Invariants 6); the cycle check uses the
  whole-graph scan. The v2 fields, filters, sorts and the recurring finish (uncommitted) are
  specified in [features/task-model-v2/tech.md](../../features/task-model-v2/tech.md) until compound.
- **Assets** — ingest is copy-only and idempotent by content; `--attach` resolves its target
  before any I/O. `attach`/`detach` span three and two transactions; both are idempotent and a
  failure names which halves committed. `remove`'s reference guard runs inside the asset's lock.
- **Scratch and memories** — the scratch agent is validated exactly like the name beside it; the

Parent: [Section index](README.md).
