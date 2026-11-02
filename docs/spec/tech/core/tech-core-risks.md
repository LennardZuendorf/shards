---
type: tech
applies: "**"
updated: 2026-11-02
---

# tech-core: Risks

## Risks

| Risk | Mitigation |
|---|---|
| YAML compatibility with Python-era vaults | The read side accepts every form PyYAML wrote; a byte-frozen Python-written corpus gates semantic round-trip → `tests/compat_corpus.rs` |
| Lock-semantics parity | Staleness table, the alive rule and both compare-and-swaps pinned by real multi-process race tests → `tests/race.rs` |
| `indexed` contract drift | One wrapper, byte-identical argv, machine output via the child's `INDEXED_SIMPLE_OUTPUT` env, a tolerant decode (v2 `relevance` as-is, v1 squared-L2 via `1/(1+s)`, chunks deduped), a stub-engine fixture. `indexed` is **dense-vector only**: it has no BM25 leg, no query-time filters and no graph, so the `hybrid` key names the branch, not a fusion of lexical and vector ranking. It also has no unbounded `--limit` (a negative value is a valid empty result, exit 0), so an unbounded fetch is the positive `MAX_FETCH_DOCS` sentinel and the real filter/limit semantics stay in Rust. `shards reindex` routes update-when-exists. Ingest runs on a 600 s clock, search on 30 s; `$SHARDS_INDEXED_TIMEOUT_MS` overrides both; every clock degrades instead of failing. The handoff stays a CLI subprocess on purpose (D7, [product-roadmap.md](../../concepts/roadmap/README.md) § Decision log), so the Shards side is where every guardrail lives — a versioned argv/envelope contract with a test per shape Shards sends, because a child that exits 0 with a valid empty envelope is indistinguishable from "no matches" |
| A hostile or huge file in a vault-root notes space | One walk, one skip set; the safe reader yields nothing rather than failing |
| Windows | POSIX-first; desktop targets macOS then Linux; Windows needs `cfg(windows)` lock/mode shims first |
| Untrusted content | Multi-root sandbox on every resolved path; agent content is never shell input |
| Unbounded memory growth | Nothing prunes memories by design; expiry and supersession control visibility |
| Rename churn (`mesh` → `shards`) | Plain substring replace, then grep for doubled tokens (lessons: word-boundary regex, self-referential phrase); one-release `MESH_*` / `~/.mesh` fallbacks |

Parent: [Section index](README.md).
