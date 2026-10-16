# TaskUI (obsidian-taskui) — reference analysis for Shards

Source: `scratchpad/ref/obsidian-taskui` (HEAD `811d339`, v0.2.2, targeting v0.3 alpha). All paths below are relative to that checkout unless prefixed `mesh/`. Analysed 2026-10-15.

## 0. TL;DR

- TaskUI is a ~12.3k LOC React 18 + Tailwind 3 + shadcn ("new-york") + Radix + TanStack Table + dnd-kit + Jotai + RHF/Zod Obsidian plugin. It has **three views (Table, List, Board)**, a **modal create/edit form**, an **inline edit card**, and **group / sort / filter popovers**. It has **no calendar, no quick-add, no global keyboard shortcuts, no sidebar/navigation, no projects, no search**.
- **Port the UI layer, not the data layer.** TaskUI stores one task per checkbox *line* inside arbitrary notes (Dataview/Tasks syntax). mesh stores one *file* per task with YAML frontmatter under `tasks/open|done`. Treat `taskMapper.ts` as an optional "Import from Obsidian Tasks" interop module and keep its tests as fixtures.
- **There are no concrete design tokens.** Every Tailwind color, radius and font size maps to an Obsidian CSS variable (`tailwind.config.cjs:13-85`). Shards must define its own palette. The repo icon (`assets/icon.png`) is faceted purple shards in a dark mesh. It is a ready brand mark for "Shards".
- **Best ideas to port:** the enum display-config registry (`ui/lib/config/*`), the status icon tinted by priority (left-click cycles status, right-click picks priority), 5-level flag SVGs, relative `DateDisplay`, the chrono-node natural-language date input, the inline-edit card, collapsible and persisted Kanban columns with sub-grouping inside a column, and one TanStack "view model" that feeds all views.
- **Known bugs and anti-patterns to avoid** are listed in §7, with file:line references.

## 1. Sources read

README.md, AGENTS.md, `.spec/{product,design,tech,plan,lessons}.md`, package.json, tailwind.config.cjs, components.json, the whole `src/` tree (data, service, api, ui/base, ui/components, ui/lib), `dev-vault/`, and GitHub issues #3-#37 (`gh issue list -R LennardZuendorf/obsidian-taskui`). For the mesh comparison: `mesh/src/model/task.rs:54-68` and `mesh/README.md:257-303`.

**Screenshots:** none exist. `assets/` contains only `icon.png`, and git history adds no other image (`git log --all --diff-filter=A` → only `assets/icon.png`). Every UI description below comes from reading the code. None comes from a rendered screenshot.

## 2. Product intent (from `.spec/product.md`, issues)

- One-liner: "A visual, vault-native task manager for Obsidian where markdown stays the source of truth." (`.spec/product.md:12`)
- Principles: the vault is truth and the UI is a lens; validate at the edge; one task model, many views; fail loud; desktop-first and theme-native (`.spec/product.md:39-45`).
- Roadmap (issues): v0.4 adds the Overview/Daily view and the Calendar view (#34), inline editing and tag badges (#35), and event-based fetch plus a sidebar (#36). The v1.0+ epic (#37) covers a Projects concept and UI revamp, Todoist API sync, a cloud-sync web app, Google/Outlook calendar, and an advanced query language. Closed duplicates: #9 "V2 UI oriented on Todoist (Context Views, Saved Filters, Calendar)", #8 "Side panel with pre-built filters (Today, Tomorrow)", #11 "Cloud Backup", #10 "Todoist Sync". Open: #7 independent board-grouping selector, #6 per-view column visibility, #5 separate pagination per view, #14 recurrence and dependencies, #3 Day Planner compatibility.
- **Takeaway for Shards:** the owner's own TaskUI roadmap is essentially the Shards roadmap: Todoist-style context views, saved filters, calendar, projects, cloud sync. Shards is the "v2" this plugin never reached.

## 3. Feature inventory

| Area | Feature | Status in TaskUI | Where |
|---|---|---|---|
| Views | Table (spreadsheet, inline status/priority editing, group rows, sortable headers, max 2 sorts) | Built | `ui/components/views/TableView.tsx` (673 LOC); header sort `:125-145` |
| Views | List (cards, collapsible group sections with sticky headers and count badge, bottom fade) | Built | `views/ListView.tsx:78-186` |
| Views | Board / Kanban (fixed status columns, DnD between columns, collapsible vertical columns, secondary grouping inside a column, DragOverlay) | Built (partial) | `views/BoardView.tsx`, `views/board/BoardColumn.tsx` |
| Views | Calendar, Overview/Daily, Today/Upcoming | **Missing** (#34) | — |
| View switch | Vertical icon tab rail (Table / List / Board), default = List | Built | `TaskView.tsx:134-181` |
| CRUD | Create (modal), Edit (modal or inline), Delete (menu or form) | Built | `TaskView.tsx:37-112`, `forms/TaskModal.tsx` |
| CRUD | Quick-add bar or natural-language task entry | **Missing** | The only entry point is the "Add Task" button → modal (`TaskView.tsx:127-130`) |
| Status | todo / in-progress / done / cancelled (`[ ]`, `[/]`, `[x]`, `[-]`) | Built | `data/types/tasks.ts:25-30`, `taskMapper.ts:430-476` |
| Status | One-click cycle todo → in-progress → done → todo; cancelled → todo | Built | `task/PriorityStatusCheckbox.tsx:44-57` |
| Priority | 5 levels: lowest/low/medium/high/highest; right-click on status icon opens priority picker | Built | `tasks.ts:14-20`, `PriorityStatusCheckbox.tsx:59-90` |
| Dates | due, scheduled (editable). start, created, done (parsed and written, not editable in UI) | Built | `TaskForm.tsx` (only due + scheduled fields), `taskMapper.ts` |
| Dates | Natural-language date parsing ("tomorrow", "next fri") via chrono-node, plus a calendar popover and ArrowDown to open it | Built (field only) | `forms/fields/DatePickerInput.tsx:159-213` |
| Dates | Relative labels (Overdue / Today / Tomorrow / Next 7 days / …) with icon + color | Built | `ui/lib/config/date.ts`, `task/DateDisplay.tsx` |
| Tags | Tag chips input with dedupe, autocomplete source = all tags in the store | Built | `forms/fields/TagInput.tsx`, `taskAtoms.ts:378-396` |
| Relations | `blocks` list (actually depends-on, see §6), "Tasks blocked by this" shown read-only, subtasks shown read-only | Display only | `TaskForm.tsx` full variant §3 (scratch lines 379-420) |
| Recurrence | `recurs` string round-tripped (`[repeat::]` / 🔁) | Parsed only, no UI | `taskMapper.ts:94,132,236` |
| Grouping | Single-level group by status / priority / due date / scheduled date; group-by also drives group sort direction | Built | `table/DTableGroupBy.tsx`; only `grouping[0]` is used |
| Sorting | Up to 2 sorts with custom priority/status order | Built | `TableView.tsx:126`, `utils/sorting/taskSortingFunctions.ts` |
| Filtering | Two-level command menu (pick column → pick value), active-filter chips with ✕, "Clear all"; **one value per column** | Built (buggy, §7) | `table/DTableFilterBy.tsx` |
| Search | Text search | **Missing** (TanStack `globalFilter` is wired but has no UI: `DTable.tsx` state) | — |
| Pagination | 30 per page, shared across all views | Built | `taskAtoms.ts:485-491`, `TaskView.tsx:197-231` |
| Persistence of view state | sorting, filters, grouping, expanded groups, pagination, collapsed board columns in localStorage | Built | `taskAtoms.ts:425-501` |
| Sync | Write-back to markdown, 5 s poll for remote changes, retry (≥3 → notice), local-wins conflict | Built | `api/internalApiService.ts:229-262`, `service/taskSyncService.ts`, `MainView.tsx:170-180` |
| Formats | Dataview inline fields and Tasks emoji syntax; auto-detect and preserve per line; default for new tasks is configurable | Built | `taskMapper.ts:56-85` |
| Settings | default file path (`Tasks.md`), default heading (`# Tasks`), default format, unused `todoistApiKey` | Built | `config/defaultSettings.ts` |
| Keyboard | Enter in inputs; Enter/Space on table headers; ArrowDown opens the calendar | Minimal | Only hits for `onKeyDown` in `src`: `TagInput.tsx:124`, `DatePickerInput.tsx:223`, `DescInput.tsx:44`, `TableView.tsx:136`, `base/Input.tsx:55`. **No global shortcuts, no command palette** (cmdk is used only inside popovers). |
| Multi-user / agents | — | **Missing** | No assignee, no claim, no activity |

## 4. UI anatomy

### 4.1 Layout regions (`ui/components/TaskView.tsx:115-235`)

```
┌───────────────────────────────────────────────────────────────────────┐
│                       [Group ▾] [Sort ▾] [Filter ▾ (n)]  [+ Add Task]   │ ← controls bar, right-aligned (:118-131)
├──────┬────────────────────────────────────────────────────────────────┤
│Views:│ ┌──────────────── TabView panel (bg-secondary, border, m-4) ──┐ │
│ [▦]  │ │  Table | List | Board content                               │ │
│ [☑]  │ │                                                             │ │
│ [▥]  │ └─────────────────────────────────────────────────────────────┘ │
│      │                                              [‹ 1/3 ›] pagination │
└──────┴────────────────────────────────────────────────────────────────┘
  ↑ vertical icon tab rail (Radix Tabs, icon only + sr-only label) (:140-181)
```

Every control label ("Group By", "Filter by:") sits above its button. The label is always rendered and fades to opacity-0 when the control is inactive (`DTableFilterBy.tsx:116-124`). This keeps the layout from shifting.

### 4.2 Component list

| Component | File | What it does |
|---|---|---|
| `TaskView` | `ui/components/TaskView.tsx` | Shell: controls bar, tab rail, three tab panels, pagination. Owns create/edit/delete/update handlers. Every mutation goes through `changeTasks(createLocalUpdate(op, [task]))`. |
| `TabView` | `views/TabView.tsx` | Panel wrapper: `bg-secondary border rounded-md m-4 overflow-hidden`. |
| `TableView` | `views/TableView.tsx` | Radix-free HTML table (`ui/base/Table.tsx`). Group header rows get a chevron, icon, label and count. Status/priority cells use inline `EnumSelect`. Tags render as Badges. Dates are formatted. Last column holds the options menu. |
| `ListView` | `views/ListView.tsx` | Renders TanStack rows. Group → collapsible section with a sticky header (`bg-primary`, chevron, icon, label, count badge) and a bordered body of `TaskListCard`s. Scroll-snap and a bottom gradient fade (`:183`). |
| `TaskListCard` | `task/TaskListCard.tsx` | Card row: [status/priority icon] title (strikethrough if done) [priority flag] … tags … [✎ quick edit] [⋮]. **Adaptive layout:** one row when the task has no dates. Otherwise row 2 = tags (if no room) and row 3 = "Due: Today" / "Scheduled: Fri, Oct 17" + edit. Measures widths to decide whether tags fit inline (`:28-56`). Click → modal. ✎ → inline `TaskForm variant="inline"`. |
| `BoardView` | `views/BoardView.tsx` | `DndContext` (PointerSensor, 8 px activation, `closestCenter`). One `KanbanColumn` per ordered status. `DragOverlay` shows the dragged card rotated 3°, scaled 105 %, at 90 % opacity (`:213-224`). |
| `KanbanColumn` | `views/board/BoardColumn.tsx` | Droppable column, 280-400 px wide. Header: chevron, status icon, label, count. **Collapses to a 48 px vertical strip** with rotated label and count (`:86-126`). During a drag a dashed "Drop To Move → to In Progress" zone appears at the top (`:162-181`). Sub-groups by the active grouping inside a column (`:54-72`, `:189-229`). Cancelled is collapsed by default (`taskAtoms.ts:498-501`). |
| `TaskBoardCard` | `task/TaskBoardCard.tsx` | Compact sortable card: status icon, 2-line-clamped title, small flag, ⋮. Dates row and tags row (wrap) are indented under the title (`pl-7`). Click opens the modal unless a drag just happened (`:43-53`). |
| `PriorityStatusCommand` | `task/PriorityStatusCheckbox.tsx` | The "checkbox". The icon is the status icon (Circle / PlayCircle / CheckCircle / XCircle), **tinted by priority color**. Left-click cycles status. Right-click opens a cmdk priority list in a Popover. |
| `PriorityFlags` + 5 icons | `ui/lib/components/PriorityFlags.tsx` | Custom SVG flags: lowest = outline, low = half-filled diagonal gradient, medium = solid in text color, high = solid red, highest = two overlapping red flags. Sizes sm/md/lg = 16/20/24 px. |
| `DateDisplay` | `task/DateDisplay.tsx` | Icon + optional "Due:" label + relative text for Today/Tomorrow/Next 7 days, else `EEE, MMM d`. Color comes from the category (Overdue = destructive). |
| `SettingsButton` | `task/SettingsButton.tsx` | ⋮ Popover with a cmdk list: "View Details & Edit", "Delete" (red icon). |
| `TaskForm` (full) | `forms/TaskForm.tsx` | Sections separated by rules: (1) Status icon-select, Priority icon-select, Description, Tags (full width) · (2) Due date, Scheduled date · (3) Task Relations: "Tasks blocked by this", Subtasks (read-only) · (4) Metadata: file path, created date, symbol · (5) Delete / Cancel / "Create Task" or "Save Changes" (disabled until valid and dirty). |
| `TaskForm` (inline) | same, `variant="inline"` | Compact edit inside the list card: status cycle button, priority cycle button, description (autofocus), tags · due + scheduled · trash / Cancel / Save. |
| `TaskModal` | `forms/TaskModal.tsx` | Obsidian `Modal` subclass that mounts `TaskForm` in a new React root. **Obsidian-coupled.** |
| `DatePickerInput` | `forms/fields/DatePickerInput.tsx` | Text input. On focus it clears for typing. chrono parses on change. Shows a friendly value on blur. Calendar button + ✕ clear. ArrowDown opens the calendar. Optional `future`/`past` validation. |
| `TagInput` | `forms/fields/TagInput.tsx` | Input-styled container of accent Badges plus a borderless input. Enter adds, ✕ removes, case-insensitive dedupe. |
| `EnumSelect` / `EnumIconButton` / `EnumIconSelect` / `EnumCommandList` | `forms/fields/EnumSelect.tsx` | Generic pickers driven by display config: full select, icon button that cycles through values, icon button that opens a popover list, raw cmdk list. |
| `DTableGroupBy` / `DTableSortBy` / `DTableFilterBy` / `DataTablePagination` | `ui/components/table/*` | Popover + cmdk menus over the TanStack table state. The trigger shows the active column icon, label and sort arrow. Filter shows stacked icons when several filters are active, plus a count badge. |
| `useDTable` | `table/DTable.tsx` | One TanStack table instance (core/sorted/filtered/grouped/expanded/paginated row models, `getRowId = task.id`). **It is the single view-model for all three views.** Hidden derived columns `dueDateCategory` / `scheduledDateCategory` power filtering. |
| `LoadingScreen`, `ErrorView`, `SettingsDebug` | `ui/components/*` | Utility screens. |

### 4.3 shadcn / base primitives actually used

Used (import count in `src`, excluding self): Button 18, Popover 9, Badge 7, Command 6, Card 3, Input 3, Alert 2, Calendar 2, Dialog 1, ScrollArea 1, Separator 1, Table 1, Tabs 1.
**Dead (0 imports):** Collapsible, DatePicker, DatefieldRac (the only `react-aria-components` user), Dropdown, Label, Select, Textarea, `scroll-area.tsx` (a lowercase duplicate of `ScrollArea.tsx`).

Button variants (`ui/base/Button.tsx:7-36`): default, accent, destructive, outline, secondary, ghost, link. Sizes: default h-10, sm h-8, lg h-12, fill, icon h-12 w-12, **iconsm h-8 w-8** (the most used). Badge variants (`ui/base/Badge.tsx:7-31`): default, secondary, destructive, **accent (ring-1 ring-accent, accent text = tag chip)**, outline. Sizes default and sm. Optional `icon` and `onRemove` ✕.

### 4.4 Icons

- lucide-react everywhere (24 files). Status: `Circle`, `PlayCircle`, `CheckCircle`, `XCircle` (`ui/lib/config/status.ts:1-51`). Columns: `Text`, `TagIcon`, `CheckCircleIcon`, `FlagIcon`, `CalendarCheck`, `CalendarClock` (`ui/lib/config/column.ts:1-60`). Views: `Table`, `ListChecks`, `KanbanSquare`. Actions: `Plus`, `Edit`, `MoreVertical`, `Eye`, `Trash2`, `Filter`, `LayoutGrid`, `ArrowUp/Down`, `ChevronsUpDown`.
- `react-icons/lu` (also Lucide) is used only for date-category icons: `LuCalendarClock` overdue, `LuCalendar1` today, `LuCalendarCheck` tomorrow, `LuCalendarDays` week, `LuCalendarFold` month/future, `LuCalendarOff` no date (`ui/lib/config/date.ts:1-93`). These all exist in lucide-react, so react-icons can be dropped.
- Custom SVG priority flags (§4.2).

## 5. Design language

### 5.1 What TaskUI does

The stated design is "a calm spreadsheet that lives in your notes" with no visual identity of its own. It inherits the Obsidian theme 100 % (`.spec/design.md:44-49`), stays flat, uses an 8/16 px rhythm and moderate-high density, and keeps a single card silhouette for List and Board.

Token mapping (`tailwind.config.cjs:13-85`). **All values are Obsidian CSS variables. No hex values exist in the code.**

| Tailwind token | Obsidian variable | Note |
|---|---|---|
| `background` | `--background-primary` | |
| `foreground` | `--text-normal` | |
| `primary` / `primary-foreground` | `--background-primary` / `--text-normal` | **Non-standard:** "primary" is a *surface* (used for group and column headers), not the brand color |
| `secondary` | `--background-secondary` | panel and card fill; `secondary-foreground` = `--text-on-accent` (odd) |
| `accent` / `accent-foreground` | `--interactive-accent` / `--text-accent` | **This is the brand color** (Add Task button, tag chips, drop highlight) |
| `muted` / `muted-foreground` | `--background-primary-alt` / `--text-muted` | |
| `destructive` | `--background-modifier-error` / `--text-error` | also used for high and highest priority and overdue |
| `success` | `--interactive-success` | |
| `border` | `--background-modifier-border` | |
| `input`, `ring` | `--background-secondary-alt` | |
| `card`, `popover` | `--modal-background` | |
| `hover` | `--interactive-hover` | used as `hover:ring-1/2 ring-hover` on cards and buttons |
| radius `lg` / `md` / `sm` | `--modal-radius` / `--checkbox-radius` / `0.1rem` | |
| font sizes `xs…xl`, `xxl` | `--font-smallest`, `--font-ui-small`, `--font-text-size`, `--font-ui-medium`, `--font-ui-larger`, 1.875rem | |
| font family | `var(---font-interface-theme)` | **Typo: three dashes** (`tailwind.config.cjs:61`), so it never resolves |

`dev-vault/.obsidian/themes/Prism/theme.css` is a vendored third-party theme (Damian Korcz, MIT) with HSL palettes. It is **not active** (`appearance.json` → `"cssTheme": ""`) and is not TaskUI's design.

### 5.2 Recurring visual idioms worth keeping

1. **Headers on a contrasting surface.** List group headers, board column headers and table group rows all use the same `bg-primary` bar: `px-4 py-3`, small chevron, icon, `font-semibold text-sm` label, count badge at `ml-auto`. Content sits on `bg-secondary`.
2. **Cards:** `rounded-md border-2 shadow-md`, `hover:ring-1 ring-hover`, `px-3 py-2`, `gap-2`. Done = `line-through opacity-60`.
3. **Metadata hierarchy:** title `text-sm`/base. Dates and tags `text-xs`/`text-sm`, muted, indented under the title (`pl-7` board, `pl-12` list) so they align with the title rather than the checkbox.
4. **Semantic color only for meaning:** red for overdue and for high/highest priority, muted for done/lowest/no-date, accent for tags and drop targets. No other color.
5. **Icon-first controls.** Status and priority render as icons with an aria-label. Labels sit above the controls and fade in when active.
6. **Motion:** `transition-all`, `animate-in fade-in-0 slide-in-from-top-2 duration-200` on the drop zone, `tailwindcss-animate` accordion keyframes.

### 5.3 Recommended Shards token set (new; TaskUI gives none)

Use the current shadcn/ui convention: Tailwind v4, `@theme inline`, OKLCH CSS variables on `:root`/`.dark`, `tw-animate-css` instead of the deprecated `tailwindcss-animate`, and the unified `radix-ui` package (https://ui.shadcn.com/docs/tailwind-v4, https://ui.shadcn.com/docs/installation/manual, https://ui.shadcn.com/docs/cli → `migrate radix`). Restore standard semantics: `primary` = brand violet, and add separate `surface-header`/`sidebar` tokens for TaskUI's header bars.

Brand palette **eyeballed from `assets/icon.png`** (no pixel sampling tool was available, so treat as approximate): background ≈ near-black blue-grey (#15151c-ish), panel ≈ #1d1d27-ish, shard violet ≈ #7c3aed-#8b5cf6 range (light face) and #5b21b6-ish (shadow face), mesh lines ≈ dark slate. Suggested mapping:
- `--primary`: violet (e.g. Tailwind `violet-600` / `violet-500` in dark), `--ring`: same.
- Priority colors (TaskUI uses red for both high levels; Todoist uses 4 distinct colors): highest = red, high = orange, medium = violet (brand) or neutral, low = blue/slate, lowest = muted outline. Keep TaskUI's flag shapes.
- Date categories: overdue = destructive, today = green or brand, tomorrow = amber, later = muted.
- Radius: shadcn default `--radius: 0.625rem`. TaskUI cards read as `rounded-md`.
- Font: TaskUI wants the host UI font. A standalone app should pick one explicitly (e.g. Inter or Geist) and keep TaskUI's `text-sm` density.
- Dark mode first (the icon is dark), plus a light theme. Provide the `.dark` class toggle that TaskUI never needed.

## 6. Data model: TaskUI vs mesh vs Shards

TaskUI `Task` (`src/data/types/tasks.ts:33-63`): `id, description, priority(5), recurs?, dueDate?, scheduledDate?, startDate?, blocks?[], status(4), createdDate?, doneDate?, path?, symbol?, source(obsidian|taskui), tags?[], rawTaskLine, subtasks?[]`. Store wrapper `TaskWithMetadata { task, metadata{lastUpdated,lastSynced,needsSync,toBeSyncedAction,previousVersion,isEditing,retryCount,syncFailed,errorMessage} }` (`tasks.ts:68-86`).

mesh `Task` (`mesh/src/model/task.rs:54-68`): `id, title, tags[], owner?, created?, updated?, related[], status(open|claimed|done|cancelled), priority?(high|normal|low), claimed_by?, project?, blocks[], blocked_by[], meta`.

| Concept | TaskUI | mesh | Shards gap / decision |
|---|---|---|---|
| Storage unit | one checkbox line in any `.md` (`rawTaskLine`, `path`) | one `.md` file per task, frontmatter, `tasks/open/` and `tasks/done/` | Keep the mesh file-per-task model as core. TaskUI line parsing becomes an importer. |
| Title | `description` | `title` | rename in UI |
| Body / notes | none (one line) | markdown body | Shards gains a rich description (Todoist-like) |
| Status | todo, in-progress, done, cancelled | open, claimed, done, cancelled | `claimed` + `claimed_by` ≈ in-progress *by someone*. Shards needs both a human "in progress" and an agent "claimed". Board columns must map them. |
| Priority | 5 levels | 3 (high/normal/low) | Decide on 4 (Todoist P1-P4) or 5. The mesh schema must widen. |
| Due / scheduled / start / done dates | yes | **none** | **mesh must add `due`, `scheduled`(optional), `start`, `completed`.** These are core for Today/Upcoming. |
| Recurrence | `recurs` string (Tasks syntax "every week") | none | add `repeat` (RRULE or Tasks-style string) |
| Dependencies | `blocks` field **actually stores depends-on**: written as `[dependsOn:: …]` / `⛔ …` (`taskMapper.ts:89-92,127-129,565`), and the form lists "Tasks blocked by this" as tasks whose `blocks` contains this id (`TaskForm.tsx:125-128`) | `blocked_by` authoritative, `blocks` mirror (`mesh/README.md:287`) | **Naming trap:** TaskUI `blocks` == mesh `blocked_by`. Do not invert it when porting. |
| Subtasks | nested `subtasks[]` (indented lines) | none (`related`, `project`) | add `parent` (Todoist sub-tasks) |
| Tags | `#tag` strings with `#` | tags without `#` | normalize to no-`#` |
| Project | file path acts as an implicit project | `project` id | Shards: first-class projects + sections |
| Assignee | none | `owner`, `claimed_by` | Shards: assignees = humans or agents (multiplayer) |
| Created / updated | `createdDate` only | `created`, `updated` | ok |
| Sync metadata | in-memory `metadata` | n/a | do not persist; for remote sync use a CRDT/version vector |

## 7. What to avoid (bugs and Obsidian coupling)

### 7.1 Obsidian-coupled code (do not port)

- `src/main.ts`, `src/MainView.tsx` (`ItemView`, ribbon, React root mount, sync observer).
- `ui/components/forms/TaskModal.tsx` (Obsidian `Modal`). Replace with a shadcn `Dialog` or `Sheet`.
- `new Notice(...)` in `TaskView.tsx:44,57,73,94,107` and `ui/lib/obsidian/notice.ts`. Replace with `sonner` toasts.
- `api/internalApi/{dataviewApi,obsidianApi,tasksApi}.ts`, `api/internalApiService.ts`, `utils/pluginCheck.ts`. Replace with a Tauri command layer over the Rust core.
- `config/settings.ts` (`PluginSettingTab`), `service/SettingsService.ts` + `@ophidian/core`.
- `tailwind.config.cjs` color/radius/font vars → Obsidian variables (see §5.1).
- Button `!bg-*` important overrides (`ui/base/Button.tsx:13-20`). They exist only to beat Obsidian's global `button` CSS. Use plain shadcn variants.
- `useDTable({ app })` puts the Obsidian `App` into table meta (`DTable.tsx` `meta: { app }`).

### 7.2 Bugs and anti-patterns (fix if porting the logic)

1. **Unstable IDs for tasks without `[id::]` / 🆔.** `TaskBuilder` default `id: newId({length:8})` (`data/taskBuilder.ts:8-13`) is used whenever the parsed line has no id (`taskMapper.ts:215-226, 326-333`), so every 5 s fetch gives the same task a new random id. `handleRemoteUpdate` matches local and remote tasks by `id` (`taskAtoms.ts:57-90,149`), so id-less tasks churn on every poll. Scope: tasks created in TaskUI always write an id; only pre-existing id-less lines are affected. Shards: stable ids in frontmatter (mesh already has them).
2. **Board drop onto a card is ignored and reordering is never persisted.** `handleDragEnd` acts only if `over.id` starts with `column-` (`BoardView.tsx:103-116`). With `closestCenter` and every card registered by `useSortable` (`TaskBoardCard.tsx:39-41`), the nearest droppable is often a card. The drop then does nothing, and in-column order is discarded. Shards needs a persisted `order`/rank field (e.g. fractional index) and drop-on-card handling.
3. **Board and List are paginated** (30/page, shared `paginationAtom`, `taskAtoms.ts:485-491`). TaskView renders pagination under every view (`TaskView.tsx:197-231`), so the Kanban shows only one page. Shards: virtualize (`@tanstack/react-virtual`) and do not paginate.
4. **Date-category filter can never match.** Options are "Today, Tomorrow, This Week, Next Week, Later, No Date, Overdue" (`DTableFilterBy.tsx:55-74`), but the values produced are `DateCategory` strings "Next 7 days", "Next 30 days", "Future", "No date" (`ui/lib/config/dateCategory.ts`). Also `dateToDateCategory` never returns `THIS_WEEK` or `THIS_MONTH` (`ui/lib/config/date.ts:114-161`).
5. **Font-family typo** `var(---font-interface-theme)` (`tailwind.config.cjs:61`).
6. **Impure parsing.** `TaskMapper` reads `getDefaultStore().get(settingsAtom)` inside parse/serialize (`taskMapper.ts:79, 212, 323`) and sets `path = settings.defaultPath` during parse. Pass config explicitly.
7. **The emoji-format merge drops unknown tokens** (`taskMapper.ts:494-503`). The Dataview merge preserves them. The importer should preserve unknown content.
8. **"Medium" equals "no priority".** Missing priority defaults to MEDIUM (`taskMapper.ts:231, 365`), and MEDIUM is omitted on emoji write (`:375-377`). Todoist distinguishes P4 "none". Shards should have an explicit none/default level.
9. **Polling.** `setInterval(…, 5000)` full Dataview refetch (`api/internalApiService.ts:229-262`). (`MainView.tsx:97-101` is a one-shot 5 s `setTimeout` for the initial reload, not a second interval.) Shards: a file watcher in Rust (mesh already has `watch`) pushes events to the UI via Tauri events.
10. **Label-keyed display lookup.** `getMatchingDisplay(value as string)` resolves icons by the raw string across all enums (`ListView.tsx:43-50`, `BoardColumn.tsx:195-197`). Values that collide or are unknown fall back to plain text. Key by `(field, value)`.
11. **Enum ↔ label round-trips in the form.** The form schema validates *labels* ("To Do") and converts them back to enums (`forms/TaskFormSchema.ts`, `TaskForm.tsx:149-154`). Validate enum values directly.
12. Single-level grouping only (`grouping[0]`); filters allow one value per column (`DTableFilterBy.tsx:77-91` replaces). Shards needs multi-select filters and saved filters.
13. Default expanded keys reference `priority:none`, which does not exist (`taskAtoms.ts:453-480`). This is minor dead config.
14. TypeScript 4.8 and React 18 are old. Tests cover only the data layer (`tests/data/*`); views and forms have none (#29).

## 8. What is good and worth porting to a standalone React + Tauri app

Ranked by value for a Todoist-class app:

1. **Enum display-config registry** (`ui/lib/config/{status,priority,date,column,types,utils}.ts`): one table per enum with `{label, icon, className, iconClassName, order}` plus generated `getOrdered…`, `…StringToEnum`, `getDisplay`. Every view and every picker reads it. Port as-is (keyed by field).
2. **Status-as-checkbox tinted by priority** (`PriorityStatusCheckbox.tsx`). It packs two fields into one 32 px hit target. Keep left-click = complete (Todoist muscle memory), and offer right-click/long-press → priority or status menu. Change the cycle so the primary click toggles done rather than going todo → in-progress.
3. **5 flag SVGs** (`PriorityFlags.tsx`). They are distinctive and carry meaning without color.
4. **Relative date display + date categories** (`date.ts`, `DateDisplay.tsx`). These are the basis of Today / Upcoming / Overdue smart views and grouping. Fix the THIS_WEEK gap.
5. **chrono-node date input** (`DatePickerInput.tsx`). Generalise it into a Todoist-style **quick-add parser** (title + `#project` + `@label` + `p1` + "tomorrow 5pm" + "every mon"). chrono is already a dependency.
6. **One view-model for all views** (`useDTable`). The pattern is good: filter/sort/group once and project into List/Board/Table (later Calendar). Drop pagination and add virtualization.
7. **Kanban column UX** (`BoardColumn.tsx`): collapse to a vertical strip, persisted collapse state, sub-grouping inside a column, count badges, dashed "Drop to move → In Progress" hint, tilted DragOverlay.
8. **Adaptive list card** (`TaskListCard.tsx`): one row without dates, three rows with dates. Metadata is indented to align with the title. Tags move to their own row when they would crowd the title.
9. **Inline edit card** (`TaskForm variant="inline"`). It becomes the Todoist-style in-place editor. Make it the default on Enter/double-click and keep the full form as a right-side detail **Sheet** (Todoist task detail pane).
10. **Two-level filter command menu with removable chips** (`DTableFilterBy.tsx`). Extend it to multi-value and saved filters ("Views").
11. **Fading control labels** that keep the layout from shifting, and the `bg-primary` header-bar idiom.
12. **Jotai `atomWithStorage` for per-view UI state** (sorting/grouping/collapsed). Keep it for UI-only state. Task data should come from Tauri commands (TanStack Query or a Jotai async atom) instead.
13. **`taskMapper.ts` + `tests/data/taskMapper.test.ts`** as the specification and fixtures for a Rust "import Obsidian Tasks / Dataview" importer and an optional "inline tasks in notes" read path.
14. **Optimistic local update with `needsSync`/`retryCount` metadata** (`taskAtoms.ts:180-298`). The concept carries over to remote sync (optimistic UI + outbox). Reimplement it against the Shards sync protocol.

## 9. npm dependencies — reuse list

Versions: "TaskUI" = package.json range. "Latest" = `npm view <pkg> version` on 2026-10-15. "Uses" = files in `src` importing it.

| Package | TaskUI | Latest | Uses | Recommendation |
|---|---|---|---|---|
| react / react-dom | ^18.3.1 | 19.3.1 | all | **Upgrade to 19** (shadcn v4 targets React 19) |
| @tanstack/react-table | ^8.21.3 | 9.3.1 (v9.0.0 published 2026-08-04) | 13 | Reuse. **Trade-off:** pin 8.21.3 to port `useDTable` and the views verbatim, or adopt v9 (2 months old, API changes). |
| @tanstack/react-virtual | — | 3.14.20 | 0 | **Add** (replaces pagination) |
| @dnd-kit/core / sortable / utilities | ^6.3.1 / ^10.0.0 / ^3.2.2 | 6.3.1 / 10.0.0 / 3.2.2 | 2/2/1 | Reuse (stable). `@dnd-kit/react` 0.5.1 is pre-1.0, so avoid it for now. |
| jotai | ^2.12.3 | 3.0.1 (v3.0.0 published 2026-09-08); 2.x latest 2.20.3 | 10 | Reuse for UI state. **Trade-off:** 2.20.3 (port as-is) vs 3.x (5 weeks old). |
| jotai-effect | ^2.0.2 | — | 1 | Optional; probably drop |
| zod | ^3.24.3 | 4.6.7 | 4 | Reuse; upgrade to v4 |
| react-hook-form | ^7.56.1 | 7.90.0 | 1 | Reuse |
| @hookform/resolvers | ^5.0.1 | 5.9.1 | 1 | Reuse |
| chrono-node | ^2.7.7 | 2.10.3 | 1 | **Reuse; core of quick-add NLP** |
| date-fns | ^4.1.0 | 4.4.0 | 9 | Reuse |
| react-day-picker | ^9.4.3 | 10.0.2 (9.x latest 9.14.0) | 1 | Reuse via the shadcn `calendar` component; take whatever version the shadcn CLI installs |
| cmdk | ^1.1.1 | 1.1.1 | 1 | Reuse; **also for a global ⌘K command palette** |
| lucide-react | ^0.453.0 | 1.57.0 | 24 | Reuse; upgrade to 1.x (check icon renames) |
| class-variance-authority | ^0.7.0 | 0.7.1 | 5 | Reuse |
| clsx + tailwind-merge | ^2.1.1 / ^2.5.4 | 2.1.1 / 3.7.0 | 1 | Reuse (tailwind-merge v3 for Tailwind v4) or the shadcn `cn` package per current docs |
| tailwindcss | ^3.4.14 | 4.3.3 | — | **Upgrade to v4** + `@tailwindcss/vite` |
| tailwindcss-animate | ^1.0.7 | 1.0.7 | 1 | **Replace with `tw-animate-css` 1.4.0** (deprecated by shadcn, Mar 2025) |
| @radix-ui/react-{dialog,popover,tabs,scroll-area,separator,slot,dropdown-menu,select,collapsible,label} | various | e.g. popover 1.3.1 | 1 each | Reuse via shadcn. Consider the unified `radix-ui` 1.8.1 (`shadcn migrate radix`). Add `context-menu` (right-click on tasks) and `tooltip`. |
| sonner | — | 2.0.8 | 0 | **Add** (toasts replacing Obsidian `Notice`) |
| title-case | ^4.3.2 | — | 3 | Drop (trivial) |
| ts-randomstring | ^1.0.8 | — | 1 | Drop; ids come from the Rust core (or `nanoid` 6.0.2 for optimistic temp ids) |
| pino | ^9.5.0 | — | 1 | Drop in the webview; log in Rust (`tracing`) |
| events | ^3.3.0 | — | 1 | Drop (Tauri events) |
| react-aria-components | ^1.8.0 | — | 1 (dead `DatefieldRac.tsx`) | Drop |
| react-icons | ^5.5.0 | 5.7.0 | 1 | **Drop**; the same Lucide icons exist in lucide-react |
| @ophidian/core, obsidian, obsidian-dataview | — | — | — | Drop (Obsidian-only) |
| **Zero-use (dead) deps** | @headlessui/react, @internationalized/date, @radix-ui/react-icons, emblor, lodash, react-label, use-mask-input, uuid (+ @types/uuid) | | 0 | Drop |
| Tooling: vite, @vitejs/plugin-react, vitest, @biomejs/biome, typescript | ^7.3.2, ^5.1.2, ^3.2.6, 2.3.8, 4.8.4 | 8.3.4, 6.1.2, 5.0.5, 2.5.15, 7.0.2 | — | Reuse Vite + Vitest + Biome (the owner's standard). TS 5.x or 7 (7.0 is the native compiler; check tool support). |
| @tauri-apps/api | — | 2.12.4 | — | **Add** (Tauri v2) |

**Primitive library is now a scaffold-time choice.** Current `shadcn init` takes `-b base|radix|aria` and styles such as `radix-nova` / `base-nova` (https://ui.shadcn.com/docs/cli, /docs/installation/manual). TaskUI's `"style": "new-york"` (`components.json:3`) no longer maps one to one. **Choose Radix**, because every component worth porting is built on Radix primitives.

shadcn components to generate for Shards (current CLI `shadcn@4.21.5`): button, badge, card, input, textarea, checkbox, popover, command, dialog, sheet, dropdown-menu, context-menu, tabs, scroll-area, separator, tooltip, calendar, select, sidebar, sonner, kbd, toggle-group, collapsible.

## 10. Todoist-parity gaps visible from TaskUI (input for the PRD)

TaskUI lacks these, and Shards needs them to "challenge Todoist":
- Left **sidebar navigation**: Inbox, Today, Upcoming, Filters & Labels, Projects (with sections), plus Shards-specific Agents, Memory, Scratchpad.
- **Quick add** (global `q` / ⌘K, NLP: date, priority `p1`, `#project`, `@label`, recurrence).
- **Today / Upcoming** smart views, built from the date categories that already exist.
- **Calendar** view (TaskUI #34).
- **Manual ordering** (persisted rank), drag between projects and sections.
- **Subtasks** editable, with a progress count on the card.
- **Recurring tasks** with UI.
- **Task detail pane** (description markdown, comments/activity, sub-tasks, assignee).
- **Keyboard-first** operation (j/k, e, Enter, space = complete, ⌘Enter).
- **Search** (the `globalFilter` is already wired in TanStack).
- **Multiplayer:** assignee/claimant avatars (human vs agent badge), activity feed, live updates.
- **Undo** toast after complete or delete.
