---
type: feature-tech
feature: todoist-sync
status: slice-1
sibling: product.md
parent: ../../tech/architecture/README.md
updated: 2026-11-26
---

# Feature: Todoist Sync — Architecture (slice 1, read-only pull)

Slice 1 mirrors allow-listed Todoist projects into the tasks space. It only reads Todoist and
only writes Markdown: no write-back, no recurrence policy, and no deletes. The vault and Todoist
are therefore allowed to disagree, and every disagreement is reported rather than resolved.

**Parent:** [../../tech/architecture/README.md](../../tech/architecture/README.md)
**Code:** `src/todoist/` (`client.rs`, `model.rs`, `store.rs`), `src/cli/todoist.rs`

---

## Configuration

```toml
[todoist]
token_env = "TODOIST_API_TOKEN"   # default
projects = ["Work", "Home"]       # explicit allow-list; empty is refused
base_url = "https://api.todoist.com"
```

The token is read from `token_env` in the process environment, then a `.env` beside the config
file, then one in the vault root. It never enters frontmatter, a log line, an error message or a
written file: every HTTP failure names the request path and status only, and a test feeds a 401
whose body echoes the credential to prove the body is never printed.

Nothing is pulled implicitly. A project on the server that is absent from `projects` is reported
as skipped; an allow-listed name with no matching server project is reported as missing.

## Identity model

| Key | Meaning |
|---|---|
| `id` | The vault's ordinary hash id (`t-…`), minted once at first pull. |
| `todoist_id` | The upstream Todoist task id. This is the join key, never the vault id. |
| `todoist_project` | The mirrored Todoist project name. `project` stays reserved for a vault project note (`n-…`). |
| `todoist_digest` | sha256 of the vault-representable snapshot the last pull wrote. |

A pull indexes the tasks space by `todoist_id`, so pulling the same Todoist task again updates
the existing file. It never mints a second id and never writes when the desired snapshot equals
the current one, which keeps a repeat pull byte-identical (`updated` included). Two vault tasks
carrying one `todoist_id` are ambiguous and are skipped with a report.

`todoist_digest` covers title, body, tags, priority, due, deadline, section, project, parent and
terminal state. A local edit to any of them makes the digest disagree with the file, and the task
is reported **diverged** and left untouched — even when Todoist also moved. The check runs again
under the entity lock, so an edit that lands mid-pull is also never overwritten. A local claim or
owner change is not a divergence: `claimed` and `open` share one state value, so a claim neither
blocks unrelated Todoist updates nor gets cleared by them. `cancelled` keeps its own value instead
of folding into `done`, so cancelling a mirrored task locally is a divergence, not a silent
`done` written back.

The digest is taken over the body **as the vault reads it back**, not over the raw description:
`taskline::without_line` drops the newline between the managed line and the body plus any leading
blank lines, so the description is normalised the same way before both the write and the hash. A
description that starts with a blank line would otherwise mark the pull's own output divergent.

Subtasks map to `parent` only when the parent is itself in the mirrored set and resolves in the
same pull. A parent outside the allow-list, an unresolved ancestor, or a loop skips the child
with a report. `blocked_by` is never inferred: Todoist has no dependency edge to copy.

## Field report

Every pull prints a per-task list of Todoist properties the vault cannot represent, in human and
`--json` output, even when the answer is "none". The list is the input to the write-back slice.

- `recurrence` — `due.is_recurring`; no recurrence policy is adopted yet.
- `due.timezone` — the vault keeps a floating wall clock; a zoned datetime is converted to local
  time and the zone is lost.
- `duration`, `assignee_id`, reminders, comments, attachments and any other unrecognised task key
  — reported by name from the raw payload, so a new Todoist property is never silently dropped.
  The report is driven by an allow-list of the keys the mapping actually writes, so a property
  cannot be suppressed by being listed as "mapped" when it is not: `url`, `added_at`,
  `added_by_uid`, `assigned_by_uid` and `user_id` are reported today. `added_at` is the obvious
  candidate to become the vault's `created` in a later slice; until it does, it is reported.
- `section` — a `section_id` the mirror cannot resolve.
- An unparsable `due.date`, `due.datetime` or `deadline` is reported instead of guessed.

Mapped fields are `content` → `title`, `description` → body, `due` and `deadline` → calendar
fields, `priority` P1–P4 → `urgent|high|normal|low`, `labels` → `tags`, project → `todoist_project`,
section → `section`, and completion → `status: done` plus `completed` (created in `tasks/done/`).

## Pull behaviour

- `--dry-run` runs the same reconciliation and prints the intended creates and updates; it writes
  nothing.
- A `429` is retried up to three times, honouring `Retry-After` when present, with a bounded
  fallback backoff; the number of retries is reported in the summary and in `retries`.
- Completion state comes from `/api/v1/tasks` and the last 30 days of
  `/api/v1/tasks/completed/by_completion_date`. Active rows win over history when both carry an id.
- A task that disappears from Todoist is left in the vault. Deletion needs tombstones and belongs
  to a later slice.

## Dependencies

`ureq` 3 (rustls, no default features) is a **default** dependency of this slice, so a plain
`cargo build` compiles it. `docs/spec/features/sync/tech.md` puts HTTP clients behind the
non-default feature `sync`; that gate is written for `src/sync/`, which does not exist yet.
Recording the difference here rather than letting two specs imply agreement: whether the transport
is feature-gated, or the sync spec is amended, is a decision for the write-back slice. No
user-facing verb changes either way, and the core dependency guard (no tokio, axum or tauri)
still holds.
