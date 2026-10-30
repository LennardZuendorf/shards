use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
    Router,
};
use chrono::Utc;
use serde_json::{json, Value};
use shards_gateway::{
    config::LoadedGatewayConfig,
    grants::{self, *},
    http,
};
use std::{fs, os::unix::fs::PermissionsExt, path::PathBuf};
use tower::ServiceExt;

struct Fixture {
    _dir: tempfile::TempDir,
    core: PathBuf,
    config: LoadedGatewayConfig,
    app: Router,
    client: String,
    connector: String,
}
impl Fixture {
    fn new(scopes: &[&str]) -> Self {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).unwrap();
        let vault = root.join("vault");
        fs::create_dir(&vault).unwrap();
        let core = root.join("core.toml");
        fs::write(
            &core,
            format!(
                "[core]\nvault_path = {:?}\n[tasks]\ncollections = [\"bot\"]\n",
                vault.to_str().unwrap()
            ),
        )
        .unwrap();
        let registry = root.join("grants.json");
        fs::write(
            &registry,
            serde_json::to_vec(&GrantRegistry {
                schema_version: 1,
                vault_id: "fixture".into(),
                members: vec![Member {
                    id: "bot".into(),
                    kind: MemberKind::Agent,
                    sponsor: None,
                }],
                grants: vec![],
                connectors: vec![],
            })
            .unwrap(),
        )
        .unwrap();
        fs::set_permissions(&registry, fs::Permissions::from_mode(0o600)).unwrap();
        let config_path = root.join("gateway.toml");
        fs::write(&config_path, format!("vault_id = \"fixture\"\nvault_path = {:?}\ncore_config = {:?}\nexternal_origin = \"https://gateway.example.ts.net\"\ngrants_file = {:?}\n",vault.to_str().unwrap(),core.to_str().unwrap(),registry.to_str().unwrap())).unwrap();
        let config = LoadedGatewayConfig::load(&config_path).unwrap();
        let client = issue_grant(
            &config,
            "g",
            "bot",
            &scopes.iter().map(|s| s.to_string()).collect::<Vec<_>>(),
            "2099-01-01T00:00:00Z",
        )
        .unwrap();
        let connector = issue_connector(&config, "c", "2099-01-01T00:00:00Z").unwrap();
        let app = http::router(config.clone()).unwrap();
        Self {
            _dir: dir,
            core,
            config,
            app,
            client,
            connector,
        }
    }
    fn envelope(&self) -> Value {
        json!({"v":1,"request_id":"01234567-89ab-cdef-0123-456789abcdef","vault_id":"fixture","deadline_ms":Utc::now().timestamp_millis()+5000})
    }
    async fn send(
        &self,
        route: &str,
        body: Value,
        client: Option<&str>,
        host: &str,
        origin: Option<&str>,
    ) -> (StatusCode, Value, bool) {
        let mut request = Request::builder()
            .method("POST")
            .uri(route)
            .header("host", host)
            .header("content-type", "application/json")
            .header("x-shards-connector", &self.connector);
        if let Some(token) = client {
            request = request.header("authorization", format!("Bearer {token}"));
        }
        if let Some(origin) = origin {
            request = request.header("origin", origin);
        }
        let response = self
            .app
            .clone()
            .oneshot(request.body(Body::from(body.to_string())).unwrap())
            .await
            .unwrap();
        let status = response.status();
        let challenged = response.headers().contains_key("www-authenticate");
        let raw = to_bytes(response.into_body(), 32 * 1024 * 1024)
            .await
            .unwrap();
        (
            status,
            serde_json::from_slice(&raw).unwrap_or(Value::Null),
            challenged,
        )
    }
    async fn call(&self, name: &str, args: Value) -> (StatusCode, Value) {
        let mut body = self.envelope();
        body["tool"] = json!(name);
        body["arguments"] = args;
        let (s, v, _) = self
            .send(
                "/v1/call",
                body,
                Some(&self.client),
                "gateway.example.ts.net",
                None,
            )
            .await;
        (s, v)
    }
}

#[tokio::test]
async fn connector_probe_and_client_description_have_separate_authority() {
    let f = Fixture::new(&["notes:read"]);
    let (status, probe, _) = f
        .send(
            "/v1/probe",
            f.envelope(),
            None,
            "gateway.example.ts.net",
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(probe["vault_id"], "fixture");
    assert!(probe.get("tools").is_none());
    let (status, _, challenge) = f
        .send(
            "/v1/describe",
            f.envelope(),
            None,
            "gateway.example.ts.net",
            None,
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert!(challenge);
    let (status, description, _) = f
        .send(
            "/v1/describe",
            f.envelope(),
            Some(&f.client),
            "gateway.example.ts.net",
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let names = description["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v["name"].as_str().unwrap())
        .collect::<Vec<_>>();
    assert!(names.contains(&"shards_note_get"));
    assert!(!names.contains(&"shards_note_new"));
    assert!(!names.contains(&"shards_note_adopt"));
    assert!(!description
        .to_string()
        .contains(f.config.settings.vault_path.to_str().unwrap()));
}

#[tokio::test]
async fn real_core_writes_reads_lists_and_domain_errors_keep_canonical_envelopes() {
    let f = Fixture::new(&["notes:write"]);
    let (status, new) = f
        .call(
            "shards_note_new",
            json!({"title":"RPC synthetic note","body":"fixture body"}),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let id = new["mcp_result"]["structuredContent"]["id"]
        .as_str()
        .unwrap();
    let (_, get) = f.call("shards_note_get", json!({"id":id})).await;
    assert!(get["mcp_result"]["structuredContent"]["body"]
        .as_str()
        .unwrap()
        .contains("fixture body"));
    let (_, list) = f.call("shards_note_list", json!({})).await;
    assert_eq!(
        list["mcp_result"]["structuredContent"]["result"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert!(list["mcp_result"]["content"][0]["text"]
        .as_str()
        .unwrap()
        .starts_with('['));
    let (_, bad) = f.call("shards_note_get", json!({})).await;
    assert_eq!(bad["mcp_result"]["isError"], true);
    let error: Value =
        serde_json::from_str(bad["mcp_result"]["content"][0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(error["kind"], "validation");
}

#[tokio::test]
async fn revocation_and_wrong_origins_refuse_operations_before_dispatch() {
    let f = Fixture::new(&["notes:write"]);
    for (host, origin) in [
        ("attacker.example", None),
        ("gateway.example.ts.net", Some("https://attacker.example")),
        ("gateway.example.ts.net", Some("null")),
    ] {
        assert_eq!(
            f.send("/v1/describe", f.envelope(), Some(&f.client), host, origin)
                .await
                .0,
            StatusCode::FORBIDDEN
        );
    }
    grants::revoke_grant(&f.config, "g").unwrap();
    let (status, result) = f
        .call("shards_note_new", json!({"title":"must not exist"}))
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(result["error"]["execution"], "not_started");
    assert!(!f.config.settings.vault_path.join("notes").exists());
}

#[tokio::test]
async fn scope_denial_and_configuration_drift_fail_closed() {
    let f = Fixture::new(&["notes:read"]);
    assert_eq!(
        f.call("shards_note_new", json!({"title":"denied"})).await.0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        f.call("host_note_delete", json!({})).await.0,
        StatusCode::FORBIDDEN
    );
    fs::write(
        &f.core,
        format!("{}\n# drift\n", fs::read_to_string(&f.core).unwrap()),
    )
    .unwrap();
    assert_eq!(
        f.call("shards_note_list", json!({})).await.0,
        StatusCode::SERVICE_UNAVAILABLE
    );
}

#[tokio::test]
async fn known_request_deadline_failure_retains_correlation_and_never_writes() {
    let f = Fixture::new(&["notes:write"]);
    let mut body = f.envelope();
    body["deadline_ms"] = json!(0);
    body["tool"] = json!("shards_note_new");
    body["arguments"] = json!({"title":"must not exist"});
    let (status, result, _) = f
        .send(
            "/v1/call",
            body,
            Some(&f.client),
            "gateway.example.ts.net",
            None,
        )
        .await;
    assert_eq!(status, StatusCode::GATEWAY_TIMEOUT);
    assert_eq!(result["request_id"], "01234567-89ab-cdef-0123-456789abcdef");
    assert_eq!(result["error"]["execution"], "not_started");
    assert!(!f.config.settings.vault_path.join("notes").exists());
}

#[tokio::test]
async fn oversized_completed_result_cannot_claim_the_operation_never_started() {
    let f = Fixture::new(&["notes:write"]);
    let (status, new) = f
        .call(
            "shards_note_new",
            json!({"title":"large synthetic output","body":"\"".repeat(3_500_000)}),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let id = new["mcp_result"]["structuredContent"]["id"]
        .as_str()
        .unwrap();
    let (status, result) = f.call("shards_note_get", json!({"id":id})).await;
    assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE);
    assert_eq!(result["error"]["kind"], "response_too_large");
    assert_eq!(result["error"]["execution"], "completed");
}
