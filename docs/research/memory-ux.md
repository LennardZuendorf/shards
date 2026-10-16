# Shards — Memory and Scratchpad Management UX (research gap 2)

Date: 2026-10-15. Scope: how humans view and manage **agent memory** and **agent scratchpads / working state**, and what that means for the Shards screens, components and the mesh core.
Read-only on `mesh/`. All code citations are `file:line` against HEAD at `~/.villain-worktrees/villain-mesh-improvements/mesh` unless marked **PR #11** (copy at `scratchpad/build/pr11/src/`). Paths below are shortened to `src/...`.

---

## 0. Summary (answer first)

1. **Every serious memory product converges on the same five human controls.** These are: a browsable list with per-item edit and delete, a scope or partition switch, provenance (who wrote it, from what), expiry or archive instead of delete, and a "why was this recalled" view.
   - ChatGPT has a memory summary, "Manage", saved memories versus chat history, and a "sources" explanation (help.openai.com/articles/8590148-memory-faq).
   - Claude has Topics plus per-project memory (support.claude.com/en/articles/11817273).
   - Mem0 / OpenMemory have entity filter pills, an ADD/UPDATE/DELETE history, pause/archive, and access logs (docs.mem0.ai/api-reference/memory/history-memory; mem0.ai/blog/how-to-make-your-clients-more-context-aware-with-openmemory-mcp).
   - Letta ADE has editable core blocks with character limits and a context-window viewer (docs.letta.com/v1-sdk/ade).
   - Zep has bi-temporal validity (help.getzep.com/facts).
   - Devin has knowledge enable/disable, a suggestions inbox, and "misleading knowledge" flags (docs.devin.ai/product-guides/knowledge, docs.devin.ai/product-guides/session-insights).
2. **Mesh already stores most of what these UIs need.** It is all in Markdown frontmatter: `kind`, `scope`, `importance 1..5`, `source`, `expires`, `superseded_by`, plus `project` on PR #11 (`src/model/memory.rs:15-30`). It also has a deterministic, explainable ranking formula (`src/domain/memories.rs:623-631`). No competitor except Basic Memory and Claude Code auto-memory is plain files. That is the Shards differentiator: *memory the human can read, edit, diff and grep*.
3. **Six screens cover the request.** They are Memories list, Memory detail/editor, Recall playground, Scratch by agent, Scratch detail, and Agents overview (§3).
   - Every read maps to an existing domain function.
   - Most writes map to an existing MCP tool.
   - Destructive actions (`forget`, `forget_expired`, `scratch clear`, `supersede`) exist in the domain but are **UI-only by design**. The MCP name test bans `forget` and `clear` (`src/mcp/mod.rs:218-221`), so they ship through the `Api::dispatch` UI surface (`research/codebase.md` §2.7).
4. **Six gaps block a good UX and need new verbs or spec decisions (P0/P1).** Details are in §5.
   - (G1) No memory body-replace verb.
   - (G2) `private` scope is applied inconsistently and cannot be bypassed by the operator.
   - (G13) No optimistic-concurrency precondition, so a human editing a live agent scratch silently races the agent.
   - (G16) No identity model, so there is no human/agent badge.
   - (G6) Recall is opaque: the final score overwrites the match score, and excluded hits vanish.
   - (G4) Supersession can be created but not linked between existing items, validated or undone.
5. **Two ideas from the market conflict with stated mesh principles. Do not add them silently:**
   - "last used / use count" conflicts with `docs/concepts.md:74-78`, which rejects touch-on-read.
   - built-in edit history conflicts with `AGENTS.md` §6, where versioning belongs to the vault owner.
   - Recommendation: derive history from git in the Tauri host when the vault is a repo. Keep any access log **outside** the vault, written by the remote server only, following the OpenMemory pattern.

---

## 1. Base and method

- **Base:** design against **PR #11**, which adds memory `project` (`PR #11 src/model/memory.rs:26,63,178`; `PR #11 src/domain/memories.rs:58,75,100,687`) and the `dashboard::snapshot` agents pane (`PR #11 src/cli/dashboard.rs:47-62,148`). Fields marked *(PR #11)* do not exist on HEAD.
- **Action tiers:** every action below carries one of three tiers.
  - **A**: an MCP tool exists (`mesh_memory_*`, `mesh_scratch_*`, `mesh_session_start`, …; `src/mcp/mod.rs:45-54`).
  - **B**: a domain function exists but has no MCP tool and no standalone CLI verb. The UI reaches it through a UI-only `Api::dispatch` entry (`research/codebase.md` §2.7). This needs no new verb, but it does need the facade.
  - **C (NEW VERB NEEDED)**: there is no function. Per `AGENTS.md` §0.4 ("a new verb … needs a spec change and an explicit sign-off") each C item goes through the `spec` skill.
- **Research:** Exa search and fetch on 2026-10-15. Every product row in §2 cites the page read. OpenMemory is **being sunset** (github.com/mem0ai/mem0/tree/main/openmemory), so it serves as a pattern source, not a live competitor.

---

## 2. (a) Pattern table

### 2.1 Agent / assistant memory, as presented to humans

| Product | Pattern | Source |
|---|---|---|
| ChatGPT | **Memory summary** page with a "last updated 2 hours ago" stamp, plus a **Manage** view. A three-dot menu offers "Refresh" and "Delete and turn off memory". | https://help.openai.com/articles/8590148-memory-faq |
| ChatGPT | **Two partitions**: *saved memories* (explicit, kept until deleted) and *reference chat history* (derived, changes over time). Each has its own toggle. Turning off chat history schedules derived data for deletion within 30 days. | https://help.openai.com/en/articles/11146739-how-does-reference-saved-memories-work ; https://help.openai.com/en/articles/8590148-memory-in-chatgpt |
| ChatGPT | Saved-memory controls "can also include **search, sorting, automatic prioritization, and version history**". Users can delete individual items or **clear all**. | https://help.openai.com/en/articles/8590148-memory-in-chatgpt |
| ChatGPT | **Recall explanation**: a book icon under a response lists the sources used (memories, past chats, files). Tapping a memory "open[s] an explanation on why that memory was used", with a ••• menu to correct it. | https://help.openai.com/articles/8590148-memory-faq |
| ChatGPT | **Privacy mode**: Temporary Chat neither reads nor writes memory. Deleting a memory does not delete mentions in past chats; the user is told to delete every source. | https://help.openai.com/articles/8590148-memory-faq |
| Claude (claude.ai) | Settings › Memory lists everything under **Topics**. Select a topic to read it, then edit it (pencil) or delete it. A fix applies to all future chats. Memory can also be edited conversationally. | https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context |
| Claude (claude.ai) | **Scope partition**: each project has its own memory. A "Use account memory" toggle isolates a project, and memory can be turned off per chat via the "+" menu. | https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects |
| Claude (claude.ai) | **Incognito**: a ghost icon, a black border and an "Incognito chat" label. The chat neither reads nor writes memory. | https://support.claude.com/en/articles/12260368-use-incognito-chats |
| Claude (claude.ai) | **Export verbatim**: "View and edit your memory", or ask Claude to "write out your memories of me verbatim". | https://support.claude.com/en/articles/12123587-import-and-export-your-memory-from-claude |
| Claude Code | **Memory is files.** `/memory` lists CLAUDE.md / CLAUDE.local.md across user and project scopes (including files that don't exist yet), toggles auto memory, and opens the folder. | https://code.claude.com/docs/en/memory |
| Claude Code | Auto memory is a `MEMORY.md` **index** plus one topic file per memory. A `type` frontmatter field takes `user`, `feedback`, `project` or `reference`. A `modified` timestamp is stamped on write "so the timestamp shows how current the fact is". There is a 200-line / 25 KB load budget for the index. | https://code.claude.com/docs/en/memory |
| Claude Code | **Inline recall/write indicators**: "Saved 2 memories" and "Recalled 2 memories" appear in the transcript. `/doctor prompt-audit` reports outdated or **conflicting** instructions with proposed edits. | https://code.claude.com/docs/en/memory |
| Mem0 Platform | **Entity filter pills**: `user_id`, `agent_id`, `app_id`, `run_id`. A fact is attributed to the speaker who stated it. `delete_all` is scoped by entity. | https://docs.mem0.ai/platform/features/entity-scoped-memory |
| Mem0 Platform | **Expiry hides, never deletes**: "Expired memories are hidden by default. Pass `show_expired: true`". Filters include `created_at`, `updated_at`, `expiration_date`, `categories` and `keywords`. | https://docs.mem0.ai/api-reference/memory/get-memories ; https://docs.mem0.ai/platform/features/v2-memory-filters |
| Mem0 Platform | **Per-memory history**: an event log of `ADD`, `UPDATE` and `DELETE` entries with `old_memory`, `new_memory`, the `input` conversation that caused the change, and the categories at that point in time. | https://docs.mem0.ai/api-reference/memory/history-memory |
| OpenMemory (Mem0, local; sunsetting) | Dashboard with **stat tiles** (total memories, apps connected) and debounced live search. Filters: apps, categories, show archived, and sort by memory, app or created date. | https://mem0.ai/blog/how-to-make-your-clients-more-context-aware-with-openmemory-mcp |
| OpenMemory | **Memory states** `active`, `paused`, `archived`, `deleted`. Bulk state change and bulk delete by id list. The detail view shows **access logs** (`app_name`, `accessed_at`) and **related memories**. An app can be paused, which disables its writes. | https://github.com/mem0ai/mem0/blob/ece7ff6b/openmemory/ui/hooks/useMemoriesApi.ts ; blog above |
| Letta ADE | Three panels. The right "State Visualization" panel holds the **Context Window Viewer**, the **Core Memory Blocks** (view/edit) and an **Archival Memory** search. | https://docs.letta.com/v1-sdk/ade |
| Letta | A block is `label`, `description`, `value`, a character `limit` and a `read_only` flag. Blocks are **shared across agents**, with "see all agents attached to a block". Setting `value` replaces the block and the last write wins. Blocks also serve as "scratchpad space". | https://docs.letta.com/v1-sdk/memory/memory-blocks/index.md |
| Letta | **Archival memory**: agent-immutable, editable and deletable by developers, tag-organized, semantic search. The docs advise against it for "current working memory → use scratchpad blocks". | https://docs.letta.com/v1-sdk/memory/archival-memory/index.md ; https://www.letta.com/blog/introducing-the-agent-development-environment/ |
| Zep | **Bi-temporal facts**: `created_at`, `valid_at`, `invalid_at`, `expired_at`. Facts are invalidated, not deleted, which gives point-in-time history. | https://help.getzep.com/facts |
| Zep | **Graph explorer** opens from the user page. A **graph visualizer assistant** shows its retrieval plan step by step, lists cited facts with "Show on graph", and highlights the evidence for each step. | https://help.getzep.com/graph-visualizer-assistant.md ; https://blog.getzep.com/knowledge-graph-explorer/ |
| Zep | **Fact ratings**: rate relevance, then retrieve only facts above a minimum rating. This is close to mesh `importance` plus `min_importance`. | https://blog.getzep.com/knowledge-graph-explorer/ |
| Basic Memory | **Markdown memory edited in Obsidian.** Observations are `- [category] content #tag (context)` and relations are `- type [[Target]]`. Categories are free-form. | https://docs.basicmemory.com/concepts/observations-and-relations ; https://github.com/basicmachines-co/basic-memory/blob/main/NOTE-FORMAT.md |
| Basic Memory | **Granular body edits** through `edit_note`: `append`, `prepend`, `find_replace` (with `expected_replacements`) and `replace_section`. `recent_activity(timeframe)` and `build_context(depth)` are also available. | https://docs.basicmemory.com/guides/ai-assistant-guide/ |
| GBrain | Seven frozen verbs. `remember(fact, provenance, ttl?, visibility?)` requires provenance, and `forget(id, reason?)` takes an optional reason. **Correction = retire the old id, then save a replacement with provenance.** "Forget means withdrawal from active memory; history … may remain." | https://github.com/garrytan/gbrain/blob/master/docs/protocol/MEMORY_VERBS_v1.md ; https://github.com/garrytan/gbrain/blob/master/docs/tutorials/connect-coding-agent.md |
| GBrain | **Staleness and contradiction surfacing**: `think` "tells you when a page is stale, when a claim is uncited, when two pages contradict each other". An MCP admin dashboard registers clients, edits access and invalidates tokens. | https://github.com/garrytan/gbrain/blob/master/README.md |
| Devin Knowledge | Every item has a **trigger description**. Each item can be **enabled or disabled per user without deleting it**. Scopes appear as separate tabs (Organization, Enterprise, Suggestions). Items can be pinned to no repo, one repo or all repos. | https://docs.devin.ai/product-guides/knowledge |
| Devin Knowledge | **Suggestions inbox**: Devin proposes new knowledge, or updates to existing knowledge, from chat feedback. The user can edit before saving, dismiss, or regenerate. | https://docs.devin.ai/product-guides/knowledge |
| Devin Session Insights | A **Knowledge Usage** tab lists "Useful Knowledge" and "Misleading Knowledge", each with a reason and a link to edit the item. | https://docs.devin.ai/product-guides/session-insights |

### 2.2 Agent scratchpads, plans and working state

| Product | Pattern | Source |
|---|---|---|
| Claude Code | **Task checklist**, toggled with `Ctrl+T`. It shows up to 5 items with pending / in progress / complete indicators and persists across compaction. Setting `CLAUDE_CODE_TASK_LIST_ID` shares the list across sessions via `~/.claude/tasks/<id>`. | https://code.claude.com/docs/en/interactive-mode |
| Claude Code | The task tools are **off by default on Opus 4.8 / Sonnet 5 and later** ("those models keep track of multi-step work without a written checklist"). Agent working state therefore can't rely on a native todo pane, which argues for a scratch-backed plan. | https://code.claude.com/docs/en/tools |
| Claude Code SDK | Todo lifecycle: created `pending` → `in_progress` → completed → removed (`status: "deleted"`). An app can render its own progress view from the streamed `TaskCreate` / `TaskUpdate` calls. | https://code.claude.com/docs/en/agent-sdk/todo-tracking |
| Cursor | **Plan Mode**: the agent asks clarifying questions, then writes an editable Markdown plan. Plans are saved in the home directory, and "Save to workspace" moves one into the repo. Since 2.2, plans are files on disk and the user can **send selected to-dos to new agents**. | https://cursor.com/docs/agent/plan-mode ; https://cursor.com/changelog/2-2 |
| Cursor | A **sidebar lists all agents**, foreground and background, and lets the user peek into a remote machine. Agent status is also in the menubar. The Agents Window covers parallel agents across repos and environments. | https://cursor.com/changelog/1-4 ; https://cursor.com/changelog/1-7 ; https://cursor.com/docs/agent/agents-window |
| Devin | A **Progress tab** merges shell, IDE and browser steps into one timeline. Clicking a step jumps to it. The **work log** grades each step (🟢/🟠/🔴) with timestamps and duration. | https://docs.devin.ai/work-with-devin/devin-session-tools ; https://docs.devin.ai/release-notes/2024 |
| Devin | **Interactive planning**: the plan carries code citations. Devin auto-proceeds after 30 s unless the user clicks "Wait for my approval". | https://docs.devin.ai/work-with-devin/interactive-planning |
| Linear | **Agent Plans** are a session-level checklist. The plan is a full array of `{content, status: pending\|inProgress\|completed\|canceled}`, and an update must **replace the whole array**. | https://linear.app/developers/agent-interaction |
| Linear | Session state is **inferred from activities**, not set by the agent. Activities are `thought`, `action`, `elicitation`, `response` and `error`. A secondary integration design notes that a session goes `stale` after about 30 minutes of silence. | https://linear.app/developers/agents ; https://github.com/agentconnect-md/agentconnect/blob/2671ed6b/docs/designs/linear-integration.md |
| Kanbrio | The **AgentSession state is on the card face**: idle → working → waiting → done. An "Assign to…" picker mixes humans and agents. The hash-chained audit marks each actor `human` or `agent`, and destructive agent actions wait for `needs_approval`. | https://kanbrio.com |
| LooperTask | Agents are **named users**: "cards always show who's on them, which human or which machine". Each task keeps a receipt log of every field change, move and comment. An SSE live board shows agents working. Columns can be locked against agent pickup. | https://loopertask.com |

### 2.3 What to adopt, adapt or reject for Shards

| Adopt | Why it fits mesh |
|---|---|
| Expiry hides and never deletes, with a "show expired" toggle (Mem0) | This is exactly mesh semantics (`src/model/memory.rs:75-79`, `src/domain/memories.rs:548`). |
| Correction = replace with provenance (GBrain), supersession chain (Zep validity) | `superseded_by` already exists (`src/domain/memories.rs:371-378`). The UI makes "Correct this memory" its primary edit, with free-text edit second. |
| "Why was this recalled" (ChatGPT sources, Zep cited steps) | The recall formula is public and deterministic (`src/domain/memories.rs:623-631`), so the breakdown can be shown exactly (§3.3). |
| Scope partition (Claude projects, Mem0 entity pills) | Facets on `owner`, `scope`, `project` *(PR #11)* and `kind`. |
| Plan = whole-document replace (Linear, Letta `value`) | Maps 1:1 onto `scratch set`, which replaces the full body (`src/domain/scratch.rs:95-123`). Render `- [ ]` lines as a checklist. |
| Live agent state on cards (Kanbrio, Linear, Cursor sidebar) | Derive it from `updated` age, because mesh stores no session state. A ~30 min window follows the Linear stale heuristic. |
| Suggestions inbox (Devin) | Later: route `scratch` "promote" and low-importance new memories into a review queue. |
| **Adapt** pause/archive (OpenMemory, Devin enable/disable) | No state field exists. See G5 for the `expires` workaround and its hazard. |
| **Reject (spec conflict)** access log / last used inside the vault | `docs/concepts.md:74-78` rejects touch-on-read. If wanted, the remote MCP server logs access to its own store, outside the vault. |

---

## 3. (b) Recommended screens for Shards

Conventions for all screens:
- Every list call uses `Filter::unbounded()` (`src/domain/select.rs:100`), never `Filter::default()`, which caps at 20 (`src/domain/select.rs:92`; the MCP default is also 20, `src/mcp/schema.rs` `mesh_memory_list`).
- Every screen has a distinct **space disabled** state, because `cfg.root(Space::Memories)` errors (exit 2, kind `validation`) instead of returning empty (`src/domain/memories.rs:165-166`). Key the UI off `kind`, not off `message` (`research/codebase.md` §2.5).
- Every screen subscribes to the vault change feed. That feed does not exist yet (G17).

### 3.1 Memories list — `/memories`

**Purpose.** Browse, triage and clean every memory across agents, like ChatGPT "Manage memories" and the OpenMemory `/memories` page, with Markdown underneath.

**Data source.**
- Rows: `memories::list(cfg, &Filter{owner, tags, any_tag, mine, me, cutoff, sort, limit: None, extra}, &ListMemoryOpts{kind, scope, min_importance, include_expired, include_superseded})` (`src/domain/memories.rs:532-554`). This is MCP `mesh_memory_list` (tier A), but called with `limit: None`.
- Project facet *(PR #11)*: `ListMemoryOpts` has no `project`, so pass `Filter::with_extra("project", Some(id))`. It goes through the generic `matches_filters` (tier B).
- Header counts: `memories::summary(cfg)` → `{total, expired, superseded}` (`src/domain/memories.rs:558-571`). These are also in `lenses::status_report` (`src/domain/lenses.rs:533-541`). Tier B.
- Unparseable-file banner: `memories::rows(cfg).len()` minus the valid count. `rows` keeps every file with frontmatter, while `list` silently skips anything `Memory::from_meta` rejects (`src/domain/memories.rs:505-510`, `src/model/memory.rs:142-148`). Tier B, derived on the client.

**Layout.** The default is a dense **data table**, using the TaskUI `useDTable` approach (`research/taskui.md` §4.2). Group by `owner`, `kind`, `scope`, `project` or importance band. A list view is the narrow-width fallback. A left facet rail holds Kind, Scope, Owner, Project, Importance ≥ n, and the toggles "Show expired (n)" and "Show superseded (n)".

**Fields per row.** Checkbox, title, kind badge, scope badge, importance meter, owner avatar plus human/agent badge, `source` (truncated, with a tooltip), `updated` (relative) plus a freshness dot, expiry badge, a superseded marker that links to the successor, tags, project chip *(PR #11)* and the `related` count.

| Action | Backing | Tier |
|---|---|---|
| New memory (dialog) | `mesh_memory_new` → `memories::create_with_warnings` (`src/domain/memories.rs:286`), plus a duplicate warning from `find_duplicate_title` (`:596`) | A |
| Inline edit of title, kind, scope, importance, tags, expires, owner, project *(PR #11)* | `mesh_memory_update` → `memories::update` (`:430-483`) | A |
| Clear expiry | `mesh_memory_update expires:"none"` (`src/mcp/tools.rs` `memory_update`; `EXPIRES_NONE` `src/domain/memories.rs:38`) | A |
| Bulk set importance, kind or tags | loop `memories::update`. It is not atomic, so show a per-item result toast. | A (looped) |
| Forget selected | loop `memories::forget` (`:723-730`). It is a hard delete. | B (UI-only; MCP name ban at `src/mcp/mod.rs:218-221`) |
| Forget all expired | preview with `memories::expired_ids` (`:734-742`), then confirm and run `memories::forget_expired` (`:754-775`). This mirrors CLI `forget --expired` (`src/cli/memory.rs:626-635`). | B |
| Forget expired *for one owner or filter* | loop `forget` over the filtered expired rows. `forget_expired` is global only. | B (looped) / C for a native filter |
| Archive or pause | none. See G5. | **C** |
| Show other agents' `private` memories (operator view) | none. `list` always applies `is_visible_to(me)` (`:550`). | **C** (G2) |
| Export selection | client-side: the files are Markdown, and `path` is in each row (`src/render.rs:42`) | A (path) |

**Empty states.**
- Space disabled: "Memories are turned off in this vault" with a link to settings.
- Zero memories: explain that agents write memories with `mesh_memory_new` and humans can add one. Offer a "New memory" button.
- Filtered to zero: show "Clear filters" with the active chips.
- All hidden: when `summary.total > 0` but the list is empty, say "12 expired and 3 superseded memories are hidden" and offer a toggle.

**Stale states.**
- Expired: `expires <= now` (`src/model/memory.rs:77-79`). Dim the row, show a red badge "Expired · not recalled", and warn that "Forget all expired" deletes it.
- Expiring within 7 days: amber badge.
- Superseded: strike through the title and show "→ m-xyz".
- Fading: recency factor `0.5^(age/90)` < 0.5, that is, not updated for more than 90 days (`src/domain/memories.rs:49,623-631`). Show a grey dot with the tooltip "Recall weight ×0.68". Compute it on the client.
- `importance: null`: hollow meter with the tooltip "3 (default)" (`src/model/memory.rs:71-73`).
- Unknown kind or scope values: an outline badge with the raw text. These values are free-form on read and closed on write (`src/model/memory.rs:9-12,124-131`).

### 3.2 Memory detail and editor — `/memories/:id` (side sheet; full page on narrow screens)

**Purpose.** Read, correct and audit one memory: provenance, its supersession chain, links, and whether it would be recalled.

**Data source.**
- `memories::get(cfg, id)` returns meta, body and an absolute path (`src/domain/memories.rs:490-501`). This is MCP `mesh_memory_get` (tier A). Note that `get` does **not** apply the private-scope filter (G2).
- Forward chain: follow `superseded_by` with repeated `get` calls.
- Backward chain ("this replaced …"): run `memories::list` with `include_superseded` and `include_expired` on an unbounded filter, then filter on the client for `superseded_by == id`. This is derived and never stored, consistent with `AGENTS.md` §6 "Derived state is never stored". Tier B.
- Backlinks: `context::graph_query(cfg, id, 1, "in")` (`research/codebase.md` §2.3). This is MCP `mesh_graph`. Its default spaces include memories (`src/domain/context.rs:21`). Tier A.
- Recall eligibility: computed on the client as `!is_expired && !is_superseded && is_visible_to(viewer)` (`src/model/memory.rs:77-90`).

**Fields.**
- Header: title (inline edit), kind, scope, importance, owner avatar.
- Properties panel: `id`, `kind`, `scope`, `importance`, `owner`, `source`, `created`, `updated`, `expires`, `superseded_by`, `project` *(PR #11)*, `tags`, `related`, `path` (with Reveal / Open in editor).
- Unknown frontmatter keys: read-only, shown as "kept as-is". They round-trip through edits (`src/render.rs:42`; `src/model/memory.rs:297-304`).
- Body: rendered Markdown with wikilinks.
- Supersession chain stepper.
- Recall-eligibility chip: "Recalled", or "Not recalled: expired / superseded / private to X".

| Action | Backing | Tier |
|---|---|---|
| Edit title, kind, scope, importance, source, expires, owner, tags, project *(PR #11)* | `mesh_memory_update` | A |
| Clear `source` or `owner` | none. `UpdateMemory` can only set a string (`src/domain/memories.rs:464-480`). | **C** (G10) |
| Add to body (optional section, timestamp) | `mesh_memory_append` → `memories::append` (`:416-426`) | A |
| **Edit body** (full Markdown editor) | none. `UpdateMemory` has no body field (`:67-76`). | **C** (G1) |
| **Correct this** (primary edit; GBrain pattern): the new memory is prefilled from the current one, and saving supersedes it | `mesh_memory_new supersedes:<id>`. Supersession failures come back as warnings (`:356-367`). | A |
| Mark as replaced by an *existing* memory | `memories::supersede(cfg, target, by)` (`:371-378`). The CLI reaches it only through `new --supersedes` (`src/cli/memory.rs:203`). | B |
| Un-supersede or restore | none. Nothing clears `superseded_by`. | **C** (G4) |
| Forget | `memories::forget` behind an AlertDialog. The delete is permanent; there is no trash (`AGENTS.md` §6). | B |
| History / diff | none in mesh. It is a host-side `git log -p -- <path>` when the vault is a repo. | Spec conflict (G3) |
| Copy id / wikilink | client | — |

**Empty and stale states.**
- Not found (deleted externally): `not_found` with up to 5 near-miss candidates (`src/domain/memories.rs:34-35,186`). Show "Did you mean …".
- Ambiguous slug: list the ids (`:187-197`).
- Superseded banner: "Replaced by **<title>** on <successor.created>", with a link.
- Expired banner: "Expired <date>. Hidden from list and recall. *Forget all expired* will delete it permanently." Offer "Extend" (update expires) or "Never expire" (`expires:none`).
- Concurrent edit: a `lock_conflict` (409) error shows a retry toast. If the watcher reports an external change while the editor is dirty, show "Changed on disk: reload or overwrite". Overwrite requires G13.

### 3.3 Recall playground — `/memories/recall`

**Purpose.** "What would agent X recall for query Q, and why?" plus "What does X get injected at session start?". This adapts ChatGPT's sources explanation and Zep's visualizer steps to a debugging tool.

**Data source.**
- Ranked hits: `memories::recall(cfg, query, &Filter{me: Some(X), owner, tags, mine, extra: kind}, &RecallOpts{limit, threshold, decay, include_expired, min_importance, meta_only, full, project (PR #11)})` (`src/domain/memories.rs:663-715`).
  - MCP `mesh_memory_recall` is tier A, but it always uses the caller's own identity (`Filter.me = cfg.agent()`, `src/mcp/tools.rs` `memory_recall`).
  - **"Recall as X" needs the UI dispatch to set `Filter.me`** (tier B).
- Session-start preview: `mesh_session_start {owner: X}` substitutes the identity across all sources (`src/mcp/tools.rs:1026-1031`). Its memory section is `memories::session_picks(cfg, X, 5)` (`src/domain/memories.rs:575-590`; cap `src/mcp/tools.rs:36`). Tier A.
- Engine health: `search::health` via `mesh_health` (`research/codebase.md` §2.3). Tier A.
- "Matched but excluded" list: run `mesh_search` with the memories space only (tier A), diff it against the recall hits, and label each excluded hit as expired, superseded, private, below min importance, or below threshold, computed on the client from frontmatter. Recall itself drops these silently (`src/domain/memories.rs:675-699`).

**Controls.** Query box, "As agent" picker (from the roster), kind, tags, min importance, limit, a threshold slider (0–1), a **decay** toggle (`no_decay`), include expired, and project *(PR #11)*.

**Fields per hit.**
- Rank and final score bar.
- **Score breakdown**: match × importance weight `(0.6 + 0.1·imp)` × recency `(0.35 + 0.65·0.5^(age/90))`.
- Title, kind, importance, age in days, snippet (or the full body with `full`), and id.
- How the breakdown is derived: recall overwrites `hit.score` with the final score (`:700`). Because the formula is public (`recall_score`, `:623-631`), the client can back out `match = final / (w·r)` exactly, up to clock skew in `age`. Tier B (math mirrored on the client); a native `explain` is G6.

| Action | Backing | Tier |
|---|---|---|
| Run recall as self | `mesh_memory_recall` | A |
| Run recall as agent X | `memories::recall` with `Filter.me = X` | B |
| Preview X's session-start memories | `mesh_session_start {owner:X}` | A |
| Raise importance, expire, or "Correct this" on a hit | `mesh_memory_update` / `mesh_memory_new supersedes` | A |
| Show the search engine used (builtin vs indexed) | recall discards `_mode` (`:665`) | **C** (part of G6) |
| Save a query as a regression check ("X must recall m-abc for 'deploy'") | none | **C** (P2) |

**States.**
- Empty query: show X's session-start picks ("what X always sees first").
- No hits: suggest lowering the threshold, including expired, or switching decay off. Show "Search found n memories; all excluded" with reasons.
- Indexed engine degraded: show a banner from `mesh_health`. Search falls back to builtin BM25-lite (`AGENTS.md` §2).
- Memories space disabled: disabled state.

### 3.4 Scratch by agent — `/scratch`

**Purpose.** See every agent's working state at a glance: Cursor's all-agents sidebar and Kanbrio's state-on-card, over Markdown files.

**Data source.**
- `scratch::list(cfg, None, all=true, &Filter{cutoff, ..unbounded})` (`src/domain/scratch.rs:162-219`). This is MCP `mesh_scratch_list {all_agents:true}`. Tier A.
- Group by `item.agent` on the client.
- **The MCP list payload drops `bytes`.** `SCRATCH_FIELDS` has no `bytes` (`src/model/scratch.rs:11-12`); only the CLI adds it by hand (`src/cli/scratch.rs:210-217`). The UI dispatch must emit `View.item.bytes` (tier B).
- Body preview: the list returns an empty body (`src/domain/scratch.rs:200-204`), so previews need one `scratch::get` per card. Do this lazily for visible cards only (tier B). A `preview` option is a later optimization.
- Scratch is excluded from search, activity and session-start (`docs/concepts.md:79-82`; `src/mcp/instructions.rs:20-21`). This screen is the only place it surfaces.

**Layout.** One column per agent, board-style (a Kanbrio/Cursor sidebar hybrid). Each column header carries the agent avatar, file count, total bytes and last write. Cards hold the name, updated time, bytes, tags, the first lines of the body, and a **checklist progress bar** when the body contains `- [ ]` / `- [x]` lines. That checklist is a UI convention that maps Linear Agent Plans onto `scratch set` (§2.2). A list view is the fallback.

| Action | Backing | Tier |
|---|---|---|
| Open the detail | `mesh_scratch_get {agent,name}` | A |
| New scratch in an agent's namespace | `mesh_scratch_set {agent,name,body}`. The agent must be in the roster when one is set (`src/domain/scratch.rs:99`; `src/domain/owner.rs:10-21`). | A |
| Clear one | `scratch::clear` (`src/domain/scratch.rs:221-233`). The CLI is `scratch clear` (`src/cli/scratch.rs:226-238`). | B (UI-only) |
| Clear stale (bulk, per agent) | loop `scratch::clear` over cards with `updated < now − N days` | B (looped) |
| **Promote to memory** | `mesh_memory_new {body: scratch.body, source: "scratch:<agent>/<name>"}`, then optionally clear | A + B (composite; no new verb) |
| Promote to note | `mesh_note_new` | A |
| Promote checklist items to tasks | `mesh_task_new` per item, with `owner` = agent | A (looped) |
| Rename, or move to another agent | none | **C** (G12) |
| Edit tags | none. No verb writes scratch `tags` (`src/domain/scratch.rs:81-83` only defaults them). | **C** (G11) |

**Empty states.**
- Space disabled.
- No scratch anywhere: "Agents keep session state here via `mesh_scratch_set`. Nothing is in progress."
- An agent with no files: its column is hidden unless the agent is pinned from the roster.

**Stale and live states** (derived from `updated`):
- **Live**: under 30 min. Pulsing dot, "writing…".
- **Idle**: under 24 h.
- **Stale**: over 7 days. Grey, with "Clear stale?".

The thresholds are UI constants: the Linear ~30 min stale heuristic plus an operator setting.

### 3.5 Scratch detail — `/scratch/:agent/:name`

**Purpose.** Read and steer one agent's live working state, and hand it off into durable spaces.

**Data source.** `scratch::get(cfg, agent, name)` (`src/domain/scratch.rs:147-160`), MCP `mesh_scratch_get` (tier A). The view is built from the address, not from the frontmatter (`:59-73`).

**Fields.** Name (slug only; the original display name is not stored, G12), agent avatar, created, updated, bytes, tags, path, unknown keys, and the body. A checklist renders interactively when present.

| Action | Backing | Tier |
|---|---|---|
| Edit body (full replace) | `mesh_scratch_set`. It is idempotent: an identical body is a no-op (`src/domain/scratch.rs:104-108`). | A |
| Tick a checklist item | `mesh_scratch_set` with the modified body | A, but **races the agent** (G13) |
| Leave a note for the agent | `mesh_scratch_append {timestamp:true}` writes the `<iso> — <actor>` prefix naming the human (`src/domain/scratch.rs:133`; schema `mesh_scratch_append`) | A |
| Promote to memory, note or tasks | as in §3.4 | A |
| Clear | `scratch::clear` | B |
| Edit safely while the agent writes | none. There is no `if_updated` precondition. | **C** (G13) |

**States.**
- Live: updated within 30 min. Banner: "<agent> is actively writing this file; your edits may be overwritten." The editor defaults to append mode.
- Not found (the agent cleared it): `ScratchNotFound` (`src/domain/scratch.rs:132,153`). Offer "Recreate from my unsaved copy" when the editor is dirty.
- Invalid agent identity (non-ASCII slug): validation error (`src/domain/scratch.rs:31-45`).

### 3.6 Agents overview — `/agents`

**Purpose.** One card per identity, human or agent. It shows who is active, what work and claims they hold, and their memory and scratch footprint. This is the hub that deep-links into the other five screens and the task views.

**Data source.** It is composed, because no single function covers it.
- Roster: `cfg.tasks.collections` (`src/config.rs:58,243`). It is editable through the `tasks.collections` config key (`src/config.rs:144`). Tier B (config CLI).
- Task census: `lenses::status_report(cfg)["agents"]` → `{owns_open, claimed, stale_claims}` per identity, "registered on sight as owner or claimer" (`src/domain/lenses.rs:481-528`). Tier B: `status` is UI-only because `status` is a banned MCP substring (`src/mcp/mod.rs:221`).
  - PR #11 adds `notes_owned` and `notes_claimed` in `AgentRow` (`PR #11 src/cli/dashboard.rs:47-62`). Move that function from `cli` to `domain` (`research/codebase.md` §2.7).
- Memory footprint: group `memories::rows(cfg)` by `owner`. Use `rows`, not `list`, so that other agents' private memories are counted (`src/domain/memories.rs:505-510`). Count total, private, expiring within 7 days, and expired. Tier B.
- Scratch footprint: `scratch::list(cfg, None, true, unbounded)` grouped by agent, giving files, bytes and last write. Tier A.
- Last seen: the max of `activity::recent_activity(cfg, since, Some(X), false, n)` and the newest memory and scratch `updated`.
  - Default activity covers notes and tasks only (`src/domain/activity.rs:17,114-123`).
  - `recent_activity_in(..., &[Space::Memories])` exists (`:128-136`). Tier A plus client logic.
- Warm-start preview: `mesh_session_start {owner:X}`. Tier A.

**Fields.** Avatar with a **human/agent badge**, display name, status dot (live / idle / dormant from last seen), open-owned, claimed, stale claims, memories (total / private / expiring), scratch (files / bytes), and last seen.

| Action | Backing | Tier |
|---|---|---|
| Filter another screen by this identity | deep link with `owner=` / `agent=` | — |
| Release stale claims | `tasks::release(cfg, id, who, force=true)` (`research/codebase.md` §2.7 `task.release_force`) | B |
| Clear all scratch for agent | loop `scratch::clear` | B (looped) |
| Forget this agent's expired memories | loop `forget` over `rows` where `owner==X && expired` | B (looped) |
| Reassign memories to another identity | loop `mesh_memory_update {owner}` | A (looped) |
| Add or remove an identity in the roster | `tasks.collections` config write (`src/config.rs:144`) | B |
| Mark identity as human or agent; set display name, avatar, colour | none | **C** (G16) |

**Empty and stale states.**
- No identities: the roster is empty and nothing has an owner. Show an onboarding card: "Connect an agent: add Shards MCP to Claude Code / Cursor", plus "Set your own identity (`[core].agent`)".
- An identity seen in files but not in the roster: badge it "unregistered". `validate_owner` would reject new writes for it once a roster exists (`src/domain/owner.rs:10-21`).
- Stale claims: a red count that links to the task list filtered to that claimer's stale claims (`STATUS_STALE_WINDOW`, `src/domain/lenses.rs:482`).

---

## 4. (c) Component inventory (shadcn/ui on Radix, Tailwind v4)

Base and token conventions follow `research/taskui.md` §5.3. Component docs live at https://ui.shadcn.com/docs/components/<name>.

### 4.1 Table vs list vs card: the decision per screen

| Screen | Primary | Why | Fallback |
|---|---|---|---|
| Memories list | **Data table** (shadcn Table + TanStack, i.e. TaskUI `useDTable`, `research/taskui.md` §4.2) | Dense metadata (6–8 columns), sort, group, multi-select for bulk forget | List rows (TaskUI `TaskListCard` silhouette) below 768 px |
| Recall playground | **Ranked list** | Order matters. Each row needs a score bar, a breakdown and a snippet. | — |
| Scratch by agent | **Card board**, columns per agent | Body preview and live state matter more than metadata (Kanbrio, Cursor sidebar) | Grouped list |
| Agents overview | **Card grid** | Glanceable identity plus counts (LooperTask named users) | Table for more than 12 identities |
| Memory and scratch detail | **Sheet** (side panel) inside **Resizable** panels on desktop; full page on mobile | Keeps list context while editing | — |

### 4.2 Components

| Component | Built on | Spec |
|---|---|---|
| `ImportanceMeter` | Display: 5 segments (custom divs, `role="meter"`, `aria-valuenow`). Edit: **ToggleGroup** 1–5. | Filled = value; `null` = hollow plus the tooltip "3 (default)" (`src/model/memory.rs:71-73`). Keys `1`–`5` set it in the table. The colour ramps from muted (1) to primary (5). Avoid red, which is reserved for overdue and expired. |
| `KindBadge` | **Badge** + lucide icon | fact `Info`, preference `SlidersHorizontal`, procedure `ListOrdered`, insight `Lightbulb`, episode `History`. Unknown values get an outline badge with the raw text. The editor offers only the closed set (`src/model/memory.rs:10`). |
| `ScopeBadge` | **Badge** + **Tooltip** | `shared` = `Users`, `private` = `Lock`. The tooltip must say "Hidden from other agents' lists. Not a permission: anyone with the vault can read the file" (`src/model/memory.rs:11,86-90`). |
| `ExpiryBadge` | **Badge** + **HoverCard** | States: none (hidden), future > 7 d (muted `CalendarClock`), soon ≤ 7 d (amber), expired (destructive `CalendarX`, "Not recalled"). The hover card shows the absolute date plus Extend / Never expire. The input reuses TaskUI `DatePickerInput` with chrono parsing and accepts `7d` / `2w` (`src/domain/memories.rs:246-271`). |
| `FreshnessDot` | span + **Tooltip** | Colour comes from `0.35 + 0.65·0.5^(age/90)` (`src/domain/memories.rs:44-49`). The tooltip reads "Recall weight ×0.82 · updated 34 d ago". |
| `SupersessionChain` | Vertical stepper: custom, using **Separator**, **Badge** and **Collapsible** | Oldest at the top, current highlighted, predecessors struck through. Each step shows title, `created` and owner avatar. The compact form is a breadcrumb `m-a → m-b → **m-c**`. A broken link (`superseded_by` pointing at a missing id) gets a warning icon, because `supersede` never validates `by` (G4). |
| `AgentAvatar` + `ActorBadge` | **Avatar** (initials fallback) + a corner badge | Background colour is a deterministic hash of the identity. The corner badge is `Bot` for an agent and `User` for a human, and is absent while the kind is unknown (G16). The **HoverCard** shows the census (open / claimed / memories / scratch). The same component appears in task assignee pickers (Kanbrio "Assign to…"). |
| `LiveDot` | span + `animate-pulse` | live under 30 min / idle under 24 h / dormant. Driven by `updated` and change-feed events. |
| `ScoreBar` | **Progress** + stacked segments + **Tooltip** | The final score is the bar. The tooltip shows match, ×importance and ×recency (§3.3). |
| `ChecklistPreview` | **Checkbox** + **Progress** | Parses `- [ ]` and `- [x]`. Read-only on cards. Editable in the detail view, which goes through `scratch set`. |
| `PropertiesPanel` | definition list + **Select** (kind, scope), `ImportanceMeter`, **Popover**+**Calendar** (expires), TaskUI `TagInput`, **Command** combobox (owner from the roster), **Input** (source) | Unknown keys are listed read-only under "Other fields (kept as-is)". |
| `BodyEditor` | Markdown editor (CodeMirror 6 or Milkdown; decide in the tech spec) | A memory is **append-only until G1 lands**, so the editor posts to `mesh_memory_append`. A scratch is a full replace. |
| `BulkActionBar` | sticky bar + **Button** group + **AlertDialog** | Shows "n selected". Actions: set importance, set kind, add tag, forget. The forget confirmation names the count and says "Permanent: files are deleted, no trash". |
| `DeferredDelete` | **Sonner** toast with Undo | Hold the `forget` / `clear` call for 5 s before dispatching. This gives undo without a trash, which mesh forbids (`AGENTS.md` §6). |
| `FacetRail` | **Collapsible** groups + **Checkbox** + counts | Facets: kind, scope, owner, project *(PR #11)*, importance ≥, show expired, show superseded. |
| `EmptyState`, `Skeleton`, `Alert` banners | **Skeleton**, **Alert** | Four distinct states: disabled space, empty, filtered empty, all hidden (§3.1). |
| Command palette entries | **Command** (cmdk) | Entries: "Recall…", "Forget expired memories", "Go to agent…", "New memory", "Promote scratch to memory". |

---

## 5. (d) Gaps in the mesh memory and scratch model that block this UX

Priority means priority for the Shards prototype and v1. Each **C** needs a spec change through the `spec` skill (`AGENTS.md` §0.4).

| # | Gap | Evidence | UX it blocks | Proposal | Tier / priority |
|---|---|---|---|---|---|
| G1 | **No memory body-replace verb.** `UpdateMemory` has no body field, and `append` is the only body write. | `src/domain/memories.rs:67-76,416-426`; same for notes (`research/codebase.md` §2.7) | A real editor. Typo fixes. Trimming an agent-written memory. | Add `body: Option<String>` to `UpdateMemory`, or a separate `memory set_body`. Recompute `related` in `amend` (`:401-404`). Share the design with notes. | C · **P0** |
| G2 | **`private` scope is only a courtesy filter, and it is applied inconsistently.** `list` and `recall` filter by `is_visible_to(me)`; `get` and `summary` do not; nothing can bypass it. | `src/model/memory.rs:11,86-90`; `src/domain/memories.rs:550,688` vs `:490-501,558` | The operator cannot list an agent's private memories but can open one by id, which is confusing. On the remote server it is a **data leak**, because identity is self-asserted (`AGENTS.md` §6). | (a) An `ignore_scope` operator option on `list` for the UI surface. (b) The remote server enforces scope by token subject (`research/codebase.md` §2.6), and `get` applies the same check there. (c) Document that `get` ignores scope. | C · **P0** |
| G3 | **No edit history or edit provenance.** No `updated_by`. `owner` is reassignable, which loses the original author. | `src/domain/memories.rs:477-480`; `AGENTS.md` §6 says versioning is the owner's job | Mem0-style history (docs.mem0.ai/api-reference/memory/history-memory), "who changed this". | **Spec conflict.** Do not build history into mesh. (1) The Tauri host shows `git log -p` for the file when the vault is a git repo, and the sync layer keeps versions (`research/sync.md`). (2) Optionally add one small owned field, `updated_by` (actor of the last write), stamped in `amend`. | C (small) + host · P1 |
| G4 | **Supersession is incomplete.** It is forward-only (`superseded_by`), with no reverse index (fine: derived). `supersede` has no MCP or CLI verb of its own. It **does not validate that `by` exists**. Nothing clears it. | `src/domain/memories.rs:371-378`; `src/cli/memory.rs:203` | "Mark as replaced by existing", "Restore", and a trustworthy chain view. | Expose `memory.supersede(target, by)` on the UI surface, validating `by`. Add `memory.unsupersede(target)`, which sets null. Keep the reverse chain derived. | B + C · P1 |
| G5 | **No archive or pause state** (OpenMemory states, Devin enable/disable). | No such field in `MEMORY_FIELDS` (`src/model/memory.rs:15-30`) | "Hide without deleting" and "temporarily stop recalling". | The workaround is `expires = now` (hides from list and recall) and `expires none` (restores). **Hazard:** `forget --expired` hard-deletes these (`src/domain/memories.rs:754-775`). Decide in the PRD: either an `archived` boolean excluded from recall and from the expired sweep, or a label it as "Expired = archived; sweeping deletes". | C · P2 |
| G6 | **Recall is opaque.** The final score overwrites the match score. The engine `mode` is discarded. Filtered-out candidates vanish. | `src/domain/memories.rs:665,675-700` | The Recall playground breakdown and the "why not recalled" list. | `RecallOpts.explain: bool` returns `{match, importance_weight, recency_weight, engine, excluded:[{id, reason}]}`. Until then, mirror the formula on the client and diff against `mesh_search` (§3.3). | C · P1 |
| G7 | Recall never returns superseded memories, and there is no opt-in. | `src/domain/memories.rs:686-690` | Auditing in the playground. | Keep it, since it is by design. The playground shows superseded matches from the `mesh_search` diff. | — |
| G8 | **No last-used / use count.** This is deliberate. | `docs/concepts.md:74-78` | "Never recalled → candidate to forget" hygiene (Devin "misleading knowledge"). | **Spec conflict. Do not add it to the vault.** Option: the remote MCP server writes an access log to its own store (OpenMemory `MemoryAccessLog` pattern), never touching files. Local stdio stays pure. | Spec decision · P2 |
| G9 | Bulk operations are per-entity and non-atomic. `forget_expired` is global only. | `src/domain/memories.rs:754`; single-entity rule in `AGENTS.md` §6 | Per-owner bulk forget, bulk re-tag. | Keep it single-entity. The UI loops and reports partial success. `forget_expired` could take a `Filter` later. | B now · C P2 |
| G10 | `source` and `owner` cannot be cleared, because update only inserts strings. | `src/domain/memories.rs:464-480` | Fixing wrong provenance. | Accept null, as `expires: Option<Option<_>>` already does (`:74`). | C · P1 |
| G11 | **Scratch tags have no write path.** | `src/domain/scratch.rs:81-83,95-123` | Tagging or filtering working state. | Add `tags` to `scratch set`, or a `scratch update`. | C · P2 |
| G12 | Scratch `name` is stored as a slug, so the display name is lost. There is no rename and no move between agents. | `src/domain/scratch.rs:20-29,63-66` | Human-friendly titles and handoff from agent A to agent B. | Store a `title` key (it round-trips as unknown today). Add `scratch move(agent, name, to_agent, to_name)`. | C · P2 |
| G13 | **No optimistic concurrency.** `scratch set` and memory `amend` are last-write-wins under the lock, with no version precondition. | `src/domain/scratch.rs:95-123`; `src/domain/memories.rs:386-413` | A human editing a live agent scratch (Letta warns "last write wins" for blocks too, docs.letta.com memory-blocks), and an edit dialog left open for minutes. | An `if_updated: <rfc3339>` (or content-hash etag) precondition that returns a `conflict` kind (409) on mismatch. It is cheap: the read already happens inside the lock. | C · **P0** |
| G14 | **The "scratch is nobody else's" rule is not enforced.** Any caller can pass `agent`. | `src/mcp/tools.rs:783-790`; `src/mcp/instructions.rs:20` | Trust on the remote/multiplayer server. | The remote server binds `agent` to the token subject and allows human operators through a role. The local UI writes as the human and appends with a `timestamp` so the actor is visible. | Server policy · **P0** (remote) |
| G15 | The MCP `scratch_list` payload omits `bytes`, which only the CLI adds. | `src/model/scratch.rs:11-12,22`; `src/cli/scratch.rs:210-217` | Size column and column totals. | Emit `bytes` in the UI dispatch payload (and in MCP; this is additive). | B · P0 (trivial) |
| G16 | **No identity model.** Identities are bare strings. The roster is a string list. The census counts task owners and claimers only. There is no human/agent kind, display name or avatar. | `src/config.rs:58,243`; `src/domain/owner.rs:10-21`; `src/domain/lenses.rs:481-528` | The human/agent badge, Agents overview, assignee pickers, and the remote OAuth subject → identity mapping. | An `[identities.<id>]` config table with `kind = "human"\|"agent"`, `display_name`, `color`, `avatar`. Keep `tasks.collections` as the validity roster or derive it from the table. Extend the census to memories and scratch. | C · **P0** |
| G17 | **No change feed.** | `research/codebase.md` §2.6 (the watcher is CLI-only, `src/cli/watch.rs`) | Live dots, "agent is writing", and external-edit reloads. | A library `watch(cfg, cb)` emitting `{space, id/agent+name, path, kind}`. It is shared with the task UI. | C (refactor) · **P0** |
| G18 | Activity excludes memories and scratch by default. Scratch rows through `recent_activity_in` are untested (scratch has no `id`). | `src/domain/activity.rs:17,114-136` | "Last seen" per agent. | Compose on the client now. Later, add a scratch-aware activity row. | B · P1 |
| G19 | **Trap:** `Filter::default()` and MCP defaults cap at 20. | `src/domain/select.rs:92,100` | Silent truncation in every list. | The UI dispatch always uses `unbounded()` and paginates on the client. | — (rule) |
| G20 | Invalid memory files are skipped silently by `list` and reported as not-found by `get`. | `src/model/memory.rs:142-148`; `src/domain/memories.rs:721-722` | A hygiene view. | Show the "n unreadable files" banner from `rows()` (§3.1). Repair by opening the file in an editor, or `forget`, which never validates. | B · P2 |
| G21 | Hard delete with no trash, by design. | `AGENTS.md` §6 | Undo. | Client-side `DeferredDelete` (5 s), plus git or sync history. | — (UX rule) |
| G22 | *(PR #11)* `ListMemoryOpts` has no `project`. | `PR #11 src/domain/memories.rs:58,75,100` (new, update and recall only) | Project facet in the list. | Use `Filter::with_extra("project", …)`, or add an `opts.project` for symmetry with recall. | B · P1 |

### 5.1 Minimal verb additions, in build order

1. **P0, prototype-blocking.**
   - `memory.update{body}` (G1).
   - `if_updated` precondition on memory update and append and on scratch set and append (G13).
   - `ignore_scope` on `memory.list` for the UI surface (G2).
   - `[identities]` config (G16).
   - Library `watch` (G17).
   - `bytes` in the scratch list payload (G15).
2. **P1.**
   - `memory.supersede` with validation, and `memory.unsupersede` (G4).
   - `recall.explain` (G6).
   - Nullable `source` and `owner` (G10).
   - Optional `updated_by` stamp (G3).
   - Project option on list (G22).
3. **P2.**
   - Archive state (G5).
   - Scratch tags, title, move (G11, G12).
   - Filtered `forget_expired` (G9).
   - Server-side access log (G8).

All destructive verbs stay off the MCP surface (`src/mcp/mod.rs:218-221`). They ship only through `Api::dispatch` with `Surface::Ui` (`research/codebase.md` §2.7).

---

## 6. Sources

Web (fetched 2026-10-15 via Exa):

ChatGPT
- https://help.openai.com/articles/8590148-memory-faq
- https://help.openai.com/en/articles/8590148-memory-in-chatgpt
- https://help.openai.com/en/articles/11146739-how-does-reference-saved-memories-work

Claude (claude.ai)
- https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context
- https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects
- https://support.claude.com/en/articles/12260368-use-incognito-chats
- https://support.claude.com/en/articles/12123587-import-and-export-your-memory-from-claude

Claude Code
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/interactive-mode
- https://code.claude.com/docs/en/tools
- https://code.claude.com/docs/en/agent-sdk/todo-tracking

Mem0 and OpenMemory
- https://docs.mem0.ai/platform/features/entity-scoped-memory
- https://docs.mem0.ai/api-reference/memory/history-memory
- https://docs.mem0.ai/api-reference/memory/get-memories
- https://docs.mem0.ai/platform/features/v2-memory-filters
- https://mem0.ai/blog/how-to-make-your-clients-more-context-aware-with-openmemory-mcp
- https://github.com/mem0ai/mem0/blob/ece7ff6b/openmemory/ui/hooks/useMemoriesApi.ts
- https://github.com/mem0ai/mem0/tree/main/openmemory

Letta
- https://docs.letta.com/v1-sdk/ade
- https://docs.letta.com/v1-sdk/memory/memory-blocks/index.md
- https://docs.letta.com/v1-sdk/memory/archival-memory/index.md
- https://www.letta.com/blog/introducing-the-agent-development-environment/

Zep
- https://help.getzep.com/facts
- https://help.getzep.com/graph-visualizer-assistant.md
- https://blog.getzep.com/knowledge-graph-explorer/

Basic Memory
- https://docs.basicmemory.com/concepts/observations-and-relations
- https://docs.basicmemory.com/guides/ai-assistant-guide/
- https://github.com/basicmachines-co/basic-memory/blob/main/NOTE-FORMAT.md

GBrain
- https://github.com/garrytan/gbrain/blob/master/docs/protocol/MEMORY_VERBS_v1.md
- https://github.com/garrytan/gbrain/blob/master/README.md
- https://github.com/garrytan/gbrain/blob/master/docs/tutorials/connect-coding-agent.md

Devin
- https://docs.devin.ai/product-guides/knowledge
- https://docs.devin.ai/product-guides/session-insights
- https://docs.devin.ai/work-with-devin/devin-session-tools
- https://docs.devin.ai/work-with-devin/interactive-planning
- https://docs.devin.ai/release-notes/2024

Cursor
- https://cursor.com/docs/agent/plan-mode
- https://cursor.com/changelog/2-2
- https://cursor.com/changelog/1-4
- https://cursor.com/changelog/1-7
- https://cursor.com/docs/agent/agents-window

Linear
- https://linear.app/developers/agent-interaction
- https://linear.app/developers/agents
- https://github.com/agentconnect-md/agentconnect/blob/2671ed6b/docs/designs/linear-integration.md

Agent kanban startups
- https://kanbrio.com
- https://loopertask.com

shadcn/ui
- https://ui.shadcn.com/docs/components (data-table, sheet, resizable, avatar, badge, hover-card, tooltip, toggle-group, progress, alert-dialog, command, sonner, skeleton, collapsible, checkbox, select, calendar, popover)

Code (read-only), HEAD:
- `src/model/memory.rs`, `src/model/scratch.rs`
- `src/domain/memories.rs`, `src/domain/scratch.rs`, `src/domain/owner.rs`, `src/domain/lenses.rs`, `src/domain/activity.rs`, `src/domain/select.rs`, `src/domain/context.rs`
- `src/mcp/mod.rs`, `src/mcp/schema.rs`, `src/mcp/tools.rs`, `src/mcp/instructions.rs`
- `src/cli/memory.rs`, `src/cli/scratch.rs`
- `src/config.rs`, `docs/concepts.md`, `AGENTS.md`

Code, PR #11:
- `src/model/memory.rs`, `src/domain/memories.rs`, `src/mcp/schema.rs`, `src/cli/dashboard.rs`

Prior research:
- `scratchpad/research/codebase.md` §2.3–2.7
- `scratchpad/research/market.md` §3–4
- `scratchpad/research/taskui.md` §4–5
