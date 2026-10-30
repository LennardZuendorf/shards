use shards_gateway::{config::LoadedGatewayConfig, grants::*};
use std::{
    fs,
    os::unix::fs::{symlink, PermissionsExt},
    path::PathBuf,
};
use tempfile::TempDir;

struct Fixture {
    _dir: TempDir,
    config: PathBuf,
    registry: PathBuf,
}
impl Fixture {
    fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).unwrap();
        let vault = root.join("vault");
        fs::create_dir(&vault).unwrap();
        let core = root.join("core.toml");
        fs::write(
            &core,
            format!(
                "[core]\nvault_path = {:?}\n[tasks]\ncollections = [\"alice\", \"bot\"]\n",
                vault.to_str().unwrap()
            ),
        )
        .unwrap();
        let config = root.join("gateway.toml");
        let registry = root.join("grants.json");
        fs::write(&config, format!("vault_id = \"fixture\"\nvault_path = {:?}\ncore_config = {:?}\nexternal_origin = \"https://gateway.example.ts.net\"\ngrants_file = {:?}\n",vault.to_str().unwrap(),core.to_str().unwrap(),registry.to_str().unwrap())).unwrap();
        let registry_data = GrantRegistry {
            schema_version: 1,
            vault_id: "fixture".into(),
            members: vec![
                Member {
                    id: "alice".into(),
                    kind: MemberKind::Human,
                    sponsor: None,
                },
                Member {
                    id: "bot".into(),
                    kind: MemberKind::Agent,
                    sponsor: Some("alice".into()),
                },
            ],
            grants: vec![],
            connectors: vec![],
        };
        fs::write(&registry, serde_json::to_vec(&registry_data).unwrap()).unwrap();
        fs::set_permissions(&registry, fs::Permissions::from_mode(0o600)).unwrap();
        Self {
            _dir: dir,
            config,
            registry,
        }
    }
    fn load(&self) -> LoadedGatewayConfig {
        LoadedGatewayConfig::load(&self.config).unwrap()
    }
    fn credentials(&self) -> (String, String) {
        let cfg = self.load();
        let client = issue_grant(
            &cfg,
            "grant",
            "bot",
            &["tasks:write".into()],
            "2099-01-01T00:00:00Z",
        )
        .unwrap();
        let connector = issue_connector(&cfg, "connector", "2099-01-01T00:00:00Z").unwrap();
        (client, connector)
    }
}
#[test]
fn admission_uses_registry_actor_and_both_credentials() {
    let f = Fixture::new();
    let (c, k) = f.credentials();
    let cfg = f.load();
    let p = admit(&cfg, &c, &k).unwrap();
    assert_eq!(p.actor, "bot");
    assert_eq!(p.scopes, vec!["tasks:write"]);
    assert_eq!(p.members.len(), 2);
    for (client, connector) in [
        ("", k.as_str()),
        (c.as_str(), ""),
        ("wrong", k.as_str()),
        (c.as_str(), "wrong"),
    ] {
        assert!(admit(&cfg, client, connector).is_err());
    }
    assert_eq!(probe_connector(&cfg, &k).unwrap(), "connector");
    assert!(!fs::read_to_string(&f.registry).unwrap().contains(&c));
}
#[test]
fn revocation_and_expiry_refuse_new_admission() {
    let f = Fixture::new();
    let (c, k) = f.credentials();
    let cfg = f.load();
    let admitted = admit(&cfg, &c, &k).unwrap();
    revoke_grant(&cfg, "grant").unwrap();
    assert!(admit(&cfg, &c, &k).is_err());
    assert_eq!(admitted.actor, "bot");
    assert!(issue_grant(
        &cfg,
        "old",
        "bot",
        &["tasks:read".into()],
        "2000-01-01T00:00:00Z"
    )
    .is_err());
    revoke_connector(&cfg, "connector").unwrap();
    assert!(probe_connector(&cfg, &k).is_err());
}
#[test]
fn invalid_member_scope_and_vault_fail_closed() {
    let f = Fixture::new();
    let cfg = f.load();
    assert!(issue_grant(
        &cfg,
        "g",
        "intruder",
        &["tasks:write".into()],
        "2099-01-01T00:00:00Z"
    )
    .is_err());
    assert!(issue_grant(
        &cfg,
        "g",
        "bot",
        &["root:write".into()],
        "2099-01-01T00:00:00Z"
    )
    .is_err());
    let (c, k) = f.credentials();
    let mut registry: serde_json::Value =
        serde_json::from_slice(&fs::read(&f.registry).unwrap()).unwrap();
    registry["vault_id"] = "other".into();
    fs::write(&f.registry, serde_json::to_vec(&registry).unwrap()).unwrap();
    assert!(admit(&cfg, &c, &k).is_err());
}
#[test]
fn unsafe_files_and_parent_are_rejected() {
    let f = Fixture::new();
    let (c, k) = f.credentials();
    let cfg = f.load();
    fs::set_permissions(&f.registry, fs::Permissions::from_mode(0o644)).unwrap();
    assert!(admit(&cfg, &c, &k).is_err());
    fs::set_permissions(&f.registry, fs::Permissions::from_mode(0o600)).unwrap();
    let original = f.registry.with_extension("original");
    fs::rename(&f.registry, &original).unwrap();
    symlink(&original, &f.registry).unwrap();
    assert!(admit(&cfg, &c, &k).is_err());
}
#[test]
fn configuration_and_root_drift_require_restart() {
    let f = Fixture::new();
    let (c, k) = f.credentials();
    let cfg = f.load();
    fs::write(&cfg.settings.core_config, "[core]\nvault_path = '/other'\n").unwrap();
    assert!(admit(&cfg, &c, &k).is_err());
}

#[test]
fn stored_expiry_and_invalid_sponsorship_fail_closed() {
    for (field, value) in [
        ("expires_at", "2000-01-01T00:00:00Z"),
        ("actor", "intruder"),
    ] {
        let f = Fixture::new();
        let (c, k) = f.credentials();
        let mut registry: serde_json::Value =
            serde_json::from_slice(&fs::read(&f.registry).unwrap()).unwrap();
        registry["grants"][0][field] = value.into();
        fs::write(&f.registry, serde_json::to_vec(&registry).unwrap()).unwrap();
        assert!(admit(&f.load(), &c, &k).is_err());
    }
    let f = Fixture::new();
    let (c, k) = f.credentials();
    let mut registry: serde_json::Value =
        serde_json::from_slice(&fs::read(&f.registry).unwrap()).unwrap();
    registry["members"][1]["sponsor"] = "bot".into();
    fs::write(&f.registry, serde_json::to_vec(&registry).unwrap()).unwrap();
    assert!(admit(&f.load(), &c, &k).is_err());
}

#[test]
fn revoke_before_queue_admission_wins() {
    let f = Fixture::new();
    let (c, k) = f.credentials();
    let cfg = std::sync::Arc::new(f.load());
    let queued = std::sync::Arc::new(std::sync::Barrier::new(2));
    let release = std::sync::Arc::new(std::sync::Barrier::new(2));
    let worker = {
        let cfg = cfg.clone();
        let queued = queued.clone();
        let release = release.clone();
        std::thread::spawn(move || {
            queued.wait();
            release.wait();
            admit(&cfg, &c, &k)
        })
    };
    queued.wait();
    revoke_grant(&cfg, "grant").unwrap();
    release.wait();
    assert!(worker.join().unwrap().is_err());
}

#[test]
fn admission_transition_returns_the_authenticated_actor() {
    let f = Fixture::new();
    let (client, connector) = f.credentials();
    assert_eq!(
        admit_with(&f.load(), &client, &connector, |verified| verified
            .actor
            .clone())
        .unwrap(),
        "bot"
    );
}

#[test]
fn admission_transition_holds_shared_lock_and_admitted_work_survives_revoke() {
    let f = Fixture::new();
    let (c, k) = f.credentials();
    let client = c.clone();
    let connector = k.clone();
    let cfg = std::sync::Arc::new(f.load());
    let (running, started) = std::sync::mpsc::channel();
    let finish_transition = std::sync::Arc::new(std::sync::Barrier::new(2));
    let worker = {
        let cfg = cfg.clone();
        let finish_transition = finish_transition.clone();
        std::thread::spawn(move || {
            admit_with(&cfg, &c, &k, |verified| {
                running.send(()).unwrap();
                finish_transition.wait();
                verified.clone()
            })
            .unwrap()
        })
    };
    started
        .recv_timeout(std::time::Duration::from_secs(5))
        .unwrap();
    let lock = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(lock_path(&cfg))
        .unwrap();
    assert_eq!(
        rustix::fs::flock(&lock, rustix::fs::FlockOperation::NonBlockingLockExclusive),
        Err(rustix::io::Errno::WOULDBLOCK)
    );
    finish_transition.wait();
    let admitted = worker.join().unwrap();
    revoke_grant(&cfg, "grant").unwrap();
    assert_eq!(admitted.actor, "bot");
    assert!(admit(&cfg, &client, &connector).is_err());
}
#[test]
fn concurrent_administrators_preserve_every_update() {
    let f = Fixture::new();
    let cfg = std::sync::Arc::new(f.load());
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(9));
    let workers: Vec<_> = (0..8)
        .map(|i| {
            let cfg = cfg.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                issue_connector(&cfg, &format!("c{i}"), "2099-01-01T00:00:00Z").unwrap()
            })
        })
        .collect();
    barrier.wait();
    for worker in workers {
        worker.join().unwrap();
    }
    let registry: GrantRegistry = serde_json::from_slice(&fs::read(&f.registry).unwrap()).unwrap();
    assert_eq!(registry.connectors.len(), 8);
}
#[test]
fn real_cli_prints_issued_secret_once_and_never_on_revoke() {
    let f = Fixture::new();
    let exe = assert_cmd::cargo::cargo_bin!("shards-gateway");
    let out = std::process::Command::new(exe)
        .args([
            "grant",
            "issue",
            "--config",
            f.config.to_str().unwrap(),
            "--grant-id",
            "cli",
            "--actor",
            "bot",
            "--scope",
            "tasks:write",
            "--expires-at",
            "2099-01-01T00:00:00Z",
        ])
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    let secret = String::from_utf8(out.stdout).unwrap();
    assert_eq!(secret.lines().count(), 1);
    assert_eq!(secret.trim().len(), 64);
    assert!(out.stderr.is_empty());
    assert!(!fs::read_to_string(&f.registry)
        .unwrap()
        .contains(secret.trim()));
    let revoked = std::process::Command::new(exe)
        .args([
            "grant",
            "revoke",
            "--config",
            f.config.to_str().unwrap(),
            "--grant-id",
            "cli",
        ])
        .output()
        .unwrap();
    assert!(revoked.status.success());
    assert!(revoked.stdout.is_empty());
    assert!(revoked.stderr.is_empty());
}

#[test]
fn connector_expiry_and_registry_schema_errors_refuse_probe() {
    for (field, value) in [
        ("expires_at", "2000-01-01T00:00:00Z"),
        ("revoked_at", "2026-01-01T00:00:00Z"),
    ] {
        let f = Fixture::new();
        let (_, token) = f.credentials();
        let mut registry: serde_json::Value =
            serde_json::from_slice(&fs::read(&f.registry).unwrap()).unwrap();
        registry["connectors"][0][field] = value.into();
        fs::write(&f.registry, serde_json::to_vec(&registry).unwrap()).unwrap();
        assert!(probe_connector(&f.load(), &token).is_err());
    }
    let f = Fixture::new();
    let (_, token) = f.credentials();
    let mut registry: serde_json::Value =
        serde_json::from_slice(&fs::read(&f.registry).unwrap()).unwrap();
    registry["schema_version"] = 2.into();
    fs::write(&f.registry, serde_json::to_vec(&registry).unwrap()).unwrap();
    assert!(probe_connector(&f.load(), &token).is_err());
}

#[test]
fn lock_symlinks_unsafe_parents_and_non_regular_registry_are_rejected() {
    let f = Fixture::new();
    let (client, connector) = f.credentials();
    let cfg = f.load();
    let original = lock_path(&cfg);
    let moved = original.with_extension("saved");
    fs::rename(&original, &moved).unwrap();
    symlink(&moved, &original).unwrap();
    assert!(admit(&cfg, &client, &connector).is_err());
    fs::remove_file(&original).unwrap();
    fs::rename(&moved, &original).unwrap();
    fs::set_permissions(
        f.registry.parent().unwrap(),
        fs::Permissions::from_mode(0o777),
    )
    .unwrap();
    assert!(admit(&cfg, &client, &connector).is_err());
    fs::set_permissions(
        f.registry.parent().unwrap(),
        fs::Permissions::from_mode(0o700),
    )
    .unwrap();
    fs::remove_file(&f.registry).unwrap();
    fs::create_dir(&f.registry).unwrap();
    assert!(admit(&cfg, &client, &connector).is_err());
}

#[test]
fn explicit_https_config_and_pinned_vault_are_required() {
    for (source, replacement) in [
        (
            "https://gateway.example.ts.net",
            "http://gateway.example.ts.net",
        ),
        (
            "https://gateway.example.ts.net",
            "https://gateway.example.ts.net/path",
        ),
        ("vault_id = \"fixture\"", "vault_id = \"\""),
    ] {
        let f = Fixture::new();
        let text = fs::read_to_string(&f.config).unwrap();
        assert!(text.contains(source));
        fs::write(&f.config, text.replace(source, replacement)).unwrap();
        assert!(LoadedGatewayConfig::load(&f.config).is_err());
    }
    let f = Fixture::new();
    let (client, connector) = f.credentials();
    let cfg = f.load();
    let moved = cfg.settings.vault_path.with_extension("saved");
    fs::rename(&cfg.settings.vault_path, moved).unwrap();
    fs::create_dir(&cfg.settings.vault_path).unwrap();
    assert!(admit(&cfg, &client, &connector).is_err());
}

#[test]
fn registry_replacement_preserves_stable_lock_and_private_modes() {
    use std::os::unix::fs::MetadataExt;
    let f = Fixture::new();
    let cfg = f.load();
    let first = issue_connector(&cfg, "first", "2099-01-01T00:00:00Z").unwrap();
    let before = fs::metadata(lock_path(&cfg)).unwrap();
    issue_connector(&cfg, "second", "2099-01-01T00:00:00Z").unwrap();
    let after = fs::metadata(lock_path(&cfg)).unwrap();
    assert_eq!((before.dev(), before.ino()), (after.dev(), after.ino()));
    assert_eq!(fs::metadata(&f.registry).unwrap().mode() & 0o777, 0o600);
    assert_eq!(after.mode() & 0o777, 0o600);
    assert_eq!(probe_connector(&cfg, &first).unwrap(), "first");
}

#[test]
fn duplicate_issue_and_revoke_cli_never_echo_a_secret_in_errors() {
    let f = Fixture::new();
    let (client, _) = f.credentials();
    let out = std::process::Command::new(assert_cmd::cargo::cargo_bin!("shards-gateway"))
        .args([
            "grant",
            "issue",
            "--config",
            f.config.to_str().unwrap(),
            "--grant-id",
            "grant",
            "--actor",
            "bot",
            "--scope",
            "tasks:write",
            "--expires-at",
            "2099-01-01T00:00:00Z",
        ])
        .output()
        .unwrap();
    assert!(!out.status.success());
    assert!(out.stdout.is_empty());
    assert!(!String::from_utf8_lossy(&out.stderr).contains(&client));
    assert_eq!(
        admit(
            &f.load(),
            &client,
            &issue_connector(&f.load(), "new-connector", "2099-01-01T00:00:00Z").unwrap()
        )
        .unwrap()
        .actor,
        "bot"
    );
}
