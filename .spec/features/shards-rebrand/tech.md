---
type: feature-tech
feature: shards-rebrand
sibling: product.md
parent: ../../tech.md
updated: 2026-10-16
---

# Feature: Shards Rebrand — Architecture

The rename is a mechanical, case-preserving substring replace over tracked files (`MeshError →
ShardsError`, `MESH_ → SHARDS_`, `mesh_ → shards_`, `mesh-mcp → shards-mcp`, `mesh:: → shards::`,
`.mesh → .shards`, `Mesh → Shards`, `mesh → shards`), plus three `git mv`s and hand-fixed prose
(research: codebase §4.2). It is already applied in the working tree: 95 files, +1581/−1574. The
only new logic is two compat helpers in `src/config.rs`. Every `SHARDS_*` read and every `~/.shards`
default goes through them. This document pins what changed, the compat contract, the work left
open, and how the compat code is removed in 0.4.0.

**Parent:** [../../tech.md](../../tech.md)
**Requirements:** [product.md](product.md)
**Plan:** [plan.md](plan.md)

---

## Files

Already changed in the working tree:

```
Cargo.toml                         # package/lib/bin `shards`, bin `shards-mcp`; description
Cargo.lock                         # regenerated package name
src/bin/mesh-mcp.rs → src/bin/shards-mcp.rs
src/config.rs                      # ENV_* constants renamed; env_var(), home_path() added
src/search/indexed.rs              # ENV_TIMEOUT_MS = "SHARDS_INDEXED_TIMEOUT_MS"; reads via env_var()
src/cli/admin.rs                   # default_vault_path() = home_path("vault"); init agent via env_var()
src/cli/watch.rs                   # lock: $XDG_RUNTIME_DIR/shards-<hash12>.watch.lock, else ~/.shards/run/ (no legacy fallback)
src/mcp/mod.rs                     # SERVER_NAME = "shards"; TOOL_NAMES shards_*
src/mcp/schema.rs, src/mcp/tools.rs, src/mcp/instructions.rs   # tool names, descriptions
src/error.rs                       # MeshError → ShardsError; message prefix "shards:"
src/domain/notes.rs, src/domain/memories.rs   # is_mesh_stem → is_shards_stem; "shards-native"
src/**                             # remaining copy: help, notices, doc comments
plugins/mesh/** → plugins/shards/**          # .mcp.json {"shards":{"command":"shards-mcp"}}, hooks, skills/shards/SKILL.md
.claude-plugin/marketplace.json    # plugin "shards", source ./plugins/shards
scripts/smoke.sh, scripts/install.sh, .github/workflows/ci.yml, hooks/session_start.json
tests/**                           # cargo_bin("shards"), shards_* tool names, expected strings
README.md, AGENTS.md, docs/concepts.md, config.example.toml
```

Still to change (open units in [plan.md](plan.md)):

```
src/config.rs              # legacy-use recorder + notice; canonical_config_path(); unit tests   ~90 LOC
src/cli/admin.rs           # init writes canonical path; status `legacy` list                    ~40 LOC
src/bin/shards-mcp.rs      # nothing: notices come from config load on stderr
tests/common/mod.rs        # env_remove MESH_* as well as SHARDS_*                               ~6 LOC
tests/compat_env_cli.rs    # NEW: CLI-level fallback + notice scenarios                          ~160 LOC
scripts/smoke.sh           # unset MESH_* and SHARDS_INDEXED_TIMEOUT_MS                          ~2 LOC
Cargo.toml, plugins/shards/.claude-plugin/plugin.json   # version 0.2.0 → 0.3.0
README.md                  # "Upgrading from mesh" section (the migration note)
```

---

## Contract / API

### Compat helpers (delivered)

```rust
// src/config.rs
pub const ENV_CONFIG_PATH: &str = "SHARDS_CONFIG_PATH";
pub const ENV_AGENT: &str = "SHARDS_AGENT";
pub const ENV_VAULT: &str = "SHARDS_VAULT";
pub const ENV_INDEXED_BIN: &str = "SHARDS_INDEXED_BIN";
// src/search/indexed.rs
pub const ENV_TIMEOUT_MS: &str = "SHARDS_INDEXED_TIMEOUT_MS";

/// SHARDS_<X> when non-empty, else MESH_<X> when non-empty, else None.
pub fn env_var(name: &str) -> Option<String>;

/// ~/.shards/<leaf>, or ~/.mesh/<leaf> when the former is absent and the latter exists.
/// Decided per leaf: "config.toml" and "vault" fall back independently.
pub fn home_path(leaf: &str) -> PathBuf;
```

Resolution order, unchanged apart from the names:

| Value | Order |
|---|---|
| Config path | `--config` → `env_var("SHARDS_CONFIG_PATH")` → `home_path("config.toml")` |
| Vault | `--vault` → `env_var("SHARDS_VAULT")` → `[core].vault_path` (+ the two permanent aliases) |
| Agent | `env_var("SHARDS_AGENT")` → `[core].agent` |
| `indexed` binary | `env_var("SHARDS_INDEXED_BIN")` → `PATH` lookup of `indexed` |
| `indexed` timeout | `env_var("SHARDS_INDEXED_TIMEOUT_MS")` (positive integer) → 30 000 ms |
| `init` default vault | `home_path("vault")` |
| Watch lock | `$XDG_RUNTIME_DIR/shards-<hash12>.watch.lock` → `~/.shards/run/…` (no fallback) |

`SHARDS_BIN` is read only by `scripts/smoke.sh`, with no fallback. That is a developer tool, not
product surface.

### Compat additions (open)

```rust
// src/config.rs
/// One legacy source that supplied a value in this process.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LegacyUse { pub legacy: String, pub canonical: String }

/// Every legacy source used so far in this process, in first-use order.
pub fn legacy_uses() -> Vec<LegacyUse>;

/// Where `init` writes: `--config` → env_var(SHARDS_CONFIG_PATH) → ~/.shards/config.toml.
/// Never a ~/.mesh path.
pub fn canonical_config_path(flag: Option<&Path>) -> PathBuf;
```

- `env_var` and `home_path` record a `LegacyUse` the first time a fallback fires. The recorder is
  a `static LEGACY: Mutex<Vec<LegacyUse>>`. The crate is `forbid(unsafe_code)`, so the recorder
  uses `std::sync` only.
- On first record, the helper writes the notice to stderr:
  `shards: {legacy} is deprecated, set {canonical} instead (MESH_* support ends in 0.4.0)`.
  For a path, the text is `… move {legacy} to {canonical} …`. Stdout is never touched, so `--json`
  and the MCP JSON-RPC stream stay clean. stderr is the MCP stdio log channel.
- `status` adds `"legacy": [<legacy source>…]` only when the list is non-empty. The golden
  `tests/fixtures/golden/status.json` runs on a hermetic environment, so it does not change.
- `init`: the refusal check uses `resolve_config_path` (a legacy file counts as existing). The
  write target uses `canonical_config_path`. The refusal message for a legacy hit adds
  `— run 'mv ~/.mesh ~/.shards', or pass --force to write a fresh ~/.shards/config.toml`.

<!-- merge -->
## Rename compat policy

- A product rename keeps **read-side** fallbacks for exactly one minor release: environment
  variables and home-directory files. Each fallback fires per item, a non-empty canonical value
  always wins, and every fired fallback leaves one stderr notice that names the removal release.
- Tool names, binary names, the MCP server name and runtime-only state (locks) get **no** aliases.
  An alias doubles the agent's tool list and hides the migration.
- The CLI never moves, rewrites or deletes a legacy directory. The operator migrates it.
- Test and smoke harnesses clear **both** the canonical and the legacy prefix. A fallback widens
  the set of variables that can leak in from an operator's shell.
- The residue gate is a case-insensitive substring search, never a word-boundary search.
  `\bmesh\b` misses `mesh_task_get` and `MESH_AGENT` (lessons: "A word-boundary regex misses
  underscore-glued identifiers").
<!-- /merge -->

---

## Implementation Detail

### Residue gate

```bash
# 1. Nothing outside the allowlist (must print nothing). --untracked also covers new trees
#    (apps/, crates/) that plain git grep skips:
git grep -n -i --untracked mesh -- . ':!Cargo.lock' ':!.spec/' ':!src/config.rs' \
  ':!tests/compat_env_cli.rs' ':!scripts/demo-vault.sh' ':!README.md' ':!AGENTS.md' \
  ':!docs/research/' ':!**/node_modules/**'
# 2. Allowlisted files hit only their sanctioned spots (reviewed by hand):
git grep -n -i --untracked mesh -- src/config.rs tests/compat_env_cli.rs README.md AGENTS.md .spec/
#    src/config.rs           compat helpers, notice text, their #[cfg(test)] tests
#    tests/compat_env_cli.rs fallback scenarios
#    docs/research/          pre-rename research snapshots (2026-10-15), historical by design
#    scripts/demo-vault.sh   one `unset … MESH_AGENT … MESH_CONFIG_PATH` line (harness rule:
#                            clear both prefixes)
#    README.md               the "Upgrading from mesh" section only
#    AGENTS.md               the MESH_* / ~/.mesh fallback notes only
#    .spec/                  lessons.md history, plan.md delivered rows 6 and 14, product.md history,
#                            this feature folder (deleted at compound)
# 3. Doubled-noun check (lessons: "A rename can produce a self-referential redundant phrase"):
git grep -n -i --untracked -E 'shards shards|a shards for|the shards for'
```

This gate is the only residue gate. The root plan's 14-DONE gate cites it and does not use
`rg -w mesh`.

### Hermetic harness

`tests/common/mod.rs` `VaultFixture::cmd()` and its no-config variant call `env_remove` for
`SHARDS_CONFIG_PATH`, `SHARDS_AGENT`, `SHARDS_VAULT` and `SHARDS_INDEXED_BIN`. With the fallback in
place, an operator's `MESH_AGENT` or `MESH_VAULT` now leaks into every test. The fix: remove the
`MESH_*` twin of each, plus `SHARDS_INDEXED_TIMEOUT_MS` and `MESH_INDEXED_TIMEOUT_MS`.
`scripts/smoke.sh` line 33 gets the same list in its `unset`.

### Compat tests

- Unit tests in `src/config.rs` (`#[serial]`, because they mutate process env; `serial_test` is
  already a dev-dependency):
  - `env_var`: canonical wins; an empty canonical value falls through; legacy alone is used;
    both empty gives `None`; a name without the `SHARDS_` prefix never falls back.
  - `home_path`: it takes a home directory through an injectable seam. Split it into
    `home_path_in(home: &Path, leaf)`, which `home_path` calls with `dirs::home_dir()`. That keeps
    the tests off the real `$HOME`. Cases: neither exists gives canonical; only legacy gives
    legacy; both give canonical; per-leaf mixing.
- `tests/compat_env_cli.rs` drives the binary with `MESH_*` set and `--config` unset. It covers the
  R3, R6 and R4-init scenarios. `$HOME` is pointed at a tempdir, because `dirs::home_dir()` honours
  `HOME` on Unix.

### Removal in 0.4.0

One commit, `refactor(config): drop mesh compat fallbacks`:

1. `env_var`: delete the `strip_prefix("SHARDS_")…MESH_` branch, and keep the empty-as-unset filter.
2. `home_path`: return `~/.shards/<leaf>` unconditionally.
3. Delete `LegacyUse`, `legacy_uses`, the notice, the `status.legacy` key and the legacy branch of
   the `init` refusal message.
4. Turn the fallback tests into "legacy name is ignored" tests (product R8). Remove `MESH_*` from
   the harness `env_remove` lists after the tests prove the variables are inert.
5. The residue gate allowlist shrinks to `.spec/` history and the README upgrade note.

---

## Risks

- **PATH collision with Crystal's `shards`.** Mitigation: install from source only; README note.
  The owner accepted this (D1).
- **Old `mesh watch` processes keep their own lock.** They never see the new lock path. Mitigation:
  the upgrade note says to stop `mesh watch` first. Two watchers only duplicate `indexed` updates.
  They do not corrupt anything.
- **`dirs::home_dir()` ignores `HOME` on some platforms.** Mitigation: CLI compat tests set `HOME`
  and run on Unix only (Windows is out of scope); unit tests use the `home_path_in` seam.
