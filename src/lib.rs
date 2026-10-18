//! Shards — the multiplayer task manager for humans and agents, backed by one Markdown folder.
//!
//! The library half: domain logic, storage primitives, the CLI tree and the MCP server. The
//! `shards` binary is a thin `parse → dispatch → map error → exit` shell over it.

#![forbid(unsafe_code)]
#![deny(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::todo,
    clippy::string_slice
)]

pub mod cli;
pub mod config;
pub mod ctx;
pub mod domain;
pub mod error;
pub mod fm;
pub mod ids;
pub mod mcp;
pub mod model;
pub mod render;
pub mod search;
pub mod spaces;
pub mod storage;
pub mod text;
pub mod timefmt;

pub use error::{Result, ShardsError};

/// The version `shards --version` prints, bare, on stdout.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
