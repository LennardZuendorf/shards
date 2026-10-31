//! The MCP `instructions` block: a pure function of `Option<&Config>`, capped at 2048 bytes.
//!
//! Eight sections joined with a blank line, in the fixed order of `map/mcp.md` §6: what shards
//! is, identity, valid owners, vault, recall, the tag trap, the coordination protocol, and how
//! to read results. Four of them are config-driven; every degraded variant still names
//! `shards init`. Nothing here touches the filesystem, the process or a socket.

use crate::config::Config;
use crate::domain::TAG_SPEC_SEMANTICS;

/// The hard budget for the rendered block, in UTF-8 bytes. `tools/list` is paid on every
/// session before any work, and so is this.
pub const BUDGET_BYTES: usize = 2048;

/// How many roster identities are spelled out before the `(+n more)` tail.
pub const MAX_ROSTER_SHOWN: usize = 8;

/// Section 1 — what shards is: the five spaces and the which-space-wins rule (final.md §9.5).
const WHAT_SHARDS_IS: &str = "# shards\n\
Five spaces in a shared Markdown vault: note (knowledge), task (work), memory (recall), scratch (session state), asset (files). Markdown is authoritative. Scratch is excluded from default search/lenses.";

/// Section 6 — creation uses lists; updates use the shared tag grammar.
const TAG_TRAP_HEAD: &str = "## Tag mutation\n\
New tags: list. Update tags: comma string. ";

/// Section 7 — enrolled lifecycle; standalone MCP remains usable.
const COORDINATION: &str = "## Coordination protocol\n\
In operator-enrolled projects use using-shards before work, including research/review. A checklist is insufficient. Other standalone MCP use stays opt-in. Conversation needs no task. Operator instructions and approval gates come first.\n\
Reuse/create one task; inspect shards_task_claim {strict:true}: status must be claimed, claimed_by must match actor. Resolve same-actor session ambiguity before work. Use shards_task_append for intent before work and checkpoint before yielding. Append evidence before shards_task_finish; recurring finish needs observed expected_due. A turn ending is not completion.\n\
Wait/error: append question/failure and next actor; shards_task_update tags +needs-input/+agent-error. Clear on recovery: -needs-input,-agent-error. For waits/handoff, checkpoint then shards_task_release your claim. On outage attempt bounded repair, report and ask for a scoped exception before work.\n\
Local owner/claimed_by strings do not prove identity. Roster checks owner spelling only. Never take another execution's claim. Prefer append; search before creation; inspect duplicate warnings.";

/// Section 8 — result fields and withheld operations.
const READING_RESULTS: &str = "## Reading results\n\
Tasks: owner, claimed_by, status, path. Search: score, mode (indexed/fallback). Creation: warnings. Withheld: delete, admin controls, task_release --force.";

fn identity_section(cfg: Option<&Config>) -> String {
    let Some(cfg) = cfg else {
        return "## Your identity\n\
No config: run `shards init`, then reconnect. Identity/roster/vault unknown. Supply explicit claimer/owner when needed."
            .to_string();
    };
    match cfg.agent() {
        None => "## Your identity\n\
No actor ([core].agent / $SHARDS_AGENT): run `shards init` or supply claimer/owner."
            .to_string(),
        Some(agent) => format!(
            "## Your identity\n\
Actor `{agent}` ([core].agent / $SHARDS_AGENT). Default claimer/owner."
        ),
    }
}

fn roster_section(cfg: Option<&Config>, shown: usize) -> String {
    let Some(cfg) = cfg else {
        return "## Valid owners\nNot known — see identity above.".to_string();
    };
    let roster = &cfg.tasks.collections;
    if roster.is_empty() {
        return "## Valid owners\n\
Empty roster: any owner spelling accepted."
            .to_string();
    }
    let head: Vec<&str> = roster.iter().take(shown).map(String::as_str).collect();
    let mut body = head.join(", ");
    let hidden = roster.len().saturating_sub(head.len());
    if hidden > 0 {
        body.push_str(&format!(" (+{hidden} more)"));
    }
    format!("## Valid owners ([tasks].collections)\n{body}")
}

fn vault_section(cfg: Option<&Config>) -> String {
    match cfg {
        None => "## Vault\nNot known — see identity above.".to_string(),
        Some(cfg) => format!("## Vault\n{}", cfg.vault().display()),
    }
}

fn recall_section(cfg: Option<&Config>) -> String {
    let Some(cfg) = cfg else {
        return "## Recall\nUnknown — assume substring-only until config loads.".to_string();
    };
    if !cfg.search.hybrid {
        return "## Recall\n\
Substring fallback only ([search].hybrid = false) — search never calls indexed."
            .to_string();
    }
    let collection = cfg.search.collection.as_deref().unwrap_or("(unset)");
    format!(
        "## Recall\n\
Hybrid ({collection}) degrades silently to substring when indexed fails. Check shards_health or hit mode."
    )
}

/// Compose the eight sections at a given roster width.
fn compose(cfg: Option<&Config>, roster_shown: usize) -> String {
    let tag_trap = format!("{TAG_TRAP_HEAD}{TAG_SPEC_SEMANTICS}");
    [
        WHAT_SHARDS_IS.to_string(),
        identity_section(cfg),
        roster_section(cfg, roster_shown),
        vault_section(cfg),
        recall_section(cfg),
        tag_trap,
        COORDINATION.to_string(),
        READING_RESULTS.to_string(),
    ]
    .join("\n\n")
}

/// Truncate to at most `BUDGET_BYTES`, never mid-code-point.
fn clamp(text: String) -> String {
    if text.len() <= BUDGET_BYTES {
        return text;
    }
    let mut cut = BUDGET_BYTES;
    while cut > 0 && !text.is_char_boundary(cut) {
        cut -= 1;
    }
    text.get(..cut).unwrap_or_default().to_string()
}

/// Build the instructions block. Pure: same config in, same bytes out, ≤ [`BUDGET_BYTES`].
///
/// A long roster is the only elastic part, so it is what gives way first when the budget
/// binds; a pathological config is finally truncated on a code-point boundary.
pub fn build(cfg: Option<&Config>) -> String {
    for shown in (0..=MAX_ROSTER_SHOWN).rev() {
        let text = compose(cfg, shown);
        if text.len() <= BUDGET_BYTES {
            return text;
        }
    }
    clamp(compose(cfg, 0))
}

#[cfg(test)]
#[allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::string_slice,
    clippy::indexing_slicing
)]
mod tests {
    use super::*;
    use crate::config::test_support::config_for;

    /// The authorization denylist: none of these may appear in any rendered variant.
    const AUTH_DENYLIST: [&str; 12] = [
        "permission",
        "permit",
        "authoriz",
        "unauthoriz",
        "access denied",
        "forbidden",
        "not allowed",
        "enforc",
        "restrict",
        "privilege",
        "grant",
        "credential",
    ];

    fn variants() -> Vec<String> {
        let dir = tempfile::tempdir().unwrap();
        let base = config_for(dir.path());
        let mut no_agent = base.clone();
        no_agent.core.agent = None;
        let mut roster = base.clone();
        roster.tasks.collections = (0..25).map(|i| format!("agent-number-{i:02}")).collect();
        let mut hybrid = base.clone();
        hybrid.search.hybrid = true;
        hybrid.search.collection = Some("shards-vault".to_string());
        let mut no_hybrid = base.clone();
        no_hybrid.search.hybrid = false;
        vec![
            build(None),
            build(Some(&base)),
            build(Some(&no_agent)),
            build(Some(&roster)),
            build(Some(&hybrid)),
            build(Some(&no_hybrid)),
        ]
    }

    // This is the MCP initialize payload contract, not a skill-behavior test.
    #[test]
    fn lifecycle_and_signal_guidance_survives_every_config_variant() {
        for text in variants() {
            for required in [
                "enrolled",
                "using-shards",
                "standalone",
                "approval",
                "shards_task_claim",
                "strict:true",
                "claimed_by",
                "status",
                "shards_task_append",
                "shards_task_update",
                "+needs-input",
                "+agent-error",
                "-needs-input,-agent-error",
                "checkpoint",
                "shards_task_release",
                "shards_task_finish",
                "expected_due",
                "do not prove identity",
                "Withheld:",
            ] {
                assert!(text.contains(required), "missing {required}: {text}");
            }
        }
    }

    #[test]
    fn every_variant_fits_the_budget() {
        for text in variants() {
            assert!(text.len() <= BUDGET_BYTES, "{} bytes", text.len());
        }
    }

    #[test]
    fn every_variant_is_denylist_clean() {
        for text in variants() {
            let lower = text.to_lowercase();
            for banned in AUTH_DENYLIST {
                assert!(!lower.contains(banned), "{banned} appears in the block");
            }
        }
    }

    #[test]
    fn no_notes_application_is_named() {
        for text in variants() {
            let lower = text.to_lowercase();
            assert!(!lower.contains("tolaria"));
            assert!(!lower.contains("obsidian"));
        }
    }

    #[test]
    fn every_degraded_variant_names_shards_init() {
        let dir = tempfile::tempdir().unwrap();
        let mut no_agent = config_for(dir.path());
        no_agent.core.agent = None;
        for text in [build(None), build(Some(&no_agent))] {
            assert!(!text.is_empty());
            assert!(text.contains("shards"));
            assert!(text.contains("shards init"), "{text}");
        }
        // A healthy config still renders every section, it just has nothing to advise.
        for text in variants() {
            assert!(text.contains("# shards"));
            assert!(!text.is_empty());
        }
    }

    #[test]
    fn the_tag_sentence_is_embedded_verbatim() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = config_for(dir.path());
        assert!(build(Some(&cfg)).contains(TAG_SPEC_SEMANTICS));
        assert!(build(None).contains(TAG_SPEC_SEMANTICS));
    }

    #[test]
    fn the_block_is_config_driven() {
        let dir = tempfile::tempdir().unwrap();
        let mut a = config_for(dir.path());
        a.core.agent = Some("flights-agent".to_string());
        let mut b = config_for(dir.path());
        b.core.agent = Some("notes-agent".to_string());
        let text_a = build(Some(&a));
        let text_b = build(Some(&b));
        assert_ne!(text_a, text_b);
        assert!(text_a.contains("flights-agent"));
        assert!(!text_a.contains("notes-agent"));
    }

    #[test]
    fn the_recall_section_says_which_path_answers() {
        let dir = tempfile::tempdir().unwrap();
        let mut off = config_for(dir.path());
        off.search.hybrid = false;
        let text = build(Some(&off));
        assert!(text.contains("never calls indexed"));
        assert!(text.contains("Substring fallback only"));

        let mut on = config_for(dir.path());
        on.search.hybrid = true;
        on.search.collection = Some("c".to_string());
        let text = build(Some(&on));
        assert!(text.contains("degrades"));
        assert!(text.contains("silently"));
        assert!(text.contains("shards_health"));
    }

    #[test]
    fn a_long_roster_gives_way_before_the_budget_does() {
        let dir = tempfile::tempdir().unwrap();
        let mut cfg = config_for(dir.path());
        cfg.tasks.collections = (0..40)
            .map(|i| format!("a-very-long-agent-identity-number-{i:03}"))
            .collect();
        let text = build(Some(&cfg));
        assert!(text.len() <= BUDGET_BYTES);
        assert!(text.contains("more)"));
        // Every static section survives the trim.
        assert!(text.contains("## Coordination protocol"));
        assert!(text.contains("## Reading results"));
    }

    #[test]
    fn the_eight_sections_are_in_order() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = config_for(dir.path());
        let text = build(Some(&cfg));
        let heads = [
            "# shards",
            "## Your identity",
            "## Valid owners",
            "## Vault",
            "## Recall",
            "## Tag mutation",
            "## Coordination protocol",
            "## Reading results",
        ];
        let mut at = 0usize;
        for head in heads {
            let found = text[at..].find(head).map(|i| i + at);
            assert!(found.is_some(), "{head} missing or out of order");
            at = found.unwrap_or(at);
        }
    }

    #[test]
    fn the_function_is_pure() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = config_for(dir.path());
        assert_eq!(build(Some(&cfg)), build(Some(&cfg)));
        assert_eq!(build(None), build(None));
    }
}
