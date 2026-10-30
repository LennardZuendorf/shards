//! Protected registry, local administration, and locked authority admission.
use crate::{config::LoadedGatewayConfig, error, Result};
use chrono::{DateTime, Utc};
use rustix::fs::{flock, FlockOperation, OFlags};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    os::unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt},
    path::{Path, PathBuf},
};
use subtle::ConstantTimeEq;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MemberKind {
    Human,
    Agent,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Member {
    pub id: String,
    pub kind: MemberKind,
    pub sponsor: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ClientGrant {
    pub grant_id: String,
    pub token_sha256: String,
    pub actor: String,
    pub scopes: Vec<String>,
    pub expires_at: String,
    pub revoked_at: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Connector {
    pub connector_id: String,
    pub token_sha256: String,
    pub expires_at: String,
    pub revoked_at: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct GrantRegistry {
    pub schema_version: u32,
    pub vault_id: String,
    pub members: Vec<Member>,
    pub grants: Vec<ClientGrant>,
    pub connectors: Vec<Connector>,
}
#[derive(Clone, Debug)]
pub struct VerifiedGrant {
    pub grant_id: String,
    pub connector_id: String,
    pub actor: String,
    pub scopes: Vec<String>,
    pub members: Vec<Member>,
}

fn io_error(_: std::io::Error) -> crate::GatewayError {
    error("protected registry unavailable")
}
fn safe_parent(path: &Path) -> Result<&Path> {
    let parent = path
        .parent()
        .ok_or_else(|| error("invalid registry path"))?;
    let meta = fs::symlink_metadata(parent).map_err(io_error)?;
    if !meta.is_dir()
        || meta.uid() != rustix::process::geteuid().as_raw()
        || meta.mode() & 0o022 != 0
        || fs::canonicalize(parent).map_err(io_error)? != parent
    {
        return Err(error("unsafe registry parent"));
    }
    Ok(parent)
}
fn check_file(file: &File) -> Result<()> {
    let meta = file.metadata().map_err(io_error)?;
    if !meta.is_file()
        || meta.uid() != rustix::process::geteuid().as_raw()
        || meta.mode() & 0o777 != 0o600
    {
        return Err(error("unsafe registry file"));
    }
    Ok(())
}
fn safe_open(path: &Path, create: bool) -> Result<File> {
    safe_parent(path)?;
    let file = OpenOptions::new()
        .read(true)
        .write(create)
        .create(create)
        .mode(0o600)
        .custom_flags(OFlags::NOFOLLOW.bits() as i32 | OFlags::NONBLOCK.bits() as i32)
        .open(path)
        .map_err(io_error)?;
    check_file(&file)?;
    let path_meta = fs::symlink_metadata(path).map_err(io_error)?;
    let meta = file.metadata().map_err(io_error)?;
    if path_meta.dev() != meta.dev()
        || path_meta.ino() != meta.ino()
        || path_meta.file_type().is_symlink()
    {
        return Err(error("registry identity changed"));
    }
    Ok(file)
}
/// Stable path is never replaced when the JSON state is atomically updated.
pub fn lock_path(cfg: &LoadedGatewayConfig) -> PathBuf {
    let mut path = cfg.settings.grants_file.as_os_str().to_os_string();
    path.push(".lock");
    PathBuf::from(path)
}
fn lock(cfg: &LoadedGatewayConfig, exclusive: bool) -> Result<File> {
    let file = safe_open(&lock_path(cfg), true)?;
    flock(
        &file,
        if exclusive {
            FlockOperation::LockExclusive
        } else {
            FlockOperation::LockShared
        },
    )
    .map_err(|_| error("registry lock unavailable"))?;
    Ok(file)
}
fn load(cfg: &LoadedGatewayConfig, allow_missing: bool) -> Result<GrantRegistry> {
    cfg.validate_pins()?;
    if allow_missing
        && fs::symlink_metadata(&cfg.settings.grants_file)
            .is_err_and(|e| e.kind() == std::io::ErrorKind::NotFound)
    {
        return Ok(GrantRegistry {
            schema_version: 1,
            vault_id: cfg.settings.vault_id.clone(),
            members: vec![],
            grants: vec![],
            connectors: vec![],
        });
    }
    let mut file = safe_open(&cfg.settings.grants_file, false)?;
    if file.metadata().map_err(io_error)?.len() > 16 * 1024 * 1024 {
        return Err(error("registry exceeds size limit"));
    }
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).map_err(io_error)?;
    let registry: GrantRegistry =
        serde_json::from_slice(&bytes).map_err(|_| error("invalid registry"))?;
    validate_registry(cfg, &registry)?;
    Ok(registry)
}
fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 256
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '@'))
}
fn validate_scopes(scopes: &[String]) -> Result<()> {
    let mut unique = HashSet::new();
    if scopes.is_empty() {
        return Err(error("grant requires explicit scopes"));
    }
    for scope in scopes {
        let Some((space, access)) = scope.split_once(':') else {
            return Err(error("invalid grant scope"));
        };
        if shards::spaces::Space::from_name(space).is_none()
            || !matches!(access, "read" | "write")
            || !unique.insert(scope)
        {
            return Err(error("invalid grant scope"));
        }
    }
    Ok(())
}
fn valid_hash(hash: &str) -> bool {
    hash.len() == 64
        && hash
            .bytes()
            .all(|b| b.is_ascii_digit() || matches!(b, b'a'..=b'f'))
}
fn date(raw: &str) -> Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(raw)
        .map(|v| v.with_timezone(&Utc))
        .map_err(|_| error("invalid registry timestamp"))
}
fn validate_registry(cfg: &LoadedGatewayConfig, registry: &GrantRegistry) -> Result<()> {
    if registry.schema_version != 1 || registry.vault_id != cfg.settings.vault_id {
        return Err(error("registry vault or version mismatch"));
    }
    let mut ids = HashSet::new();
    for member in &registry.members {
        if !valid_id(&member.id)
            || !ids.insert(&member.id)
            || shards::domain::owner::validate_owner(&cfg.core, Some(&member.id)).is_err()
        {
            return Err(error("invalid registry member"));
        }
    }
    for member in &registry.members {
        if let Some(sponsor) = &member.sponsor {
            if member.kind != MemberKind::Agent
                || !registry
                    .members
                    .iter()
                    .any(|m| m.id == *sponsor && m.kind == MemberKind::Human)
            {
                return Err(error("invalid member sponsor"));
            }
        }
    }
    let mut grant_ids = HashSet::new();
    let mut hashes = HashSet::new();
    for grant in &registry.grants {
        if !valid_id(&grant.grant_id)
            || !grant_ids.insert(&grant.grant_id)
            || !valid_hash(&grant.token_sha256)
            || !hashes.insert(&grant.token_sha256)
            || !registry.members.iter().any(|m| m.id == grant.actor)
        {
            return Err(error("invalid client grant"));
        }
        validate_scopes(&grant.scopes)?;
        date(&grant.expires_at)?;
        if let Some(revoked) = &grant.revoked_at {
            date(revoked)?;
        }
    }
    let mut connector_ids = HashSet::new();
    for connector in &registry.connectors {
        if !valid_id(&connector.connector_id)
            || !connector_ids.insert(&connector.connector_id)
            || !valid_hash(&connector.token_sha256)
            || !hashes.insert(&connector.token_sha256)
        {
            return Err(error("invalid connector grant"));
        }
        date(&connector.expires_at)?;
        if let Some(revoked) = &connector.revoked_at {
            date(revoked)?;
        }
    }
    Ok(())
}
fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
fn verifier(token: &str) -> String {
    hex(&Sha256::digest(token.as_bytes()))
}
fn secret() -> Result<String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|_| error("secure randomness unavailable"))?;
    Ok(hex(&bytes))
}
fn matches_token(hash: &str, token: &str) -> bool {
    let candidate = verifier(token);
    bool::from(hash.as_bytes().ct_eq(candidate.as_bytes())) && token.len() == 64
}
fn active(expiry: &str, revoked: &Option<String>, now: DateTime<Utc>) -> bool {
    revoked.is_none() && date(expiry).is_ok_and(|expiry| expiry > now)
}
fn connector<'a>(
    registry: &'a GrantRegistry,
    token: &str,
    now: DateTime<Utc>,
) -> Result<&'a Connector> {
    registry
        .connectors
        .iter()
        .find(|c| {
            matches_token(&c.token_sha256, token) && active(&c.expires_at, &c.revoked_at, now)
        })
        .ok_or_else(|| error("unauthorized"))
}
/// Admission is linearized under the registry's shared lock after the caller's queue wait.
/// Once this returns, the immutable verified authority may finish even after later revocation.
pub fn admit(cfg: &LoadedGatewayConfig, client: &str, machine: &str) -> Result<VerifiedGrant> {
    admit_with(cfg, client, machine, Clone::clone)
}
/// Run only the queued-to-running transition in this callback, never the domain operation.
/// The shared lock remains held until the callback returns.
pub fn admit_with<T>(
    cfg: &LoadedGatewayConfig,
    client: &str,
    machine: &str,
    transition: impl FnOnce(&VerifiedGrant) -> T,
) -> Result<T> {
    let _lock = lock(cfg, false)?;
    let registry = load(cfg, false)?;
    let now = Utc::now();
    let connector = connector(&registry, machine, now)?;
    let grant = registry
        .grants
        .iter()
        .find(|g| {
            matches_token(&g.token_sha256, client) && active(&g.expires_at, &g.revoked_at, now)
        })
        .ok_or_else(|| error("unauthorized"))?;
    let verified = VerifiedGrant {
        grant_id: grant.grant_id.clone(),
        connector_id: connector.connector_id.clone(),
        actor: grant.actor.clone(),
        scopes: grant.scopes.clone(),
        members: registry.members,
    };
    Ok(transition(&verified))
}
/// Validate existing registry state at startup without accepting an operation.
pub fn validate(cfg: &LoadedGatewayConfig) -> Result<()> {
    let _lock = lock(cfg, false)?;
    load(cfg, false).map(|_| ())
}
pub fn probe_connector(cfg: &LoadedGatewayConfig, token: &str) -> Result<String> {
    let _lock = lock(cfg, false)?;
    let registry = load(cfg, false)?;
    Ok(connector(&registry, token, Utc::now())?
        .connector_id
        .clone())
}
fn save(cfg: &LoadedGatewayConfig, registry: &GrantRegistry) -> Result<()> {
    validate_registry(cfg, registry)?;
    let parent = safe_parent(&cfg.settings.grants_file)?;
    if fs::symlink_metadata(&cfg.settings.grants_file).is_ok() {
        safe_open(&cfg.settings.grants_file, false)?;
    }
    let mut temp = tempfile::Builder::new()
        .prefix(".shards-grants-")
        .tempfile_in(parent)
        .map_err(io_error)?;
    temp.as_file()
        .set_permissions(fs::Permissions::from_mode(0o600))
        .map_err(io_error)?;
    serde_json::to_writer_pretty(&mut temp, registry)
        .map_err(|_| error("registry serialization failed"))?;
    temp.write_all(b"\n").map_err(io_error)?;
    temp.as_file().sync_all().map_err(io_error)?;
    temp.persist(&cfg.settings.grants_file)
        .map_err(|_| error("registry replacement failed"))?;
    File::open(parent)
        .map_err(io_error)?
        .sync_all()
        .map_err(io_error)?;
    Ok(())
}
fn future(expiry: &str) -> Result<()> {
    if date(expiry)? <= Utc::now() {
        return Err(error("expiry must be in the future"));
    }
    Ok(())
}
pub fn issue_grant(
    cfg: &LoadedGatewayConfig,
    id: &str,
    actor: &str,
    scopes: &[String],
    expiry: &str,
) -> Result<String> {
    let _lock = lock(cfg, true)?;
    let mut registry = load(cfg, true)?;
    future(expiry)?;
    validate_scopes(scopes)?;
    if !registry.members.iter().any(|m| m.id == actor) {
        return Err(error("unknown grant actor"));
    }
    let token = secret()?;
    registry.grants.push(ClientGrant {
        grant_id: id.into(),
        token_sha256: verifier(&token),
        actor: actor.into(),
        scopes: scopes.to_vec(),
        expires_at: expiry.into(),
        revoked_at: None,
    });
    save(cfg, &registry)?;
    Ok(token)
}
pub fn issue_connector(cfg: &LoadedGatewayConfig, id: &str, expiry: &str) -> Result<String> {
    let _lock = lock(cfg, true)?;
    let mut registry = load(cfg, true)?;
    future(expiry)?;
    let token = secret()?;
    registry.connectors.push(Connector {
        connector_id: id.into(),
        token_sha256: verifier(&token),
        expires_at: expiry.into(),
        revoked_at: None,
    });
    save(cfg, &registry)?;
    Ok(token)
}
pub fn revoke_grant(cfg: &LoadedGatewayConfig, id: &str) -> Result<()> {
    let _lock = lock(cfg, true)?;
    let mut registry = load(cfg, false)?;
    let grant = registry
        .grants
        .iter_mut()
        .find(|g| g.grant_id == id)
        .ok_or_else(|| error("unknown grant"))?;
    if grant.revoked_at.is_none() {
        grant.revoked_at = Some(Utc::now().to_rfc3339());
        save(cfg, &registry)?;
    }
    Ok(())
}
pub fn revoke_connector(cfg: &LoadedGatewayConfig, id: &str) -> Result<()> {
    let _lock = lock(cfg, true)?;
    let mut registry = load(cfg, false)?;
    let connector = registry
        .connectors
        .iter_mut()
        .find(|g| g.connector_id == id)
        .ok_or_else(|| error("unknown connector"))?;
    if connector.revoked_at.is_none() {
        connector.revoked_at = Some(Utc::now().to_rfc3339());
        save(cfg, &registry)?;
    }
    Ok(())
}
