//! The `shards-mcp` compat shim: `plugins/shards/.mcp.json` names this binary.

use std::process::ExitCode;

fn main() -> ExitCode {
    shards::mcp::serve_stdio()
}
