use super::state::Result;
use serde_json::Value;
use shards::fm::View;
use shards::{
    config::{self, Config},
    domain::{activity, lenses, memories, notes, select::Filter, tasks},
    model::Task,
};
use std::path::{Path, PathBuf};

/// Config objects are injected into policy. No callback mutates process environment.
pub struct Reader {
    pub selected: Result<Config>,
    pub ambient: Result<Config>,
}
impl Reader {
    pub fn load(path: &Path) -> Self {
        let selected = (|| {
            let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
            let table: toml::Table = text.parse::<toml::Table>().map_err(|e| e.to_string())?;
            let core = table
                .get("core")
                .and_then(toml::Value::as_table)
                .ok_or("missing core configuration")?;
            let vault = ["vault_path", "path", "tolaria_path"]
                .iter()
                .find_map(|key| core.get(*key).and_then(toml::Value::as_str))
                .ok_or("missing enrolled vault path")?;
            let vault = shards::spaces::expand_user(vault);
            config::from_table(&table, Some(&vault)).map_err(|e| e.to_string())
        })();
        let ambient = config::load_config(None, None).map_err(|e| e.to_string());
        Self { selected, ambient }
    }
    pub fn config(&self) -> Result<&Config> {
        self.selected.as_ref().map_err(Clone::clone)
    }
    pub fn context(&self) -> Result<(PathBuf, String)> {
        let cfg = self.config()?;
        let actor = cfg
            .agent()
            .filter(|v| !v.trim().is_empty())
            .ok_or("effective config needs an acting identity")?;
        let _ = lenses::status_report(cfg);
        Ok((cfg.vault().to_path_buf(), actor.into()))
    }
    pub fn check_ambient(&self, path: &Path) -> Result<()> {
        let selected = shards::cli::admin::effective_config(self.config()?, path);
        let ambient = shards::cli::admin::effective_config(
            self.ambient.as_ref().map_err(Clone::clone)?,
            &config::resolve_config_path(None),
        );
        for key in ["core", "spaces", "sandbox"] {
            if selected.get(key) != ambient.get(key) {
                return Err(format!("MCP and guard contexts differ. Launch the host with SHARDS_CONFIG_PATH={} and reconnect Shards MCP before work", path.display()));
            }
        }
        Ok(())
    }
    pub fn task(&self, id: &str) -> Result<View<Task>> {
        tasks::get(self.config()?, id).map_err(|e| e.to_string())
    }
    pub fn startup(&self) -> Result<Value> {
        let cfg = self.config()?;
        let me = cfg.agent().map(str::to_string);
        let task_views = tasks::list(
            cfg,
            &Filter {
                mine: true,
                me: me.clone(),
                limit: None,
                ..Filter::default()
            },
            tasks::Availability::Any,
        )
        .map_err(|e| e.to_string())?;
        let note_views = match &me {
            Some(actor) => notes::list(
                cfg,
                &Filter {
                    owner: Some(actor.clone()),
                    me: me.clone(),
                    limit: None,
                    ..Filter::default()
                },
                false,
            )
            .map_err(|e| e.to_string())?,
            None => Vec::new(),
        };
        let mentions = lenses::session_mentions(
            cfg,
            &task_views,
            &note_views,
            me.as_deref(),
            lenses::SESSION_SINCE,
        );
        let memories = memories::session_picks(cfg, me.as_deref(), 5);
        let activity = activity::recent_activity(cfg, Some(lenses::SESSION_SINCE), None, true, 20)
            .map_err(|e| e.to_string())?;
        Ok(Value::Array(lenses::session_start_entries(
            cfg,
            &task_views,
            mentions,
            memories,
            activity,
            true,
            0,
        )))
    }
}
