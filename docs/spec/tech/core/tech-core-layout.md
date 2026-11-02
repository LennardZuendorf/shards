---
type: tech
applies: "**"
updated: 2026-11-02
---

# tech-core: Layout

## Layout

```
src/
├── main.rs, lib.rs, ctx.rs      # parse -> dispatch -> exit code; module surface; invocation context
├── bin/shards-mcp.rs            # shim binary for the plugin bundle (calls shards::mcp::serve_stdio)
├── error.rs config.rs spaces.rs ids.rs timefmt.rs text.rs render.rs
├── fm/                          # frontmatter: value, load, canonical emit, doc
├── storage/                     # atomic write, O_EXCL locks, sandbox, THE walk
├── model/                       # per-space typed views + FieldOrder (note, task, memory, scratch, asset)
├── domain/                      # verbs + select/tags/owner/wikilinks/deps/activity/context/lenses
├── search/                      # route, corpus, tokenize, builtin, tagpull, indexed, health
├── cli/                         # one file per verb family + globals, out, admin, watch, dashboard
└── mcp/                         # stdio JSON-RPC server, schemas, 42-tool table, tool profiles, instructions
tests/                           # one per verb family + compat corpus, race, bundle, review regressions
plugins/shards/                  # Claude Code plugin: .mcp.json -> shards-mcp, skill, session hook
```

**Library seams the outer crates use** (research: codebase §2.6–2.7): `config::from_table` and
`Config::with_agent` (in-memory config, per-request identity), `mcp::tools::Server::call(name,
&Json)` (the dispatcher), `cli::out::error_envelope`. Five edges still run from non-CLI code into
`crate::cli` (`ctx.rs` → `GlobalOpts`; `mcp/tools.rs` → `GlobalOpts`, `TASK_SORT_KEYS`,
`NO_READY_TASK`; `mcp/errors.rs` → `error_envelope`; `search/health.rs` and `domain/lenses.rs` →
`watcher_pid`). They stay: `shards-host` links the whole lib, CLI module included, and builds
its envelope with `mcp::tool_error` (the CLI envelope as a string). No feature schedules cutting
them.

**Seams added for the desktop app** (delivered, additive; used only by `shards-host`):
`tasks::{delete_raw, set_body}`, `notes::{delete_raw, set_body, set_meta}`,
`memories::{forget_raw, set_body}`, `scratch::clear_raw` (each runs under the entity lock and
returns the raw bytes or the updated entity), `storage::raw::write_new` (no-clobber atomic
create), `cli::dashboard::snapshot`. `notes::set_meta(cfg, target, &[(key, Option<Value>)])`
writes non-core frontmatter keys in one locked atomic write and bumps `updated`; it refuses the
core keys (`id`, `type`, `tags`, `owner`, `claimed_by`, `created`, `updated`, `related`) and a
blank `title`.

Parent: [Section index](README.md).
