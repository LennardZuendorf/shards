//! `shards todoist pull` — the read-only Todoist pull (sync slice 1).

use crate::cli::out;
use crate::cli::TodoistSub;
use crate::config;
use crate::ctx::Ctx;
use crate::error::Result;
use crate::todoist::{self, planned_verb, Action, Report};

/// `shards todoist …`.
pub fn run(ctx: &mut Ctx, sub: TodoistSub) -> Result<()> {
    match sub {
        TodoistSub::Pull {
            dry_run,
            out: flags,
        } => pull(ctx, dry_run, flags),
    }
}

fn pull(ctx: &mut Ctx, dry_run: bool, flags: crate::cli::OutFlags) -> Result<()> {
    ctx.coalesce(flags.json, flags.quiet, None);
    let config_path = config::resolve_config_path(ctx.g.config.as_deref());
    let cfg = ctx.cfg()?.clone();
    let report = todoist::pull(&cfg, &config_path, dry_run)?;
    if ctx.g.json {
        out::line(&out::json_line(&report.to_json()));
        return Ok(());
    }
    render(&report, ctx.g.quiet);
    Ok(())
}

fn render(report: &Report, quiet: bool) {
    if report.dry_run {
        out::line("todoist: dry run — nothing was written");
    }
    out::line(&format!(
        "todoist: mirrored {} of {} allow-listed projects",
        report.mirrored_projects.len(),
        report.allow_list.len()
    ));
    if !report.skipped_projects.is_empty() {
        out::line(&format!(
            "skipped projects: {}",
            report.skipped_projects.join(", ")
        ));
    }
    if !report.missing_projects.is_empty() {
        out::line(&format!(
            "missing projects: {}",
            report.missing_projects.join(", ")
        ));
    }

    if !quiet {
        for task in &report.tasks {
            let label = match (&task.vault_id, task.action) {
                (_, Action::Unchanged) => continue,
                (Some(id), action) => format!(
                    "{} {id} \"{}\"",
                    planned_verb(action, report.dry_run),
                    task.title
                ),
                (None, Action::Skipped) => {
                    format!("skipped todoist {} \"{}\"", task.todoist_id, task.title)
                }
                (None, action) => format!(
                    "{} \"{}\"",
                    planned_verb(action, report.dry_run),
                    task.title
                ),
            };
            match (&task.note, task.action) {
                (Some(note), _) => out::line(&format!("{label}: {note}")),
                (None, Action::Diverged) => {
                    out::line(&format!("{label}: local edits kept, Todoist not applied"))
                }
                _ => out::line(&format!("{label} (todoist {})", task.todoist_id)),
            }
        }
    }

    out::line(&format!(
        "summary: created={} updated={} unchanged={} diverged={} skipped={} changes={} retries={}",
        report.created(),
        report.updated(),
        report.unchanged(),
        report.diverged(),
        report.skipped(),
        report.changes(),
        report.retries
    ));

    let unsupported: Vec<_> = report
        .tasks
        .iter()
        .filter(|task| !task.unsupported.is_empty())
        .collect();
    if unsupported.is_empty() {
        out::line("field report: none");
    } else {
        out::line("field report:");
        for task in unsupported {
            let who = task
                .vault_id
                .clone()
                .unwrap_or_else(|| format!("todoist {}", task.todoist_id));
            out::line(&format!(
                "  {who} \"{}\": {}",
                task.title,
                task.unsupported.join(", ")
            ));
        }
    }
}
