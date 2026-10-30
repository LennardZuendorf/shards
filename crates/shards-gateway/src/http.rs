//! Loopback-only private RPC. The tailnet TLS terminator is configured separately.
use crate::{
    config::LoadedGatewayConfig,
    executor::Executor,
    grants,
    protocol::{self, ControlError, Execution, Operation, MAX_BYTES, MAX_DURATION_MS},
    Result,
};
use axum::{
    body::{to_bytes, Body},
    extract::{Request as HttpRequest, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use chrono::Utc;
use serde_json::{json, Value};
use shards::{
    ctx::CallCtx,
    mcp::{
        errors,
        remote::{Principal, RemoteMember},
        tools::Server,
    },
};
use std::{path::Path, sync::Arc, time::Duration};

struct Api {
    config: LoadedGatewayConfig,
    server: Server,
    executor: Executor,
    incoming: Arc<tokio::sync::Semaphore>,
}

pub fn router(config: LoadedGatewayConfig) -> Result<Router> {
    config.validate_pins()?;
    grants::validate(&config)?;
    let server = Server::new(
        Some(config.settings.core_config.clone()),
        Some(config.settings.vault_path.clone()),
    );
    let state = Arc::new(Api {
        config,
        server,
        executor: Executor::default(),
        incoming: Arc::new(tokio::sync::Semaphore::new(64)),
    });
    Ok(Router::new()
        .route("/v1/probe", post(probe))
        .route("/v1/describe", post(describe))
        .route("/v1/call", post(call))
        .with_state(state))
}

async fn probe(State(api): State<Arc<Api>>, request: HttpRequest) -> Response {
    handle(api, request, Operation::Probe).await
}
async fn describe(State(api): State<Arc<Api>>, request: HttpRequest) -> Response {
    handle(api, request, Operation::Describe).await
}
async fn call(State(api): State<Arc<Api>>, request: HttpRequest) -> Response {
    handle(api, request, Operation::Call).await
}

fn control(kind: &'static str, message: &'static str, status: u16) -> ControlError {
    ControlError::new(kind, message, status, Execution::NotStarted)
}
fn authority_error(error: crate::GatewayError) -> ControlError {
    if error.0 == "unauthorized" {
        control("unauthorized", "invalid or expired credential", 401)
    } else {
        control("unavailable", "local authority unavailable", 503)
    }
}
fn one<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    if headers.get_all(name).iter().count() != 1 {
        return None;
    }
    headers.get(name)?.to_str().ok()
}
fn private_headers(headers: &HeaderMap, origin: &str) -> bool {
    let Some(host) = one(headers, "host") else {
        return false;
    };
    let Ok(url) = url::Url::parse(&format!("https://{host}")) else {
        return false;
    };
    if url.origin().ascii_serialization() != origin
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return false;
    }
    !headers.contains_key("origin") || one(headers, "origin") == Some(origin)
}
fn token(headers: &HeaderMap, name: &str, bearer: bool) -> Option<String> {
    let value = one(headers, name)?;
    let value = if bearer {
        value.strip_prefix("Bearer ")?
    } else {
        value
    };
    if value.is_empty() || value.len() > 1024 || value.chars().any(char::is_whitespace) {
        None
    } else {
        Some(value.to_string())
    }
}
fn response_error(error: ControlError, id: Option<&str>) -> Response {
    let status = StatusCode::from_u16(error.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    let mut response=(status,Json(json!({"v":1,"request_id":id,"error":{"kind":error.kind,"message":error.message,"execution":error.execution}}))).into_response();
    if status == StatusCode::UNAUTHORIZED {
        response.headers_mut().insert(
            "www-authenticate",
            axum::http::HeaderValue::from_static("Bearer realm=\"shards\""),
        );
    }
    response
}

async fn handle(api: Arc<Api>, request: HttpRequest, operation: Operation) -> Response {
    if !private_headers(request.headers(), &api.config.settings.external_origin) {
        return response_error(control("forbidden", "untrusted request origin", 403), None);
    }
    let Some(connector) = token(request.headers(), "x-shards-connector", false) else {
        return response_error(
            control("unauthorized", "connector credential required", 401),
            None,
        );
    };
    let client = token(request.headers(), "authorization", true);
    if operation != Operation::Probe && client.is_none() {
        return response_error(
            control("unauthorized", "client credential required", 401),
            None,
        );
    }
    let Some(content_type) = one(request.headers(), "content-type") else {
        return response_error(control("invalid_request", "JSON body required", 400), None);
    };
    if content_type.split(';').next().map(str::trim) != Some("application/json") {
        return response_error(control("invalid_request", "JSON body required", 400), None);
    }
    let Ok(_incoming) = api.incoming.clone().try_acquire_owned() else {
        return response_error(control("busy", "receiver request limit reached", 429), None);
    };
    let raw = match tokio::time::timeout(
        Duration::from_secs(30),
        to_bytes(request.into_body(), MAX_BYTES),
    )
    .await
    {
        Ok(Ok(raw)) => raw,
        Ok(Err(_)) => {
            return response_error(
                control(
                    "payload_too_large",
                    "request body could not be accepted within the size limit",
                    413,
                ),
                None,
            )
        }
        Err(_) => {
            return response_error(
                control("deadline_exceeded", "request body deadline elapsed", 504),
                None,
            )
        }
    };
    let request = match protocol::parse(
        operation,
        &raw,
        &api.config.settings.vault_id,
        Utc::now().timestamp_millis(),
    ) {
        Ok(request) => request,
        Err(error) => {
            let id = error.request_id.clone();
            return response_error(error, id.as_deref());
        }
    };
    let id = request.meta.request_id.clone();
    let deadline = request.meta.deadline_ms.min(
        Utc::now()
            .timestamp_millis()
            .saturating_add(MAX_DURATION_MS),
    );
    let inside = api.clone();
    let result=api.executor.run(deadline,move |execution| {
        inside.config.validate_pins().map_err(|_|control("unavailable","configuration drift requires restart",503))?;
        if Utc::now().timestamp_millis()>=deadline {return Err(control("deadline_exceeded","request deadline elapsed before execution",504));}
        let base=json!({"v":1,"request_id":request.meta.request_id,"vault_id":inside.config.settings.vault_id});
        if operation==Operation::Probe {
            grants::probe_connector(&inside.config,&connector).map_err(authority_error)?;
            execution.start()?;
            return encode(base);
        }
        let principal=grants::admit_with(&inside.config,client.as_deref().unwrap_or(""),&connector,|grant| {
            let members=grant.members.iter().map(|member|RemoteMember{id:member.id.clone(),kind:match member.kind{grants::MemberKind::Human=>"human",grants::MemberKind::Agent=>"agent"}.into(),sponsor:member.sponsor.clone()}).collect::<Vec<_>>();
            let principal=Principal::new(&grant.actor,&grant.scopes,&members).map_err(|_|control("forbidden","invalid local principal",403))?;
            principal.validate_config(&inside.config.core).map_err(|_|control("forbidden","invalid configured principal",403))?;
            if request.call.as_ref().is_some_and(|call|!principal.tools().iter().any(|tool|tool.get("name").and_then(Value::as_str)==Some(call.tool.as_str()))) {return Err(control("forbidden","tool is not available to this grant",403));}
            if Utc::now().timestamp_millis()>=deadline {return Err(control("deadline_exceeded","request deadline elapsed before execution",504));}
            execution.start()?;
            Ok(principal)
        }).map_err(authority_error)??;
        let mut value=base;
        if let Some(call)=request.call {
            let ctx=CallCtx{cfg:Arc::new(inside.config.core.clone()),principal:Some(principal)};
            let result=match inside.server.call_in(&ctx,&call.tool,&Value::Object(call.arguments)) {Ok(outcome)=>errors::success(&outcome.value,outcome.list),Err(error)=>errors::failure(&error)};
            value["mcp_result"]=result;
        }else{
            value["tools"]=Value::Array(principal.tools());
            value["instructions"]=json!(principal.instructions());
        }
        encode(value)
    }).await;
    match result {
        Err(error) => response_error(error, Some(&id)),
        Ok(bytes) => ([("content-type", "application/json")], Body::from(bytes)).into_response(),
    }
}

fn encode(value: Value) -> std::result::Result<Vec<u8>, ControlError> {
    match serde_json::to_vec(&value) {
        Ok(bytes) if bytes.len() <= MAX_BYTES => Ok(bytes),
        Ok(_) => Err(ControlError::new(
            "response_too_large",
            "operation finished but its result exceeds the size limit",
            413,
            Execution::Completed,
        )),
        Err(_) => Err(ControlError::new(
            "outcome_unknown",
            "result encoding failed",
            504,
            Execution::Completed,
        )),
    }
}

pub async fn serve(path: &Path) -> Result<()> {
    let config = LoadedGatewayConfig::load(path)?;
    let port = config.settings.listen_port;
    let app = router(config)?;
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port))
        .await
        .map_err(|_| crate::error("gateway loopback listener unavailable"))?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown())
        .await
        .map_err(|_| crate::error("gateway listener stopped unexpectedly"))
}
async fn shutdown() {
    let interrupt = tokio::signal::ctrl_c();
    if let Ok(mut terminate) =
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
    {
        tokio::select! {_=interrupt=>{},_=terminate.recv()=>{}}
    } else {
        let _ = interrupt.await;
    }
}
