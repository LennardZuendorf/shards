---
type: feature-design
feature: desktop-app
sibling: product.md
parent: ../../design.md
updated: 2026-10-16
---

# Feature: Desktop App — Design

Screen-level layouts and flows for every view in the desktop app. The look comes entirely from
the root design language: neutrals carry the surface, brand violet (`primary`) marks selection,
focus and working agents, and colour appears only for priority, due state, identity and agent
session state. This document places those tokens on screens; it adds no new values. Token names
below are the root ones: `bg`, `sidebar`, `subtle`, `fg`, `muted`, `border`, `primary`,
`primary-soft`, `ring`; `semantic.success|warning|danger|info`; `priority.urgent|high|normal|low`;
`identity.human|agent|avatar-fill`; `session.working|awaiting-input|error|done`;
`due.overdue|today|tomorrow|this-week|later`; type roles `display`, `title`, `heading`, `body`,
`small`, `caption`, `mono`; radii `sm`, `md`, `lg`; spacing `row` (36px), `row-compact`, `sidebar`
(248px), `detail` (420px); components `task-row`, `checkbox`, `chip`, `avatar-human`,
`avatar-agent`, `sheet`, `toast`.

**Parent:** [../../design.md](../../design.md)
**Requirements:** [product.md](product.md)
**Architecture:** [tech.md](tech.md)
**Plan:** [plan.md](plan.md)

---

## Design Intent

- **One window, three regions, no modes.** Sidebar, list, detail sheet. Every view is a list
  that opens items in the same sheet, so the operator learns one layout once.
- **Dense and calm.** 25+ rows on a 900px-tall window. Metadata is `caption` in `muted`; titles are
  `body` in `fg`. Nothing moves unless something changed.
- **Agents are always legible.** Shape (circle vs rounded square) is the identity signal; the
  session dot is the state signal. A row never needs hovering to show who holds it.
- **The file is never hidden.** Every detail sheet ends with the path and "Reveal in folder".
- **Undo instead of confirm.** Single actions never ask. Only these confirm: bulk forget, bulk
  clear, bulk delete of two or more tasks, deleting a project that still has open tasks (the
  dialog names the count), and taking work back from an agent.
- **Motion is optional.** Under `prefers-reduced-motion` the change flash and drag animations do
  not play; nothing conveys state by motion alone.

---

## Shell

```
┌──────────────────────┬──────────────────────────────────────────┬────────────────────────────┐
│ ● ● ●   Shards    [ │  Today                    ≡ List  ⊞ Board │  (detail sheet, 420px)     │
│ ─────────────────── │  Wed 15 Oct · 7 tasks                      │                            │
│ ⌕ Search        /   │                                            │                            │
│ ▣ Inbox          4  │  ▾ Overdue  3              Reschedule ›    │                            │
│ ◷ Today          7  │  ○ Pay invoice    ⚑ Yesterday  @admin  (L) │                            │
│ ▦ Upcoming          │  ...                                       │                            │
│ ⧗ Waiting on me  2  │                                            │                            │
│ ✓ Completed         │                                            │                            │
│ ◈ Agents        ●2  │  ▾ Today  4                                │                            │
│ ✦ Memories          │  ○ Renew passport  10:00  Home     [c]●    │                            │
│ ✎ Scratchpads       │  ...                                       │                            │
│ ▤ Notes             │                                            │                            │
│                     │                                            │                            │
│ PROJECTS          + │                                            │                            │
│ ● Home           6  │                                            │                            │
│ ● Shards launch 11  │                                            │                            │
│ LABELS              │                                            │                            │
│ @admin  3  @health 1│                                            │                            │
│ ─────────────────── │                                            │                            │
│ (L) lennard   ⚙     │  ● live                         ⌘K  q  ?   │                            │
└──────────────────────┴──────────────────────────────────────────┴────────────────────────────┘
```

- Sidebar on `sidebar`, 248px; `[` collapses it (state remembered). Traffic-light inset at the
  top in the native window; the header row is the window drag region.
- Counts are `caption`, tabular numerals, `muted`; Today's count turns `due.overdue` when anything
  is overdue. Agents shows a `session.working` dot with the number of working agents.
- Project rows carry their colour dot; Labels list wraps as chips.
- Footer: operator avatar (`avatar-human`), settings, and the live indicator: `semantic.success`
  dot "live", `muted` "connecting", `semantic.warning` "offline · refreshing on focus".
- The list column is centred at max 760px inside its region; sticky view header (`title`).
- The sheet (`sheet`) slides from the right, overlays below 1100px, becomes a page below 768px.

---

## Task row

```
 ○ Renew passport  ↻                          ⚑  Fri   ⌖ 31 Oct   @admin  Home   (c)◂(L)  ●
   └ 2/5 subtasks · Blocked by 1
```

- Checkbox: circle, ring in the priority colour (`priority.*`) with 10% fill; recurring tasks
  show ↻ inside the row title area. Click completes; right-click opens priority/status menu.
- Chips in order: priority flag (urgent/high only), due chip (`due.*` colour, relative text,
  time when set), deadline chip (outline target glyph; `semantic.danger` when past,
  `semantic.warning` within 2 days), labels (max 3, then +n), project (only outside its own
  project), assignee avatar with the worker avatar overlapping when different, session dot
  (`session.*`; pulsing only for working).
- Second line only when it has content: subtask progress, blocked count, `needs input from you`.
- Selected row: `primary-soft` background, `ring` focus outline. Hover: `subtle`.
- Done in place (undo window): strike-through, 60% opacity, then leaves.
- Changed by someone else: a 600ms `primary-soft` flash, nothing else.

---

## Inbox

```
  Inbox                                                           Sort: Newest ▾
  4 tasks · triage what agents and quick add dropped here
  ───────────────────────────────────────────────────────────────────────────────
  ○ Look into flaky deploy test              created by (c) claude · 2h       Move ›
  ○ Buy stamps                       @errand                                   Move ›
  + Add task
```

- Creator avatar and age on the right: agent-created tasks stand out by the agent square.
- Hover reveals "Move ›" (opens the project picker; same as `#` key).
- Empty: "Inbox zero. New tasks without a project land here." + "Add task".

---

## Today

```
  Today                                                           Wed 15 Oct
  ▾ Overdue  3                                          Reschedule to today
    ○ Pay invoice                         ⚑ Yesterday  @admin
    ○ Reply to accountant                   Mon 13 Oct
  ▾ Today  4
    ○ Renew passport                        10:00      Home
    ○ Ship release                          ⌖ Today    Shards launch   (L)◂(c) ●
  + Add task  (due today)
```

- Overdue header carries the bulk action on the right as a ghost button; its dates are
  `due.overdue`.
- Groups sort by time, then priority, then manual order.
- Empty: "Nothing due today." and, when Upcoming has items, "Next: Thu · 2 tasks ›".

---

## Upcoming

```
  Upcoming                                       ‹  13–19 Oct  ›     Today
  ▸ Overdue  3
  ── Wed 15 Oct · Today ──────────────────────────────────────────────── 4
    ○ Renew passport                        10:00
  ── Thu 16 Oct · Tomorrow ───────────────────────────────────────────── 2
    ○ Book dentist                          09:00  @health
  ── Fri 17 Oct ──────────────────────────────────────────────────────── 0
    + Add task
  ── Sat 18 Oct … Tue 21 Oct
```

- Seven day headers always render (`heading` with weekday, date, count right-aligned). Empty days
  show only the "+ Add task" ghost row, which opens quick add pre-dated.
- Week stepper: ‹ › shift by 7 days; "Today" returns.
- Dragging a row onto another day header changes its due date.

---

## Project: list layout

```
  ● Shards launch                                    ≡ List  ⊞ Board   ⋯
  ───────────────────────────────────────────────────────────────────────
    ○ Draft announcement                                    (L)
  ▾ Next  3                                                       ⋯
    ⠿ ○ Ship release            ⌖ Today                    (L)◂(c) ●
        ○ Write changelog       Thu                        (c)     ●
        ○ Tag build                                         
    ⠿ ○ Record demo
  ▸ Waiting  1
  ▾ Later  0
    + Add task
  + Add section                                     ☐ Show completed
```

- Tasks without a section first, no header. Section headers are sticky, collapsible, with a ⋯
  menu: rename, move up/down, delete (only when empty).
- Drag handle ⠿ appears on hover; drop indicator is a 2px `primary` line. `⌥↑`/`⌥↓` reorders
  from the keyboard.
- Subtasks indent 24px under their parent with a collapse chevron; deeper levels show "n
  subtasks ›".
- "Show completed" appends a Done group (struck rows, `muted`) for the last 14 days.

## Project: board layout

```
  Group by: Section ▾                                                        
  ┌ (no section) 1 ┐ ┌ Next 3 ──────────┐ ┌ Waiting 1 ─────┐ ┌▸┐ ┌ + Section ┐
  │ Draft announce │ │ Ship release     │ │ Legal review   │ │L│ └──────────┘
  │          (L)   │ │ ⌖ Today (L)◂(c)● │ │ Mon     (L)    │ │a│
  └────────────────┘ │ Write changelog  │ └────────────────┘ │t│
                     │ Thu      (c) ●   │                    │e│
                     │ + Add            │                    │r│
                     └──────────────────┘                    └─┘
```

- Columns 280–360px on `subtle`, header `heading` + count; collapsed column = 48px strip with the
  rotated name and count (Later above).
- Cards are the row content on two lines (`rounded.lg`, `border`); the drag overlay tilts 2° with
  the md shadow.
- Group by Status: To do · In progress (each card names the worker) · Done · Cancelled (collapsed).
  Dropping an agent-held card on To do opens a small confirm popover anchored to the card: "Take
  back from claude? It stops working on it." [Take back] [Cancel].
- While dragging, empty columns show a dashed drop zone "Move to Waiting".

---

## Completed

```
  Completed                                              Last 30 days
  ▾ Today · Thu 16 Oct
    ✓ Pay invoice                  Home          09:12   (L)        Reopen
    ↻ Water plants                 Home          08:00   (L)   next Fri 17 Oct
  ▾ Wed 15 Oct
    ✓ Write changelog              Shards launch 17:40   (c)        Reopen
```

- Rows are `muted` with a filled check; the actor avatar is the task's last writer.
- Recurring rows show ↻ and the next date instead of Reopen.
- Empty: "Nothing completed in the last 30 days."

---

## Waiting on me

```
  Waiting on me  3                                        Longest wait first
  ● Rotate API key       (c) Needs input · 2 h   "Which vault?"   [ Answer & resume … ]
  ● Nightly import       (x) Error · 1 h        "Token expired"   [ Answer & resume … ]
  ○ Ship release         (x) Blocked by Approve changelog (you) · 3 h
```

- The session dot and copy match the Agents view; the quoted text is the newest stamped line.
- "Answer & resume" expands to a one-line input in the row; Enter sends, Esc collapses.
- Empty: "Nothing is waiting on you."

---

## Bulk bar (task lists)

```
  4 selected   Complete   Move ›   Priority ▾   Due ▾   Labels ▾   Delete…   ✕
```

- Slides up from the bottom when two or more rows are selected (`x`, ⌘-click, Shift-click,
  Shift+↓/↑); `Esc` or ✕ clears. Selected rows keep the `primary-soft` background.
- One toast per batch: "Rescheduled 4 tasks · Undo"; partial failure: "3 of 4 rescheduled · 1
  not found · Undo".

---

## Label view

```
  @admin                                                       3 open tasks
  ── Home ──────────────────────────────────────────────────────────── 2
    ○ Pay invoice                        ⚑ Yesterday
  ── Shards launch ─────────────────────────────────────────────────── 1
```

- Grouped by project, Inbox first. Label colour is the stable hue of its name, shown only on the
  header chip.

---

## Search

```
  ⌕ passport_______________________________________   ☐ Include scratchpads
  TASKS 1
    ○ Renew passport                        Fri    Home
  NOTES 1
    ▤ Travel checklist        "…passport photo in the drawer…"    updated 3d
  MEMORIES 1
    ✦ Passport number is in 1Password        fact · ●●●○○ · (c)
```

- `/` focuses search from anywhere. Results stream per group as they arrive; `j`/`k` crosses
  groups; Enter opens the sheet. Snippets in `small`, match highlighted with `primary-soft`.
- Empty: "No match for "zeppelin"" + "Create task "zeppelin"".

---

## Task detail sheet

```
┌──────────────────────────────────────────┐
│ ○  Ship release                      ⋯ ✕ │
│ Shards launch › Next                      │
│──────────────────────────────────────────│
│ Assignee     (L) lennard                  │
│ Worker       (c) claude  ● Working   ⇄   │
│ Due          Today 17:00                  │
│ Deadline     ⌖ Fri 17 Oct                 │
│ Repeat       —                            │
│ Priority     ⚑ High                       │
│ Labels       @release  +                  │
│ Blocked by   ○ Write changelog       ✕   │
│ Blocking     —                  Ready: no │
│──────────────────────────────────────────│
│ Description                      ✎ Edit  │
│ Cut the 0.3 build and publish notes…     │
│──────────────────────────────────────────│
│ Subtasks 1/3                              │
│ ☑ Bump version  ○ Tag build  ○ Publish   │
│ + Add subtask                             │
│──────────────────────────────────────────│
│ Activity                                  │
│ (c) claude claimed · 2h                   │
│ (c) claude · 40m  "Which changelog       │
│     format?"                              │
│ (L) lennard · 12m  "Keep a Changelog."   │
│ [ Comment…                       Send ⏎ ]│
│──────────────────────────────────────────│
│ tasks/open/t-7Q2M.md       Reveal ›      │
└──────────────────────────────────────────┘
```

- Header: checkbox, title (inline edit on click or `F2`), breadcrumb project › section (click to
  move). ⋯ menu: Copy link, Delete, Reveal in folder, Copy id.
- Properties: label column `caption muted` 96px, values `body`. Each value is a popover editor:
  Assignee and Worker open the member picker (Humans / Agents groups); ⇄ on Worker = Delegate to…
  / Take back / Start myself. Due opens calendar + natural-language input; Repeat offers presets
  (Every day, Every weekday, Every week on <day>, Every month on the <n>th, Custom…) and a
  "from completion" switch.
- Needs-input state replaces the comment box placeholder with "Answer claude…" and the send
  button reads "Answer & resume" (posts the comment and clears `needs-input`).
- Description: rendered Markdown; edit mode is a plain Markdown editor in `mono`-free `body`
  type with live preview toggle. Autosave shows "Saved" in `caption muted` for 1.5s.
- Conflict banner pinned above the description editor: `semantic.warning` left rule, "Changed on
  disk by claude · 10:42" [Reload] [Overwrite].
- Unknown frontmatter keys appear collapsed under "Other fields (kept as-is)", read-only.

---

## Quick add

```
            ┌───────────────────────────────────────────────────────────────┐
            │ Renew passport [#Home] [/Errands] [@admin] [p2] [+claude]       │
            │ [next fri] [{oct 31}]                                           │
            │───────────────────────────────────────────────────────────────│
            │ Home › Errands · @admin · ⚑ High · (c) claude · Fri 17 Oct ·   │
            │ ⌖ 31 Oct                                                        │
            │ ⚠ No project "Hmoe"                                            │
            │                                   ⏎ add · ⇧⏎ add & close · esc  │
            └───────────────────────────────────────────────────────────────┘
```

- Centred dialog 640px wide at 20% from the top, lg shadow, 40% scrim. Opened by `q`, the
  sidebar "+", any "+ Add task" row (with that context), and (planned) the system-wide shortcut.
- Tokens render inline as chips in `mono` (root quick-add colours: project `primary`, section
  `muted`, label neutral, priority in its `priority.*` colour, dates `semantic.info`, recurrence
  with ↻, assignee in identity colour, deadline `semantic.danger` outline). Planned, not built:
  a disabled token (clicked or Backspaced) returns to plain text with a dotted underline.
- The summary line restates the parsed fields in words, so the operator never has to read
  syntax. Warnings in `semantic.warning`.
- Typing `#`, `/`, `@`, `+` opens an inline completion list (projects, sections, labels,
  members with avatars).

---

## Command palette

```
            ┌───────────────────────────────────────────────┐
            │ ⌕ deleg                                        │
            │ ON SELECTION — "Ship release"                  │
            │   ⇄ Delegate to…                        a ›    │
            │ NAVIGATE                                       │
            │   ◈ Agents                              g a    │
            │ AGENTS & MEMORY                                │
            │   ✦ Recall as…                                 │
            └───────────────────────────────────────────────┘
```

- ⌘K; 560px, lg shadow. Groups: On selection (only with a selection), Navigate, Create, Agents
  & memory, Items (tasks, notes, memories by title). Each entry shows its shortcut as a key cap.
- Sub-pages (Delegate to… › agent list) push in place with a back chevron; Esc pops, then closes.

---

## Agents

```
  Agents                                                     2 live · 1 idle
  ┌──────────────────────────────┐ ┌──────────────────────────────┐
  │ [c] claude          ● Live   │ │ [x] codex           ○ Idle   │
  │ 2 working · 1 needs input    │ │ 1 queued · 1 stale claim ⚠   │
  │ ─ Ship release      ● Working│ │ ─ Migrate config    ◌ Queued │
  │ ─ Docs pass     ● Needs input│ │                              │
  │ ✦ 14 memories  ✎ 2 pads      │ │ ✦ 6 memories  ✎ 1 pad        │
  │ Recent                        │ │ Recent                       │
  │ 10:42 appended Ship release   │ │ 08:02 wrote codex/notes      │
  │ 10:31 claimed Docs pass       │ │                              │
  └──────────────────────────────┘ └──────────────────────────────┘
  HUMANS  (L) lennard (you)
```

- Card grid, 2–3 columns, cards `rounded.lg` on `bg` with `border`. Avatar is `avatar-agent` at
  32px with hue from the id. Liveness: Live = `session.working` pulsing dot, Idle = `muted` ring,
  Dormant = `muted` text only.
- Stale claims in `semantic.warning` with "Release ›".
- Card click opens the agent page: header (avatar, name, kind, liveness, last write), tabs Tasks
  · Activity · Memories · Scratchpads, each a filtered version of the main view.
- Unregistered identities show a `chip` "unregistered" with a tooltip on declaring members in the
  config file. Empty: "No agents yet. Connect one with the Shards MCP server or CLI." + "Copy
  setup command".

---

## Memories

```
  Memories                             New memory   Recall playground ›
  Kind ▾  Scope ▾  Owner ▾  Project ▾  Importance ≥ ▾   ☐ Expired (3)  ☐ Superseded (2)
  ───────────────────────────────────────────────────────────────────────────────────────
  ☐ Title                         Kind        Scope     Imp.    Owner  Updated   Expires
  ☐ Deploys run on Thursdays      procedure   shared    ●●●●○   (c)    • 2d      —
  ☐ Prefers terse PR summaries    preference  🔒 private ●●●○○   (x)    • 40d     —
  ☐ ~~Deploys run on Fridays~~ → m-K2  …
  ───────────────────────────────────────────────────────────────────────────────────────
  2 selected   Set importance ▾  Set kind ▾  Add tag  Forget…
```

- Dense table, `row-compact` height. Filter chips above; active chips show values with ✕ and a
  "Clear" link. Hidden-count line when filters hide everything ("12 expired memories are hidden ·
  Show").
- Importance: 5-segment meter, `muted` → `primary`; null = hollow with tooltip "3 (default)".
  Freshness dot before Updated: tooltip "Recall weight ×0.82 · updated 34 d ago".
- Expiry chip: none hidden; > 7 d `muted`; ≤ 7 d `semantic.warning`; expired `semantic.danger`
  "Expired · not recalled" and the row dims to 60%.
- Private scope: lock glyph, tooltip "Hidden from other agents. Not a permission: anyone with the
  vault can read the file."
- Bulk bar slides up from the bottom when rows are selected (`x` selects). Bulk forget opens the
  one confirm dialog in the app: "Forget 4 memories? Deletes 4 files. Undo for 10 s."

## Memory sheet

- Header: title, kind and scope badges, importance meter (keys `1`–`5` edit it).
- Banners: superseded ("Replaced by **Deploys run on Thursdays** on 13 Oct ›"), expired ("Expired
  12 Oct. Hidden from lists and recall." [Extend] [Never expire]).
- Primary action "Correct this": opens a pre-filled new-memory form beside the old text; saving
  shows the chain stepper `m-A → m-B → **m-C**`.
- Body: rendered Markdown, ✎ Edit for full replace. Properties panel as in the task sheet,
  plus source, project, created, path.
- Recall eligibility chip at the top: `semantic.success` "Recalled" or `muted` "Not recalled:
  expired / superseded / private to codex".

## Recall playground

```
  Recall as  [c] claude ▾   ⌕ release________________   Kind ▾  Imp ≥ ▾  Limit 10
  Threshold ──●────── 0.25    ☑ Decay   ☐ Include expired
  ───────────────────────────────────────────────────────────────────────────
  1  Deploys run on Thursdays        ████████░░ 0.81   match 0.92 × imp 1.00 × rec 0.88
  2  Release checklist lives in…     █████░░░░░ 0.52   match 0.70 × imp 0.90 × rec 0.83
  ───────────────────────────────────────────────────────────────────────────
  Empty query: what claude sees at session start (5)
```

- Score bar uses `primary`; the breakdown is `caption mono`. Each hit has Raise importance,
  Expire, Correct this on hover.
- No hits: "Nothing recalled. Try a lower threshold, include expired, or turn decay off."

---

## Scratchpads

```
  Scratchpads                                              Clear stale (2)
  ┌ [c] claude · 2 · ● live ─────┐ ┌ [x] codex · 1 · idle ────────┐
  │ plan            ● 2m         │ │ notes                 3d     │
  │ ▓▓▓░░░░ 3/7                  │ │ - migrate config keys        │
  │ - [x] read spec              │ │ - check fallback order       │
  │ - [ ] write tests            │ │                              │
  │ deploy-notes         1h      │ │                              │
  └──────────────────────────────┘ └──────────────────────────────┘
```

- One column per agent (board), header with avatar, count, liveness. Cards show name, age,
  checklist progress bar (`primary` fill), first 4 lines in `small`.
- Stale (> 7 d) cards are `muted` with "Clear stale?" on hover.
- Sheet: rendered body with interactive checkboxes; Edit (full replace) and Append note.
  When the pad is live (< 30 min) the sheet opens in Append mode with a `semantic.warning` banner
  "claude is writing to this pad. Edits may be overwritten." Actions: Promote to memory, to note,
  to tasks (checklist items), Clear.

---

## Notes

Read-only. Shards is for tasks; notes are context, written in the operator's own editor.

```
  Notes                                                 ⌕ Filter      Open in Obsidian ▾
  Folder: All ▾   #tag ▾                                669 files
  ───────────────────────────────┬──────────────────────────────────────────────────
  ▤ Release plan                 │  Release plan                 Open in Obsidian ▾
    Projects/launch · 2h         │  Projects/launch/Release plan.md
  ▤ 2026-10-14 standup           │  # Release plan
    Daily · 2d                   │  Rendered Markdown, [[wikilinks]] in primary …
```

- One flat list, most recently changed first. Each row: title (frontmatter `title`, else the file
  name) and a `small` `muted` line with the folder and age. A text filter matches title, folder
  and path; folder and tag menus narrow it. Shards notes carry a small `n-` id chip; nothing else
  distinguishes them.
- Reader: title, vault-relative path in `mono`, Markdown rendered with wikilinks in `primary`
  (dangling links dotted `muted`). No editor, no tag editor, no Adopt, no delete.
- "Open in" is a split button: the main part opens the default target, the chevron lists
  Obsidian (when detected), Default app and Show in Finder (desktop only) and Copy path. The same
  split button sits in the task detail header, and the task context menu has "Open in Obsidian".
  `⌘⇧O` opens the selected task or file.

---

## Settings

```
  Settings
  VAULT        ~/Vaults/brain                         Change…   Reveal
               Used by the CLI and your agents too.
  IDENTITY     (L) lennard                             Change…
  MEMBERS      (L) lennard  human
               [c] claude   agent
               [x] codex    agent        Edit in config file ›
  APPEARANCE   ◉ System  ○ Light  ○ Dark
  ABOUT        Shards 0.3.0 · host live · spaces: notes tasks memories scratch assets
               search: builtin (indexed not found)
```

- Single column, label column 120px `caption muted` uppercase-free sentence case per root copy
  rules (labels shown here in caps only in the wireframe).
- Browser mode: vault row read-only with "Set by the host process".

## First run

```
            ┌──────────────────────────────────────────────┐
            │  Welcome to Shards                           │
            │  Pick the folder your tasks, notes and       │
            │  agent memories will live in.                │
            │  Folder  [ ~/Shards              ] Choose…   │
            │  Your name  [ lennard ]                       │
            │                              [ Start ]        │
            └──────────────────────────────────────────────┘
```

- Shown instead of the shell when no configuration exists. An existing folder with Markdown in it
  is fine; a hint says "Existing Markdown stays as it is."

---

## Interaction Patterns

| Pattern | Use When | Notes |
|---|---|---|
| Sheet for every item | Opening a task, memory, note or pad | Enter opens, Esc closes, `j`/`k` keeps moving the list selection and the sheet follows |
| Optimistic write + toast | Any single change | Row updates at once; toast bottom-left: "Completed · Undo" (6s), deletions 10s |
| Undo shortcut | After a change, within 30 s (delivered: one slot) | ⌘Z replays the latest inverse. Planned: a session stack and a refusal toast naming who changed the item |
| Popover editors | Every property | Opened by click or the property's key (`s` due, `l` labels, `a` assign, `1`–`4` priority) |
| Confirm popover | Taking work from an agent, bulk forget, bulk clear, bulk delete of 2+ tasks, deleting a project with open tasks | Anchored to the trigger; never a full-screen modal |
| Reminder | An open task's due time arrives while the window is open | System notification "Call bank · Home"; choosing it focuses the window on the task. Denied permission: an in-app toast with the same text |
| Inline completion | `#`, `/`, `@`, `+` in quick add and the label/assignee pickers | Matches by prefix, shows avatars for members |
| Live flash | External change to a visible row | 600ms `primary-soft`, no reorder jumps while the operator's pointer is over the list |
| Conflict banner | An open editor's file changed on disk | Never auto-reloads a dirty editor |

---

## Language & Copy

| Situation | Copy |
|---|---|
| Complete | "Completed · Undo" / recurring: "Completed · next Mon 20 Oct · Undo" |
| Delete | "Deleted "Ship release" · Undo" (10s); recoverable from the system Trash after that |
| Trash unavailable | "Couldn't move "Ship release" to the Trash. Nothing was deleted." |
| Delete project with tasks | "Delete “Trip”? Its 3 open tasks move to the Inbox." · Delete · Cancel |
| Bulk delete | "Delete 3 tasks? They move to the Trash. Undo for 10 s." |
| Delegate | "Delegated to claude" |
| Take back | "Take back from claude? It stops working on it." |
| Undo refused | "Can't undo — claude changed this task since." |
| Conflict | "Changed on disk by claude · 10:42" · Reload · Overwrite |
| Space off | "Memories are turned off in this vault." · Open settings |
| Host offline (browser) | "Can't reach the Shards host. Is `shards-host` running?" · Retry |
| Unknown project | "No project “Hmoe” — added to <current project or Inbox>." (delivered) |
| Session states | Queued · Working · Needs input · Error · Done |

Sentence case, verb first, actor and time named; no emoji, no exclamation marks (root copy rules).

---

## Do's and Don'ts

- Do keep the three-region shell on every view; never open a second window for an item.
- Do show the worker avatar beside the assignee whenever they differ.
- Do keep Upcoming's empty days visible; they are drop targets.
- Do render quick-add tokens and their plain-language summary together.
- Don't reorder a list under the pointer during live refresh; apply the move on pointer leave.
- Don't use a spinner for local writes; skeletons only for first load.
- Don't show raw statuses (`claimed`); say "In progress · claude".
- Don't confirm single deletes; undo covers them.
