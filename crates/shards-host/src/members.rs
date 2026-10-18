//! `[[members]]` and `[core].me`: the host reads these straight from the config TOML, because
//! the core `Config` does not model them (unknown tables are ignored there by design).

use std::path::Path;

use serde::Serialize;

/// One `[[members]]` row, or a member discovered in the vault.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Member {
    pub id: String,
    /// `human` or `agent`.
    pub kind: String,
    /// Display name (the id when none is configured).
    pub name: String,
    pub color: Option<String>,
}

/// What the host needs from the raw config file beyond the core `Config`.
#[derive(Clone, Debug, Default)]
pub struct HostConfig {
    /// `[core].me`, when present and non-empty.
    pub me: Option<String>,
    /// Every well-formed `[[members]]` row, in file order. Duplicated ids keep the first row.
    pub members: Vec<Member>,
}

/// Read `[core].me` and `[[members]]` from the config file. A missing or unparsable file
/// yields the empty config: the core reports config problems on every tool call already.
pub fn read_host_config(path: &Path) -> HostConfig {
    let Ok(text) = std::fs::read_to_string(path) else {
        return HostConfig::default();
    };
    parse_host_config(&text)
}

/// Parse the host keys out of config text. Malformed rows are skipped, never fatal.
pub fn parse_host_config(text: &str) -> HostConfig {
    let Ok(table) = text.parse::<toml::Table>() else {
        return HostConfig::default();
    };
    let me = table
        .get("core")
        .and_then(|c| c.as_table())
        .and_then(|c| c.get("me"))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    let mut members: Vec<Member> = Vec::new();
    if let Some(rows) = table.get("members").and_then(|v| v.as_array()) {
        for row in rows {
            let Some(row) = row.as_table() else { continue };
            let Some(id) = row
                .get("id")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
            else {
                continue;
            };
            if members.iter().any(|m| m.id == id) {
                continue;
            }
            let kind = match row.get("kind").and_then(|v| v.as_str()) {
                Some("human") => "human".to_string(),
                Some("agent") => "agent".to_string(),
                _ => guess_kind(id, me.as_deref(), false).to_string(),
            };
            let name = row
                .get("name")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .unwrap_or(id)
                .to_string();
            let color = row
                .get("color")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string);
            members.push(Member {
                id: id.to_string(),
                kind,
                name,
                color,
            });
        }
    }
    HostConfig { me, members }
}

/// The kind heuristic for an identity no `[[members]]` row describes.
///
/// `me` is human. An id ending in `agent` or `bot`, or naming a well-known coding agent, is an
/// agent. An id seen only as a scratch or memory author (`only_authored`) is an agent too.
/// Everything else is human.
pub fn guess_kind(id: &str, me: Option<&str>, only_authored: bool) -> &'static str {
    if me == Some(id) {
        return "human";
    }
    let lower = id.to_ascii_lowercase();
    let agentish = lower.ends_with("agent")
        || lower.ends_with("bot")
        || ["claude", "codex", "gpt", "gemini", "cursor", "copilot"]
            .iter()
            .any(|hint| lower.contains(hint));
    if agentish || only_authored {
        "agent"
    } else {
        "human"
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;

    #[test]
    fn parses_members_and_me() {
        let cfg = parse_host_config(
            r##"
[core]
vault_path = "/v"
me = "lennard"

[[members]]
id = "lennard"
kind = "human"
name = "Lennard"
color = "#7c3aed"

[[members]]
id = "ops-agent"

[[members]]
name = "no id, skipped"

[[members]]
id = "lennard"
name = "duplicate, skipped"
"##,
        );
        assert_eq!(cfg.me.as_deref(), Some("lennard"));
        assert_eq!(cfg.members.len(), 2);
        assert_eq!(cfg.members[0].name, "Lennard");
        assert_eq!(cfg.members[0].color.as_deref(), Some("#7c3aed"));
        assert_eq!(cfg.members[1].kind, "agent");
        assert_eq!(cfg.members[1].name, "ops-agent");
    }

    #[test]
    fn garbage_is_empty_not_fatal() {
        let cfg = parse_host_config("this is = = not toml");
        assert!(cfg.me.is_none());
        assert!(cfg.members.is_empty());
    }

    #[test]
    fn kind_heuristic() {
        assert_eq!(guess_kind("ops-agent", None, false), "agent");
        assert_eq!(guess_kind("deploybot", None, false), "agent");
        assert_eq!(guess_kind("claude-code", None, false), "agent");
        assert_eq!(guess_kind("maya", None, false), "human");
        assert_eq!(guess_kind("maya", None, true), "agent");
        assert_eq!(guess_kind("my-agent", Some("my-agent"), true), "human");
    }
}
