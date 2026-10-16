---
type: entrypoint
scope: design
design_format: google-labs-code/design.md-compatible
children:
  - features/desktop-app/design.md
updated: 2026-10-16
colors:
  light: {bg: "#ffffff", sidebar: "#fafafa", subtle: "#f4f4f5", fg: "#18181b", muted: "#71717a", border: "#e4e4e7", primary: "#7c3aed", primary-fg: "#ffffff", primary-soft: "#ede9fe", ring: "#7c3aed"}
  dark: {bg: "#15151c", sidebar: "#1a1a23", subtle: "#232330", fg: "#ececf1", muted: "#9a9aab", border: "#2e2e3d", primary: "#8b5cf6", primary-fg: "#ffffff", primary-soft: "#2e2547", ring: "#a78bfa"}
  semantic: {success: "#15803d", warning: "#b45309", danger: "#dc2626", info: "#2563eb"}
  semantic-dark: {success: "#4ade80", warning: "#fbbf24", danger: "#f87171", info: "#60a5fa"}
  priority: {urgent: "#dc2626", high: "#c2410c", normal: "#2563eb", low: "#71717a"}
  priority-dark: {urgent: "#f87171", high: "#fb923c", normal: "#60a5fa", low: "#8b8b9c"}
  identity: {human: "#52525b", agent: "#0e7490", human-dark: "#d4d4d8", agent-dark: "#22d3ee", avatar-fill: "oklch(0.62 0.14 H)", avatar-fill-dark: "oklch(0.70 0.13 H)"}
  session: {queued: "{colors.light.muted}", working: "{colors.light.primary}", needs-input: "{colors.semantic.warning}", error: "{colors.semantic.danger}", done: "{colors.semantic.success}"}
  due: {overdue: "{colors.semantic.danger}", today: "{colors.semantic.success}", tomorrow: "{colors.semantic.warning}", this-week: "{colors.light.primary}", later: "{colors.light.muted}"}
typography:
  display: {fontFamily: "Geist Variable, ui-sans-serif, system-ui", fontSize: 24px, fontWeight: 600, lineHeight: 32px, letterSpacing: -0.01em}
  title: {fontFamily: "Geist Variable", fontSize: 18px, fontWeight: 600, lineHeight: 26px}
  heading: {fontFamily: "Geist Variable", fontSize: 15px, fontWeight: 600, lineHeight: 22px}
  body: {fontFamily: "Geist Variable", fontSize: 14px, fontWeight: 400, lineHeight: 20px}
  small: {fontFamily: "Geist Variable", fontSize: 13px, fontWeight: 400, lineHeight: 18px}
  caption: {fontFamily: "Geist Variable", fontSize: 12px, fontWeight: 500, lineHeight: 16px}
  mono: {fontFamily: "Geist Mono Variable, ui-monospace", fontSize: 12px, fontWeight: 400, lineHeight: 16px}
rounded: {sm: 4px, md: 6px, lg: 8px, xl: 12px, full: 9999px}
spacing: {xs: 4px, sm: 8px, md: 12px, lg: 16px, xl: 24px, 2xl: 32px, row: 36px, row-compact: 32px, sidebar: 248px, detail: 420px}
components:
  task-row: {height: "{spacing.row}", padding: "0 {spacing.md}", rounded: "{rounded.md}", typography: "{typography.body}", hoverBackground: "{colors.light.subtle}"}
  checkbox: {size: 18px, rounded: "{rounded.full}", borderWidth: 1.5px, borderColor: "{colors.priority.normal}"}
  chip: {height: 20px, padding: "0 6px", rounded: "{rounded.sm}", typography: "{typography.caption}"}
  avatar-human: {size: 20px, rounded: "{rounded.full}", backgroundColor: "{colors.identity.avatar-fill}"}
  avatar-agent: {size: 20px, rounded: "{rounded.sm}", backgroundColor: "{colors.identity.avatar-fill}", glyph: bot}
  button-primary: {backgroundColor: "{colors.light.primary}", textColor: "{colors.light.primary-fg}", rounded: "{rounded.lg}", height: 32px}
  sheet: {width: "{spacing.detail}", backgroundColor: "{colors.light.bg}", borderLeft: "1px {colors.light.border}"}
  toast: {rounded: "{rounded.lg}", padding: "{spacing.md}", duration: 6s, duration-delete: 10s}
---

# Shards — Design

Calm, dense, keyboard-first: Todoist-grade clarity with Linear-grade precision, light and dark.
Humans and agents share every list, so who did what is always visible. The desktop app is a lens
on Markdown files; it never hides that a task is a file. CLI and MCP output conventions live in
[product-cli.md](product-cli.md). **Product:** [product.md](product.md) · **Tech:** [tech.md](tech.md)

## Overview

- **Audience:** agent operators first, then Markdown-native knowledge workers and small teams
  (product.md personas). All four expect speed over decoration.
- **Personality:** quiet surfaces, one accent (brand violet), colour only where it carries
  meaning (priority, due state, identity, agent session state). Nothing animates without cause.
- **Preserve:** every action is reachable by keyboard; every write is undoable; agents never look
  like humans; the list stays dense enough for 25+ rows on a 900px-tall window.

## Colors

- Tokens hold canonical values; shadcn CSS variables (`:root` / `.dark`, OKLCH) derive from them.
  `primary` is the brand violet from the faceted-shard mark (research: taskui §5.3).
- **Neutrals** carry 90% of the UI: `bg` for content, `sidebar` for navigation, `subtle` for
  hover and selection, `muted` for metadata text.
- **Priority** follows the Todoist mapping: p1 urgent red, p2 high orange, p3 normal blue,
  p4 low gray. Normal is the default and still shows blue only on the checkbox ring.
- **Red is reserved** for urgent, overdue, past deadline, expired, errors and destructive actions. The
  memory importance meter ramps muted → primary, never red (research: memory-ux §4.2).
- **Identity:** avatar fill is `avatar-fill` with hue H = stable hash of the member id mod 360; a
  `[[members]].color` overrides it. The `agent` token marks agent glyphs, badges and actor names
  in activity; `human` marks human actor names.
- **Themes:** every `{colors.light.*}`, `semantic`, `priority` reference resolves against the active
  theme's group (`dark`, `semantic-dark`, `priority-dark`). Violet text in dark uses `ring`.
- **Contrast:** WCAG AA in both themes: 4.5:1 for all text (chips included), 3:1 for rings, dots
  and icons. Check every new token pair before it ships.

## Typography

Geist Variable for UI, Geist Mono for ids, paths and quick-add tokens. Body 14px is the row
size; metadata is `caption`. Headings are rare: view title (`title`), section headers (`heading`).
Tabular numerals for counts and times. No text below 12px. Sentence case everywhere.

## Layout

- **Three regions:** collapsible left sidebar (248px; Inbox, Today, Upcoming, Search, Agents,
  Memories, Scratchpads, Notes; then Projects; then Labels), main list (min 360px), right detail
  sheet (420px, resizable 360–640px). `[` toggles the sidebar.
- **Density:** comfortable 36px rows by default, compact 32px as a setting. A row holds one line;
  metadata wraps to a second line only when it exists (adaptive card, research: taskui §8.8).
  Metadata indents to align with the title, not the checkbox.
- **Grouping:** sticky section headers (`heading`, count at right). Subtasks nest one level
  with a 24px indent; deeper levels show as a "n subtasks" link into the detail sheet.
- **Responsive:** < 1100px the sheet overlays the list; < 768px the sidebar becomes a drawer and
  the sheet becomes a full page. Lists virtualize; nothing paginates (research: taskui §7.2).

## Elevation & Depth

Flat by default: regions separate by `border` hairlines and tonal steps (`bg` vs `sidebar`).
Shadows exist only for floating layers: popovers and menus (sm), the sheet in overlay mode (md),
the command palette and dialogs (lg, plus a 40% scrim). Drag overlays lift with md shadow.

## Shapes

Base radius 0.5rem (`lg`) for buttons, inputs, cards and toasts; `md` for rows; `sm` for chips.
Circles mean human (avatars) or completion (checkbox). Rounded squares mean agent. lucide icons
at 16px, 1.5px stroke. Priority flags keep TaskUI's distinct silhouettes so meaning survives
without colour (research: taskui §8.3).

## Components

| Component | Use when | Rules |
|---|---|---|
| Task row | Any task list | Checkbox · title · inline chips (due, deadline, labels, project in cross-project views) · assignee avatar right. Done: strike + 60% opacity, then leaves the view after undo window |
| Checkbox | Completing a task | Circle with priority-tinted ring and 10% fill; hover shows a check. Click completes; right-click opens priority/status menu. Recurring tasks show a repeat glyph inside |
| Priority flag | Detail sheet, pickers | Only urgent and high show a flag in rows; normal and low rely on the checkbox ring |
| Due chip | Task has `due` | Relative text (Today, Tomorrow, Fri, 12 Nov), time if set. Colours from `due` tokens: overdue, today, tomorrow, this-week, later. Repeat glyph when `recur` is set |
| Deadline chip | Task has `deadline` | Target glyph + date, outline style; danger when past, warning within 2 days, else muted. Never merges with the due chip |
| Label chip | Task has tags | `@name`, neutral subtle fill; max 3 inline then "+n" |
| Assignee avatar | `owner` set | Human: circle with initials. Agent: rounded square, bot glyph. When `claimed_by` differs, a second smaller avatar overlaps (worker) |
| Agent session badge | Task worked by an agent | Dot + label, one per wire state (`queued`, `working`, `needs_input`, `error`, `done`): Queued (hollow dot, muted), Working (pulse, primary), Needs input (warning), Error (danger), Done (success). Rows show the dot only; sheet and Agents view show the label |
| Quick-add bar | `q`, "+ Add task" | Single line; tokens highlight live as chips: `#project` primary, `/section` muted, `@label` neutral, `p1–p4` priority colour, dates info, `every…` with repeat glyph, `+assignee` identity colour, `{deadline}` danger outline. Backspace on a chip reverts it to text. Enter saves and keeps the bar open; ⇧Enter saves and closes |
| Command palette | ⌘K | cmdk groups: Navigate, Create, Act on selection, Agents & memory. Each entry shows its shortcut as a Kbd |
| Detail sheet | Enter or click on a row | Title, Markdown description, properties (project/section, assignee, worker, due, deadline, repeat, priority, labels, blocked by), subtasks, activity with actor avatars. Fields save on blur; Esc closes |
| Board column / card | Project board view | Columns by section (default) or status (open "To do", claimed "In progress · worker", done, cancelled collapsed). Columns collapse to a 48px strip; card = row content on two lines |
| Memory card | Memories view | Title, kind badge (icon per kind), scope badge (Lock for private, tooltip: "not a permission"), 5-segment importance meter, owner avatar, freshness dot, expiry badge (amber ≤7d, danger expired). Superseded: struck title + "→ successor" |
| Scratch pad viewer | Scratchpads view | Board, one column per agent. Card: name, updated, size, first lines, checklist progress when `- [ ]` lines exist. Live (<30 min, pulsing dot), Idle (<24 h), Stale (>7 d, gray, "Clear stale?"). A live pad opens in append mode with a warning banner |
| Empty state | A view has no rows | One line of fact + one action. Four kinds: space disabled, nothing yet, filtered to zero (show chips + "Clear filters"), all hidden ("12 expired hidden · Show") |
| Toast with undo | Every write from the UI | Bottom-left, one at a time. "Completed 'Ship build' · Undo". Error toasts carry the envelope `message` and `next_action` |

## Interaction conventions

- **Keyboard map:** `q` quick add · `⌘K` palette · `/` search · `j`/`k` move · `Enter` open
  detail · `Esc` close · `e` complete (Todoist) · `x` select for bulk (Linear) · `1`–`4` priority
  (1 = urgent) · `t` due today · `m` due tomorrow · `s` schedule picker · `l` labels · `a` assign ·
  `#` move to project · `⌥↑`/`⌥↓` reorder · `⌘Z` undo · `g i` / `g t` / `g u` / `g a` Inbox,
  Today, Upcoming, Agents · `b` list/board · `[` sidebar · `?` shortcut sheet. Decision: `x`
  selects and `e` completes, matching Todoist and Linear muscle memory.
- **Drag & drop:** reorder writes a midpoint `order`; drop on a column or header writes `section`
  or `status`; drop on a sidebar project writes `project`, on Today writes `due`. Drops onto a
  card count (insert before it). Every drag has a keyboard equivalent.
- **Optimistic updates:** the UI applies a write at once, then reconciles on the vault change
  event. A failed write reverts the row and shows an error toast; a claim conflict names the
  current worker.
- **Undo:** every write keeps its inverse until the toast closes, and `⌘Z` repeats it. Complete →
  reopen, edit → previous values. Delete is immediate: the app moves the file to the operating
  system's Trash (D6 as amended 2026-10-16; until desktop-app/31 lands it unlinks). Undo writes
  the held raw bytes back to the same path through `host_restore`
  ([product-roadmap.md](product-roadmap.md) § Decision log, D6). No delayed deletes.
- **Live refresh:** external edits (agents, CLI, editors) appear within one change event without
  losing selection, scroll or an open editor; a dirty editor shows "Changed on disk · Reload".

## Agent tone & copy

- Plain, sentence case, verb first ("Add task", "Clear stale pads"). No exclamation marks, no
  emoji, no "AI assistant" persona. Agents are named by their member name, else their id.
- Name the actor and the time: "Claimed by flights-agent · 4m ago", "Needs input from you".
- Errors say what happened and the next step, from the envelope: "Task t-81 is claimed by
  ops-agent. Release it or pick another task." Never a stack trace, never "Something went wrong".
- Destructive copy states the consequence: "Deletes the file. Undo for 10 s."
- Times: relative under 7 days, absolute after; the tooltip shows the exact local time.

## Do's and Don'ts

- Do keep one accent: violet marks the selection, focus ring, primary button and working agents.
- Do show `claimed` as "In progress · worker", never as a raw status word.
- Do show every agent write in activity with the agent avatar, even when an agent is assignee.
- Do let every Markdown field round-trip; show unknown frontmatter read-only as "Other fields".
- Don't use red for anything but urgency, lateness, expiry, errors and destruction.
- Don't render agents as circles or humans as squares; shape is the identity signal.
- Don't add spinners for local writes; local writes finish faster than a spinner can draw.
- Don't hide the file: the detail sheet always offers "Reveal in folder" and the path.
- Don't add confirmation dialogs where undo exists; confirm only bulk forget and bulk clear.

## Feature Design Index

| Feature | Design detail |
|---|---|
| desktop-app | [features/desktop-app/design.md](features/desktop-app/design.md): screens and flows |
