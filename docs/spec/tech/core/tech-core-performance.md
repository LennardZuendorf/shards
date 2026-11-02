---
type: tech
applies: "**"
updated: 2026-11-02
---

# tech-core: Performance

## Performance

**Goal:** instant CLI. **Target:** cold start under 10 ms for a read command on a warm
filesystem. **Pin:** a wall-clock test (`tests/foundation_cli.rs`,
`a_warm_read_command_starts_under_the_cold_start_bound`) asserts the **minimum of ten** warm
end-to-end runs of the suite's own binary stays under 50 ms — min-of-N is monotone against
scheduling noise, so it is stable under CI load while still lifting on a real regression — with
~6× headroom over the measured ~7.5 ms idle floor. The same pin proves the MCP tool table is never
constructed off the MCP path and that the dashboard's TUI crates, linked but imported only by
`src/cli/dashboard.rs`, tax no other verb's startup. A full-vault scan of thousands of files in
Rust is milliseconds, which is what let the warm daemon be deleted rather than ported.

**Known hot spots for long-running callers** (research: codebase §2.6): every list is a full
disk scan; `tasks::list` with `--ready`/`--blocked` is O(n²) because `deps::readiness` rebuilds the
index per row; `Filter::default()` caps at 20 rows; `Server::ctx` reloads config on every call.
The CLI does not care; `shards-host` budgets in [tech.md](../architecture/README.md) § Performance budgets do.

**The Rust rewrite decision was reversed (2026-09).** It was shelved when the trade was a ~2–10 ms
Rust floor against a ~150–180 ms Python floor for a three-verb CLI a human invoked occasionally.
What changed is the product shape: a granular multi-space surface called by agents in hot loops
pays that floor on every call, and the daemon that used to hide it became the thing most in the
way.

Parent: [Section index](README.md).
