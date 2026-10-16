---
type: feature-product
feature: sync
status: planned
sibling: tech.md
parent: ../../product.md
children:
  - research.md
updated: 2026-10-16
---

# Feature: Sync — Product

Shards Sync replicates one vault across a person's machines (Phase A, roadmap #18), then across
the members of a shared workspace (Phase B, delivered with the multiplayer gate, roadmap #20).
The Markdown files stay the source of truth on every machine. A hosted or self-hosted Shards
server orders and merges changes. Every human, agent and external editor keeps writing plain
files, and no edit is lost silently. Sync is opt-in and paid on the hosted service (Personal Sync,
$5/month or $48/year; self-host is free). It also fixes the trust gap in today's free-string
identity: on the server, every change carries a verified actor.

**Status:** designed, not started.
**Parent:** [../../product.md](../../product.md)
**Architecture:** [tech.md](tech.md)
**Research:** [research.md](research.md)
**Related feature:** [../remote-mcp/product.md](../remote-mcp/product.md) serves the server-side
replica that this feature maintains.

---

## Problem

The operator runs agents on a laptop, a desktop and a headless box. Today each machine has its
own vault, or the vault is shared through Dropbox, iCloud, Syncthing or git. Those tools sync by
path and by whole file, and Shards breaks all of their assumptions:

- A task moves from the open folder to the done folder when it finishes. A path-based tool sees
  a delete plus a create, and a concurrent edit on another machine makes a duplicate task
  (research §2).
- Two agents on two machines can both claim the same task. The local claim lock protects one
  machine only.
- Concurrent edits to different fields of one task (priority on the phone, due date on the
  laptop) collide as whole-file conflicts, or one side wins and the other is lost.
- Conflict markers inside frontmatter make the file unreadable, and the task vanishes from every
  list without an error.

The market confirms that this is the hard part. Beads moved its store to a SQL database because
of merge pain. Logseq Sync overwrote whole pages (research §6).

## Users and jobs

| Persona (D3) | Job |
|---|---|
| Agent operator | "My agents on three machines see one task list, and two of them never work the same task." |
| Markdown-native knowledge worker | "I edit in Obsidian on one machine and in the Shards app on another, and nothing breaks or duplicates." |
| Small team (Phase B) | "We share one project. Each person's and each agent's changes are attributed and merged." |
| The agent | "When I claim a task, the claim holds on every machine. If I crash, my claim expires." |

## Success metrics

| Metric | Target | How measured |
|---|---|---|
| Silent data loss | KPI K12 ([product-roadmap.md](../../product-roadmap.md) § KPIs) | Convergence simulator in CI and the K12 dogfood |
| Duplicate entities on disk | 0 | Simulator invariant plus dogfood vault audit |
| Double claims | 0 confirmed double claims while both machines are online | Simulator invariant; claim race test |
| Propagation latency | p95 at most 5 s from save on device A to file on device B, both online with a watching sync agent | Server and client timing logs in dogfood |
| Idle cost | A no-change sync pass over a 5,000-entity vault uses at most 150 ms CPU | Benchmark in CI |
| First device setup | A 5,000-entity vault (no assets) uploads in at most 60 s on a 50 Mbit/s link | Benchmark |
| Conflict copies | At most 0.5% of body merges end as a conflict copy | Server conflict counter in dogfood |
| CLI speed | The existing startup pin (min of 10 runs under 50 ms) stays green | Existing wall-clock test |
| Business | KPI K21 (trials per release download) | Server trial count and public download counts; no client telemetry |

---

## Scope

| | |
|---|---|
| **Owns** | The sync protocol and its merge rules; the client sync engine and the `shards sync` command group; the sync state and conflict store inside the vault's hidden Shards folder; server-arbitrated claims and agent claim leases; deletes, tombstones, revision history and restore; id collision handling; selective spaces; the server's sync API, its storage, and the server-side workspace replica; server accounts, devices and first-party sign-in for the desktop app and CLI (device-code login and desktop sign-in). |
| **Does not own** | Remote MCP, its OAuth authorization server, CIMD/DCR, the act-as consent screen, per-space scopes, agent personal access tokens and grant revocation ([remote-mcp](../remote-mcp/product.md)). Workspace creation for teams, invites, roles, comments, mentions, notifications and presence (multiplayer, #20). The desktop UI chrome (desktop-app, #16; it hosts the sync loop and shows sync status). Live co-editing of bodies (later). End-to-end encryption (e2ee, #23). Git sync or git backup. Billing. |
| **Recorded, owned by multiplayer (#20)** | R20–R23 (member-filtered pull, verified attribution, view-only rejection, activity feed). They live here as protocol prerequisites; plan row 20 references them and #20 delivers and verifies them. |
| **Lifecycle** | Design-only on the current branch. This folder stays until #18 starts and is exempt from delete-before-merge on this branch; plan.md § Current Focus records the exception. |
| **Deferred** | Sync of foreign Markdown files that have no Shards id; download-on-demand for large assets; Loro live co-editing; per-project sharing (sync groups); E2EE workspaces. |

---

## Decisions recorded in this spec

1. **Record sync, not a CRDT and not git.** Each file is one record keyed by its frontmatter id.
   Frontmatter merges per key, and bodies merge three-way (DECISIONS: Architecture · Sync;
   research §3–4).
2. **Scratch is not synced by default.** Scratch is high-churn working state for one agent on one
   machine. A user can opt a machine into syncing it. Rationale: lower cost and less noise, and
   scratch is machine-local by nature.
3. **Local claims never fail because the network is down.** When the server is reachable, a claim
   is confirmed by the server before the command returns. When it is not reachable, the claim is
   written locally as *tentative* and confirmed or lost at the next sync. A vault may choose to
   refuse offline claims instead. Rationale: "local commands never depend on sync" (DECISIONS)
   and cross-machine exclusivity both hold whenever they can.
4. **Agent claims expire; human claims do not.** This is a new rule for synced vaults only. Today
   a claim never expires.
5. **Note claims follow the same rules as task claims.**
6. **The command group is `shards sync`.** Every new CLI verb lives under it, so the root verb
   list does not grow.
7. **New ids in synced vaults are at least 8 characters.** Existing ids are never changed.
8. **The owner's "no DB" and "versioning is the vault owner's job" principles are reversed for
   synced vaults only** (DECISIONS reversal 1). The sync state database holds metadata, never
   content of record.
9. **No separate vault trash folder.** The deferred vault trash (D6) is met by tombstones plus
   server history plus the last synced copy kept locally for 30 days after a delete. Restore
   works offline for 30 days and online for the whole history window. Core delete stays a hard
   unlink.

---

## Requirements

Requirements R1–R19 are Phase A (personal multi-device) and gate roadmap #18. R20–R23 are Phase B
multiplayer prerequisites: they are recorded here because they constrain the sync protocol, but
they are owned and gated by multiplayer (#20), ship only after its members and roles exist, and
are not part of #18's done condition.

### Requirement: Opt-in sync that never gates a local verb (R1)

Sync SHALL be off until the user sets it up for a vault. Every local CLI verb, the local MCP
server and the desktop app MUST read and write files correctly whether or not any sync process
runs. A sync failure MUST NOT make a local verb fail.

#### Scenario: Verb works with sync stopped

- **Given** a vault set up for sync and no sync process running
- **When** an agent runs `shards task new "Book flights"`
- **Then** the task file is created and the command exits 0
- **And** `shards sync status` reports one unsynced change

#### Scenario: Server down

- **Given** a synced vault whose server is unreachable
- **When** the user finishes a task in the app
- **Then** the task is finished locally at once
- **And** the sync status shows "offline · 1 unsynced" instead of an error dialog

### Requirement: Three ways to run sync, one at a time (R2)

The system SHALL run sync in three hosts: inside the desktop app while it is open,
`shards sync --watch` in the foreground, and `shards sync --once` for one pass (cron, launchd,
systemd, CI). At most one sync process MUST run per vault. A second one MUST exit with a message
naming the running one.

#### Scenario: App and watcher on one vault

- **Given** the desktop app is open and syncing a vault
- **When** the user runs `shards sync --watch` on the same vault
- **Then** the command exits non-zero with "sync already running (pid 4121, Shards.app)"

#### Scenario: Cron pass on a headless box

- **Given** a headless machine with a cron entry `shards sync --once`
- **When** the cron job runs
- **Then** it pushes local changes, pulls remote changes, prints a one-line summary and exits 0

### Requirement: First-time setup and second-device bootstrap (R3)

`shards sync setup` and the app's Sync settings SHALL sign the device in, then attach the vault
to a new or existing workspace. The first device MUST upload a full snapshot. A later device MUST
download the snapshot and merge it with any files it already holds, without duplicating an id.
Setup MUST warn when the vault sits inside another sync tool's folder (Dropbox, iCloud Drive,
OneDrive, Google Drive, Syncthing, Obsidian Sync).

#### Scenario: First device

- **Given** a vault with 2,000 notes and 400 tasks and no workspace
- **When** the user runs `shards sync setup` and signs in through the browser device code
- **Then** a workspace is created and every entity is uploaded
- **And** the command prints "Synced 2,400 entities to workspace 'Lennard'"

#### Scenario: Second device that already has a copy

- **Given** device B holds an older copy of the same vault, made by copying the folder
- **When** the user attaches device B to the existing workspace
- **Then** files with the same id are merged by the normal merge rules
- **And** no entity appears twice
- **And** entities that exist only on device B are uploaded

#### Scenario: Vault inside iCloud Drive

- **Given** a vault under the iCloud Drive folder
- **When** the user starts setup
- **Then** setup shows a warning that two sync tools on one folder can lose files, and asks for
  confirmation

### Requirement: Offline edits are kept and pushed later (R4)

Every create, edit, finish, cancel, block and delete SHALL work offline. Pending changes MUST be
derived from the files on disk compared with the last synced state, so a crash or a kill cannot
lose a queued change. The sync status MUST show the count of unsynced changes.

#### Scenario: A week offline

- **Given** a laptop offline for 7 days with 35 local edits
- **When** it reconnects and sync runs
- **Then** all 35 edits reach the server
- **And** each is merged with any remote edits made in that week

#### Scenario: Killed mid-sync

- **Given** a sync pass that is killed after it wrote a remote change to a file but before it
  recorded that change
- **When** sync runs again
- **Then** no change is lost and none is applied twice

### Requirement: External editor edits are detected by content (R5)

The system SHALL detect changes made by any writer (Obsidian, VS Code, vim, scripts, other
agents) by comparing content with the last synced state, not by watching only its own writes. A
change that only reorders frontmatter keys, or only reformats timestamps into Shards' canonical
form, MUST NOT count as a change.

#### Scenario: Edit in Obsidian

- **Given** a synced note and the Shards app closed
- **When** the user edits the note's body in Obsidian and later runs `shards sync --once`
- **Then** the body change is pushed

#### Scenario: Key reorder by an editor

- **Given** an editor plugin that rewrites the frontmatter of a task in a different key order
- **When** sync scans the vault
- **Then** no change is pushed for that task

### Requirement: Concurrent frontmatter edits merge per key (R6)

When two devices edit the same entity concurrently, the system SHALL merge frontmatter key by
key. A single-value key (for example `priority`, `due`, `deadline`, `status`, `section`, `order`,
`recur`, `parent`, `title`) MUST take the most recent edit by hybrid-clock time. A list key
(`tags`, `related`, `blocks`, `blocked_by`) MUST keep every addition and every removal made on
either side. Unknown keys MUST merge per key and round-trip.

#### Scenario: Different keys on two devices

- **Given** task t-7KQ2 with priority `normal` and no due date on both devices
- **When** the phone sets priority `urgent` and the laptop sets due `2026-10-20` while both are
  offline, then both sync
- **Then** both devices hold priority `urgent` and due `2026-10-20`

#### Scenario: Same key on two devices

- **Given** task t-7KQ2 with priority `normal`
- **When** device A sets `high` at 10:00 and device B sets `low` at 10:05, both offline, then
  both sync
- **Then** both devices hold priority `low`
- **And** the activity entry shows "priority high → low by device B · your value was replaced"

#### Scenario: Labels added on both sides

- **Given** a task with labels `[home]`
- **When** device A adds `errand` and device B removes `home` and adds `weekend`
- **Then** both devices hold labels `[errand, weekend]`

#### Scenario: Recurring task finished on two devices

- **Given** a weekly recurring task due `2026-10-19`
- **When** two agents on two machines both finish it while offline
- **Then** after sync both machines hold one task, due `2026-10-26`, status `open`
- **And** no duplicate task exists

### Requirement: Bodies merge three-way (R7)

The system SHALL merge concurrent body edits line by line against the last common version.
Non-overlapping edits, such as two agents appending to different sections, MUST merge without
user action.

#### Scenario: Two appends

- **Given** a task body with sections `## Notes` and `## Outcome`
- **When** agent A appends under `## Notes` and agent B appends under `## Outcome` concurrently
- **Then** the merged body contains both appends and no conflict is raised

### Requirement: Unmergeable edits become a conflict copy, never markers (R8)

When a body merge cannot complete, the system SHALL keep the server's version in the file and
store the losing version as a conflict copy in the vault's hidden Shards conflicts folder. It MUST
NOT write conflict markers into frontmatter, and MUST NOT create a second file with the same id
inside any space. The entity MUST be flagged as in conflict in the app, the CLI and MCP responses
until a user or agent resolves it.

#### Scenario: Same paragraph edited twice

- **Given** a note whose first paragraph is edited differently on two offline devices
- **When** both sync
- **Then** both devices show the server's paragraph in the file
- **And** the other version is listed by `shards sync conflicts`
- **And** the app shows a banner "Edited in two places" with Keep mine, Keep theirs and Merge

#### Scenario: Agent reads an entity in conflict

- **Given** a task flagged in conflict
- **When** an agent calls the task get tool
- **Then** the response carries `conflict: true`

#### Scenario: Resolve from the CLI

- **Given** note n-4F2A in conflict
- **When** the user runs `shards sync resolve n-4F2A --take mine`
- **Then** the stored copy replaces the body, the flag clears on every device, and the conflict
  copy is removed

### Requirement: Edit wins over a concurrent delete (R9)

A delete SHALL propagate as a tombstone. When a delete and an edit of the same entity are
concurrent, the edit MUST win and the entity MUST survive on every device, with an activity entry
saying the delete was superseded. A file that reappears after its id was deleted (for example from
a backup) MUST NOT be silently resurrected: it MUST be moved to the conflicts folder with a notice
that explains how to restore it.

#### Scenario: Delete on laptop, edit on phone

- **Given** task t-9B1C on both devices
- **When** the laptop deletes it and the phone edits its title while offline, then both sync
- **Then** the task exists on both devices with the new title
- **And** the activity feed shows "delete superseded by an edit"

#### Scenario: Stale copy restored from backup

- **Given** task t-9B1C was deleted and the deletion synced to all devices a month ago
- **When** the user restores an old backup that contains the task file
- **Then** sync moves the file to the conflicts folder
- **And** prints "t-9B1C was deleted on 2026-09-14; restored copy kept; run `shards sync restore t-9B1C` to bring it back"

### Requirement: History and restore (R10)

The server SHALL keep every revision of every synced entity, including deletes, for the history
window: 12 months on hosted Personal Sync, configurable on self-host with a 90-day default.
`shards sync history <id>` MUST list revisions. `shards sync restore <id> [--rev N]` MUST bring
back a deleted entity or an earlier version as a new revision. The app's undo of a delete (D6)
MUST use the same restore when the vault is synced.

#### Scenario: Restore a deleted note

- **Given** note n-2D7E was deleted 3 weeks ago in a synced vault
- **When** the user runs `shards sync restore n-2D7E`
- **Then** the note is back on every device with its last content, and the activity feed records
  the restore

### Requirement: Task location follows status, never the path (R11)

The system SHALL identify every entity by its frontmatter id, never by its path. A task's folder
MUST be derived on each device from the merged status and that device's own space configuration.
Concurrent finish and edit MUST NOT produce two files.

#### Scenario: Finish on one device, edit on another

- **Given** an open task
- **When** device A finishes it and device B edits its body concurrently
- **Then** on both devices the task is in the done folder with B's body edit and A's outcome

#### Scenario: Different folder layout per machine

- **Given** device A keeps tasks in `tasks/` and device B keeps them in `work/todo/`
- **When** a task is created on A
- **Then** it appears in B's `work/todo/open/` folder

### Requirement: Claims are exclusive across machines (R12)

In a synced vault, a task or note claim SHALL be arbitrated by the server. While the server is
reachable, the claim command MUST return only after the server confirms it, and a lost race MUST
fail with exit code 4 naming the holder. While the server is unreachable, the claim MUST succeed
locally as *tentative* (unless the vault is set to refuse offline claims), MUST be shown as
tentative, and MUST be confirmed or reverted at the next sync with a notice when it is lost.
Claim, release and next are the only verbs that wait for the server, for at most 3 seconds; this
is a recorded exception to the root local-first rule (root product R5).

#### Scenario: Two machines race for one task

- **Given** two agents on two online machines and an open task t-3C8D
- **When** both run `shards task claim t-3C8D` within the same second
- **Then** exactly one exits 0
- **And** the other exits 4 with "claimed by flights-agent"

#### Scenario: Tentative claim lost

- **Given** an offline laptop where agent A claims t-3C8D tentatively
- **And** agent B claims t-3C8D through the server while A is offline
- **When** the laptop reconnects and syncs
- **Then** the laptop's file shows `claimed_by: B`
- **And** a notice and an activity entry say "claim on t-3C8D lost to B"
- **And** A's next `shards task claim t-3C8D` or `shards task release t-3C8D` exits 4 naming B

#### Scenario: Refuse offline claims

- **Given** a vault configured to refuse offline claims and no server connection
- **When** an agent claims a task
- **Then** the command exits 4 with kind `offline_claim` and a next action "retry when online"

### Requirement: Agent claims expire unless kept alive (R13)

In a synced vault, a claim held by an agent member (any claimant not registered as a human)
SHALL carry a lease, 30 minutes by default and configurable per vault. Any write by the holder to
the claimed entity, and a same-agent reclaim, MUST renew the lease. When the lease runs out, the
server MUST release the claim, return the task to `open`, and record "claim expired" in the
activity feed. Human claims MUST NOT expire.

#### Scenario: Crashed agent

- **Given** agent `research-bot` claimed t-5E6F at 09:00 and then crashed
- **When** the time is 09:31 and nobody renewed the claim
- **Then** t-5E6F is `open` with no claimant on every device
- **And** the activity feed shows "claim by research-bot expired"

#### Scenario: Working agent keeps its claim

- **Given** agent `research-bot` claimed t-5E6F at 09:00
- **And** no sync process runs on its machine
- **When** it appends progress to t-5E6F at 09:20 and 09:45
- **Then** the claim is still held at 10:10

#### Scenario: Human claim

- **Given** human `lennard` claimed t-5E6F on Friday
- **When** Monday comes without any write
- **Then** the claim is still held

### Requirement: Id collisions are repaired, not duplicated (R14)

When two devices create different entities with the same id while offline, the server SHALL keep
the first one and assign the second a new, longer id. The second device MUST rename its entity and
update references to it in its own unsynced entities. New ids in a synced vault MUST be at least
8 characters long.

#### Scenario: Two cron agents create the same title in the same second

- **Given** two machines whose agents both create a task titled "Daily digest" at 06:00:00
- **When** both sync
- **Then** two tasks exist on both machines, each with a distinct id
- **And** the second machine's output reports "id t-AB12CD34 renamed to t-AB12CD34X"

### Requirement: Selective spaces (R15)

The user SHALL choose which spaces a machine syncs. Notes, tasks, memories and assets MUST sync by
default. Scratch MUST NOT sync unless the user enables it on that machine. Markdown files without
a Shards id MUST NOT sync in Phase A, and `shards sync status` MUST count them and point to
`shards note adopt`.

#### Scenario: Default spaces

- **Given** a new sync setup with default settings
- **When** an agent writes scratch `plan` on device A
- **Then** the scratch file never reaches the server or device B

#### Scenario: Opt in to scratch on two machines

- **Given** scratch sync enabled on devices A and B
- **When** agent `coder` writes scratch `plan` on A
- **Then** the scratch appears under `coder/plan` on B

#### Scenario: Foreign files

- **Given** a notes space that is an Obsidian vault with 300 files without a Shards id
- **When** the user runs `shards sync status`
- **Then** it reports "300 files are not synced because they have no Shards id; run `shards note adopt` to include them"

### Requirement: Assets sync once by content (R16)

Asset files SHALL be uploaded once per distinct content and downloaded before their sidecar is
written. The same file attached on two devices MUST NOT be stored twice.

#### Scenario: Same image on two devices

- **Given** the same PNG ingested on device A and device B
- **When** both sync
- **Then** the server stores one copy and both devices reference the same asset id

### Requirement: A wrong device clock cannot win every merge (R17)

When a device's clock is more than 5 minutes ahead of the server, the server SHALL cap that
device's edit times at server time and the client MUST show a clock warning. An external edit
detected later MUST count from the file's save time when that time is plausible.

#### Scenario: Clock one day ahead

- **Given** device B's clock is one day ahead
- **When** devices A and B edit the same task priority one minute apart, B first
- **Then** A's later edit wins
- **And** device B shows "Your clock is ahead of the server; sync times are corrected"

### Requirement: Sync status is visible everywhere (R18)

The system SHALL report sync state as one of: off, synced, syncing, offline (with unsynced count),
signed out, conflict (with count), error (with next action). `shards sync status`, the app status
bar and the local `host_status` response MUST show the same state. Agent-facing JSON output from
mutating verbs in a synced vault MAY carry a `sync_hint` field, and MUST NOT fail because of sync.

#### Scenario: Signed out

- **Given** the device's sign-in was revoked from another device
- **When** sync runs
- **Then** sync pauses, the status shows "signed out · run `shards sync setup`", and local verbs
  keep working

### Requirement: Secure by default (R19)

All sync traffic SHALL use TLS. Device credentials MUST be stored in the operating system
keychain where one exists. The user MUST be able to list and revoke devices. The hosted service
MUST encrypt data at rest. The server MUST NOT log file content. End-to-end encryption is out of
scope for this feature, but the record format MUST leave room for it (e2ee, #23).

#### Scenario: Lost laptop

- **Given** a stolen laptop that was attached to the workspace
- **When** the user revokes that device from another device
- **Then** the stolen laptop's next sync fails with "device revoked", and it receives no further
  changes

### Requirement: Pull returns only what the member may see (R20, Phase B)

In a multi-member workspace, the server SHALL send each device only the entities its member may
read. A private memory MUST reach only its owner and the human who sponsors that owner. A scratch
namespace, when synced, MUST reach only its agent and that agent's sponsor.

#### Scenario: Private memory

- **Given** agent `claude-lennard` (sponsor: lennard) writes a private memory
- **When** member `ana` syncs
- **Then** ana's devices never receive that memory

### Requirement: Writes are attributed to a verified member (R21, Phase B)

The server SHALL record the verified member and device for every accepted change. A device MUST
write claims and agent identities only for handles its member may act as: itself, or an agent it
sponsors. Assigning a task's `owner` to any workspace member MUST be allowed for members who may
edit tasks.

#### Scenario: Spoofed claimant

- **Given** member `ana` whose device writes `claimed_by: lennard` into a task file by hand
- **When** sync pushes the change
- **Then** the server rejects the claim, the file reverts to the server's claimant, and ana sees
  "you cannot claim as lennard"

### Requirement: View-only members cannot diverge (R22, Phase B)

When a member with read-only access edits a synced file locally, the server SHALL reject the
change, the local edit MUST move to the conflicts folder, and the file MUST revert to the server
version with a notice.

#### Scenario: Viewer edits a task

- **Given** member `guest` has view access to project Alpha
- **When** guest's local CLI edits a task in Alpha
- **Then** the edit is kept only as a conflict copy on guest's device and the task reverts

### Requirement: Activity feed from revisions (R23, Phase B)

Every accepted revision SHALL produce an activity entry naming the member, the device or client,
the entity and the changed fields. Merges that replaced a value, superseded deletes, lost claims
and expired claims MUST appear as their own entries.

#### Scenario: Agent finishes a shared task

- **Given** a shared project with members lennard and ana
- **When** agent `flights-agent` (sponsor: lennard) finishes t-1A2B
- **Then** ana's activity feed shows "flights-agent (for lennard) finished t-1A2B"

---

## User Experience

```
$ shards sync setup
Open https://shards.app/device and enter code QXJL-7KPM
Signed in as lennard. Workspace: Lennard (new)
Spaces: notes, tasks, memories, assets   (scratch: off)
Synced 2,400 entities.

$ shards sync status
synced · workspace Lennard · last pass 12s ago
2 conflicts  · 0 unsynced  · 300 files without an id (run `shards note adopt`)

$ shards sync --watch
sync watching /Users/lennard/vault (Ctrl-C to stop)
10:02:11 pushed 1 · pulled 3 · merged 1 (t-7KQ2 priority)
10:05:40 claim on t-3C8D lost to flights-agent
```

In the app, a sync badge in the status bar shows the state. Entities in conflict show a banner
with a three-pane diff (base, theirs, mine). Tentative claims show a hollow claim badge. The
"Devices" panel lists signed-in devices with Revoke.

## Non-Goals

- Not a general file-sync tool: non-Markdown foreign files and Markdown without a Shards id do not
  sync in Phase A.
- No git-based sync and no git backup in this feature.
- No real-time co-editing of one body (Loro session documents are a later feature).
- No end-to-end encryption (e2ee, #23).
- No billing, plans or seat management.
- No CRDT as the record store.

## Risks

| Risk | Mitigation |
|---|---|
| Line-based body merge conflicts on long single-line paragraphs | Word-level fallback for small conflicting hunks; conflict copies keep both sides; live co-editing later |
| Another sync tool on the same folder | Setup warning; documented ignore rules for the hidden Shards folder |
| Edit time of a late-detected offline edit is approximate | Use the file save time when plausible; server clock cap; documented rule |
| Agents in hot loops flood the server | Batch pushes per pass; per-workspace rate limits; scratch off by default |
| Reversed principles confuse contributors | Root specs record reversals 1–4 with rationale (DECISIONS) |

## Open Questions

1. **Hosted region and data residency** — default EU or US? Recommendation: one EU region at
   launch, because the owner is EU-based; add US when demand shows.
2. **Owner sign-off on new surface** — the `shards sync` subcommands (setup, status, conflicts,
   resolve, history, restore, devices, logout; remote-mcp adds agents and token) and the new
   root-crate dependencies behind a non-default `sync` build feature (rusqlite, ureq, diffy,
   keyring) are proposed here and need explicit
   owner sign-off (AGENTS.md §0.4) before implementation. Tracked as DR7 in root
   [plan.md](../../plan.md) § Decision register: decide at the Now exit review (2027-01-12); the
   recommendation is to sign off as proposed.
3. **Lease default** — 30 minutes fits coding agents; cron agents may need longer. Recommendation:
   keep 30 minutes, configurable per vault, and revisit after dogfood data.
