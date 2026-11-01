---
type: product-topic
parent: product.md
scope: roadmap
covers: Todoist parity matrix with owning requirements and evidence, roadmap horizons, dated milestones, slip rule, app-polish outcomes, sizing, pricing, go-to-market, measurement, north star, funnel, KPIs, risks, decision log
updated: 2026-10-30
---

# Roadmap — Product

The long-term plan for Shards: what ships when, what it charges, how it reaches users and how it
knows it is winning. Root [product.md](product.md) holds the requirements (R1–R12).
[plan.md](plan.md) owns the binding order and gates, so a sequence change goes there first and is
mirrored here. Market, competitors, positioning and personas:
[product-market.md](product-market.md). Hosted-service duties, plan limits and billing:
[product-hosting.md](product-hosting.md).

## Principles

- Lead with the personal to-do app. Agents, sync and teams build on a product people already use daily.
- Every horizon ends on a binary exit criterion. Dates are targets governed by the slip rule, never an exit on their own.
- Charge for reach (devices, cloud agents, people), never for local use and never per agent.
- Do not market a capability before the trust model behind it exists. Multiplayer waits for verified identity.

---

## Todoist parity matrix

The scope contract. R1 is met when every **MVP** row reads "have". Tiers: **MVP** is the Now
horizon, **v1** is Next, **later** is Later. Status as of 2026-10-16:
- **have**: the row's evidence passes. For an MVP row that means its step in the desktop-app/22
  acceptance run ([features/desktop-app/plan.md](features/desktop-app/plan.md) § desktop-app/22,
  parity evidence steps P1–P31) passes in both modes against a 15-DONE core. Code that exists but
  has not passed its step reads "building";
- **building**: the capability is in a Now arc, built or not;
- **planned**: it is scheduled in a named Next or Later arc;
- **not planned**: it is deliberately out of scope.

**Owning requirement** names the requirement whose scenarios define the row. Feature requirement
ids read `<feature> R<n>`; app-polish outcomes read `AP<n>` (§ Next). **Evidence** names the test
file and the acceptance step that flip the row to "have". Next and Later rows get their evidence
when their arc's plan is written. A row with no owning requirement cannot be scheduled.

Todoist P1–P4 map to urgent, high, normal and low. Todoist labels are Shards tags, shown as
labels. Assignee and delegate are owner and claimed_by.

| Capability | Todoist | Tier | Status | Arc | Owning requirement | Evidence |
|---|---|---|---|---|---|---|
| Quick add with parsing: project, section, label, p1–p4, assignee, natural dates, every / every!, deadline | All plans | MVP | building (in the app) | desktop-app | desktop-app R13; task-model-v2 R18 | `apps/desktop/src/lib/quickadd/parse.test.ts` (≥ 60 phrases, 95 % gate); /22 P1 |
| Inbox view (tasks with no project) | All | MVP | building | desktop-app | desktop-app R2 | /22 P2 |
| Today view, including overdue | All | MVP | building | desktop-app | desktop-app R3 | `apps/desktop/src/components/task/model.test.ts`; /22 P3 |
| Upcoming view | All | MVP | building | desktop-app | desktop-app R4 | `apps/desktop/src/lib/dates.test.ts`; /22 P4 |
| Project create, rename, colour and sidebar order | 5 free / 300 Pro | MVP | building (core have; app create, rename and colour built; drag order not built) | desktop-app | desktop-app R35 | `apps/desktop/src/components/task/project-actions.test.ts`; /22 P5 |
| Archive and delete a project | All | MVP | building (archive and delete built; archived tasks still show in Today and Upcoming) | desktop-app | desktop-app R35 | `project-actions.test.ts`; /22 P6 |
| Sections inside a project | All | MVP | building | task-model-v2, desktop-app | task-model-v2 R10; desktop-app R5 | `tests/task_v2_cli.rs`; /22 P7 |
| Subtasks | All | MVP | building | task-model-v2, desktop-app | task-model-v2 R9; desktop-app R11 | `tests/task_v2_cli.rs`; /22 P8 |
| Labels | All | MVP | building (core have as tags) | desktop-app | desktop-app R7 | /22 P9 |
| Four priorities | All | MVP | building (adds urgent) | task-model-v2 | task-model-v2 R1 | `tests/task_v2_cli.rs`; /22 P10 |
| Due date with optional time | All | MVP | building | task-model-v2 | task-model-v2 R2 | `tests/task_v2_cli.rs`; /22 P11 |
| Deadline separate from the due date | Pro | MVP | building, free | task-model-v2 | task-model-v2 R3 | `tests/task_v2_cli.rs`; /22 P12 |
| Recurrence from the due date and from completion | All | MVP | building | task-model-v2 | task-model-v2 R4, R5 | `tests/task_v2_cli.rs`; /22 P13 |
| Due-date filters (overdue, before, after) | All | MVP | building | task-model-v2 | task-model-v2 R12 | `tests/task_v2_cli.rs`; /22 P14 |
| List and board layouts | All | MVP | building | desktop-app | desktop-app R5, R6 | /22 P15 |
| Manual reorder by drag | All | MVP | building | task-model-v2, desktop-app | task-model-v2 R10; desktop-app R5 | /22 P16 |
| Markdown task description | All | MVP | building (core have; app editor built) | desktop-app | desktop-app R10 | /22 P17 |
| Completed log (last 30 days, all projects) with Reopen. A recurring task shows its latest occurrence only, because one file keeps one `completed`. | All | MVP | building (not built) | task-model-v2 (`completed`, reopen), desktop-app (view) | desktop-app R34; task-model-v2 R7, R8 | /22 P18 |
| Search across tasks, notes and memories | All | MVP | building (core have) | desktop-app | desktop-app R8 | `tests/search_cli.rs`; /22 P19 |
| Command palette, keyboard-first | Partial | MVP | building | desktop-app | desktop-app R14, R27 | /22 P20 |
| Multi-select and bulk actions: complete, move, priority, due, labels, delete, with one undo | All | MVP | building (not built) | desktop-app | desktop-app R36 | /22 P21 |
| Duplicate task | All | MVP | building (built in the task menu, unverified) | desktop-app | desktop-app R14 | /22 P22 |
| Undo of delete and complete; an app delete stays recoverable from the OS Trash after quit | All | MVP | building | desktop-app | desktop-app R25 | `crates/shards-host/tests/host_tools.rs`; /22 P23 |
| Light and dark themes | All | MVP | building | desktop-app | desktop-app R23 | /22 P24 |
| Reminders for timed tasks while the app window is open | All | MVP | building (not built) | desktop-app | desktop-app R40 | /22 P25 |
| Week start, 12/24-hour time and date order from the system locale, with overrides | All | MVP | building (week start hard-coded to Monday) | desktop-app | desktop-app R38 | `apps/desktop/src/lib/dates.test.ts`; /22 P26 |
| Accessibility: screen-reader names, VoiceOver flows, reduced motion, 200 % zoom | All | MVP | building (reduced motion built) | desktop-app | desktop-app R37 | axe-core check in the `frontend` CI job; /22 P27 |
| Dependencies (blocked by / blocking) | No | MVP | building (core have) | desktop-app | desktop-app R11 | `tests/task_dep_cli.rs`; /22 P28 |
| Assignee plus agent delegate, session state, and a "Waiting on me" queue | Agent acts as the user | MVP | building (core have: owner, claim) | desktop-app | desktop-app R16, R39; root R2 | `apps/desktop/src/components/agent/agent-utils.test.ts`; /22 P29 |
| Per-task activity with actor | 7 days free | MVP | building | desktop-app, task-model-v2 | desktop-app R12; task-model-v2 R19 | /22 P30 |
| Memory and scratch managers | No | MVP | building | desktop-app | desktop-app R18–R21 | `memory-utils.test.ts`, `scratch-utils.test.ts`; /22 P31 |
| Quick add parsing in the CLI (`shards task add "…"`) | n/a | v1 | planned | app-polish | AP9 | app-polish plan |
| Reminders from the tray and while the window is closed | All | v1 | planned | app-polish | AP1 | app-polish plan |
| Global quick-add window | All | v1 | planned | app-polish | AP2 | app-polish plan |
| Saved filters and a filter query language | 3 free / 150 Pro | v1 | planned | app-polish | AP3 | app-polish plan |
| View options: sort and group per view (date, priority, project, assignee), remembered per view | All | v1 | planned | app-polish | AP10 | app-polish plan |
| Task links: a `shards://task/<id>` URL scheme and "Copy link" | All | v1 | planned | app-polish | AP12 | app-polish plan |
| Calendar view | Pro | v1 | planned | app-polish | AP4 | app-polish plan |
| Importers: Todoist, Obsidian Tasks | n/a | v1 | planned | app-polish | AP5, AP6 | app-polish plan |
| Onboarding, keyboard map, signed app with bundled CLI and MCP, one-click agent connect | All | v1 | planned | app-polish | AP7, AP8 | app-polish plan |
| Attachments | All | v1 | core have (assets); app view planned | app-polish | AP9 | app-polish plan |
| Multi-device sync, version history, trash | All | v1 | planned | sync | sync R1–R19 | sync plan (K12) |
| Hosted MCP with OAuth | All | v1 | planned | remote-mcp | remote-mcp R1–R16 | remote-mcp plan (K13) |
| Phone capture: PWA capture page, iOS Shortcut | All | v1 | planned | capture | capture (19b) | capture plan |
| Mobile web: review and complete (Today, Upcoming, Inbox; complete, reschedule, quick add) | All | v1 | planned | capture | capture (19b) | capture plan |
| Email-to-task | Yes | v1 | planned | capture | capture (19b) | capture plan |
| Push reminders while the app is closed (needs `shards-server` push and a mobile client) | All | later | planned | web-mobile | web-mobile | — |
| Shared projects, assignment to others, comments, @mentions | Business | later | planned | multiplayer | root R8 | — |
| Team roles, invites, activity feed, presence | Business | later | planned | multiplayer | root R8 | — |
| Web app; native mobile apps (share sheet, widget) | All | later | planned (target Q4 2027) | web-mobile | web-mobile | — |
| Calendar two-way sync, GitHub / Linear bridges, webhooks | 80+ integrations | later | planned | integrations | integrations | — |
| Quick add in languages other than English | Many languages | later | not planned | — | — | — |
| Durations, time-blocking, scheduled and start dates | Pro | later | not planned (open question) | — | — | — |
| Location reminders | Pro | later | not planned until mobile ships | — | — | — |
| Favourite projects | All | later | not planned | — | — | — |
| Templates; sub-projects and folders | All / Business | later | not planned | — | — | — |
| Built-in AI assists (filter assist, task breakdown, voice) | Assist, Ramble | — | not planned. The user's own agents do this over MCP. | — | — | — |
| Karma, productivity insights | Pro | — | not planned | — | — | — |
| Pomodoro, habits, Eisenhower matrix, sprints | No | — | not planned | — | — | — |

---

## Roadmap horizons

[plan.md](plan.md) § Feature Sequence owns the order and the gates. Sizing is in engineer-weeks
for the owner working with agents: S is up to 1 week, M is 2–4, L is 5–8 and XL is more than 8.

### Dated milestones

| Milestone | Target | Rests on |
|---|---|---|
| 14 shards-rebrand DONE (incl. trademark knockout search) | 2026-10-24 | S |
| 15 task-model-v2 DONE | 2026-11-21 | M, runs beside 16 (sanctioned exception) |
| 16 desktop-app DONE | 2026-12-12 | L |
| Owner dogfood (Now exit criterion) | 2026-12-13 → 2027-01-11 | 30 consecutive days |
| **Now exit review** | 2027-01-12 | recorded in § Decision log |
| 17 app-polish DONE → public beta | 2027-03-10 | L (8 wk), starts 2027-01-13 |
| 18 sync reaches beta | 2027-03-10 | XL planned at 12 wk, starts 2027-01-13 beside 17 |
| 18b billing DONE; hosted commitments met | 2027-04-07 | M, starts at sync beta |
| **18 sync DONE → GA, paid launch** | 2027-04-07 | 4-week soak dogfood after beta |
| 19 remote-mcp DONE | 2027-05-05 | M (4 wk) |
| 19b capture DONE (capture + review PWA) | 2027-06-09 | M (5 wk, widened 2026-10-16), after 19 |
| **Next exit review** | 2027-06-16 | 2 weeks of slack inside H1 2027 |
| web-mobile target | Q4 2027 | XL; exit criterion in § Later |

**Arithmetic.** The Next dates hold only under the 17 ∥ 18 exception in plan.md, with agents
carrying most implementation. If the owner must run 17 and 18 in sequence, sync GA moves to
≈ 2027-06-02, and 19 and 19b move to Q3 2027. 18 starts only when K20 is met at the Now exit
review ([plan.md](plan.md) row 18); otherwise the re-scope recorded there replaces these dates.

**Slip rule.** When a gate slips more than 2 weeks past its target, re-scope the next arc before
it starts and record the change in § Decision log. If sync GA would land after 2027-06-30, move it
to Q3 2027 openly. Never shorten the soak to hold a date.

### Now (Q4 2026 – mid-Jan 2027): "Replace Todoist for one person and their agents"

| Arc | Goal | Exit criteria | Size |
|---|---|---|---|
| shards-rebrand | One name everywhere. Existing mesh setups keep working. | No user-visible "mesh" remains except in the fallback notes. A mesh vault and config work unchanged for one release. The 40 tools are renamed to `shards_*`. All suites are green. The trademark knockout search is recorded. | S |
| task-model-v2 | Todoist-parity fields in the files, the CLI and MCP | Every v2 field round-trips. Finishing a recurring task moves it to its next due date. Date, parent and section filters work. A v1 task stays valid. | M |
| desktop-app | A desktop prototype covering every MVP view | Every MVP parity row reads "have", by its evidence step in desktop-app/22. Agent writes show up in the open app within KPI K4. | L |

**Now exit.** For 30 consecutive days the owner creates and completes every desktop-captured
personal task and every agent task in Shards, timed tasks included (desktop-app R40 reminds while
the app window is open). Todoist is used only for phone capture, each such use is logged, and the
count stays within KPI K1. Every MVP parity row reads "have". K20 is measured and recorded at
the review; a miss does not fail the Now exit, it re-scopes 18 ([plan.md](plan.md) row 18). Now
supports one machine per vault (product.md § Non-goals). The exit review walks
[plan.md](plan.md) § Now exit review, one line per MVP row with its evidence.

**Design-partner distribution (Now).** An ad-hoc-signed DMG with documented Gatekeeper steps,
plus `scripts/install.sh`, which installs the `shards` and `shards-mcp` binaries.

### Next (mid-Jan – Jun 2027): "Reach: every device, every cloud agent, power users"

| Arc | Goal | Exit criteria | Size |
|---|---|---|---|
| app-polish | Power-user tier and a public-beta quality bar | Outcomes AP1–AP10 and AP12 below hold (AP11 is withdrawn). | L |
| sync | Personal multi-device sync | KPI K12 passes. Conflict copies are recoverable. Offline edits merge on reconnect. Self-host runs as one binary. Every [product-hosting.md](product-hosting.md) commitment is met. | XL |
| billing (18b) | Revenue | A user can subscribe, be charged, cancel and export without contacting the owner (HOST-R1). | M |
| remote-mcp | Cloud agents reach the vault safely | Claude and ChatGPT connect over OAuth within KPI K13. Personal access tokens work for headless agents. Per-space scopes are enforced. Spoofed actor identities are refused. | M (research estimate: 3–4 weeks) |
| capture (19b) | Capture and review away from the desktop | Email-to-task through a per-user inbox address, an iOS Shortcut recipe, and a capture + review PWA served by `shards-server` from the same React app as the desktop (browser mode over the server transport): Today, Upcoming and Inbox read-only, plus complete, reschedule and quick add with the same parser. All are included in Personal Sync. A phone completes and reschedules a synced task, and the desktop shows it within the sync propagation target. | M (5 wk; reuses browser mode) |

**app-polish outcomes.** Its feature folder is created when 15 and 16 are DONE, and turns these
into numbered requirements.

1. **AP1 Reminders, full.** desktop-app R40 already reminds while the app window is open. AP1
   adds the tray, close-to-tray and delivery while the window is closed: a reminder still fires
   within 60 s of a timed task's due time.
2. **AP2 Global quick add** opens from a system shortcut in under 200 ms.
3. **AP3 Saved filters** (a first slice without grammar or saving, simple per-view filter chips,
   was pulled into desktop-app as R44 on 2026-10-16) use a documented grammar, a subset of Todoist's: `today`, `overdue`,
   `no date`, `due before: <date>`, `p1`–`p4`, `#project`, `/section`, `@label`,
   `assigned to: <member>`, combined with `&`, `|`, `!` and parentheses. An unknown term is an
   error, never an empty list.
4. **AP4 Calendar view** of due tasks by week and month.
5. **AP5 Todoist importer** (CSV and API) maps 100 % of projects, sections, labels, priorities,
   due dates, deadlines and supported recurrences. It lists every unmapped item in an import
   report and takes ≤ 60 s for 1,000 tasks.
6. **AP6 Obsidian Tasks importer** converts `- [ ]` lines with 📅/🔁 into task files without
   editing the source file.
7. **AP7 Onboarding** passes KPI K15, and a keyboard-map sheet ships.
8. **AP8 Distribution.** A signed, notarized app bundles `shards` and `shards-mcp` as sidecars,
   offers "Install command-line tools", and has "Connect an agent" with one-click MCP config for
   Claude Code, Claude Desktop and Cowork. The Tauri updater runs on a stable channel. A Homebrew
   cask/tap is published.
9. **AP9 Parity extras.** `shards task add "…"` parses the same quick-add grammar as the app. The
   app shows, opens and attaches task assets.
10. **AP10 View options.** Each task view offers sort (manual, date, priority, project, assignee)
    and group (none, date, priority, project, assignee, label). The choice is remembered per view.
    Pulled forward into desktop-app as R43 (desktop-app/39) on 2026-10-16.
11. **AP11 Duplicate task.** Withdrawn 2026-10-16: the app already duplicates a task from the task
    menu, so the row is MVP under desktop-app R14. The id stays reserved.
12. **AP12 Task links.** The app registers a `shards://task/<id>` URL scheme that opens the task
    in its detail pane, and "Copy link" puts that URL on the clipboard. An unknown id opens a
    "Task not found" state, never an error page.

### Later (H2 2027 onward): "Multiplayer and everywhere"

| Arc | Goal | Exit criteria | Size |
|---|---|---|---|
| multiplayer | Teams of humans and agents, including sync Phase B (replication across members). Starts only after ≥ 100 paying Personal Sync subscribers. | Workspaces, roles and invites work. Shared projects, comments, mentions, notifications, the activity feed and presence work. The Team plan and its DPA are live. | XL |
| web-mobile | Review and capture everywhere. Target: Q4 2027. | A full web client (every MVP view, editing included) ships from the 19b PWA. iOS and Android apps ship with Today, Upcoming, Inbox, quick add, a share sheet and push reminders that fire within 60 s of a timed task's due time. | XL |
| integrations | Fit into existing workflows | Calendar sync, GitHub and Linear bridges, webhooks | L, incremental |
| e2ee | Per-workspace end-to-end encryption | Opt-in for each workspace. Remote MCP is disabled for those workspaces. An external audit passes. No custom cryptography. | L |

---

## Pricing and business model

| Tier | Price | Includes |
|---|---|---|
| **Local** | Free forever, MIT core, no account | Desktop app, CLI, stdio MCP. Unlimited tasks, projects and agents on one machine. Syncing the folder yourself (git, iCloud, Syncthing) is at your own risk; see the README's known failure modes. |
| **Personal Sync** | $5/month or $48/year, 14-day trial | Multi-device sync, version history and trash, **a hosted remote MCP endpoint for cloud agents**, phone and email capture, and web and mobile apps when they ship |
| **Team** | $8 per human seat per month | Shared workspaces, roles, verified agent identities with scoped tokens, audit and activity feed. **Agents are free members**, within the plan limits in [product-hosting.md](product-hosting.md). |
| **Self-hosted server** | Free | One binary on SQLite, with sync and remote MCP on your own infrastructure |

- **Rationale.** Personal Sync undercuts Todoist Pro ($48 against $60 a year), and Team matches
  Todoist Business annual pricing. These match local-first price points that users already
  accept: Obsidian Sync at $4/$8 and Anytype at $4/$8/$16 (research: market §6). The hosted
  MCP endpoint is a concrete reason to pay. Cloud agents cannot reach a local stdio server.
- **Never resell LLM compute.** Notion credits, Rovo credits and Mem0's $249 graph tier all draw
  pushback from buyers. Users bring their own agent and their own model.
- **Free self-host.** It is a trust signal for the privacy-first personas, and revenue comes from
  convenience. Enterprise SSO and SCIM may become a paid add-on later. That is not decided.
- **Illustrative targets.** 1,000 Personal Sync subscribers at $48 is ≈$48k ARR. 50 teams of 6
  seats at $96 per seat per year is ≈$29k ARR. Sustainability for one maintainer starts at
  roughly 2,500 subscribers, or the equivalent mix. Cost of goods: [product-hosting.md](product-hosting.md) § Unit economics.

## Go-to-market

1. **Private alpha** (Now). The owner dogfoods Shards with 5–10 design partners from the owner's
   network. Each design partner runs their own local vault. Selection: runs ≥ 3 agents weekly on
   macOS and uses Todoist or Obsidian Tasks today. Active weekly = ≥ 5 tasks completed in Shards
   that week, self-reported in a 4-question weekly form, plus a 30-minute call every two weeks.
   The fourth question is price sensitivity: "Would you pay $48 a year for Personal Sync (sync,
   hosted MCP, phone capture) today? Yes / at a lower price (which) / no (why)". At the Now exit
   review each partner is asked to pre-pay or sign a written intent to buy (K20). Feedback is
   triaged into a GitHub project within 48 h.
2. **Public beta** (after app-polish, ≈ 2027-03).
   - Ship the signed macOS build, the Homebrew cask and the GitHub release.
   - List it in the Claude Code plugin marketplace (the Shards plugin already exists)
     and in the MCP registries.
   - Post a Show HN titled "Todoist-grade tasks on Markdown you own, shared with your agents".
   - Post in the Obsidian forum and r/ObsidianMD for persona 2.
3. **Sync launch** (≈ 2027-04). Launch on Product Hunt with a pricing page. Lead with "your cloud
   agents can reach your vault". The importers serve as the switching lever.
4. **Team launch** (Later). Only once identities are verified. Start with design-partner teams.

**Copy.** Public copy in Now and Next uses the tagline in [product-market.md](product-market.md)
§ Positioning. "Multiplayer" enters copy only at the Team launch. Channels: dogfood write-ups
("how I run 8 agents from one to-do list"), comparison pages (Todoist, Backlog.md, Obsidian
Tasks, Basic Memory), agent-guidance templates, open-source issues and discussions. The message
leads with the to-do app and file ownership, never with "agent kanban".

## Measurement

**Decided (resolves the former product.md open question 3).** The app and the CLI send no
telemetry, not even an opt-in ping. Signals come from:
- **server-side counts** for synced and hosted users: accounts, subscriptions, active vaults,
  writes by actor kind, MCP grants and calls, client type;
- **a design-partner panel** for local users: the weekly form and calls in § Go-to-market;
- public counts: release downloads, Homebrew installs, GitHub stars and issues, plugin installs
  where the marketplace reports them.

**North star:** weekly active vaults with ≥ 1 human write and ≥ 1 agent write in the week.
Server-counted for synced vaults; panel-reported for local vaults.

**Funnel assumptions** (to re-check at the public beta + 90 days):

| Step | Rate | Measured by |
|---|---|---|
| Download → activated (3 tasks captured and 1 agent connected) | 40 % | Panel and moderated tests |
| Activated → retained at day 30 | 35 % | Panel; server for synced vaults |
| Retained → paid Personal Sync | 15 % (an assumption until K20 and K21 report) | Server |
| Download → paid (product) | ≈ 2.1 % | Inside the 2–5 % freemium band |

## KPIs per horizon

This table is the only source of KPI targets. Feature docs cite rows by id and do not restate
the numbers.

**Spec rule KPI-1 (lint).** A target for a KPI-class quantity appears only in this table:
adoption, retention, revenue, dogfood, panel and business rows, and any row that restates a K id.
Every other spec cites the id (for example "KPI K12") and names no number for it. Engineering
budgets (latency, CPU, size, conformance, parity) stay in [tech.md](tech.md) § Performance
Budgets and in feature docs, because they are not KPIs. Check before every spec change:

```bash
grep -rnE -i 'subscriber|download|stars|churn|retention|weekly-active|design partner|Todoist (untouched|use)|devices|pre-pay|paying' .spec --include='*.md' \
  | grep -vE '^\.spec/(product-roadmap|product-hosting|lessons)\.md:' \
  | grep -E '[0-9]+ ?%|≥ ?[0-9]|< ?[0-9]|at least [0-9]|[0-9]+ consecutive' | grep -vE '\bK[0-9]+\b'
```

It must print nothing (it printed nothing on 2026-10-16). A hit is fixed by citing the K id, or
by adding a K id here. [product-hosting.md](product-hosting.md) is exempt: plan limits and unit
economics are commitments and costs, not KPIs.

| Id | Horizon | KPI | Target |
|---|---|---|---|
| K1 | Now | Owner dogfood | The Now exit: 30 consecutive days, < 10 logged Todoist uses per week, phone capture only |
| K2 | Now | Design partners active weekly | ≥ 5 of 10 |
| K3 | Now | Share of agent tasks claimed through `task next` or a claim, not by chat paste (owner's vault) | ≥ 80 % |
| K4 | Now | Capture and freshness | Quick add file written < 200 ms after Enter; agent write visible p95 < 1 s |
| K5 | Now | CLI cold start (guardrail) | Stays under the 10 ms target |
| K6 | Now | North star (panel) | ≥ 5 vaults weekly: the owner's plus ≥ 4 design partners' |
| K20 | Now | Willingness to pay, measured at the Now exit review: design partners who pre-pay or sign a written intent to buy Personal Sync at $48/yr | ≥ 5 of 10 |
| K22 | Now | Median time from an agent's stamped `needs-input` question to the operator's answer comment (task body stamps; owner's vault and panel) | ≤ 4 h within working hours |
| K7 | Next | Downloads, public beta to 90 days after sync GA | ≥ 5,000 |
| K8 | Next | GitHub stars | ≥ 1,500 |
| K9 | Next | Personal Sync subscribers within 90 days of sync GA (server count) | ≥ 100 |
| K10 | Next | Monthly churn of Personal Sync | < 5 % |
| K11 | Next | 30-day retention, design partners and beta panel | ≥ 30 % |
| K12 | Next | Sync soak: convergence simulator with 10,000 seeds in CI, plus a 4-week dogfood on 3 devices with ≥ 5 agents | 0 lost writes, 0 duplicate ids |
| K21 | Next | Personal Sync trials started per release download, 90 days after sync GA (server trial count ÷ public download count) | ≥ 5 % |
| K13 | Next | Remote MCP connect time from Claude or ChatGPT, no manual token copy | Median ≤ 60 s, p90 ≤ 3 min |
| K14 | Next | Personal Sync subscribers with ≥ 1 active MCP grant at day 30 (grants table) | ≥ 40 % |
| K15 | Next | Moderated onboarding test: install, capture 3 tasks with quick add, see an agent task in Today | 5 of 6 first-time users within 5 minutes |
| K16 | Next | North star (server, synced vaults) 90 days after sync GA | ≥ 60 |
| K17 | Later | Paying teams | ≥ 25 |
| K18 | Later | Teams with ≥ 1 agent member active weekly (server) | ≥ 60 % |
| K19 | Later | Phone, email and mobile captures as a share of task creates, synced users only (server, by client type) | ≥ 25 % |

## Risks and mitigations

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| **Name collision.** Crystal ships a `shards` binary. `shards` is taken on crates.io and npm. A Tauri "Shards" writing app exists. | High / medium | Accepted by the owner (D1). A trademark knockout search (EUIPO, USPTO, DPMA; classes 9 and 42) and a domain check gate 14, before the rename is committed. The full clearance search gates the public beta. Always pair the brand with a descriptor. Install docs check for an existing `shards` on PATH. |
| **Multi-writer sync loses or garbles agent writes.** Beads moved off JSONL in git for this reason. | Medium / high | Record sync keyed by id, not file sync. Per-field frontmatter merge, three-way body merge, conflict copies, server-decided claims with expiry. Sync GA is gated on K12. Local commands never depend on sync. |
| **Users sync the folder themselves before Shards sync.** A finish moves a file, so path-based sync duplicates tasks; conflict markers in frontmatter hide tasks. | High / medium | Now supports one machine per vault. The README lists the known failure modes. The Local tier says "at your own risk". |
| **Mobile gap.** Todoist and Things keep users through phone capture. | High / high for persona 2 | Desktop-first, said plainly. The Now exit allows logged Todoist use for phone capture. The capture arc (19b: email-to-task, the capture + review PWA, iOS Shortcut) ships in Next; native apps in web-mobile (target Q4 2027). |
| **Pricing risk: paying for Sync with no phone.** Personal Sync goes GA on 2027-04-07, but the 19b review PWA lands on 2027-06-09. For about nine weeks a subscriber cannot see or complete Today on a phone. A Todoist Pro user compares $48 against $60 and sees the gap first. | High / high for persona 2 and Todoist switchers | K20 tests willingness to pay before 18 starts. The pricing page and launch copy name the phone gap and the 19b date. If K21 misses at GA + 90 days, revisit the price or move 19b ahead of 19 and record it in § Decision log. |
| **Sync built before demand is proven.** 18 is a 12-week XL build plus billing. | Medium / high | K20 gates the start of 18 ([plan.md](plan.md) row 18). If K20 misses, re-scope to self-host-first or capture-first before any server work. |
| **Hosted-service liability** (downtime, data loss, GDPR) | Medium / high | Every [product-hosting.md](product-hosting.md) commitment gates sync GA. EU-only data at launch. |
| **MCP churn.** The protocol revised from 2025-06 through 2026-07, and its authorization rules change. | High / medium | Thin layers over one core. Serve the current and the previous protocol versions. The CLI stays the canonical, stable surface. |
| **Crowded agent-kanban field.** 8+ startups, and incumbents are adding agents. | High / medium | Do not position as an agent board. Lead with personal to-do quality, file ownership and memory in the same vault. |
| **Scope creep.** Matching Todoist, Linear and Mem0 at once. | High / high | Binary gates. The parity matrix is the scope contract. Every row outside it reads "not planned". |
| **Trust gap before sync.** Local owner and claimer are honour-system strings. | Certain / medium | No "multiplayer" in copy until verified identities ship. Locally, document identity as a convention. |
| **One-maintainer bandwidth.** | High / high | Agents build through Shards. Small arcs with binary gates and the slip rule. Multiplayer (XL) starts only after ≥ 100 paying Personal Sync subscribers. |
| **Breaking existing mesh users in the rename.** | Medium / medium | One release of fallback to `MESH_*` and `~/.mesh`. Upgrade notes. No tool-name aliases. |
| **Signing and notarization cost and friction** | Medium / low | Ad-hoc DMG for design partners in Now; signing in app-polish (AP8), before the public beta. |

## Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07 | Keep and extend mesh. Reject GBrain and Beads as replacements. | Both make a database the truth, against Markdown-as-truth |
| 2026-08 | No notes-app coupling; `[core].vault_path` is canonical | It was never a code dependency |
| 2026-09 | Rust rewrite: one binary, five spaces, daemon removed | Agent hot loops pay startup on every call |
| 2026-09 | Rename shards → mesh, with no aliases | **Superseded 2026-10-15** |
| 2026-10-15 | **D1** Name: Shards everywhere (`shards`, `shards-mcp`, `shards_*`, `SHARDS_*`, `~/.shards`), with a one-release `MESH_*` / `~/.mesh` fallback and no tool aliases | The owner's explicit choice. The research advice to keep `mesh` as the CLI name is recorded as a risk. |
| 2026-10-15 | **D2** Positioning: the multiplayer task manager for humans and agents, backed by Markdown you own | MCP access alone is table stakes (research: market §0) |
| 2026-10-15 | **D3** Personas: agent operator (beachhead), Markdown-native worker, small team, the agent | Research: market §5c |
| 2026-10-15 | **D4** Delegation: owner is the accountable assignee and claimed_by is the delegate. An actor on every write. | Category consensus (Linear) |
| 2026-10-15 | **D5** Pricing: Local free; Personal Sync $5/month or $48/year with hosted MCP; Team $8 per human seat; agents free; self-host free; no compute resale | Research: market §6 |
| 2026-10-15 | **D6** Core delete stays hard. The app undoes through restore. Vault trash comes with sync. **Amended 2026-10-16** (below). | Keeps the core invariant and gives humans undo |
| 2026-10-15 | Task model v2: urgent/high/normal/low, due, deadline, recurrence (from due or completion), parent, section, order, completed | Todoist parity. All fields are optional, and unknown keys still round-trip. |
| 2026-10-15 | Sync model: server-ordered record sync, per-field merge, three-way body merge, conflict copies, tombstones, server-decided claims. No CRDT as the store, no git sync. | Writes arrive as whole-file diffs, so a CRDT adds drift without better merges (research: sync) |
| 2026-10-15 | Remote MCP: hosted, OAuth with consent, personal access tokens, per-space scopes, actor taken from the grant | Closes the identity gap (research: mcp-oauth) |
| 2026-10-15 | E2EE comes last, per workspace, and is incompatible with remote MCP | Server-side merge and remote MCP need plaintext |
| 2026-10-15 | Principle reversals: sync, UI and roles, server identity, long-running app processes, surface growth | Recorded in [product.md](product.md) § Non-goals |
| 2026-10-15 | *Spec review refinements, decided autonomously while the owner was unavailable; the owner may reverse any of them:* | |
| 2026-10-15 | R1 means "every MVP parity row reads have". The Now exit allows logged Todoist use for phone capture and reminders only (< 10 per week). **Reminders part superseded 2026-10-16.** | Reminders and phone capture are not in Now scope; the old exit could not pass honestly |
| 2026-10-15 | Dated milestones and the slip rule (§ Roadmap horizons) | Binary gates alone gave no decision point |
| 2026-10-15 | 17 app-polish and 18 sync run in parallel (plan.md exception). Multiplayer starts only after ≥ 100 paying subscribers. | Sync is the only revenue; it cannot wait for polish. Replaces "defer XL arcs until revenue exists" |
| 2026-10-15 | New arc 18b billing: Paddle as merchant of record, 14-day trial, 30-day read-only server copy after cancel | No arc owned revenue |
| 2026-10-15 | New arc 19b capture moves email-to-task from Later (integrations) to Next, with a PWA capture page and an iOS Shortcut | The mobile-gap mitigation had no arc behind it |
| 2026-10-15 | Hosted-service commitments gate sync GA ([product-hosting.md](product-hosting.md)) | Charging for a hosted service needs SLO, backups, GDPR duties and incident response |
| 2026-10-15 | No client telemetry; server counts for synced users; a design-partner panel for local users. North star, funnel and KPI ids K1–K19. | Several targets could not be measured; resolves product.md open question 3 |
| 2026-10-15 | Public tagline for Now and Next: "Todoist-grade tasks for you and your agents — on Markdown you own." D2 stays the long-term category; "multiplayer" enters copy at the Team launch. | § Principles: no marketing before the trust model exists |
| 2026-10-15 | D4 refinement: session states on the wire are `queued`, `working`, `needs_input`, `error`, `done` ("awaiting input" is now "needs input") | The app shows queued agent work; one enum across docs |
| 2026-10-15 | D4 refinement (remote): actor arguments (`claimer`, release `owner`, author `owner`, write `agent`) must equal the token actor; the assignee `owner` on task create and update may name any active workspace member. A refusal is tool error `identity_mismatch`. | Assignment to others is the point of D4; the literal "owner must equal actor" rule forbade it |
| 2026-10-15 | Now supports one machine per vault; agents on other machines use the local CLI over SSH | No sync exists in Now, and path-based sync duplicates tasks |
| 2026-10-16 | *Spec critique pass, decided autonomously while the owner was unavailable; the owner may reverse any of them:* | |
| 2026-10-16 | **Reminders reversal.** A minimal reminder moves into Now as desktop-app R40: a native notification within 60 s of a timed task's due time while the app window is open. No tray and no closed-app delivery; those stay AP1. The Now exit allows logged Todoist use for phone capture only. | Timed reminders are the most common Todoist use, so the 30-day dogfood could not prove replacement without them. The app is already a long-running process, which is all R40 needs. |
| 2026-10-16 | **D6 amended.** Core and CLI delete stay a hard unlink. The host tools `host_task_delete`, `host_note_delete`, `host_memory_forget` and `host_scratch_clear` move the file to the OS Trash instead. If the move fails, the delete is refused and nothing is unlinked. | A 30-day dogfood of real personal data runs before sync tombstones exist; one misclick plus a quit must not lose data. |
| 2026-10-16 | The parity matrix gains "Owning requirement" and "Evidence" columns. A row reads "have" only when its evidence step passes in desktop-app/22 against a 15-DONE core, so earlier "have (core)" MVP rows read "building" until then. | R1 and the Now exit review must be checks, not judgement |
| 2026-10-16 | New parity rows and tiers. **MVP:** completed log (desktop-app R34), project create/rename/colour/order and archive/delete (R35), multi-select and bulk actions (R36), accessibility (R37), locale (R38), "Waiting on me" (R39), in-window reminders (R40), duplicate task (R14). **v1:** view options (AP10), task links and `shards://` (AP12), mobile web review (19b). **Later, not planned:** favourite projects, templates, quick add in other languages. | Everyday Todoist tools a switcher hits on day one; favourites and templates add surface without changing the daily loop |
| 2026-10-16 | AP11 (duplicate task) withdrawn: the app already duplicates from the task menu, so the row is MVP under desktop-app R14 | Code is truth; scheduling a built feature in v1 would misstate the matrix |
| 2026-10-16 | K20 willingness to pay gates the start of 18 sync. If it misses, re-scope to self-host-first or capture-first and record it here. The weekly form gains a price-sensitivity question. | The 15 % retained-to-paid rate is an assumption, and 18 + 18b is the largest build on the roadmap |
| 2026-10-16 | 19b widens from capture to capture + review PWA (Today, Upcoming, Inbox read-only; complete, reschedule, quick add), resized to M (5 wk). web-mobile targets Q4 2027. The phone gap is recorded as a pricing risk. | Paid Sync with no way to see Today on a phone undercuts the Todoist Pro comparison |
| 2026-10-16 | KPI ids K20–K22 added. Feature docs cite K ids instead of restating targets (spec rule KPI-1). The sync "5 % of weekly-active desktop users" metric becomes K21 (trials per download), because WAU cannot be measured without telemetry. | One source of targets; the old rows contradicted K1, K12 and K14 |
| 2026-10-30 | **D7 `indexed` handoff — owner ruling: Shards keeps owning the CLI↔`indexed` contract.** One subprocess, `indexed index search <q> --collection <C> --limit <N>`, the child in `INDEXED_SIMPLE_OUTPUT=1`, one envelope decoded in `src/search/indexed.rs`. Shards does **not** become an MCP client of `indexed`. The guardrail lives on the Shards side — the engine report in `shards doctor` (DR10) — and works over either transport. | Two failures, both **contract-version** failures rather than transport failures: 2026-10-23 was a **capability mismatch** (Shards passed `--json` to a build that did not implement it; fixed in #11 `ebb9cab6`) and 2026-10-24 an **argument mismatch** (a negative `--limit` produced a valid empty envelope at exit 0; fixed in #31 `56a4777`). Both are caught by a versioned CLI contract plus an engine probe; neither is caught by switching transport. MCP would add a process/session lifecycle and a second protocol surface to a local tool that already answers in one call, and it would put the guardrail in the wrong place: the silent-degradation risk is in *how Shards calls the engine*, so it belongs on the Shards side. Closes [#13](https://github.com/LennardZuendorf/shards/issues/13). |
