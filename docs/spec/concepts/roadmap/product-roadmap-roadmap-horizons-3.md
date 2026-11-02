---
type: concept
updated: 2026-11-02
---

# product-roadmap: Roadmap horizons (3/3)

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
   **Distribution exception, 2026-10-30:** the owner brought the release/testing pipeline and
   Homebrew foundation forward into [release-pipeline](../../features/release-pipeline/product.md).
   Its first Mac release may be unsigned and unnotarized; the owner accepts the security
   prompt. Signing, updater and onboarding actions remain separate app-polish work.
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

Parent: [Section index](README.md).
