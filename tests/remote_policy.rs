//! Remote authorization exercises the real shared dispatcher and on-disk domain verbs.
use serde_json::{json, Value};
use shards::{
    config::{self, Config},
    ctx::CallCtx,
    mcp::{
        remote::{Principal, RemoteMember},
        tools::Server,
        TOOL_NAMES,
    },
};
use std::sync::Arc;

fn members() -> Vec<RemoteMember> {
    vec![
        RemoteMember {
            id: "alice".into(),
            kind: "human".into(),
            sponsor: None,
        },
        RemoteMember {
            id: "bob".into(),
            kind: "human".into(),
            sponsor: None,
        },
        RemoteMember {
            id: "worker".into(),
            kind: "agent".into(),
            sponsor: Some("alice".into()),
        },
    ]
}
fn principal(actor: &str, scopes: &[&str]) -> Principal {
    Principal::new(
        actor,
        &scopes.iter().map(|s| s.to_string()).collect::<Vec<_>>(),
        &members(),
    )
    .unwrap()
}
fn all_scopes() -> Vec<&'static str> {
    vec![
        "notes:write",
        "tasks:write",
        "memories:write",
        "scratch:write",
        "assets:write",
    ]
}
fn cfg(root: &std::path::Path) -> Config {
    config::from_table(&format!("[core]\nvault_path = {:?}\nagent = 'alice'\n[tasks]\ncollections = ['alice','bob','worker']\n",root.to_str().unwrap()).parse().unwrap(),None).unwrap()
}
fn context(cfg: &Config, actor: &str, scopes: &[&str]) -> CallCtx {
    CallCtx {
        cfg: Arc::new(cfg.clone()),
        principal: Some(principal(actor, scopes)),
    }
}
fn server() -> Server {
    Server::new(Some("/definitely/absent.toml".into()), None)
}
fn local(cfg: &Config, name: &str, args: Value) -> Value {
    server().call_with(cfg.clone(), name, &args).unwrap().value
}
fn remote(
    cfg: &Config,
    actor: &str,
    scopes: &[&str],
    name: &str,
    args: Value,
) -> shards::error::Result<Value> {
    server()
        .call_in(&context(cfg, actor, scopes), name, &args)
        .map(|v| v.value)
}
fn seed(cfg: &Config) -> (String, String, String, String) {
    let n = local(
        cfg,
        "shards_note_new",
        json!({"title":"Project","note_type":"project","body":"needle /Users/keep-this-user-body"}),
    )["id"]
        .as_str()
        .unwrap()
        .to_string();
    let t = local(
        cfg,
        "shards_task_new",
        json!({"title":"Task","owner":"alice","project":n}),
    )["id"]
        .as_str()
        .unwrap()
        .to_string();
    let m = local(
        cfg,
        "shards_memory_new",
        json!({"title":"Memory","body":"needle","owner":"alice"}),
    )["id"]
        .as_str()
        .unwrap()
        .to_string();
    local(
        cfg,
        "shards_scratch_set",
        json!({"name":"state","body":"needle"}),
    );
    let a = "a-ABCD".to_string();
    std::fs::create_dir_all(cfg.root(shards::spaces::Space::Assets).unwrap()).unwrap();
    std::fs::write(cfg.root(shards::spaces::Space::Assets).unwrap().join(format!("{a}.md")),format!("---\nid: {a}\ntype: asset\ntitle: Asset\nmedia_type: text/plain\ncreated: 2026-10-30T00:00:00Z\nupdated: 2026-10-30T00:00:00Z\nfilename: a.txt\nsha256: hash\nbytes: 1\nblob: a.txt\n---\n\nasset\n")).unwrap();
    (n, t, m, a)
}
#[test]
fn all_39_tools_have_positive_and_negative_scope_execution() {
    for name in TOOL_NAMES.into_iter().filter(|n| *n != "shards_note_adopt") {
        let dir = tempfile::tempdir().unwrap();
        let cfg = cfg(dir.path());
        let (n, t, m, a) = seed(&cfg);
        let blocker = local(&cfg, "shards_task_new", json!({"title":"Blocker"}))["id"]
            .as_str()
            .unwrap()
            .to_string();
        let args = match name {
            "shards_note_get" => json!({"id":n}),
            "shards_note_list" => json!({}),
            "shards_task_get" => json!({"id":t}),
            "shards_task_list" => json!({}),
            "shards_search" => json!({"query":"needle","engine":"builtin"}),
            "shards_health" => json!({}),
            "shards_recent_activity" | "shards_session_start" => json!({}),
            "shards_build_context" | "shards_graph" => json!({"seed_id":n}),
            "shards_project" => json!({"project_id":n}),
            "shards_note_new" => json!({"title":"New note"}),
            "shards_task_new" => json!({"title":"New task","owner":"bob"}),
            "shards_note_append" | "shards_memory_append" => {
                json!({"target":if name.contains("memory"){&m}else{&n},"text":"append"})
            }
            "shards_task_append" => json!({"task_id":t,"text":"append"}),
            "shards_note_update" => json!({"target":n,"tags":"x"}),
            "shards_note_claim" | "shards_note_release" => json!({"target":n}),
            "shards_task_claim"
            | "shards_task_release"
            | "shards_task_finish"
            | "shards_task_cancel" => json!({"task_id":t}),
            "shards_task_update" => json!({"task_id":t,"owner":"bob"}),
            "shards_memory_new" => json!({"title":"New memory"}),
            "shards_memory_update" => json!({"target":m,"importance":4}),
            "shards_memory_get" => json!({"target":m}),
            "shards_memory_list" => json!({}),
            "shards_memory_recall" => json!({"query":"needle","threshold":0}),
            "shards_scratch_set" => json!({"name":"state","body":"new"}),
            "shards_scratch_append" => json!({"name":"state","text":"more"}),
            "shards_scratch_get" => json!({"name":"state"}),
            "shards_scratch_list" => json!({"all_agents":true}),
            "shards_asset_get" => json!({"asset_id":a}),
            "shards_asset_list" => json!({}),
            "shards_asset_attach" => json!({"asset_id":a,"target":n}),
            "shards_task_block" => json!({"task_id":t,"on":[blocker]}),
            "shards_task_unblock" => json!({"task_id":t,"all":true}),
            "shards_task_next" => json!({}),
            _ => panic!("uncovered {name}"),
        };
        if name.ends_with("_release") {
            local(
                &cfg,
                if name.contains("note") {
                    "shards_note_claim"
                } else {
                    "shards_task_claim"
                },
                args.clone(),
            );
        }
        // Health is available to any authenticated principal; other tools require readable or writable spaces.
        if name != "shards_health" {
            assert!(
                remote(&cfg, "alice", &[], name, args.clone()).is_err(),
                "negative {name}"
            );
        }
        let result = remote(&cfg, "alice", &all_scopes(), name, args);
        assert!(result.is_ok(), "positive {name}: {result:?}");
    }
}
#[test]
fn discovery_is_complete_and_guessed_forbidden_tools_fail_closed() {
    let full = principal("alice", &all_scopes());
    let names = full.tools();
    assert_eq!(names.len(), 39);
    let dir = tempfile::tempdir().unwrap();
    let cfg = cfg(dir.path());
    for name in [
        "shards_note_adopt",
        "host_task_delete",
        "shards_note_delete",
        "shards_config_set",
        "shards_fake",
    ] {
        assert!(
            remote(&cfg, "alice", &all_scopes(), name, json!({})).is_err(),
            "{name}"
        );
    }
    assert_eq!(
        principal("alice", &["notes:read"])
            .tools()
            .iter()
            .filter(|t| t["name"] == "shards_note_new")
            .count(),
        0
    );
}
#[test]
fn invalid_members_scopes_sponsors_and_config_identities_are_rejected() {
    assert!(Principal::new("ghost", &[], &members()).is_err());
    assert!(Principal::new("alice", &["notes:admin".into()], &members()).is_err());
    let mut invalid = members();
    invalid[2].sponsor = Some("worker".into());
    assert!(Principal::new("worker", &[], &invalid).is_err());
    let dir = tempfile::tempdir().unwrap();
    let mut cfg = cfg(dir.path());
    cfg.tasks.collections = vec!["bob".into()];
    assert!(remote(
        &cfg,
        "alice",
        &all_scopes(),
        "shards_note_new",
        json!({"title":"Denied"})
    )
    .is_err());
}
#[test]
fn acting_identity_is_immutable_while_task_assignment_is_independent() {
    let dir = tempfile::tempdir().unwrap();
    let cfg = cfg(dir.path());
    let (n, t, _, _) = seed(&cfg);
    for (name, args) in [
        ("shards_note_claim", json!({"target":n,"claimer":"bob"})),
        ("shards_task_claim", json!({"task_id":t,"claimer":"bob"})),
        ("shards_note_release", json!({"target":n,"owner":"bob"})),
        ("shards_session_start", json!({"owner":"bob"})),
        (
            "shards_scratch_set",
            json!({"agent":"bob","name":"x","body":"bad"}),
        ),
    ] {
        assert!(
            remote(&cfg, "alice", &all_scopes(), name, args)
                .unwrap_err()
                .to_string()
                .contains("identity_mismatch"),
            "{name}"
        );
    }
    let created = remote(
        &cfg,
        "worker",
        &["tasks:write"],
        "shards_task_new",
        json!({"title":"Delegated","owner":"bob"}),
    )
    .unwrap();
    assert_eq!(created["owner"], "bob");
    let claim = remote(
        &cfg,
        "worker",
        &["tasks:write"],
        "shards_task_claim",
        json!({"task_id":t}),
    )
    .unwrap();
    assert_eq!(claim["claimed_by"], "worker");
    assert_eq!(cfg.agent(), Some("alice"));
}
#[test]
fn private_memories_filter_before_limit_recall_and_candidates() {
    let dir = tempfile::tempdir().unwrap();
    let cfg = cfg(dir.path());
    let hidden = local(
        &cfg,
        "shards_memory_new",
        json!({"title":"AAA secret","body":"needle needle needle","scope":"private","owner":"bob"}),
    )["id"]
        .as_str()
        .unwrap()
        .to_string();
    let visible = local(
        &cfg,
        "shards_memory_new",
        json!({"title":"ZZZ visible","body":"needle","scope":"private","owner":"worker"}),
    )["id"]
        .as_str()
        .unwrap()
        .to_string();
    let list = remote(
        &cfg,
        "alice",
        &["memories:read"],
        "shards_memory_list",
        json!({"sort":"title","limit":1}),
    )
    .unwrap();
    assert_eq!(list[0]["id"], visible);
    let recall = remote(
        &cfg,
        "alice",
        &["memories:read"],
        "shards_memory_recall",
        json!({"query":"needle","limit":1,"threshold":0}),
    )
    .unwrap();
    assert_eq!(recall[0]["id"], visible);
    for name in [
        "shards_memory_get",
        "shards_memory_append",
        "shards_memory_update",
    ] {
        let err = remote(
            &cfg,
            "alice",
            &["memories:write"],
            name,
            json!({"target":hidden,"text":"bad","importance":1}),
        )
        .unwrap_err();
        assert!(!err.to_string().contains("AAA secret"));
    }
    assert!(remote(
        &cfg,
        "bob",
        &["memories:read"],
        "shards_memory_get",
        json!({"target":hidden})
    )
    .is_ok());
    assert!(remote(
        &cfg,
        "worker",
        &["memories:write"],
        "shards_memory_update",
        json!({"target":visible,"owner":"bob"})
    )
    .is_err());
}
#[test]
fn scratch_all_agents_preserves_sponsor_and_namespace_boundaries() {
    let dir = tempfile::tempdir().unwrap();
    let cfg = cfg(dir.path());
    for who in ["alice", "bob", "worker"] {
        local(
            &cfg,
            "shards_scratch_set",
            json!({"agent":who,"name":"state","body":who}),
        );
    }
    let list = remote(
        &cfg,
        "alice",
        &["scratch:read"],
        "shards_scratch_list",
        json!({"all_agents":true}),
    )
    .unwrap();
    assert_eq!(list.as_array().unwrap().len(), 2);
    assert!(!list.to_string().contains("bob"));
    assert!(remote(
        &cfg,
        "alice",
        &["scratch:read"],
        "shards_scratch_get",
        json!({"agent":"worker","name":"state"})
    )
    .is_ok());
    assert!(remote(
        &cfg,
        "worker",
        &["scratch:read"],
        "shards_scratch_get",
        json!({"agent":"alice","name":"state"})
    )
    .is_err());
}
#[test]
fn remote_paths_are_relative_and_user_bodies_remain_untouched() {
    let dir = tempfile::tempdir().unwrap();
    let cfg = cfg(dir.path());
    let (n, _, _, _) = seed(&cfg);
    let value = remote(
        &cfg,
        "alice",
        &["notes:read"],
        "shards_note_get",
        json!({"id":n}),
    )
    .unwrap();
    assert!(!value["path"].as_str().unwrap().starts_with('/'));
    assert_eq!(value["space"], "notes");
    assert!(value["body"]
        .as_str()
        .unwrap()
        .contains("/Users/keep-this-user-body"));
    let health = remote(&cfg, "alice", &[], "shards_health", json!({})).unwrap();
    assert!(!health.to_string().contains(cfg.vault().to_str().unwrap()));
}
#[test]
fn asset_attach_requires_both_writable_spaces_before_mutation() {
    let dir = tempfile::tempdir().unwrap();
    let cfg = cfg(dir.path());
    let (n, _, _, a) = seed(&cfg);
    let before = local(&cfg, "shards_note_get", json!({"id":n}));
    assert!(remote(
        &cfg,
        "alice",
        &["assets:write", "notes:read"],
        "shards_asset_attach",
        json!({"asset_id":a,"target":n})
    )
    .is_err());
    assert_eq!(local(&cfg, "shards_note_get", json!({"id":n})), before);
}
#[test]
fn identity_refusal_has_its_own_structured_error_kind() {
    let dir = tempfile::tempdir().unwrap();
    let cfg = cfg(dir.path());
    let (n, _, _, _) = seed(&cfg);
    let error = remote(
        &cfg,
        "alice",
        &["notes:write"],
        "shards_note_claim",
        json!({"target":n,"claimer":"bob"}),
    )
    .unwrap_err();
    let envelope = shards::cli::out::error_envelope(&error);
    assert_eq!(envelope["kind"], "identity_mismatch");
}
#[test]
fn metadata_redaction_preserves_authored_nested_objects_and_mutation_fields() {
    let dir = tempfile::tempdir().unwrap();
    let cfg = cfg(dir.path());
    let (n, _, _, _) = seed(&cfg);
    let path = std::path::PathBuf::from(
        local(&cfg, "shards_note_get", json!({"id":n}))["path"]
            .as_str()
            .unwrap(),
    );
    let raw = std::fs::read_to_string(&path).unwrap();
    let extra="custom:\n  path: /Users/authored/path\n  project: n-authored\n  related: [m-authored]\npath: /Users/authored-top-level\n";
    std::fs::write(&path, raw.replacen("---\n", &format!("---\n{extra}"), 1)).unwrap();
    let get = remote(
        &cfg,
        "alice",
        &["notes:write"],
        "shards_note_get",
        json!({"id":n}),
    )
    .unwrap();
    assert_eq!(
        get["custom"],
        json!({"path":"/Users/authored/path","project":"n-authored","related":["m-authored"]})
    );
    let update = remote(
        &cfg,
        "alice",
        &["notes:write"],
        "shards_note_update",
        json!({"target":n,"tags":"x"}),
    )
    .unwrap();
    assert_eq!(update["path"], "/Users/authored-top-level");
}
#[test]
fn graph_context_search_activity_and_project_exclude_unreadable_entities() {
    let dir = tempfile::tempdir().unwrap();
    let cfg = cfg(dir.path());
    let (n, t, _, _) = seed(&cfg);
    let hidden=local(&cfg,"shards_memory_new",json!({"title":"Secret Project Knowledge","scope":"private","owner":"bob","body":"needle","project":n}))["id"].as_str().unwrap().to_string();
    let path = std::path::PathBuf::from(
        local(&cfg, "shards_note_get", json!({"id":n}))["path"]
            .as_str()
            .unwrap(),
    );
    let raw = std::fs::read_to_string(&path).unwrap();
    std::fs::write(
        &path,
        raw.replace("related: []", &format!("related: [{hidden}, {t}]")),
    )
    .unwrap();
    for (name, args) in [
        ("shards_graph", json!({"seed_id":n,"depth":3})),
        ("shards_build_context", json!({"seed_id":n,"depth":3})),
        ("shards_project", json!({"project_id":n})),
        (
            "shards_search",
            json!({"query":"needle","spaces":["notes","tasks","memories"],"limit":1,"threshold":0,"engine":"indexed"}),
        ),
        ("shards_recent_activity", json!({"limit":1})),
        ("shards_session_start", json!({"team":true})),
    ] {
        let result = remote(&cfg, "alice", &["notes:read"], name, args).unwrap();
        let wire = result.to_string();
        assert!(!wire.contains(&hidden), "{name}: {wire}");
        assert!(!wire.contains(&t), "{name}: {wire}");
        assert!(!wire.contains("Secret Project Knowledge"), "{name}");
    }
}
#[test]
fn full_graph_readiness_keeps_unreadable_missing_blocker_references_private() {
    let dir = tempfile::tempdir().unwrap();
    let cfg = cfg(dir.path());
    let (_, t, _, _) = seed(&cfg);
    let blocker = local(&cfg, "shards_task_new", json!({"title":"Blocker"}))["id"]
        .as_str()
        .unwrap()
        .to_string();
    local(
        &cfg,
        "shards_task_block",
        json!({"task_id":t,"on":[blocker]}),
    );
    let value = remote(
        &cfg,
        "alice",
        &["tasks:write"],
        "shards_task_get",
        json!({"id":t}),
    )
    .unwrap();
    assert_eq!(value["ready"], false);
    let error = remote(
        &cfg,
        "alice",
        &["tasks:write"],
        "shards_task_claim",
        json!({"task_id":t,"strict":false}),
    )
    .unwrap_err();
    assert_eq!(error.kind(), "blocked");
    assert!(!error.to_string().contains(&blocker));
    let next = remote(
        &cfg,
        "alice",
        &["tasks:write"],
        "shards_task_next",
        json!({}),
    )
    .unwrap();
    assert_eq!(next["id"], blocker);
}
#[test]
fn concurrent_calls_keep_actor_and_private_data_separate() {
    let dir = tempfile::tempdir().unwrap();
    let cfg = cfg(dir.path());
    let barrier = Arc::new(std::sync::Barrier::new(2));
    let handles: Vec<_> = ["alice", "bob"]
        .into_iter()
        .map(|actor| {
            let cfg = cfg.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                for i in 0..8 {
                    let value = remote(
                        &cfg,
                        actor,
                        &["memories:write"],
                        "shards_memory_new",
                        json!({"title":format!("{actor}-{i}"),"scope":"private","body":actor}),
                    )
                    .unwrap();
                    assert_eq!(value["owner"], actor);
                }
                let values = remote(
                    &cfg,
                    actor,
                    &["memories:read"],
                    "shards_memory_list",
                    json!({"limit":-1}),
                )
                .unwrap();
                assert_eq!(values.as_array().unwrap().len(), 8);
                assert!(values
                    .as_array()
                    .unwrap()
                    .iter()
                    .all(|v| v["owner"] == actor));
            })
        })
        .collect();
    for handle in handles {
        handle.join().unwrap();
    }
    assert_eq!(cfg.agent(), Some("alice"));
}
#[test]
fn force_release_is_limited_to_sponsored_claims() {
    let dir = tempfile::tempdir().unwrap();
    let cfg = cfg(dir.path());
    let (n, _, _, _) = seed(&cfg);
    local(
        &cfg,
        "shards_note_claim",
        json!({"target":n,"claimer":"bob"}),
    );
    assert!(remote(
        &cfg,
        "alice",
        &["notes:write"],
        "shards_note_release",
        json!({"target":n,"force":true})
    )
    .is_err());
    local(
        &cfg,
        "shards_note_release",
        json!({"target":n,"owner":"bob"}),
    );
    local(
        &cfg,
        "shards_note_claim",
        json!({"target":n,"claimer":"worker"}),
    );
    assert!(remote(
        &cfg,
        "alice",
        &["notes:write"],
        "shards_note_release",
        json!({"target":n,"force":true})
    )
    .is_ok());
}
#[test]
fn remote_instructions_describe_authority_without_host_configuration() {
    let text = principal("worker", &["notes:read"]).instructions();
    assert!(text.contains("verified grant"));
    assert!(text.contains("worker"));
    assert!(text.contains("local Rust"));
    for absent in [
        "/Users/",
        "vault_path",
        "collections",
        "not a security boundary",
        "bob",
        "alice",
    ] {
        assert!(!text.contains(absent), "{absent}: {text}");
    }
}
#[test]
fn scope_discovery_requires_usable_corpus_and_project_seed_authority() {
    let tools = principal("worker", &["scratch:read"]).tools();
    let names: Vec<_> = tools.iter().map(|t| t["name"].as_str().unwrap()).collect();
    assert!(!names.contains(&"shards_project"));
    assert!(!names.contains(&"shards_recent_activity"));
    assert!(!names.contains(&"shards_session_start"));
    assert!(!names.contains(&"shards_graph"));
    assert!(names.contains(&"shards_search"));
    assert!(names.contains(&"shards_scratch_get"));
    assert!(names.contains(&"shards_health"));
}
#[test]
fn asset_attachment_discovery_requires_a_writable_target_space() {
    let tools = principal("alice", &["assets:write"]).tools();
    assert!(!tools.iter().any(|t| t["name"] == "shards_asset_attach"));
    let tools = principal("alice", &["assets:write", "memories:write"]).tools();
    assert!(tools.iter().any(|t| t["name"] == "shards_asset_attach"));
}
#[test]
fn scratch_namespace_uses_resolved_path_for_symlink_reads() {
    let dir = tempfile::tempdir().unwrap();
    let cfg = cfg(dir.path());
    local(
        &cfg,
        "shards_scratch_set",
        json!({"agent":"alice","name":"own","body":"own"}),
    );
    local(
        &cfg,
        "shards_scratch_set",
        json!({"agent":"bob","name":"hidden","body":"secret-bob-body"}),
    );
    let root = cfg.root(shards::spaces::Space::Scratch).unwrap();
    std::os::unix::fs::symlink(root.join("bob/hidden.md"), root.join("alice/alias.md")).unwrap();
    assert!(remote(
        &cfg,
        "alice",
        &["scratch:read"],
        "shards_scratch_get",
        json!({"name":"alias"})
    )
    .is_err());
}
#[test]
fn relationship_redaction_uses_entity_family_for_all_note_type_labels() {
    let dir = tempfile::tempdir().unwrap();
    let cfg = cfg(dir.path());
    let hidden = local(
        &cfg,
        "shards_memory_new",
        json!({"title":"Secret","scope":"private","owner":"bob"}),
    )["id"]
        .as_str()
        .unwrap()
        .to_string();
    for kind in ["log", "decision", "reference", "opaque-adopted-label"] {
        let n = local(
            &cfg,
            "shards_note_new",
            json!({"title":kind,"body":format!("[[{hidden}]]")}),
        )["id"]
            .as_str()
            .unwrap()
            .to_string();
        let path = std::path::PathBuf::from(
            local(&cfg, "shards_note_get", json!({"id":n}))["path"]
                .as_str()
                .unwrap(),
        );
        let raw = std::fs::read_to_string(&path).unwrap();
        std::fs::write(&path, raw.replace("type: note", &format!("type: {kind}"))).unwrap();
        let value = remote(
            &cfg,
            "alice",
            &["notes:read"],
            "shards_note_get",
            json!({"id":n}),
        )
        .unwrap();
        assert_eq!(value["related"], json!([]), "{kind}");
        assert_eq!(value["type"], kind);
    }
}
#[test]
fn task_finish_preserves_authored_warning_metadata_without_generated_diagnostics() {
    let dir = tempfile::tempdir().unwrap();
    let cfg = cfg(dir.path());
    let (_, t, _, _) = seed(&cfg);
    let path = std::path::PathBuf::from(
        local(&cfg, "shards_task_get", json!({"id":t}))["path"]
            .as_str()
            .unwrap(),
    );
    let raw = std::fs::read_to_string(&path).unwrap();
    std::fs::write(
        &path,
        raw.replacen("---\n", "---\nwarnings: [authored-value]\n", 1),
    )
    .unwrap();
    let value = remote(
        &cfg,
        "alice",
        &["tasks:write"],
        "shards_task_finish",
        json!({"task_id":t}),
    )
    .unwrap();
    assert_eq!(value["warnings"], json!(["authored-value"]));
}
#[test]
fn full_graph_readiness_uses_hidden_tasks_under_overlapping_roots() {
    let dir = tempfile::tempdir().unwrap();
    let mut cfg = cfg(dir.path());
    let blocker = local(&cfg, "shards_task_new", json!({"title":"Hidden blocker"}))["id"]
        .as_str()
        .unwrap()
        .to_string();
    let task = local(
        &cfg,
        "shards_task_new",
        json!({"title":"Visible target","blocked_by":[blocker]}),
    )["id"]
        .as_str()
        .unwrap()
        .to_string();
    let root = cfg
        .root(shards::spaces::Space::Tasks)
        .unwrap()
        .to_path_buf();
    std::fs::create_dir_all(root.join("done")).unwrap();
    std::fs::rename(
        root.join(format!("open/{task}.md")),
        root.join(format!("done/{task}.md")),
    )
    .unwrap();
    cfg.spaces = shards::spaces::Spaces::resolve(
        cfg.vault(),
        &[(
            shards::spaces::Space::Notes,
            shards::spaces::SpaceSetting::Path("tasks/open".into()),
        )],
    )
    .unwrap();
    let value = remote(
        &cfg,
        "alice",
        &["tasks:write"],
        "shards_task_get",
        json!({"id":task}),
    )
    .unwrap();
    assert_eq!(value["ready"], false);
    assert_eq!(value["blocked_by"], json!([]));
    let error = remote(
        &cfg,
        "alice",
        &["tasks:write"],
        "shards_task_claim",
        json!({"task_id":task}),
    )
    .unwrap_err();
    assert_eq!(error.kind(), "blocked");
    assert!(!error.to_string().contains(&blocker));
    let list = remote(
        &cfg,
        "alice",
        &["tasks:write"],
        "shards_task_list",
        json!({"ready":true}),
    )
    .unwrap();
    assert_eq!(list, json!([]));
    assert!(remote(
        &cfg,
        "alice",
        &["tasks:write"],
        "shards_task_next",
        json!({"claim":true})
    )
    .is_err());
}
#[test]
fn concurrent_memory_transitions_never_return_a_private_metadata_snapshot() {
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    let dir = tempfile::tempdir().unwrap();
    let cfg = cfg(dir.path());
    let id = local(
        &cfg,
        "shards_memory_new",
        json!({"title":"Transition","body":"needle","owner":"alice"}),
    )["id"]
        .as_str()
        .unwrap()
        .to_string();
    // More discovery work separates the authorization scan from the returned metadata read.
    for i in 0..12 {
        local(
            &cfg,
            "shards_memory_new",
            json!({"title":format!("Padding {i}"),"body":"x".repeat(4096)}),
        );
    }
    let path = std::path::PathBuf::from(
        local(&cfg, "shards_memory_get", json!({"target":id}))["path"]
            .as_str()
            .unwrap(),
    );
    let shared = std::fs::read_to_string(&path).unwrap();
    let private = shared
        .replace("owner: alice", "owner: bob")
        .replace("scope: shared", "scope: private");
    let stop = Arc::new(AtomicBool::new(false));
    let transitions = Arc::new(AtomicUsize::new(0));
    let gate = Arc::new(std::sync::Barrier::new(2));
    let handle = {
        let stop = stop.clone();
        let transitions = transitions.clone();
        let gate = gate.clone();
        std::thread::spawn(move || {
            gate.wait();
            while !stop.load(Ordering::Relaxed) {
                for body in [&private, &shared] {
                    shards::storage::atomic_write(&path, body).unwrap();
                    transitions.fetch_add(1, Ordering::Relaxed);
                }
            }
        })
    };
    gate.wait();
    let mut leaked = None;
    for _ in 0..80 {
        let values = remote(
            &cfg,
            "alice",
            &["memories:read"],
            "shards_memory_list",
            json!({"limit":-1}),
        )
        .unwrap();
        if values
            .as_array()
            .unwrap()
            .iter()
            .any(|v| v["scope"] == "private" && v["owner"] == "bob")
        {
            leaked = Some(values);
            break;
        }
    }
    stop.store(true, Ordering::Relaxed);
    handle.join().unwrap();
    assert!(transitions.load(Ordering::Relaxed) > 0);
    assert!(leaked.is_none(), "private returned snapshot: {leaked:?}");
}
#[test]
fn concurrent_full_search_never_reads_a_new_private_body_after_ranking() {
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    let dir = tempfile::tempdir().unwrap();
    let cfg = cfg(dir.path());
    let id = local(
        &cfg,
        "shards_memory_new",
        json!({"title":"Transition","body":"needle allowed","owner":"alice"}),
    )["id"]
        .as_str()
        .unwrap()
        .to_string();
    for i in 0..12 {
        local(
            &cfg,
            "shards_memory_new",
            json!({"title":format!("Padding {i}"),"body":format!("needle {}", "x".repeat(4096))}),
        );
    }
    let path = std::path::PathBuf::from(
        local(&cfg, "shards_memory_get", json!({"target":id}))["path"]
            .as_str()
            .unwrap(),
    );
    let shared = std::fs::read_to_string(&path).unwrap();
    let private = shared
        .replace("owner: alice", "owner: bob")
        .replace("scope: shared", "scope: private")
        .replace("needle allowed", "needle SECRET_BOB_BODY");
    let stop = Arc::new(AtomicBool::new(false));
    let transitions = Arc::new(AtomicUsize::new(0));
    let gate = Arc::new(std::sync::Barrier::new(2));
    let handle = {
        let stop = stop.clone();
        let transitions = transitions.clone();
        let gate = gate.clone();
        std::thread::spawn(move || {
            gate.wait();
            while !stop.load(Ordering::Relaxed) {
                for body in [&private, &shared] {
                    shards::storage::atomic_write(&path, body).unwrap();
                    transitions.fetch_add(1, Ordering::Relaxed);
                }
            }
        })
    };
    gate.wait();
    let mut leaked = false;
    for _ in 0..80 {
        for query in [true, false] {
            let mut args = json!({"spaces":["memories"],"full":true,"limit":-1,"threshold":0,"engine":"builtin"});
            if query {
                args["query"] = json!("needle");
            }
            let values = remote(&cfg, "alice", &["memories:read"], "shards_search", args).unwrap();
            if values.to_string().contains("SECRET_BOB_BODY") {
                leaked = true;
                break;
            }
        }
        if leaked {
            break;
        }
    }
    stop.store(true, Ordering::Relaxed);
    handle.join().unwrap();
    assert!(transitions.load(Ordering::Relaxed) > 0);
    assert!(
        !leaked,
        "a private body crossed the post-ranking full-body reread"
    );
}
#[test]
fn dependency_mirror_writes_require_authority_for_both_resolved_spaces() {
    let dir = tempfile::tempdir().unwrap();
    let mut cfg = cfg(dir.path());
    let blocker = local(&cfg, "shards_task_new", json!({"title":"Hidden blocker"}))["id"]
        .as_str()
        .unwrap()
        .to_string();
    let task = local(&cfg, "shards_task_new", json!({"title":"Visible target"}))["id"]
        .as_str()
        .unwrap()
        .to_string();
    let root = cfg
        .root(shards::spaces::Space::Tasks)
        .unwrap()
        .to_path_buf();
    std::fs::create_dir_all(root.join("done")).unwrap();
    std::fs::rename(
        root.join(format!("open/{task}.md")),
        root.join(format!("done/{task}.md")),
    )
    .unwrap();
    cfg.spaces = shards::spaces::Spaces::resolve(
        cfg.vault(),
        &[(
            shards::spaces::Space::Notes,
            shards::spaces::SpaceSetting::Path("tasks/open".into()),
        )],
    )
    .unwrap();
    let before = std::fs::read(root.join(format!("done/{task}.md"))).unwrap();
    for (name, args) in [
        ("shards_task_block", json!({"task_id":task,"on":[blocker]})),
        (
            "shards_task_update",
            json!({"task_id":task,"blocked_by":[blocker]}),
        ),
    ] {
        assert!(
            remote(&cfg, "alice", &["tasks:write"], name, args).is_err(),
            "{name}"
        );
        assert_eq!(
            std::fs::read(root.join(format!("done/{task}.md"))).unwrap(),
            before,
            "{name}"
        );
    }
    assert!(remote(
        &cfg,
        "alice",
        &["tasks:write", "notes:write"],
        "shards_task_block",
        json!({"task_id":task,"on":[blocker]})
    )
    .is_ok());
    let blocked = std::fs::read(root.join(format!("done/{task}.md"))).unwrap();
    assert!(remote(
        &cfg,
        "alice",
        &["tasks:write"],
        "shards_task_unblock",
        json!({"task_id":task,"all":true})
    )
    .is_err());
    assert_eq!(
        std::fs::read(root.join(format!("done/{task}.md"))).unwrap(),
        blocked
    );
}
#[test]
fn overlapping_roots_never_replace_private_memory_and_scratch_object_rules() {
    let dir = tempfile::tempdir().unwrap();
    let initial = cfg(dir.path());
    let mut cfg = initial.clone();
    let memory = local(
        &cfg,
        "shards_memory_new",
        json!({"title":"Private Bob","scope":"private","owner":"bob","body":"secret"}),
    )["id"]
        .as_str()
        .unwrap()
        .to_string();
    cfg.spaces = shards::spaces::Spaces::resolve(
        cfg.vault(),
        &[
            (
                shards::spaces::Space::Notes,
                shards::spaces::SpaceSetting::Path("memories".into()),
            ),
            (
                shards::spaces::Space::Memories,
                shards::spaces::SpaceSetting::Path(".".into()),
            ),
        ],
    )
    .unwrap();
    // The same existing m-* is now discovered below a nested notes root and the outer memory root.
    assert!(remote(
        &cfg,
        "alice",
        &["notes:read", "memories:read"],
        "shards_memory_get",
        json!({"target":memory})
    )
    .is_err());
    let mut cfg = initial;
    local(
        &cfg,
        "shards_scratch_set",
        json!({"agent":"bob","name":"hidden","body":"secret"}),
    );
    cfg.spaces = shards::spaces::Spaces::resolve(
        cfg.vault(),
        &[(
            shards::spaces::Space::Notes,
            shards::spaces::SpaceSetting::Path("scratch/bob".into()),
        )],
    )
    .unwrap();
    let list = remote(
        &cfg,
        "alice",
        &["notes:read", "scratch:read"],
        "shards_scratch_list",
        json!({"all_agents":true}),
    )
    .unwrap();
    assert_eq!(list, json!([]));
}
#[test]
fn foreign_markdown_in_memory_space_keeps_declared_private_visibility() {
    let dir = tempfile::tempdir().unwrap();
    let cfg = cfg(dir.path());
    let root = cfg.root(shards::spaces::Space::Memories).unwrap();
    std::fs::create_dir_all(root).unwrap();
    std::fs::write(
        root.join("foreign.md"),
        "---\ntitle: Foreign secret\nscope: private\nowner: bob\n---\n\nneedle secret\n",
    )
    .unwrap();
    let values = remote(
        &cfg,
        "alice",
        &["memories:read"],
        "shards_search",
        json!({"spaces":["memories"],"query":"needle","full":true,"threshold":0}),
    )
    .unwrap();
    assert_eq!(values, json!([]));
}

#[test]
fn remote_blank_owner_is_absent_before_verified_actor_authorization() {
    let dir = tempfile::tempdir().unwrap();
    let cfg = cfg(dir.path());
    for (index, blank) in ["", "   ", "\t"].into_iter().enumerate() {
        for name in ["shards_note_new", "shards_memory_new", "shards_task_new"] {
            let created = remote(
                &cfg,
                "worker",
                &all_scopes(),
                name,
                json!({"title":format!("{name} blank {index}"),"owner":blank}),
            )
            .unwrap();
            assert_eq!(created["owner"], "worker", "{name}: {blank:?}");
        }
    }
    let task = local(
        &cfg,
        "shards_task_new",
        json!({"title":"Assigned task","owner":"bob"}),
    );
    let updated = remote(
        &cfg,
        "worker",
        &all_scopes(),
        "shards_task_update",
        json!({"task_id":task["id"],"owner":"   ","priority":"high"}),
    )
    .unwrap();
    assert_eq!(
        updated["owner"], "bob",
        "blank update must preserve the assignee"
    );
    let notes = remote(
        &cfg,
        "worker",
        &all_scopes(),
        "shards_note_list",
        json!({"owner":"   "}),
    )
    .unwrap();
    assert_eq!(notes.as_array().unwrap().len(), 3);
    assert!(matches!(
        remote(
            &cfg,
            "worker",
            &all_scopes(),
            "shards_note_new",
            json!({"title":"Not a blank identity","owner":" worker "})
        ),
        Err(shards::error::ShardsError::IdentityMismatch)
    ));
}

#[test]
fn remote_search_body_helpers_reject_blank_filters_for_both_search_modes() {
    let dir = tempfile::tempdir().unwrap();
    let cfg = cfg(dir.path());
    local(
        &cfg,
        "shards_note_new",
        json!({"title":"Search fixture","body":"needle"}),
    );
    for full in [false, true] {
        for ranked in [false, true] {
            for field in ["type_filter", "kind"] {
                let mut args = json!({"spaces":["notes"],"full":full,"engine":"builtin"});
                args[field] = json!("   ");
                if ranked {
                    args["query"] = json!("needle");
                }
                let result = remote(&cfg, "alice", &["notes:read"], "shards_search", args);
                assert!(
                    matches!(result, Err(shards::error::ShardsError::Validation(_))),
                    "blank {field}, full={full}, ranked={ranked} must fail before returning data"
                );
            }
        }
    }
}
