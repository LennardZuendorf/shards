//! The one tokenizer. Documents and queries go through the same function, always.
//!
//! Lowercase via `to_lowercase`, split on `!char::is_alphanumeric`, keep every non-empty run.
//! No minimum length (final.md §7.2).
//!
//! The ranker matches on [`terms`]: every token passed through a light English suffix
//! stemmer ([`stem`]), so `compare`, `compared` and `comparison` meet. The query side
//! ([`token_set`]) also drops a short list of English stop-words, so an agent's question
//! ("how should I compare fares") ranks on its content words. Both are ranking aids only: the
//! literal-substring tiers never see a stemmed or filtered token.

/// Every token in `text`, in order, with repeats.
pub fn tokenize(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .map(str::to_string)
        .collect()
}

/// Function words a question carries that never identify a document. Matched before
/// stemming, on the lowercased token. Negations (`no`, `not`) stay: they carry meaning.
const STOPWORDS: &[&str] = &[
    "a", "about", "an", "and", "are", "at", "be", "by", "can", "could", "did", "do", "does", "for",
    "from", "how", "i", "in", "into", "is", "it", "its", "me", "my", "of", "on", "or", "our",
    "should", "that", "the", "this", "to", "was", "we", "were", "what", "when", "where", "which",
    "who", "why", "with", "would", "you", "your",
];

/// Whether `token` (already lowercased) is a stop-word.
pub fn is_stopword(token: &str) -> bool {
    STOPWORDS.contains(&token)
}

/// A light English suffix stemmer, applied to document and query tokens alike.
///
/// Only all-ASCII-letter tokens longer than three characters are touched; anything else
/// (digits, ids, other scripts) passes through unchanged. Three steps, each at most once:
/// plurals (`-ies` → `-y`, `-es` after a sibilant, a plain `-s` but not `-ss`/`-us`/`-is`),
/// then one of `-ation`, `-ison`, `-ing`, `-ed` when at least three letters remain (a doubled
/// final consonant left by `-ing`/`-ed` is undoubled), then a final `-e` when at least four
/// letters remain. `compare`, `compared`, `comparing` and `comparison` all become `compar`;
/// `fare` and `fares` both stay `fare`.
pub fn stem(token: &str) -> String {
    if token.chars().count() <= 3 || !token.chars().all(|c| c.is_ascii_lowercase()) {
        return token.to_string();
    }
    let mut w: Vec<char> = token.chars().collect();
    let ends = |w: &[char], suffix: &str| -> bool {
        let s: Vec<char> = suffix.chars().collect();
        w.len() > s.len() && w.ends_with(&s)
    };
    // 1. plurals
    if ends(&w, "ies") && w.len() > 4 {
        w.truncate(w.len() - 3);
        w.push('y');
    } else if ["sses", "xes", "zes", "ches", "shes"]
        .iter()
        .any(|s| ends(&w, s))
    {
        w.truncate(w.len() - 2);
    } else if ends(&w, "s") && !["ss", "us", "is"].iter().any(|s| ends(&w, s)) {
        w.truncate(w.len() - 1);
    }
    // 2. derivational / verbal suffixes
    for (suffix, undouble) in [
        ("ation", false),
        ("ison", false),
        ("ing", true),
        ("ed", true),
    ] {
        let n = suffix.chars().count();
        if ends(&w, suffix) && w.len() - n >= 3 {
            w.truncate(w.len() - n);
            let len = w.len();
            if undouble && len >= 4 {
                if let (Some(a), Some(b)) = (w.get(len - 1), w.get(len - 2)) {
                    if a == b && !matches!(a, 'l' | 's' | 'z' | 'a' | 'e' | 'i' | 'o' | 'u') {
                        w.truncate(len - 1);
                    }
                }
            }
            break;
        }
    }
    // 3. a final -e
    if w.last() == Some(&'e') && w.len() > 4 {
        w.truncate(w.len() - 1);
    }
    w.into_iter().collect()
}

/// A document field's ranking terms: [`tokenize`], each token [`stem`]med, repeats kept.
pub fn terms(text: &str) -> Vec<String> {
    tokenize(text).iter().map(|t| stem(t)).collect()
}

/// The query's term *set*: [`tokenize`], stop-words dropped, each token [`stem`]med, with an
/// order-preserving dedupe. A query made only of stop-words keeps them all, so it still ranks.
pub fn token_set(text: &str) -> Vec<String> {
    let raw = tokenize(text);
    let content: Vec<&String> = raw.iter().filter(|t| !is_stopword(t)).collect();
    let kept: Vec<&String> = if content.is_empty() {
        raw.iter().collect()
    } else {
        content
    };
    let mut out: Vec<String> = Vec::new();
    for token in kept {
        let term = stem(token);
        if !out.contains(&term) {
            out.push(term);
        }
    }
    out
}

/// How often `token` occurs in `tokens`.
pub fn term_frequency(tokens: &[String], token: &str) -> usize {
    tokens.iter().filter(|t| t.as_str() == token).count()
}

/// The `#`-led heading lines of a Markdown body, hashes and leading whitespace stripped.
///
/// Fenced code is not parsed: a `#` inside a fence is a heading here, exactly as a naive
/// ranker would see it. That is deliberate — the headings field is a ranking hint, not a
/// Markdown AST.
pub fn headings(body: &str) -> String {
    let mut out: Vec<&str> = Vec::new();
    for line in body.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with('#') {
            out.push(trimmed.trim_start_matches('#').trim());
        }
    }
    out.join("\n")
}

/// The body lowercased one code point at a time, so an index into the result is also an
/// index into `body.chars()`.
///
/// `str::to_lowercase` may map one code point to several (`İ`), which would shift every later
/// offset; taking only the first code point of each mapping keeps the 1:1 alignment a snippet
/// offset needs.
pub fn lower_chars(text: &str) -> Vec<char> {
    text.chars()
        .map(|c| c.to_lowercase().next().unwrap_or(c))
        .collect()
}

/// The code-point offset of the first occurrence of `needle` in `haystack`, both already
/// lowercased code point by code point.
pub fn find_chars(haystack: &[char], needle: &[char]) -> Option<usize> {
    if needle.is_empty() {
        return Some(0);
    }
    if needle.len() > haystack.len() {
        return None;
    }
    (0..=haystack.len() - needle.len())
        .find(|start| haystack.get(*start..start + needle.len()) == Some(needle))
}

#[cfg(test)]
#[allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]
mod tests {
    use super::*;

    #[test]
    fn tokenize_lowercases_and_splits_on_non_alphanumerics() {
        assert_eq!(
            tokenize("Hello, World! foo-bar_baz"),
            ["hello", "world", "foo", "bar", "baz"]
        );
    }

    #[test]
    fn tokenize_keeps_single_character_tokens_and_digits() {
        assert_eq!(tokenize("a b 1 22"), ["a", "b", "1", "22"]);
    }

    #[test]
    fn tokenize_keeps_unicode_alphanumerics() {
        assert_eq!(tokenize("Ünïcödé Tïtle"), ["ünïcödé", "tïtle"]);
    }

    #[test]
    fn tokenize_of_empty_or_punctuation_only_is_empty() {
        assert!(tokenize("").is_empty());
        assert!(tokenize("---  !!! ").is_empty());
    }

    #[test]
    fn token_set_dedupes_and_preserves_order() {
        assert_eq!(token_set("beta alpha beta"), ["beta", "alpha"]);
    }

    #[test]
    fn token_set_drops_stopwords_and_stems() {
        assert_eq!(token_set("how should I compare fares"), ["compar", "fare"]);
        // Plural and singular collapse into one term.
        assert_eq!(token_set("fare fares"), ["fare"]);
    }

    #[test]
    fn a_stopword_only_query_keeps_its_tokens() {
        assert_eq!(token_set("how to"), ["how", "to"]);
    }

    #[test]
    fn stem_joins_inflections_of_one_word() {
        for w in [
            "compare",
            "compared",
            "comparing",
            "comparison",
            "comparisons",
        ] {
            assert_eq!(stem(w), "compar", "{w}");
        }
        assert_eq!(stem("fares"), stem("fare"));
        assert_eq!(stem("converted"), stem("convert"));
        assert_eq!(stem("stopped"), "stop");
        assert_eq!(stem("stories"), stem("story"));
        assert_eq!(stem("boxes"), "box");
        assert_eq!(stem("notes"), "note");
    }

    #[test]
    fn stem_leaves_short_ids_and_non_ascii_tokens_alone() {
        for w in ["is", "bus", "class", "t-ab12", "ünïcödés", "2026", "focus"] {
            assert_eq!(stem(w), w);
        }
        assert_ne!(stem("note"), stem("not"));
    }

    #[test]
    fn terms_stems_every_token_and_keeps_repeats() {
        assert_eq!(terms("Fares, fares!"), ["fare", "fare"]);
    }

    #[test]
    fn term_frequency_counts_repeats() {
        let tokens = tokenize("zebra zebra horse");
        assert_eq!(term_frequency(&tokens, "zebra"), 2);
        assert_eq!(term_frequency(&tokens, "horse"), 1);
        assert_eq!(term_frequency(&tokens, "missing"), 0);
    }

    #[test]
    fn headings_strips_hashes_and_keeps_order() {
        let body = "intro\n# One\ntext\n### Three\n  ## Indented\nnot # a heading\n";
        assert_eq!(headings(body), "One\nThree\nIndented");
    }

    #[test]
    fn headings_of_a_bodyless_document_is_empty() {
        assert_eq!(headings(""), "");
        assert_eq!(headings("no headings here"), "");
    }

    #[test]
    fn find_chars_reports_a_code_point_offset() {
        let hay = lower_chars("Ünïcödé zebra here");
        let needle = lower_chars("ZEBRA");
        assert_eq!(find_chars(&hay, &needle), Some(8));
    }

    #[test]
    fn find_chars_misses_cleanly() {
        let hay = lower_chars("abc");
        assert_eq!(find_chars(&hay, &lower_chars("abcd")), None);
        assert_eq!(find_chars(&hay, &[]), Some(0));
    }
}
