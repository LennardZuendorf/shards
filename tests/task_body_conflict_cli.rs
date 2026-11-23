//! #111 through the real binary: a description write is atomic and conflict-safe.
//!
//! The race is the one a dogfooding owner hits daily — Shards autosave against an external
//! editor's save, or two Shards surfaces on one task body. Two writers that each read before
//! either writes are serialised by the entity lock, so without a precondition the second one
//! silently overwrites the first. `--expect-sha256` is that precondition: a write whose
//! description no longer hashes to what the caller read is refused (exit 4, kind `conflict`),
//! the draft is kept in `tasks/.conflicts/`, and the task file is never touched.
//!
//! A truncated save is never a deletion: the sweep names it and moves on, a write refuses it
//! and says why, and neither removes a file nor moves one to `done/`.

mod common;

use common::VaultFixture;
use serde_json::Value as Json;

// ---------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------

fn run(f: &VaultFixture, args: &[&str]) -> (String, String, i32) {
    let out = f.cmd().args(args).output().expect("run shards");
    (
        String::from_utf8_lossy(&out.stdout).into_owned(),
        String::from_utf8_lossy(&out.stderr).into_owned(),
        out.status.code().unwrap_or(-1),
    )
}

fn ok(f: &VaultFixture, args: &[&str]) -> String {
    let (stdout, stderr, code) = run(f, args);
    assert_eq!(code, 0, "args={args:?} stderr={stderr}");
    stdout.trim_end().to_string()
}

fn new_task(f: &VaultFixture, args: &[&str]) -> String {
    let mut argv = vec!["--quiet", "task", "new"];
    argv.extend_from_slice(args);
    ok(f, &argv)
}

fn get(f: &VaultFixture, id: &str) -> Json {
    serde_json::from_str(&ok(f, &["--json", "task", "get", id])).expect("task get --json")
}

fn list_ids(f: &VaultFixture) -> Vec<String> {
    ok(f, &["--quiet", "task", "list", "--limit", "-1"])
        .lines()
        .map(str::to_string)
        .collect()
}

/// The task's file, vault-relative.
fn task_file(f: &VaultFixture, id: &str) -> String {
    f.files()
        .into_iter()
        .find(|p| p.ends_with(&format!("/{id}.md")))
        .unwrap_or_else(|| panic!("no task file for {id} in {:?}", f.files()))
}

/// Everything after the closing frontmatter fence, without the blank separator line.
fn body_after_fence(file_text: &str) -> String {
    file_text
        .split_once("\n---\n")
        .map(|(_, rest)| rest)
        .unwrap_or_default()
        .trim_start_matches('\n')
        .to_string()
}

/// The description as a surface sees it: the body without its managed line, trimmed exactly as
/// the frontmatter splitter trims a body.
fn description_of(file_text: &str) -> String {
    body_after_fence(file_text)
        .split_once('\n')
        .map_or_else(String::new, |(_, rest)| {
            rest.trim_start_matches('\n').trim_end().to_string()
        })
}

/// The managed checkbox line: the body's first line.
fn managed_line(file_text: &str) -> String {
    body_after_fence(file_text)
        .lines()
        .next()
        .unwrap_or_default()
        .to_string()
}

/// The `line_digest` frontmatter value, exactly as on disk.
fn line_digest(file_text: &str) -> String {
    file_text
        .lines()
        .find(|l| l.starts_with("line_digest:"))
        .unwrap_or_else(|| panic!("no line_digest in {file_text}"))
        .to_string()
}

/// Every file kept under `tasks/.conflicts/`, as its text.
fn conflicts(f: &VaultFixture) -> Vec<String> {
    let dir = f.vault.join("tasks/.conflicts");
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut out: Vec<String> = entries
        .map(|e| std::fs::read_to_string(e.expect("dirent").path()).expect("read conflict"))
        .collect();
    out.sort();
    out
}

fn sha256(text: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

// ---------------------------------------------------------------------------------------
// one body accepted, the loser kept
// ---------------------------------------------------------------------------------------

#[test]
fn two_writers_keep_the_loser_and_never_silently_overwrite() {
    let f = VaultFixture::new();
    let id = new_task(&f, &["Ship the thing", "--body", "Original description."]);

    // Writer A reads the description it is about to replace.
    let seen = get(&f, &id);
    let read_body = seen["body"].as_str().expect("body").to_string();
    // The token is the hash of exactly what `task get` reported, nothing else.
    assert_eq!(
        seen["body_sha256"].as_str().expect("body_sha256"),
        sha256(&read_body),
        "body_sha256 must be the sha256 of the reported description"
    );
    let stale = seen["body_sha256"].as_str().unwrap_or_default().to_string();

    // Writer B lands its own description change before A writes.
    ok(
        &f,
        &[
            "--quiet",
            "task",
            "append",
            &id,
            "A paragraph the other writer landed.",
        ],
    );
    let after_b = f.read(&task_file(&f, &id));
    assert!(
        after_b.contains("A paragraph the other writer landed."),
        "precondition: writer B's change is on disk: {after_b}"
    );

    // Writer A writes with the baseline it read: refused, not applied.
    let (stdout, stderr, code) = run(
        &f,
        &[
            "--json",
            "task",
            "set-body",
            &id,
            "A's replacement description.",
            "--expect-sha256",
            &stale,
        ],
    );
    assert_eq!(code, 4, "a stale description is a conflict: {stderr}");
    assert_eq!(stdout, "", "nothing is written on stdout: {stdout}");
    let envelope: Json = serde_json::from_str(&stderr).expect("json envelope on stderr");
    assert_eq!(envelope["kind"], Json::from("conflict"));
    assert_eq!(envelope["target"], Json::from(id.clone()));
    assert_eq!(
        envelope["current_sha256"],
        Json::from(sha256(&description_of(&after_b))),
        "the envelope names the sha the file has now"
    );
    // `updated` is a timestamp scalar, not a plain string: the refusal must still report it, or
    // a caller has no idea when the version it collided with landed.
    let updated = after_b
        .lines()
        .find_map(|l| l.strip_prefix("updated: "))
        .expect("the file carries an updated stamp");
    assert_eq!(envelope["updated"], Json::from(updated));

    // Exactly one body was accepted: writer B's.
    let after_a = f.read(&task_file(&f, &id));
    assert_eq!(after_a, after_b, "a refused write never touches the file");
    assert!(
        !after_a.contains("A's replacement description."),
        "the loser is not in the task file: {after_a}"
    );
    // ...and the loser's bytes are kept, so nothing was lost.
    let kept = conflicts(&f);
    assert_eq!(kept.len(), 1, "one conflict copy: {kept:?}");
    assert!(
        kept[0].contains("A's replacement description."),
        "the refused draft is kept: {}",
        kept[0]
    );
    let kept_path = envelope["kept"].as_str().expect("kept path");
    assert!(
        std::path::Path::new(kept_path).exists(),
        "the envelope names the kept draft: {kept_path}"
    );
    // One task, still addressable, still carrying the one accepted body.
    assert_eq!(list_ids(&f), vec![id.clone()]);
    assert_eq!(
        get(&f, &id)["body"].as_str().unwrap_or_default(),
        description_of(&after_b)
    );
}

#[test]
fn a_matching_precondition_writes_the_description() {
    let f = VaultFixture::new();
    let id = new_task(&f, &["Ship the thing", "--body", "Original description."]);
    let stale = get(&f, &id)["body_sha256"]
        .as_str()
        .unwrap_or_default()
        .to_string();

    ok(
        &f,
        &[
            "--quiet",
            "task",
            "set-body",
            &id,
            "Replaced.",
            "--expect-sha256",
            &stale,
        ],
    );
    let text = f.read(&task_file(&f, &id));
    assert_eq!(description_of(&text).trim(), "Replaced.");
    assert!(conflicts(&f).is_empty(), "a clean write keeps no copy");
}

// ---------------------------------------------------------------------------------------
// two live processes, one baseline
// ---------------------------------------------------------------------------------------

/// The same race with nothing sequencing the writers: both processes read the same description,
/// then both try to replace it. The entity lock serialises them, so the second one re-reads under
/// the lock and finds a description it never read — it refuses and keeps its draft. Exactly one
/// body is accepted and the other writer's bytes survive in `tasks/.conflicts/`, whichever order
/// the scheduler picks.
#[test]
fn two_processes_on_one_baseline_accept_exactly_one() {
    let f = VaultFixture::new();
    let id = new_task(&f, &["Ship the thing", "--body", "Original description."]);
    let baseline = get(&f, &id)["body_sha256"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let a_body = "Writer A's replacement description.";
    let b_body = "Writer B's replacement description.";

    let spawn = |body: &'static str| {
        f.std_cmd()
            .args([
                "--json",
                "task",
                "set-body",
                &id,
                body,
                "--expect-sha256",
                &baseline,
            ])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .expect("spawn a writer")
    };
    let (a, b) = (spawn(a_body), spawn(b_body));
    let a = a.wait_with_output().expect("writer A exits");
    let b = b.wait_with_output().expect("writer B exits");

    let codes = [a.status.code().unwrap_or(-1), b.status.code().unwrap_or(-1)];
    assert!(
        codes.contains(&0) && codes.contains(&4),
        "one write accepted, one refused: {codes:?}\nA: {}\nB: {}",
        String::from_utf8_lossy(&a.stderr),
        String::from_utf8_lossy(&b.stderr)
    );
    let (winner, loser) = if codes[0] == 0 {
        (a_body, b_body)
    } else {
        (b_body, a_body)
    };
    let refused = if codes[0] == 4 {
        String::from_utf8_lossy(&a.stderr).into_owned()
    } else {
        String::from_utf8_lossy(&b.stderr).into_owned()
    };

    // One body, the winner's — not a merge of both, not a truncated file.
    let text = f.read(&task_file(&f, &id));
    assert_eq!(
        description_of(&text).trim(),
        winner,
        "one accepted body: {text}"
    );
    assert!(
        !text.contains(loser),
        "the loser is not in the task file: {text}"
    );
    // The loser's bytes are kept, and its refusal says where.
    let kept = conflicts(&f);
    assert_eq!(kept.len(), 1, "one kept draft: {kept:?}");
    assert!(
        kept[0].contains(loser),
        "the refused draft is the loser's: {}",
        kept[0]
    );
    let envelope: Json = serde_json::from_str(&refused).expect("json envelope on stderr");
    assert_eq!(envelope["kind"], Json::from("conflict"));
    assert_eq!(
        envelope["current_sha256"],
        Json::from(sha256(&description_of(&text))),
        "the refusal names the sha the winner left"
    );
    assert_eq!(list_ids(&f), vec![id.clone()], "still exactly one task");
}

// ---------------------------------------------------------------------------------------
// the negative control: the same race without the precondition loses the body
// ---------------------------------------------------------------------------------------

/// The interleaving of the test above with the compare switched off — `--expect-sha256`
/// absent is exactly the pre-#111 write path. It overwrites the other writer's body and keeps
/// no copy, which is what `two_writers_keep_the_loser_and_never_silently_overwrite` asserts
/// cannot happen. If the compare is broken, that test fails here first.
#[test]
fn without_the_precondition_the_same_race_loses_a_body() {
    let f = VaultFixture::new();
    let id = new_task(&f, &["Ship the thing", "--body", "Original description."]);
    // Writer A reads — and then writes with no baseline at all.
    let _seen = get(&f, &id);
    ok(
        &f,
        &[
            "--quiet",
            "task",
            "append",
            &id,
            "A paragraph the other writer landed.",
        ],
    );
    ok(
        &f,
        &[
            "--quiet",
            "task",
            "set-body",
            &id,
            "A's replacement description.",
        ],
    );

    let text = f.read(&task_file(&f, &id));
    assert!(
        text.contains("A's replacement description."),
        "unchecked, the later write wins: {text}"
    );
    assert!(
        !text.contains("A paragraph the other writer landed."),
        "unchecked, the other writer's body is gone: {text}"
    );
    assert!(
        conflicts(&f).is_empty(),
        "unchecked, nothing is kept at all: {:?}",
        conflicts(&f)
    );
}

// ---------------------------------------------------------------------------------------
// a refused write leaves the managed line and the digest alone
// ---------------------------------------------------------------------------------------

#[test]
fn a_refused_write_leaves_the_line_and_the_digest_untouched() {
    let f = VaultFixture::new();
    let id = new_task(&f, &["Ship the thing", "--body", "Original description."]);
    let before = f.read(&task_file(&f, &id));
    let stale = get(&f, &id)["body_sha256"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    // The line and its digest are the record Shards compares an editor's save against.
    let line_before = managed_line(&before);
    let digest_before = line_digest(&before);

    // A plain Markdown editor saves the body only: no frontmatter, no digest bump.
    let edited = format!("{before}\nA paragraph the editor added.\n");
    f.write(&task_file(&f, &id), &edited);

    let (_, stderr, code) = run(
        &f,
        &[
            "task",
            "set-body",
            &id,
            "A's replacement description.",
            "--expect-sha256",
            &stale,
        ],
    );
    assert_eq!(code, 4, "refused: {stderr}");

    let after = f.read(&task_file(&f, &id));
    assert_eq!(after, edited, "the editor's save is byte-identical");
    assert_eq!(managed_line(&after), line_before, "the line is untouched");
    assert_eq!(
        line_digest(&after),
        digest_before,
        "the digest is untouched"
    );
    assert!(after.contains("A paragraph the editor added."));
    assert_eq!(conflicts(&f).len(), 1, "the refused draft is kept");
}

// ---------------------------------------------------------------------------------------
// a partial save is reported, never a deletion
// ---------------------------------------------------------------------------------------

#[test]
fn a_partial_save_is_reported_and_never_moves_or_deletes() {
    let f = VaultFixture::new();
    let keep = new_task(&f, &["Keep me"]);
    let broken = new_task(&f, &["Half written"]);
    let path = format!("tasks/open/{broken}.md");
    // A truncated save: the frontmatter never closed.
    let truncated = format!("---\nid: {broken}\ntype: task\ntitle: Half wi");
    f.write(&path, &truncated);
    let before: Vec<String> = f.files();

    // The sweep skips it, says so, and moves nothing.
    let (stdout, stderr, code) = run(&f, &["watch", "--once", "--no-index"]);
    assert_eq!(code, 0, "a sweep survives a malformed file: {stderr}");
    assert!(
        stderr.contains(&path),
        "the sweep must name the file it skipped: {stderr}"
    );
    assert!(
        stderr.to_lowercase().contains("readable")
            || stderr.to_lowercase().contains("malformed")
            || stderr.to_lowercase().contains("skipp"),
        "the sweep says why: {stderr}"
    );
    assert_eq!(f.read(&path), truncated, "the file is left untouched");
    assert_eq!(f.files(), before, "nothing was deleted or moved");
    assert!(
        !f.vault.join("tasks/done").exists() || !f.files().iter().any(|p| p.contains("done/")),
        "no open/ file moved to done/: {:?}",
        f.files()
    );

    // A write refuses it and says what is wrong — never "not found", which a sync layer
    // would read as a deletion.
    let (_, wstderr, wcode) = run(&f, &["task", "set-body", &broken, "X"]);
    assert_ne!(wcode, 0, "a write against a malformed file fails");
    assert!(
        wstderr.contains(&path),
        "the write names the unreadable file: {wstderr}"
    );
    assert!(
        !wstderr.contains("task not found"),
        "an unreadable file is not a missing task: {wstderr}"
    );
    assert_eq!(f.read(&path), truncated, "the write left it untouched");
    assert_eq!(f.files(), before, "still nothing deleted or moved");
    assert_eq!(list_ids(&f), vec![keep]);
    assert!(
        stdout.trim().is_empty() || stdout.contains("reconciled"),
        "the sweep's own output: {stdout}"
    );
}

/// A frontmattered file that says it is a task but carries no id is just as invisible as a
/// truncated one — every surface resolves tasks by `id`, so silence about it is the same
/// misunderstanding of a malformed save as a deletion.
#[test]
fn a_task_document_without_an_id_is_reported_not_ignored() {
    let f = VaultFixture::new();
    let keep = new_task(&f, &["Keep me"]);
    let orphan = "tasks/open/no-id.md";
    f.write(
        orphan,
        "---\ntype: task\ntitle: Orphan\nstatus: open\n---\n\n- [ ] Orphan\n",
    );
    let before: Vec<String> = f.files();

    let (_stdout, stderr, code) = run(&f, &["watch", "--once", "--no-index"]);
    assert_eq!(code, 0, "a sweep survives it: {stderr}");
    assert!(
        stderr.contains(orphan),
        "the sweep must name the file it cannot resolve: {stderr}"
    );
    assert!(
        stderr.to_lowercase().contains("id"),
        "the sweep says what is missing: {stderr}"
    );
    assert_eq!(f.files(), before, "nothing was deleted or moved");
    assert_eq!(list_ids(&f), vec![keep]);
}
