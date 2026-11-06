---
type: flow
updated: 2026-11-06
---

# product-cli: Configuration and identity precedence

## Configuration and identity precedence

The first source that is set wins. The `MESH_*` and `~/.mesh` rungs are a one-release
compatibility bridge ([product-roadmap.md](../../concepts/roadmap/README.md) § Decision log, D1) and are removed
in the release after shards-rebrand. This table owns the acting-identity rule; other docs cite it.

| Setting | Precedence (highest first) |
|---|---|
| Config file | `--config` > `$SHARDS_CONFIG_PATH` > `$MESH_CONFIG_PATH` > `~/.shards/config.toml` > `~/.mesh/config.toml` |
| Vault root | `--vault` > `$SHARDS_VAULT` > `$MESH_VAULT` > `[core].vault_path`; none set is a validation exit. `shards init` proposes `~/.shards/vault` (or `~/.mesh/vault` when only that exists) |
| Acting identity | `--owner` > `$SHARDS_AGENT` > `$MESH_AGENT` > `[core].me` > `[core].agent` (pre-Shards key, read when `me` is absent). **Delivered:** the core does not read `[core].me` yet (task-model-v2/8), so CLI and MCP use `--owner` > `$SHARDS_AGENT` > `$MESH_AGENT` > `[core].agent`. `shards-host` sets `$SHARDS_AGENT` to `[core].me` at start |
| Search binary | `$SHARDS_INDEXED_BIN` > `$MESH_INDEXED_BIN` > `indexed` on `PATH` |

Identity is a spelling convention locally, validated against `[tasks].collections` (enriched by
`[[members]]` once task-model-v2/8 lands; today only `shards-host` reads `[[members]]`, for
display names and kinds). It becomes a security boundary only on the future server, where the actor comes
from the OAuth token.

`shards config set` is the one command that works without a config file: it seeds the defaults
`init` writes and then applies the key. `init` remains the verb that creates and attaches the
vault directory.

---

Parent: [Section index](README.md).
