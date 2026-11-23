//! A delete is recoverable: #111's OS Trash condition, driven through the real binary.
//!
//! Every delete here is a *move*, and the payload names where the file went. The platform
//! Trash assertions are per-platform because that is where each platform puts it: the XDG
//! trash (`$XDG_DATA_HOME/Trash`) on Linux, `~/.Trash` on macOS. The fallback and the refusal
//! are asserted on both.

mod common;

use std::path::PathBuf;

use common::VaultFixture;
use serde_json::Value as Json;

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

fn json(text: &str) -> Json {
    serde_json::from_str(text.trim()).expect("valid json")
}

fn new_task(f: &VaultFixture, args: &[&str]) -> String {
    let mut argv = vec!["--quiet", "task", "new"];
    argv.extend_from_slice(args);
    ok(f, &argv)
}

/// The absolute path of the task's file, whichever folder it is in.
fn task_file(f: &VaultFixture, id: &str) -> PathBuf {
    let rel = f
        .files()
        .into_iter()
        .find(|p| p.ends_with(&format!("{id}.md")))
        .unwrap_or_else(|| panic!("no file for {id} in {:?}", f.files()));
    f.vault.join(rel)
}

/// The reported trash path, asserted to exist and to hold exactly `expected` bytes.
fn trashed_at(payload: &Json, expected: &[u8]) -> PathBuf {
    let path = payload["trash"]["path"].as_str().expect("trash path");
    let path = PathBuf::from(path);
    assert!(
        path.is_file(),
        "reported trash path is not a file: {path:?}"
    );
    assert_eq!(std::fs::read(&path).expect("read trashed file"), expected);
    path
}

fn listed_ids(f: &VaultFixture) -> Vec<String> {
    let payload = json(&ok(f, &["--json", "task", "list", "--all"]));
    payload["tasks"]
        .as_array()
        .expect("tasks array")
        .iter()
        .map(|row| row["id"].as_str().unwrap_or_default().to_string())
        .collect()
}

/// The body's first line — #115's managed checkbox line.
fn managed_line(text: &str) -> String {
    let body = text
        .split_once("---\n")
        .and_then(|(_, rest)| rest.split_once("---\n"))
        .map(|(_, body)| body)
        .expect("frontmatter delimiters");
    body.trim_start()
        .lines()
        .next()
        .expect("managed line")
        .to_string()
}

// ---------------------------------------------------------------------------------------
// 1. delete lands in the platform Trash, and the payload names the file there
// ---------------------------------------------------------------------------------------

#[test]
fn a_delete_moves_the_file_to_the_platform_trash_and_names_it() {
    let f = VaultFixture::new();
    let id = new_task(&f, &["Ship it"]);
    let path = task_file(&f, &id);
    let original = std::fs::read(&path).expect("read task");

    let payload = json(&ok(&f, &["--json", "task", "delete", &id, "--force"]));

    assert_eq!(payload["id"], Json::String(id.clone()));
    assert_eq!(payload["deleted"], Json::Bool(true));
    // The platform Trash, not the vault's own: the first line of the fallback contract.
    assert_eq!(
        payload["trash"]["system"],
        Json::Bool(true),
        "{}",
        payload["trash"]
    );
    let trashed = trashed_at(&payload, &original);

    // Out of the vault, and out of every read: the list no longer sees it.
    assert!(!path.exists(), "{}", path.display());
    assert!(!listed_ids(&f).contains(&id));

    // macOS puts it in the user's own ~/.Trash; put it back so a local run leaves no litter.
    if cfg!(target_os = "macos") {
        assert!(
            trashed.to_string_lossy().contains("/.Trash/"),
            "{}",
            trashed.display()
        );
        std::fs::rename(&trashed, &path).expect("restore from ~/.Trash");
    }
}

#[cfg(target_os = "linux")]
#[test]
fn the_xdg_trash_holds_the_file_with_a_restorable_info_record() {
    let f = VaultFixture::new();
    let id = new_task(&f, &["Ship it"]);
    let path = task_file(&f, &id);
    let original = std::fs::read(&path).expect("read task");

    let payload = json(&ok(&f, &["--json", "task", "delete", &id, "--force"]));
    let trashed = trashed_at(&payload, &original);

    // The reported location is the XDG one the fixture pinned: `$XDG_DATA_HOME/Trash/files`.
    let expected = f.xdg_trash().join("files").join(format!("{id}.md"));
    assert_eq!(trashed, expected, "{}", payload["trash"]);
    // A file manager can put it back: `Path=` is the absolute original path.
    let info = f
        .xdg_trash()
        .join("info")
        .join(format!("{id}.md.trashinfo"));
    let record = std::fs::read_to_string(&info).expect("trashinfo");
    assert!(record.starts_with("[Trash Info]\n"), "{record}");
    assert!(
        record.contains(&format!("Path={}\n", path.display())),
        "{record}"
    );
    assert!(record.contains("\nDeletionDate="), "{record}");
    let stamp = record
        .lines()
        .find_map(|line| line.strip_prefix("DeletionDate="))
        .expect("deletion date");
    // The XDG format is whole seconds: `YYYY-MM-DDTHH:MM:SS`, never a fraction.
    assert_eq!(stamp.len(), 19, "{stamp}");
    assert!(stamp.as_bytes()[10] == b'T', "{stamp}");
}

// ---------------------------------------------------------------------------------------
// 2. restore round trip: the file, its status and its #115 managed line come back untouched
// ---------------------------------------------------------------------------------------

#[test]
fn a_restored_task_keeps_its_id_status_and_managed_line() {
    let f = VaultFixture::new();
    let id = new_task(&f, &["Ship it", "--due", "2026-11-05"]);
    ok(&f, &["task", "finish", &id]);
    let path = task_file(&f, &id);
    let original = std::fs::read(&path).expect("read task");
    let original_text = String::from_utf8(original.clone()).expect("utf-8 task");
    let managed = managed_line(&original_text);

    // Pin the vault's own Trash so the round trip is the same shape on every platform.
    let out = f
        .cmd()
        .env("SHARDS_TRASH", "vault")
        .args(["--json", "task", "delete", &id, "--force"])
        .output()
        .expect("run shards");
    assert_eq!(
        out.status.code(),
        Some(0),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    let payload = json(&String::from_utf8_lossy(&out.stdout));
    assert_eq!(payload["trash"]["system"], Json::Bool(false));
    let trashed = trashed_at(&payload, &original);
    let rel = path.strip_prefix(&f.vault).expect("inside the vault");
    assert!(
        trashed.ends_with(rel),
        "{} does not keep {rel:?}",
        trashed.display()
    );
    assert!(!path.exists());

    // The documented restore: one move, back to the path it had.
    std::fs::create_dir_all(path.parent().expect("parent")).expect("restore dirs");
    std::fs::rename(&trashed, &path).expect("restore");
    assert_eq!(std::fs::read(&path).expect("read restored"), original);

    let payload = json(&ok(&f, &["--json", "task", "list", "--all"]));
    let row = payload["tasks"]
        .as_array()
        .expect("tasks array")
        .iter()
        .find(|row| row["id"] == Json::String(id.clone()))
        .unwrap_or_else(|| panic!("{id} missing after restore"))
        .clone();
    assert_eq!(row["status"], Json::String("done".into()), "{row}");
    // #115's managed line survived the round trip byte for byte.
    let restored = std::fs::read_to_string(&path).expect("read restored text");
    assert_eq!(managed_line(&restored), managed);
    assert!(managed.contains(&id), "{managed}");
}

// ---------------------------------------------------------------------------------------
// 3. no system Trash: the fallback happens and the output names it; `off` refuses instead
// ---------------------------------------------------------------------------------------

#[cfg(target_os = "linux")]
#[test]
fn without_a_trash_directory_the_file_goes_to_the_vault_trash_and_the_output_says_so() {
    let f = VaultFixture::new();
    let id = new_task(&f, &["Ship it"]);
    let path = task_file(&f, &id);
    let original = std::fs::read(&path).expect("read task");

    // No `XDG_DATA_HOME` and no `HOME`: there is no Trash directory to move into.
    let out = f
        .cmd()
        .env_remove("XDG_DATA_HOME")
        .env_remove("HOME")
        .args(["--json", "task", "delete", &id, "--force"])
        .output()
        .expect("run shards");
    assert_eq!(
        out.status.code(),
        Some(0),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    let payload = json(&String::from_utf8_lossy(&out.stdout));
    assert_eq!(payload["deleted"], Json::Bool(true));
    assert_eq!(payload["trash"]["system"], Json::Bool(false));
    let trashed = trashed_at(&payload, &original);
    assert!(
        trashed.ends_with(format!("tasks/open/{id}.md")),
        "{}",
        trashed.display()
    );
    assert!(trashed.to_string_lossy().contains(".shards/trash/"));
    assert!(!path.exists());
    // The walk skips dot components: the vault's own trash never shows up as a task.
    assert!(!listed_ids(&f).contains(&id));

    // The human line names the fallback and the reason, not just a bare "deleted".
    let f2 = VaultFixture::new();
    let id2 = new_task(&f2, &["Ship it"]);
    let (line, _, code) = {
        let out = f2
            .cmd()
            .env_remove("XDG_DATA_HOME")
            .env_remove("HOME")
            .args(["task", "delete", &id2, "--force"])
            .output()
            .expect("run shards");
        (
            String::from_utf8_lossy(&out.stdout).into_owned(),
            String::from_utf8_lossy(&out.stderr).into_owned(),
            out.status.code().unwrap_or(-1),
        )
    };
    assert_eq!(code, 0);
    assert!(line.contains("no system Trash"), "{line}");
    assert!(line.contains(".shards/trash/"), "{line}");
}

#[test]
fn with_the_fallback_disabled_the_delete_is_refused_and_nothing_moves() {
    let f = VaultFixture::new();
    let id = new_task(&f, &["Ship it"]);
    let path = task_file(&f, &id);
    let original = std::fs::read(&path).expect("read task");

    let out = f
        .cmd()
        .env("SHARDS_TRASH", "off")
        .args(["--json", "task", "delete", &id, "--force"])
        .output()
        .expect("run shards");
    // Negative control: no Trash at all is a refusal, never a silent unlink.
    assert_eq!(out.status.code(), Some(2));
    let payload = json(&String::from_utf8_lossy(&out.stderr));
    assert_eq!(payload["kind"], Json::String("validation".into()));
    let message = payload["message"].as_str().expect("message");
    assert!(message.contains("SHARDS_TRASH=off"), "{message}");
    assert!(message.contains("nothing was deleted"), "{message}");
    // The file is exactly where it was, and no trash was written.
    assert_eq!(std::fs::read(&path).expect("read task"), original);
    assert!(!f.vault_trash().exists(), "{:?}", f.vault_trash());
}

// ---------------------------------------------------------------------------------------
// 4. no linked deletion: a delete never touches the tasks it is linked to
// ---------------------------------------------------------------------------------------

#[test]
fn deleting_one_task_leaves_the_tasks_it_links_to_untouched() {
    let f = VaultFixture::new();
    let blocker = new_task(&f, &["Blocker"]);
    let blocked = new_task(&f, &["Blocked", "--blocked-by", &blocker]);
    let blocker_path = task_file(&f, &blocker);
    let blocked_path = task_file(&f, &blocked);
    let blocker_before = std::fs::read(&blocker_path).expect("read blocker");
    let blocked_before = std::fs::read(&blocked_path).expect("read blocked");

    let payload = json(&ok(&f, &["--json", "task", "delete", &blocked, "--force"]));
    let trashed = trashed_at(&payload, &blocked_before);

    // The linked task is still there, byte for byte: its `blocks`/`related` entries included.
    assert_eq!(
        std::fs::read(&blocker_path).expect("read blocker"),
        blocker_before
    );
    let ids = listed_ids(&f);
    assert!(!ids.contains(&blocked), "{ids:?}");
    assert!(ids.contains(&blocker), "{ids:?}");
    // Exactly one file left the vault: nothing else was moved with it.
    assert!(trashed.is_file());
    assert!(!f.vault_trash().exists(), "{:?}", f.vault_trash());
    // The blocker's own edge list (`blocks:`) was there before and is byte-identical after.
    let blocker_text = String::from_utf8_lossy(&blocker_before).into_owned();
    assert!(
        blocker_text.contains(&blocked),
        "fixture: the blocked task must appear in the blocker's edges\n{blocker_text}"
    );
}

// ---------------------------------------------------------------------------------------
// the restore instruction is where a user looks for it
// ---------------------------------------------------------------------------------------

#[test]
fn the_delete_help_names_the_trash_and_the_restore() {
    let f = VaultFixture::new();
    let out = f
        .cmd()
        .args(["task", "delete", "--help"])
        .output()
        .expect("run shards");
    assert_eq!(out.status.code(), Some(0));
    let help = String::from_utf8_lossy(&out.stdout).into_owned();
    assert!(help.contains("Trash"), "{help}");
    assert!(help.contains("mv "), "{help}");
}
