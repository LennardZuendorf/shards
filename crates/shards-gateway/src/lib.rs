//! Private local gateway authority.
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
pub mod executor;
pub mod grants;
pub mod http;
pub mod protocol;
#[derive(Debug)]
pub struct GatewayError(pub String);
impl std::fmt::Display for GatewayError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}
impl std::error::Error for GatewayError {}
pub type Result<T> = std::result::Result<T, GatewayError>;
pub(crate) fn error(message: &str) -> GatewayError {
    GatewayError(message.into())
}
