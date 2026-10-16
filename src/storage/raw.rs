//! Raw-byte primitives for hosts that undo a delete: take a file's exact text, and write text
//! back to a path that must not exist yet.
//!
//! Neither goes through the frontmatter emitter: an undo must restore the very bytes that
//! were removed, not a re-serialised copy.

use std::ffi::{OsStr, OsString};
use std::io::Write;
use std::os::fd::{AsFd, OwnedFd};
use std::path::{Component, Path};
use std::sync::atomic::{AtomicU64, Ordering};

use rustix::fs::{fsync, linkat, mkdirat, openat, unlinkat, AtFlags, Mode, OFlags, CWD};
use rustix::io::Errno;

use crate::error::{Result, ShardsError};
use crate::storage::atomic::fresh_file_mode;
use crate::storage::walk::MAX_FILE_BYTES;

/// Read `path` as UTF-8 text, then unlink it. Nothing is removed when the read fails.
///
/// The caller holds the entity's lock, so the bytes returned are exactly the bytes removed.
/// Non-UTF-8 content is refused (never lossily converted), because the text is what an undo
/// writes back.
pub fn take_utf8(path: &Path) -> Result<String> {
    let bytes = std::fs::read(path)?;
    let text = String::from_utf8(bytes).map_err(|_| {
        ShardsError::Validation(format!(
            "file is not UTF-8 text; delete it with the CLI instead: {}",
            path.display()
        ))
    })?;
    std::fs::remove_file(path)?;
    Ok(text)
}

/// Write `contents` to `path` atomically, refusing when `path` already exists.
///
/// `path` must be canonical (as [`crate::storage::safe_resolve`] returns it): the directories
/// are walked from the root one `openat(O_NOFOLLOW)` at a time and every write happens relative
/// to the final directory's descriptor, so swapping a directory on the way for a symlink after
/// the caller's sandbox check refuses the write instead of following it out of the vault.
/// Missing parents are created the same way. The temp file → fsync → no-clobber rename runs
/// inside that one directory. The text is capped at the walk's readable limit, the same bound
/// `write_doc` applies.
pub fn write_new(path: &Path, contents: &str) -> Result<()> {
    if contents.len() as u64 > MAX_FILE_BYTES {
        return Err(ShardsError::Validation(format!(
            "content is {} bytes, over the {MAX_FILE_BYTES}-byte readable limit: {}",
            contents.len(),
            path.display()
        )));
    }
    if std::fs::symlink_metadata(path).is_ok() {
        return Err(already_exists(path));
    }
    let name = path
        .file_name()
        .ok_or_else(|| ShardsError::Validation(format!("not a file path: {}", path.display())))?;
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let dir = open_dir_nofollow(parent).map_err(|e| walk_error(path, e))?;
    let (temp_name, file) = create_temp(&dir, name)?;
    let published = fill_and_publish(&dir, &temp_name, name, file, contents);
    // Gone after a rename; the leftover link after a `linkat` or a failure.
    let _ = unlinkat(&dir, temp_name.as_os_str(), AtFlags::empty());
    match published {
        Ok(()) => {}
        Err(e) if e == Errno::EXIST => return Err(already_exists(path)),
        Err(e) => return Err(ShardsError::Io(e.into())),
    }
    let _ = fsync(&dir);
    Ok(())
}

/// Open `dir` as a directory without following a symlink anywhere on the way, creating each
/// missing component. A relative path starts at the working directory; `..` is refused.
fn open_dir_nofollow(dir: &Path) -> rustix::io::Result<OwnedFd> {
    let flags = OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC;
    let mut current: Option<OwnedFd> = None;
    for component in dir.components() {
        let step: &OsStr = match component {
            Component::RootDir => {
                current = Some(openat(CWD, "/", flags, Mode::empty())?);
                continue;
            }
            Component::CurDir => continue,
            Component::Normal(name) => name,
            Component::ParentDir | Component::Prefix(_) => return Err(Errno::LOOP),
        };
        let next = {
            let at = current.as_ref().map_or(CWD, |fd| fd.as_fd());
            match openat(at, step, flags, Mode::empty()) {
                Err(e) if e == Errno::NOENT => {
                    match mkdirat(at, step, Mode::from_bits_truncate(0o777)) {
                        Ok(()) => {}
                        Err(e) if e == Errno::EXIST => {}
                        Err(e) => return Err(e),
                    }
                    openat(at, step, flags, Mode::empty())?
                }
                other => other?,
            }
        };
        current = Some(next);
    }
    match current {
        Some(fd) => Ok(fd),
        None => openat(CWD, ".", flags, Mode::empty()),
    }
}

/// A fresh hidden sibling `.<name>.<pid>.<n>.tmp`, created exclusively inside `dir`.
fn create_temp(dir: &OwnedFd, name: &OsStr) -> Result<(OsString, std::fs::File)> {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let flags = OFlags::WRONLY | OFlags::CREATE | OFlags::EXCL | OFlags::NOFOLLOW | OFlags::CLOEXEC;
    let mut last = Errno::EXIST;
    for _ in 0..16 {
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let mut temp = OsString::from(".");
        temp.push(name);
        temp.push(format!(".{}.{n}.tmp", std::process::id()));
        match openat(
            dir,
            temp.as_os_str(),
            flags,
            Mode::from_bits_truncate(0o600),
        ) {
            Ok(fd) => return Ok((temp, std::fs::File::from(fd))),
            Err(e) if e == Errno::EXIST => last = e,
            Err(e) => return Err(ShardsError::Io(e.into())),
        }
    }
    Err(ShardsError::Io(last.into()))
}

/// Write, fix the mode, fsync, then move the temp file onto `name` without replacing anything.
fn fill_and_publish(
    dir: &OwnedFd,
    temp: &OsStr,
    name: &OsStr,
    mut file: std::fs::File,
    contents: &str,
) -> rustix::io::Result<()> {
    let io = |e: std::io::Error| Errno::from_io_error(&e).unwrap_or(Errno::IO);
    file.write_all(contents.as_bytes()).map_err(io)?;
    file.flush().map_err(io)?;
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = file.set_permissions(std::fs::Permissions::from_mode(fresh_file_mode()));
    }
    file.sync_all().map_err(io)?;
    drop(file);
    #[cfg(any(
        target_os = "macos",
        target_os = "ios",
        target_os = "linux",
        target_os = "android"
    ))]
    match rustix::fs::renameat_with(dir, temp, dir, name, rustix::fs::RenameFlags::NOREPLACE) {
        // A filesystem without an exclusive rename falls back to link-then-unlink.
        Err(e) if e == Errno::INVAL || e == Errno::NOSYS || e == Errno::NOTSUP => {}
        other => return other,
    }
    linkat(dir, temp, dir, name, AtFlags::empty())
}

/// A directory on the way that is a symlink (or not a directory) is a sandbox escape attempt.
fn walk_error(path: &Path, e: Errno) -> ShardsError {
    if e == Errno::LOOP || e == Errno::NOTDIR {
        ShardsError::Validation(format!(
            "path escapes sandbox: {} (a directory on the way is a symlink or not a directory)",
            path.display()
        ))
    } else {
        ShardsError::Io(e.into())
    }
}

fn already_exists(path: &Path) -> ShardsError {
    ShardsError::Validation(format!(
        "refusing to overwrite an existing file: {}",
        path.display()
    ))
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;

    #[test]
    fn take_returns_the_bytes_and_removes_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("t-1.md");
        std::fs::write(&path, "---\nid: t-1\n---\n\nbody\n").unwrap();
        assert_eq!(take_utf8(&path).unwrap(), "---\nid: t-1\n---\n\nbody\n");
        assert!(!path.exists());
    }

    #[test]
    fn take_refuses_non_utf8_and_keeps_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("bin.md");
        std::fs::write(&path, [0xff, 0xfe, 0x00]).unwrap();
        assert_eq!(take_utf8(&path).unwrap_err().code(), 2);
        assert!(path.exists());
    }

    /// A canonical temp root: on macOS `tempdir()` sits under the `/var` symlink, and
    /// `write_new` refuses any symlink on the way.
    fn canonical_tempdir() -> (tempfile::TempDir, std::path::PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let root = std::fs::canonicalize(dir.path()).unwrap();
        (dir, root)
    }

    #[test]
    fn write_new_creates_parents_and_refuses_to_clobber() {
        let (_guard, root) = canonical_tempdir();
        let dir = root.as_path();
        let path = dir.join("a/b/n-1.md");
        write_new(&path, "x").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "x");
        let err = write_new(&path, "y").unwrap_err();
        assert_eq!(err.code(), 2);
        assert!(err.to_string().starts_with("refusing to overwrite"));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "x");
        let names: Vec<String> = std::fs::read_dir(dir.join("a/b"))
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, ["n-1.md"]);
    }

    #[test]
    fn write_new_sets_the_fresh_file_mode() {
        use std::os::unix::fs::PermissionsExt;
        let (_guard, root) = canonical_tempdir();
        let path = root.join("n-2.md");
        write_new(&path, "x").unwrap();
        let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, fresh_file_mode());
    }

    #[test]
    fn write_new_refuses_a_symlinked_directory_on_the_way() {
        let (_guard, root) = canonical_tempdir();
        let vault = root.join("vault");
        let outside = root.join("outside");
        std::fs::create_dir_all(vault.join("notes")).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        // The swap a racing process would make after the caller's sandbox check.
        std::os::unix::fs::symlink(&outside, vault.join("notes/linkdir")).unwrap();
        let err = write_new(&vault.join("notes/linkdir/x.md"), "x").unwrap_err();
        assert_eq!(err.code(), 2, "{err}");
        assert!(err.to_string().starts_with("path escapes sandbox"), "{err}");
        assert_eq!(std::fs::read_dir(&outside).unwrap().count(), 0);
        // A symlink deeper in a path whose tail does not exist yet is refused too.
        let err = write_new(&vault.join("notes/linkdir/new/y.md"), "y").unwrap_err();
        assert!(err.to_string().starts_with("path escapes sandbox"), "{err}");
        assert_eq!(std::fs::read_dir(&outside).unwrap().count(), 0);
        // No temp file is left behind in the real directory either.
        let names: Vec<String> = std::fs::read_dir(vault.join("notes"))
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, ["linkdir"]);
    }

    #[test]
    fn write_new_refuses_a_dangling_symlink_at_the_target() {
        let (_guard, root) = canonical_tempdir();
        std::os::unix::fs::symlink(root.join("nowhere.md"), root.join("t.md")).unwrap();
        let err = write_new(&root.join("t.md"), "x").unwrap_err();
        assert!(
            err.to_string().starts_with("refusing to overwrite"),
            "{err}"
        );
        assert!(!root.join("nowhere.md").exists());
    }
}
