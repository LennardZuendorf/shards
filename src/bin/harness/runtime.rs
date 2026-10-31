use super::{
    hosts::{HookResult, NormalizedEvent},
    json::{digest, text_digest},
    reader::Reader,
    shell,
    state::{self, ExceptionScope, Result, SessionKey, TaskEvidence},
};
use serde_json::{json, Value};
use std::{
    cell::Cell,
    collections::BTreeMap,
    path::{Path, PathBuf},
};

const READS: &str = "note_get note_list task_get task_list task_next search health recent_activity build_context graph project session_start memory_get memory_list memory_recall scratch_get scratch_list asset_get asset_list";
const WRITES: &str = "task_new task_claim task_append task_update task_release task_finish scratch_set scratch_append note_new note_append note_update note_adopt note_claim note_release memory_new memory_append memory_update asset_attach task_block task_unblock task_cancel";
pub struct Dependencies {
    pub state_root: PathBuf,
    pub executable: PathBuf,
    pub reader: Reader,
    pub package: PathBuf,
}

pub fn find_enrollment(cwd: &Path) -> Result<Option<(PathBuf, state::Enrollment)>> {
    let cwd = shards::storage::realpath(cwd);
    for candidate in cwd.ancestors() {
        if let Some(enrollment) = state::load_enrollment(candidate)? {
            return Ok(Some((candidate.to_path_buf(), enrollment)));
        }
        if candidate.join(".git").exists() {
            break;
        }
    }
    Ok(None)
}
fn result(event: &NormalizedEvent, action: &str, reason: String, context: String) -> HookResult {
    HookResult::new(action, &event.event_kind)
        .reason(&reason)
        .context(&context)
}
fn allow(event: &NormalizedEvent) -> HookResult {
    result(event, "allow", String::new(), String::new())
}
fn namespace(event: &NormalizedEvent) -> Option<&str> {
    let mut prefix = "mcp__shards__shards_";
    let name = event.tool_name.as_deref()?;
    if event.host == "claude" {
        if name.starts_with("mcp__plugin_shards_shards__shards_")
            && event.mcp_server == Some(json!({"name":"plugin:shards:shards","source":"plugin"}))
        {
            prefix = "mcp__plugin_shards_shards__shards_";
        } else if event.mcp_server != Some(json!({"name":"shards","source":"dynamic"})) {
            return None;
        }
    }
    let suffix = name.strip_prefix(prefix)?;
    if READS
        .split_whitespace()
        .chain(WRITES.split_whitespace())
        .any(|v| v == suffix)
    {
        Some(suffix)
    } else {
        None
    }
}
fn orientation(event: &NormalizedEvent, package: &Path) -> bool {
    if namespace(event).is_some_and(|v| READS.split_whitespace().any(|r| r == v)) {
        return true;
    }
    let args = event.tool_input.as_ref().unwrap_or(&Value::Null);
    let name = event.tool_name.as_deref().unwrap_or("");
    if matches!(
        name,
        "AskUserQuestion" | "request_user_input" | "functions.request_user_input"
    ) {
        return true;
    }
    let skills: Vec<String> = ["shards", "using-shards"]
        .iter()
        .map(|name| {
            shards::storage::realpath(&package.join("skills").join(name).join("SKILL.md"))
                .to_string_lossy()
                .into_owned()
        })
        .collect();
    if matches!(name, "Skill" | "skill") {
        return args.get("skill").and_then(Value::as_str).is_some_and(|v| {
            matches!(
                v,
                "shards" | "using-shards" | "shards:shards" | "shards:using-shards"
            )
        });
    }
    if matches!(name, "Read" | "read_file") {
        return args
            .get("file_path")
            .or_else(|| args.get("path"))
            .and_then(Value::as_str)
            .is_some_and(|v| skills.iter().any(|s| s == v));
    }
    if matches!(name, "Bash" | "exec_command" | "functions.exec_command") {
        let Some(command) = args
            .get("command")
            .or_else(|| args.get("cmd"))
            .and_then(Value::as_str)
        else {
            return false;
        };
        if command.chars().any(|c| ";|&<>`$\n".contains(c)) {
            return false;
        }
        let Some(words) = shell::words(command, false) else {
            return false;
        };
        return words == ["shards", "--version"]
            || words == ["command", "-v", "shards"]
            || (words.len() == 2 && words[0] == "cat" && skills.contains(&words[1]));
    }
    false
}
pub fn record_fields(text: &str) -> BTreeMap<String, String> {
    let mut fields = BTreeMap::new();
    for line in text.lines() {
        if let Some((name, value)) = line.trim().split_once(':') {
            let name = name.to_lowercase();
            if value.chars().any(char::is_alphanumeric)
                && fields.insert(name, value.trim().into()).is_some()
            {
                return BTreeMap::new();
            }
        }
    }
    fields
}
fn checkpoint_state(text: &str) -> Option<String> {
    let fields = record_fields(text);
    if !["state", "changed", "checked", "remaining", "next"]
        .iter()
        .all(|v| fields.contains_key(*v))
    {
        return None;
    }
    let state = fields.get("state")?.trim_end_matches('.').to_lowercase();
    if matches!(
        state.as_str(),
        "continuing" | "waiting" | "error" | "handoff" | "completed"
    ) {
        Some(state)
    } else {
        None
    }
}
fn tags_only(args: &Value) -> bool {
    args.as_object()
        .is_some_and(|map| map.keys().all(|v| matches!(v.as_str(), "task_id" | "tags")))
        && args.get("tags").and_then(Value::as_str).is_some_and(|v| {
            !v.is_empty()
                && v.split(',').all(|t| {
                    matches!(
                        t.trim(),
                        "+needs-input" | "-needs-input" | "+agent-error" | "-agent-error"
                    )
                })
        })
}
fn required<'a>(args: &'a Value, key: &str) -> Result<&'a str> {
    args.get(key)
        .and_then(Value::as_str)
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| format!("missing nonempty {key}"))
}

pub fn run_event(event: &NormalizedEvent, deps: &Dependencies) -> HookResult {
    let safe = orientation(event, &deps.package);
    let mut scope = None;
    match policy(event, deps, safe, &mut scope) {
        Ok(value) => value,
        Err(error) => {
            let mut message = format!("Shards harness: {error}");
            eprintln!("{message}");
            if event.event_kind == "PreToolUse" && !safe {
                if let Some(scope) = scope {
                    match state::request_exception(&deps.state_root, &scope) {
                        Ok(request) => {
                            let executable = &deps.executable;
                            message.push_str(&format!("\nFor an explicit one-use operator exception, the operator can run: '{}' --operator-exception {} --reason \"specific approved reason\". The agent must not self-grant. Native approval policy still applies.", executable.display().to_string().replace('\'', "'\\''"), request.request_id));
                        }
                        Err(error) => eprintln!("Cannot persist exception request: {error}"),
                    }
                }
                result(event, "deny", message, String::new())
            } else {
                allow(event)
            }
        }
    }
}
fn policy(
    event: &NormalizedEvent,
    deps: &Dependencies,
    safe: bool,
    scope: &mut Option<ExceptionScope>,
) -> Result<HookResult> {
    let Some((project, enrollment)) = find_enrollment(Path::new(&event.cwd))? else {
        return Ok(allow(event));
    };
    if !enrollment.enabled {
        return Ok(allow(event));
    }
    let args = event.tool_input.as_ref().unwrap_or(&Value::Null);
    if event.event_kind == "PreToolUse"
        && matches!(
            event.tool_name.as_deref(),
            Some("Bash" | "exec_command" | "functions.exec_command")
        )
        && args
            .get("command")
            .or_else(|| args.get("cmd"))
            .and_then(Value::as_str)
            .is_some_and(shell::invokes_operator_grant)
    {
        return Ok(result(event,"deny","Operator exception grants must run outside participating agent tools. The agent must not self-grant, even while bound.".into(),String::new()));
    }
    let call_ref = digest(
        &json!({"host":event.host,"session":event.session_id,"delegate":event.agent_id,"turn":event.turn_id,"tool":event.tool_name,"call":event.call_id,"input_sha256":digest(args)?}),
    )?;
    if event.event_kind == "PreToolUse" && !safe {
        let request_scope = ExceptionScope {
            project: project.clone(),
            config_path: enrollment.config_path.clone(),
            host: event.host.clone(),
            session_id: event.session_id.clone(),
            delegated_agent_id: event.agent_id.clone(),
            turn_id: event.turn_id.clone().ok_or("missing turn ID")?,
            tool_name: event.tool_name.clone().ok_or("missing tool name")?,
            tool_input_sha256: digest(args)?,
        };
        *scope = Some(request_scope.clone());
        if let Some(grant) = state::consume_exception(&deps.state_root, &request_scope)? {
            eprintln!("Shards scoped operator exception consumed: {}; reason: {}; host={} session={} tool={}. Native approval policy still applies.", grant.request_id, grant.reason.unwrap_or_default(), event.host,event.session_id,event.tool_name.as_deref().unwrap_or(""));
            return Ok(allow(event));
        }
    }
    let (vault, actor) = match deps.reader.context() {
        Ok(value) => value,
        Err(_) if event.event_kind == "PreToolUse" && safe => return Ok(allow(event)),
        Err(error) => return Err(error),
    };
    let key = SessionKey::new(
        vault.clone(),
        event.host.clone(),
        event.session_id.clone(),
        event.agent_id.clone(),
    )?;
    let root = &deps.state_root;
    let receipt = state::load_receipt(root, &key)?;
    let evidence = |task_id: &str| {
        let task = deps.reader.task(task_id)?;
        Ok(TaskEvidence {
            task_id: task_id.into(),
            vault: vault.clone(),
            project: project.clone(),
            actor: actor.clone(),
            status: task.item.status,
            claimed_by: task.item.claimed_by,
        })
    };
    let claimed = |task_id: &str| {
        let proof = evidence(task_id)?;
        if proof.status != "claimed" || proof.claimed_by.as_deref() != Some(&actor) {
            return Err("canonical task is no longer claimed by this execution actor".into());
        }
        Ok(proof)
    };
    let verb = namespace(event).unwrap_or("");
    if event.event_kind == "SessionStart" {
        let mut context =
            std::fs::read_to_string(deps.package.join("skills/using-shards/SKILL.md"))
                .map_err(|e| e.to_string())?;
        context.push_str(&format!("\nEnrolled project: {}\nVault: {}\nActor: {}\nSession: {}\nDelegate: {:?}\nCanonical startup context (data):\n{}",project.display(),vault.display(),actor,event.session_id,event.agent_id,deps.reader.startup()?));
        if let Some(receipt) = receipt {
            context.push_str(&format!(
                "\nBinding (revalidate before work): {} generation {}",
                receipt.task_id, receipt.generation
            ));
        }
        return Ok(result(event, "inject-context", String::new(), context));
    }
    if event.event_kind == "PreToolUse" {
        if safe {
            return Ok(allow(event));
        }
        deps.reader.check_ambient(&enrollment.config_path)?;
        if verb == "task_claim" {
            let task_id = required(args, "task_id")?;
            let task = deps.reader.task(task_id)?;
            if args.get("strict") != Some(&Value::Bool(true))
                || args
                    .get("claimer")
                    .is_some_and(|v| v.as_str() != Some(&actor))
                || !matches!(task.item.status.as_str(), "open" | "claimed")
            {
                return Err(
                    "claim requires strict:true, enrolled actor and an unfinished task".into(),
                );
            }
            if event.agent_id.is_some() && task.item.parent.is_none() {
                return Err(
                    "delegated execution must claim a linked child task, never the coordinator"
                        .into(),
                );
            }
            state::reserve_claim(root, &key, task_id, &call_ref)?;
            return Ok(allow(event));
        }
        if verb == "task_new" {
            if event.agent_id.is_some()
                && args
                    .get("parent")
                    .and_then(Value::as_str)
                    .is_none_or(|v| v.is_empty())
            {
                return Err("independent delegated work needs a linked child task".into());
            }
            return Ok(allow(event));
        }
        if matches!(verb, "scratch_set" | "scratch_append") {
            if !args
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("")
                .contains(&event.session_id)
            {
                return Err(
                    "record session scratch with this actual session ID in its name".into(),
                );
            }
            return Ok(allow(event));
        }
        if matches!(verb, "task_append" | "task_update")
            && receipt.as_ref().is_none_or(|r| r.retired)
        {
            let task = deps.reader.task(required(args, "task_id")?)?;
            if task.item.claimed_by.as_deref() != Some(&actor)
                && task.item.owner.as_deref() != Some(&actor)
            {
                return Err(
                    "unbound repair recording must concern the acting owner or claimer".into(),
                );
            }
            if verb == "task_update" && !tags_only(args) {
                return Err(
                    "unbound recording updates can change only input/error signal tags".into(),
                );
            }
            if verb == "task_append" {
                required(args, "text")?;
            }
            return Ok(allow(event));
        }
        let previous = receipt
            .as_ref()
            .filter(|r| !r.retired)
            .ok_or("claim this execution task and append Intent: and Approach: before work")?;
        if verb == "task_append"
            && args.get("task_id").and_then(Value::as_str) == Some(&previous.task_id)
        {
            let task = deps.reader.task(&previous.task_id)?;
            if matches!(task.item.status.as_str(), "done" | "cancelled") {
                let text = required(args, "text")?;
                if checkpoint_state(text).as_deref() != Some("handoff") {
                    return Err("terminal observation permits only a complete State: handoff checkpoint; substantive work stays blocked".into());
                }
                let prior = state::load_call_reservation(root, &key, &previous.task_id, &call_ref)?;
                let before = prior
                    .and_then(|r| r.before_text_occurrences)
                    .unwrap_or(task.body.matches(text).count() as u64);
                state::reserve_call(
                    root,
                    &key,
                    &previous.task_id,
                    &call_ref,
                    "append",
                    Some(text_digest(text)),
                    Some(before),
                    Some(previous.generation),
                )?;
                return Ok(allow(event));
            }
        }
        let current = state::reconcile_binding(
            root,
            &key,
            &evidence,
            None,
            &previous.task_id,
            previous.generation,
        )?;
        if matches!(
            verb,
            "task_append" | "task_update" | "task_release" | "task_finish" | "task_cancel"
        ) {
            if required(args, "task_id")? != current.task_id {
                return Err("lifecycle call must target this execution task".into());
            }
            if verb == "task_update" && !tags_only(args) {
                return Err("before work, recording updates can change only signal tags".into());
            }
            if matches!(verb, "task_release" | "task_finish" | "task_cancel")
                && (!matches!(
                    current.phase.as_str(),
                    "checkpointed" | "waiting" | "handoff" | "completed"
                ) || current.work_sequence != current.checkpoint_sequence)
            {
                return Err("append Changed:, Checked:, Remaining: and Next: checkpoint before release or finish".into());
            }
            if verb == "task_finish" && current.phase != "completed" {
                return Err(
                    "finish requires a completed checkpoint with verification evidence".into(),
                );
            }
            if verb != "task_update" {
                let (hash, before) = if verb == "task_append" {
                    let text = required(args, "text")?;
                    let prior =
                        state::load_call_reservation(root, &key, &current.task_id, &call_ref)?;
                    (
                        Some(text_digest(text)),
                        Some(
                            prior.and_then(|r| r.before_text_occurrences).unwrap_or(
                                deps.reader
                                    .task(&current.task_id)?
                                    .body
                                    .matches(text)
                                    .count() as u64,
                            ),
                        ),
                    )
                } else {
                    (None, None)
                };
                state::reserve_call(
                    root,
                    &key,
                    &current.task_id,
                    &call_ref,
                    verb.strip_prefix("task_").unwrap_or(verb),
                    hash,
                    before,
                    Some(current.generation),
                )?;
            }
            return Ok(allow(event));
        }
        if current.phase == "bound" {
            return Err("append starting Intent: and Approach: before work".into());
        }
        state::update_receipt(
            root,
            &key,
            &|r| {
                let mut r = r.clone();
                if r.phase == "bound" {
                    return Err("starting intent must be recorded before work".into());
                }
                if !r.seen_event_ids.contains(&call_ref) {
                    r.phase = "working".into();
                    r.work_sequence += 1;
                    r.seen_event_ids.push(call_ref.clone());
                }
                Ok(r)
            },
            &current.task_id,
            current.generation,
            Some(&claimed),
        )?;
        return Ok(allow(event));
    }
    if event.event_kind == "PostToolUse"
        && matches!(
            verb,
            "task_claim" | "task_append" | "task_release" | "task_finish" | "task_cancel"
        )
    {
        let task_id = required(args, "task_id")?;
        let observed = event
            .tool_result
            .as_ref()
            .ok_or("successful canonical task result required")?;
        if observed.get("type").and_then(Value::as_str) != Some("task")
            || observed.get("id").and_then(Value::as_str) != Some(task_id)
            || observed.get("error").is_some()
        {
            return Err("successful canonical task result required".into());
        }
        let reservation = state::load_call_reservation(root, &key, task_id, &call_ref)?
            .ok_or("missing original pre-execution reservation; reconcile manually")?;
        if reservation.operation != verb.strip_prefix("task_").unwrap_or(verb) {
            return Err(
                "lifecycle callback operation differs from its original reservation".into(),
            );
        }
        if verb == "task_claim" {
            if observed.get("status").and_then(Value::as_str) != Some("claimed")
                || observed.get("claimed_by").and_then(Value::as_str) != Some(&actor)
            {
                return Err("claim result must show claimed by enrolled actor".into());
            }
            state::bind_task(
                root,
                &key,
                task_id,
                &evidence,
                &reservation.call_ref,
                reservation.expected_generation,
                None,
            )?;
            return Ok(allow(event));
        }
        let receipt = receipt
            .as_ref()
            .filter(|r| r.task_id == task_id && r.generation == reservation.expected_generation)
            .ok_or("stale lifecycle callback cannot modify current execution")?;
        if verb == "task_append" {
            let text = required(args, "text")?;
            if Some(text_digest(text)) != reservation.text_sha256 {
                return Err("append text differs from original reservation".into());
            }
            let terminal = Cell::new(false);
            let append_evidence = |candidate: &str| {
                let task = deps.reader.task(candidate)?;
                if task.body.matches(text).count() as u64
                    <= reservation
                        .before_text_occurrences
                        .ok_or("append reservation lacks occurrence count")?
                {
                    return Err("new append occurrence absent from canonical task body".into());
                }
                if matches!(task.item.status.as_str(), "done" | "cancelled")
                    && checkpoint_state(text).as_deref() == Some("handoff")
                {
                    terminal.set(true);
                } else if task.item.status != "claimed"
                    || task.item.claimed_by.as_deref() != Some(&actor)
                {
                    return Err(
                        "append cannot authorize a task no longer claimed by this actor".into(),
                    );
                }
                Ok(TaskEvidence {
                    task_id: candidate.into(),
                    vault: vault.clone(),
                    project: project.clone(),
                    actor: actor.clone(),
                    status: task.item.status,
                    claimed_by: task.item.claimed_by,
                })
            };
            let recorded = state::update_receipt(
                root,
                &key,
                &|current| {
                    let mut next = current.clone();
                    if current.seen_event_ids.contains(&call_ref) {
                        return Ok(next);
                    }
                    if current.phase == "bound" && !terminal.get() {
                        let fields = record_fields(text);
                        if fields.contains_key("approach")
                            && ["intent", "starting intent", "intended result"]
                                .iter()
                                .any(|label| fields.contains_key(*label))
                        {
                            next.phase = "working".into();
                            next.seen_event_ids.push(call_ref.clone());
                        }
                        return Ok(next);
                    }
                    if let Some(phase) = checkpoint_state(text) {
                        next.seen_event_ids.push(call_ref.clone());
                        if reservation.work_sequence < current.checkpoint_sequence {
                            return Ok(next);
                        }
                        next.phase = if reservation.work_sequence != current.work_sequence {
                            "working".into()
                        } else {
                            match phase.as_str() {
                                "continuing" => "checkpointed".into(),
                                "error" => "waiting".into(),
                                _ => phase,
                            }
                        };
                        next.checkpoint_sequence = reservation.work_sequence;
                        next.last_lifecycle_call = Some(call_ref.clone());
                    }
                    Ok(next)
                },
                task_id,
                reservation.expected_generation,
                Some(&append_evidence),
            )?;
            if terminal.get() {
                if recorded.last_lifecycle_call.as_deref() != Some(&call_ref)
                    || recorded.work_sequence != recorded.checkpoint_sequence
                {
                    return Err(
                        "terminal handoff predates later work; append a current handoff checkpoint"
                            .into(),
                    );
                }
                state::retire_observed_terminal(
                    root,
                    &key,
                    task_id,
                    &append_evidence,
                    &call_ref,
                    reservation.expected_generation,
                )?;
                eprintln!("Shards observed-terminal reconciliation: retired local binding for {task_id} after verified handoff; no finish or cancel was executed by the hook.");
            }
            return Ok(allow(event));
        }
        if reservation.work_sequence != receipt.work_sequence {
            return Err("work occurred after lifecycle PRE; reconcile before retirement".into());
        }
        let task = deps.reader.task(task_id)?;
        let outcome = if matches!(verb, "task_finish" | "task_cancel") {
            "completed"
        } else if task.item.tags.iter().any(|t| t == "needs-input") {
            "waiting"
        } else {
            "handoff"
        };
        state::retire_binding(
            root,
            &key,
            task_id,
            &|id| {
                Ok(state::RetirementEvidence {
                    task: evidence(id)?,
                    lifecycle_call: call_ref.clone(),
                    checkpoint_call: receipt
                        .last_lifecycle_call
                        .clone()
                        .ok_or("missing checkpoint reference")?,
                    outcome: outcome.into(),
                })
            },
            reservation.expected_generation,
        )?;
    }
    if matches!(event.event_kind.as_str(), "Stop" | "SubagentStop") {
        if let Some(receipt) = receipt.filter(|r| {
            !r.retired && r.phase != "bound" && r.work_sequence != r.checkpoint_sequence
        }) {
            if receipt.stop_attempt_sequence >= receipt.work_sequence || event.stop_hook_active {
                eprintln!("Shards recording failure: checkpoint still missing; yielding with unfinished task {}",receipt.task_id);
                return Ok(allow(event));
            }
            state::update_receipt(
                root,
                &key,
                &|r| {
                    let mut r = r.clone();
                    r.stop_attempt_sequence = r.work_sequence;
                    Ok(r)
                },
                &receipt.task_id,
                receipt.generation,
                None,
            )?;
            return Ok(result(event,"continue","Append a durable checkpoint with Changed:, Checked:, Remaining: and Next:. Do not finish merely because this turn ends. If recording fails, report the exact blocker and yield.".into(),String::new()));
        }
    }
    Ok(allow(event))
}
