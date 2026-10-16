#!/usr/bin/env bash
#
# Install the `shards` and `shards-mcp` binaries from this checkout.
#
#   ./scripts/install.sh              # into ~/.cargo/bin
#   ./scripts/install.sh --root /usr/local
#
# Every argument is forwarded to `cargo install`. Requires the toolchain pinned in
# rust-toolchain.toml (Rust 1.94+).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v cargo >/dev/null 2>&1; then
  echo "install: cargo not found — install Rust 1.94+ from https://rustup.rs" >&2
  exit 1
fi

cargo install --path "$ROOT" --locked "$@"

echo
echo "installed: shards, shards-mcp"
echo "next: shards init   (writes ~/.shards/config.toml, or \$SHARDS_CONFIG_PATH when set)"
