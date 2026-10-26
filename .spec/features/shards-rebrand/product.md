---
type: feature-product
feature: shards-rebrand
sibling: tech.md
parent: ../../product.md
updated: 2026-10-26
---

# Feature: Shards Rebrand — Product

The product is renamed from **mesh** to **Shards** (decision D1). The rename covers the brand,
the two binaries, the MCP server and its tool prefix, the environment variables, the home
directory and the Claude Code plugin. Operators who set up mesh before the rename keep working
for one release with no action: legacy environment variables and the legacy home directory are
still read as fallbacks, and a notice tells them what to change. The vault's content does not
change. No file in a vault is rewritten, renamed or migrated.

Who uses it: the agent operator persona (the owner and early adopters with a mesh install),
agents that call the CLI or MCP server, and every later feature, which builds on the new names.

**Parent:** [../../product.md](../../product.md)
**Architecture:** [tech.md](tech.md)
**Plan:** [plan.md](plan.md)

---

## Scope

| | |
|---|---|
| **Owns** | Product, binary, crate, MCP server and tool names. Environment variable names and their one-release legacy fallback. Home-directory naming and its one-release legacy fallback. Plugin and marketplace names. User-visible copy (help, errors, notices, README, AGENTS.md, docs). The migration notice. The residue gate. The removal of the fallbacks in the next minor release. |
| **Does not own** | New verbs, flags, tools or task fields (task-model-v2). Desktop app, host process and `[[members]]` (desktop-app, task-model-v2). The rewrite of root `.spec/` prose (the pivot pass rewrites it; the 14-DONE gate only checks that it names Shards). Vault data (unchanged by design). Aliases for the old tool names or old binary names (explicitly rejected, see R5). |

---

## Success metrics

| Metric | Target | How measured |
|---|---|---|
| Legacy installs that keep working with no edits during 0.3.x | 100% of setups that use only `MESH_*` variables and `~/.mesh/` | Compat scenarios R3, R4 pass in CI |
| Name residue in tracked files outside the allowlist | 0 hits | Residue gate R9 |
| Regressions caused by the rename | 0 failing tests; smoke 44/44 | Full test suite and smoke script |
| Vault files changed by upgrading | 0 bytes | R7 scenario on the compatibility corpus |

---

## Requirements

### Requirement: One product name everywhere (R1)

The system SHALL present itself as Shards on every surface. The CLI binary SHALL be `shards`, the
MCP server binary SHALL be `shards-mcp`, the MCP server SHALL identify itself as `shards`, every
MCP tool name SHALL start with `shards_`, and the Claude Code plugin and marketplace entry SHALL be
named `shards`. Help text, error messages and notices SHALL name `shards` commands.

#### Scenario: CLI help names the new binary

- **Given** a fresh install of the 0.3.0 release
- **When** the operator runs `shards --help`
- **Then** every command example in the output starts with `shards`, and the word `mesh` does not
  appear

#### Scenario: MCP tool list uses the new prefix

- **Given** an MCP client connected to `shards-mcp`
- **When** the client lists tools
- **Then** the server reports the name `shards`, and all 42 tool names start with `shards_`

#### Scenario: Missing-config error names the new command

- **Given** no config file exists at any canonical or legacy location
- **When** the operator runs any vault command
- **Then** the error says to run `shards init` and names `$SHARDS_CONFIG_PATH`

### Requirement: Canonical environment variables (R2)

The system SHALL read its environment configuration from these variables: `SHARDS_CONFIG_PATH`,
`SHARDS_AGENT`, `SHARDS_VAULT`, `SHARDS_INDEXED_BIN` and `SHARDS_INDEXED_TIMEOUT_MS`. The smoke
script SHALL read `SHARDS_BIN`. An empty value MUST count as unset.

#### Scenario: Agent identity from the new variable

- **Given** `SHARDS_AGENT=flights-agent` and a config without `[core].agent`
- **When** the agent runs `shards task new "Book flight"`
- **Then** the task's owner is `flights-agent`

### Requirement: Legacy environment fallback for one release (R3)

During the 0.3.x releases, when a `SHARDS_*` variable is unset or empty, the system SHALL read the
`MESH_*` variable with the same suffix. A non-empty `SHARDS_*` value MUST always win over the
legacy one.

#### Scenario: Legacy agent variable still works

- **Given** `MESH_AGENT=notes-agent` is set and `SHARDS_AGENT` is unset
- **When** the agent runs `shards task list --mine`
- **Then** the command acts as `notes-agent`

#### Scenario: New variable wins

- **Given** `SHARDS_VAULT=/v/new` and `MESH_VAULT=/v/old` are both set
- **When** any vault command runs
- **Then** it uses `/v/new`

#### Scenario: Empty new variable falls through

- **Given** `SHARDS_VAULT` is set to an empty string and `MESH_VAULT=/v/old`
- **When** any vault command runs
- **Then** it uses `/v/old`

### Requirement: Legacy home directory fallback for one release (R4)

The canonical home directory SHALL be `~/.shards/`, with `~/.shards/config.toml` as the default
config and `~/.shards/vault` as the default vault for `init`. During 0.3.x, for each of these two
items separately, the system SHALL use the `~/.mesh/` equivalent when the `~/.shards/` item does
not exist and the `~/.mesh/` item does. `shards init` SHALL NOT create or overwrite anything under
`~/.mesh/`.

#### Scenario: Legacy config is found

- **Given** `~/.mesh/config.toml` exists, `~/.shards/config.toml` does not, and no override is set
- **When** the operator runs `shards status`
- **Then** the command loads `~/.mesh/config.toml` and succeeds

#### Scenario: Canonical config wins

- **Given** both `~/.shards/config.toml` and `~/.mesh/config.toml` exist
- **When** any command runs
- **Then** it loads `~/.shards/config.toml`

#### Scenario: Init migrates instead of overwriting the legacy file

- **Given** only `~/.mesh/config.toml` exists
- **When** the operator runs `shards init --force`
- **Then** `~/.shards/config.toml` is written, `~/.mesh/config.toml` is byte-identical to before,
  and later commands load the new file

#### Scenario: Init without force refuses

- **Given** only `~/.mesh/config.toml` exists
- **When** the operator runs `shards init`
- **Then** the command exits 2, names the legacy file, and tells the operator to run
  `mv ~/.mesh ~/.shards` or to pass `--force` to write a fresh canonical config

### Requirement: No aliases for old tool or binary names (R5)

The system MUST NOT register any `mesh_*` MCP tool name. It MUST NOT install a `mesh` or
`mesh-mcp` binary. A doubled tool list harms agent tool selection (research: codebase §4.3), and
the plugin ships the new names in the same release.

#### Scenario: Old tool name is unknown

- **Given** an MCP client that still calls `mesh_task_list`
- **When** the call reaches `shards-mcp`
- **Then** the server answers with its standard unknown-tool error and lists no `mesh_*` tool

### Requirement: Deprecation is visible (R6)

When a legacy fallback supplies a value, the system SHALL print a notice on the error stream, at
most once per legacy source per process. The notice SHALL name the legacy source, its replacement
and the release that removes support (0.4.0). The notice MUST NOT appear on standard output, so JSON consumers and the MCP
protocol stream are not affected. `shards status` SHALL list every legacy source in use.

#### Scenario: Notice on legacy variable

- **Given** `MESH_AGENT=a1` is set and `SHARDS_AGENT` is unset
- **When** the agent runs `shards task list --json`
- **Then** standard output is valid JSON, and the error stream holds exactly one line that names
  `MESH_AGENT`, `SHARDS_AGENT` and `0.4.0`

#### Scenario: Status reports the legacy sources

- **Given** the config was loaded from `~/.mesh/config.toml`
- **When** the operator runs `shards status --json`
- **Then** the payload has a `legacy` list that contains the legacy config path

#### Scenario: No notice on a clean setup

- **Given** only `SHARDS_*` variables and `~/.shards/` are in use
- **When** any command runs
- **Then** no deprecation notice is printed and `shards status --json` has no `legacy` key

### Requirement: Vault data is untouched (R7)

The rename MUST NOT change, move or require migration of any vault file. Entity ids, folder layout
and frontmatter keys SHALL stay the same.

#### Scenario: Upgrade is a no-op on disk

- **Given** a vault written by mesh 0.2.0
- **When** the operator runs only read commands with Shards 0.3.0
- **Then** every file in the vault is byte-identical to before

### Requirement: Fallbacks are removed in the next minor release (R8)

Release 0.4.0 SHALL delete the `MESH_*` and `~/.mesh/` fallbacks and the deprecation notice. After
that, legacy names SHALL have no effect.

#### Scenario: Legacy variable ignored after removal

- **Given** Shards 0.4.0, `MESH_AGENT=a1` set, `SHARDS_AGENT` unset, and no `[core].agent`
- **When** the agent runs `shards task new "x"`
- **Then** no notice is printed and the owner is not `a1`

### Requirement: Residue gate (R9)

A release candidate SHALL contain no case-insensitive occurrence of `mesh` in tracked files. These
exceptions are allowed: the compat fallback code and its tests, the deprecation notice, the
README's upgrade note, historical entries in the root spec (lessons, delivered plan rows, resolved
decisions), and the lockfile. Test
and smoke runs SHALL be hermetic: they clear both the `SHARDS_*` and the `MESH_*` variables, so an
operator's legacy environment cannot leak into them.

#### Scenario: Gate passes

- **Given** the release candidate tree
- **When** the residue check runs
- **Then** every hit is in the allowlist

#### Scenario: Operator environment does not leak into tests

- **Given** a developer shell with `MESH_AGENT=dev` and `MESH_VAULT=/real/vault` set
- **When** the developer runs the test suite and the smoke script
- **Then** both pass, and nothing is read from or written to `/real/vault`

---

## User Experience

The migration note ships in the README and in the 0.3.0 release notes:

```
Upgrading from mesh 0.2 → Shards 0.3
  1. Binaries:   mesh → shards, mesh-mcp → shards-mcp (reinstall: ./scripts/install.sh)
  2. MCP config: "command": "mesh-mcp"  →  "command": "shards-mcp", server key "shards"
  3. Allowlists: mcp__mesh__*  →  mcp__shards__*   (tool names: mesh_* → shards_*)
  4. Plugin:     reinstall "shards" from the marketplace
  5. Env:        MESH_* → SHARDS_*   (MESH_* still read in 0.3.x, removed in 0.4.0)
  6. Home:       mv ~/.mesh ~/.shards (~/.mesh still read in 0.3.x, removed in 0.4.0)
  Your vault needs no changes.
```

Deprecation notice, error stream only, once per process:

```
shards: MESH_AGENT is deprecated, set SHARDS_AGENT instead (MESH_* support ends in 0.4.0)
```

---

## Non-Goals

- No `mesh_*` tool aliases and no `mesh` or `mesh-mcp` binaries (R5).
- No automatic move of `~/.mesh/` to `~/.shards/`. The operator moves it; the CLI never deletes or
  moves a legacy directory.
- No fallback for runtime-only state: an old watcher's lock is not recognised. A running
  `mesh watch` must be stopped before `shards watch` starts.
- No crates.io or npm publication under the `shards` name (the names are taken; research: market §6).
- No change to vault content, ids or folder layout.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Crystal ships a `shards` binary, and `shards` is taken on crates.io and npm (research: market §6) | A PATH collision runs the wrong tool | `publish = false`; install from source only; README tells Crystal users to put `~/.cargo/bin` first or alias. Run a trademark search before public launch. Accepted by the owner (D1). |
| MCP clients keep `mesh-mcp` in their config | The agent loses every tool after upgrade | Migration note, plugin ships the new `.mcp.json`, release notes lead with it |
| Permission allowlists keyed on `mcp__mesh__*` | Tool calls start prompting or are blocked | Migration step 3; the plugin skill uses the new names |
| A developer's `MESH_*` environment leaks into tests | Tests read or write a real vault | Hermetic harness (R9) |
| The fallbacks outlive their release | Two naming schemes stay forever | R8 removal is a tracked known gap in the root plan, gated on the 0.4.0 tag |
