//! Where a removed file goes: the platform Trash, or the vault's own when there is none.
//!
//! Every delete verb routes through [`remove`], so a delete is recoverable by design: the file
//! is *moved*, never unlinked. The platform Trash is the XDG trash on Linux
//! (`$XDG_DATA_HOME/Trash`, else `~/.local/share/Trash`) and `~/.Trash` on macOS.
//!
//! When the platform Trash cannot be reached the file moves to `<vault>/.shards/trash/<the path
//! it had>`, and the caller reports that path and the reason. `SHARDS_TRASH=off` refuses the
//! delete instead: nothing is unlinked and nothing is moved.
//!
//! No shell, no `gio` and no new dependency: a move is a rename, and a cross-device move is a
//! copy then a remove.

use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};

use crate::error::{Result, ShardsError};

/// The environment variable that pins where deletes go.
pub const ENV_MODE: &str = "SHARDS_TRASH";

/// The vault's own Trash, relative to the vault: `<vault>/.shards/trash/…`. The walk skips
/// dot-prefixed components, so a trashed file is never listed, searched or counted.
pub const VAULT_TRASH: [&str; 2] = [".shards", "trash"];

/// How deletes are handled.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Mode {
    /// The platform Trash, and the vault's own Trash when that is unreachable. The default.
    Auto,
    /// The vault's own Trash only.
    Vault,
    /// No Trash: the delete is refused and nothing is removed.
    Off,
}

/// Where a removed file went.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Placed {
    /// The platform Trash took it.
    System(PathBuf),
    /// No platform Trash was reachable; the file is in the vault's own Trash. `why` is the
    /// reason, which the caller prints.
    Vault { location: PathBuf, why: String },
}

impl Placed {
    /// The file's path inside the Trash — the one path a restore moves back from.
    pub fn location(&self) -> &Path {
        match self {
            Placed::System(path) | Placed::Vault { location: path, .. } => path,
        }
    }

    /// Whether the platform Trash took the file, as opposed to the vault's own.
    pub fn is_system(&self) -> bool {
        matches!(self, Placed::System(_))
    }

    /// One parenthetical naming where the file went, for a delete's human line.
    pub fn describe(&self) -> String {
        match self {
            Placed::System(location) => format!("moved to the Trash: {}", location.display()),
            Placed::Vault { location, why } => format!(
                "no system Trash — {why}; moved to {} — restore it with mv",
                location.display()
            ),
        }
    }
}

/// Read `SHARDS_TRASH`. Unset and empty mean the default mode.
pub fn mode() -> Result<Mode> {
    match std::env::var(ENV_MODE) {
        Ok(raw) => parse_mode(&raw),
        Err(_) => Ok(default_mode()),
    }
}

/// The mode a caller gets with no `SHARDS_TRASH` set.
///
/// Under `cfg(test)` it is [`Mode::Vault`]: a unit test must never write into the developer's
/// real Trash. The binary has no test cfg, so a shipped `shards` defaults to [`Mode::Auto`].
fn default_mode() -> Mode {
    #[cfg(test)]
    {
        Mode::Vault
    }
    #[cfg(not(test))]
    {
        Mode::Auto
    }
}

fn parse_mode(raw: &str) -> Result<Mode> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "" | "auto" => Ok(Mode::Auto),
        "vault" => Ok(Mode::Vault),
        "off" => Ok(Mode::Off),
        other => Err(ShardsError::Validation(format!(
            "unknown {ENV_MODE}={other}: use auto (default), vault or off"
        ))),
    }
}

/// Move `path` out of the vault, returning where it went.
///
/// The caller holds the entity's lock and has already resolved `path` inside the sandbox.
/// Nothing is removed on an error: a failed platform move falls back to the vault's own Trash,
/// and [`Mode::Off`] refuses before touching the file.
pub fn remove(vault: &Path, path: &Path) -> Result<Placed> {
    remove_with(mode()?, vault, path)
}

fn remove_with(mode: Mode, vault: &Path, path: &Path) -> Result<Placed> {
    match mode {
        Mode::Off => Err(ShardsError::Validation(format!(
            "{ENV_MODE}=off: nothing was deleted, {} is still there — unset it to move the file \
             to a Trash",
            path.display()
        ))),
        Mode::Vault => vault_trash(vault, path, format!("{ENV_MODE}=vault")),
        Mode::Auto => match platform(path) {
            Ok(location) => Ok(Placed::System(location)),
            Err(why) => vault_trash(vault, path, why),
        },
    }
}

fn vault_trash(vault: &Path, path: &Path, why: String) -> Result<Placed> {
    let base = std::fs::canonicalize(vault).unwrap_or_else(|_| vault.to_path_buf());
    let root = VAULT_TRASH
        .iter()
        .fold(base.clone(), |acc, part| acc.join(part));
    // The path the file had, kept under the vault's Trash: `mv` back is the restore. The caller
    // resolves its paths, so one side may be canonical and the other not (a vault under a
    // symlinked root, e.g. `/var` → `/private/var` on macOS): try both.
    let rel = path
        .strip_prefix(&base)
        .or_else(|_| path.strip_prefix(vault))
        .map(Path::to_path_buf)
        .unwrap_or_else(|_| PathBuf::from(path.file_name().unwrap_or(OsStr::new("deleted"))));
    let dir = match rel.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => root.join(parent),
        _ => root,
    };
    std::fs::create_dir_all(&dir)?;
    let name = free_name(&dir, rel.file_name().unwrap_or(OsStr::new("deleted")))?;
    let location = dir.join(&name);
    move_file(path, &location)?;
    Ok(Placed::Vault { location, why })
}

/// The first free name in `dir`: `name`, then `stem.2.ext`, `stem.3.ext`, … A Trash never
/// overwrites a file already in it.
fn free_name(dir: &Path, name: &OsStr) -> Result<OsString> {
    if !dir.join(name).exists() {
        return Ok(name.to_os_string());
    }
    let text = name.to_string_lossy();
    let (stem, ext) = match text.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => (stem.to_string(), format!(".{ext}")),
        _ => (text.to_string(), String::new()),
    };
    for n in 2..=999u32 {
        let candidate = format!("{stem}.{n}{ext}");
        if !dir.join(&candidate).exists() {
            return Ok(OsString::from(candidate));
        }
    }
    Err(ShardsError::Validation(format!(
        "no free name left in the Trash for {}",
        text
    )))
}

/// Rename, or copy then remove when the Trash is on another filesystem.
fn move_file(from: &Path, to: &Path) -> Result<()> {
    match std::fs::rename(from, to) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::CrossesDevices => {
            std::fs::copy(from, to)?;
            std::fs::remove_file(from)?;
            Ok(())
        }
        Err(err) => Err(err.into()),
    }
}

/// Move `path` into the platform Trash. `Err` carries the reason the Trash is unreachable, so
/// the caller can name it when it falls back.
#[cfg(target_os = "macos")]
fn platform(path: &Path) -> std::result::Result<PathBuf, String> {
    let home =
        dirs::home_dir().ok_or_else(|| "no home directory, so there is no ~/.Trash".to_string())?;
    let dir = home.join(".Trash");
    let location = place(&dir, path)?;
    move_file(path, &location)
        .map_err(|err| format!("{} refused the move: {err}", dir.display()))?;
    Ok(location)
}

#[cfg(target_os = "linux")]
fn platform(path: &Path) -> std::result::Result<PathBuf, String> {
    let root = trash_root()?;
    let files = root.join("files");
    let info = root.join("info");
    for dir in [&files, &info] {
        std::fs::create_dir_all(dir)
            .map_err(|err| format!("cannot create {}: {err}", dir.display()))?;
    }
    let name = free_name(&files, leaf(path)).map_err(|err| err.to_string())?;
    let location = files.join(&name);
    // The XDG trash is only restorable through this record: write it first, and drop it again
    // when the move fails, so `files/` never holds a file no file manager can put back.
    let mut info_name = name.clone();
    info_name.push(".trashinfo");
    let info_path = info.join(&info_name);
    let body = format!(
        "[Trash Info]\nPath={}\nDeletionDate={}\n",
        percent_encode(path),
        crate::timefmt::naive_seconds(&crate::timefmt::now_local())
    );
    std::fs::write(&info_path, body)
        .map_err(|err| format!("cannot write {}: {err}", info_path.display()))?;
    if let Err(err) = move_file(path, &location) {
        let _ = std::fs::remove_file(&info_path);
        return Err(format!("the Trash refused the move: {err}"));
    }
    Ok(location)
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn platform(_path: &Path) -> std::result::Result<PathBuf, String> {
    Err(format!("no system Trash on {}", std::env::consts::OS))
}

#[cfg(target_os = "linux")]
fn trash_root() -> std::result::Result<PathBuf, String> {
    if let Some(data) = non_empty("XDG_DATA_HOME") {
        return Ok(PathBuf::from(data).join("Trash"));
    }
    match non_empty("HOME") {
        Some(home) => Ok(PathBuf::from(home).join(".local/share/Trash")),
        None => {
            Err("no XDG_DATA_HOME or HOME, so there is no Trash directory to move into".to_string())
        }
    }
}

#[cfg(target_os = "macos")]
fn place(dir: &Path, path: &Path) -> std::result::Result<PathBuf, String> {
    std::fs::create_dir_all(dir)
        .map_err(|err| format!("cannot create {}: {err}", dir.display()))?;
    let name = free_name(dir, leaf(path)).map_err(|err| err.to_string())?;
    Ok(dir.join(name))
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn leaf(path: &Path) -> &OsStr {
    path.file_name().unwrap_or(OsStr::new("deleted"))
}

#[cfg(target_os = "linux")]
fn non_empty(key: &str) -> Option<OsString> {
    match std::env::var_os(key) {
        Some(value) if !value.is_empty() => Some(value),
        _ => None,
    }
}

/// The XDG `Path=` form: absolute, percent-encoded, `/` kept readable.
#[cfg(target_os = "linux")]
fn percent_encode(path: &Path) -> String {
    let text = path.to_string_lossy();
    let mut out = String::with_capacity(text.len());
    for byte in text.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' => {
                out.push(*byte as char);
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;

    #[test]
    fn an_unknown_mode_is_refused_and_the_names_are_accepted() {
        assert_eq!(parse_mode("vault").unwrap(), Mode::Vault);
        assert_eq!(parse_mode("off").unwrap(), Mode::Off);
        assert_eq!(parse_mode(" Auto ").unwrap(), Mode::Auto);
        assert_eq!(parse_mode("").unwrap(), Mode::Auto);
        let err = parse_mode("recycle").unwrap_err();
        assert!(
            err.to_string().contains("unknown SHARDS_TRASH=recycle"),
            "{err}"
        );
        // A unit test must never reach the developer's real Trash.
        assert_eq!(default_mode(), Mode::Vault);
    }

    #[test]
    fn the_vault_trash_keeps_the_path_the_file_had() {
        let home = tempfile::tempdir().unwrap();
        // A canonical root: on macOS `tempdir()` sits under the `/var` → `/private/var` symlink.
        let vault = std::fs::canonicalize(home.path()).unwrap().join("vault");
        std::fs::create_dir_all(&vault).unwrap();
        let source = vault.join("tasks/open/t-abc.md");
        std::fs::create_dir_all(source.parent().unwrap()).unwrap();
        std::fs::write(&source, "content\n").unwrap();
        let placed = remove_with(Mode::Vault, &vault, &source).unwrap();
        assert_eq!(
            placed.location(),
            vault.join(".shards/trash/tasks/open/t-abc.md")
        );
        assert_eq!(
            std::fs::read_to_string(placed.location()).unwrap(),
            "content\n"
        );
        assert!(!source.exists());
        assert!(!placed.is_system());
        assert!(placed
            .describe()
            .contains("no system Trash — SHARDS_TRASH=vault"));
    }

    #[test]
    fn a_second_file_of_the_same_name_never_overwrites_the_first() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(free_name(dir.path(), OsStr::new("a.md")).unwrap(), "a.md");
        std::fs::write(dir.path().join("a.md"), "one").unwrap();
        assert_eq!(free_name(dir.path(), OsStr::new("a.md")).unwrap(), "a.2.md");
        std::fs::write(dir.path().join("a.2.md"), "two").unwrap();
        assert_eq!(free_name(dir.path(), OsStr::new("a.md")).unwrap(), "a.3.md");
        // A name with no extension keeps one suffix and gains none.
        std::fs::write(dir.path().join("b"), "x").unwrap();
        assert_eq!(free_name(dir.path(), OsStr::new("b")).unwrap(), "b.2");
    }

    #[test]
    fn off_refuses_and_leaves_the_file_alone() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("t-abc.md");
        std::fs::write(&file, "keep me").unwrap();
        let err = remove_with(Mode::Off, dir.path(), &file).err().unwrap();
        assert!(err.to_string().contains("nothing was deleted"), "{err}");
        assert_eq!(err.code(), 2);
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "keep me");
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn the_xdg_path_is_percent_encoded_and_keeps_its_slashes() {
        assert_eq!(
            percent_encode(Path::new("/vault/tasks/open/t-ab c.md")),
            "/vault/tasks/open/t-ab%20c.md"
        );
        assert_eq!(percent_encode(Path::new("/a/ü.md")), "/a/%C3%BC.md");
    }
}
