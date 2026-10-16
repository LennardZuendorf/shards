//! Browser mode: `POST /api/call/{tool}` (body = args), `GET /api/events` (SSE) and
//! `GET /api/health`, on 127.0.0.1 only.
//!
//! Any web page can make the browser send requests to localhost, and any local process can
//! connect to a loopback port, so four checks guard the API:
//! * the `Host` header must name a loopback host (defeats DNS rebinding, where the attacker's
//!   page becomes "same-origin" with this server);
//! * an `Origin` header, when present, must be a loopback `http://` origin on any port (each
//!   worktree's Vite runs on its own port). `tauri://localhost` is NOT trusted: the desktop app
//!   uses IPC, and on macOS every Tauri app shares that origin;
//! * `/api/call` requires `x-shards-client: 1`. A cross-origin page can only send a custom
//!   header after a CORS preflight, and this server never answers one;
//! * `/api/call` and `/api/events` require `x-shards-token`, a per-launch secret written to a
//!   0600 file. The Vite dev proxy reads the file and adds the header, so the browser never
//!   holds it, and a proxied LAN peer or another local user cannot call the API.
#![forbid(unsafe_code)]
#![deny(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::todo,
    clippy::string_slice
)]

use std::convert::Infallible;
use std::io::{Read, Write};
use std::path::{Path as FsPath, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use axum::extract::{Path, Request, State};
use axum::http::{HeaderMap, StatusCode};
use axum::middleware::{self, Next};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_util::stream::Stream;
use serde_json::Value;
use shards::spaces::Space;
use shards_host::{Host, VaultChange};
use tokio::sync::broadcast;
use tokio_stream::wrappers::errors::BroadcastStreamRecvError;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;

const DEFAULT_PORT: u16 = 7878;
const CLIENT_HEADER: &str = "x-shards-client";
const TOKEN_HEADER: &str = "x-shards-token";
/// Overrides where the per-launch token is written (default `~/.shards/run/host-<port>.token`).
const TOKEN_FILE_ENV: &str = "SHARDS_HOST_TOKEN_FILE";
/// Change events buffered per SSE subscriber before it lags (and gets a full refresh).
const EVENT_BUFFER: usize = 1024;

const USAGE: &str = "\
shards-host — the Shards UI API on 127.0.0.1 (browser dev mode)

Usage: shards-host [--port <PORT>] [--config <PATH>] [--vault <PATH>]
       shards-host 127.0.0.1:<PORT>      (legacy form; same as --port)

Options:
  --port <PORT>    Port to bind on 127.0.0.1 [default: 7878, or $SHARDS_HOST_PORT]
  --config <PATH>  Config file (above $SHARDS_CONFIG_PATH and ~/.shards/config.toml)
  --vault <PATH>   Vault folder (above $SHARDS_VAULT and [core].vault_path)
  -h, --help       Print this help

Every /api/call and /api/events request must carry `x-shards-token: <token>`. The token is
new on every launch and is written (mode 0600) to $SHARDS_HOST_TOKEN_FILE, else to
~/.shards/run/host-<PORT>.token. The Vite dev proxy reads that file and adds the header.
";

#[derive(Clone)]
struct AppState {
    host: Host,
    tx: broadcast::Sender<VaultChange>,
}

/// What the guard checks a request against.
struct Guard {
    token: String,
    token_file: String,
}

#[derive(Debug, Default, PartialEq)]
struct Cli {
    port: Option<u16>,
    config: Option<PathBuf>,
    vault: Option<PathBuf>,
    help: bool,
}

fn parse_args(args: &[String]) -> Result<Cli, String> {
    let mut cli = Cli::default();
    let mut it = args.iter();
    while let Some(arg) = it.next() {
        let (flag, inline) = match arg.split_once('=') {
            Some((f, v)) if f.starts_with("--") => (f, Some(v.to_string())),
            _ => (arg.as_str(), None),
        };
        let mut value = |name: &str| -> Result<String, String> {
            inline
                .clone()
                .or_else(|| it.next().cloned())
                .ok_or_else(|| format!("{name} needs a value"))
        };
        match flag {
            "-h" | "--help" => cli.help = true,
            "--port" => {
                let v = value("--port")?;
                cli.port = Some(v.parse().map_err(|_| format!("invalid --port: {v}"))?);
            }
            "--config" => cli.config = Some(PathBuf::from(value("--config")?)),
            "--vault" => cli.vault = Some(PathBuf::from(value("--vault")?)),
            // Legacy spike form: a positional `127.0.0.1:PORT` / `localhost:PORT`. Only the
            // port is taken; the bind address is always 127.0.0.1.
            other if !other.starts_with('-') && cli.port.is_none() => {
                let port = other
                    .rsplit_once(':')
                    .filter(|(host, _)| loopback_host(host))
                    .and_then(|(_, p)| p.parse().ok())
                    .ok_or_else(|| format!("unexpected argument: {other} (use --port)"))?;
                cli.port = Some(port);
            }
            other => return Err(format!("unexpected argument: {other}")),
        }
    }
    Ok(cli)
}

/// `localhost`, `127.0.0.1` or `[::1]`, with an optional numeric port. Anything else —
/// userinfo, a path, a look-alike name such as `localhost.evil.example` — is not loopback.
fn loopback_host(host: &str) -> bool {
    let (name, port) = match host.strip_prefix('[') {
        Some(v6) => {
            let Some((name, after)) = v6.split_once(']') else {
                return false;
            };
            if after.is_empty() {
                (name, None)
            } else if let Some(port) = after.strip_prefix(':') {
                (name, Some(port))
            } else {
                return false;
            }
        }
        None => match host.split_once(':') {
            Some((name, port)) => (name, Some(port)),
            None => (host, None),
        },
    };
    let port_ok = port.is_none_or(|p| {
        !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()) && p.parse::<u16>().is_ok()
    });
    port_ok
        && matches!(
            name.to_ascii_lowercase().as_str(),
            "localhost" | "127.0.0.1" | "::1"
        )
}

/// `http://` plus a loopback authority, on any port. `null`, `tauri://…`, `https://…` and
/// every non-loopback origin are refused.
fn loopback_origin(origin: &str) -> bool {
    origin.strip_prefix("http://").is_some_and(loopback_host)
}

/// Equal-length byte compare whose time does not depend on where the first mismatch is.
fn token_matches(given: &[u8], expected: &[u8]) -> bool {
    given.len() == expected.len()
        && given
            .iter()
            .zip(expected)
            .fold(0u8, |acc, (a, b)| acc | (a ^ b))
            == 0
}

/// A refused request: `403 forbidden` for a foreign Host/Origin or a missing client header,
/// `401 unauthorized` for a missing or wrong launch token.
type Refusal = (StatusCode, String);

fn refuse(status: StatusCode, message: String) -> Response {
    let kind = if status == StatusCode::UNAUTHORIZED {
        "unauthorized"
    } else {
        "forbidden"
    };
    (
        status,
        Json(serde_json::json!({"kind": kind, "message": message})),
    )
        .into_response()
}

/// The checks every route shares; `/api/call` additionally needs the client header, and
/// `/api/call` + `/api/events` need the launch token.
fn check(headers: &HeaderMap, path: &str, guard: &Guard) -> Result<(), Refusal> {
    let forbidden = |m: String| Err((StatusCode::FORBIDDEN, m));
    let host = headers
        .get("host")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");
    if !loopback_host(host) {
        return forbidden("host header must name localhost".to_string());
    }
    if let Some(origin) = headers.get("origin") {
        if !origin.to_str().is_ok_and(loopback_origin) {
            return forbidden("origin not allowed".to_string());
        }
    }
    let is_call = path.starts_with("/api/call");
    if is_call {
        let ok = headers
            .get(CLIENT_HEADER)
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| v == "1");
        if !ok {
            return forbidden(format!("missing {CLIENT_HEADER}: 1"));
        }
    }
    if is_call || path.starts_with("/api/events") {
        let ok = headers
            .get(TOKEN_HEADER)
            .is_some_and(|v| token_matches(v.as_bytes(), guard.token.as_bytes()));
        if !ok {
            return Err((
                StatusCode::UNAUTHORIZED,
                format!(
                    "missing or wrong {TOKEN_HEADER}: send the token in {} (the Vite dev proxy adds it)",
                    guard.token_file
                ),
            ));
        }
    }
    Ok(())
}

async fn guard(State(g): State<Arc<Guard>>, req: Request, next: Next) -> Response {
    match check(req.headers(), req.uri().path(), &g) {
        Ok(()) => next.run(req).await,
        Err((status, message)) => refuse(status, message),
    }
}

async fn call(
    State(st): State<AppState>,
    Path(tool): Path<String>,
    body: Option<Json<Value>>,
) -> impl IntoResponse {
    let args = body
        .map(|Json(v)| v)
        .unwrap_or_else(|| Value::Object(Default::default()));
    let host = st.host.clone();
    match tokio::task::spawn_blocking(move || host.call(&tool, &args)).await {
        Ok(Ok(v)) => (StatusCode::OK, Json(v)).into_response(),
        Ok(Err(e)) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(serde_json::to_value(e).unwrap_or(Value::Null)),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"kind": "unknown", "message": e.to_string()})),
        )
            .into_response(),
    }
}

/// What a subscriber gets for one broadcast item. A subscriber that fell behind lost some
/// changes, so it is told that every space changed and refetches everything.
fn change_event(item: Result<VaultChange, BroadcastStreamRecvError>) -> VaultChange {
    match item {
        Ok(change) => change,
        Err(BroadcastStreamRecvError::Lagged(_)) => VaultChange {
            spaces: Space::ALL.iter().map(|s| s.name().to_string()).collect(),
            paths: Vec::new(),
        },
    }
}

async fn events(State(st): State<AppState>) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let stream = BroadcastStream::new(st.tx.subscribe()).map(|item| {
        Ok(Event::default()
            .event("vault-changed")
            .data(serde_json::to_string(&change_event(item)).unwrap_or_default()))
    });
    Sse::new(stream).keep_alive(KeepAlive::default())
}

fn app(host: Host, tx: broadcast::Sender<VaultChange>, guard_state: Arc<Guard>) -> Router {
    Router::new()
        .route("/api/call/{tool}", post(call))
        .route("/api/events", get(events))
        .route("/api/health", get(|| async { "ok" }))
        .layer(middleware::from_fn_with_state(guard_state, guard))
        .with_state(AppState { host, tx })
}

/// `$SHARDS_HOST_TOKEN_FILE`, else `~/.shards/run/host-<port>.token`: keyed by port so
/// several hosts can run at once, and at a path the Vite config can compute too.
fn token_path(port: u16) -> Option<PathBuf> {
    if let Some(p) = std::env::var_os(TOKEN_FILE_ENV).filter(|p| !p.is_empty()) {
        return Some(PathBuf::from(p));
    }
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .filter(|h| !h.is_empty())?;
    Some(
        PathBuf::from(home)
            .join(".shards")
            .join("run")
            .join(format!("host-{port}.token")),
    )
}

/// 32 bytes from the OS CSPRNG, hex-encoded.
fn new_token() -> std::io::Result<String> {
    let mut bytes = [0u8; 32];
    std::fs::File::open("/dev/urandom")?.read_exact(&mut bytes)?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

/// Write the token to a fresh 0600 file. A stale file or symlink at the path is unlinked first
/// (never followed), and the new file is created exclusively, so a planted link fails closed.
fn write_token(path: &FsPath, token: &str) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        let mut builder = std::fs::DirBuilder::new();
        builder.recursive(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder.create(dir)?;
    }
    match std::fs::symlink_metadata(path) {
        Ok(meta) if meta.is_dir() => {
            return Err(std::io::Error::other("the token path is a directory"));
        }
        Ok(_) => std::fs::remove_file(path)?,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(e),
    }
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path)?;
    file.write_all(token.as_bytes())?;
    file.sync_all()
}

/// The launch token's file, removed when the host exits by any path that unwinds: a clean
/// shutdown after a signal, or an early error return after the token was written. A stale
/// bearer secret must not outlive the process that honours it.
struct TokenFile {
    path: PathBuf,
    token: String,
}

impl Drop for TokenFile {
    fn drop(&mut self) {
        remove_token_if_ours(&self.path, &self.token);
    }
}

/// Unlink `path` only while it still holds `token`, so a newer host that rewrote the file
/// (same `$SHARDS_HOST_TOKEN_FILE`) keeps its own.
fn remove_token_if_ours(path: &FsPath, token: &str) {
    if std::fs::read_to_string(path).is_ok_and(|t| t == token) {
        let _ = std::fs::remove_file(path);
    }
}

/// The port a `host-<port>.token` file name belongs to.
fn token_file_port(name: &str) -> Option<u16> {
    name.strip_prefix("host-")?
        .strip_suffix(".token")?
        .parse()
        .ok()
}

/// Remove `host-<port>.token` files in `dir` whose port no longer accepts a connection: hosts
/// that died without cleaning up (SIGKILL, a crash). `own` is never touched, and a port that
/// answers keeps its file whoever holds it. Returns the removed paths.
fn sweep_stale_tokens(dir: &FsPath, own: u16) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut removed = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(port) = name.to_str().and_then(token_file_port) else {
            continue;
        };
        if port == own || entry.file_type().map_or(true, |t| !t.is_file()) {
            continue;
        }
        let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
        if std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(150)).is_err() {
            let path = entry.path();
            if std::fs::remove_file(&path).is_ok() {
                removed.push(path);
            }
        }
    }
    removed
}

/// Resolves on Ctrl-C (SIGINT) or SIGTERM.
async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let term = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut s) => {
                s.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };
    #[cfg(not(unix))]
    let term = std::future::pending::<()>();
    tokio::select! {
        () = ctrl_c => {}
        () = term => {}
    }
}

/// How long open connections (SSE streams never end on their own) get after a shutdown signal.
const SHUTDOWN_GRACE: Duration = Duration::from_secs(2);

fn main() {
    let raw: Vec<String> = std::env::args().skip(1).collect();
    let cli = match parse_args(&raw) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("shards-host: {e}\n\n{USAGE}");
            std::process::exit(2);
        }
    };
    if cli.help {
        print!("{USAGE}");
        return;
    }
    let port = cli
        .port
        .or_else(|| {
            std::env::var("SHARDS_HOST_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
        })
        .unwrap_or(DEFAULT_PORT);
    let config = cli
        .config
        .or_else(|| std::env::var_os("SHARDS_CONFIG_PATH").map(PathBuf::from));
    let vault = cli
        .vault
        .or_else(|| std::env::var_os("SHARDS_VAULT").map(PathBuf::from));

    // Before any thread exists: it sets $SHARDS_AGENT for the whole process.
    let me = shards_host::adopt_configured_identity(config.as_deref());

    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(r) => r,
        Err(e) => {
            eprintln!("shards-host: tokio runtime: {e}");
            std::process::exit(1);
        }
    };
    let code = runtime.block_on(serve(port, config, vault, me));
    std::process::exit(code);
}

async fn serve(
    port: u16,
    config: Option<PathBuf>,
    vault: Option<PathBuf>,
    me: Option<String>,
) -> i32 {
    let host = Host::new(config, vault);

    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("shards-host: bind {addr}: {e}");
            return 1;
        }
    };

    // The token file is written only after the port is ours, so a second host that failed
    // to bind never replaces the running host's token.
    let Some(token_file) = token_path(port) else {
        eprintln!("shards-host: no home directory for the token file; set {TOKEN_FILE_ENV}");
        return 1;
    };
    let token = match new_token().and_then(|t| write_token(&token_file, &t).map(|()| t)) {
        Ok(t) => t,
        Err(e) => {
            eprintln!(
                "shards-host: cannot write the token file {}: {e}",
                token_file.display()
            );
            return 1;
        }
    };
    // From here every return path removes the token file.
    let _token_guard = TokenFile {
        path: token_file.clone(),
        token: token.clone(),
    };
    // Only the default run folder is swept; an explicit $SHARDS_HOST_TOKEN_FILE is the
    // caller's to manage.
    if std::env::var_os(TOKEN_FILE_ENV).is_none_or(|p| p.is_empty()) {
        if let Some(dir) = token_file.parent() {
            for stale in sweep_stale_tokens(dir, port) {
                eprintln!("shards-host: removed stale token {}", stale.display());
            }
        }
    }
    let guard_state = Arc::new(Guard {
        token,
        token_file: token_file.display().to_string(),
    });

    let (tx, _) = broadcast::channel::<VaultChange>(EVENT_BUFFER);
    let tx2 = tx.clone();
    let _watcher = match shards_host::watch(&host, Duration::from_millis(150), move |c| {
        eprintln!("vault-changed {} path(s) in {:?}", c.paths.len(), c.spaces);
        let _ = tx2.send(c);
    }) {
        Ok(w) => Some(w),
        Err(e) => {
            eprintln!("watcher disabled: {e}");
            None
        }
    };

    eprintln!("shards-host config {}", host.config_path().display());
    match host.vault_root() {
        Some(v) => eprintln!("shards-host vault  {}", v.display()),
        None => eprintln!("shards-host vault  (config did not load; calls will report it)"),
    }
    match &me {
        Some(me) => eprintln!("shards-host acting as {me} ([core].me)"),
        None => eprintln!("shards-host acting as the agent identity ([core].me is not set)"),
    }
    eprintln!("shards-host token  {}", token_file.display());
    println!("shards-host listening on http://{addr}");
    let stop = Arc::new(tokio::sync::Notify::new());
    let stop_serve = stop.clone();
    let server = axum::serve(listener, app(host, tx, guard_state))
        .with_graceful_shutdown(async move { stop_serve.notified().await });
    let code = tokio::select! {
        res = server => match res {
            Ok(()) => 0,
            Err(e) => {
                eprintln!("shards-host: serve: {e}");
                1
            }
        },
        () = async {
            shutdown_signal().await;
            eprintln!("shards-host: shutting down");
            stop.notify_one();
            // Graceful shutdown waits for open connections; an SSE stream never closes on
            // its own, so cap the wait.
            tokio::time::sleep(SHUTDOWN_GRACE).await;
        } => 0,
    };
    code
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    const TOKEN: &str = "0123456789abcdef";

    fn guard() -> Guard {
        Guard {
            token: TOKEN.to_string(),
            token_file: "/run/host-7878.token".to_string(),
        }
    }

    fn headers(pairs: &[(&'static str, &str)]) -> HeaderMap {
        let mut h = HeaderMap::new();
        for (k, v) in pairs {
            h.insert(*k, HeaderValue::from_str(v).unwrap());
        }
        h
    }

    /// A request that passes every check, plus `extra` (which may override a header).
    fn ok_with(extra: &[(&'static str, &str)]) -> HeaderMap {
        let mut h = headers(&[
            ("host", "127.0.0.1:7878"),
            (CLIENT_HEADER, "1"),
            (TOKEN_HEADER, TOKEN),
        ]);
        for (k, v) in extra {
            h.insert(*k, HeaderValue::from_str(v).unwrap());
        }
        h
    }

    #[test]
    fn args_parse() {
        let a = |v: &[&str]| parse_args(&v.iter().map(|s| s.to_string()).collect::<Vec<_>>());
        assert_eq!(
            a(&["--port", "9000", "--config=/c.toml"]).unwrap(),
            Cli {
                port: Some(9000),
                config: Some("/c.toml".into()),
                ..Cli::default()
            }
        );
        assert!(a(&["--port", "x"]).is_err());
        assert!(a(&["--port"]).is_err());
        assert_eq!(a(&["127.0.0.1:7981"]).unwrap().port, Some(7981));
        assert_eq!(a(&["localhost:7982"]).unwrap().port, Some(7982));
        assert!(
            a(&["0.0.0.0:7981"]).is_err(),
            "never binds a non-loopback address"
        );
        assert!(a(&["evil.example:80"]).is_err());
        assert!(a(&["--port", "1", "127.0.0.1:2"]).is_err());
        assert!(a(&["-h"]).unwrap().help);
    }

    #[test]
    fn loopback_hosts() {
        assert!(loopback_host("localhost:5173"));
        assert!(loopback_host("LOCALHOST:5173"));
        assert!(loopback_host("127.0.0.1:7878"));
        assert!(loopback_host("[::1]:7878"));
        assert!(loopback_host("[::1]"));
        assert!(loopback_host("localhost"));
        assert!(!loopback_host("evil.example:7878"));
        assert!(!loopback_host("localhost.evil.example"));
        assert!(!loopback_host("localhost@evil.example"));
        assert!(!loopback_host("localhost:5173@evil.example"));
        assert!(!loopback_host("localhost:"));
        assert!(!loopback_host("localhost:99999"));
        assert!(!loopback_host("localhost:80/path"));
        assert!(!loopback_host("[::1]x"));
        assert!(!loopback_host("[::1"));
        assert!(!loopback_host(""));
    }

    #[test]
    fn origins_are_any_loopback_http_port_only() {
        for good in [
            "http://localhost:5173",
            "http://localhost:5231",
            "http://127.0.0.1:4000",
            "http://[::1]:5173",
            "http://localhost",
        ] {
            assert!(loopback_origin(good), "{good} should be allowed");
        }
        for bad in [
            "null",
            "",
            "tauri://localhost",
            "https://localhost:5173",
            "http://localhost.evil.example:5173",
            "http://localhost@evil.example",
            "http://evil.example",
            "http://localhost:5173/",
        ] {
            assert!(!loopback_origin(bad), "{bad} should be refused");
        }
    }

    #[test]
    fn token_compare() {
        assert!(token_matches(b"abc", b"abc"));
        assert!(!token_matches(b"abd", b"abc"));
        assert!(!token_matches(b"ab", b"abc"));
        assert!(!token_matches(b"", b"abc"));
    }

    #[test]
    fn guard_rules() {
        let g = guard();
        assert!(check(&ok_with(&[]), "/api/call/shards_health", &g).is_ok());
        assert!(check(&ok_with(&[]), "/api/events", &g).is_ok());

        // Vite on any loopback port is a valid origin.
        let dev = ok_with(&[
            ("host", "localhost:5231"),
            ("origin", "http://localhost:5231"),
        ]);
        assert!(check(&dev, "/api/call/x", &g).is_ok());

        // The client header is a /api/call rule.
        let mut no_client = ok_with(&[]);
        no_client.remove(CLIENT_HEADER);
        assert!(check(&no_client, "/api/call/x", &g).is_err());
        assert!(check(&no_client, "/api/events", &g).is_ok());

        // The token guards calls and events, not the health probe.
        let mut no_token = ok_with(&[]);
        no_token.remove(TOKEN_HEADER);
        let (status, err) = check(&no_token, "/api/call/x", &g).unwrap_err();
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert!(
            err.contains(TOKEN_HEADER) && err.contains("host-7878.token"),
            "{err}"
        );
        assert!(check(&no_token, "/api/events", &g).is_err());
        assert!(check(&no_token, "/api/health", &g).is_ok());
        let wrong = ok_with(&[(TOKEN_HEADER, "0123456789abcdeX")]);
        assert!(check(&wrong, "/api/call/x", &g).is_err());
        assert!(check(&wrong, "/api/events", &g).is_err());

        for origin in [
            "https://evil.example",
            "null",
            "tauri://localhost",
            "http://localhost.evil.example:5173",
        ] {
            let h = ok_with(&[("origin", origin)]);
            let (status, _) = check(&h, "/api/call/x", &g).unwrap_err();
            assert_eq!(status, StatusCode::FORBIDDEN, "{origin}");
            assert!(check(&h, "/api/events", &g).is_err(), "{origin}");
        }

        // DNS rebinding, an empty Host and no Host at all (HTTP/1.0).
        let rebound = ok_with(&[("host", "evil.example:7878")]);
        assert!(check(&rebound, "/api/call/x", &g).is_err());
        assert!(check(&rebound, "/api/health", &g).is_err());
        let empty_host = ok_with(&[("host", "")]);
        assert!(check(&empty_host, "/api/call/x", &g).is_err());
        let mut no_host = ok_with(&[]);
        no_host.remove("host");
        assert!(check(&no_host, "/api/call/x", &g).is_err());
        assert!(check(&no_host, "/api/health", &g).is_err());
    }

    #[test]
    fn a_lagging_subscriber_refetches_every_space() {
        let change = change_event(Err(BroadcastStreamRecvError::Lagged(7)));
        assert!(change.paths.is_empty());
        for space in Space::ALL {
            assert!(change.spaces.iter().any(|s| s == space.name()));
        }
        let passthrough = change_event(Ok(VaultChange {
            spaces: vec!["tasks".into()],
            paths: vec!["/v/tasks/open/t-1.md".into()],
        }));
        assert_eq!(passthrough.spaces, ["tasks"]);
    }

    #[test]
    fn token_file_port_reads_only_host_token_names() {
        assert_eq!(token_file_port("host-7931.token"), Some(7931));
        assert_eq!(token_file_port("host-x.token"), None);
        assert_eq!(token_file_port("tasks.watch.lock"), None);
        assert_eq!(token_file_port("host-7931.token.bak"), None);
    }

    #[test]
    fn the_token_guard_removes_only_its_own_token() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("host-1.token");
        write_token(&path, "mine").unwrap();
        drop(TokenFile {
            path: path.clone(),
            token: "mine".into(),
        });
        assert!(!path.exists(), "the guard removes its token on drop");

        write_token(&path, "newer").unwrap();
        drop(TokenFile {
            path: path.clone(),
            token: "mine".into(),
        });
        assert!(path.exists(), "a newer host's token survives");
    }

    #[test]
    fn the_sweep_removes_dead_ports_and_keeps_live_and_own_ones() {
        let dir = tempfile::tempdir().unwrap();
        let live = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let live_port = live.local_addr().unwrap().port();
        // A port that was free a moment ago: nothing listens there.
        let dead_port = {
            let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            l.local_addr().unwrap().port()
        };
        for p in [live_port, dead_port] {
            write_token(&dir.path().join(format!("host-{p}.token")), "t").unwrap();
        }
        // Our own port is never swept, even when it does not answer yet.
        let own = dir.path().join("host-1.token");
        write_token(&own, "t").unwrap();
        let other = dir.path().join("tasks.watch.lock");
        std::fs::write(&other, "x").unwrap();

        let removed = sweep_stale_tokens(dir.path(), 1);
        assert_eq!(
            removed,
            [dir.path().join(format!("host-{dead_port}.token"))]
        );
        assert!(dir.path().join(format!("host-{live_port}.token")).exists());
        assert!(own.exists());
        assert!(other.exists(), "lock files are never touched");
        drop(live);
    }

    #[test]
    fn token_file_is_private_and_replaces_a_planted_symlink() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("run/host-1.token");
        write_token(&path, "first").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "first");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&path).unwrap().permissions().mode();
            assert_eq!(mode & 0o777, 0o600);
            // A symlink at the token path is unlinked, never followed.
            let victim = dir.path().join("victim");
            std::fs::write(&victim, "keep").unwrap();
            std::fs::remove_file(&path).unwrap();
            std::os::unix::fs::symlink(&victim, &path).unwrap();
            write_token(&path, "second").unwrap();
            assert_eq!(std::fs::read_to_string(&victim).unwrap(), "keep");
            assert!(!std::fs::symlink_metadata(&path).unwrap().is_symlink());
            assert_eq!(std::fs::read_to_string(&path).unwrap(), "second");
        }
        let token = new_token().unwrap();
        assert_eq!(token.len(), 64);
        assert!(token.bytes().all(|b| b.is_ascii_hexdigit()));
        assert_ne!(token, new_token().unwrap());
    }
}
