# Lessons

Mistakes made and rules to prevent repeating them. Review at the start of every session.
Tags make entries retrievable — scan for tags matching the work in hand.

<!-- Format for each lesson: ### [Short description], then **Pattern:** what went wrong and why, **Rule:** the concrete rule, **Tags:** keywords, **Date:** YYYY-MM-DD -->

### A green gate is not a complete feature
**Pattern:** pytest + mypy + ruff all passed while `mesh daemon start` (admin unit) and the MCP server were entirely unbuilt, and while `search --status` was silently dropped on the hybrid path — because no test exercised the missing behaviour. A green gate only proves the tests that exist pass.
**Rule:** Verify features against the spec's requirement list and by running the assembled binary end-to-end, not just by gate colour. Cross-check units-built vs required surface before declaring done; a missing verb/flag has no failing test to turn the gate red.
**Tags:** verification, testing, cli, done-definition
**Date:** 2026-07-04

### Foreign-file tolerance must be symmetric across every reader
**Pattern:** the task-side readers caught `yaml.YAMLError` around `frontmatter.loads`, but the note-side readers (`get_note`, `list_notes`, slug-resolve, `wikilinks._title_index`/`find_dangling`) caught only `OSError` — so one malformed `.md` in `notes/` crashed `note list/get`, slug ops, `status`, and the wikilink write-path, flatly contradicting the "foreign/corrupt files skip silently" contract the sibling task code honoured.
**Rule:** "Skip foreign/corrupt files silently" is a whole-corpus invariant — it must hold in *every* reader, not most. Route all read-parse through one guarded reader that catches both `OSError` and `yaml.YAMLError`; never hand-roll a second, narrower guard.
**Tags:** parsing, resilience, notes, tasks, dry
**Date:** 2026-07-04

### Reclaiming a stale lock must not unlink a lock you no longer own
**Pattern:** stale-lock reclaim did `_is_stale()` (stat+read) → `_clear()` (unconditional `unlink`) → re-create. Two acquirers could both judge a dead-PID lock stale; the second's `unlink` removed the *fresh* lock the first had just taken, yielding two simultaneous holders and breaking the `O_EXCL` atomic test-and-set.
**Rule:** A reclaim is a compare-and-swap, not a blind delete. Re-attempt the `O_EXCL` create and treat `FileExistsError` as "someone won" rather than unlinking whatever is at the path; only remove a lock whose identity you have re-verified.
**Tags:** locks, concurrency, toctou, atomicity
**Date:** 2026-07-04

### Write-then-move must survive a crash without an unrecoverable state
**Pattern:** `finish`/`cancel` wrote `status=done` in place, then `os.replace`d the file `open/`→`done/`. A crash between the two left a `done`-status file in `tasks/open/`; the idempotent terminal no-op then refused to move it, stranding it there forever.
**Rule:** When a state transition spans two atomic steps, order and recover them so no crash point yields a state the normal path can't repair. Either move into the destination first, or have the idempotent path reconcile a mismatched status↔folder instead of short-circuiting on status alone.
**Tags:** atomicity, crash-consistency, tasks, idempotency
**Date:** 2026-07-04

### Resolve user paths — expanduser() every config path
**Pattern:** `MESH_CONFIG_PATH` was `expanduser()`'d but `[core].tolaria_path` was not, and `realpath` does not expand `~`. A natural `path = "~/vault"` became a literal `./~/vault` under the process CWD — silently writing the whole vault to the wrong place and rooting the sandbox there.
**Rule:** Every path that comes from a human-authored config or env var gets `expanduser()` at the parse boundary (a pydantic field validator), consistently across *all* path fields. `realpath`/`resolve` is not a substitute for `~` expansion.
**Tags:** config, paths, sandbox
**Date:** 2026-07-04

### One mechanic, one home
**Pattern:** the lock-hold CM, safe-read idiom, vault walk, filter/sort/limit tail, note/task→JSON envelope, and the whole `finish`≈`cancel` body were copy-pasted across `notes.py`/`tasks.py` and the CLI/MCP surfaces. Copies drift (the YAML-guard and exit-code bugs were exactly this).
**Rule:** Each cross-cutting mechanic gets exactly one implementation every verb imports; a second copy is a bug waiting to diverge. (The Python-era warm-index half of this lesson retired with the daemon.)
**Tags:** kiss, dry, duplication
**Date:** 2026-07-04

### DRY only when the callers share one shape — not when the abstraction carries their differences
**Pattern:** a Phase-1 review proposed three "shared primitives" that scoping then rejected: a `to_entry` wire-envelope merger (the socket wants the full model + body; the activity row is a deliberate 5-key shape that *excludes* `created`/`updated`), a generic filter/sort/limit pipeline (`recent` sorts two-pass mtime-desc/id-asc with a `-1` sentinel; `list_notes` sorts single-pass with a `None` sentinel), and an exit-code decorator (each handler's message carries the target id / conflict owner). Each "shared" helper would have needed a per-caller discriminator, key-callable, or message threaded in — so the abstraction re-encoded the very differences it claimed to erase, costing more than the copies. (The genuinely-shared `cli/_output.emit_mutation` worked precisely because the only difference — `type` vs `status` — collapses to a one-key `fields` dict.)
**Rule:** Extract a shared primitive only when the callers truly share one shape. If unifying them forces a discriminator, a strategy callable, or per-caller branches into the helper, the duplication is the simpler design — keep it. This refines "one mechanic, one home": one mechanic, yes; one *forced* shape, no.
**Tags:** kiss, dry, duplication, abstraction, review
**Date:** 2026-07-05

### A scope claim must cover the process boundary, not just in-process walks
**Pattern:** an analysis enumerated five in-process vault walks, concluded "mesh only ever touches `notes/` and `tasks/`", and shipped that claim in `config.example.toml`. It missed `src/mesh/index/indexed_client.py:309`, where `full_rebuild()` hands the *whole configured root* to the external `indexed` binary — a traversal that happens outside the process the walks were enumerated in.
**Rule:** When claiming what a tool traverses, enumerate every path that escapes the process — subprocess arguments, external indexers, watchers — not only the in-process iterators.
**Tags:** scope, spec-accuracy, subprocess, vault, indexed
**Date:** 2026-08-20

### Removing a dependency by name leaves the premise behind
**Pattern:** the Tolaria removal was scoped by grepping the string "tolaria", so rationales *derived* from it survived where the word did not — e.g. `.spec/features/team-awareness/product.md` still rejected an `updated_by` key because "the git-backed vault is the audit trail", the exact premise the removal invalidated.
**Rule:** After removing a dependency, grep for the *premises* it supplied — the guarantees other decisions leaned on — not just its name.
**Tags:** spec-accuracy, dependency-removal, grep-scoping, vault-agnostic
**Date:** 2026-08-20

### A per-user accelerator silently serves the wrong vault
**Pattern:** the daemon socket was named from `$XDG_RUNTIME_DIR`/`$HOME` and the RPC envelope carried no vault identity, so there was one daemon per *user* rather than per *vault*. A CLI configured for vault B and a daemon started on vault A talked happily: `note list` returned A's rows, `recent-activity` leaked A's absolute paths out of B's sandbox, and `note get` on those ids said not found. Four independent reviewers hit it — three of them as "flaky tests" first, because the suite pinned no runtime dir either.
**Rule:** an accelerator keyed to a *user* while the data is keyed to a *vault* is a correctness bug, not a config nuisance. Name the socket from a digest of the resolved data root, and have every reply state which root it served so a mismatch degrades to the fallback. Pin the runtime dir in the test suite too, or "cold path" tests are only cold by accident of the environment.
**Tags:** daemon, socket, multi-vault, isolation, test-isolation
**Date:** 2026-08-23

### Freshness that depends on a watcher has no read-your-writes
**Pattern:** the warm index was refreshed only by inotify, so `create` followed immediately by `list` — the commonest agent sequence there is — returned a list without the agent's own new entity (5/5 creations missed). The parity suite never caught it because it only ever tested a *frozen* vault seeded before the daemon started; every divergence found later lived in exactly that untested region.
**Rule:** "the accelerator is invisible" is a claim about a vault that *changes*, so test it against one that does — mutate while the daemon is up, then re-compare. When a writer knows what it changed, tell the accelerator rather than waiting for the filesystem to mention it; keep the notification post-durability and failure-swallowing so the accelerator still never gates a write.
**Tags:** daemon, freshness, read-your-writes, parity, testing
**Date:** 2026-08-23

### A default written into a config file is not the same as a default in code
**Pattern:** the substring fallback was fixed to apply `[search].threshold` only when a caller set it explicitly — then `mesh init` wrote `threshold = 0.65` into every config it generated, which made it explicit and restored the exact behaviour the fix removed. Body search returned `[]` on every fresh install. The unit's own test passed because its fixture hand-wrote a config shape `init` cannot produce.
**Rule:** when behaviour keys off "did the user set this?", the tool's own scaffolding must not answer yes on the user's behalf. Omit defaulted keys from generated config, and write the regression test *through* the generator rather than against a hand-built fixture.
**Tags:** config, defaults, init, search, test-fixtures
**Date:** 2026-08-23

### Fix one side of a shared mechanic and the other side is now the bug
**Pattern:** the task verbs were hardened to resolve the entity path *inside* the lock, closing a TOCTOU against a racing folder move. The note verbs were left resolving outside it, so `note delete` racing `note update --type` raised a raw `FileNotFoundError` at exit 1 and did not delete. The same asymmetry appeared twice more in one review: the dangling-link scan walked `tasks/**` recursively while the task reader was deliberately non-recursive, and `_iso_z` was applied to the JSON surfaces but not the human `get` output.
**Rule:** when a repo's thesis is "a task is a note", a fix to one verb family is unfinished until the sibling family is checked. Grep for the *pattern* being fixed, not the symptom that reported it.
**Tags:** dry, symmetry, toctou, notes, tasks, review-scoping
**Date:** 2026-08-23

### A guard nothing tests is a guard that will be deleted
**Pattern:** every defensive guard in `index/reconcile.py` could be removed with all 1331 tests still green — including the one its own docstring calls out as "never remove that guard", citing an existing lesson. The watcher had no try/except around its callback either, so a single malformed `.md` would kill the observer thread and freeze freshness for the daemon's whole life, silently, with the suite green.
**Rule:** a comment saying a guard is load-bearing is an admission that nothing proves it. Pin each guard with a test that exercises the hostile input and asserts the *system survives* — not just that the call returned. Statement coverage cannot see a deleted guard clause; turn branch mode on.
**Tags:** testing, mutation-testing, guards, watcher, coverage
**Date:** 2026-08-23

### Serialisation defaults leak into files other tools have to read
**Pattern:** binding one `datetime` object to both `created` and `updated` made PyYAML emit an anchor/alias pair (`created: &id001 …` / `updated: *id001`) in every file mesh created. Valid YAML, and mesh round-tripped it fine — but a restricted frontmatter parser reads `updated` as the literal string `*id001`, so the breakage landed entirely on the coexisting tool the spec promises to be safe with. `atomic_write` had the same shape of bug: `mkstemp` creates 0600 and `os.replace` carried that onto a file another tool had checked in at 0644.
**Rule:** "the Markdown stays clean" is a claim about what *other* programs can read, so audit the bytes on disk, not the round-trip through your own reader. Enforce it at the single serialisation boundary — a dumper that cannot emit anchors, a write that preserves the destination's mode — so no caller can reintroduce it.
**Tags:** markdown, yaml, interop, permissions, atomicity
**Date:** 2026-08-23

### A word-boundary regex misses underscore-glued identifiers
**Pattern:** renaming the project's identifier prefix (`shards` → `mesh`) needed to hit `shards_note_get`, `SHARDS_AGENT`, and `mcp__shards__shards_note_get` alike. A `\bshards\b` regex looks like the obviously-safe choice, but `\b` does not treat `_` as a word boundary — Python (and most regex flavors') `\w` includes `_` — so it silently fails to match "shards" inside any snake_case or dunder-joined identifier, exactly the places a rename matters most.
**Rule:** when renaming an identifier used as a prefix/component of snake_case or double-underscore-joined names, use a plain substring replace instead of `\b`-bounded regex — but verify first that the old token never occurs as a substring of an unrelated word, or the plain replace becomes its own hazard.
**Tags:** rename, regex, tooling, refactor
**Date:** 2026-09-01

### A rename can produce a self-referential redundant phrase
**Pattern:** the product's own description already used "mesh" as a generic noun ("a mesh for multi-agent collaboration"), so renaming the product identifier `shards` → `mesh` turned "the shards mesh" (plugin/marketplace descriptions) into "the mesh mesh" — a blind, token-correct substitution that broke prose fluency it never touched syntactically.
**Rule:** after any bulk rename where the new token can also occur as an ordinary word, grep for the doubled token ("`<new> <new>`", case-insensitive) across every touched file and hand-fix the hits — don't trust the substitution pass alone to leave prose readable.
**Tags:** rename, prose, review, tooling
**Date:** 2026-09-01

### A degrade-to-empty helper turns a validation error into a wrong answer
**Pattern:** `all_paths`/`task_files` swallowed the disabled-space error with `let Ok(root) = … else { return Vec::new() }` so the cross-space search corpus would keep working. Every verb built on those helpers inherited the degrade: `task list` with `tasks = false` printed nothing and exited 0, and `note get` reported not-found (3) instead of the contract's validation error (2) — while `task get`, which resolves through a different path, exited 2 correctly. The inconsistency was invisible in review because each half read as reasonable on its own.
**Rule:** a helper may degrade only where degrading is the contract. When a scan helper is shared between "this space's own verb" and "every space's corpus", put the error at the verb, not in the helper — and pin it with a test that walks *every* verb of the disabled space, since a per-verb divergence is exactly what a single spot-check misses.
**Tags:** error-handling, spaces, exit-codes, testing
**Date:** 2026-09-07

### A writer and its reader must share one definition of what needs quoting
**Pattern:** the frontmatter emitter decided a plain scalar was safe by testing `parse::<i64>()`, `parse::<f64>()` and the timestamp parser. The reader also resolved `0x`-prefixed hex to an integer. So `mesh note new 0x1F` wrote `title: 0x1F` plain, exited 0 with an id — and every later read of that file failed schema validation, making the entity permanently unaddressable by the id mesh had just handed out. The same shape hit tags (`"tags":[31]` on the JSON surface) and unknown keys.
**Rule:** never hand-write the write-side quoting rule next to a hand-written read-side resolver. Define "resolves to a non-string" once, in the reader, and have the emitter call it — then a new literal form can only ever be added in one place. The test that catches this is round-trip (write, read, compare), not an assertion about the bytes.
**Tags:** yaml, frontmatter, round-trip, dry
**Date:** 2026-09-07

### Locking before resolving makes the lock path an unguarded sandbox hole
**Pattern:** every mutating task verb did `hold(&entity_lock(root, id))` *before* `resolve(cfg, id)`, so the sandbox check ran on a path the process had already created. An id of `../../../../elsewhere/victim` made `acquire` `create_dir_all` outside the vault and `reclaim_if_stale` unlink an aged `victim.lock` there — reachable over MCP, where the id is untrusted model output.
**Rule:** anything that becomes part of a path is untrusted, including the derived path of a lock, a temp file or a marker. Validate at the function that builds the path (return `Result`, don't sanitise silently) rather than trusting the caller to have resolved first — the whole point of taking the lock early is that resolution has *not* happened yet.
**Tags:** security, sandboxing, locks, path-traversal
**Date:** 2026-09-07

### A sweeper that snapshots one side of an invariant needs the writer's lock
**Pattern:** `asset add` wrote blob-then-sidecar under the space create lock; `asset gc --apply` took no lock, snapshotted the sidecars, then listed the blobs. A blob written after the snapshot looked like an orphan and was unlinked while its sidecar was still being written — producing the sidecar-with-no-blob state the spec explicitly forbids. Every `add` still reported success. A 24-writer race test did not reproduce it; 40 writers with sweepers *interleaved* rather than appended did.
**Rule:** garbage collection is a writer. If a two-write sequence is made safe by a lock, the sweep that judges that sequence complete must take the same lock. And verify a race test by breaking the fix and watching it fail — a green race test proves nothing until you have seen it go red.
**Tags:** concurrency, locks, gc, testing
**Date:** 2026-09-07

### "Nothing names it" is not an ownership test in a shared space
**Pattern:** `asset gc --apply` decided a file was its own by asking whether any sidecar named it, and `asset remove` treated the sidecar's `blob` key as a path. Both inferences hold only in a folder mesh alone writes. With the documented `assets = "."` layout the space is the vault root, so the sweep unlinked `important-spreadsheet.csv`, `family-photo.jpg` and the vault's own `mesh.toml` — `removed:3`, hard unlink, no trash. And because `blob` is agent- and editor-writable frontmatter, `blob: ../notes/n-XXXX.md` passed `safe_resolve` (which only proves membership in the union of space roots) and deleted a note, exit 0. The create lock added for the previous gc finding cannot help either bug: the other writer is the operator, who holds no mesh lock at all.
**Rule:** when a space can be shared, ownership is a property of the *name mesh itself wrote*, not of what is missing elsewhere. Derive the test as the inverse of the namer (`owned_blob_id` is the inverse of `blob_name`) so the two cannot drift, and require it to match *this* entity's id before any unlink. A path that passes the sandbox check is still the wrong file to touch; sandboxing answers "inside the vault", never "mine".
**Tags:** assets, ownership, gc, sandboxing, shared-spaces, delete
**Date:** 2026-09-08

### A list derived from an unlocked scan is a claim about the past
**Pattern:** `task block` read `blocked_by` from a scan, appended its target, then wrote the whole list under the lock. Sixteen concurrent blocks on one task left **3 of 16** edges — each writer replayed its own stale snapshot over the previous winner, every call exit 0. `memory forget --expired` had the same shape one step further on: it deleted from a pre-lock scan and never re-read inside the lock, so a memory whose `expires` a writer had just extended was unlinked anyway and the renewal's reported success was a lie. `asset remove` ran its reference guard before the lock, so a concurrent `attach` slipped past the `--force` refusal.
**Rule:** taking the lock is not enough — what you write inside it must be *recomputed* inside it. Carry the edit (add/remove, or a predicate) into the locked section and replay it against the value the locked read returns; never carry a precomputed result. A scan may still feed a decision that genuinely needs the whole graph, such as a cycle check, but never the list that gets written.
**Tags:** concurrency, locks, toctou, lost-update, deps, memories, assets
**Date:** 2026-09-08

### A hardcoded date in a test fixture is a gate that expires
**Pattern:** `tests/fixtures/python-vault/tasks/open/t-D0YQ.md` was stamped `updated: 2026-09-05` and `STATUS_STALE_WINDOW` is `"2d"`, so two `status` tests asserting `stale_claims: 0` passed for exactly two days and then failed on every later run. The handover notes recorded "1248 pass / 0 fail" in good faith; by the time the next session read them the suite was already red at that same commit, for a reason no code change had caused.
**Rule:** a fixture that encodes an absolute date silently couples the suite to the calendar. Stamp time-relative fixtures from `now` when the fixture is materialised, or assert the derived property rather than a count that ages. And treat an inherited "gates green" claim as a timestamp, not a fact — re-run the gates on the base commit before trusting them, so a pre-existing failure is not mistaken for one you introduced.
**Tags:** testing, fixtures, time-dependence, handover, gates
**Date:** 2026-09-08

### A test can pin the bug it is supposed to catch
**Pattern:** `the_indexed_path_defaults_to_the_config_threshold_not_the_engine_floor` asserted that the `indexed` branch applies `[search].threshold`'s nominal `0.65` when no threshold is configured. `tech.md` says the opposite in one line — "`[search].threshold` applies **only when explicitly set**" — and `mesh init` omits the key precisely so the tag and body tiers stay reachable (README §config). So every indexed hit scoring 0.4–0.65 was dropped at exit 0, on the config mesh itself writes, and the bug survived a 123-agent adversarial review because the test covering it was green and its name asserted the wrong behaviour as intended. The same sweep found a second instance of the shape: two `status` tests encoding a `stale_claims: 0` count no spec sentence promises.
**Rule:** a green test is evidence about the assertion, not about the spec. When a test and the spec disagree the spec wins — so read a test's assertion against the spec sentence it claims to cover before trusting it, especially one whose *name* states a behaviour. Treat a test encoding a behaviour no spec line supports as a finding in its own right, and fix the test in the same commit as the code, or the next reviewer will read it as the contract.
**Tags:** testing, spec-conformance, search, threshold, review, gates
**Date:** 2026-09-08

### A silent degrade hides a broken contract
**Pattern:** `mesh reindex` failed twice before the real cause was found. The first failure was attributed to the 30 s wall clock (a 656-file ingest takes minutes); the second ran with a 600 s budget and still degraded. The actual cause: `indexed index create` prompts `Overwrite? [y/N]` when the collection exists, and mesh passes a null stdin, so the child aborts every refresh. The degrade-to-notice design (exit 0, stderr notice) made the failure look like a timeout unless the notice was read carefully — and the wiring had been declared done on the strength of a degraded exit 0 plus a working search path.
**Rule:** when a wrapper degrades by design, a green exit proves nothing about the wrapped call: verify the happy path end-to-end against the real dependency before calling the wiring done. Never route a non-interactive caller through an interactive verb — if the dependency prompts on an existing resource, pick the non-interactive sibling (`index update`, not `index create`), because no timeout budget fixes a prompt that will never be answered. Pin the routing in a stub fixture so the contract cannot drift back.
**Tags:** search, indexed, wrapper, degrade, prompts, wiring, verification
**Date:** 2026-09-25

### A merge block drafted before the code is a claim to re-verify
**Pattern:** the project-envelope feature tech.md carried a pre-written `<!-- merge -->` block listing the memory per-space additions as `kind, scope, importance, source, project, …`, but the landed model declares `project` directly after `scope` (exactly as the same file's Files section specified). Compounding the block verbatim would have written a field order into the root spec that the code does not have.
**Rule:** treat a pre-written merge block as a draft, never as scripture: at wrap-up, re-verify every concrete claim it makes — orders, counts, names — against the landed code before promoting it into the root layer. Code is truth, and the root spec must never describe an ordering the model does not declare.
**Tags:** spec, compounding, merge-blocks, field-order, code-is-truth
**Date:** 2026-09-26

### A wall-clock pin asserts the minimum of N runs, never one sample
**Pattern:** the cold-start budget (under 10 ms) had been documented for the whole Rust rewrite but never tested — a trace finding the dashboard feature was created to close. A single timed run is noise-dominated (locally 6.8–24.9 ms on the same binary, first-run cache effects worse), and a p-quantile pin would flake under CI load. Pinning min-of-ten is monotone against scheduling noise — noise only ever slows a run — so it stays stable under load while still lifting the moment startup work is actually added.
**Rule:** pin a startup/wall-clock budget on the **minimum of several** warm end-to-end runs, with one discard pass to warm the loader and page cache; choose the bound from measured distribution (idle floor AND full-load floor), with generous-but-real headroom, and print the full timing vector in the failure message so a red pin is diagnosable, not mysterious. Calibrate with real measurements recorded in the spec, never by copying the marketing number into the assert.
**Tags:** performance, cold-start, testing, wall-clock, pins, noise
**Date:** 2026-09-26

### A libc type alias has a different width on every target
**Pattern:** `2f6dab8` fixed a macOS compile error by narrowing the mode to `u16` before `rustix::fs::Mode::from_bits`. On macOS `mode_t` is `u16`; on Linux it is `u32`. The branch was verified on macOS only, so `check (ubuntu-latest)`, `coverage` and `package` all failed with E0631 on the pushed head.
**Rule:** never name a concrete width for a libc alias (`mode_t`, `dev_t`, `ino_t`, `off_t`). Use the std API that fixes the width (`Permissions::from_mode(u32)`, `File::set_permissions`), or convert through the alias with a scoped `#[allow(clippy::useless_conversion)]`. A fix to platform-dependent code is verified only when CI is green on both matrix targets.
**Tags:** portability, linux, macos, rustix, ci, verification
**Date:** 2026-10-01

### A single-path writer must pass the same gates as the walk and the reader
**Pattern:** `note adopt` takes an explicit path, so it never went through `iter_md`. It minted ids into `.obsidian/` templates, `.txt` files and files whose existing `tags: draft` or `created: last tuesday` fail `Note::from_meta`. Each run exited 0, and every read verb then answered `note not found` for the new id.
**Rule:** a verb that writes an entity at a caller-named path must check, before the write, that the walk would yield that path (`storage::walk::walk_sees`) and that the resulting frontmatter parses as the entity (`from_meta`). Never report success for an entity no read verb can address.
**Tags:** adopt, walk, schema, validation, notes
**Date:** 2026-10-01

### Verify the default branch builds on the target OS before basing work on it
**Pattern:** the Shards pivot started from `main` HEAD, which did not compile on macOS: two `E0308` errors at `src/storage/atomic.rs:34` and `:42`, because macOS `mode_t` is `u16` and the code passed `u32`. CI for `main` failed (run 34890061715, 2026-09-14), and open PR #11 was 38 commits ahead with the build fix (`e4bc8c6`, `2f6dab8`) and hermetic fixtures. A rename or facade written against that HEAD would have conflicted across ~50 files and inherited eight unrelated test failures. The width mechanics are covered by "A libc type alias has a different width on every target" (2026-10-01); this lesson is about the process.
**Rule:** before branching new work, run the build and the full test suite on the base commit, on the OS you will develop on, and record the baseline. Check the default branch's CI status and the open PRs that are ahead of it. If the fix lives on an unmerged branch, rebase onto it or merge it first. Never base an arc on a commit you have not seen build.
**Tags:** baseline, branching, macos, portability, ci, verification, rebrand
**Date:** 2026-10-15

### `git grep` skips untracked files, so a residue gate passes over new scaffolds
**Pattern:** the shards-rebrand residue gate used `git grep -i mesh`, and its doc claimed the gate printed nothing. New crates and the desktop app were still untracked, so `git grep` never read them; with `--untracked` it found a stale `mesh` comment in `apps/desktop/src-tauri/src/lib.rs`. Root specs had also drifted from feature specs (host tool contract, identity order, error kinds) because feature docs changed contracts without updating root.
**Rule:** a grep gate over a tree with uncommitted new files passes `--untracked` (or uses `rg`, which reads the working tree), and its documented result is pasted from a real run, never predicted. A feature doc that changes a root contract updates the root doc in the same pass.
**Tags:** rename, grep, gates, verification, spec-drift
**Date:** 2026-10-15

### Specs written beside a parallel build describe the plan, not the build
**Pattern:** the desktop-app and task-model-v2 specs were written while the code was being built in parallel. By 2026-10-16 they named tools, shapes and flags the code never shipped (`host_*_update_body` with a hash precondition, `{result: [...]}` lists, `rel_path`, `--listen`/`--token`, `?token=` SSE, TanStack Router, `seed-demo-vault.sh`), while the code had grown things the specs lacked (`host_project_update`, `BYMONTH`, `expected_due`, the token file). AGENTS.md also told readers to run `cargo run -q -- --help`, which fails in this package because it has two binaries and no `default-run`.
**Rule:** after a parallel build, reconcile every contract table against the code (`HOST_TOOLS`, `--help`, schema, capability file) before marking any unit, and paste a real run for every command a doc tells people to type. Delivered behaviour goes in the contract tables; design that is not built moves to a "Designed, not built" list with a gap row, never silently deleted. In this repo use `cargo run -q --bin shards -- …`.
**Tags:** spec-drift, verification, docs, cargo, desktop-app, task-model-v2
**Date:** 2026-10-16

### `pnpm <script> -- --flag` does not reach Vite, so parallel agents share port 5173
**Pattern:** the docs told agents to run `pnpm -C apps/desktop dev -- --port M`. pnpm passed it as `vite -- --port 5293 --strictPort`; Vite treated everything after `--` as positional and bound `http://localhost:5173/` anyway, while `pnpm -C apps/desktop dev --port 5294 --strictPort` bound 5294 (both run 2026-10-16). Every agent that followed the docs silently shared or fought over 5173.
**Rule:** pass script flags to pnpm without `--` (`pnpm <script> --port M --strictPort`), and confirm the bound port from the server's own "Local:" line before pointing a browser at it. A documented dev command is pasted from a run that shows the port it bound.
**Tags:** pnpm, vite, ports, parallel-agents, docs, verification
**Date:** 2026-10-16

### A KPI restated in a feature doc drifts from the KPI table
**Pattern:** product-roadmap.md said its KPI table was the only source of targets, yet desktop-app required "Todoist untouched for 30 days" against K1's "< 10 logged uses a week", sync used "2 devices, ≥ 3 agents" against K12's "3 devices, ≥ 5 agents", and sync and remote-mcp measured business rows with WAU and product analytics that the no-telemetry decision forbids. A parity matrix with no owning requirement or evidence per row also let R1 rest on judgement.
**Rule:** feature docs cite KPI ids and never restate the number (spec rule KPI-1 in product-roadmap.md § KPIs; run its grep before every spec change). Every scope row (parity matrix, exit criterion) names the requirement that owns it and the evidence step that flips it, and a metric names a source that the measurement policy allows.
**Tags:** spec-drift, kpi, metrics, parity, roadmap
**Date:** 2026-10-16

### A contract written in parallel with its implementation drifts
**Pattern:** the Shards spec and the prototype were written by parallel agents from the same decision brief. The spec's host contract (`{result}` shape, `rel_path`, `host_memory_update_body`, per-launch token) and the built one (`{value, list}`, `path`, `host_*_set_body`, header-only checks) diverged, and a dedicated reconcile pass was needed to make spec and code agree.
**Rule:** when spec and code are produced concurrently, pin wire contracts (tool names, argument names, response shapes, auth) in one shared file before fan-out, and schedule a reconcile pass that diffs spec against code before any done claim.
**Tags:** spec, contracts, parallel-agents, verification
**Date:** 2026-10-16

### A legacy-config fallback silently points a fresh GUI app at live data
**Pattern:** I told the owner that the desktop app finds a vault only through `SHARDS_CONFIG_PATH` or `~/.shards/config.toml`. In fact `config::home_path` also falls back to `~/.mesh/config.toml`, so the first launch from Finder opened the owner's real vault (`~/Documents/brain`) instead of the demo vault, and created empty `.mesh/{assets,memories,scratch}` folders in it (2026-10-16). The app shows no notice that it is using a legacy config.
**Rule:** before telling someone how a binary resolves config, run it with the variables unset (`env -u SHARDS_CONFIG_PATH … shards status`) and quote the vault it prints. A GUI that resolves config through a compat fallback must show the resolved vault and config path on first launch.
**Tags:** config, compat, desktop-app, live-data, verification
**Date:** 2026-10-16

### A `str.replace` edit script fails silently when its anchor is gone
**Pattern:** a Python edit script used `s.replace(old, new, 1)` on a test file that `cargo fmt` had already reflowed. The anchor no longer matched, the script wrote the file back unchanged without an error, and the next test run failed for a reason that looked like a product bug ("outside the vault") until the file was read again (2026-10-16).
**Rule:** every scripted text edit asserts its anchor is present before it replaces (`assert old in s`), and anchors are taken from the file as it is after formatting, not from the text that was written before it.
**Tags:** tooling, edits, rustfmt, verification
**Date:** 2026-10-16

### A non-raw Python string doubles the backslashes it was meant to write
**Pattern:** a spec edit script wrote the shortcut `⌘\` as `"⌘\\\\"` inside a normal triple-quoted Python string, so the file got `⌘\\`. The anchor assertion passed, because it checks the old text and not the new one (2026-10-16).
**Rule:** write replacement text that holds backslashes as a raw string (`r"""…"""`) or through a heredoc, and grep the written file for the exact new text after every scripted edit, not only for the anchor before it.
**Tags:** tooling, edits, escaping, verification
**Date:** 2026-10-16

### A green vitest run does not type-check the tests
**Pattern:** `vitest run` passed all 25 notes tests, but `tsc -b` then failed on `tree.test.ts`: a helper typed `string[]` was passed the `readonly string[]` constant `DEFAULT_EXPANDED` (TS4104). Vitest strips types with esbuild and never reports them, so the red only showed in the build gate (desktop-app/37, 2026-10-16).
**Rule:** after a test edit in `apps/desktop`, run `tsc -b` (or `pnpm -C apps/desktop build`) before calling the tests green. A passing vitest run proves runtime behaviour only.
**Tags:** testing, typescript, vitest, desktop-app, verification
**Date:** 2026-10-16

### A JSX attribute string does not process escapes
**Pattern:** a Python edit script wrote `title="Hide folders and tags (⌘\\)"` into a `.tsx` file. In a JSX attribute string, `\\` is two literal backslashes, so the tooltip would have shown `⌘\\`. A grep of the written file found it. This is the JSX variant of the non-raw-string lesson above (desktop-app/37, 2026-10-16).
**Rule:** write a backslash in a JSX attribute as one `\` (or as `{"⌘\\"}` in an expression). Grep the written `.tsx` for the exact rendered text after every scripted edit.
**Tags:** tooling, edits, escaping, jsx, verification
**Date:** 2026-10-16

### A shared dev server reloads under parallel agents and resets in-memory UI state
**Pattern:** during the browser check, other agents' edits to `App.tsx` and `components/ui/*` hot-reloaded the Vite app between `browser_evaluate` calls. That reset in-memory state: the session-only tree-column toggle closed, and a keyboard walk split over two calls lost its expanded node (desktop-app/37, 2026-10-16).
**Rule:** while other agents edit the same app, run each browser check (set up, act, assert) inside one `browser_evaluate`. When the state is unexpected, read `browser_console` for `hot updated` / `connecting...` before you debug your own code.
**Tags:** browser, verification, parallel-agents, vite, hmr
**Date:** 2026-10-16

### An unquoted glob in a grep flag fails under zsh before grep runs
**Pattern:** `grep -rn task-interop --include=*.md .` failed with `zsh: no matches found: --include=*.md`, because zsh expands the unquoted glob itself and aborts when nothing in the working directory matches. The search never ran, so a stale-link sweep could have reported "no hits" from an empty result (2026-10-16).
**Rule:** quote every glob that a tool should see literally (`--include='*.md'`), and treat a shell error from a gate command as a failed gate, never as "no matches".
**Tags:** tooling, zsh, grep, gates, verification
**Date:** 2026-10-16

### Hidden unit-test gap and shared browser tab
**Pattern:** the shadcn SidebarProvider writes a `sidebar_state` cookie but never reads it, so "persisted" sidebar state silently reset; and the shared browser tab was navigated by other agents mid-check, so evaluate/screenshot hit another origin's localStorage.
**Rule:** Own persisted UI state explicitly (read on init, write on change) and assert the origin (`location.origin`) in every browser check before trusting storage readings. A new vitest file written after its implementation proves nothing about red-first; write the test first.
**Tags:** persistence, sidebar, browser-verification, tdd
**Date:** 2026-10-17

### `open(p, "w").write(open(p).read())` truncates the file before it is read
**Pattern:** a Python one-liner `open(p,'w').write(open(p).read().replace(...))` evaluated the `'w'` open first, emptied `view-options.test.ts`, and wrote an empty file. The file was untracked, so git held no copy and 190 lines of tests had to be rewritten from memory and test names (desktop-app/40, 2026-10-17). A `sed -i` with a backtick in the pattern also failed ("unterminated substitute pattern") and changed nothing.
**Rule:** read the file into a variable first (`s = open(p).read()`), then write in a second statement. Before scripted edits to an untracked file, copy it to the scratchpad. Prefer the Edit tool for single-spot changes.
**Tags:** tooling, edits, python, untracked, data-loss
**Date:** 2026-10-17

### A shared browser tab is navigated away by parallel agents mid-check
**Pattern:** while verifying desktop-app/38-40, another agent navigated the shared task tab to its own dev server (port 5295) between two of my `browser_evaluate` calls, so a check ran against the wrong app and a reload reset state. Toasts with Undo also expire after about 4 s, so an Undo click in a later call found no button (2026-10-17).
**Rule:** open a check with `browser_navigate` to your own port, then run set up, act, Undo click and assert inside one `browser_evaluate` that first asserts `location.port`. Click Undo in the same call as the write it undoes.
**Tags:** browser, verification, parallel-agents, undo
**Date:** 2026-10-17

### A greedy class-prefix replace corrupts longer classes
**Pattern:** a scripted sweep replaced `bg-primary/6` with `bg-accent` and mangled `bg-primary/65` and `bg-primary/60` into `bg-accent5` and `bg-accent0`. Tailwind ignored the unknown classes, so the importance meter and a bullet lost their fill with no error. A grep for `bg-accent[0-9]` found them (desktop-app/41, 2026-10-17).
**Rule:** in scripted class replaces, match with a trailing boundary (`(?![\w/\[.-])`) or replace longest first. Grep the result for digits glued to the new class name.
**Tags:** tooling, edits, tailwind, regex, verification
**Date:** 2026-10-17

### A guard that checks files, or a test over aliases, cannot fail
**Pattern:** the reduced-motion guard passed a file once it called `useReducedMotion()` anywhere, so reverting one dialog patch stayed green; `nav.test.ts` compared three aliases of one function, and the real consumers (`GO`, `NAV`, the sidebar sections) were never asserted. A grouped list that repeats a multi-label task also broke j/k through `ids.indexOf` (desktop-app/35-41, 2026-10-17).
**Rule:** a guard checks each use, not each file. Prove it red by reverting one use and keeping the rest. A consumer test imports the list the consumer renders from, never an alias of the source. Dedupe any id list that drives cursor movement.
**Tags:** testing, guards, tautology, selection, verification
**Date:** 2026-10-17

### An inverse that is empty must not offer Undo
**Pattern:** dropping an unowned task on an assignee wrote `{owner}`, but the core cannot clear `owner`, so `inverseOf` returned `{}` and the toast still showed "Undo" for an empty update. A cancel Undo also sent `{status:"open"}` for a card that was done (desktop-app/38-40, 2026-10-17).
**Rule:** derive the toast from the inverse (`undoFor` returns null when nothing can be restored). An Undo restores the status the user saw, taken before any intermediate reopen.
**Tags:** undo, toast, patch, status
**Date:** 2026-10-17

### A one-line `sed` with `|` delimiters and `a` fails on macOS, and a new test can land in the wrong folder
**Pattern:** `sed -i 's|...|...|; 30a\` failed ("expects \ followed by text") and changed nothing, and an appended test block created `src/lib/patch.test.ts` where the suite lives in `components/task/` (2026-10-17).
**Rule:** use the Edit tool or a Python read-then-write for import rewrites. `ls` the test's folder before appending to it.
**Tags:** tooling, edits, sed, macos
**Date:** 2026-10-17

### A vendored animated counter can read its whole digit wheel aloud
**Pattern:** the animate-ui `SlidingNumber` renders a 0–9 column per digit place. Every sidebar count reached the accessibility tree as "0 1 2 3 4 5 6 7 8 9", once per count. Tests, lint, the build, an Opus review and an adversarial browser check all passed over it. It showed up only in a `browser_snapshot` of the sidebar taken for an unrelated reason (2026-10-17).
**Rule:** when a vendored animated component renders more DOM than it means, wrap it in `aria-hidden` and give the value once in an `sr-only` span. Read the accessibility snapshot of every new animated surface before calling it done; a screenshot cannot show this.
**Tags:** accessibility, animate-ui, vendored-components, verification
**Date:** 2026-10-17

### Headless Chrome screenshots of a live SSE app capture the loading skeleton
**Pattern:** `chrome --headless=new --screenshot --virtual-time-budget=8000` never returned, because the app keeps an EventSource open. With `--timeout` it returned a picture of the loading skeleton with collapsed motion sections, at both 6 s and 15 s. The villain-layer `browser_screenshot` returns an image but cannot save it to a path (2026-10-17).
**Rule:** do not plan README screenshot refreshes on headless Chrome or the villain-layer browser. Use a tool that drives a real page and saves PNGs, such as a Playwright script, or ask the owner to capture them. Never replace the PNGs with lossy captures.
**Tags:** screenshots, docs, headless, tooling
**Date:** 2026-10-17

### A negative limit is not universally "unbounded"
**Pattern:** Shards sent `indexed index search --limit -1` whenever it wanted every candidate (any active filter, `--limit=-1`, and `memory recall`'s hard-coded `-1`). The real `indexed` CLI turns `--limit N` into `max_docs = N` and `max_chunks = N*3`, so a negative value satisfies both caps on the first check and prints a *valid empty envelope* at exit 0. Shards treats a successful empty envelope as authoritative, so every filtered search and every `memory recall` on the indexed branch was silently empty. The argv tests pinned `--limit -1`, so the suite stayed green.
**Rule:** never assume another CLI shares our sentinel semantics. Verify every magic value (`-1`, `0`, `*`) against the real binary, and never let a stub echo its payload without modelling the child's edge cases. Pin the sentinel in a unit test (`the_indexed_fetch_limit_is_never_negative`) and prove the failure with a stub that reproduces the child's behaviour (`fake_indexed_rejecting_negative_limits`).
**Tags:** search, indexed, cli-contract, limits, testing
**Date:** 2026-10-24

### Describing a dependency is part of the contract
**Pattern:** the spec, `AGENTS.md` and `config.example.toml` called `indexed` a "hybrid lexical+vector" engine. It is dense-vector only: no BM25, no query-time filters, no graph, no write surface. The wrong description hid the real failure mode (exact identifiers depend on the built-in fallback) for several releases.
**Rule:** when a spec names an external capability, verify it against that project's current code, not its README or our own history. Keep the config key for compatibility and correct its description.
**Tags:** spec, indexed, documentation-drift, search
**Date:** 2026-10-24

### Signed commits fail when the SSH agent is locked
**Pattern:** this repo signs commits with SSH (`gpg.format ssh`, `commit.gpgsign true`) through the Bitwarden agent at `~/.bitwarden-ssh-agent.sock`. With Bitwarden locked, `git commit` failed with `error: Couldn't get agent socket?` and `fatal: failed to write commit object`, both from the sandbox and outside it. `ssh-add -l` said `Connection refused` (2026-10-17).
**Rule:** before committing or pushing, run `ssh-add -l` against that socket. If it is refused, ask the owner to unlock Bitwarden. Never turn signing off to get a commit through.
**Tags:** git, signing, ssh-agent, push
**Date:** 2026-10-18

### Adapter contracts need the installed schema and observed host payload
**Pattern:** the Exa skill example omitted the installed tool's required `objective` field, so the first research call failed validation. The Claude hook probe also showed that successful `tool_response` values are JSON strings and failed MCP calls emit `PostToolUseFailure`, rather than the raw MCP success envelope an adapter could assume.
**Rule:** inspect the installed tool schema before calling it. Capture valid events from the actual host version before writing an adapter. Keep success, failure and mocked-model evidence distinct, and verify lifecycle writes through the canonical reader.
**Tags:** harness, hooks, mcp, schemas, fixtures, verification
**Date:** 2026-10-30

### A valid fixture starts with the producer's state
**Pattern:** the first harness-state tests modeled a claimed task as `status:open` plus `claimed_by`, and all 25 tests passed. Replaying an observed real claim with `status:claimed` then failed the new binding gate. JSON-null and parent-directory-symlink edge tests also exposed assumptions that the happy-path fixtures did not exercise.
**Rule:** build valid fixtures from the actual producer contract before mutating one field per invalid case. Include a saved producer result at integration boundaries. Distinguish a missing file from JSON null, and validate every runtime directory component before following it.
**Tags:** harness, fixtures, contracts, testing, null, symlinks
**Date:** 2026-10-30

### Callback generations also need causal execution context
**Pattern:** a binding could not end, then a generation-only fix allowed a claim reserved before retirement to reopen it afterward. A delayed checkpoint also cleared work that started after the checkpoint request.
**Rule:** record immutable call context before the external operation. Check its task, generation, retirement reference and input digest when the result arrives. A checkpoint covers only its captured work sequence. Retire local ownership separately from the task's terminal state, and label externally observed completion as an observation rather than a fictional successful call.
**Tags:** harness, concurrency, generations, callbacks, checkpoints
**Date:** 2026-10-30

### Package schema guidance does not prove installed hook discovery
**Pattern:** the installed Codex parser preview exposed no hooks for portable declarations, including invalid ones, while a legacy-only manifest exposed them. Adding a portable root manifest beside the working legacy declaration hid the preview again.
**Rule:** test the target client's actual package discovery. Keep tested host artifacts separate when their discovery rules conflict. Distinguish parser preview, executed probes and activated candidate behavior; do not infer older version support from one tested release.
**Tags:** harness, packaging, hooks, compatibility, verification
**Date:** 2026-10-30

### The MCP and guard must resolve the same effective configuration
**Pattern:** Codex launched packaged MCP from its cached plugin directory, so project-directory discovery missed enrollment. Forcing only the guard's CLI reader onto the enrolled config could leave the MCP on another vault.
**Rule:** inspect real process context rather than assuming project CWD. Compare inherited and selected effective contexts before writes. Pin the existing `SHARDS_CONFIG_PATH` for both processes when needed; never silently retarget only one side.
**Tags:** harness, mcp, config, cwd, integration
**Date:** 2026-10-30

### Integration checks must be portable and cover the complete affected suite
**Pattern:** focused bundle checks passed while a lens test still pinned the old hook command. Runtime tests used one machine's temporary binary path and inherited actor/vault overrides, which could change their target.
**Rule:** derive test binaries from the repository or explicit test configuration. Remove inherited Shards and legacy overrides before selecting a temporary vault. Run the whole affected suite before completion, and exercise hook behavior instead of retaining obsolete source-string pins.
**Tags:** harness, testing, portability, environment, verification
**Date:** 2026-10-30

### An ignored search result is not a missing file
**Pattern:** discovery commands assumed several source filenames and searched the ignored SDD directory without including ignored files, producing missing-path errors or an incorrect inference that the coordination directory did not exist.
**Rule:** discover actual filenames before reading guessed paths. Check optional roots exist. Use explicit hidden/ignored search options only within the intended scope, and distinguish no matches from a missing directory.
**Tags:** tooling, discovery, ignored-files, verification
**Date:** 2026-10-30

### Receipt limits must preserve an executable exit path
**Pattern:** ordinary admitted work filled the receipt's event limit, so a real checkpoint and retirement could no longer record their success. Carrying every event into each next generation made the limit permanent. Two old tests pinned that cumulative storage detail instead of replay safety. A later regression showed that a delayed active-claim result could still consume retirement headroom after its earlier PRE admission. A first legacy-state fixture also attempted to create old state through the newly restricted work-admission path.
**Rule:** reserve checkpoint and retirement headroom before admitting work. Support already-valid full persisted state. Keep each active generation bounded and retain retired-generation evidence for replay checks. Verify last admitted work through actual checkpoint, retirement and next binding, including delayed/failed callbacks and partial persistence. Build legacy recovery fixtures independently from the new admission rule.
**Tags:** harness, capacity, recovery, generations, testing
**Pinned-by:** src/bin/harness/state_tests.rs::legacy_4096_references_still_checkpoint_retire_but_cannot_admit_claim_or_work
**Date:** 2026-10-30

### Invocation guards must distinguish commands from literal arguments
**Pattern:** a substring guard denied harmless searches for the documented operator-exception flag. The replacement's first tests also exposed shell newline, env-option and combined shell-option invocation cases.
**Rule:** classify the actual entrypoint invocation, then test literal searches, reads and test commands through normal permissions. Retain positive invocation cases for supported shell wrappers and exact one-use external grants; never emit a native permission allow decision.
**Tags:** harness, classifier, permissions, testing
**Pinned-by:** src/bin/harness/shell.rs::tests::literal_search_read_and_test_are_work
**Date:** 2026-10-30

### Targeted reads and tests require actual paths and filter syntax
**Pattern:** targeted reads guessed absent tests/mcp.rs and README/research paths; an optional vibe directory was read without checking it existed. The real integration file was tests/mcp_cli.rs. A unittest -k filter used a regex alternation, selected no tests and exited 5.
**Rule:** discover exact filenames with rg --files before targeted reads, check optional paths exist and use unittest substring filters separately. A zero-test result is a failed verification, never a green gate.
**Tags:** tooling, discovery, testing, verification
**Date:** 2026-10-30

### Delayed checkpoints need capacity as well as sequence guards
**Pattern:** the first capacity fix kept a retirement slot but let a same-generation delayed checkpoint consume the final append slot while newer work remained dirty. Sequential recovery, prior-generation replay tests and the full suite passed; independent re-review reproduced the remaining dead-end.
**Rule:** judge lifecycle headroom against the proposed receipt's work/checkpoint relationship, not only its reference count. A callback that leaves newer work dirty cannot consume the current-checkpoint recovery slot. Reject that receipt mutation without advancing its captured sequence or deleting its original reservation. Exercise overlapping and repeated stale callbacks, including callbacks older than recorded checkpoint evidence, through actual current checkpoint, retirement and next binding.
**Tags:** harness, capacity, checkpoints, concurrency, review, testing
**Pinned-by:** src/bin/harness/state_tests.rs::dirty_delayed_checkpoints_leave_current_work_slot_at_capacity
**Date:** 2026-10-30

### Runtime prerequisites must be explicit before implementation
**Pattern:** the local harness introduced Python3.11 despite the repository's Rust architecture. The owner rejected that choice after implementation and required TypeScript tooling with maximal Rust reuse. Passing tests and mentioning a prerequisite inside a long plan did not establish informed agreement on that architectural choice.
**Rule:** state language, deployed runtimes, build-only tooling and new dependencies plainly before coding. Prefer the existing core and stack. Separate a necessary interface decision from implementation convenience. Record the choice where the owner can readily review it.
**Tags:** architecture, harness, dependencies, approval, communication
**Date:** 2026-10-31

### Port tests must use the actual boundary producer
**Pattern:** two native subprocess tests used CLI claim/append summaries as MCP success data. Those summaries lacked the MCP task shape, so no receipt was created and later work was correctly denied. The tests passed after driving the actual MCP dispatcher and wrapping its real result in each observed host envelope. Native serde tests also found missing Option fields and ASCII DEL accepted differently from the previous strict codec.
**Rule:** preserve every producer/consumer contract during a language rewrite. Use actual MCP output for MCP evidence, golden serializer bytes for identity hashes and explicit required-field checks for persisted records. A passing in-process policy fixture does not establish whole-process adapter correctness.
**Tags:** harness, native, fixtures, serialization, integration, testing
**Date:** 2026-10-31

### Tooling changes must preserve path and module portability
**Pattern:** a Node Markdown template failed parsing on unescaped backticks before writing files. Targeted reads guessed a not-yet-published interface and a wrong reference path. Moving package tests from /private/tmp to the platform temporary directory initially followed the macOS /var alias and triggered the intended symlink refusal. Node also inherited a parent package's missing module type.
**Rule:** use literal patches for Markdown, wait for interface readiness and discover exact paths before reads. Resolve the platform temporary root before applying no-symlink policies. Declare TypeScript tooling's module type locally instead of editing user-level configuration. Report failed test selections and intermediate failures in the same cycle.
**Tags:** tooling, portability, paths, typescript, testing
**Date:** 2026-10-31

### Private-store checks must cover the production entrypoint
**Pattern:** direct native store tests rejected directory symlinks, but the binary canonicalized its runtime path first and hid those links from NOFOLLOW traversal. A real subprocess wrote exception records through an intermediate link. Source builds also printed a package-relative recovery executable that did not exist. The first full suite hit an unrelated watcher test trying to write under the real user home.
**Rule:** preserve raw configured runtime components until anchored validation; keep deliberate vault/project canonicalization separate. Test the actual binary boundary and emitted recovery command. Give whole-suite tests an isolated XDG_RUNTIME_DIR instead of allowing writes under operator state.
**Tags:** harness, filesystem, integration, recovery, environment, testing
**Date:** 2026-10-31

### Permanent anchors need exclusive first publication
**Pattern:** a native two-process race reproduced ENOENT during concurrent first openat CREATE/NOFOLLOW of a Darwin lock anchor, while descriptor and directory-entry checks proved the directory and newly published anchor remained present. Precreating the anchor passed, and restoring concurrent first creation reproduced the failure.
**Rule:** open an existing permanent anchor first. If absent, create it exclusively; on an existing-file collision, reopen the published anchor. Keep regular-file identity checks before and after flock, preserve lock order and never unlink/reclaim anchors. Test repeated fresh-anchor process races, not only existing anchors.
**Tags:** harness, locks, concurrency, portability, filesystem, testing
**Date:** 2026-10-31

### Integration verification needs the relevant operating-system capability
**Pattern:** an existing watcher test passed only after normal approval for macOS filesystem-event access. An existing host port-sweep test similarly failed to bind its temporary loopback socket inside the sandbox and passed with approved loopback access. Neither required changing production code. The native core and host suites then passed in full with temporary runtime state.
**Rule:** distinguish an environment denial from a product regression using the exact focused test and its failing operation. Keep test state isolated, request normal execution capability when necessary and rerun the affected full suite. Never skip or weaken a test to report a green result.
**Tags:** verification, sandbox, filesystem-events, loopback, testing
**Date:** 2026-10-31

### Wrap-up gates need an isolated baseline and exact artifact discovery
**Pattern:** the first pre-merge audit mixed nine new temporary harness documents with fourteen pre-existing drift errors. Its table parser also read dependency cells such as `14 DONE` as feature completion. The GitHub connector lacked repository access, and sandboxed CLI/signing probes could not reach their services. Promotion matched design and plan suffixes separately.
**Rule:** baseline audit failures against the base tree before changing scope. Clarify ambiguous dependency prose without declaring unfinished features complete. Discover every bound artifact, preserve durable research outside temporary feature paths and repair live links before deletion. Use an authorized service CLI and normal capability approval when a connector or sandbox cannot perform an approved action.
**Tags:** spec, compounding, baseline, tooling, git, verification
**Date:** 2026-10-31

### Keep isolated work in the current chat unless a separate chat is explicit
**Pattern:** An inspection request said "new task and worktree". I created a second user-visible chat instead of attaching a worktree and using subagents in the current chat. The owner corrected the coordination model.
**Rule:** Use the current chat as coordinator, attach the requested worktree here, and delegate research to subagents. Create a separate chat only when the owner explicitly requests a separate chat.
**Tags:** workflow, worktrees, delegation, codex
**Date:** 2026-10-28

### Visual QA must exercise the user's actual browser and interaction states
**Pattern:** The first Flint pass had green tests and neutral screenshots, but the owner found
hover actions painted over task metadata, cramped sidebar trays, stale app icons and a stacked
Notes selector. The follow-up also found labels overlapping projects at narrow widths and a
title vertically centered below its checkbox when metadata wrapped. A native-app detour did
not inspect the built-in browser where the owner was using the app.
**Rule:** Delegate visual inspection in the requested browser surface. Inspect actual hover,
selected and keyboard-focus screenshots with rich and minimal metadata in both themes and
widths. Assert text/action nonintersection and title/checkbox first-line alignment. Check the
layout's actual parent: outer gaps do not space children inside another block wrapper. Include
favicon and generated native icon variants in a visual identity change. Green accessibility
checks do not replace this inspection. Built-in-browser tabs are chat-scoped; a reviewing
subagent can use the same URL in its own built-in-browser tab while leaving the owner's tab
untouched. Use current DOM accessible names and scroll a control into view before acting.
**Tags:** visual-qa, browser, subagents, css, hover, icons
**Date:** 2026-10-28

**Coordination follow-up:** A message to a completed subagent only queued the verification
request. Use `followup_task` to start another turn; do not wait for work that has not started.

### Migrate component test callers and use app inventory for native discovery
**Pattern:** Adding NotesTree mode props initially broke its static-render test callers at build
time. A process-list command was sandbox-denied while dedicated app inventory was available.
An icon patch attempted delete/add of the same path, and a visual test patch used an outdated
anchor; both atomic patches were rejected without partial changes.
**Rule:** Trace every typed component consumer, including tests, when changing props. Prefer
the app inventory for application state; use known permission scope for process checks.
Replace existing asset files in a single update hunk and copy current patch anchors exactly.
**Tags:** react, typescript, fixtures, tooling, patches, sandbox
**Date:** 2026-10-28

### Separate worktree environment failures from baseline defects
**Pattern:** A fresh managed worktree lacked a complete offline pnpm cache. A normal install could not resolve the registry in the sandbox. Vite and TypeScript could not write caches in the new worktree, and a host test could not bind loopback. The same locked install and checks passed with the required permissions.
**Rule:** Check dependency-cache availability and the active sandbox roots before setup. Request the required worktree-write, registry or loopback scope for the relevant command. Report environmental failures separately from product failures, then verify the baseline again with the required scope.
**Tags:** worktrees, sandbox, pnpm, baseline, verification
**Date:** 2026-10-28

### Discover the reader file before opening it
**Pattern:** A read command guessed `apps/desktop/src/views/notes/NoteReader.tsx`; that file does not exist. The preceding code trace had not established that path.
**Rule:** Find the exact path with `rg --files` or a symbol reference before reading an unfamiliar implementation file. Do not infer a filename from a component's role.
**Tags:** discovery, tooling, paths, inspection
**Date:** 2026-10-28

**Implementation follow-up:** Repeated guessed paths included `detail.ts`, `selection.ts`,
`api/task.ts`, `api/http.ts`, `router.tsx`, a vendored sheet path and `a11y/flint.mjs`.
Use the exact discovered path rather than retyping a presumed extension. Quote shell globs:
unquoted discovery globs also failed under zsh. Read the tool's argument schema before calling
it; exploratory Exa and Yab calls used a missing objective and `script` instead of `js`.

### Spec validation does not verify Markdown presentation or whitespace
**Pattern:** The Flint draft passed structural spec validation, but `git diff --check` caught a blank line at EOF. Self-review also found new requirement rows separated from their table by a blank line.
**Rule:** After scripted spec edits, normalize the final newline, inspect table continuity, and run both spec validation and `git diff --check`. Structural validation alone does not prove the document is reviewable. Create referenced evidence
files before validating links; a mid-edit validation caught two links to an evidence file not yet written.
**Tags:** spec, docs, generation, validation, whitespace
**Date:** 2026-10-28

### Trace UI guarantees through their actual state owners
**Pattern:** The Flint plan passed an ambiguity review but a source-level review found three gaps: responsive detail branches remount local editor drafts, project board state never reached global Focus eligibility, and cmdk would not match assignment entries for the reference query "hand".
**Rule:** Before plan approval, trace each interaction guarantee through its real state owner and consumer. Add executable cross-boundary cases for responsive drafts, view eligibility and palette filtering rather than testing helper predicates alone.
**Tags:** review, planning, react, state, responsive, cmdk
**Date:** 2026-10-28

### Validate each patch hunk against its named file
**Pattern:** A multi-file spec patch placed a product-scenario anchor under the design file. Patch verification rejected it before any files changed.
**Rule:** Keep each hunk with a verified anchor from its named file. After a patch failure, inspect the working tree before retrying and reapply only the corrected hunks.
**Tags:** tooling, patches, docs, verification
**Date:** 2026-10-28

**Implementation follow-up:** Avatar capitalization, ScratchView context and a Sidebar section
class were also incorrect patch anchors. Copy the current anchor from the file immediately
before patching. A rejected atomic patch does not prove that any of its hunks were applied.

### Destination identity includes route parameters
**Pattern:** The Focus review found that a route-name registration would miss Project A to Project B navigation because the current router keeps ProjectView mounted for the same route name.
**Rule:** Key destination-specific UI state by the full route path, including project or label ids. Test parameter-only navigation separately from query-only filters and detail state.
**Tags:** routing, react, state, testing, focus
**Date:** 2026-10-28

### Responsive focus restoration must wait for the mounted consumer
**Pattern:** Task drafts survived a wrapper replacement but lost focus. Restoring only from
Radix's autofocus event then lost memory and scratch selection because React had already
focused those editors, so Radix did not emit that event.
**Rule:** Capture editing state before replacement. Retry restoration until the requested field
mounts, and suppress competing autofocus and layout-driven blur saves. Verify text, editing
mode, focus, selection, both scroll positions and zero mutations through the full resize cycle.
**Tags:** react, focus, radix, responsive, testing
**Date:** 2026-10-28

### Retain source snapshots even when an editor is untouched
**Pattern:** Title drafts initially had no source baseline. After adding conflict warnings, an
untouched task title still overwrote a concurrent rename on blur because it was not dirty.
The title's former local render-time state adjustment also became an invalid shared-store
broadcast when draft state moved above the responsive wrappers.
**Rule:** Derive idle display values without publishing during render. Capture the edit source,
discard untouched drafts without a write, and require an explicit choice after a dirty source
changes. Test external invalidation through the actual transport and query consumers.
**Tags:** react, concurrency, drafts, state, review
**Date:** 2026-10-28

### Verify rendered boundaries and real semantic containers
**Pattern:** Opaque tokens passed contrast tests while sidebar alpha text and neutral checkbox
alpha borders failed rendered AA. Real board coverage also found composers inside a semantic
task list; the previous harness never selected the board layout. Palette selection remained
stale after route/filter changes, and detail width variants retained a 640px breakpoint.
**Rule:** Test composited control colors and actual layout bounds across palettes. Mount each
claimed view mode. Keep non-item controls outside lists and resolve task context only from a
current visible row or valid detail. Do not enlarge accessibility allowances to pass a check.
**Tags:** accessibility, css, contrast, semantics, cmdk, verification
**Date:** 2026-10-28

### Verify assets and browser fixtures against untrusted keys and actual contracts
**Pattern:** An artwork dictionary returned inherited Object.prototype properties for unknown
ids. Browser tests also failed on absent Chromium 1248 while 1234 was cached, wrong pnpm test
argument forwarding, a wrong agent ordering expectation, broad `/api/**` interception of Vite
modules, outdated selectors, platform-specific shortcuts and incomplete fixture task filters.
Repeated loopback/process checks hit sandbox EPERM; renaming a TSX module left Vite's live
module-resolution cache pointing at its former extension. Stale browser refs then failed.
**Rule:** Use own-key lookups for identity maps. Inspect installed browser paths, pass test paths
to the runner directly, scope API mocks to call endpoints, model filters, and wait for the
actual consumer. Scroll fixtures need enough real, correctly parented content and must wait
for both scrollers to overflow before capturing nonzero offsets. Use the platform's modifier and fresh refs; stale refs and already-closed tabs cannot be reused. Derive note paths from host metadata rather than the space layout. Restart Vite after module moves,
and request known process/loopback scope before rerunning environmental failures.
**Tags:** assets, identity, fixtures, browser, tooling, sandbox
**Date:** 2026-10-28

### JSX shortcut labels do not interpret JavaScript string escapes
**Pattern:** Browser screenshots showed two backslashes in the Focus shortcut hint because a
quoted JSX attribute contained two literal slashes. The registered shortcut itself was correct.
**Rule:** Pass escaped shortcut strings through a JavaScript expression and inspect the rendered
keyboard hint as well as the event binding.
**Tags:** react, jsx, keyboard, visual-review
**Date:** 2026-10-28

### Align the whole first-line track, not only title and checkbox
**Pattern:** Follow-up screenshots showed 28px row actions sitting 4px below 20px title/avatar
content even though earlier overlap and title/checkbox checks passed. The task detail header
also mixed nested action placement, 12px insets and 4/8px gaps. A source-only reading initially
inferred the wrong offset direction; actual browser bounds established it. During verification,
the known loopback restriction, a guessed Linux Chromium cache path and stale preview output
caused failed runs before the correct environment and rebuilt assets were used.
**Rule:** Measure title, checkbox, metadata, avatar and action centers together. Keep a common
first-line track when metadata wraps. Put header actions in an explicit group with consistent
insets/gaps. Use the confirmed browser path and loopback scope, rebuild preview assets after
source changes, and distinguish a test-fixture route/filter error from a product failure.
**Tags:** css, padding, visual-qa, testing, sandbox
**Date:** 2026-10-28

### Responsive drafts must retain pending submissions
**Pattern:** Final review found shared drafts surviving responsive remounts while component-local
pending flags and mutation callbacks did not. A delayed comment test reproduced two appends and
erasure of a newer draft. Memory and scratch append callbacks also disappeared on unmount.
The first scratch correction compared its source timestamp with an intentionally omitted overwrite
precondition, so successful overwrites did not close the editor.
Handoff checks also queried guessed source/optional-flow paths and used a paraphrased patch
anchor. Those operations failed without changing files; discovered paths and exact anchors
were used before retrying.
**Rule:** Store pending state with the target-scoped draft. Await mutation promises when completion
must survive unmount. Clear or close only the submitted editor snapshot; keep request preconditions
separate from snapshot identity. Test delayed requests across responsive boundaries, including
repeat submission and edits before completion. Check optional paths before reading them.
Check staged new files too: the unstaged diff omitted original whitespace in newly added
reference/license artifacts. Keep verbatim source exceptions explicit.
**Tags:** react, responsive, drafts, mutations, review, testing, tooling
**Date:** 2026-10-29

### Accessibility names must cover platform-specific visible labels
**Pattern:** Local macOS scans missed the Focus control's Ubuntu failure. Its explicit
accessible name excluded the visible Ctrl shortcut, while the macOS command symbol disappeared
from axe's comparison. The active Quiet label also differed from its accessible name. A package
inspection additionally assumed a transitive Playwright package was hoisted; pnpm keeps it nested.
**Rule:** Derive text-button names from their contents. Retain screen-reader text when a narrow
layout hides the visual label. Test Mac and Linux shortcut labels, both toggle states and mobile
widths. Keep label/name and empty-button checks enabled. Resolve transitive packages through
their importer or discover their actual package paths.
**Tags:** accessibility, ci, keyboard, platforms, testing, pnpm
**Pinned-by:** Focus button labels match visible text on MacIntel and Linux x86_64
**Date:** 2026-10-30

### Merge current contracts without discarding either lesson set
**Pattern:** bringing the harness PR up to current main produced five documentation conflicts: four current-date/status overlaps and two independently appended sets of lessons. Keeping one side wholesale would have removed either the harness contract or the already-merged desktop decisions.
**Rule:** resolve each conflicting section by its owner. Preserve both append-only lesson sets, the current live feature status and the latest edited date. Re-run structural and drift checks, then execute the affected suites on the combined tree before pushing.
**Tags:** git, merge, spec, lessons, verification
**Date:** 2026-10-31

### Check merge whitespace against the actual review base
**Pattern:** checking the merge index against its first parent reported three whitespace defects already present in main's bundled font licenses and HTML reference. The same files were byte-identical to main, and the actual PR delta passed the whitespace check.
**Rule:** validate the final PR delta against its target branch. Verify inherited findings with an exact file comparison, record their baseline and preserve imported assets. Do not mistake all changes arriving through a merge for new feature changes.
**Tags:** git, merge, baseline, whitespace, verification
**Date:** 2026-10-31

### Installation complexity is part of harness usability
**Pattern:** the harness bundled MCP, skills and hooks, but explaining build, per-host packaging, marketplace registration, trust, configuration and enrollment exposed an excessive operator setup flow. The owner accepted this source change and deferred a single install command to a follow-up PR.
**Rule:** evaluate installation as one operator workflow before rollout. Keep internal packaging steps behind a clear entrypoint while preserving explicit trust and enrollment decisions. Report source delivery and observed activation separately.
**Tags:** harness, installation, usability, packaging
**Date:** 2026-10-31

### Reproduce the exact CI compiler invocation and working directory
**Pattern:** strict TypeScript checks passed from the repository root, but CI ran the same explicit source files from apps/desktop. TypeScript 7 detected that directory's tsconfig.json and exited with TS5112 before checking them. The isolated tooling check needed --ignoreConfig, while retaining all explicit strict flags and Node types. A dependency-directory symlink also failed pnpm's real-hoist-directory check; the exact replay required a locked dependency install in the worktree.
**Rule:** run the actual CI command from its actual working directory with its real dependency layout. Explicit-file checks that intentionally exclude a nearby project configuration must state that choice. A direct compiler run from a different directory does not verify the package-manager integration.
**Tags:** ci, typescript, working-directory, tooling, verification
**Date:** 2026-10-31
