---
type: feature-plan
feature: shards-rebrand
sibling: tech.md
parent: ../../flows/delivery/README.md
updated: 2026-11-17
---

# Feature: Shards Rebrand — Implementation Plan

This feature renames mesh to Shards across the tree and keeps one release of read-side compat for
`MESH_*` and `~/.mesh/`. The mechanical rename and the compat helpers are done and committed on
`main` (`Cargo.toml:18` `name = "shards"`, 29fc017), and the migration note is written (/7 DONE,
`README.md:91`). The open work hardens and proves the compat contract, makes deprecation visible
and runs the residue gate; the product version is `0.1.0` and v0.1.0 shipped 2026-11-02. The
fallback removal is planned here and executes at the 0.4.0 release.

> For agentic workers: execute units in Seq order via superpowers:executing-plans. Units marked
> DONE carry the evidence that closed them. Do not redo them.

**Parent:** [../../plan.md](../../flows/delivery/README.md)
**Requirements:** [product.md](product.md)
**Architecture:** [tech.md](tech.md)

**Feature gate:** Feature 14 has no upstream. It is DONE when units /1–/8 are DONE (root plan § Gate
details). Unit /9 is a scheduled follow-up, tracked as a root known gap after compound.

---

## Problem Frame

A blind replace already produced a building, green tree. Three things are still unproven or
missing. First, the compat helpers have no tests. Second, the test harness does not clear the
legacy variables that the fallback now reads. Third, the user-facing migration (notice, `init`
behaviour, upgrade note, version) is not done. `cargo fmt --check` also fails, because the rename
changed import sort order and line widths. Order: prove the contract first (/3, /4), then add the
visible behaviour (/5), then the release hygiene (/6–/8).

---

## Requirements Trace

| ID | Requirement | Units |
|---|---|---|
| R1 | [One product name everywhere](product.md#requirement-one-product-name-everywhere-r1) | shards-rebrand/1, shards-rebrand/8 |
| R2 | [Canonical environment variables](product.md#requirement-canonical-environment-variables-r2) | shards-rebrand/1, shards-rebrand/3 |
| R3 | [Legacy environment fallback for one release](product.md#requirement-legacy-environment-fallback-for-one-release-r3) | shards-rebrand/2, shards-rebrand/3 |
| R4 | [Legacy home directory fallback for one release](product.md#requirement-legacy-home-directory-fallback-for-one-release-r4) | shards-rebrand/2, shards-rebrand/3, shards-rebrand/5 |
| R5 | [No aliases for old tool or binary names](product.md#requirement-no-aliases-for-old-tool-or-binary-names-r5) | shards-rebrand/1, shards-rebrand/3 |
| R6 | [Deprecation is visible](product.md#requirement-deprecation-is-visible-r6) | shards-rebrand/5 |
| R7 | [Vault data is untouched](product.md#requirement-vault-data-is-untouched-r7) | shards-rebrand/1, shards-rebrand/3 |
| R8 | [Fallbacks are removed in the next minor release](product.md#requirement-fallbacks-are-removed-in-the-next-minor-release-r8) | shards-rebrand/9 |
| R9 | [Residue gate](product.md#requirement-residue-gate-r9) | shards-rebrand/4, shards-rebrand/8 |

---

## Key Technical Decisions

1. **The compat window is 0.3.x. Removal ships in 0.4.0.** The version numbers make R8 testable.
   The rename release bumps 0.2.0 → 0.3.0. *(Measured 2026-11-17: the rename shipped as `0.1.0`,
   v0.1.0 on 2026-11-02, so this step did not happen. Which release the rebrand lands in is the
   open finding in /6.)*
2. **Fallback is read-side and per item.** No tool aliases, no binary aliases, no lock fallback.
   Rationale: research codebase §4.3 and decision D1.
3. **Notices go to stderr, once per legacy source per process.** The stdout contracts (`--json`,
   MCP JSON-RPC) are byte-stable.
4. **`init` never writes under `~/.mesh/`.** A legacy config blocks `init` without `--force`, the
   same as a canonical one. With `--force`, `init` writes the canonical file.
5. **The residue gate uses `git grep -i` substring matching**, never `rg -w`. The word-boundary
   form misses `mesh_*` and `MESH_*`. This supersedes the `rg -w mesh` check in the root plan's
   14-DONE gate.

---

## Global Constraints

- Gates for every unit: `cargo fmt --all --check`, `cargo clippy --all-targets --locked -- -D
  warnings`, `cargo test -p shards`.
- Units /3 and /4 change tests and harness only. They change no product behaviour.
- No new dependency. `serial_test` and `tempfile` are already dev-dependencies.
- Do not edit `docs/spec/lessons.md` history lines that mention `shards`/`mesh` (pre-September
  history). Add a new lesson in /8.

---

## Unit IDs

Units are `shards-rebrand/n`. The IDs are never renumbered. Cite them in commits:
`refactor(config): shards-rebrand/5 …`.

---

### shards-rebrand/1 — Mechanical rename

**Status:** DONE (2026-10-15; committed on `main` in 29fc017)

**Goal:** Every name in code, tests, plugin, scripts, CI and docs is the Shards name.

**Requirements:** R1, R2, R5, R7

**Dependencies:** —

**Files:**

```
Cargo.toml Cargo.lock src/** tests/** plugins/shards/** .claude-plugin/marketplace.json
scripts/** .github/workflows/ci.yml hooks/session_start.json README.md AGENTS.md docs/concepts.md
config.example.toml .gitignore clippy.toml
```

**Test scenarios:**

- The binaries are `shards` and `shards-mcp`. The MCP server reports `shards`, and `tools/list` has
  42 `shards_*` names (`tests/mcp_cli.rs`).
- The plugin bundle points at `shards-mcp` (`tests/bundle.rs`).
- The compatibility corpus reads unchanged (`tests/compat_corpus.rs`).

**Verification (evidence, 2026-10-15).** These results come from the whole working tree. A
parallel task-model-v2 pass may already have put hunks into that tree. Unit /8 proves the rename
again on the staged rename content alone.

- `cargo build --all-targets` → `Finished`.
- `cargo clippy --all-targets --locked -- -D warnings` → `Finished`, no warnings.
- `cargo test` → passed.
- `SHARDS_BIN=./target/debug/shards ./scripts/smoke.sh` → passed.
- `git grep -n -i mesh -- . ':!docs/spec' ':!Cargo.lock'` → 6 hits, all in `src/config.rs` compat code.

---

### shards-rebrand/2 — Compat helpers wired in

**Status:** DONE (code). The proof is in /3.

**Goal:** `config::env_var` and `config::home_path` back every `SHARDS_*` read and every
`~/.shards` default.

**Requirements:** R3, R4

**Dependencies:** shards-rebrand/1

**Files:**

```
src/config.rs           # env_var(), home_path(); resolve_config_path, from_table use them
src/search/indexed.rs   # indexed bin + timeout via env_var
src/cli/admin.rs        # default_vault_path, init agent default via env_var/home_path
```

**Test scenarios:** covered by /3.

**Verification:** `grep -rn 'env::var(' src` → only `config::env_var` itself plus non-product
variables (`EDITOR`, `VISUAL`, `XDG_RUNTIME_DIR`). No `SHARDS_*` value is read directly, so every
read goes through `env_var` (checked 2026-10-15).

---

### shards-rebrand/3 — Compat contract tests

**Status:** NOT STARTED (2026-10-16: `tests/compat_env_cli.rs` does not exist)

**Goal:** Pin the fallback rules from product R2–R5 and R7 with unit and CLI tests.

**Requirements:** R2, R3, R4, R5, R7

**Dependencies:** shards-rebrand/2

**Files:**

```
src/config.rs              # home_path_in(home, leaf) seam; #[serial] unit tests for env_var/home_path
tests/compat_env_cli.rs    # NEW: binary-level fallback scenarios with HOME pointed at a tempdir
tests/mcp_cli.rs           # assert no tools/list name starts with "mesh_"; calling mesh_task_list → unknown tool
```

**Test scenarios:**

- `SHARDS_AGENT` wins over `MESH_AGENT`. An empty `SHARDS_VAULT` falls through to `MESH_VAULT`.
  `MESH_AGENT` alone sets the owner.
- Only `~/.mesh/config.toml` exists → `shards status` loads it. Both exist → the canonical one.
  `~/.shards/config.toml` and `~/.mesh/vault` mix per leaf.
- A 0.2.0 vault fixture copied in and read with `status`, `task list` and `note list` keeps a
  byte-identical tree hash.
- `mesh_task_list` over MCP → unknown-tool error.

**Verification:** `cargo test -p shards config::tests` and `cargo test -p shards --test
compat_env_cli` both pass. `cargo test -p shards --test mcp_cli` passes.

---

### shards-rebrand/4 — Hermetic harness

**Status:** NOT STARTED (2026-10-16: `tests/common/mod.rs` `env_remove` and `scripts/smoke.sh` `unset` name `SHARDS_*` only, no `MESH_*` twins; `scripts/demo-vault.sh` already unsets both)

**Goal:** No operator `MESH_*` or `SHARDS_INDEXED_TIMEOUT_MS` value can reach a test or smoke run.

**Requirements:** R9

**Dependencies:** shards-rebrand/2

**Files:**

```
tests/common/mod.rs   # cmd() and the no-config variant: env_remove MESH_CONFIG_PATH, MESH_AGENT,
                      #   MESH_VAULT, MESH_INDEXED_BIN, MESH_INDEXED_TIMEOUT_MS, SHARDS_INDEXED_TIMEOUT_MS
scripts/smoke.sh      # same names added to the `unset` line
```

**Test scenarios:**

- With `MESH_AGENT=leak MESH_VAULT=/nonexistent` exported, the full suite and smoke still pass.

**Verification:** `MESH_AGENT=leak MESH_VAULT=/nonexistent cargo test -p shards` → 0 failed, and
`MESH_AGENT=leak MESH_VAULT=/nonexistent SHARDS_BIN=./target/debug/shards ./scripts/smoke.sh` →
passed.

---

### shards-rebrand/5 — Deprecation notice, status report, init target

**Status:** NOT STARTED (2026-10-16: `src/config.rs` has `env_var` and `home_path` fallbacks but no `LegacyUse`, notice or `status.legacy`)

**Goal:** A legacy source in use is visible, and `init` migrates instead of writing into `~/.mesh/`.

**Requirements:** R4, R6

**Dependencies:** shards-rebrand/3

**Files:**

```
src/config.rs        # LegacyUse, legacy_uses(), stderr notice on first use, canonical_config_path()
src/cli/admin.rs     # init: refuse on legacy hit with the mv hint; --force writes canonical; status: "legacy" list
tests/compat_env_cli.rs   # notice and status scenarios
tests/admin_cli.rs   # init scenarios
```

**Test scenarios:**

- `MESH_AGENT` set → `task list --json` stdout parses as JSON. stderr has exactly one line naming
  `MESH_AGENT`, `SHARDS_AGENT` and `0.4.0`.
- `MESH_AGENT` and `MESH_VAULT` both set → two notice lines, each printed once.
- On a legacy config load, `status --json` shows `legacy` containing the path. On a clean setup the
  key is absent, and `tests/fixtures/golden/status.json` stays unchanged.
- With only a legacy config: `init` exits 2 with the mv hint. `init --force` writes
  `~/.shards/config.toml` and leaves the legacy file byte-identical.
- The MCP server under `MESH_AGENT` prints the notice on stderr only, and the JSON-RPC stdout
  parses.

**Verification:** `cargo test -p shards --test compat_env_cli --test admin_cli --test lens_cli`
passes, with the golden status unchanged.

---

### shards-rebrand/6 — Format gate and version bump

**Status:** PARTIAL (re-measured at `479b6c0`, 2026-11-17). The format gate is green: `cargo fmt
--all --check` exits 0. The 0.3.0 target here is moot: the product shipped as `0.1.0`
(`Cargo.toml:19`, `plugins/shards/.claude-plugin/plugin.json:4`) and v0.1.0 was released
2026-11-02. The 0.3.0 lines below — the Goal, the `Files` version entries, the `shards --version`
test scenario and the `→ 0.3.0` verification — are superseded and must not be executed: the tree
is already at `0.1.0`, so running them would move the product version backwards.
**Finding for the owner:** which release the rebrand lands in. The plan's other version anchor is
/9's fallback removal at 0.4.0; no 0.3.x release exists (`gh release list` → v0.1.0 is the latest).

**Goal:** The format gate is green. ~~The release identifies itself as 0.3.0.~~ (version target
superseded — see Status.)

**Requirements:** R1

**Dependencies:** shards-rebrand/5

**Files:**

```
src/**                                     # cargo fmt --all (mechanical)
Cargo.toml, Cargo.lock                     # version = "0.3.0" — superseded, do not execute
plugins/shards/.claude-plugin/plugin.json  # "version": "0.3.0" — superseded, do not execute
```

**Test scenarios:**

- ~~`shards --version` prints `0.3.0`.~~ Superseded: the version target is an owner finding.
- `tests/bundle.rs` ("the plugin version tracks the crate version") still passes.

**Verification:** `cargo fmt --all --check` exits 0, `cargo clippy --all-targets --locked -- -D
warnings` is clean, and `cargo test -p shards` has 0 failed. ~~`./target/debug/shards --version`
→ `0.3.0`.~~ Superseded: it prints `0.1.0` (`Cargo.toml:19`).

---

### shards-rebrand/7 — Migration note and docs

**Status:** DONE (2026-10-16): README "Upgrading from mesh?" names `shards-mcp`, `mcp__shards__*`, `SHARDS_*`, `~/.shards` and the Crystal `shards` clash. `cargo test -p shards --test bundle` green.

**Goal:** A mesh user can upgrade by following one section.

**Requirements:** R1, R4, R6

**Dependencies:** shards-rebrand/5

**Files:**

```
README.md          # "Upgrading from mesh" section: the six steps in product.md § User Experience,
                   #   the Crystal `shards` PATH note, and stopping `mesh watch` first
plugins/shards/skills/shards/SKILL.md   # check it names mcp__shards__* only
```

**Test scenarios:**

- `tests/bundle.rs` still pins the skill invariants.
- The README section exists and lists `shards-mcp`, `mcp__shards__`, `SHARDS_` and `~/.shards`.

**Verification:** `cargo test -p shards --test bundle` passes, and `grep -n "Upgrading from mesh"
README.md` → 1 hit.

---

### shards-rebrand/8 — Residue gate, lesson, commit

**Status:** PARTIAL (re-measured at `479b6c0`, 2026-11-17). The rename is committed on `main`:
`Cargo.toml:18` says `name = "shards"` (29fc017), and `crates/shards-host` and `apps/desktop` are
tracked. Residue gate step 1 no longer prints nothing — it prints six lines in five files added
after 2026-10-16 that apply the same both-prefixes harness rule as `scripts/demo-vault.sh`
(`scripts/release/brew-smoke.mjs:11`, `scripts/release/brew-smoke.test.mjs:10,13`,
`scripts/release/verify.mjs:27`, `tests/harness_native_edges.rs:49`,
`tests/harness_runtime.rs:227`), and `tech.md` § Residue gate names only `scripts/demo-vault.sh`
for that rule. Step 3 matches only `docs/research/` history and the gate's own text in this
folder. Open: the rename lesson ("A compat fallback widens the leak surface of a hermetic test
harness") is not in `lessons.md`.

**Goal:** The tree passes the residue gate, the rename lesson is banked, and the rename is committed.

**Requirements:** R1, R9

**Dependencies:** shards-rebrand/3, shards-rebrand/4, shards-rebrand/6, shards-rebrand/7. The root
`docs/spec/` rewrite by the root writers must also be done.

**Files:**

```
docs/spec/lessons.md   # lesson: "A compat fallback widens the leak surface of a hermetic test harness"
```

**Test scenarios:** the three commands in [tech.md](tech.md) § Residue gate.

**Isolation from task-model-v2.** The rename and the in-progress v2 code edit the same files:
`src/model/task.rs`, `src/domain/tasks.rs`, `src/cli/*` and `src/mcp/*`. The rename commit MUST
contain no v2 hunks. Stage the rename hunks only, with `git add -p` or by hunk review. Then run the
gates against the staged content alone. The stash stack is shared, so follow the environment's
stash rules:

```bash
git stash push --keep-index -u -m "shards-rebrand-8-gate"
SHA=$(git stash list --format='%H %gs' | grep shards-rebrand-8-gate | cut -d' ' -f1)
cargo fmt --all --check && cargo clippy --all-targets --locked -- -D warnings && cargo test -p shards
cargo build --release && ./scripts/smoke.sh
git stash apply "$SHA"   # then drop that entry by its tag, never with a bare pop
```

**Verification:**

1. Step 1 of the residue gate in [tech.md](tech.md) § Residue gate, quoted verbatim with its
   `docs/research/` exclusion — without that exclusion the command prints 274 lines, 268 of them
   historical `docs/research/` snapshots:
   (`git grep -n -i --untracked mesh -- . ':!Cargo.lock' ':!docs/spec/' ':!src/config.rs' ':!tests/compat_env_cli.rs' ':!scripts/demo-vault.sh' ':!README.md' ':!AGENTS.md' ':!docs/research/' ':!**/node_modules/**'`)
   → only the six lines in five files recorded in the status above, each a both-prefixes harness
   clear that `tech.md`'s allowlist does not yet name. Nothing in `src/`, `crates/` or `apps/`.
2. A hand review of step 2 of that gate (allowlist: `src/config.rs`, `tests/compat_env_cli.rs`,
   `README.md`, `AGENTS.md`, `docs/spec/`) finds only sanctioned spots.
3. `git grep -n -i -E 'shards shards|a shards for|the shards for'` → no output.
4. Run against the staged-only tree: fmt, clippy and test are green, and smoke is 44/44 on a
   release build.
5. `git diff --cached` contains no v2 identifiers. Concretely,
   `git diff --cached | grep -E '^\+.*(recur|deadline|DueFilter|CALENDAR_FIELDS|"urgent")'` →
   no output.

---

### shards-rebrand/9 — Remove compat fallbacks (0.4.0)

**Status:** DEFERRED. It runs when the 0.4.0 release branch is cut. After compound it is tracked in
the root plan § Known gaps.

**Goal:** Legacy names stop having any effect.

**Requirements:** R8

**Dependencies:** shards-rebrand/8, plus the 0.3.x release being published

**Files:**

```
src/config.rs src/cli/admin.rs tests/compat_env_cli.rs tests/common/mod.rs scripts/smoke.sh README.md
```

**Test scenarios:**

- `MESH_AGENT` alone → no notice. The owner is not taken from it.
- Only `~/.mesh/config.toml` → the missing-config error, exit 2.

**Verification:** `cargo test -p shards --test compat_env_cli` passes with the inverted assertions.
`git grep -n -i mesh -- src tests scripts` → no output.

---

## Progress

| Unit | Status | Evidence |
|---|---|---|
| shards-rebrand/1 | DONE | residue gate step 1 clean outside the allowlist (2026-10-16) |
| shards-rebrand/2 | DONE | `src/config.rs` `env_var`, `home_path` |
| shards-rebrand/3 | NOT STARTED | no `tests/compat_env_cli.rs` |
| shards-rebrand/4 | NOT STARTED | harness lists lack `MESH_*` |
| shards-rebrand/5 | NOT STARTED | no notice / `status.legacy` |
| shards-rebrand/6 | PARTIAL | `cargo fmt --all --check` exit 0 (2026-11-17); the planned 0.3.0 bump is moot — `Cargo.toml:19` is `version = "0.1.0"` and v0.1.0 shipped 2026-11-02 |
| shards-rebrand/7 | DONE | README upgrade section; `cargo test -p shards --test bundle` |
| shards-rebrand/8 | PARTIAL | rename committed on `main` (29fc017); residue gate step 1 prints 6 lines in files added after 2026-10-16 that `tech.md` does not allowlist; lesson not in `lessons.md` |
| shards-rebrand/9 | DEFERRED (0.4.0) | — |
