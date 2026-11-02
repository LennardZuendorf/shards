# Release pipeline: local verification on 2026-10-30

Historical source verification. These results do not establish remote CI execution or release activation.

## Local verification on 2026-10-30

- `cargo test --workspace --locked`: 1,537 passed, zero failed.
- After rebasing onto Flint (`b9aafc5`), frontend Vitest: 41 files, 731 passed; production build passed.
- Core/host and desktop Clippy with `-D warnings`, plus workspace formatting: passed.
- Release Node suite: 26 passed. `actionlint` and spec validation: passed (zero errors/warnings).
- Browser accessibility: zero known/new violations, zero zoom findings. The harness now uses
  platform-correct shortcuts and waits after opening overlays before measuring contrast.
- Before the Flint integration, native Apple Silicon CLI archive and DMG built. Extracted and
  bundled tools passed real MCP/CLI smoke, architecture/deployment metadata and app integrity
  checks; native process launch passed. Rebased app artwork and font packaging await the CI candidate.
- After the Flint integration, frontend lint: zero errors and 20 existing warnings.

Local Rust is Homebrew 1.98.1/LLVM 22.1.8; it does not honor the repository's rustup pin.
The local coverage command could not find matching `llvm-tools-preview`, and rustup is absent.
Pinned Rust 1.94.1, the 80% coverage gate, native Intel/Linux, minimum-macOS launch and disposable
Homebrew lifecycle still require CI or their actual machines. The CI coverage job installs the
matching LLVM component explicitly. Commit, push and PR creation are authorized. Release
tags, secret setup and public distribution remain outside this verification record.

Independent review found stale stable promotion and missing future-server version enforcement;
both have failing-then-passing regression tests. Deferred minor: the CLI formula has no early
macOS 13.3 installer refusal; the cask and binary deployment metadata enforce the supported floor.
