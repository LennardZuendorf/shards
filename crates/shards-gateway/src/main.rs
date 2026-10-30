#![forbid(unsafe_code)]
use clap::Parser;
#[tokio::main]
async fn main() {
    let result = shards_gateway::cli::run(shards_gateway::cli::Cli::parse()).await;
    if let Err(error) = result {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
