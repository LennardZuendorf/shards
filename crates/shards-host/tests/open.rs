//! "Open in" support (desktop-app/33): the path gate and the Obsidian URL.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use shards_host::{obsidian_url, Host};

#[test]
fn obsidian_url_percent_encodes_the_absolute_path() {
    assert_eq!(
        obsidian_url(std::path::Path::new("/a b/ä.md")),
        "obsidian://open?path=%2Fa%20b%2F%C3%A4.md"
    );
    assert_eq!(
        obsidian_url(std::path::Path::new("/x/Daily-1_2.~md")),
        "obsidian://open?path=%2Fx%2FDaily-1_2.~md"
    );
}

#[test]
fn openable_path_accepts_only_files_inside_a_space_root() {
    let dir = tempfile::tempdir().unwrap();
    let root = std::fs::canonicalize(dir.path()).unwrap().join("vault");
    std::fs::create_dir_all(root.join("Daily")).unwrap();
    let cfg = dir.path().join("config.toml");
    std::fs::write(
        &cfg,
        // Notes at the vault root, as an Obsidian vault is laid out.
        format!(
            "[core]\nvault_path = \"{}\"\n\n[spaces]\nnotes = \".\"\n",
            root.display()
        ),
    )
    .unwrap();
    std::fs::write(root.join("Daily/log.md"), "x\n").unwrap();
    std::fs::write(dir.path().join("outside.md"), "x\n").unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(dir.path().join("outside.md"), root.join("link.md")).unwrap();
    let host = Host::new(Some(cfg), Some(root.clone()));

    let ok = host.openable_path(&root.join("Daily/log.md").display().to_string());
    assert_eq!(ok.unwrap(), root.join("Daily/log.md"));
    for bad in [
        dir.path().join("outside.md"),
        root.join("Daily/../../outside.md"),
        root.join("Daily"),
        root.join("missing.md"),
        root.join("link.md"),
    ] {
        assert!(
            host.openable_path(&bad.display().to_string()).is_err(),
            "{}",
            bad.display()
        );
    }
    assert!(
        host.openable_path("Daily/log.md").is_err(),
        "relative paths are refused"
    );
}
