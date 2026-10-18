# Codebase research: embedding mesh in Shards, and the rename blast radius

Repo: `~/.villain-worktrees/villain-mesh-improvements/mesh`. Branch `villain/mesh-improvements`, at `5f1d6f4` (the same commit as `main`). Date: 2026-10-15. This research did not edit the repo. All build experiments ran on `git archive` copies under `scratchpad/build/`.

---

## 0. Headline findings

1. **The repo does not build on this Mac at HEAD.** `cargo build` fails with two `E0308` errors at `src/storage/atomic.rs:34` and `src/storage/atomic.rs:42`. The cause is that macOS `mode_t` is `u16`, but the code passes `u32` to `rustix::fs::Mode::from_bits` and `.bits()`. CI for `main` (#10) also failed: GitHub Actions run `34890061715`, 2026-09-14.
2. **Open PR #11 ("bundled feature updates", branch `fix/vault-adoption-honesty`) is 38 commits and about 7.3k lines ahead of HEAD.** It touches 50 files and passes CI (run `36868732564`, 2026-10-01). It fixes the macOS build (`e4bc8c6`, `2f6dab8`) and makes the test fixtures hermetic (`9cf4937`). It also adds three things:
   - note adoption plus note claim/release, which brings the MCP surface from 37 to 40 tools;
   - a `project` field on memories;
   - a ratatui dashboard whose `DashFrame` snapshot is already a UI view model.

   **Recommendation: merge or rebase onto PR #11 before any Shards work.** A facade or rename written against HEAD would be stale immediately and would conflict across 50 files.
3. **The dispatcher Shards needs already exists.** `mcp::tools::Server::call(name: &str, arguments: &Json) -> Result<Outcome>` (`src/mcp/tools.rs:222`) is a `dispatch(cmd, args_json) -> Result<json>`. Extract it into a core crate rather than writing a new one. The UI then needs about six extra commands that MCP withholds on purpose: delete, forget, clear, status, and force-release.
4. **The existing spec conflicts with the product pivot.** These conflicts must become spec amendments first (see §6).
   - `AGENTS.md` §8 says to never add git-sync logic.
   - `AGENTS.md` §2 says sync is "the vault owner's job, never mesh's".
   - `AGENTS.md` §6 says identity "is not a security boundary and must not be treated as one if mesh ever crosses a multi-user … trust line".
   - `AGENTS.md` §0 says any new verb or field "needs a spec change and an explicit sign-off".
5. **The task model is agent-coordination-shaped, not Todoist-shaped.** It has no due, scheduled or start dates, no recurrence, no subtasks or parent, no sections or ordering, no in-progress status, and no `completed_at`. There is a cheap escape hatch: unknown frontmatter keys round-trip in place (`src/domain/tasks.rs:321`, test `update_round_trips_unknown_keys_and_absent_optionals`). A UI can write `due:` today without breaking the CLI. It cannot filter or sort on it, though, because `Filter.extra` is exact-match only.

---

## 1. Build and test baseline

The toolchain is Homebrew `rustc 1.98.1` and `cargo 1.98.1` on arm64. **rustup is not installed, so `rust-toolchain.toml` (`channel = "1.94.1"`) is silently ignored.**

| Target | Build | Tests | Time |
|---|---|---|---|
| **HEAD, in the repo, as asked** | **FAIL**: 2× E0308 in `src/storage/atomic.rs` | none ran (the lib does not compile) | build 17 s, test 7 s |
| HEAD plus the 2-line atomic.rs patch from PR #11 (scratch copy) | OK (32 s cold) | **1277 passed, 8 failed** in 20 test binaries (`--no-fail-fast`) | 46 s |
| PR #11 branch (scratch copy) | OK (25 s cold) | **1407 passed, 0 failed** in 21 binaries | 95 s (includes test compile) |

The 8 failures on patched HEAD fall into three groups.

- **Non-hermetic environment: an `indexed` binary is installed at `~/.local/bin/indexed`.** No `MESH_*` variables are set. These tests assume `indexed` is absent, and PR #11's "hermetic fixtures" commit fixes them:
  - `a_missing_indexed_binary_is_one_notice_not_a_failure`
  - `health_reports_a_missing_binary_last`
  - `the_example_config_loads_through_from_table`
  - `session_start_matches_the_python_golden`
  - `a_live_lock_exits_four_within_the_wait_budget_rather_than_hanging`
- **Real behavior failures on macOS, all in `cli::watch::tests`.** Example: `left: …/notes/n-BBBB.md`, `right: …/notes/decisions/n-BBBB.md`, which means the misfiled-note move did not happen. All three pass on PR #11. The root cause was not investigated.
  - `a_misfiled_note_moves_into_its_type_folder`
  - `a_misfiled_task_moves_and_keeps_its_bytes`
  - `a_contended_entity_is_left_for_a_later_event`

The minimal fix PR #11 applies to `src/storage/atomic.rs`:

```rust
-    0o666 & !current.bits()
+    0o666 & !u32::from(current.bits())
...
-    let Some(mode) = rustix::fs::Mode::from_bits(mode) else { return; };
-    let _ = rustix::fs::fchmod(file, mode);
+    let _ = file.set_permissions(std::fs::Permissions::from_mode(mode));
```

Logs: `scratchpad/research/cargo_test.log` (HEAD in the repo), `scratchpad/build/head-test-nff.log`, and `scratchpad/build/pr11-test.log`.

---

## 2. Part A: embedding as a library (Tauri app and HTTP server)

### 2.1 Crate shape

- `Cargo.toml` defines a single package, `mesh` v0.2.0, edition 2021, `rust-version = "1.94"`.
- It builds `[lib] name="mesh"` and two binaries: `mesh` (`src/main.rs`) and `mesh-mcp` (`src/bin/mesh-mcp.rs`, which calls `mesh::mcp::serve_stdio()`).
- `src/lib.rs` exports every module as `pub`: `cli, config, ctx, domain, error, fm, ids, mcp, model, render, search, spaces, storage, text, timefmt`. It also re-exports `MeshError` and `Result`.
- The code is sync only, with no tokio. It uses `#![forbid(unsafe_code)]`, and `unwrap`, `expect` and `panic` are denied in `src/`.
- Dependencies:
  - CLI: clap and clap_complete.
  - Core: yaml-rust2, serde_json (with `preserve_order`), indexmap, toml and toml_edit, chrono, sha2, rustix, walkdir, notify and notify-debouncer-full, dirs, thiserror, which, tempfile.
  - PR #11 adds ratatui and crossterm.

### 2.2 Constructing a context

- **`Config`** (`src/config.rs:64`) has the fields `core: CoreConfig {vault_path, agent}`, `search: SearchConfig`, `tasks: TasksConfig {collections, strict}`, and `spaces: Spaces`.
  - `load_config(flag: Option<&Path>, vault_flag: Option<&Path>) -> Result<Config>` (`config.rs:165`). Config path resolution: `--config`, then `$MESH_CONFIG_PATH`, then `~/.mesh/config.toml` (`config.rs:98-111`).
  - `from_table(&toml::Table, vault_flag) -> Result<Config>` (`config.rs:178`). This is the seam for building a config in memory, which suits Tauri, the server, and tests. Vault resolution order: vault flag, then `$MESH_VAULT`, then `[core].vault_path`, then the legacy `path` or `tolaria_path` keys. Agent resolution: `$MESH_AGENT`, then `[core].agent`.
  - `Config::with_agent(Option<&str>) -> Config` clones the config with a different acting identity (`config.rs:83`). **This is the per-request identity hook the HTTP server needs:** use the OAuth subject as the agent.
  - `Config::root(Space) -> Result<&Path>`, `Config::agent()`, and `Config::vault()`.
  - Test helper: `config::test_support::config_for(&Path) -> Config` (`config.rs:363`).
- **`Spaces`** (`src/spaces.rs:84`):
  - `Spaces::resolve(vault: &Path, settings: &[(Space, SpaceSetting)]) -> Result<Spaces>`.
  - `Space` is one of `{Notes, Tasks, Memories, Scratch, Assets}`. Id prefixes are `n- t- m- a-`; scratch has none.
  - `SpaceSetting` is one of `{Default, Disabled, Path(String)}`.
  - The sandbox is the union of the enabled roots. `safe_resolve` rejects traversal and symlink escapes.
- **`Ctx`** (`src/ctx.rs:14`) wraps a `OnceCell<Config>`, `g: cli::globals::GlobalOpts` and `tty`. Constructors are `Ctx::new(GlobalOpts)` and `Ctx::with_config(GlobalOpts, Config, tty)`. It provides `actor()`, which returns the `--owner` value, else `[core].agent`. **Ctx is CLI-coupled** because it imports `GlobalOpts` from `cli`. Domain functions do not need a Ctx; they all take `&Config`.

### 2.3 Domain entry points (`src/domain/*.rs`, HEAD)

All of these take `cfg: &Config`. `View<T> = {item: T, body: String, path: PathBuf}` (`fm`).

**Tasks** (`domain/tasks.rs`)
- `create(cfg, title: &str, o: NewTask) -> Result<Task>` (L242). `NewTask {priority: Option<String>, tags: Vec<String>, owner, body: String, project: Option<String>, blocks: Vec<String>, blocked_by: Vec<String>}`.
- `update(cfg, id, o: UpdateTask) -> Result<Task>` (L297). `UpdateTask {priority, tags: Option<String> /* tag-spec "+a,-b" or replace */, title, project, owner, blocks: Option<Vec>, blocked_by: Option<Vec>}`.
- `append(cfg, id, text, o: AppendOpts) -> Result<Task>` (L370). `AppendOpts {section: Option<String>, timestamp: bool, actor: Option<String>}` (`domain/mod.rs:22`).
- `claim(cfg, id, claimer: &str, strict: bool) -> Result<(Task, Vec<String> /*unsatisfied*/)>` (L396).
- `release(cfg, id, releaser: &str, force: bool) -> Result<Task>` (L438).
- `terminate(cfg, id, kind: Terminal::{Finish,Cancel}, text: Option<&str>, actor: Option<&str>) -> Result<(Task, Vec<String> /*newly ready*/)>` (L467).
- `get(cfg, id) -> Result<View<Task>>` (L514).
- `list(cfg, f: &Filter, av: Availability::{Any,Available,Ready,Blocked}) -> Result<Vec<View<Task>>>` (L525). The body is empty in list views.
- `delete(cfg, id) -> Result<String>` (L563). This is a hard unlink.
- `rows(cfg) -> Vec<Row>`, `find_duplicate_title(cfg, title) -> Option<String>`, `validate_priority`, `parse_status_csv`.

**Task dependencies** (`domain/deps.rs`)
- `block(cfg, id, on: &[String]) -> Result<(Task, Vec<Warning>)>` (L514).
- `unblock(cfg, id, on: &[String], all: bool) -> Result<(Task, Vec<Warning>)>` (L547).
- `next(cfg, f: &Filter, claim: bool, strict: bool, claimer: Option<&str>) -> Result<Option<View<Task>>>` (L642). It retries across up to 3 candidates on a claim conflict.
- `readiness(rows, id) -> Readiness {ready, unsatisfied, …}` (L137), plus `dependents`, `newly_ready`, `cycles`, `dangling_blockers`, `check_acyclic`, `effective_blockers`.

**Notes** (`domain/notes.rs`)
- `create(cfg, title, o: NewNote{note_type, tags, owner, body}) -> Result<Note>` (L191). Note types are `note|log|decision|reference|project` (`model/note.rs:10`).
- `update(cfg, target, o: UpdateNote{tags: Option<String>, new_type, title}) -> Result<Note>` (L267).
- `append(cfg, target, text, AppendOpts) -> Result<Note>` (L245).
- `get(cfg, target /*id or title slug*/) -> Result<View<Note>>` (L350).
- `get_foreign(cfg, target) -> Result<ForeignView>` (L386).
- `list(cfg, f, foreign: bool) -> Result<Vec<View<Note>>>` (L410) and `foreign_rows(cfg, f)` (L421).
- `delete(cfg, target) -> Result<String>` (L430), `rows`, `find_duplicate_title`, `resolve`, `note_folder`.
- PR #11 adds `adopt(cfg, targets: &[PathBuf], owner) -> Result<Vec<Adopted>>`, `claim(cfg, target, claimer) -> Result<Note>`, `release(cfg, target, releaser, force) -> Result<Note>`, `foreign_count`, and `find_foreign`.

**Memories** (`domain/memories.rs`)
- `create(cfg, title, NewMemory) -> Result<Memory>` (L281) and `create_with_warnings(...) -> Result<(Memory, Vec<String>)>` (L286). `NewMemory {kind, scope, importance: Option<i64>, source, expires: Option<DateTime<Utc>>, supersedes, tags, owner, body}`.
- `update(cfg, target, UpdateMemory{tags, title, kind, scope, importance, source, expires: Option<Option<DateTime>>, owner}) -> Result<Memory>` (L430).
- `append(cfg, target, text, AppendOpts) -> Result<Memory>` (L416).
- `supersede(cfg, target, by) -> Result<Memory>` (L371).
- `get(cfg, target) -> Result<View<Memory>>` (L490).
- `list(cfg, f, o: &ListMemoryOpts{kind, scope, min_importance, include_expired, include_superseded}) -> Result<Vec<View<Memory>>>` (L532).
- `recall(cfg, query, f, o: &RecallOpts{limit, threshold, decay, include_expired, min_importance, meta_only, full}) -> Result<Vec<search::Hit>>` (L663).
- `forget(cfg, target) -> Result<String>` (L723), `forget_expired(cfg) -> Result<Vec<String>>` (L754), `expired_ids`, `session_picks(cfg, me, cap)`, `summary`, `parse_expires`, `recall_score`.

**Scratch** (`domain/scratch.rs`). Scratch is addressed by agent plus name; files live at `<scratch>/<agent-slug>/<name-slug>.md`.
- `set(cfg, agent, name, body) -> Result<Scratch>` (L95).
- `append(cfg, agent, name, text, AppendOpts) -> Result<Scratch>` (L125).
- `get(cfg, agent, name) -> Result<View<Scratch>>` (L147).
- `list(cfg, agent: Option<&str>, all: bool, f: &Filter) -> Result<Vec<View<Scratch>>>` (L162).
- `clear(cfg, agent, name) -> Result<String>` (L221) and `summary(cfg)`.

**Assets** (`domain/assets.rs`)
- `add(cfg, src: &Path, NewAsset) -> Result<AddOutcome>` (L210).
- `get(cfg, id) -> Result<View<AssetSidecar>>` (L119), `list(cfg, f, media: Option<&str>)` (L151), `blob_path` (L137).
- `attach(cfg, id, target, section)` (L437), `detach` (L487), `references`, `remove(cfg, id, force)` (L545).
- `gc(cfg, apply)` (L649) and `summary`.

**Lenses, context and activity**
- `activity::recent_activity(cfg, since: Option<&str>, owner: Option<&str>, mine: bool, limit: i64) -> Result<Vec<Json>>` (`activity.rs:115`) and `recent_activity_in(..., spaces)`.
- `context::build_context(cfg, seed, depth) -> Result<Vec<Json>>` (L315).
- `context::graph_query(cfg, seed, depth, dir: "out"|"in"|"both") -> Result<GraphResult>` (L330), which has `.to_json()`.
- `context::inbound_ids` and `resolve_entry`.
- `lenses::project_view(cfg, project_id) -> Result<Json>` returns `{"project": node, "tasks": [...]}` (`lenses.rs:45`).
- `lenses::status_report(cfg) -> Json` (`lenses.rs:400`). It is read-only and covers note count, task counts by status, freshness, dangling links, stale locks, the vault, and more.
- `lenses::session_mentions`, `session_start_entries`, and `scan_stale_locks`.

**Search** (`search/mod.rs`)
- `query(cfg, q, &SearchFilter) -> Result<(Vec<Hit>, Mode)>` (L152).
- `tag_pull(cfg, &SearchFilter)` (L186), `health(cfg) -> Json` (L191), `resolve_spaces`, `resolve_effective_threshold`, `fill_full_bodies`, `emit_space_key`.
- `Hit {id, type, title, score, tags, owner, updated, snippet, path, space}`.

**Selection** (`domain/select.rs`)
- `Filter {tags: Option<Vec>, any_tag, owner, mine, me, cutoff, stale_cutoff, sort: SortKey, limit: Option<i64> /*default Some(20)!*/, extra: Vec<(key, Vec<values>)>}`.
- `Filter::unbounded()`, `.with_extra(key, Option<&str>)`, `.with_extra_any(key, Option<&[String]>)`.
- `SortKey` is one of `{Updated, Created, Title, Priority, Importance, Bytes}`.
- Note that `Filter::default()` sets `limit: Some(20)`. A UI must use `unbounded()`.

**Wikilinks:** `title_index`, `resolve_wikilinks`, `find_dangling`, `backlinks_by_title`.

### 2.4 JSON payload shapes (`src/render.rs`, `src/model/*`)

- **`render::entry(meta, order, body: Option<&str>, path: Option<&Path>) -> Json`** (`render.rs:42`) builds every entity payload in this order:
  1. the owned keys, in model declaration order;
  2. unknown frontmatter keys, in file order (they round-trip);
  3. `body`, if requested;
  4. `path`, which is an **absolute** filesystem path.

  Timestamps (`created`, `updated`, `expires`) are rendered as RFC 3339 `…Z`.
- Field orders:
  - **Task** (`model/task.rs:20`): `id, type("task"), title, tags, owner, created, updated, related, status, priority, claimed_by, project, blocks, blocked_by`.
    - MCP `task_get` adds `ready: bool`.
    - `task_claim` adds `blocked_by_unsatisfied`.
    - finish and cancel add `unblocked: [ids]`.
    - create adds `warnings: []`.
  - **Note** (`model/note.rs:13`): `BASE_FIELDS = id, type, title, tags, owner, created, updated, related`. PR #11 adds note claim fields.
  - **Memory** (`model/memory.rs:15`): base fields plus `kind, scope, importance, source, expires, superseded_by`. PR #11 adds `project`.
    - Defaults: kind `fact`, scope `shared`, importance 3 (range 1..5).
    - A `private` scope is a courtesy filter, not authorization.
  - **Scratch** (`model/scratch.rs:12`): `type("scratch"), name, agent, tags, created, updated`. The typed struct also has `bytes`.
  - **Asset** (`model/asset.rs:10`): base fields plus `filename, media_type, bytes, sha256, blob`.
- Other shapes:
  - **Activity row** (`render.rs:66`), exactly 7 keys: `id, type, title, path, mtime(f64 epoch), owner, claimed_by`.
  - **Search hit** (`render.rs:88`): `id, type, title, score, path, [tags], [owner], [updated], [snippet], [space], [mode]`.
  - **MCP wrapper** (`mcp/errors.rs:30`): `{content:[{type:"text",text}], structuredContent}`. Lists are wrapped as `{"result":[...]}`.

### 2.5 Error type (`src/error.rs`)

- `MeshError` (thiserror) has these variants: `Validation(String)`, `NoteNotFound | TaskNotFound | MemoryNotFound | AssetNotFound | ScratchNotFound | SeedNotFound | ProjectNotFound`, `Empty`, `AmbiguousSlug{slug, ids}`, `ClaimConflict{task_id, existing_owner}`, `Lock(String)`, `Blocked{task_id, blockers}`, `ConfigMissing{path}`, `Io`, `Aborted`, and two wrappers, `WithCandidates{inner, candidates}` and `Partial{inner, detail}`.
- `code()` maps to exit codes: 1 for io and aborted, 2 for validation, 3 for not found, 4 for claim or lock conflicts, 5 for blocked.
- `kind()` returns one of `config_missing | claim_conflict | lock_conflict | ambiguous_slug | not_found | validation | blocked | io_error | error`.
- `next_action()` and `structured()` supply extra fields.
- **`cli::out::error_envelope(&MeshError) -> Json`** (`cli/out.rs:135`) produces `{kind, message, next_action, <structured…>, candidates?, retry_after_ms?}`. This is a good wire format for Tauri `invoke` rejections and HTTP error bodies. Map HTTP status from `kind`: `not_found`→404, `validation`→422, `claim_conflict`/`lock_conflict`→409, `blocked`→423 or 409, `config_missing`→503.
- Some messages embed CLI wording, for example the `config_missing` text "run `mesh init`" (`error.rs:9-17`). The UI should key off `kind`, not `message`.

### 2.6 Reusable versus CLI-coupled

**Reusable as-is:** `config`, `spaces`, `domain::*`, `model::*`, `render`, `fm`, `storage`, `search`, `ids`, `text`, `timefmt`, and `error`. All are pure functions over `&Config`. The writes are atomic (temp file then rename), take one lock per entity, re-resolve the target inside the lock, and are idempotent.

**The five edges from non-CLI code into `crate::cli`.** These are the cut list for a `shards-core` crate:
1. `src/ctx.rs:5` → `cli::globals::GlobalOpts`. Move it to core or replace it with a plain `Identity`/`Opts` struct.
2. `src/mcp/tools.rs:12-13` → `cli::globals::GlobalOpts` and `cli::task::TASK_SORT_KEYS`.
3. `src/mcp/tools.rs:606` → `cli::task_dep::NO_READY_TASK`.
4. `src/mcp/errors.rs:9` → `cli::out::error_envelope`. Move the envelope builder next to `error.rs`.
5. `src/search/health.rs:37` and `src/domain/lenses.rs:478` → `cli::watch::watcher_pid`. Move the watcher pid and lock helpers into `storage` or a `runtime` module.

**Other coupling and risks for an embedded or long-running host:**
- **Unix-only.** `rustix` (flock, kill, umask) and `std::os::unix` appear in `storage/atomic.rs`, `storage/lock.rs` and `domain/assets.rs:191`, and `cli/admin.rs:671` uses `kill`. **A Windows Tauri build will not compile** without `cfg(windows)` paths, for example `fs4` for locks and a no-op chmod. macOS and Linux are fine once PR #11 is merged.
- **Config is re-read on every MCP call.** `Server::ctx` calls `load_config` per call (`mcp/tools.rs:208`). That is fine for stdio. A Tauri or HTTP host should hold an `Arc<Config>` and reload it when the file changes.
- **Every list is a full disk scan.** `tasks::rows` reads frontmatter for every file in `open/` and `done/` (`tasks.rs:571`).
- **`tasks::list` Ready and Blocked is O(n²).** It calls `deps::readiness(&snapshot, id)` once per row (`tasks.rs:532-552`), and `readiness` rebuilds `index(rows)` on every call (`deps.rs:137-138`). The same applies to the MCP `task_get` `ready` flag. At Todoist scale (thousands of tasks, many done), build the index once per list. This is a small fix: an `index` built once and a `readiness_in(&nodes, id)`.
- **No change feed.** The UI needs push updates. `cli/watch.rs` already uses `notify` and `notify-debouncer-full` with a debounced watcher. Extract it as a library-level `watch(cfg, callback)` that emits `{space, id, path, kind}` events, and the Tauri host can forward them as `emit("vault-changed")`. External edits (Obsidian, git pull, sync) arrive the same way.
- **Absolute `path` in every payload.** That is fine locally. For remote sync and HTTP, add a vault-relative `rel_path` and strip absolute paths at the server boundary, because they leak the host layout.
- **Identity is a claim, not authentication.** The core trusts whatever `claimer`, `owner` or `agent` string it is given. The HTTP server must derive the identity from the OAuth token and must not take it from args. Use `cfg.with_agent(Some(sub))` and ignore or validate `owner`/`claimer` args against the token.
- **Hard delete with no trash** (`AGENTS.md` §6). A consumer UI needs undo. Options are a soft-delete `.trash/` or keeping undo in the UI. Both need a spec change.
- **Panic safety.** `main.rs` catches panics, but a library host must do the same. `catch_unwind` around dispatch is cheap insurance, although the lints already deny unwrap.

### 2.7 Recommended facade: extract `Server::call` into `shards_core::api`

```rust
// shards-core/src/api.rs
pub struct Api { cfg: Arc<RwLock<Config>> }           // loaded once; reloaded by the watcher
pub struct Caller { pub identity: Option<String>, pub surface: Surface } // Surface::{Mcp, Ui, Remote}
impl Api {
    pub fn dispatch(&self, caller: &Caller, cmd: &str, args: &serde_json::Value)
        -> Result<serde_json::Value, ErrorEnvelope>;   // envelope = cli::out::error_envelope, moved
}
```

- `mcp::tools::Server::call` becomes `Api::dispatch` with `Surface::Mcp`. It keeps the MCP allow-list, so that list stays at 37 tools on HEAD and 40 on PR #11.
- `Surface::Ui` also allows the withheld verbs. The test `no_tool_name_contains_a_withheld_substring` (`mcp/mod.rs:208`) bans `delete`, `daemon`, `reindex`, `status`, `forget`, `remove` and `clear` from MCP names, so keep those UI-only.
- The core stays sync.
  - **Tauri:** a `#[tauri::command] async fn dispatch(state, cmd, args) -> Result<Value, Value>` that wraps `tauri::async_runtime::spawn_blocking(move || api.dispatch(...))`.
  - **HTTP server:** axum `POST /v1/rpc {cmd,args}` and/or REST routes, again with `spawn_blocking`.
- The existing `Args` helper (`mcp/tools.rs:86-170`) already gives typed argument reading with exact validation messages. Reuse it unchanged.

**Command map (about 27 commands for the UI).** Arg names are the existing MCP schema names where a tool exists.

| UI command | Existing MCP tool | Exact function |
|---|---|---|
| `task.list` | `mesh_task_list` | `tasks::list(cfg, &Filter{..}, Availability)`. Args: `ready / blocked / available / status(csv) / project / tags / owner / mine / since / stale / sort / limit` |
| `task.get` | `mesh_task_get` | `tasks::get` + `deps::readiness(&tasks::rows(cfg), id).ready` |
| `task.create` | `mesh_task_new` | `tasks::create(cfg, title, NewTask)` + `tasks::find_duplicate_title` |
| `task.update` | `mesh_task_update` | `tasks::update(cfg, id, UpdateTask)` |
| `task.append` (comment) | `mesh_task_append` | `tasks::append(cfg, id, text, AppendOpts)` |
| `task.claim` | `mesh_task_claim` | `tasks::claim(cfg, id, who, strict)` |
| `task.release` | `mesh_task_release` | `tasks::release(cfg, id, who, force=false)` |
| `task.release_force` | UI only | `tasks::release(cfg, id, who, true)` |
| `task.finish` | `mesh_task_finish` | `tasks::terminate(cfg, id, Terminal::Finish, outcome, actor)` |
| `task.cancel` | `mesh_task_cancel` | `tasks::terminate(cfg, id, Terminal::Cancel, reason, actor)` |
| `task.block` | `mesh_task_block` | `deps::block(cfg, id, &on)` |
| `task.unblock` | `mesh_task_unblock` | `deps::unblock(cfg, id, &on, all)` |
| `task.next` | `mesh_task_next` | `deps::next(cfg, &f, claim, strict, claimer)` |
| `task.delete` | UI only | `tasks::delete(cfg, id)` |
| `note.list` | `mesh_note_list` | `notes::list(cfg, &f, foreign)` |
| `note.get` | `mesh_note_get` | `notes::get(cfg, target)` (and `get_foreign`) |
| `note.create` | `mesh_note_new` | `notes::create(cfg, title, NewNote)` |
| `note.update` | `mesh_note_update` (+ `mesh_note_append`) | `notes::update(cfg, target, UpdateNote)`. **There is no body-replace verb.** The body can only be appended (`notes::append`). A UI editor needs a new `set_body` verb (see §3) |
| `note.delete` | UI only | `notes::delete(cfg, target)` |
| `memory.list` | `mesh_memory_list` | `memories::list(cfg, &f, &ListMemoryOpts)` |
| `memory.get` | `mesh_memory_get` | `memories::get(cfg, target)` |
| `memory.recall` | `mesh_memory_recall` | `memories::recall(cfg, query, &f, &RecallOpts)` |
| `memory.add` | `mesh_memory_new` | `memories::create_with_warnings(cfg, title, NewMemory)` |
| `memory.update` | `mesh_memory_update` (+ `mesh_memory_append`) | `memories::update(cfg, target, UpdateMemory)` |
| `memory.forget` | UI only | `memories::forget(cfg, target)` (+ `forget_expired`, `supersede`) |
| `scratch.list` | `mesh_scratch_list` | `scratch::list(cfg, agent, all_agents, &f)` |
| `scratch.get` | `mesh_scratch_get` | `scratch::get(cfg, agent, name)` |
| `scratch.set` | `mesh_scratch_set` (+ `mesh_scratch_append`) | `scratch::set(cfg, agent, name, body)` |
| `scratch.delete` | UI only | `scratch::clear(cfg, agent, name)` |
| `search` | `mesh_search` | `search::query` / `search::tag_pull` + `render::hit` |
| `status` | UI only (`mesh_health` covers search) | `lenses::status_report(cfg)` + `search::health(cfg)` |
| `activity` | `mesh_recent_activity` | `activity::recent_activity(cfg, since, owner, mine, limit)` |
| `project.get` | `mesh_project` | `lenses::project_view(cfg, project_id)` |
| `graph` / `context` | `mesh_graph` / `mesh_build_context` | `context::graph_query` / `context::build_context` |
| `session.start` | `mesh_session_start` | as in `mcp/tools.rs:1026` |
| `dashboard.snapshot` | PR #11 | `cli::dashboard::snapshot(cfg, mine) -> DashFrame` (`dashboard.rs:148`). Move it to `domain`: it is a ready-made home or overview view model (agents, tasks grouped by ready/blocked/claimed, activity, health) |

---

## 3. Task frontmatter: what exists versus what a Todoist-class UI needs

**Supported today** (`model/task.rs`, `domain/tasks.rs`):

| Field | Semantics |
|---|---|
| `status` | `open | claimed | done | cancelled` (`TASK_STATUSES`). Terminal statuses move the file to `tasks/done/`. `claimed` is set only by `claim` |
| `priority` | Writes accept only `high | normal | low` (`TASK_PRIORITIES`, `validate_priority`). Reads are free-form, and unknown values sort last |
| `tags` | A string list. Updates use the tag spec `+a,-b` or a full replace |
| `owner` | Accountability ("assignee"), validated against `[tasks].collections` |
| `claimed_by` | Who is actively working on it (a lease without expiry) |
| `project` | A free string, by convention a project-note id (`n-…`, type `project`). Filtering is exact string equality (`lenses.rs:50-55`) |
| `blocks`, `blocked_by` | A dependency DAG with cycle checks. Readiness is derived and never stored |
| `related` | Auto-derived from `[[wikilinks]]` in the body |
| `created`, `updated` | RFC 3339 UTC |
| body | Markdown. `finish` and `cancel` append `## Outcome` / `## Cancelled` with a stamp. `append` can target `## Section` (a comment-like log) |

**Not supported, but needed for parity with Todoist and obsidian-taskui.** The reference schema is obsidian-taskui `src/data/types/tasks.ts:33-50`: `priority lowest..highest`, `status todo|in-progress|done|cancelled`, `recurs`, `dueDate`, `scheduledDate`, `startDate`, `doneDate`, `blocks`, `subtasks`, `tags`, `path`.

| Missing | Notes and suggested shape |
|---|---|
| `due` (date or datetime, plus optional `due_time`, `tz`) | The most important gap. Needs a range filter (`due_before` / `due_after`), and sort keys `SortKey::Due` and `Scheduled` |
| `scheduled`, `start` | Supports the "Today" and "Upcoming" views; obsidian-taskui has both |
| `completed` (`done_at`) | Today only `updated` is bumped on finish. "Completed today" and karma views need a timestamp |
| `recurrence` (`rrule` string or Todoist-like "every mon") | `finish` on a recurring task must spawn the next instance or roll `due`. This is a new multi-file behavior, and the spec forbids cross-entity writes inside a verb, so it needs a spec decision |
| `parent` (subtasks) | `parent: t-…`, plus a derived child list. Alternatively, Markdown checklists in the body as lightweight subtasks |
| `section` and `order` (manual sort) | Needed for Board and List drag-and-drop. Use a fractional index string to avoid rewriting siblings |
| `in_progress` status, or the rule "claimed means in progress" | A human UI can map "claimed by me" to in progress. Decide this explicitly |
| 4-level priority (Todoist P1..P4) | Either widen `TASK_PRIORITIES` to `urgent|high|normal|low` (reads are already free-form), or map p1..p4 onto it |
| `labels` | Can be `tags`, so no new field is needed |
| `assignees` (many) | Only a single `owner` exists today |
| `reminders`, `duration`/`estimate` | Later |
| `comments` | Today these are `append` under `## Comments` with a stamp. Acceptable for v1 |
| `attachments` | Already exists: `assets::attach(id, target, section)` |
| Saved filters / views | Not present. Could be a config section or note type `view` |
| Undo / trash / history | Not present (hard delete by design) |
| Body replace for task, note and memory | Not present. The UI editor needs `set_body(id, body, expected_updated)` with an optimistic-concurrency check on `updated` |
| Project entity | Projects are notes of type `project`, and there is no project color, order, archive or sections. Either add fields to project notes or create a project space |

**Escape hatch.** Unknown keys are preserved in place on every write (`FieldOrder::reorder` keeps unknown keys after owned keys, `model/common.rs:35`). So `due:` and `parent:` written by the UI survive CLI updates today. To make them first-class, add them to `TASK_FIELDS`, the typed `Task` struct, `Filter` (range predicates, not only `extra` exact-match), and `SortKey`.

---

## 4. Part B: rename blast radius `mesh` → `shards`

Counts are taken on HEAD with `git grep` over tracked files. **Totals: 1600 case-insensitive occurrences in 97 files.**

| Directory | Occurrences | Files |
|---|---|---|
| `src/` | 590 | 50 |
| `tests/` | 480 | 25 |
| repo root (README, AGENTS.md, Cargo.toml, config.example.toml, …) | 145 | 7 |
| `plugins/` | 69 | 4 |
| `.spec/` | 61 | 5 |
| `docs/` | 23 | 1 |
| `scripts/` | 11 | 2 |
| `.github/` | 10 | 1 |
| `.claude-plugin/` | 5 | 1 |
| `hooks/` | 1 | 1 |

By category:

| Category | Count | Where |
|---|---|---|
| Crate and lib name | `Cargo.toml`: `name="mesh"` (package, lib, bin) | `Cargo.toml`; `use mesh::` / `mesh::` paths: 47 occurrences in 9 files (main.rs, bin, tests) |
| Bin names | `mesh`, `mesh-mcp` | `mesh-mcp`: 31 occurrences in 13 files; `src/bin/mesh-mcp.rs` filename; `cargo_bin("mesh…")` 8× in 6 test files |
| Error type | `MeshError` | 259 occurrences in 34 files. This is the only "mesh" substring in a longer word, so there are no false-positive words |
| Env vars | `MESH_CONFIG_PATH` 31, `MESH_AGENT` 24, `MESH_VAULT` 20, `MESH_INDEXED_BIN` 14, `MESH_INDEXED_TIMEOUT_MS` 4, `MESH_BIN` 3 (smoke.sh) | 98 occurrences in 27 files. Constants live in `config.rs:9-15` |
| Default and runtime paths | `~/.mesh/config.toml` (`config.rs:109`), `~/.mesh/vault` (`cli/admin.rs:26`), `~/.mesh/run/` + `mesh-<hash12>.watch.lock` (`cli/watch.rs:301-315`) | 3 sites |
| MCP tool prefix `mesh_*` | 403 occurrences in 16 files (src 151 in 9, tests 163 in 4, SKILL.md, README, …) | `TOOL_NAMES` in `mcp/mod.rs:23`, `schema.rs`, `tools.rs` |
| `mcp__mesh__…` | 36 in `plugins/mesh/skills/mesh/SKILL.md`, 2 in `tests/bundle.rs` | Claude Code fully-qualified tool names |
| Server name | `SERVER_NAME = "mesh"` (`mcp/mod.rs:20`); the `"mesh"` literal appears 40× in 19 files | |
| Plugin bundle | `plugins/mesh/` (dir), `.mcp.json` (`"mesh": {"command":"mesh-mcp"}`), `plugin.json`, `hooks.json` (`mesh session-start …`), `skills/mesh/SKILL.md`; `.claude-plugin/marketplace.json` | `plugins/mesh` path referenced 13× in 5 files. `tests/bundle.rs` pins the bundle (41 string hits) |
| CLI strings in messages, help and errors | `` `mesh <verb>` `` 148× in 40 files, for example "run `mesh init`" in `error.rs:9`, `"daemon: removed — use 'mesh watch'"` in `admin.rs:20` | Tests assert many of these exact strings |
| Domain terms | `is_mesh_stem` (`notes.rs:51`, `memories.rs:108`), "mesh-native" vs "foreign" notes (9 sites, more on PR #11) | A semantic choice. Suggested: `is_shards_stem`, "shards-native", or the neutral "managed" / "id-bearing" |
| Generic prose noun | "a mesh for multi-agent collaboration" (Cargo description, README, AGENTS, lib.rs doc, …) | Blind replace produces "a shards for…". Rewrite by hand |
| Tests asserting strings | `mcp_cli.rs` 151, `lens_cli.rs` 94, `bundle.rs` 41, `scratch_cli.rs` 22, `foundation_cli.rs` 19, `admin_cli.rs` 8, … | |
| Golden fixtures | `tests/fixtures/golden/*.json` contain `/tmp/claude-0/-home-user-mesh/…` inside `path` values | Harmless: `tests/lens_cli.rs:120 normalise()` reduces `path` to its basename. Exclude `tests/fixtures/golden` from the replace anyway |
| CI | `.github/workflows/ci.yml` (10): `./target/release/mesh`, `mesh-mcp`, `mesh mcp` smoke | |
| Scripts | `scripts/install.sh`, `scripts/smoke.sh` (`MESH_BIN`, `unset MESH_*`) | |
| Docs and spec | README (34 KB), AGENTS.md, docs/concepts.md, `.spec/*.md` (product, tech, plan, lessons, design) | `.spec` is managed by the `spec` skill (`AGENTS.md` §0) |
| Repo and URLs | `repository: https://github.com/LennardZuendorf/mesh` (plugin.json) | A GitHub repo rename redirects automatically |

### 4.1 How the previous rename was done (`82deb51`, PR #8, 2026-09-01)

- `git show --stat 82deb51` shows one squash commit that also carried unrelated CI test fixes. It covered:
  - `git mv` of the package directory (`src/shards → src/mesh`, the Python era), `plugins/shards → plugins/mesh`, and `skills/shards → skills/mesh`;
  - content edits across pyproject, CI, marketplace, `.spec/*`, README, AGENTS, config.example and hooks.
- The message reads: "Aligns the internal package, CLI (mesh/mesh-mcp), env vars (MESH_AGENT/MESH_CONFIG_PATH), default config path (~/.mesh/config.toml), MCP tool prefix, and daemon socket naming … **Clean break, no compat aliases.**" It also added `docs/concepts.md`.
- `.spec/product.md:124-127` records the decision as "Clean break, no compat aliases".
- Two lessons came out of it, both in `.spec/lessons.md`:
  - L122-126: a `\bshards\b` regex misses `shards_note_get`, `SHARDS_AGENT` and `mcp__shards__…` because `_` is a word character. **Use a plain substring replace** after checking that the token never occurs inside unrelated words. For "mesh", only `MeshError` qualifies, and it should be renamed anyway.
  - L128-132: the generic noun caused "the mesh mesh". **After the replace, grep for doubled tokens** (`shards shards`, case-insensitive) and hand-fix the prose.
- Note the irony: the project was called Shards before September 2026. Reverting is cheap conceptually, but some Python-era history in `.spec/lessons.md` mentions `shards` and must keep that wording. That is 3 hits at `.spec/lessons.md:123,129` and `.spec/product.md:126`.

### 4.2 Recommended mechanical procedure

1. **Rebase onto or merge PR #11 first.** Rename on top of the newest tree, never in parallel with it.
2. Create a branch `refactor/rename-shards`. Use a single commit per step so review is tractable.
3. Run `git mv` on the paths:
   - `src/bin/mesh-mcp.rs → src/bin/shards-mcp.rs`
   - `plugins/mesh → plugins/shards`
   - `plugins/shards/skills/mesh → plugins/shards/skills/shards`
4. Do an ordered, case-preserving plain substring replace over tracked text files. **Exclude** `tests/fixtures/golden/**`, `Cargo.lock` (regenerate it instead), and the history lines in `.spec/lessons.md` and `.spec/product.md`.
   - `MeshError → ShardsError`
   - `MESH_ → SHARDS_`
   - `mesh_ → shards_` (this covers `mcp__mesh__` → `mcp__shards__` too)
   - `mesh-mcp → shards-mcp`
   - `mesh:: → shards::`
   - `.mesh → .shards`
   - `Mesh → Shards`
   - `mesh → shards`

   A one-liner works: `git ls-files -z | grep -zv '^tests/fixtures/golden/' | xargs -0 perl -pi -e 's/MeshError/ShardsError/g; s/MESH_/SHARDS_/g; s/Mesh/Shards/g; s/mesh/shards/g'`. Run it after the explicit excludes.
5. Hand-fix the prose:
   - `git grep -in 'shards shards\|a shards\b\|the shards for'`;
   - rewrite the generic "a mesh for multi-agent collaboration" taglines into the new positioning;
   - decide `is_shards_stem` versus `is_managed_stem`.
6. Run `cargo build && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test` and `./scripts/smoke.sh`. Then run `git grep -i mesh`, which should return only the compat shims, history, and goldens.
7. Rename the GitHub repo to `shards`. The old URL redirects. Update `plugin.json` `repository` and the marketplace entry.
8. Add a lesson and update `.spec` through the spec skill, as `AGENTS.md` §0 requires.

### 4.3 Compat aliases worth keeping (one or two releases)

The September rename was a clean break because nothing was released yet. Now there is a published plugin and marketplace entry, and users have `~/.mesh/config.toml` on disk. The recommendations:

| Keep? | What | How |
|---|---|---|
| **Yes** | Env vars `MESH_CONFIG_PATH`, `MESH_AGENT`, `MESH_VAULT`, `MESH_INDEXED_BIN`, `MESH_INDEXED_TIMEOUT_MS` | One helper `env_var(new, old)` that reads `SHARDS_*` first and falls back to `MESH_*`. Optionally print a stderr deprecation note once (only on the CLI, never on MCP stdout) |
| **Yes** | Config path `~/.mesh/config.toml` | `resolve_config_path`: `--config` → `$SHARDS_CONFIG_PATH` → `$MESH_CONFIG_PATH` → `~/.shards/config.toml` → **fallback `~/.mesh/config.toml` if it exists**. Optionally add `shards migrate-config`, which copies it |
| **Yes** | Default vault `~/.mesh/vault` | Only affects `init` defaults. If `~/.mesh/vault` exists and `~/.shards/vault` does not, suggest it, or use it |
| **Yes, cheap** | `mesh` binary | An extra `[[bin]] name="mesh"` that calls the same `main`, for one release. Or document an alias / symlink created by `scripts/install.sh` |
| Optional | `mesh-mcp` binary | Only if existing user MCP configs point at it. The plugin's `.mcp.json` is updated in the same release |
| **No** | `mesh_*` MCP tool names | Aliasing doubles the tool list (37/40 → 74/80), which hurts agent tool selection and context. Clients pick up new names on reconnect, and the plugin ships the new skill text |
| **No** | `MeshError`, the crate name `mesh::` | Internal only |
| **No** | Watch lock name `mesh-<hash>.watch.lock` | Runtime-only. Old watchers die on upgrade |
| **No** | Plugin dir `plugins/mesh` | The marketplace entry points to the new path |

Vault data is unaffected by the rename. No frontmatter key contains "mesh". Entity ids (`n-`, `t-`, `m-`, `a-`) and folder layout are product-neutral, so **existing vaults need no migration**.

---

## 5. Recommended architecture for Shards (from the code's constraints)

- A **Cargo workspace**:
  - `shards-core` (lib: config, spaces, domain, model, render, fm, storage, search, plus the extracted `api::dispatch` and `watch` change-feed; sync with no tokio, which keeps the no-async rule);
  - `shards-cli` (clap, the dashboard TUI, the stdio MCP);
  - `shards-desktop` (Tauri 2, which calls core via `spawn_blocking` and forwards watcher events);
  - `shards-server` (tokio, axum, OAuth 2.1 resource server, Streamable-HTTP MCP, sync endpoints).
- Clean up `shards-core` first, in this order:
  1. cut the 5 `crate::cli` edges;
  2. fix O(n²) readiness;
  3. add `rel_path`;
  4. add body-replace with optimistic concurrency (`expected_updated`);
  5. add `cfg(windows)` lock and mode shims if Windows is in scope.
- Keep **Markdown on disk as the source of truth.** Remote sync then means file-level sync plus a server-side copy of the vault that the same core operates on. That is consistent with the "read the folder" invariant, but it needs the spec amendments in §6.

## 6. Spec conflicts the PRD must resolve first

| `AGENTS.md` / `.spec` rule | Conflict with Shards |
|---|---|
| §0: "A new verb, a new flag family or a sixth space needs a spec change and an explicit sign-off" | Due, recurrence, subtasks, sections, body-replace and delete-in-UI are all new surface |
| §2: "Versioning, sync and backup are the vault owner's job, never mesh's"; §8: "Never add … git-sync logic" | Remote sync is a headline feature |
| §6: identity "is not a security boundary and must not be treated as one if mesh ever crosses a multi-user or multi-machine trust line" | OAuth multiplayer crosses exactly that line. The server must enforce identity, and the core must never trust caller-supplied owner or claimer on remote calls |
| §6: hard delete, no trash | A consumer to-do app needs undo |
| §6: "Derived state is never stored … No verb writes another entity's file as part of its own transaction" | Recurrence (spawning the next instance) and subtask rollups touch other entities. They are allowed only as reports or best-effort follow-ups, as with `blocks` mirrors |
| §8: "Never reintroduce … a Todoist/external task backend" | Not a real conflict, since Shards rivals Todoist rather than using it as a backend. Reword it to avoid confusion |
| §3: cold start under 10 ms, no warm process | Still holds for the CLI. Desktop and server are new warm processes and must remain optional accelerators, never the source of truth |
