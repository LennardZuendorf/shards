---
type: tech
applies: "**"
updated: 2026-11-02
---

# tech-core: Stack

## Stack

| Layer | Choice |
|---|---|
| Runtime | Rust, edition 2021, `rust-version = "1.94"`, toolchain pinned `1.94.1` (`rust-toolchain.toml`; a Homebrew rustc without rustup ignores the pin — research: codebase §1). Single binary, no async runtime |
| CLI | `clap` 4 (derive) + `clap_complete` |
| Data | Markdown + `yaml-rust2` (read) + a hand-rolled canonical emitter (write); `serde_json` with `preserve_order`; `indexmap` |
| Config | `toml` (read) + `toml_edit` (format-preserving edits) |
| Time / hashing / syscalls | `chrono`, `sha2`, `rustix` (O_EXCL, flock, fstat, kill, umask) |
| Walking / watching | `walkdir`, `notify` 8 + `notify-debouncer-full` 0.6 |
| Terminal UI | `ratatui` 0.30 + `crossterm` 0.29, crossterm backend only, imported only by `src/cli/dashboard.rs` |
| Agents | Hand-rolled JSON-RPC 2.0 over stdio (no MCP SDK) |
| Search engine | `indexed` (first-party dense-vector; Shards wraps its CLI — handoff owned by [product-roadmap.md](../../concepts/roadmap/README.md) § Decision log, D7) |
| Dev | `assert_cmd`, `predicates`, `tempfile`, `serial_test`; `cargo llvm-cov`, `cargo deny` |

Rejected on purpose: `regex` (five hand-written scanners, one needing a negative lookahead),
`anyhow` (exit codes are a typed contract), any MCP SDK in this crate (it would pull an async
runtime and cost byte control over the tool schemas), `mime_guess`, `insta`, `proptest`. Core code
stays small — wrapper, locks, walk, wikilinks.

**Platform.** POSIX only: `rustix` flock/kill/umask and `std::os::unix` appear in
`storage/atomic.rs`, `storage/lock.rs` and `domain/assets.rs`. macOS and Linux build; Windows does
not compile without `cfg(windows)` shims (research: codebase §2.6).

**Vault requirement.** Shards needs only a directory it can write into. No notes application need
be installed, running or detected; `shards init` creates the folder when none exists. Obsidian is
the maintainer's reference pairing, not a dependency: the notes space can *be* an Obsidian vault,
and nothing checks for one.

Parent: [Section index](README.md).
