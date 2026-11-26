---
type: feature-product
feature: todoist-sync
status: slice-1
sibling: tech.md
parent: ../../concepts/product/README.md
updated: 2026-11-26
---

# Feature: Todoist Sync — Product (slice 1)

Shards is the task backend; Todoist is an external tracker it copies data in from. Slice 1 is a
read-only pull: an operator names the Todoist projects to mirror, runs `shards todoist pull`, and
gets ordinary task files that keep a link to their Todoist origin.

**Status:** slice 1 delivered (pull only). Write-back, conflict resolution against Todoist and a
recurrence policy are later slices; the field report each pull prints is their input.
**Architecture:** [tech.md](tech.md)

---

## Scope

| | |
|---|---|
| **Owns** | `shards todoist pull` and its `--dry-run`: the `[todoist]` token source and project allow-list, the `todoist_id` / `todoist_project` / `todoist_digest` task keys, Todoist-to-vault field mapping, the divergence rule, and the per-task field report. |
| **Does not own** | Write-back to Todoist (a later slice). Recurrence policy (an owner decision). Todoist project or section creation. Deleting a vault task that disappeared upstream. The vault's own `project` note link and dependency edges (`blocked_by`). |
| **Deferred** | Two-way conflict resolution, tombstones, reminders, durations, attachments, comments, assignees, and Todoist's ordering fields. |

---

## Requirements

### Requirement: Explicit allow-list (R1)

A pull MUST mirror exactly the project names in `[todoist].projects` and MUST refuse an empty list
before any request. A server project absent from the list MUST be reported as skipped and MUST NOT
contribute tasks.

#### Scenario: An unlisted project is not pulled

- **Given** Todoist has `Work` and `Someday`, and `projects = ["Work"]`
- **When** an operator runs `shards todoist pull`
- **Then** only `Work` tasks are created and `Someday` appears in the skipped-project report

### Requirement: Stable identity and idempotence (R2)

Every pulled task MUST carry a vault `t-…` id and the upstream `todoist_id`. Re-pulling MUST match
on `todoist_id` and update the same file. A pull with nothing to change MUST create nothing and
MUST NOT rewrite the file.

#### Scenario: A second pull changes nothing

- **Given** a pull created one task
- **When** the same pull runs again
- **Then** it reports `created=0`, `updated=0` and `changes=0`, and the file's bytes are unchanged

### Requirement: Local edits survive (R3)

A task whose vault state differs from the digest the last pull wrote MUST be reported as divergent
and MUST be left untouched, even when Todoist also moved. The comparison MUST be repeated under the
entity lock.

#### Scenario: A local title survives an upstream rename

- **Given** a pulled task was renamed locally
- **When** Todoist renames it too and a pull runs
- **Then** the local title remains on disk and the task is reported as divergent

### Requirement: Field report (R4)

Every pull MUST print, per task, the Todoist properties the vault cannot represent. The report
MUST appear in human and JSON output and MUST NOT be silently dropped; an empty report MUST say
`none`.

#### Scenario: Recurrence is reported, not guessed

- **Given** a Todoist task carries `is_recurring`, a timezone and a duration
- **When** a pull runs
- **Then** `recurrence`, `due.timezone` and `duration` appear in that task's field report

### Requirement: No credential leakage (R5)

The API token MUST be read from the configured variable or a `.env` file and MUST NOT appear in
output, an error message, or a written file, including when the server echoes it back.

#### Scenario: A 401 body echoing the token is not printed

- **Given** the API returns 401 with the bearer token in its body
- **When** a pull runs
- **Then** the command exits 2 naming only the path and status, and stdout and stderr do not
  contain the token

### Requirement: Bounded rate-limit retry (R6)

A `429` MUST be retried with backoff and the number of retries MUST be reported. The pull MUST NOT
fail on a transient limit and MUST NOT retry unbounded.

#### Scenario: Two 429s are spent and counted

- **Given** the server answers 429 twice and then succeeds
- **When** a pull runs
- **Then** the task is created and the summary reports two retries
