//! Domain logic, one module per space plus the shared selection primitives.

pub mod activity;
pub mod assets;
pub mod context;
pub mod deps;
pub mod lenses;
pub mod memories;
pub mod notes;
pub mod owner;
pub mod recur;
pub mod scratch;
pub mod select;
pub mod tags;
pub mod tasks;
pub mod wikilinks;

/// Options shared by every `append` verb.
///
/// Foundation-owned (a deviation from ownership.md §2.2, which placed it in `domain::notes`)
/// so that the note, task, memory, scratch and asset agents cannot break each other.
#[derive(Clone, Debug, Default)]
pub struct AppendOpts {
    /// Append under `## {section}`, creating it at the end of the body when absent.
    pub section: Option<String>,
    /// Prefix the block with an attribution stamp.
    pub timestamp: bool,
    /// Who is running the command — never the entity's owner.
    pub actor: Option<String>,
}

pub use owner::{effective_owner, is_blank, validate_owner};
pub use select::{select, Filter, FromMeta, SortKey, SortValue, Sortable};
pub use tags::{apply_tag_spec, TAG_SPEC_SEMANTICS};
pub use wikilinks::{backlinks_by_title, find_dangling, resolve_wikilinks, title_index};

use crate::error::{Result, ShardsError};

/// Refuse a blank `title` — the one message shape for every write path that sets one.
///
/// `title` is required frontmatter: a file carrying `title: ""` is one no list can name and
/// no surface can render, and `shards#39` found create paths that wrote exactly that. A
/// create has no clear, so a blank one loses the capture; an update has no clear either, so a
/// blank `--title` there would produce a state create refuses to produce (`tech-core.md` pins
/// the same refusal for the host's `set_meta`). The rule lives here so the note and memory
/// paths cannot word it differently.
pub fn reject_blank_title(title: &str) -> Result<()> {
    if title.trim().is_empty() {
        return Err(ShardsError::Validation(format!(
            "invalid title: '{title}' (needs a title)"
        )));
    }
    Ok(())
}
