//! Local-only grant administration. Every operation requires an explicit config.
use crate::{config::LoadedGatewayConfig, grants, Result};
use clap::{Parser, Subcommand};
use std::path::PathBuf;
#[derive(Debug, Parser)]
#[command(name = "shards-gateway")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}
#[derive(Debug, Subcommand)]
pub enum Command {
    Serve {
        #[arg(long)]
        config: PathBuf,
    },
    Grant {
        #[command(subcommand)]
        command: GrantCommand,
    },
    Connector {
        #[command(subcommand)]
        command: ConnectorCommand,
    },
}
#[derive(Debug, Subcommand)]
pub enum GrantCommand {
    Issue {
        #[arg(long)]
        config: PathBuf,
        #[arg(long)]
        grant_id: String,
        #[arg(long)]
        actor: String,
        #[arg(long = "scope", required = true)]
        scopes: Vec<String>,
        #[arg(long)]
        expires_at: String,
    },
    Revoke {
        #[arg(long)]
        config: PathBuf,
        #[arg(long)]
        grant_id: String,
    },
}
#[derive(Debug, Subcommand)]
pub enum ConnectorCommand {
    Issue {
        #[arg(long)]
        config: PathBuf,
        #[arg(long)]
        connector_id: String,
        #[arg(long)]
        expires_at: String,
    },
    Revoke {
        #[arg(long)]
        config: PathBuf,
        #[arg(long)]
        connector_id: String,
    },
}
pub async fn run(cli: Cli) -> Result<()> {
    match cli.command {
        Command::Serve { config } => crate::http::serve(&config).await,
        Command::Grant { command } => match command {
            GrantCommand::Issue {
                config,
                grant_id,
                actor,
                scopes,
                expires_at,
            } => {
                let token = grants::issue_grant(
                    &LoadedGatewayConfig::load(&config)?,
                    &grant_id,
                    &actor,
                    &scopes,
                    &expires_at,
                )?;
                println!("{token}");
                Ok(())
            }
            GrantCommand::Revoke { config, grant_id } => {
                grants::revoke_grant(&LoadedGatewayConfig::load(&config)?, &grant_id)
            }
        },
        Command::Connector { command } => match command {
            ConnectorCommand::Issue {
                config,
                connector_id,
                expires_at,
            } => {
                let token = grants::issue_connector(
                    &LoadedGatewayConfig::load(&config)?,
                    &connector_id,
                    &expires_at,
                )?;
                println!("{token}");
                Ok(())
            }
            ConnectorCommand::Revoke {
                config,
                connector_id,
            } => grants::revoke_connector(&LoadedGatewayConfig::load(&config)?, &connector_id),
        },
    }
}
