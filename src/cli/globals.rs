//! The global flags and the flag-placement contract (R6).

use std::path::PathBuf;

/// The root flags. Every command reads its merged copy off the `Ctx`.
#[derive(Clone, Debug, Default)]
pub struct GlobalOpts {
    pub json: bool,
    pub quiet: bool,
    pub owner: Option<String>,
    pub mine: bool,
    pub config: Option<PathBuf>,
    pub vault: Option<PathBuf>,
}

impl GlobalOpts {
    /// Merge a subcommand's local flags into the global ones.
    ///
    /// Booleans OR; `owner` is local-wins-else-global. `task update` and `memory update`
    /// deliberately pass `None` so their reassignment `--owner` is not folded in.
    pub fn coalesce(&mut self, json: bool, quiet: bool, owner: Option<String>) {
        self.json = self.json || json;
        self.quiet = self.quiet || quiet;
        if owner.is_some() {
            self.owner = owner;
            self.normalize();
        }
    }

    /// Drop a blank `--owner`, so it reads as absent everywhere.
    ///
    /// `Config::agent` already treats `agent = ""` as unset and `init --agent ""` writes the
    /// default, but `--owner ""` used to survive into `effective_owner` and be written to
    /// disk as `owner: ""` — an identity no roster, filter or `--mine` can ever match. One
    /// rule, applied where the flags enter: a blank value is no identity, so a whitespace-only
    /// `--owner "   "` goes exactly where `--owner ""` goes. `product-cli.md` pins it — "An
    /// empty `--owner` reads as absent, never as an identity" — and the MCP boundary applies
    /// the same rule to its own `owner` argument, so the two surfaces cannot disagree.
    pub fn normalize(&mut self) {
        if self
            .owner
            .as_deref()
            .is_some_and(|owner| owner.trim().is_empty())
        {
            self.owner = None;
        }
    }

    /// `--json` or `--quiet`: no prompts, no advisories that are not asked for.
    pub fn is_machine(&self) -> bool {
        self.json || self.quiet
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;

    #[test]
    fn booleans_or_and_owner_is_local_wins() {
        let mut g = GlobalOpts {
            json: true,
            owner: Some("global".into()),
            ..GlobalOpts::default()
        };
        g.coalesce(false, true, None);
        assert!(g.json && g.quiet);
        assert_eq!(g.owner.as_deref(), Some("global"));
        g.coalesce(false, false, Some("local".into()));
        assert_eq!(g.owner.as_deref(), Some("local"));
    }

    #[test]
    fn a_blank_owner_is_absent_and_a_real_one_kept_verbatim() {
        for blank in ["", "   ", "\t\n"] {
            let mut g = GlobalOpts {
                owner: Some(blank.to_string()),
                ..GlobalOpts::default()
            };
            g.normalize();
            assert_eq!(g.owner, None, "{blank:?}");
        }
        let mut g = GlobalOpts {
            owner: Some("  bob  ".to_string()),
            ..GlobalOpts::default()
        };
        g.normalize();
        assert_eq!(g.owner.as_deref(), Some("  bob  "));
    }

    #[test]
    fn either_side_of_the_command_name_is_the_same() {
        let mut left = GlobalOpts {
            json: true,
            ..GlobalOpts::default()
        };
        left.coalesce(false, false, None);
        let mut right = GlobalOpts::default();
        right.coalesce(true, false, None);
        assert_eq!(left.json, right.json);
        assert!(left.is_machine() && right.is_machine());
    }
}
