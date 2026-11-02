---
type: tech
applies: "**"
updated: 2026-11-02
---

# tech: Host Tool Contract (2/2)

**Acting identity.** `adopt_configured_identity` sets `$SHARDS_AGENT` to `[core].me` at process
start, before any thread exists, so the core acts as the human. `[core].me` and `[[members]]` are
read by the host only (`crates/shards-host/src/members.rs`); the core `Config` ignores them. With
no `[core].me` the host acts as whatever `$SHARDS_AGENT` / `[core].agent` names.

**Planned, not built** (design in [features/desktop-app/tech.md](../../features/desktop-app/tech.md)
§ Designed, not built): `call_undoable` undo tokens, body-hash preconditions
(`expected_body_sha256`) and the `conflict` kind, restore-as-replace, kind → HTTP status map,
`host_config_set`, `host_memory_list`, `host_memory_recall_as`, scratch body replace,
`Server::call_with` / `Config::operator()`, vault-relative event paths with `seq` and `config`.

Parent: [Section index](README.md).
