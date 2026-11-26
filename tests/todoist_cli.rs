//! Todoist pull (sync slice 1) through the real binary against a local fake API.
//!
//! No network: `FakeTodoist` is a one-thread HTTP/1.1 server on 127.0.0.1 that serves the four
//! endpoints the pull reads and can inject a 429 or an authentication failure. The token is a
//! sentinel, and one test asserts it never reaches stdout, stderr, or a vault file.

mod common;

use std::io::{BufRead, BufReader, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::Duration;

use common::VaultFixture;
use serde_json::{json, Value as Json};

const TOKEN: &str = "sentinel-not-a-real-token-7f4a";

// ---------------------------------------------------------------------------------------
// a fake Todoist API
// ---------------------------------------------------------------------------------------

#[derive(Default)]
struct State {
    projects: Vec<Json>,
    sections: Vec<Json>,
    tasks: Vec<Json>,
    completed: Vec<Json>,
    /// Respond 429 to this many requests before serving normally.
    rate_limit: usize,
    /// Force this status on every route (the token-leak test uses 401).
    status: Option<u16>,
    requests: Vec<String>,
    auth: Vec<String>,
}

struct FakeTodoist {
    addr: SocketAddr,
    state: Arc<Mutex<State>>,
    stop: Arc<AtomicBool>,
    handle: Option<thread::JoinHandle<()>>,
}

impl FakeTodoist {
    fn new() -> FakeTodoist {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind fake todoist");
        let addr = listener.local_addr().expect("addr");
        listener.set_nonblocking(true).expect("nonblocking");
        let state = Arc::new(Mutex::new(State::default()));
        let stop = Arc::new(AtomicBool::new(false));
        let thread_state = Arc::clone(&state);
        let thread_stop = Arc::clone(&stop);
        let handle = thread::spawn(move || {
            while !thread_stop.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((stream, _)) => serve(stream, &thread_state),
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(2));
                    }
                    Err(_) => break,
                }
            }
        });
        FakeTodoist {
            addr,
            state,
            stop,
            handle: Some(handle),
        }
    }

    fn state(&self) -> MutexGuard<'_, State> {
        self.state.lock().expect("fake state")
    }

    fn base_url(&self) -> String {
        format!("http://{}", self.addr)
    }

    fn fixture(&self) -> VaultFixture {
        self.fixture_with_projects(r#"["Work"]"#)
    }

    fn fixture_with_projects(&self, projects: &str) -> VaultFixture {
        VaultFixture::with(&format!(
            "[core]\nvault_path = \"{{VAULT}}\"\nagent = \"test-agent\"\n\n\
             [todoist]\nprojects = {projects}\nbase_url = \"{}\"\n",
            self.base_url()
        ))
    }
}

impl Drop for FakeTodoist {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

fn serve(mut stream: TcpStream, state: &Arc<Mutex<State>>) {
    let mut reader = BufReader::new(match stream.try_clone() {
        Ok(clone) => clone,
        Err(_) => return,
    });
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).is_err() {
        return;
    }
    let mut auth = String::new();
    loop {
        let mut line = String::new();
        match reader.read_line(&mut line) {
            Ok(0) => break,
            Ok(_) => {}
            Err(_) => break,
        }
        if line == "\r\n" || line == "\n" {
            break;
        }
        if let Some((name, value)) = line.split_once(':') {
            if name.trim().eq_ignore_ascii_case("authorization") {
                auth = value.trim().to_string();
            }
        }
    }
    let path = request_line
        .split_whitespace()
        .nth(1)
        .unwrap_or("/")
        .to_string();
    let route = path.split('?').next().unwrap_or("/").to_string();

    let mut state = state.lock().expect("fake state");
    state.requests.push(path.clone());
    state.auth.push(auth.clone());
    if state.rate_limit > 0 {
        state.rate_limit -= 1;
        drop(state);
        respond(
            &mut stream,
            429,
            "{\"error\":\"rate limited\"}",
            "Retry-After: 0\r\n",
        );
        return;
    }
    if let Some(status) = state.status {
        // Deliberately echo the credential back: a client that prints a response body fails
        // the leak test.
        let body = format!("{{\"error\":\"unauthorized\",\"echo\":\"{auth}\"}}");
        drop(state);
        respond(&mut stream, status, &body, "");
        return;
    }
    let (status, body) = match route.as_str() {
        "/api/v1/projects" => (200, Json::Array(state.projects.clone())),
        "/api/v1/sections" => (200, Json::Array(state.sections.clone())),
        "/api/v1/tasks" => (200, Json::Array(state.tasks.clone())),
        "/api/v1/tasks/completed/by_completion_date" => (200, Json::Array(state.completed.clone())),
        _ => (404, json!({"error": "not found"})),
    };
    drop(state);
    respond(&mut stream, status, &body.to_string(), "");
}

fn respond(stream: &mut TcpStream, status: u16, body: &str, extra: &str) {
    let reason = match status {
        200 => "OK",
        401 => "Unauthorized",
        404 => "Not Found",
        429 => "Too Many Requests",
        _ => "Error",
    };
    let _ = write!(
        stream,
        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\n\
         Content-Length: {}\r\nConnection: close\r\n{extra}\r\n{body}",
        body.len()
    );
    let _ = stream.flush();
}

// ---------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------

fn pull(f: &VaultFixture, args: &[&str]) -> (String, String, i32) {
    let output = f
        .cmd()
        .env("TODOIST_API_TOKEN", TOKEN)
        .args(["todoist", "pull"])
        .args(args)
        .output()
        .expect("run shards todoist pull");
    (
        String::from_utf8_lossy(&output.stdout).into_owned(),
        String::from_utf8_lossy(&output.stderr).into_owned(),
        output.status.code().unwrap_or(-1),
    )
}

fn pull_json(f: &VaultFixture) -> Json {
    let (stdout, stderr, code) = pull(f, &["--json"]);
    assert_eq!(code, 0, "stderr={stderr}");
    assert!(
        !stdout.trim().is_empty(),
        "empty stdout (code={code}) stderr={stderr}"
    );
    serde_json::from_str(stdout.trim()).unwrap_or_else(|e| panic!("json: {e}\n{stdout}"))
}

fn task_file(f: &VaultFixture, id: &str) -> String {
    f.files()
        .into_iter()
        .find(|path| path.ends_with(&format!("{id}.md")))
        .unwrap_or_else(|| panic!("no file for {id}: {:?}", f.files()))
}

fn get(f: &VaultFixture, id: &str) -> Json {
    let output = f
        .cmd()
        .args(["--json", "task", "get", id])
        .output()
        .expect("task get");
    assert!(output.status.success(), "{output:?}");
    serde_json::from_slice(&output.stdout).expect("json")
}

fn project(id: &str, name: &str) -> Json {
    json!({"id": id, "name": name})
}

fn section(id: &str, name: &str, project_id: &str) -> Json {
    json!({"id": id, "name": name, "project_id": project_id})
}

fn task(id: &str, content: &str, project_id: &str) -> Json {
    json!({"id": id, "content": content, "project_id": project_id})
}

fn seed_work(fake: &FakeTodoist) {
    let mut state = fake.state();
    state.projects = vec![project("p1", "Work")];
    state.sections = vec![section("s1", "Today", "p1")];
    state.tasks = vec![json!({
        "id": "101",
        "content": "Ship it",
        "description": "the body",
        "project_id": "p1",
        "section_id": "s1",
        "labels": ["x", "y"],
        "priority": 2,
        "due": {"date": "2026-11-05"},
        "deadline": {"date": "2026-11-06"}
    })];
}

// ---------------------------------------------------------------------------------------
// the pull maps every field and links the task
// ---------------------------------------------------------------------------------------

#[test]
fn a_pull_creates_a_task_with_the_todoist_link_and_every_mapped_field() {
    let fake = FakeTodoist::new();
    seed_work(&fake);
    let f = fake.fixture();
    let report = pull_json(&f);

    assert_eq!(report["counts"]["created"], 1);
    assert_eq!(report["counts"]["changes"], 1);
    let vault_id = report["tasks"][0]["vault_id"]
        .as_str()
        .expect("vault id")
        .to_string();
    assert!(vault_id.starts_with("t-"), "{vault_id}");

    let value = get(&f, &vault_id);
    assert_eq!(value["title"], "Ship it");
    assert_eq!(value["body"], "the body");
    assert_eq!(value["todoist_id"], "101");
    assert_eq!(value["todoist_project"], "Work");
    assert_eq!(value["section"], "Today");
    assert_eq!(value["priority"], "high");
    assert_eq!(value["due"], "2026-11-05");
    assert_eq!(value["deadline"], "2026-11-06");
    assert_eq!(value["tags"], json!(["x", "y"]));
    assert_eq!(value["status"], "open");
    assert!(value["todoist_digest"].as_str().is_some(), "{value}");

    let text = f.read(&task_file(&f, &vault_id));
    assert!(text.contains("todoist_id: \"101\""), "{text}");
    assert!(text.contains("todoist_project: Work"), "{text}");
}

#[test]
fn a_completed_todoist_task_lands_in_done_with_its_completion_stamp() {
    let fake = FakeTodoist::new();
    {
        let mut state = fake.state();
        state.projects = vec![project("p1", "Work")];
        state.completed = vec![json!({
            "id": "900",
            "content": "Already done",
            "project_id": "p1",
            "priority": 4,
            "completed_at": "2026-11-20T10:00:00Z",
            "is_completed": true
        })];
    }
    let f = fake.fixture();
    let report = pull_json(&f);
    let vault_id = report["tasks"][0]["vault_id"].as_str().expect("id");
    let value = get(&f, vault_id);
    assert_eq!(value["status"], "done");
    assert!(value["completed"].as_str().is_some(), "{value}");
    assert!(task_file(&f, vault_id).starts_with("tasks/done/"));
}

// ---------------------------------------------------------------------------------------
// idempotency
// ---------------------------------------------------------------------------------------

#[test]
fn a_second_pull_creates_nothing_and_reports_no_changes() {
    let fake = FakeTodoist::new();
    seed_work(&fake);
    let f = fake.fixture();
    let first = pull_json(&f);
    assert_eq!(first["counts"]["created"], 1);
    let id = first["tasks"][0]["vault_id"].as_str().expect("id");
    let before = f.read(&task_file(&f, id));

    let second = pull_json(&f);
    assert_eq!(second["counts"]["created"], 0);
    assert_eq!(second["counts"]["updated"], 0);
    assert_eq!(second["counts"]["changes"], 0);
    assert_eq!(second["counts"]["unchanged"], 1);
    // No write at all: the file is byte-identical, `updated` included.
    assert_eq!(f.read(&task_file(&f, id)), before);

    // Negative control: move the upstream state, and the same counter must react. Without this
    // step, "changes=0" could be a counter that never increments.
    fake.state().tasks[0]["content"] = json!("Ship it (renamed)");
    let third = pull_json(&f);
    assert_eq!(third["counts"]["created"], 0);
    assert_eq!(third["counts"]["updated"], 1);
    assert_eq!(third["counts"]["changes"], 1);
    assert_eq!(get(&f, id)["title"], "Ship it (renamed)");
}

#[test]
fn a_locally_edited_task_survives_and_is_marked_divergent() {
    let fake = FakeTodoist::new();
    seed_work(&fake);
    let f = fake.fixture();
    let first = pull_json(&f);
    let id = first["tasks"][0]["vault_id"].as_str().expect("id");

    let edit = f
        .cmd()
        .args(["--quiet", "task", "update", id, "--title", "Local title"])
        .output()
        .expect("task update");
    assert!(edit.status.success(), "{edit:?}");

    // Todoist also moves, so a blind pull would have overwritten the local title.
    fake.state().tasks[0]["content"] = json!("Remote title");

    let report = pull_json(&f);
    assert_eq!(report["counts"]["diverged"], 1);
    assert_eq!(report["counts"]["updated"], 0);
    assert_eq!(report["counts"]["changes"], 0);
    assert_eq!(report["tasks"][0]["action"], "diverged");
    assert_eq!(get(&f, id)["title"], "Local title");
}

// ---------------------------------------------------------------------------------------
// the project allow-list and the field report
// ---------------------------------------------------------------------------------------

#[test]
fn an_unmapped_project_is_reported_as_skipped_and_never_pulled() {
    let fake = FakeTodoist::new();
    {
        let mut state = fake.state();
        state.projects = vec![project("p1", "Work"), project("p2", "Someday")];
        state.tasks = vec![task("1", "Mirrored", "p1"), task("2", "Not mirrored", "p2")];
    }
    let f = fake.fixture();
    let report = pull_json(&f);
    assert_eq!(report["projects"]["mirrored"], json!(["Work"]));
    assert_eq!(report["projects"]["skipped"], json!(["Someday"]));
    assert_eq!(report["counts"]["created"], 1);

    let (stdout, _, _) = pull(&f, &[]);
    assert!(stdout.contains("skipped projects: Someday"), "{stdout}");
    let files = f.files();
    assert_eq!(
        files.iter().filter(|p| p.ends_with(".md")).count(),
        1,
        "{files:?}"
    );
}

#[test]
fn unrepresentable_fields_are_reported_per_task() {
    let fake = FakeTodoist::new();
    {
        let mut state = fake.state();
        state.projects = vec![project("p1", "Work")];
        state.tasks = vec![json!({
            "id": "7",
            "content": "Recurring and timed",
            "project_id": "p1",
            "priority": 3,
            "due": {
                "date": "2026-11-05",
                "datetime": "2026-11-05T09:00:00Z",
                "timezone": "Europe/Berlin",
                "is_recurring": true
            },
            "duration": {"amount": 30, "unit": "minute"},
            "assignee_id": "u9"
        })];
    }
    let f = fake.fixture();
    let report = pull_json(&f);
    let unsupported = report["tasks"][0]["unsupported"]
        .as_array()
        .expect("unsupported")
        .iter()
        .filter_map(Json::as_str)
        .collect::<Vec<_>>();
    for field in ["recurrence", "due.timezone", "duration", "assignee_id"] {
        assert!(unsupported.contains(&field), "{unsupported:?}");
    }

    let (stdout, _, _) = pull(&f, &[]);
    assert!(stdout.contains("field report:"), "{stdout}");
    for field in ["recurrence", "due.timezone", "duration", "assignee_id"] {
        assert!(stdout.contains(field), "{stdout}");
    }
}

#[test]
fn no_field_report_says_none_instead_of_disappearing() {
    let fake = FakeTodoist::new();
    seed_work(&fake);
    let f = fake.fixture();
    let (stdout, _, _) = pull(&f, &[]);
    assert!(stdout.contains("field report: none"), "{stdout}");
}

// ---------------------------------------------------------------------------------------
// subtasks
// ---------------------------------------------------------------------------------------

#[test]
fn an_unambiguous_subtask_gets_the_parent_and_an_unmirrored_one_is_skipped() {
    let fake = FakeTodoist::new();
    {
        let mut state = fake.state();
        state.projects = vec![project("p1", "Work"), project("p2", "Someday")];
        state.tasks = vec![
            task("1", "Parent", "p1"),
            json!({"id": "2", "content": "Child", "project_id": "p1", "parent_id": "1"}),
            json!({"id": "3", "content": "Elsewhere", "project_id": "p2"}),
            json!({"id": "4", "content": "Orphan", "project_id": "p1", "parent_id": "3"}),
        ];
    }
    let f = fake.fixture();
    let report = pull_json(&f);
    assert_eq!(report["counts"]["created"], 2);
    assert_eq!(report["counts"]["skipped"], 1);

    let tasks = report["tasks"].as_array().expect("tasks");
    let parent = tasks
        .iter()
        .find(|row| row["title"] == "Parent")
        .and_then(|row| row["vault_id"].as_str())
        .expect("parent id");
    let child = tasks
        .iter()
        .find(|row| row["title"] == "Child")
        .and_then(|row| row["vault_id"].as_str())
        .expect("child id");
    assert_eq!(get(&f, child)["parent"], parent);

    let orphan = tasks
        .iter()
        .find(|row| row["title"] == "Orphan")
        .expect("orphan row");
    assert_eq!(orphan["action"], "skipped");
    assert!(
        orphan["note"].as_str().unwrap_or("").contains("parent 3"),
        "{orphan}"
    );
}

// ---------------------------------------------------------------------------------------
// dry run
// ---------------------------------------------------------------------------------------

#[test]
fn a_dry_run_prints_intentions_and_writes_nothing() {
    let fake = FakeTodoist::new();
    seed_work(&fake);
    let f = fake.fixture();
    let (stdout, stderr, code) = pull(&f, &["--dry-run"]);
    assert_eq!(code, 0, "{stderr}");
    assert!(stdout.contains("dry run"), "{stdout}");
    assert!(stdout.contains("would create"), "{stdout}");
    assert!(stdout.contains("created=1"), "{stdout}");
    assert_eq!(f.files().iter().filter(|p| p.ends_with(".md")).count(), 0);

    // The same vault then receives the real create.
    let report = pull_json(&f);
    assert_eq!(report["counts"]["created"], 1);
}

// ---------------------------------------------------------------------------------------
// rate limiting and the token
// ---------------------------------------------------------------------------------------

#[test]
fn a_429_is_retried_with_backoff_and_the_count_is_reported() {
    let fake = FakeTodoist::new();
    seed_work(&fake);
    fake.state().rate_limit = 2;
    let f = fake.fixture();
    let report = pull_json(&f);
    assert_eq!(report["retries"], 2);
    assert_eq!(report["counts"]["created"], 1);
    assert!(fake.state().requests.len() >= 5, "requests were retried");

    fake.state().rate_limit = 1;
    let (stdout, _, _) = pull(&f, &[]);
    assert!(stdout.contains("retries=1"), "{stdout}");
}

#[test]
fn the_token_never_leaks_into_output_or_the_vault() {
    let fake = FakeTodoist::new();
    seed_work(&fake);
    fake.state().status = Some(401);
    let f = fake.fixture();
    let (stdout, stderr, code) = pull(&f, &["--json"]);
    assert_eq!(code, 2, "stdout={stdout} stderr={stderr}");
    assert!(stderr.contains("HTTP 401"), "{stderr}");
    assert!(!stdout.contains(TOKEN), "token on stdout: {stdout}");
    assert!(!stderr.contains(TOKEN), "token on stderr: {stderr}");

    // A successful pull must not write it either.
    fake.state().status = None;
    let report = pull_json(&f);
    assert_eq!(report["counts"]["created"], 1);
    for path in f.files() {
        let text = f.read(&path);
        assert!(!text.contains(TOKEN), "token in {path}");
    }
}

#[test]
fn the_token_is_read_from_a_dotenv_beside_the_config() {
    let fake = FakeTodoist::new();
    seed_work(&fake);
    let f = fake.fixture();
    let env_path = f.dir.path().join(".env");
    std::fs::write(&env_path, format!("TODOIST_API_TOKEN={TOKEN}\n")).expect("write .env");

    // No process environment value: the dotenv file is the only source.
    let output = f
        .cmd()
        .env_remove("TODOIST_API_TOKEN")
        .args(["todoist", "pull", "--json"])
        .output()
        .expect("run pull");
    assert!(output.status.success(), "{output:?}");
    let report: Json = serde_json::from_slice(&output.stdout).expect("json");
    assert_eq!(report["counts"]["created"], 1);
    let auth = fake.state().auth.last().cloned().unwrap_or_default();
    assert_eq!(auth, format!("Bearer {TOKEN}"));
}

// ---------------------------------------------------------------------------------------
// config guards
// ---------------------------------------------------------------------------------------

#[test]
fn a_pull_without_an_allow_list_is_refused_before_any_request() {
    let fake = FakeTodoist::new();
    seed_work(&fake);
    let f = fake.fixture_with_projects("[]");
    let (_, stderr, code) = pull(&f, &[]);
    assert_eq!(code, 2);
    assert!(stderr.contains("[todoist].projects is empty"), "{stderr}");
    assert!(fake.state().requests.is_empty(), "no request was sent");
}
