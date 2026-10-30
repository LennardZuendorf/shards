//! Roster validation at the core write boundary, for every space.

use crate::config::Config;
use crate::error::{Result, ShardsError};

/// Reject an owner that is not in a non-empty `[tasks].collections`.
///
/// `None` is exempt (the default-to-config-agent path) and an empty roster disables the check.
/// A blank owner is exempt too: it is read as absent at every boundary before it reaches here
/// (see [`is_blank`]), never as a roster value that happens to be missing.
/// This is a spelling check across a fleet's identities, never an authorisation boundary.
pub fn validate_owner(cfg: &Config, owner: Option<&str>) -> Result<()> {
    let roster = &cfg.tasks.collections;
    match owner.filter(|o| !is_blank(o)) {
        None => Ok(()),
        Some(o) if roster.is_empty() => {
            let _ = o;
            Ok(())
        }
        Some(o) if roster.iter().any(|c| c == o) => Ok(()),
        Some(o) => Err(ShardsError::Validation(format!("unknown owner: '{o}'"))),
    }
}

/// Whether an owner string is blank — no identity at all.
///
/// A blank owner is never an identity: `--owner ""` / `--owner "   "` read as absent at every
/// boundary (the CLI flag normalizer, the MCP argument boundary, and every write path that
/// sets an owner), because a file carrying `owner: "   "` matches no roster, filter or `--mine`.
pub fn is_blank(owner: &str) -> bool {
    owner.trim().is_empty()
}

/// The owner a write should record: the flag when it names someone, else the configured agent.
pub fn effective_owner(cfg: &Config, flag: Option<&str>) -> Option<String> {
    match flag.filter(|o| !is_blank(o)) {
        Some(o) => Some(o.to_string()),
        None => cfg.agent().map(str::to_string),
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;
    use crate::config::test_support::config_for;

    #[test]
    fn an_empty_roster_accepts_anything() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = config_for(dir.path());
        assert!(validate_owner(&cfg, Some("anyone")).is_ok());
        assert!(validate_owner(&cfg, None).is_ok());
    }

    #[test]
    fn a_populated_roster_rejects_strangers() {
        let dir = tempfile::tempdir().unwrap();
        let mut cfg = config_for(dir.path());
        cfg.tasks.collections = vec!["alice".into(), "bob".into()];
        assert!(validate_owner(&cfg, Some("alice")).is_ok());
        assert!(validate_owner(&cfg, None).is_ok());
        let err = validate_owner(&cfg, Some("ghost-agent")).unwrap_err();
        assert_eq!(err.code(), 2);
        assert_eq!(err.to_string(), "unknown owner: 'ghost-agent'");
    }

    #[test]
    fn effective_owner_falls_back_to_the_agent() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = config_for(dir.path());
        assert_eq!(effective_owner(&cfg, None).as_deref(), Some("test-agent"));
        assert_eq!(effective_owner(&cfg, Some("x")).as_deref(), Some("x"));
    }

    #[test]
    fn a_blank_flag_owner_falls_back_to_the_agent_instead_of_writing_blank() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = config_for(dir.path());
        for blank in ["", "   ", "\t"] {
            assert_eq!(
                effective_owner(&cfg, Some(blank)).as_deref(),
                Some("test-agent"),
                "{blank:?}"
            );
        }
    }
}
