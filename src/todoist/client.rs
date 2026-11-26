//! The Todoist REST client: token resolution, blocking GET, pagination, and 429 backoff.
//!
//! The token is read once and lives only in this struct. It is never formatted into an error,
//! a note or a file: every failure names the request path and the HTTP status, nothing else.

use std::cell::Cell;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::de::DeserializeOwned;
use serde_json::Value as Json;

use crate::config::TodoistConfig;
use crate::error::{Result, ShardsError};

/// How many times one request may be retried after a 429 before the pull fails.
pub const MAX_RETRIES: u32 = 3;
/// The longest server-supplied `Retry-After` the pull will honour.
const MAX_RETRY_AFTER_SECS: u64 = 30;

/// Read the token from the configured variable, then a `.env` beside the config, then the
/// vault root. An empty value counts as unset, like every other Shards environment variable.
pub fn resolve_token(cfg: &TodoistConfig, config_path: &Path, vault: &Path) -> Result<String> {
    if let Ok(value) = std::env::var(&cfg.token_env) {
        let value = value.trim().to_string();
        if !value.is_empty() {
            return Ok(value);
        }
    }
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(dir) = config_path.parent() {
        candidates.push(dir.join(".env"));
    }
    let vault_env = vault.join(".env");
    if !candidates.iter().any(|p| p == &vault_env) {
        candidates.push(vault_env);
    }
    for path in &candidates {
        if let Some(value) = read_dotenv(path, &cfg.token_env) {
            return Ok(value);
        }
    }
    let places = candidates
        .iter()
        .map(|p| p.display().to_string())
        .collect::<Vec<_>>()
        .join(", ");
    Err(ShardsError::Validation(format!(
        "todoist: {} is not set (environment, {places})",
        cfg.token_env
    )))
}

/// One `KEY=VALUE` line from a dotenv file, with optional `export` and matching quotes.
fn read_dotenv(path: &Path, key: &str) -> Option<String> {
    let text = std::fs::read_to_string(path).ok()?;
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line = line.strip_prefix("export ").unwrap_or(line).trim_start();
        let Some((name, value)) = line.split_once('=') else {
            continue;
        };
        if name.trim() != key {
            continue;
        }
        let value = value.trim();
        let value = value
            .strip_prefix('"')
            .and_then(|v| v.strip_suffix('"'))
            .or_else(|| value.strip_prefix('\'').and_then(|v| v.strip_suffix('\'')))
            .unwrap_or(value)
            .trim()
            .to_string();
        if !value.is_empty() {
            return Some(value);
        }
    }
    None
}

/// Percent-encode a pagination cursor so a base64 value survives the query string.
pub fn encode_component(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for byte in raw.bytes() {
        let plain = byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~');
        if plain {
            out.push(char::from(byte));
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

/// A blocking Todoist client scoped to one pull.
pub struct Client {
    agent: ureq::Agent,
    base: String,
    token: String,
    retries: Cell<u32>,
}

impl Client {
    pub fn new(base_url: &str, token: String) -> Client {
        let config = ureq::Agent::config_builder()
            .timeout_global(Some(Duration::from_secs(30)))
            .http_status_as_error(false)
            .build();
        Client {
            agent: config.into(),
            base: base_url.trim_end_matches('/').to_string(),
            token,
            retries: Cell::new(0),
        }
    }

    /// How many 429 retries this pull performed.
    pub fn retries(&self) -> u32 {
        self.retries.get()
    }

    /// One page of a list endpoint, following `next_cursor` (and the older `items` shape).
    pub fn get_all<T: DeserializeOwned>(&self, path: &str) -> Result<Vec<T>> {
        let mut out: Vec<T> = Vec::new();
        let mut cursor: Option<String> = None;
        loop {
            let request = match &cursor {
                Some(cursor) => {
                    let sep = if path.contains('?') { '&' } else { '?' };
                    format!("{path}{sep}cursor={}", encode_component(cursor))
                }
                None => path.to_string(),
            };
            let page = self.get_json(&request)?;
            let (items, next) = split_page(page, path)?;
            for item in items {
                out.push(
                    serde_json::from_value(item)
                        .map_err(|_| invalid_shape(path, "an item had an unexpected shape"))?,
                );
            }
            match next {
                Some(next) => cursor = Some(next),
                None => break,
            }
        }
        Ok(out)
    }

    /// A JSON GET with a bounded, reported retry on 429.
    fn get_json(&self, path: &str) -> Result<Json> {
        let url = format!("{}{}", self.base, path);
        let mut attempt: u32 = 0;
        loop {
            let response = self
                .agent
                .get(&url)
                .header("Authorization", format!("Bearer {}", self.token))
                .header("Accept", "application/json")
                .call();
            let mut response = match response {
                Ok(response) => response,
                Err(error) => {
                    return Err(ShardsError::Validation(format!(
                        "todoist: GET {path} failed: {error}"
                    )))
                }
            };
            let status = response.status().as_u16();
            if status == 429 {
                if attempt >= MAX_RETRIES {
                    return Err(http_error(path, status));
                }
                let wait = retry_after(response.headers(), attempt);
                self.retries.set(self.retries.get() + 1);
                attempt += 1;
                if !wait.is_zero() {
                    std::thread::sleep(wait);
                }
                continue;
            }
            if !(200..300).contains(&status) {
                return Err(http_error(path, status));
            }
            let text = response
                .body_mut()
                .read_to_string()
                .map_err(|_| invalid_shape(path, "the body was not readable"))?;
            return serde_json::from_str(&text)
                .map_err(|_| invalid_shape(path, "the body was not JSON"));
        }
    }
}

/// Honour `Retry-After` seconds, else back off 250 ms, 500 ms, 1 s.
fn retry_after(headers: &ureq::http::HeaderMap, attempt: u32) -> Duration {
    if let Some(seconds) = headers
        .get("retry-after")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.trim().parse::<u64>().ok())
    {
        return Duration::from_secs(seconds.min(MAX_RETRY_AFTER_SECS));
    }
    Duration::from_millis(250u64 << attempt.min(3))
}

fn split_page(page: Json, path: &str) -> Result<(Vec<Json>, Option<String>)> {
    match page {
        Json::Array(items) => Ok((items, None)),
        Json::Object(mut map) => {
            let items = map
                .remove("results")
                .or_else(|| map.remove("items"))
                .and_then(|value| value.as_array().cloned())
                .ok_or_else(|| invalid_shape(path, "no results array"))?;
            let next = map
                .remove("next_cursor")
                .and_then(|value| value.as_str().map(str::to_string))
                .filter(|cursor| !cursor.is_empty());
            Ok((items, next))
        }
        _ => Err(invalid_shape(path, "expected an array or an object")),
    }
}

fn http_error(path: &str, status: u16) -> ShardsError {
    ShardsError::Validation(format!("todoist: GET {path} returned HTTP {status}"))
}

fn invalid_shape(path: &str, detail: &str) -> ShardsError {
    ShardsError::Validation(format!("todoist: GET {path} returned bad data: {detail}"))
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;

    #[test]
    fn a_dotenv_line_is_read_with_quotes_and_export() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(".env");
        std::fs::write(
            &path,
            "# comment\nOTHER=x\nexport TODOIST_API_TOKEN='secret-value'\n",
        )
        .unwrap();
        assert_eq!(
            read_dotenv(&path, "TODOIST_API_TOKEN").as_deref(),
            Some("secret-value")
        );
        assert_eq!(read_dotenv(&path, "MISSING"), None);
    }

    #[test]
    fn a_cursor_is_percent_encoded() {
        assert_eq!(encode_component("a+b/c="), "a%2Bb%2Fc%3D");
        assert_eq!(encode_component("abc-_.~"), "abc-_.~");
    }
}
