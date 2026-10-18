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
