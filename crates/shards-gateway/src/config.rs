//! Explicit gateway configuration and pinned local data roots.
use crate::{error, Result};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use shards::{config::Config, spaces::Space};
use std::{
    fs,
    os::unix::fs::MetadataExt,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GatewayConfig {
    pub vault_id: String,
    pub vault_path: PathBuf,
    pub core_config: PathBuf,
    pub external_origin: String,
    pub grants_file: PathBuf,
    #[serde(default = "default_port")]
    pub listen_port: u16,
}
fn default_port() -> u16 {
    8787
}

#[derive(Clone, Debug)]
pub struct LoadedGatewayConfig {
    pub settings: GatewayConfig,
    pub core: Config,
    pub pinned_roots: Vec<PathBuf>,
    config_path: PathBuf,
    config_hash: Vec<u8>,
    core_hash: Vec<u8>,
    pinned_directories: Vec<(PathBuf, u64, u64)>,
}
impl LoadedGatewayConfig {
    pub fn load(path: &Path) -> Result<Self> {
        let config_path =
            fs::canonicalize(path).map_err(|_| error("gateway configuration unavailable"))?;
        let raw = fs::read(&config_path).map_err(|_| error("gateway configuration unavailable"))?;
        let mut settings: GatewayConfig = toml::from_str(
            std::str::from_utf8(&raw).map_err(|_| error("invalid gateway configuration"))?,
        )
        .map_err(|_| error("invalid gateway configuration"))?;
        if settings.vault_id.trim().is_empty() || settings.listen_port == 0 {
            return Err(error("invalid gateway configuration"));
        }
        for path in [
            &settings.vault_path,
            &settings.core_config,
            &settings.grants_file,
        ] {
            if !path.is_absolute() {
                return Err(error("gateway paths must be absolute"));
            }
        }
        let origin = url::Url::parse(&settings.external_origin)
            .map_err(|_| error("invalid external origin"))?;
        if origin.scheme() != "https"
            || origin.host_str().is_none()
            || !origin.username().is_empty()
            || origin.password().is_some()
            || origin.path() != "/"
            || origin.query().is_some()
            || origin.fragment().is_some()
        {
            return Err(error("external origin must be an HTTPS origin"));
        }
        settings.external_origin = origin.origin().ascii_serialization();
        if fs::canonicalize(&settings.vault_path).map_err(|_| error("vault unavailable"))?
            != settings.vault_path
            || !settings.vault_path.is_dir()
        {
            return Err(error("vault must be a canonical directory"));
        }
        if fs::canonicalize(&settings.core_config)
            .map_err(|_| error("core configuration unavailable"))?
            != settings.core_config
        {
            return Err(error("core configuration must use its canonical path"));
        }
        let core_raw =
            fs::read(&settings.core_config).map_err(|_| error("core configuration unavailable"))?;
        let table: toml::Table = std::str::from_utf8(&core_raw)
            .map_err(|_| error("invalid core configuration"))?
            .parse()
            .map_err(|_| error("invalid core configuration"))?;
        let declared_vault = table
            .get("core")
            .and_then(|v| v.get("vault_path"))
            .and_then(toml::Value::as_str)
            .ok_or_else(|| error("explicit core vault_path required"))?;
        if fs::canonicalize(declared_vault).map_err(|_| error("core vault unavailable"))?
            != settings.vault_path
        {
            return Err(error("core and gateway vaults differ"));
        }
        // The explicit vault overrides environment fallbacks; remote identity always comes from the registry.
        let mut core = shards::config::from_table(&table, Some(&settings.vault_path))
            .map_err(|_| error("invalid core configuration"))?;
        core.core.agent = None;
        let pinned_roots: Vec<_> = Space::ALL
            .into_iter()
            .filter_map(|space| core.root(space).ok().map(Path::to_path_buf))
            .collect();
        let mut pinned_directories = Vec::new();
        for root in std::iter::once(&settings.vault_path).chain(pinned_roots.iter()) {
            if let Ok(metadata) = fs::metadata(root) {
                if !metadata.is_dir() {
                    return Err(error("space root is not a directory"));
                }
                pinned_directories.push((root.clone(), metadata.dev(), metadata.ino()));
            }
        }
        Ok(Self {
            settings,
            core,
            pinned_roots,
            config_path,
            config_hash: Sha256::digest(raw).to_vec(),
            core_hash: Sha256::digest(core_raw).to_vec(),
            pinned_directories,
        })
    }
    pub fn validate_pins(&self) -> Result<()> {
        let current = Self::load(&self.config_path)?;
        if current.config_hash != self.config_hash
            || current.core_hash != self.core_hash
            || current.pinned_roots != self.pinned_roots
        {
            return Err(error("gateway configuration drift requires restart"));
        }
        for (root, dev, ino) in &self.pinned_directories {
            let metadata =
                fs::metadata(root).map_err(|_| error("gateway root drift requires restart"))?;
            if metadata.dev() != *dev || metadata.ino() != *ino {
                return Err(error("gateway root drift requires restart"));
            }
        }
        Ok(())
    }
}
