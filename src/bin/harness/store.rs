use super::json::{canonical_json, strict_json};
use rustix::fs::{self, AtFlags, FileType, Mode, OFlags, CWD};
use rustix::io::Errno;
use serde::{de::DeserializeOwned, Serialize};
use std::io::{Read, Write};
use std::os::fd::OwnedFd;
use std::path::{Component, Path};
use std::sync::atomic::{AtomicU64, Ordering};
type Result<T> = std::result::Result<T, String>;
const LIMIT: u64 = 1024 * 1024;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn regular(fd: &OwnedFd, before: &fs::Stat, name: &str) -> Result<()> {
    let now = fs::fstat(fd).map_err(err)?;
    if FileType::from_raw_mode(now.st_mode) != FileType::RegularFile
        || now.st_nlink != 1
        || before.st_dev != now.st_dev
        || before.st_ino != now.st_ino
    {
        return Err(format!(
            "{name} must retain regular-file identity (no links)"
        ));
    }
    Ok(())
}
pub struct Store {
    pub fd: OwnedFd,
}
pub struct Lock {
    _fd: OwnedFd,
}
impl Store {
    pub fn open(root: &Path) -> Result<Self> {
        let root = if root.is_absolute() {
            root.to_path_buf()
        } else {
            std::env::current_dir().map_err(err)?.join(root)
        };
        let flags = OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC;
        let mut fd = fs::openat(CWD, "/", flags, Mode::empty()).map_err(err)?;
        for c in root.components() {
            match c {
                Component::RootDir | Component::CurDir => {}
                Component::Normal(n) => {
                    match fs::mkdirat(&fd, n, Mode::from_bits_truncate(0o700)) {
                        Ok(()) => {}
                        Err(Errno::EXIST) => {}
                        Err(e) => return Err(format!("runtime mkdir {n:?}: {e}")),
                    };
                    fd = fs::openat(&fd, n, flags, Mode::empty())
                        .map_err(|e| format!("cannot open private runtime directory: {e}"))?;
                }
                _ => return Err("runtime parent traversal refused".into()),
            }
        }
        Ok(Self { fd })
    }
    pub fn from_directory(root: &Path) -> Result<Self> {
        Ok(Self {
            fd: fs::openat(
                CWD,
                root,
                OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC,
                Mode::empty(),
            )
            .map_err(err)?,
        })
    }
    pub fn read<T: DeserializeOwned>(&self, name: &str) -> Result<Option<T>> {
        let before = match fs::statat(&self.fd, name, AtFlags::SYMLINK_NOFOLLOW) {
            Ok(s) => s,
            Err(Errno::NOENT) => return Ok(None),
            Err(e) => return Err(err(e)),
        };
        if FileType::from_raw_mode(before.st_mode) != FileType::RegularFile || before.st_nlink != 1
        {
            return Err(format!("{name} must be a regular file (no links)"));
        }
        let fd = fs::openat(
            &self.fd,
            name,
            OFlags::RDONLY | OFlags::NOFOLLOW | OFlags::NONBLOCK | OFlags::CLOEXEC,
            Mode::empty(),
        )
        .map_err(err)?;
        regular(&fd, &before, name)?;
        let file = std::fs::File::from(fd);
        let mut bytes = Vec::new();
        file.take(LIMIT + 1).read_to_end(&mut bytes).map_err(err)?;
        if bytes.len() as u64 > LIMIT {
            return Err("receipt exceeds size limit; repair runtime state".into());
        }
        let raw = std::str::from_utf8(&bytes).map_err(err)?;
        let value = strict_json(raw)?;
        if !value.is_object() {
            return Err("expected a JSON object, not null or a scalar".into());
        }
        serde_json::from_value(value).map(Some).map_err(err)
    }
    pub fn scan<T: DeserializeOwned>(&self, prefix: &str) -> Result<Vec<(String, T)>> {
        let mut out = Vec::new();
        let mut dir = fs::Dir::read_from(&self.fd).map_err(err)?;
        for entry in &mut dir {
            let entry = entry.map_err(err)?;
            let name = entry.file_name().to_str().map_err(err)?;
            if name.starts_with(prefix) && name.ends_with(".json") {
                if let Some(v) = self.read(name)? {
                    out.push((name.to_string(), v));
                }
            }
        }
        Ok(out)
    }
    pub fn lock(&self, name: &str) -> Result<Lock> {
        let flags = OFlags::RDWR | OFlags::NOFOLLOW | OFlags::NONBLOCK | OFlags::CLOEXEC;
        // Concurrent O_CREAT|O_NOFOLLOW opens can return ENOENT on Darwin
        // while another process creates the final component. Separate opening
        // an existing permanent anchor from exclusive first publication.
        let fd = match fs::openat(&self.fd, name, flags, Mode::empty()) {
            Ok(fd) => Ok(fd),
            Err(Errno::NOENT) => match fs::openat(
                &self.fd,
                name,
                flags | OFlags::CREATE | OFlags::EXCL,
                Mode::from_bits_truncate(0o600),
            ) {
                Err(Errno::EXIST) => fs::openat(&self.fd, name, flags, Mode::empty()),
                other => other,
            },
            other => other,
        }
        .map_err(|e| format!("open lock {name}: {e}"))?;
        let before = fs::statat(&self.fd, name, AtFlags::SYMLINK_NOFOLLOW)
            .map_err(|e| format!("stat lock {name}: {e}"))?;
        regular(&fd, &before, name)?;
        fs::flock(&fd, fs::FlockOperation::LockExclusive)
            .map_err(|e| format!("flock {name}: {e}"))?;
        let before = fs::statat(&self.fd, name, AtFlags::SYMLINK_NOFOLLOW)
            .map_err(|e| format!("recheck lock {name}: {e}"))?;
        regular(&fd, &before, name)?;
        Ok(Lock { _fd: fd })
    }
    pub fn write<T: Serialize>(&self, name: &str, value: &T) -> Result<()> {
        let _: Option<serde_json::Value> = self.read(name)?;
        let value = serde_json::to_value(value).map_err(err)?;
        let raw = canonical_json(&value)? + "\n";
        if raw.len() as u64 > LIMIT {
            return Err("receipt exceeds size limit".into());
        }
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let mut fresh = None;
        for _ in 0..32 {
            let tmp = format!(
                ".tmp-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            );
            match fs::openat(
                &self.fd,
                tmp.as_str(),
                OFlags::WRONLY | OFlags::CREATE | OFlags::EXCL | OFlags::NOFOLLOW | OFlags::CLOEXEC,
                Mode::from_bits_truncate(0o600),
            ) {
                Ok(fd) => {
                    fresh = Some((tmp, fd));
                    break;
                }
                Err(Errno::EXIST) => {}
                Err(e) => return Err(err(e)),
            }
        }
        let (tmp, fd) = fresh.ok_or("cannot allocate exclusive temporary file")?;
        let identity = fs::fstat(&fd).map_err(err)?;
        let mut file = std::fs::File::from(fd);
        let result = (|| {
            file.write_all(raw.as_bytes()).map_err(err)?;
            file.sync_all().map_err(err)?;
            fs::renameat(&self.fd, tmp.as_str(), &self.fd, name)
                .map_err(|e| format!("rename {tmp} to {name}: {e}"))?;
            fs::fsync(&self.fd).map_err(|e| format!("directory fsync after {name}: {e}"))
        })();
        if let Ok(s) = fs::statat(&self.fd, tmp.as_str(), AtFlags::SYMLINK_NOFOLLOW) {
            if s.st_dev == identity.st_dev && s.st_ino == identity.st_ino {
                let _ = fs::unlinkat(&self.fd, tmp.as_str(), AtFlags::empty());
            }
        }
        result
    }
}
