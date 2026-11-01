use super::{json::digest, store::Store};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};
fn required_option<'de, D: serde::Deserializer<'de>, T: Deserialize<'de>>(
    d: D,
) -> std::result::Result<Option<T>, D::Error> {
    Option::<T>::deserialize(d)
}
fn canonical_path<'de, D: serde::Deserializer<'de>>(
    d: D,
) -> std::result::Result<PathBuf, D::Error> {
    let p = PathBuf::deserialize(d)?;
    path(&p).map_err(serde::de::Error::custom)
}
pub type Result<T> = std::result::Result<T, String>;
pub const WORK_EVENT_LIMIT: usize = 4094;
pub const CHECKPOINT_EVENT_LIMIT: usize = 4097;
pub const RECEIPT_EVENT_LIMIT: usize = 4098;
fn text(s: &str) -> Result<()> {
    if s.is_empty() || s.contains('\0') {
        Err("expected nonempty string without NUL".into())
    } else {
        Ok(())
    }
}
fn path(p: &Path) -> Result<PathBuf> {
    if !p.is_absolute() || p.as_os_str().as_encoded_bytes().contains(&0) {
        return Err("expected absolute path without NUL".into());
    }
    Ok(shards::storage::realpath(p))
}
fn sha(s: &str) -> Result<()> {
    if s.len() != 64
        || !s
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        Err("expected lowercase SHA256 digest".into())
    } else {
        Ok(())
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SessionKey {
    #[serde(deserialize_with = "canonical_path")]
    pub vault: PathBuf,
    pub host: String,
    pub session_id: String,
    #[serde(deserialize_with = "required_option")]
    pub delegated_agent_id: Option<String>,
}
impl SessionKey {
    pub fn new(
        vault: PathBuf,
        host: String,
        session_id: String,
        delegated_agent_id: Option<String>,
    ) -> Result<Self> {
        let v = Self {
            vault: path(&vault)?,
            host,
            session_id,
            delegated_agent_id,
        };
        v.validate()?;
        Ok(v)
    }
    pub fn validate(&self) -> Result<()> {
        path(&self.vault)?;
        text(&self.host)?;
        text(&self.session_id)?;
        if let Some(s) = &self.delegated_agent_id {
            text(s)?;
        }
        Ok(())
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Enrollment {
    pub version: u64,
    pub enabled: bool,
    #[serde(deserialize_with = "canonical_path")]
    pub config_path: PathBuf,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TaskEvidence {
    pub task_id: String,
    #[serde(deserialize_with = "canonical_path")]
    pub vault: PathBuf,
    #[serde(deserialize_with = "canonical_path")]
    pub project: PathBuf,
    pub actor: String,
    pub status: String,
    #[serde(deserialize_with = "required_option")]
    pub claimed_by: Option<String>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ClaimReservation {
    pub key: SessionKey,
    pub task_id: String,
    pub claim_call: String,
    pub expected_generation: u64,
    #[serde(deserialize_with = "required_option")]
    pub retirement_call: Option<String>,
    pub version: u64,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CallReservation {
    pub key: SessionKey,
    pub task_id: String,
    pub call_ref: String,
    pub operation: String,
    pub expected_generation: u64,
    #[serde(deserialize_with = "required_option")]
    pub retirement_call: Option<String>,
    pub work_sequence: u64,
    #[serde(deserialize_with = "required_option")]
    pub text_sha256: Option<String>,
    #[serde(deserialize_with = "required_option")]
    pub before_text_occurrences: Option<u64>,
    pub version: u64,
}
impl CallReservation {
    pub fn validate(&self) -> Result<()> {
        self.key.validate()?;
        text(&self.task_id)?;
        text(&self.call_ref)?;
        if self.version != 1
            || !["claim", "append", "release", "finish", "cancel"]
                .contains(&self.operation.as_str())
        {
            return Err("invalid lifecycle reservation".into());
        }
        if let Some(s) = &self.retirement_call {
            text(s)?;
        }
        if self.operation == "append" {
            sha(self
                .text_sha256
                .as_deref()
                .ok_or("append requires text digest")?)?;
            self.before_text_occurrences
                .ok_or("append requires occurrence count")?;
        } else if self.text_sha256.is_some() || self.before_text_occurrences.is_some() {
            return Err("text context only valid for append".into());
        }
        Ok(())
    }
    fn claim(&self) -> Result<ClaimReservation> {
        if self.operation != "claim" {
            return Err("call reference was not reserved for a claim".into());
        }
        Ok(ClaimReservation {
            key: self.key.clone(),
            task_id: self.task_id.clone(),
            claim_call: self.call_ref.clone(),
            expected_generation: self.expected_generation,
            retirement_call: self.retirement_call.clone(),
            version: self.version,
        })
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ExceptionScope {
    #[serde(deserialize_with = "canonical_path")]
    pub project: PathBuf,
    #[serde(deserialize_with = "canonical_path")]
    pub config_path: PathBuf,
    pub host: String,
    pub session_id: String,
    #[serde(deserialize_with = "required_option")]
    pub delegated_agent_id: Option<String>,
    pub turn_id: String,
    pub tool_name: String,
    pub tool_input_sha256: String,
}
impl ExceptionScope {
    pub fn validate(&self) -> Result<()> {
        path(&self.project)?;
        path(&self.config_path)?;
        for s in [&self.host, &self.session_id, &self.turn_id, &self.tool_name] {
            text(s)?;
        }
        if let Some(s) = &self.delegated_agent_id {
            text(s)?;
        }
        sha(&self.tool_input_sha256)
    }
    fn id(&self) -> Result<String> {
        self.validate()?;
        digest(&serde_json::to_value(self).map_err(|e| e.to_string())?)
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ExceptionRequest {
    pub request_id: String,
    pub scope: ExceptionScope,
    #[serde(deserialize_with = "required_option")]
    pub reason: Option<String>,
    pub consumed: bool,
    pub revision: u64,
    pub version: u64,
}
impl ExceptionRequest {
    pub fn validate(&self) -> Result<()> {
        if self.version != 1
            || self.request_id != self.scope.id()?
            || self.consumed && self.reason.is_none()
        {
            return Err("invalid exception state/identity".into());
        }
        if let Some(s) = &self.reason {
            reason(s)?;
        }
        Ok(())
    }
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RetirementEvidence {
    pub task: TaskEvidence,
    pub lifecycle_call: String,
    pub checkpoint_call: String,
    pub outcome: String,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Receipt {
    pub key: SessionKey,
    #[serde(deserialize_with = "canonical_path")]
    pub project: PathBuf,
    pub actor: String,
    pub task_id: String,
    pub claim_call: String,
    pub generation: u64,
    pub retired: bool,
    #[serde(deserialize_with = "required_option")]
    pub retirement_call: Option<String>,
    pub phase: String,
    pub work_sequence: u64,
    pub checkpoint_sequence: u64,
    #[serde(deserialize_with = "required_option")]
    pub last_lifecycle_call: Option<String>,
    pub seen_event_ids: Vec<String>,
    pub stop_attempt_sequence: u64,
    pub revision: u64,
    pub version: u64,
}
impl Receipt {
    pub fn validate(&self) -> Result<()> {
        self.key.validate()?;
        path(&self.project)?;
        text(&self.actor)?;
        text(&self.task_id)?;
        text(&self.claim_call)?;
        if self.version != 1
            || self.generation == 0
            || ![
                "bound",
                "working",
                "checkpointed",
                "waiting",
                "handoff",
                "completed",
            ]
            .contains(&self.phase.as_str())
            || self.checkpoint_sequence > self.work_sequence
            || self.stop_attempt_sequence > self.work_sequence
        {
            return Err("invalid receipt version/generation/phase/counters".into());
        }
        if let Some(s) = &self.last_lifecycle_call {
            text(s)?;
        }
        let mut seen = HashSet::new();
        for s in &self.seen_event_ids {
            text(s)?;
            if !seen.insert(s) {
                return Err("duplicate persisted event reference".into());
            }
        }
        if !seen.contains(&self.claim_call) || seen.len() > RECEIPT_EVENT_LIMIT {
            return Err("invalid claim reference or receipt capacity".into());
        }
        if self.retired {
            if !["waiting", "handoff", "completed"].contains(&self.phase.as_str())
                || self.work_sequence != self.checkpoint_sequence
                || !self
                    .retirement_call
                    .as_ref()
                    .is_some_and(|s| seen.contains(s))
                || !self
                    .last_lifecycle_call
                    .as_ref()
                    .is_some_and(|s| seen.contains(s))
            {
                return Err(
                    "retirement requires recorded lifecycle and clean checkpoint proof".into(),
                );
            }
        } else if self.retirement_call.is_some() {
            return Err("active receipt cannot contain retirement proof".into());
        }
        Ok(())
    }
}
fn sid(k: &SessionKey) -> Result<String> {
    k.validate()?;
    digest(&serde_json::to_value(k).map_err(|e| e.to_string())?)
}
fn tid(k: &SessionKey, t: &str) -> Result<String> {
    digest(&json!([k.vault, t]))
}
fn receipt_name(k: &SessionKey) -> Result<String> {
    Ok(format!("receipt-{}.json", sid(k)?))
}
fn binding_name(k: &SessionKey, t: &str) -> Result<String> {
    Ok(format!("binding-{}.json", tid(k, t)?))
}
fn retired_name(r: &Receipt) -> Result<String> {
    Ok(format!(
        "retired-{}-{}-{}.json",
        sid(&r.key)?,
        tid(&r.key, &r.task_id)?,
        r.generation
    ))
}
fn call_name(k: &SessionKey, c: &str) -> Result<String> {
    Ok(format!("call-{}-{}.json", sid(k)?, digest(&json!(c))?))
}
fn read(s: &Store, n: &str) -> Result<Option<Receipt>> {
    let r: Option<Receipt> = s.read(n)?;
    if let Some(r) = &r {
        r.validate()?;
    }
    Ok(r)
}
fn scan(s: &Store, prefix: &str) -> Result<Vec<(String, Receipt)>> {
    let records = s.scan::<Receipt>(prefix)?;
    for (_, r) in &records {
        r.validate()?;
    }
    Ok(records)
}
fn records(s: &Store, k: &SessionKey) -> Result<Vec<Receipt>> {
    let mut out = Vec::new();
    if let Some(r) = read(s, &receipt_name(k)?)? {
        if &r.key != k {
            return Err("receipt identity does not match its path".into());
        }
        out.push(r);
    }
    for prefix in ["binding-", "retired-"] {
        for (n, r) in scan(s, prefix)? {
            if &r.key == k {
                if prefix == "retired-" && (!r.retired || n != retired_name(&r)?) {
                    return Err("invalid retirement tombstone identity".into());
                }
                out.push(r);
            }
        }
    }
    Ok(out)
}
fn session(s: &Store, k: &SessionKey) -> Result<Option<Receipt>> {
    let mut generations: BTreeMap<u64, Vec<Receipt>> = BTreeMap::new();
    for r in records(s, k)? {
        generations.entry(r.generation).or_default().push(r);
    }
    let mut newest = Vec::new();
    for candidates in generations.values() {
        let best = candidates
            .iter()
            .max_by_key(|r| r.revision)
            .ok_or("missing generation")?;
        for r in candidates {
            if (r.task_id.as_str(), r.claim_call.as_str())
                != (best.task_id.as_str(), best.claim_call.as_str())
            {
                return Err("generation references conflicting task/claim identities".into());
            }
            if r.revision == best.revision && r != best {
                return Err("conflicting receipt markers at same revision".into());
            }
            if r.retired && !best.retired {
                return Err("retired generation cannot reactivate".into());
            }
        }
        newest.push(best.clone());
    }
    let current = newest.iter().max_by_key(|r| r.generation);
    if let Some(c) = current {
        if newest
            .iter()
            .any(|r| !r.retired && r.generation != c.generation)
        {
            return Err("multiple active generations".into());
        }
    }
    Ok(current.cloned())
}
fn expect(r: Option<Receipt>, t: &str, g: u64, active: bool) -> Result<Receipt> {
    let r = r.ok_or("no receipt; bind a verified task first")?;
    if r.task_id != t || r.generation != g {
        return Err("stale task/generation".into());
    }
    if active && r.retired {
        return Err("binding generation is retired".into());
    }
    Ok(r)
}
fn evidence(
    e: TaskEvidence,
    k: &SessionKey,
    t: &str,
    r: Option<&Receipt>,
    claim: bool,
) -> Result<TaskEvidence> {
    if e.task_id != t || path(&e.vault)? != k.vault {
        return Err("verified task/vault mismatch".into());
    }
    text(&e.actor)?;
    text(&e.status)?;
    let p = path(&e.project)?;
    if r.is_some_and(|r| r.actor != e.actor || r.project != p) {
        return Err("verified actor/project changed".into());
    }
    if claim && (e.status != "claimed" || e.claimed_by.as_ref() != Some(&e.actor)) {
        return Err("task must have claimed status and be claimed by this actor".into());
    }
    Ok(e)
}
fn owner(
    s: &Store,
    k: &SessionKey,
    t: &str,
    observer: Option<&dyn Fn(&SessionKey) -> String>,
) -> Result<()> {
    let marker = read(s, &binding_name(k, t)?)?;
    if marker
        .as_ref()
        .is_some_and(|r| r.key.vault != k.vault || r.task_id != t)
    {
        return Err("task binding identity does not match its path".into());
    }
    let candidates = if let Some(r) = marker {
        vec![r]
    } else {
        scan(s, "receipt-")?
            .into_iter()
            .map(|(_, r)| r)
            .filter(|r| r.key.vault == k.vault && r.task_id == t)
            .collect()
    };
    for mut c in candidates {
        if let Some(r) = read(s, &retired_name(&c)?)? {
            if !r.retired || r.key != c.key || r.task_id != t || r.generation != c.generation {
                return Err("invalid task retirement identity".into());
            }
            if r.revision >= c.revision {
                c = r;
            }
        }
        if !c.retired && &c.key != k && observer.map(|o| o(&c.key)).as_deref() != Some("inactive") {
            return Err(format!(
                "task {t} belongs to another active or unknown session"
            ));
        }
    }
    Ok(())
}
fn persist(s: &Store, r: &Receipt) -> Result<()> {
    r.validate()?;
    if r.retired {
        s.write(&retired_name(r)?, r)?;
        let own = read(s, &binding_name(&r.key, &r.task_id)?)?;
        if own.is_none_or(|o| o.key == r.key && o.generation == r.generation) {
            s.write(&binding_name(&r.key, &r.task_id)?, r)?;
        }
    } else {
        s.write(&binding_name(&r.key, &r.task_id)?, r)?;
    }
    s.write(&receipt_name(&r.key)?, r)
}
fn load_call(s: &Store, k: &SessionKey, t: &str, c: &str) -> Result<Option<CallReservation>> {
    let r: Option<CallReservation> = s.read(&call_name(k, c)?)?;
    if let Some(r) = &r {
        r.validate()?;
        if &r.key != k || r.task_id != t || r.call_ref != c {
            return Err("call reference is already reserved for another task/identity".into());
        }
    }
    Ok(r)
}
pub fn load_enrollment(project: &Path) -> Result<Option<Enrollment>> {
    let project = path(project)?;
    let result = (|| {
        let s = Store::from_directory(&project)?;
        let mut e: Option<Enrollment> = s.read(".shards-harness.json")?;
        if let Some(e) = &mut e {
            if e.version != 1 {
                return Err("expected version 1".into());
            }
            e.config_path = path(&e.config_path)?;
        }
        Ok(e)
    })();
    result.map_err(|e: String| {
        format!(
            "enrollment {}: {e}; repair or explicitly disable enrollment",
            project.join(".shards-harness.json").display()
        )
    })
}
pub fn load_receipt(root: &Path, k: &SessionKey) -> Result<Option<Receipt>> {
    session(&Store::open(root)?, k)
}
pub fn load_call_reservation(
    root: &Path,
    k: &SessionKey,
    t: &str,
    c: &str,
) -> Result<Option<CallReservation>> {
    text(t)?;
    text(c)?;
    load_call(&Store::open(root)?, k, t, c)
}
#[cfg(test)]
pub fn load_claim_reservation(
    root: &Path,
    k: &SessionKey,
    t: &str,
    c: &str,
) -> Result<Option<ClaimReservation>> {
    load_call_reservation(root, k, t, c)?
        .map(|r| r.claim())
        .transpose()
}
#[allow(clippy::too_many_arguments)]
pub fn reserve_call(
    root: &Path,
    k: &SessionKey,
    t: &str,
    c: &str,
    operation: &str,
    text_sha256: Option<String>,
    before_text_occurrences: Option<u64>,
    expected_generation: Option<u64>,
) -> Result<CallReservation> {
    let mut reservation = CallReservation {
        key: k.clone(),
        task_id: t.into(),
        call_ref: c.into(),
        operation: operation.into(),
        expected_generation: 0,
        retirement_call: None,
        work_sequence: 0,
        text_sha256,
        before_text_occurrences,
        version: 1,
    };
    reservation.validate()?;
    let s = Store::open(root)?;
    let _session = s.lock(&format!("lock-session-{}", sid(k)?))?;
    let _task = s.lock(&format!("lock-task-{}", tid(k, t)?))?;
    let current = session(&s, k)?;
    if operation != "claim" {
        expect(
            current.clone(),
            t,
            expected_generation.ok_or("nonclaim requires generation")?,
            true,
        )?;
        owner(&s, k, t, None)?;
    } else if expected_generation.is_some() {
        return Err("claim reservation captures its own current generation".into());
    }
    if let Some(old) = load_call(&s, k, t, c)? {
        if old.operation != operation
            || old.text_sha256 != reservation.text_sha256
            || old.before_text_occurrences != before_text_occurrences
        {
            return Err("replayed call changed operation, append digest or pre-count".into());
        }
        if operation != "claim" && Some(old.expected_generation) != expected_generation {
            return Err("replayed call belongs to older generation".into());
        }
        return Ok(old);
    }
    if let Some(r) = &current {
        if operation == "append" && r.seen_event_ids.len() >= CHECKPOINT_EVENT_LIMIT {
            return Err("receipt capacity reserved for retirement".into());
        }
        if operation == "claim"
            && !r.retired
            && (r.task_id != t || r.seen_event_ids.len() >= WORK_EVENT_LIMIT)
        {
            return Err("retire active task or checkpoint before another claim".into());
        }
        reservation.expected_generation = r.generation;
        reservation.retirement_call = r.retirement_call.clone();
        reservation.work_sequence = r.work_sequence;
    }
    s.write(&call_name(k, c)?, &reservation)?;
    Ok(reservation)
}
pub fn reserve_claim(root: &Path, k: &SessionKey, t: &str, c: &str) -> Result<ClaimReservation> {
    reserve_call(root, k, t, c, "claim", None, None, None)?.claim()
}
pub fn bind_task(
    root: &Path,
    k: &SessionKey,
    t: &str,
    verify: &dyn Fn(&str) -> Result<TaskEvidence>,
    c: &str,
    g: u64,
    observer: Option<&dyn Fn(&SessionKey) -> String>,
) -> Result<Receipt> {
    text(t)?;
    text(c)?;
    let s = Store::open(root)?;
    let _session = s.lock(&format!("lock-session-{}", sid(k)?))?;
    let _task = s.lock(&format!("lock-task-{}", tid(k, t)?))?;
    let reservation = load_call(&s, k, t, c)?
        .ok_or("binding requires original preclaim reservation")?
        .claim()?;
    if reservation.expected_generation != g {
        return Err("binding requires matching preclaim generation".into());
    }
    let old = session(&s, k)?;
    let generation = old.as_ref().map_or(0, |r| r.generation);
    let retry = old
        .as_ref()
        .is_some_and(|r| !r.retired && r.task_id == t && r.claim_call == c && g == generation - 1);
    if g != generation && !retry {
        return Err("stale claim generation".into());
    }
    if !retry && reservation.retirement_call != old.as_ref().and_then(|r| r.retirement_call.clone())
    {
        return Err("claim predates retirement".into());
    }
    if let Some(r) = &old {
        if !r.retired && r.task_id != t {
            return Err("session already binds different active task".into());
        }
        if r.seen_event_ids.iter().any(|x| x == c) && (r.retired || r.claim_call != c) {
            return Err("replayed claim reference".into());
        }
    }
    owner(&s, k, t, observer)?;
    let active = old.as_ref().filter(|r| !r.retired);
    let e = evidence(verify(t)?, k, t, active, true)?;
    let receipt = if let Some(r) = active {
        let mut r = r.clone();
        if !r.seen_event_ids.iter().any(|x| x == c) {
            if r.seen_event_ids.len() >= WORK_EVENT_LIMIT {
                return Err("receipt capacity reserved for checkpoint and retirement".into());
            }
            r.seen_event_ids.push(c.into());
            r.revision = r.revision.checked_add(1).ok_or("revision exhausted")?;
        }
        r
    } else {
        Receipt {
            key: k.clone(),
            project: path(&e.project)?,
            actor: e.actor,
            task_id: t.into(),
            claim_call: c.into(),
            generation: generation.checked_add(1).ok_or("generation exhausted")?,
            retired: false,
            retirement_call: None,
            phase: "bound".into(),
            work_sequence: 0,
            checkpoint_sequence: 0,
            last_lifecycle_call: None,
            seen_event_ids: vec![c.into()],
            stop_attempt_sequence: 0,
            revision: old.as_ref().map_or(Ok(1), |r| {
                r.revision.checked_add(1).ok_or("revision exhausted")
            })?,
            version: 1,
        }
    };
    persist(&s, &receipt)?;
    Ok(receipt)
}
#[cfg(test)]
pub fn recover_receipt(root: &Path, k: &SessionKey, t: &str, g: u64) -> Result<Receipt> {
    let s = Store::open(root)?;
    let _session = s.lock(&format!("lock-session-{}", sid(k)?))?;
    expect(session(&s, k)?, t, g, false)?;
    let _task = s.lock(&format!("lock-task-{}", tid(k, t)?))?;
    let r = expect(session(&s, k)?, t, g, false)?;
    if !r.retired {
        owner(&s, k, t, None)?;
    }
    persist(&s, &r)?;
    Ok(r)
}
pub fn reconcile_binding(
    root: &Path,
    k: &SessionKey,
    verify: &dyn Fn(&str) -> Result<TaskEvidence>,
    observer: Option<&dyn Fn(&SessionKey) -> String>,
    t: &str,
    g: u64,
) -> Result<Receipt> {
    let s = Store::open(root)?;
    let _session = s.lock(&format!("lock-session-{}", sid(k)?))?;
    expect(session(&s, k)?, t, g, true)?;
    let _task = s.lock(&format!("lock-task-{}", tid(k, t)?))?;
    let r = expect(session(&s, k)?, t, g, true)?;
    owner(&s, k, t, observer)?;
    evidence(verify(t)?, k, t, Some(&r), true)?;
    persist(&s, &r)?;
    Ok(r)
}
pub type Verify<'a> = dyn Fn(&str) -> Result<TaskEvidence> + 'a;
pub fn update_receipt(
    root: &Path,
    k: &SessionKey,
    update: &dyn Fn(&Receipt) -> Result<Receipt>,
    t: &str,
    g: u64,
    verify: Option<&Verify<'_>>,
) -> Result<Receipt> {
    let s = Store::open(root)?;
    let _session = s.lock(&format!("lock-session-{}", sid(k)?))?;
    expect(session(&s, k)?, t, g, true)?;
    let _task = s.lock(&format!("lock-task-{}", tid(k, t)?))?;
    let current = expect(session(&s, k)?, t, g, true)?;
    owner(&s, k, t, None)?;
    if let Some(v) = verify {
        evidence(v(t)?, k, t, Some(&current), false)?;
    }
    let mut next = update(&current)?;
    next.validate()?;
    if (
        &next.key,
        &next.task_id,
        &next.project,
        &next.actor,
        next.generation,
        &next.claim_call,
        next.retired,
        &next.retirement_call,
    ) != (
        &current.key,
        &current.task_id,
        &current.project,
        &current.actor,
        current.generation,
        &current.claim_call,
        current.retired,
        &current.retirement_call,
    ) {
        return Err("receipt update cannot change binding/generation/retirement identity".into());
    }
    if next.revision != current.revision {
        return Err("stale receipt revision; use update_receipt transaction".into());
    }
    if next.work_sequence < current.work_sequence
        || next.checkpoint_sequence < current.checkpoint_sequence
        || next.stop_attempt_sequence < current.stop_attempt_sequence
        || current
            .seen_event_ids
            .iter()
            .any(|x| !next.seen_event_ids.contains(x))
    {
        return Err("stale receipt cannot erase counters or references".into());
    }
    let added = next
        .seen_event_ids
        .iter()
        .filter(|x| !current.seen_event_ids.contains(x))
        .collect::<HashSet<_>>();
    if !added.is_empty() {
        for r in records(&s, k)? {
            if r.generation < g && r.seen_event_ids.iter().any(|x| added.contains(x)) {
                return Err("replayed event belongs to retired generation".into());
            }
        }
        if next.work_sequence > current.work_sequence
            && next.seen_event_ids.len() > WORK_EVENT_LIMIT
        {
            return Err("receipt capacity reserved for checkpoint and retirement".into());
        }
        if next.seen_event_ids.len() >= CHECKPOINT_EVENT_LIMIT
            && next.checkpoint_sequence < next.work_sequence
        {
            return Err("receipt capacity reserved for a current-work checkpoint".into());
        }
        if next.seen_event_ids.len() > CHECKPOINT_EVENT_LIMIT {
            return Err("receipt capacity reserved for retirement".into());
        }
    }
    if next != current {
        next.revision = current
            .revision
            .checked_add(1)
            .ok_or("revision exhausted")?;
    }
    persist(&s, &next)?;
    Ok(next)
}
#[cfg(test)]
pub fn mark_work(root: &Path, k: &SessionKey, event: &str, t: &str, g: u64) -> Result<Receipt> {
    text(event)?;
    update_receipt(
        root,
        k,
        &|r| {
            let mut n = r.clone();
            if !n.seen_event_ids.iter().any(|x| x == event) {
                n.phase = "working".into();
                n.work_sequence = n
                    .work_sequence
                    .checked_add(1)
                    .ok_or("work sequence exhausted")?;
                n.seen_event_ids.push(event.into());
            }
            Ok(n)
        },
        t,
        g,
        None,
    )
}
#[cfg(test)]
pub fn mark_checkpoint(root: &Path, k: &SessionKey, c: &str, t: &str, g: u64) -> Result<Receipt> {
    text(c)?;
    update_receipt(
        root,
        k,
        &|r| {
            if r.seen_event_ids.iter().any(|x| x == c) {
                return Ok(r.clone());
            }
            let res = load_call(&Store::open(root)?, k, t, c)?
                .ok_or("checkpoint requires original append reservation")?;
            if res.operation != "append"
                || res.expected_generation != g
                || res.retirement_call != r.retirement_call
                || res.work_sequence > r.work_sequence
            {
                return Err(
                    "checkpoint reservation has stale generation/retirement/work context".into(),
                );
            }
            let mut n = r.clone();
            n.checkpoint_sequence = r.checkpoint_sequence.max(res.work_sequence);
            if n.checkpoint_sequence == n.work_sequence {
                n.phase = "checkpointed".into();
            }
            if res.work_sequence >= r.checkpoint_sequence {
                n.last_lifecycle_call = Some(c.into());
            }
            n.seen_event_ids.push(c.into());
            Ok(n)
        },
        t,
        g,
        None,
    )
}
fn retire(
    root: &Path,
    k: &SessionKey,
    t: &str,
    g: u64,
    observed: bool,
    proof: &dyn Fn(&Receipt, &Store) -> Result<RetirementEvidence>,
) -> Result<Receipt> {
    let s = Store::open(root)?;
    let _session = s.lock(&format!("lock-session-{}", sid(k)?))?;
    let _task = s.lock(&format!("lock-task-{}", tid(k, t)?))?;
    let mut r = expect(session(&s, k)?, t, g, false)?;
    if !r.retired {
        owner(&s, k, t, None)?;
    }
    let p = proof(&r, &s)?;
    let task = evidence(p.task, k, t, Some(&r), false)?;
    text(&p.lifecycle_call)?;
    text(&p.checkpoint_call)?;
    if !["waiting", "handoff", "completed"].contains(&p.outcome.as_str()) {
        return Err("invalid retirement outcome".into());
    }
    if r.work_sequence != r.checkpoint_sequence
        || r.last_lifecycle_call.as_ref() != Some(&p.checkpoint_call)
        || !r.seen_event_ids.contains(&p.checkpoint_call)
    {
        return Err("retirement requires recorded checkpoint after all work".into());
    }
    if r.retired {
        if r.retirement_call.as_ref() != Some(&p.lifecycle_call) || r.phase != p.outcome {
            return Err("retirement replay does not match recorded proof".into());
        }
        persist(&s, &r)?;
        return Ok(r);
    }
    if r.seen_event_ids.contains(&p.lifecycle_call) {
        return Err("retirement requires fresh verified proof reference".into());
    }
    let released = task.status == "open" && task.claimed_by.is_none();
    let terminal = ["done", "cancelled"].contains(&task.status.as_str());
    if !released && !((p.outcome == "completed" || observed) && terminal) {
        return Err("retirement requires verified release or completion".into());
    }
    r.retired = true;
    r.retirement_call = Some(p.lifecycle_call.clone());
    r.phase = p.outcome;
    r.revision = r.revision.checked_add(1).ok_or("revision exhausted")?;
    r.seen_event_ids.push(p.lifecycle_call);
    persist(&s, &r)?;
    Ok(r)
}
pub fn retire_binding(
    root: &Path,
    k: &SessionKey,
    t: &str,
    verify: &dyn Fn(&str) -> Result<RetirementEvidence>,
    g: u64,
) -> Result<Receipt> {
    retire(root, k, t, g, false, &|_, _| verify(t))
}
pub fn retire_observed_terminal(
    root: &Path,
    k: &SessionKey,
    t: &str,
    verify: &dyn Fn(&str) -> Result<TaskEvidence>,
    c: &str,
    g: u64,
) -> Result<Receipt> {
    retire(root, k, t, g, true, &|r, s| {
        let task = evidence(verify(t)?, k, t, Some(r), false)?;
        if !["done", "cancelled"].contains(&task.status.as_str())
            || r.phase != "handoff"
            || r.last_lifecycle_call.as_deref() != Some(c)
        {
            return Err("terminal observation requires exact recorded handoff checkpoint".into());
        }
        let res = load_call(s, k, t, c)?.ok_or("terminal handoff requires append context")?;
        if res.operation != "append"
            || res.expected_generation != g
            || res.work_sequence != r.work_sequence
        {
            return Err(
                "terminal handoff checkpoint must match clean captured append context".into(),
            );
        }
        let reference = "terminal-observation:".to_string()
            + &digest(
                &json!({"kind":"terminal-observation","key":k,"task_id":t,"status":task.status,"claimed_by":task.claimed_by,"actor":task.actor,"project":r.project,"generation":r.generation,"checkpoint_call":c,"checkpoint_sequence":r.checkpoint_sequence}),
            )?;
        Ok(RetirementEvidence {
            task,
            lifecycle_call: reference,
            checkpoint_call: c.into(),
            outcome: "handoff".into(),
        })
    })
}
#[cfg(test)]
pub fn tool_input_sha256(input: &serde_json::Value) -> Result<String> {
    if !input.is_object() {
        return Err("tool input must be JSON object".into());
    }
    digest(input)
}
fn reason(s: &str) -> Result<()> {
    text(s)?;
    if s.trim().chars().count() < 8 || s.chars().count() > 1024 {
        return Err("operator exception requires concrete reason (8-1024 characters)".into());
    }
    Ok(())
}
fn exception(s: &Store, id: &str) -> Result<Option<ExceptionRequest>> {
    let r: Option<ExceptionRequest> = s.read(&format!("exception-{id}.json"))?;
    if let Some(r) = &r {
        r.validate()?;
        if r.request_id != id {
            return Err("exception request identity does not match path".into());
        }
    }
    Ok(r)
}
pub fn request_exception(root: &Path, scope: &ExceptionScope) -> Result<ExceptionRequest> {
    let id = scope.id()?;
    let s = Store::open(root)?;
    let _lock = s.lock(&format!("lock-exception-{id}"))?;
    if let Some(r) = exception(&s, &id)? {
        return Ok(r);
    }
    let r = ExceptionRequest {
        request_id: id.clone(),
        scope: scope.clone(),
        reason: None,
        consumed: false,
        revision: 0,
        version: 1,
    };
    s.write(&format!("exception-{id}.json"), &r)?;
    Ok(r)
}
#[cfg(test)]
pub fn load_exception_request(root: &Path, id: &str) -> Result<Option<ExceptionRequest>> {
    sha(id)?;
    exception(&Store::open(root)?, id)
}
pub fn grant_exception(root: &Path, id: &str, why: &str) -> Result<ExceptionRequest> {
    sha(id)?;
    reason(why)?;
    let s = Store::open(root)?;
    let _lock = s.lock(&format!("lock-exception-{id}"))?;
    let mut r =
        exception(&s, id)?.ok_or("unknown exception request; first reproduce exact denied call")?;
    if r.consumed {
        return Err("operator exception already consumed; replay forbidden".into());
    }
    if let Some(reason) = &r.reason {
        if reason != why {
            return Err("exception already granted with different recorded reason".into());
        }
        return Ok(r);
    }
    r.reason = Some(why.into());
    r.revision = r.revision.checked_add(1).ok_or("revision exhausted")?;
    s.write(&format!("exception-{id}.json"), &r)?;
    Ok(r)
}
pub fn consume_exception(root: &Path, scope: &ExceptionScope) -> Result<Option<ExceptionRequest>> {
    let id = scope.id()?;
    let s = Store::open(root)?;
    let _lock = s.lock(&format!("lock-exception-{id}"))?;
    let Some(mut r) = exception(&s, &id)? else {
        return Ok(None);
    };
    if r.reason.is_none() || r.consumed {
        return Ok(None);
    }
    if &r.scope != scope {
        return Err("exception scope mismatch".into());
    }
    r.consumed = true;
    r.revision = r.revision.checked_add(1).ok_or("revision exhausted")?;
    s.write(&format!("exception-{id}.json"), &r)?;
    Ok(Some(r))
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
#[path = "state_tests.rs"]
mod tests;
