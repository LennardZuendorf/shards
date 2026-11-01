use super::super::json::{canonical_json, text_digest};
use super::*;
use std::os::unix::fs::{symlink, PermissionsExt};
struct Fixture {
    _tmp: tempfile::TempDir,
    root: PathBuf,
    key: SessionKey,
    task: TaskEvidence,
}
impl Fixture {
    fn new() -> Self {
        let tmp = tempfile::tempdir().unwrap();
        let base = std::fs::canonicalize(tmp.path()).unwrap();
        let root = base.join("state");
        let key = SessionKey::new(
            base.join("vault"),
            "claude".into(),
            "session-1".into(),
            None,
        )
        .unwrap();
        let task = TaskEvidence {
            task_id: "t-1".into(),
            vault: key.vault.clone(),
            project: base.clone(),
            actor: "agent".into(),
            status: "claimed".into(),
            claimed_by: Some("agent".into()),
        };
        Self {
            _tmp: tmp,
            root,
            key,
            task,
        }
    }
    fn bind(&self) -> Receipt {
        self.claim("t-1", "claim-1")
    }
    fn claim(&self, t: &str, c: &str) -> Receipt {
        let pre = reserve_claim(&self.root, &self.key, t, c).unwrap();
        let mut task = self.task.clone();
        task.task_id = t.into();
        bind_task(
            &self.root,
            &self.key,
            t,
            &|_| Ok(task.clone()),
            c,
            pre.expected_generation,
            None,
        )
        .unwrap()
    }
    fn append(&self, c: &str) -> CallReservation {
        let r = load_receipt(&self.root, &self.key).unwrap().unwrap();
        reserve_call(
            &self.root,
            &self.key,
            &r.task_id,
            c,
            "append",
            Some(text_digest("checkpoint")),
            Some(0),
            Some(r.generation),
        )
        .unwrap()
    }
    fn checkpoint(&self, c: &str) -> Receipt {
        self.append(c);
        let r = load_receipt(&self.root, &self.key).unwrap().unwrap();
        mark_checkpoint(&self.root, &self.key, c, &r.task_id, r.generation).unwrap()
    }
    fn retire(&self, c: &str, outcome: &str) -> Receipt {
        let r = load_receipt(&self.root, &self.key).unwrap().unwrap();
        let mut task = self.task.clone();
        task.task_id = r.task_id.clone();
        task.status = "open".into();
        task.claimed_by = None;
        retire_binding(
            &self.root,
            &self.key,
            &r.task_id,
            &|_| {
                Ok(RetirementEvidence {
                    task: task.clone(),
                    lifecycle_call: c.into(),
                    checkpoint_call: r.last_lifecycle_call.clone().unwrap(),
                    outcome: outcome.into(),
                })
            },
            r.generation,
        )
        .unwrap()
    }
    fn scope(&self) -> ExceptionScope {
        ExceptionScope {
            project: self.task.project.clone(),
            config_path: self.task.project.join("config.toml"),
            host: self.key.host.clone(),
            session_id: self.key.session_id.clone(),
            delegated_agent_id: None,
            turn_id: "turn-1".into(),
            tool_name: "Bash".into(),
            tool_input_sha256: tool_input_sha256(&json!({"command":"sensitive raw arguments"}))
                .unwrap(),
        }
    }
}
#[test]
fn python_ascii_del_is_escaped() {
    assert_eq!(canonical_json(&json!("\u{7f}")).unwrap(), "\"\\u007f\"");
}
#[test]
fn missing_optional_persisted_fields_are_rejected() {
    let f = Fixture::new();
    let r = f.bind();
    let mut v = serde_json::to_value(r).unwrap();
    v.as_object_mut().unwrap().remove("retirement_call");
    let s = Store::open(&f.root).unwrap();
    s.write(&receipt_name(&f.key).unwrap(), &v).unwrap();
    assert!(load_receipt(&f.root, &f.key).is_err());
}
#[test]
fn enrollment_exact_types_null_unknown_nul() {
    let f = Fixture::new();
    assert!(load_enrollment(&f.task.project).unwrap().is_none());
    let p = f.task.project.join(".shards-harness.json");
    for raw in [
        "null",
        r#"{"version":true,"enabled":true,"config_path":"/tmp/x"}"#,
        r#"{"version":1,"enabled":true,"config_path":"/tmp/x","extra":1}"#,
        r#"{"version":1,"enabled":true,"config_path":"/tmp/\u0000"}"#,
        r#"{"version":1,"enabled":true,"config_path":"relative"}"#,
    ] {
        std::fs::write(&p, raw).unwrap();
        assert!(load_enrollment(&f.task.project).is_err(), "{raw}");
    }
    std::fs::write(
        &p,
        format!(
            r#"{{"version":1,"enabled":false,"config_path":{:?}}}"#,
            f.task.project.join("config").to_str().unwrap()
        ),
    )
    .unwrap();
    assert!(!load_enrollment(&f.task.project).unwrap().unwrap().enabled);
}
#[test]
fn delayed_checkpoint_never_cleans_later_work_or_overwrites_newer_proof() {
    let f = Fixture::new();
    f.bind();
    mark_work(&f.root, &f.key, "work-1", "t-1", 1).unwrap();
    f.append("old");
    mark_work(&f.root, &f.key, "work-2", "t-1", 1).unwrap();
    f.append("new");
    let n = mark_checkpoint(&f.root, &f.key, "new", "t-1", 1).unwrap();
    assert_eq!(n.checkpoint_sequence, 2);
    let n = mark_checkpoint(&f.root, &f.key, "old", "t-1", 1).unwrap();
    assert_eq!(n.last_lifecycle_call.as_deref(), Some("new"));
    mark_work(&f.root, &f.key, "work-3", "t-1", 1).unwrap();
    assert_eq!(
        mark_checkpoint(&f.root, &f.key, "new", "t-1", 1)
            .unwrap()
            .checkpoint_sequence,
        2
    );
}
#[test]
fn retirement_rebind_rejects_old_generation_and_pre_retirement_claim() {
    let f = Fixture::new();
    f.bind();
    let old = reserve_claim(&f.root, &f.key, "t-1", "reserved-old").unwrap();
    f.checkpoint("append");
    f.retire("release", "waiting");
    assert!(bind_task(
        &f.root,
        &f.key,
        "t-1",
        &|_| Ok(f.task.clone()),
        "reserved-old",
        old.expected_generation,
        None
    )
    .is_err());
    let new = f.claim("t-2", "claim-2");
    assert_eq!(new.generation, 2);
    assert!(mark_work(&f.root, &f.key, "old", "t-1", 1).is_err());
    assert!(mark_work(&f.root, &f.key, "release", "t-2", 2).is_err());
}
#[test]
fn immutable_precall_and_reservation_do_not_authorize_work() {
    let f = Fixture::new();
    let p = reserve_claim(&f.root, &f.key, "t-1", "claim").unwrap();
    assert_eq!(p.expected_generation, 0);
    assert!(load_receipt(&f.root, &f.key).unwrap().is_none());
    assert_eq!(p, reserve_claim(&f.root, &f.key, "t-1", "claim").unwrap());
    f.bind();
    let p = f.append("append");
    assert_eq!(p.work_sequence, 0);
    assert!(reserve_call(
        &f.root,
        &f.key,
        "t-1",
        "append",
        "append",
        Some(text_digest("different")),
        Some(0),
        Some(1)
    )
    .is_err());
    assert!(reserve_call(
        &f.root,
        &f.key,
        "t-1",
        "append",
        "append",
        p.text_sha256,
        Some(1),
        Some(1)
    )
    .is_err());
    assert!(mark_checkpoint(&f.root, &f.key, "missing", "t-1", 1).is_err());
    assert!(bind_task(
        &f.root,
        &f.key,
        "t-1",
        &|_| Ok(f.task.clone()),
        "missing",
        1,
        None
    )
    .is_err());
}
#[test]
fn owner_unknown_active_and_inactive_are_distinct() {
    let f = Fixture::new();
    f.bind();
    let mut foreign = f.key.clone();
    foreign.session_id = "foreign".into();
    reserve_claim(&f.root, &foreign, "t-1", "other").unwrap();
    for state in [None, Some("active"), Some("unknown")] {
        let observer = |_: &SessionKey| state.unwrap_or("unknown").to_string();
        assert!(bind_task(
            &f.root,
            &foreign,
            "t-1",
            &|_| Ok(f.task.clone()),
            "other",
            0,
            Some(&observer)
        )
        .is_err());
    }
    assert!(bind_task(
        &f.root,
        &foreign,
        "t-1",
        &|_| Ok(f.task.clone()),
        "other",
        0,
        Some(&|_| "inactive".into())
    )
    .is_ok());
}
#[test]
fn lost_markers_recover_and_tombstone_does_not_overwrite_adopter() {
    let f = Fixture::new();
    let active = f.bind();
    std::fs::remove_file(f.root.join(receipt_name(&f.key).unwrap())).unwrap();
    assert_eq!(load_receipt(&f.root, &f.key).unwrap(), Some(active));
    recover_receipt(&f.root, &f.key, "t-1", 1).unwrap();
    f.checkpoint("append");
    let retired = f.retire("release", "handoff");
    std::fs::remove_file(f.root.join(receipt_name(&f.key).unwrap())).unwrap();
    std::fs::remove_file(f.root.join(binding_name(&f.key, "t-1").unwrap())).unwrap();
    assert_eq!(load_receipt(&f.root, &f.key).unwrap(), Some(retired));
    let mut other = f.key.clone();
    other.session_id = "adopter".into();
    reserve_claim(&f.root, &other, "t-1", "adopt").unwrap();
    bind_task(
        &f.root,
        &other,
        "t-1",
        &|_| Ok(f.task.clone()),
        "adopt",
        0,
        None,
    )
    .unwrap();
    recover_receipt(&f.root, &f.key, "t-1", 1).unwrap();
    assert_eq!(
        read(
            &Store::open(&f.root).unwrap(),
            &binding_name(&f.key, "t-1").unwrap()
        )
        .unwrap()
        .unwrap()
        .key,
        other
    );
}
#[test]
fn validation_and_callback_failures_leave_unchanged_state() {
    let f = Fixture::new();
    let bound = f.bind();
    assert!(update_receipt(
        &f.root,
        &f.key,
        &|_| Err("callback failed".into()),
        "t-1",
        1,
        None
    )
    .is_err());
    assert_eq!(load_receipt(&f.root, &f.key).unwrap(), Some(bound.clone()));
    let stale = bound.clone();
    mark_work(&f.root, &f.key, "work", "t-1", 1).unwrap();
    assert!(update_receipt(&f.root, &f.key, &|_| Ok(stale.clone()), "t-1", 1, None).is_err());
    for changed in ["vault", "actor", "project", "status", "claim"] {
        let mut e = f.task.clone();
        match changed {
            "vault" => e.vault = PathBuf::from("/elsewhere"),
            "actor" => e.actor = "other".into(),
            "project" => e.project = PathBuf::from("/elsewhere"),
            "status" => e.status = "done".into(),
            _ => e.claimed_by = Some("other".into()),
        }
        assert!(reconcile_binding(&f.root, &f.key, &|_| Ok(e.clone()), None, "t-1", 1).is_err());
    }
}
#[test]
fn exact_exception_scope_consumes_once_without_raw_input() {
    let f = Fixture::new();
    let scope = f.scope();
    let request = request_exception(&f.root, &scope).unwrap();
    assert_eq!(request_exception(&f.root, &scope).unwrap(), request);
    assert!(consume_exception(&f.root, &scope).unwrap().is_none());
    assert!(grant_exception(&f.root, &request.request_id, "short").is_err());
    assert!(grant_exception(&f.root, &"0".repeat(64), "Explicit recovery permission").is_err());
    grant_exception(&f.root, &request.request_id, "Explicit recovery permission").unwrap();
    for field in [
        "project", "config", "host", "session", "delegate", "turn", "tool", "input",
    ] {
        let mut changed = scope.clone();
        match field {
            "project" => changed.project = f.task.project.join("other-project"),
            "config" => changed.config_path = f.task.project.join("other.toml"),
            "host" => changed.host = "codex".into(),
            "session" => changed.session_id = "other-session".into(),
            "delegate" => changed.delegated_agent_id = Some("child".into()),
            "turn" => changed.turn_id = "turn-2".into(),
            "tool" => changed.tool_name = "Read".into(),
            _ => changed.tool_input_sha256 = "e".repeat(64),
        }
        assert!(
            consume_exception(&f.root, &changed).unwrap().is_none(),
            "{field}"
        );
    }
    assert!(
        consume_exception(&f.root, &scope)
            .unwrap()
            .unwrap()
            .consumed
    );
    assert!(consume_exception(&f.root, &scope).unwrap().is_none());
    assert!(request_exception(&f.root, &scope).unwrap().consumed);
    assert!(grant_exception(&f.root, &request.request_id, "Explicit recovery permission").is_err());
    let raw = std::fs::read_to_string(
        f.root
            .join(format!("exception-{}.json", request.request_id)),
    )
    .unwrap();
    assert!(!raw.contains("sensitive raw arguments"));
}
#[test]
fn store_refuses_symlinks_hardlinks_fifo_and_preserves_modes() {
    let f = Fixture::new();
    f.bind();
    let rp = f.root.join(receipt_name(&f.key).unwrap());
    let original = std::fs::read(&rp).unwrap();
    assert_eq!(
        std::fs::metadata(&f.root).unwrap().permissions().mode() & 0o777,
        0o700
    );
    assert_eq!(
        std::fs::metadata(&rp).unwrap().permissions().mode() & 0o777,
        0o600
    );
    let target = f.task.project.join("target");
    std::fs::write(&target, &original).unwrap();
    std::fs::remove_file(&rp).unwrap();
    symlink(&target, &rp).unwrap();
    assert!(load_receipt(&f.root, &f.key).is_err());
    assert_eq!(std::fs::read(&target).unwrap(), original);
    std::fs::remove_file(&rp).unwrap();
    std::fs::hard_link(&target, &rp).unwrap();
    assert!(load_receipt(&f.root, &f.key).is_err());
    std::fs::remove_file(&rp).unwrap();
    assert!(std::process::Command::new("mkfifo")
        .arg(&rp)
        .status()
        .unwrap()
        .success());
    assert!(load_receipt(&f.root, &f.key).is_err());
    let alias = f.task.project.join("linked-parent");
    symlink(&f.root, &alias).unwrap();
    assert!(load_receipt(&alias, &f.key).is_err());
}
#[test]
fn dirty_delayed_checkpoints_leave_current_work_slot_at_capacity() {
    let f = Fixture::new();
    let mut r = f.bind();
    r.seen_event_ids
        .extend((1..4093).map(|n| format!("seed-{n}")));
    r.work_sequence = 1;
    r.phase = "working".into();
    let s = Store::open(&f.root).unwrap();
    persist(&s, &r).unwrap();
    for c in ["a", "b", "c"] {
        f.append(c);
    }
    mark_work(&f.root, &f.key, "latest-work", "t-1", 1).unwrap();
    f.append("current");
    mark_checkpoint(&f.root, &f.key, "a", "t-1", 1).unwrap();
    mark_checkpoint(&f.root, &f.key, "b", "t-1", 1).unwrap();
    let before = load_receipt(&f.root, &f.key).unwrap();
    assert!(mark_checkpoint(&f.root, &f.key, "c", "t-1", 1).is_err());
    assert_eq!(load_receipt(&f.root, &f.key).unwrap(), before);
    let r = mark_checkpoint(&f.root, &f.key, "current", "t-1", 1).unwrap();
    assert_eq!(r.seen_event_ids.len(), 4097);
    assert_eq!(r.checkpoint_sequence, 2);
    let retired = f.retire("release", "waiting");
    assert_eq!(retired.seen_event_ids.len(), 4098);
}
#[test]
fn ordinary_lifecycle_reference_cannot_forge_terminal_observation() {
    let f = Fixture::new();
    f.bind();
    f.checkpoint("append");
    let mut task = f.task.clone();
    task.status = "done".into();
    assert!(retire_binding(
        &f.root,
        &f.key,
        "t-1",
        &|_| Ok(RetirementEvidence {
            task: task.clone(),
            lifecycle_call: "terminal-observation:forged".into(),
            checkpoint_call: "append".into(),
            outcome: "handoff".into()
        }),
        1
    )
    .is_err());
}
#[test]
fn external_terminal_handoff_requires_exact_clean_reserved_checkpoint() {
    let f = Fixture::new();
    f.bind();
    mark_work(&f.root, &f.key, "work", "t-1", 1).unwrap();
    f.checkpoint("append");
    update_receipt(
        &f.root,
        &f.key,
        &|r| {
            let mut r = r.clone();
            r.phase = "handoff".into();
            Ok(r)
        },
        "t-1",
        1,
        None,
    )
    .unwrap();
    let mut done = f.task.clone();
    done.status = "done".into();
    assert!(
        retire_observed_terminal(&f.root, &f.key, "t-1", &|_| Ok(done.clone()), "wrong", 1)
            .is_err()
    );
    let mut reopened = done.clone();
    reopened.status = "open".into();
    assert!(retire_observed_terminal(
        &f.root,
        &f.key,
        "t-1",
        &|_| Ok(reopened.clone()),
        "append",
        1
    )
    .is_err());
    mark_work(&f.root, &f.key, "later-dirty-work", "t-1", 1).unwrap();
    assert!(
        retire_observed_terminal(&f.root, &f.key, "t-1", &|_| Ok(done.clone()), "append", 1)
            .is_err()
    );
    f.checkpoint("append-clean");
    update_receipt(
        &f.root,
        &f.key,
        &|r| {
            let mut n = r.clone();
            n.phase = "handoff".into();
            Ok(n)
        },
        "t-1",
        1,
        None,
    )
    .unwrap();
    let retired = retire_observed_terminal(
        &f.root,
        &f.key,
        "t-1",
        &|_| Ok(done.clone()),
        "append-clean",
        1,
    )
    .unwrap();
    assert!(retired.retired);
    assert_eq!(retired.phase, "handoff");
    assert!(retired
        .retirement_call
        .unwrap()
        .starts_with("terminal-observation:"));
}

#[test]
fn process_worker() {
    let Ok(mode) = std::env::var("HARNESS_STATE_WORKER") else {
        return;
    };
    let root = PathBuf::from(std::env::var("HARNESS_STATE_ROOT").unwrap());
    if mode == "consume" {
        let scope: ExceptionScope =
            serde_json::from_str(&std::env::var("HARNESS_STATE_SCOPE").unwrap()).unwrap();
        let result = consume_exception(&root, &scope).unwrap();
        println!(
            "RESULT:{}",
            if result.is_some() {
                "consumed"
            } else {
                "empty"
            }
        );
        return;
    }
    let key: SessionKey =
        serde_json::from_str(&std::env::var("HARNESS_STATE_KEY").unwrap()).unwrap();
    let task: TaskEvidence =
        serde_json::from_str(&std::env::var("HARNESS_STATE_TASK").unwrap()).unwrap();
    Store::open(&root).unwrap();
    std::fs::write(root.join(format!("ready-{}", key.session_id)), b"ready").unwrap();
    for _ in 0..3000 {
        if root.join("go").exists() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    reserve_claim(&root, &key, "t-1", "process-claim").unwrap();
    let result = bind_task(
        &root,
        &key,
        "t-1",
        &|_| {
            std::fs::write(root.join(format!("verified-{}", key.session_id)), b"yes").unwrap();
            Ok(task.clone())
        },
        "process-claim",
        0,
        None,
    );
    match result {
        Ok(_) => println!("RESULT:bound"),
        Err(e) if e.contains("belongs to another active or unknown session") => {
            println!("RESULT:conflict")
        }
        Err(e) => panic!("unexpected binding failure: {e}"),
    }
}
fn worker(f: &Fixture, key: &SessionKey) -> std::process::Child {
    std::process::Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "harness::state::tests::process_worker",
            "--nocapture",
        ])
        .env("HARNESS_STATE_WORKER", "bind")
        .env("HARNESS_STATE_ROOT", &f.root)
        .env("HARNESS_STATE_KEY", serde_json::to_string(key).unwrap())
        .env(
            "HARNESS_STATE_TASK",
            serde_json::to_string(&f.task).unwrap(),
        )
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::inherit())
        .spawn()
        .unwrap()
}
fn wait_path(p: &Path) {
    for _ in 0..3000 {
        if p.exists() {
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    panic!("worker did not become ready: {}", p.display());
}
#[test]
fn same_actor_two_processes_have_one_binding_winner() {
    // Each round races first creation of a fresh task anchor, rather than
    // only reopening a lock already published by an earlier iteration.
    for _ in 0..12 {
        let f = Fixture::new();
        let mut other = f.key.clone();
        other.session_id = "second".into();
        let a = worker(&f, &f.key);
        let b = worker(&f, &other);
        wait_path(&f.root.join("ready-session-1"));
        wait_path(&f.root.join("ready-second"));
        std::fs::write(f.root.join("go"), b"go").unwrap();
        let outputs = [a.wait_with_output().unwrap(), b.wait_with_output().unwrap()];
        let texts = outputs
            .iter()
            .map(|o| {
                assert!(o.status.success(), "{}", String::from_utf8_lossy(&o.stderr));
                String::from_utf8(o.stdout.clone()).unwrap()
            })
            .collect::<Vec<_>>();
        assert_eq!(
            texts.iter().filter(|t| t.contains("RESULT:bound")).count(),
            1,
            "{texts:?}"
        );
        assert_eq!(
            texts
                .iter()
                .filter(|t| t.contains("RESULT:conflict"))
                .count(),
            1,
            "{texts:?}"
        );
    }
}
#[test]
fn verification_callback_waits_for_permanent_task_lock() {
    let f = Fixture::new();
    let store = Store::open(&f.root).unwrap();
    let lock = store
        .lock(&format!("lock-task-{}", tid(&f.key, "t-1").unwrap()))
        .unwrap();
    let child = worker(&f, &f.key); // reserve itself also needs task lock
    std::thread::sleep(std::time::Duration::from_millis(100));
    assert!(!f.root.join("verified-session-1").exists());
    drop(lock);
    wait_path(&f.root.join("ready-session-1"));
    let lock = store
        .lock(&format!("lock-task-{}", tid(&f.key, "t-1").unwrap()))
        .unwrap();
    std::fs::write(f.root.join("go"), b"go").unwrap();
    std::thread::sleep(std::time::Duration::from_millis(100));
    assert!(!f.root.join("verified-session-1").exists());
    drop(lock);
    let result = child.wait_with_output().unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    assert!(String::from_utf8(result.stdout)
        .unwrap()
        .contains("RESULT:bound"));
    assert!(f.root.join("verified-session-1").exists());
    assert!(f
        .root
        .join(format!("lock-task-{}", tid(&f.key, "t-1").unwrap()))
        .is_file());
}
#[test]
fn exception_two_processes_consume_once() {
    let f = Fixture::new();
    let scope = f.scope();
    let r = request_exception(&f.root, &scope).unwrap();
    grant_exception(&f.root, &r.request_id, "Operator authorizes exact recovery").unwrap();
    let spawn = || {
        std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "harness::state::tests::process_worker",
                "--nocapture",
            ])
            .env("HARNESS_STATE_WORKER", "consume")
            .env("HARNESS_STATE_ROOT", &f.root)
            .env(
                "HARNESS_STATE_SCOPE",
                serde_json::to_string(&scope).unwrap(),
            )
            .stdout(std::process::Stdio::piped())
            .spawn()
            .unwrap()
    };
    let a = spawn();
    let b = spawn();
    let out = [a.wait_with_output().unwrap(), b.wait_with_output().unwrap()];
    assert_eq!(
        out.iter()
            .filter(|o| String::from_utf8_lossy(&o.stdout).contains("RESULT:consumed"))
            .count(),
        1
    );
    assert_eq!(
        out.iter()
            .filter(|o| String::from_utf8_lossy(&o.stdout).contains("RESULT:empty"))
            .count(),
        1
    );
}
#[test]
fn partial_bind_marker_recovers_without_new_generation() {
    let f = Fixture::new();
    reserve_claim(&f.root, &f.key, "t-1", "claim").unwrap();
    let rp = f.root.join(receipt_name(&f.key).unwrap());
    assert!(bind_task(
        &f.root,
        &f.key,
        "t-1",
        &|_| {
            std::fs::create_dir(&rp).unwrap();
            Ok(f.task.clone())
        },
        "claim",
        0,
        None
    )
    .is_err());
    std::fs::remove_dir(&rp).unwrap();
    let recovered = load_receipt(&f.root, &f.key).unwrap().unwrap();
    assert_eq!(recovered.generation, 1);
    let r = bind_task(
        &f.root,
        &f.key,
        "t-1",
        &|_| Ok(f.task.clone()),
        "claim",
        0,
        None,
    )
    .unwrap();
    assert_eq!(recovered, r);
    assert!(rp.is_file());
}
#[test]
fn partial_retirement_tombstone_prevents_reactivation_and_recovers() {
    let f = Fixture::new();
    f.bind();
    f.checkpoint("append");
    let rp = f.root.join(receipt_name(&f.key).unwrap());
    let mut released = f.task.clone();
    released.status = "open".into();
    released.claimed_by = None;
    let result = retire_binding(
        &f.root,
        &f.key,
        "t-1",
        &|_| {
            std::fs::remove_file(&rp).unwrap();
            std::fs::create_dir(&rp).unwrap();
            Ok(RetirementEvidence {
                task: released.clone(),
                lifecycle_call: "release".into(),
                checkpoint_call: "append".into(),
                outcome: "waiting".into(),
            })
        },
        1,
    );
    assert!(result.is_err());
    std::fs::remove_dir(&rp).unwrap();
    let recovered = load_receipt(&f.root, &f.key).unwrap().unwrap();
    assert!(recovered.retired);
    assert!(mark_work(&f.root, &f.key, "work", "t-1", 1).is_err());
    recover_receipt(&f.root, &f.key, "t-1", 1).unwrap();
    assert!(rp.is_file());
}
#[test]
fn failed_tombstone_keeps_active_owner_until_verified_retry() {
    let f = Fixture::new();
    f.bind();
    let mut r = f.checkpoint("append");
    r.retired = true;
    r.retirement_call = Some("release".into());
    r.phase = "waiting".into();
    r.seen_event_ids.push("release".into());
    let p = f.root.join(retired_name(&r).unwrap());
    std::fs::create_dir(&p).unwrap();
    let mut task = f.task.clone();
    task.status = "open".into();
    task.claimed_by = None;
    assert!(retire_binding(
        &f.root,
        &f.key,
        "t-1",
        &|_| Ok(RetirementEvidence {
            task: task.clone(),
            lifecycle_call: "release".into(),
            checkpoint_call: "append".into(),
            outcome: "waiting".into()
        }),
        1
    )
    .is_err());
    // The obstructing tombstone itself is malformed state, so loading fails
    // closed until the obstruction is removed. Original active bytes survive.
    let active = read(
        &Store::open(&f.root).unwrap(),
        &receipt_name(&f.key).unwrap(),
    )
    .unwrap()
    .unwrap();
    assert!(!active.retired);
    std::fs::remove_dir(&p).unwrap();
    assert!(f.retire("release", "waiting").retired);
}
#[test]
fn conflicting_revisions_and_generations_fail_closed() {
    let f = Fixture::new();
    let r = f.bind();
    let s = Store::open(&f.root).unwrap();
    let mut changed = r.clone();
    changed.phase = "working".into();
    s.write(&binding_name(&f.key, "t-1").unwrap(), &changed)
        .unwrap();
    assert!(load_receipt(&f.root, &f.key).is_err());
    s.write(&binding_name(&f.key, "t-1").unwrap(), &r).unwrap();
    changed.generation = 2;
    changed.revision += 1;
    s.write(&receipt_name(&f.key).unwrap(), &changed).unwrap();
    assert!(load_receipt(&f.root, &f.key).is_err());
}
#[test]
fn lock_and_enrollment_symlinks_and_exception_unknown_fields_fail_closed() {
    let f = Fixture::new();
    let target = f.task.project.join("outside");
    std::fs::write(&target, "{}").unwrap();
    symlink(&target, f.task.project.join(".shards-harness.json")).unwrap();
    assert!(load_enrollment(&f.task.project).is_err());
    let store = Store::open(&f.root).unwrap();
    symlink(
        &target,
        f.root
            .join(format!("lock-session-{}", sid(&f.key).unwrap())),
    )
    .unwrap();
    assert!(reserve_claim(&f.root, &f.key, "t-1", "c").is_err());
    let scope = f.scope();
    let req = request_exception(&f.root, &scope).unwrap();
    let name = format!("exception-{}.json", req.request_id);
    let mut v = serde_json::to_value(&req).unwrap();
    v.as_object_mut()
        .unwrap()
        .insert("unexpected".into(), json!(true));
    store.write(&name, &v).unwrap();
    assert!(load_exception_request(&f.root, &req.request_id).is_err());
    std::fs::remove_file(f.root.join(&name)).unwrap();
    symlink(&target, f.root.join(name)).unwrap();
    assert!(consume_exception(&f.root, &scope).is_err());
    assert_eq!(std::fs::read_to_string(&target).unwrap(), "{}");
}
#[test]
fn python_large_integer_and_numeric_sentinel_are_preserved() {
    for (raw, expected) in [
        ("18446744073709551616", "18446744073709551616"),
        (
            "-999999999999999999999999999999",
            "-999999999999999999999999999999",
        ),
        (
            r#"{"$serde_json::private::Number":"123"}"#,
            r#"{"$serde_json::private::Number":"123"}"#,
        ),
        ("1.0", "1.0"),
        ("1e20", "1e+20"),
        ("-0", "0"),
        ("5e-324", "5e-324"),
    ] {
        let value = super::super::json::strict_json(raw).unwrap();
        assert_eq!(canonical_json(&value).unwrap(), expected, "{raw}");
    }
}
#[test]
fn task_vault_delegate_keys_and_normalized_paths_are_isolated() {
    let f = Fixture::new();
    let r = f.bind();
    let mut other = f.key.clone();
    other.delegated_agent_id = Some("child".into());
    assert!(load_receipt(&f.root, &other).unwrap().is_none());
    other = f.key.clone();
    other.vault = f.task.project.join("elsewhere");
    assert!(load_receipt(&f.root, &other).unwrap().is_none());
    assert_eq!(
        SessionKey::new(
            f.key.vault.join("..").join("vault"),
            f.key.host.clone(),
            f.key.session_id.clone(),
            None
        )
        .unwrap(),
        f.key
    );
    assert_eq!(
        load_claim_reservation(&f.root, &f.key, "t-1", "claim-1")
            .unwrap()
            .unwrap()
            .expected_generation,
        0
    );
    let mut v = serde_json::to_value(&r).unwrap();
    v["key"]["vault"] = json!(f.key.vault.join("..").join("vault"));
    let parsed: Receipt = serde_json::from_value(v).unwrap();
    assert_eq!(parsed.key, f.key);
}
#[test]
fn typed_receipt_rejects_null_unknown_bool_and_duplicate_references() {
    for mutate in [0, 1, 2, 3] {
        let f = Fixture::new();
        let r = f.bind();
        let mut v = serde_json::to_value(&r).unwrap();
        match mutate {
            0 => v = serde_json::Value::Null,
            1 => {
                v.as_object_mut()
                    .unwrap()
                    .insert("unexpected".into(), json!("body"));
            }
            2 => v["work_sequence"] = json!(true),
            _ => v["seen_event_ids"] = json!(["same", "same"]),
        }
        let name = receipt_name(&f.key).unwrap();
        std::fs::write(f.root.join(name), canonical_json(&v).unwrap()).unwrap();
        assert!(load_receipt(&f.root, &f.key).is_err());
    }
}
#[test]
fn retirement_proofs_require_clean_checkpoint_and_matching_task() {
    let f = Fixture::new();
    f.bind();
    let mut task = f.task.clone();
    task.status = "open".into();
    task.claimed_by = None;
    let valid = RetirementEvidence {
        task: task.clone(),
        lifecycle_call: "release".into(),
        checkpoint_call: "append".into(),
        outcome: "handoff".into(),
    };
    assert!(retire_binding(&f.root, &f.key, "t-1", &|_| Ok(valid.clone()), 1).is_err());
    f.checkpoint("append");
    for field in ["checkpoint", "reference", "outcome", "task", "claim"] {
        let mut p = valid.clone();
        match field {
            "checkpoint" => p.checkpoint_call = "missing".into(),
            "reference" => p.lifecycle_call = "append".into(),
            "outcome" => p.outcome = "working".into(),
            "task" => p.task.task_id = "wrong".into(),
            _ => p.task = f.task.clone(),
        }
        assert!(
            retire_binding(&f.root, &f.key, "t-1", &|_| Ok(p.clone()), 1).is_err(),
            "{field}"
        );
    }
    mark_work(&f.root, &f.key, "new-work", "t-1", 1).unwrap();
    assert!(retire_binding(&f.root, &f.key, "t-1", &|_| Ok(valid.clone()), 1).is_err());
}
#[test]
fn recurrence_completion_resumes_same_task_with_fresh_generation() {
    let f = Fixture::new();
    f.bind();
    f.checkpoint("append");
    let retired = f.retire("finish-recurring", "completed");
    assert!(retired.retired);
    let resumed = f.claim("t-1", "claim-next-occurrence");
    assert_eq!(resumed.generation, 2);
    assert!(resumed.revision > retired.revision);
    assert_eq!(resumed.seen_event_ids, vec!["claim-next-occurrence"]);
    assert!(mark_checkpoint(&f.root, &f.key, "append", "t-1", 1).is_err());
    assert!(mark_work(&f.root, &f.key, "finish-recurring", "t-1", 2).is_err());
    let tombstone = read(
        &Store::open(&f.root).unwrap(),
        &retired_name(&retired).unwrap(),
    )
    .unwrap()
    .unwrap();
    assert!(tombstone.seen_event_ids.contains(&"claim-1".into()));
    assert!(tombstone
        .seen_event_ids
        .contains(&"finish-recurring".into()));
}
#[test]
fn phase_only_handoff_and_missing_binding_never_abandon_foreign_session() {
    let f = Fixture::new();
    f.bind();
    update_receipt(
        &f.root,
        &f.key,
        &|r| {
            let mut n = r.clone();
            n.phase = "handoff".into();
            Ok(n)
        },
        "t-1",
        1,
        None,
    )
    .unwrap();
    let mut other = f.key.clone();
    other.session_id = "other".into();
    reserve_claim(&f.root, &other, "t-1", "c").unwrap();
    assert!(bind_task(
        &f.root,
        &other,
        "t-1",
        &|_| Ok(f.task.clone()),
        "c",
        0,
        None
    )
    .is_err());
    std::fs::remove_file(f.root.join(binding_name(&f.key, "t-1").unwrap())).unwrap();
    assert!(bind_task(
        &f.root,
        &other,
        "t-1",
        &|_| Ok(f.task.clone()),
        "c",
        0,
        None
    )
    .is_err());
}
#[test]
fn legacy_4096_references_still_checkpoint_retire_but_cannot_admit_claim_or_work() {
    let f = Fixture::new();
    f.bind();
    reserve_claim(&f.root, &f.key, "t-1", "delayed-claim").unwrap();
    update_receipt(
        &f.root,
        &f.key,
        &|r| {
            let mut r = r.clone();
            r.seen_event_ids
                .extend((1..4096).map(|n| format!("legacy-{n}")));
            Ok(r)
        },
        "t-1",
        1,
        None,
    )
    .unwrap();
    let before = load_receipt(&f.root, &f.key).unwrap();
    assert!(mark_work(&f.root, &f.key, "too-many", "t-1", 1).is_err());
    assert!(bind_task(
        &f.root,
        &f.key,
        "t-1",
        &|_| Ok(f.task.clone()),
        "delayed-claim",
        1,
        None
    )
    .is_err());
    assert_eq!(load_receipt(&f.root, &f.key).unwrap(), before);
    let r = f.checkpoint("append");
    assert_eq!(r.seen_event_ids.len(), 4097);
    let retired = f.retire("release", "waiting");
    assert_eq!(retired.seen_event_ids.len(), 4098);
}
#[test]
fn duplicate_work_and_terminal_updates_cannot_authorize_new_work() {
    let f = Fixture::new();
    f.bind();
    let once = mark_work(&f.root, &f.key, "work", "t-1", 1).unwrap();
    assert_eq!(mark_work(&f.root, &f.key, "work", "t-1", 1).unwrap(), once);
    let mut done = f.task.clone();
    done.status = "done".into();
    done.claimed_by = None;
    let result = update_receipt(
        &f.root,
        &f.key,
        &|r| {
            let mut r = r.clone();
            r.phase = "completed".into();
            Ok(r)
        },
        "t-1",
        1,
        Some(&|_| Ok(done.clone())),
    )
    .unwrap();
    assert!(!result.retired);
    assert!(reconcile_binding(&f.root, &f.key, &|_| Ok(done.clone()), None, "t-1", 1).is_err());
}
#[test]
fn binding_counter_exhaustion_returns_error_without_panicking() {
    let f = Fixture::new();
    let mut r = f.bind();
    r.revision = u64::MAX;
    persist(&Store::open(&f.root).unwrap(), &r).unwrap();
    reserve_claim(&f.root, &f.key, "t-1", "next-claim").unwrap();
    assert!(bind_task(
        &f.root,
        &f.key,
        "t-1",
        &|_| Ok(f.task.clone()),
        "next-claim",
        1,
        None
    )
    .is_err());
}
#[test]
fn descriptor_anchored_writes_survive_parent_replacement() {
    let f = Fixture::new();
    let s = Store::open(&f.root).unwrap();
    let moved = f.root.with_file_name("moved");
    std::fs::rename(&f.root, &moved).unwrap();
    let outside = f.task.project.join("outside");
    std::fs::create_dir(&outside).unwrap();
    symlink(&outside, &f.root).unwrap();
    s.write("record.json", &json!({"version":1})).unwrap();
    assert!(moved.join("record.json").is_file());
    assert!(!outside.join("record.json").exists());
}
#[test]
fn bounded_reads_and_linked_locks_refuse_unsafe_files() {
    let f = Fixture::new();
    let s = Store::open(&f.root).unwrap();
    std::fs::write(f.root.join("large.json"), vec![b' '; 1024 * 1024 + 1]).unwrap();
    assert!(s.read::<serde_json::Value>("large.json").is_err());
    let lock = s.lock("lock-linked").unwrap();
    drop(lock);
    std::fs::hard_link(
        f.root.join("lock-linked"),
        f.task.project.join("lock-alias"),
    )
    .unwrap();
    assert!(s.lock("lock-linked").is_err());
    assert!(s
        .read::<serde_json::Value>("absent.json")
        .unwrap()
        .is_none());
}
#[test]
fn invalid_initial_claim_evidence_cannot_create_receipt() {
    for field in [
        "task",
        "vault",
        "open",
        "done",
        "cancelled",
        "foreign",
        "unclaimed",
    ] {
        let f = Fixture::new();
        reserve_claim(&f.root, &f.key, "t-1", "claim").unwrap();
        let mut e = f.task.clone();
        match field {
            "task" => e.task_id = "t-wrong".into(),
            "vault" => e.vault = f.task.project.clone(),
            "open" | "done" | "cancelled" => e.status = field.into(),
            "foreign" => e.claimed_by = Some("other".into()),
            _ => e.claimed_by = None,
        }
        assert!(bind_task(&f.root, &f.key, "t-1", &|_| Ok(e.clone()), "claim", 0, None).is_err());
        assert!(load_receipt(&f.root, &f.key).unwrap().is_none());
    }
}
#[test]
fn fresh_generation_partial_session_marker_recovers_and_rejects_delayed_precalls() {
    let f = Fixture::new();
    f.bind();
    f.checkpoint("append");
    f.retire("release", "waiting");
    reserve_claim(&f.root, &f.key, "t-2", "next").unwrap();
    let rp = f.root.join(receipt_name(&f.key).unwrap());
    let mut task = f.task.clone();
    task.task_id = "t-2".into();
    assert!(bind_task(
        &f.root,
        &f.key,
        "t-2",
        &|_| {
            std::fs::remove_file(&rp).unwrap();
            std::fs::create_dir(&rp).unwrap();
            Ok(task.clone())
        },
        "next",
        1,
        None
    )
    .is_err());
    std::fs::remove_dir(&rp).unwrap();
    let current = load_receipt(&f.root, &f.key).unwrap().unwrap();
    assert_eq!(current.generation, 2);
    assert_eq!(current.task_id, "t-2");
    recover_receipt(&f.root, &f.key, "t-2", 2).unwrap();
    assert!(reserve_call(
        &f.root,
        &f.key,
        "t-1",
        "append",
        "append",
        Some(text_digest("checkpoint")),
        Some(0),
        Some(1)
    )
    .is_err());
    assert!(reserve_call(
        &f.root,
        &f.key,
        "t-2",
        "append",
        "append",
        Some(text_digest("checkpoint")),
        Some(0),
        Some(2)
    )
    .is_err());
}
#[test]
fn malformed_json_and_numeric_edges_are_rejected_without_coercion() {
    for raw in [
        "{",
        r#"{"a":1,"\u0061":2}"#,
        r#"[true,]"#,
        r#"{"a":1,}"#,
        r#""\q""#,
        "01",
        "NaN",
        "1e999",
        "null false",
    ] {
        assert!(super::super::json::strict_json(raw).is_err(), "{raw}");
    }
    for (raw, expected) in [
        ("0.0001", "0.0001"),
        ("0.00001", "1e-05"),
        ("1000000000000000.0", "1000000000000000.0"),
        ("10000000000000000.0", "1e+16"),
        ("-0.0", "-0.0"),
        ("2.2250738585072014e-308", "2.2250738585072014e-308"),
    ] {
        assert_eq!(
            canonical_json(&super::super::json::strict_json(raw).unwrap()).unwrap(),
            expected
        );
    }
}
#[test]
fn partial_update_keeps_original_receipt_and_reconciles_newer_binding() {
    let f = Fixture::new();
    let original = f.bind();
    let rp = f.root.join(receipt_name(&f.key).unwrap());
    let alias = f.task.project.join("receipt-alias");
    let bytes = std::fs::read(&rp).unwrap();
    let result = update_receipt(
        &f.root,
        &f.key,
        &|r| {
            std::fs::hard_link(&rp, &alias).unwrap();
            let mut n = r.clone();
            n.work_sequence = 1;
            Ok(n)
        },
        "t-1",
        1,
        None,
    );
    assert!(result.is_err());
    assert_eq!(std::fs::read(&rp).unwrap(), bytes);
    std::fs::remove_file(alias).unwrap();
    let recovered =
        reconcile_binding(&f.root, &f.key, &|_| Ok(f.task.clone()), None, "t-1", 1).unwrap();
    assert_eq!(recovered.work_sequence, 1);
    assert!(recovered.revision > original.revision);
    assert_eq!(load_receipt(&f.root, &f.key).unwrap(), Some(recovered));
}
#[test]
fn retirement_tombstone_wins_failed_binding_marker_publication() {
    let f = Fixture::new();
    f.bind();
    f.checkpoint("append");
    let bp = f.root.join(binding_name(&f.key, "t-1").unwrap());
    let alias = f.task.project.join("binding-alias");
    let mut task = f.task.clone();
    task.status = "open".into();
    task.claimed_by = None;
    assert!(retire_binding(
        &f.root,
        &f.key,
        "t-1",
        &|_| {
            std::fs::hard_link(&bp, &alias).unwrap();
            Ok(RetirementEvidence {
                task: task.clone(),
                lifecycle_call: "release".into(),
                checkpoint_call: "append".into(),
                outcome: "waiting".into(),
            })
        },
        1
    )
    .is_err());
    std::fs::remove_file(alias).unwrap();
    let r = load_receipt(&f.root, &f.key).unwrap().unwrap();
    assert!(r.retired);
    recover_receipt(&f.root, &f.key, "t-1", 1).unwrap();
    assert!(
        read(
            &Store::open(&f.root).unwrap(),
            &binding_name(&f.key, "t-1").unwrap()
        )
        .unwrap()
        .unwrap()
        .retired
    );
}
#[test]
fn unicode_session_identity_hash_matches_static_version_one_golden() {
    let key = SessionKey {
        vault: PathBuf::from("/private/tmp/é"),
        host: "codex".into(),
        session_id: "s-😀".into(),
        delegated_agent_id: Some("子".into()),
    };
    let encoded = canonical_json(&serde_json::to_value(&key).unwrap()).unwrap();
    assert_eq!(
        encoded,
        r#"{"delegated_agent_id":"\u5b50","host":"codex","session_id":"s-\ud83d\ude00","vault":"/private/tmp/\u00e9"}"#
    );
    assert_eq!(
        sid(&key).unwrap(),
        "b0c2da9d66b8e1f71beb1100e18f5894fb389a727f34e4fe847a54c64b318335"
    );
    assert!(tool_input_sha256(&json!([])).is_err());
}
