# AGENTS.md — Shards Engineering Guide

> **Shards** is the multiplayer task manager for humans and agents, backed by Markdown you own.
> It has three surfaces over one Rust core: the desktop app, the `shards` CLI and the
> `shards-mcp` server. They share five spaces (`notes`, `tasks`, `memories`, `scratch`,
> `assets`) in one folder that serves every agent. The CLI has no daemon.

---

## 0. Spec-Driven Workflow (read this first)

**This is a spec-driven repository. The spec is the source of truth. Code follows the spec, never the other way around.**

The canonical product and technical contract lives in **[`.spec/`](.spec/)**. Start at
[`.spec/product.md`](.spec/product.md), [`.spec/tech.md`](.spec/tech.md), and [`.spec/plan.md`](.spec/plan.md).

Before you touch anything:

1. **Confirm the `spec` skill is installed and use it.** Spec work in this repo *must* go through
   the `spec` skill. Do not hand-author or hand-edit the spec.
   - Verify it is available. It should appear in your in-session skill list, or under
     `.claude/skills/spec/` (project) or `~/.claude/skills/spec/` (user). Invoke it with `/spec`.
   - **If the `spec` skill is missing, stop and install it before you continue.** Tell the user it
     is not installed. Do not work around it.
2. **Read the `.spec/` root layer** (`product.md`, `tech.md`, `design.md`, `plan.md`,
   `lessons.md`) before you write code or docs. Then read the feature layer for the arc in
   flight.
   - **Arcs in flight:** `shards-rebrand` (14), `task-model-v2` (15) and `desktop-app` (16), under
     `.spec/features/<name>/`. `.spec/plan.md` § Feature Sequence owns their order and gates.
   - Landed arcs are compounded into the root layer and their folders are deleted.
3. **Any change that contradicts or extends the spec updates the spec first.** Make it through the
   `spec` skill, with user confirmation. The implementation follows after that.
4. **Keep the surface honest.** The core surface is **granular verbs over five spaces**.
   - A new verb, a new flag family, a new host tool or a sixth space needs a spec change and an
     explicit sign-off.
   - The owner has signed off on this growth for the pivot: the task-model-v2 fields, recurrence,
     the UI-only `host_*` tools and the `[[members]]` config table.
   - Anything beyond that list needs its own sign-off.

---

## 1. Core Operating Principles

Follow the **ASK → PLAN → CONFIRM → EXECUTE** loop:

1. **ASK**: clarify requirements and constraints before you assume anything.
2. **PLAN**: break the task down and present the approach, including the spec sections it touches.
3. **CONFIRM**: get explicit user approval before you implement.
4. **EXECUTE**: implement in small steps and explain each one clearly.

- Quality comes before speed, and the simplest working design wins (KISS).
- `clippy -D warnings` and `cargo fmt` must be clean.
- Every behaviour needs meaningful test coverage.
- **The CLI must start instantly:** cold start under 10 ms, because no warm process exists to
  hide behind.
- The desktop app and `shards-host` run for a long time by choice. Nothing in the core or the CLI
  may depend on them.

---

## 2. Repository Goals & Connections

**Goal.** Give a human operator, their team and a fleet of agents one shared task manager and
memory over a Markdown folder they own. It gives Todoist-grade task UX in the app and atomic,
scriptable verbs in the CLI and MCP. No database is the source of truth.

- **Notes + memories + search = recall.**
  - No separate memory store exists. Memories are note-shaped Markdown files in their own space,
    ranked by match, importance and recency.
  - Ranked retrieval goes to `indexed` when it is configured and present.
- **Tasks = coordination = handoff.**
  - The verbs are `owner` / `claimed_by` / `claim` / `release` / `finish` / `cancel` / `list`.
  - The dependency graph adds `blocks` / `blocked_by`, `block` / `unblock`, a strict claim gate
    (exit 5) and `task next`. Readiness is derived at read time.
  - The delegation model is Linear-style: `owner` is the accountable assignee, human or agent.
    `claimed_by` is the delegate who is executing the task now.
- **Scratch and assets are the working surface.** Scratch holds per-agent session state. Assets
  are content-addressed files beside the vault.
- **Markdown is the source of truth.** Shards owns the *interface* and the writes, not the data.

**Connections (what Shards talks to):**

| System | Role | Boundary |
|---|---|---|
| **The vault folder** | One Markdown folder divided into five configurable spaces. It is the source of truth. | Shards **owns writes** and direct reads inside the enabled space roots. It **coexists** with any other tool on the same folder: a Markdown editor and its plugins, another MCP server, git. If `[search].collection` is set, `shards reindex` refreshes the whole vault through `indexed`: `index create files` when the collection is missing, `index update` when it exists. Backup stays the vault owner's job. Sync is Shards's own record sync (feature 18). It is never git sync. |
| **`indexed`** | First-party hybrid-search engine (ingest + embeddings + ranked retrieval, CLI/MCP) | Shards's `search` is a thin wrapper with a 30 s wall clock. The two projects design the Shards↔indexed contract together. A missing, failing or slow binary falls back to the built-in BM25-lite engine. It never causes an error. |
| **Desktop app** (`apps/desktop`) | The human surface. Tauri 2 shell + React UI. | Calls the core only through `shards-host`'s `Host::call`. It holds no task logic of its own and works on the same folder as the CLI. |
| **`shards-host`** (`crates/shards-host`) | Transport-agnostic `Host::call(tool, args)` over the MCP dispatcher, plus the UI-only `host_*` tools and a vault change watcher. The bin serves HTTP/SSE on 127.0.0.1 for browser dev mode. | Never exposes `host_*` tools over agent MCP. It binds to loopback only. |
| **`shards-server`** (`crates/shards-server`) | **Reserved.** The future sync API + remote MCP (Streamable HTTP + OAuth 2.1). | Not built in the Now horizon. Identity becomes a security boundary here only. |
| **Agents** (Claude Code, Cowork agents, …) | Consumers | Call Shards through the CLI (`--json`) and the 40 `shards_*` MCP tools. |
| **`$SHARDS_AGENT`** / `[core].me` | Acting identity: per agent session, or the configured human | Drives `--owner` defaults and `--mine`. It is validated against `[tasks].collections` across every space, and `[[members]]` adds display names and kinds. `MESH_*` is read as a fallback for one release. |
| **`shards watch`** | Optional foreground watcher: folder reconciliation + `indexed index update` | An accelerator, never a dependency. Every command behaves identically with no watcher running. |

---

## 3. Tech Stack

**Language & runtime**

- Rust 1.94, pinned in `rust-toolchain.toml`, edition 2021.
- Cargo workspace. The root package `shards` stays in place and is the core lib + CLI + stdio
  MCP, with two binaries: `shards` and `shards-mcp`.
- Members added by desktop-app: `crates/shards-host` and `apps/desktop/src-tauri`.
  `crates/shards-server` is reserved.
- The core crate is `#![forbid(unsafe_code)]` and has no async runtime.
- `shards-host` and the Tauri app may use `tokio`/`axum`. They call the synchronous core through
  `spawn_blocking`.

**Core crates:** `clap` 4 + `clap_complete` (CLI), `yaml-rust2` (frontmatter *read* only; the
emitter is hand-written), `serde_json` with `preserve_order` + `indexmap` (ordered payloads),
`toml` + `toml_edit` (read / format-preserving edit), `chrono`, `sha2`, `rustix` (`O_EXCL`,
`flock`, `fstat`, `kill`, `umask`), `walkdir`, `notify` + `notify-debouncer-full`, `dirs`,
`thiserror`, `which`, `ratatui` + `crossterm` (dashboard).

**Host and app**

- `shards-host`: `axum` on 127.0.0.1 with `POST /api/call/{tool}` and `GET /api/events` (SSE).
- Desktop: **Tauri 2.12. Never v3.** It exposes one command, `shards_call(tool, args)`, and
  `vault://changed` events.
- Frontend in `apps/desktop`: React 19, Vite, TypeScript, Tailwind 4, shadcn (radix),
  TanStack Query, TanStack Virtual (`@tanstack/react-virtual` 3.14.13), dnd-kit, cmdk,
  chrono-node, date-fns, sonner, lucide, `motion` 12.43.0, `react-use-measure` 2.1.7 and animate-ui (vendored radix
  components under `src/components/animate-ui/`, MIT + Commons Clause; keep its `LICENSE.md`).
- Package manager: **pnpm**.
- The frontend transport picks Tauri `invoke` or HTTP `fetch` through `isTauri()`.

**Rejected on purpose (core crate)**

- `regex`: five hand-written scanners live in `src/text.rs`, and one of them needs a negative
  lookahead.
- `anyhow`: exit codes are a contract, so every path returns `Result<T, ShardsError>`.
- Any MCP SDK in the core: it would pull in `tokio` + `tower` + `schemars`, and the stdio tool
  schemas must stay byte-controlled.
  - `shards-server` will use `rmcp`, because Streamable HTTP + OAuth justify it there.
- `mime_guess`: a static extension table is smaller and fully deterministic.

**Dev tools**

- Rust: `cargo fmt`, `cargo clippy`, `cargo test`, `assert_cmd` + `predicates` (integration
  tests drive the real binary), `tempfile`, `serial_test`, `cargo-llvm-cov` (coverage floor in
  CI).
- `pre-commit`: local hooks that run the same commands CI runs.
- Frontend: pnpm scripts in `apps/desktop`.

---

## 4. Development Workflow

### Common commands

```bash
# core (lib + CLI + stdio MCP)
cargo build                                          # debug build
cargo build --release                                # ./target/release/{shards,shards-mcp}
cargo fmt --all --check                              # format gate (whole workspace)
cargo clippy --all-targets --locked -- -D warnings   # lint gate (core; default-members = ["."])
cargo clippy --workspace --exclude shards-desktop --all-targets --locked -- -D warnings  # CI check job
cargo test -p shards                                 # the core suite
cargo test -p shards --test note_cli                 # one integration file
cargo llvm-cov --locked --fail-under-lines 80        # coverage gate (ratchets up, never down)
./scripts/smoke.sh                                   # verb smoke test against a throwaway vault
cargo run -q --bin shards -- --help                  # CLI help (two bins, no default-run)
cargo install --path .                               # install `shards` and `shards-mcp`

# host + desktop (desktop-app, feature 16; prototype on this branch)
bash scripts/demo-vault.sh --force [DIR]             # demo vault + config (default /tmp/shards-demo); needs `cargo build`
cargo test -p shards-host                            # host tools, guard, token file, identity
cargo run -p shards-host -- --config DIR/config.toml [--port N]   # HTTP/SSE on 127.0.0.1 (default 7878)
pnpm -C apps/desktop install                         # frontend deps
SHARDS_HOST_URL=http://127.0.0.1:N pnpm -C apps/desktop dev --port M --strictPort   # Vite UI (default 5173 → 7878); no `--`, or Vite ignores the port
SHARDS_CONFIG_PATH=DIR/config.toml pnpm -C apps/desktop tauri dev   # desktop window (Vite on 5173)
pnpm -C apps/desktop tauri build --debug --bundles app   # target/debug/bundle/macos/Shards.app
cargo clippy -p shards-desktop --all-targets --locked -- -D warnings   # needs apps/desktop/dist (pnpm build first)
pnpm -C apps/desktop build                           # type-check + production frontend build
pnpm -C apps/desktop lint                            # oxlint
pnpm -C apps/desktop test                            # frontend tests (vitest)
```

> The core is `shards` 0.2.0: five spaces, the live task dependency graph and the 40-tool MCP
> surface, with no daemon. Task model v2 and the desktop prototype are on this branch
> (`villain/mesh-improvements`), not yet merged to `main`. `.spec/plan.md` tracks status and gaps.

**Lints are load-bearing.**

- `unwrap`, `expect`, `panic`, `todo` and `string_slice` are denied in `src/`. They are allowed
  under `#[cfg(test)]` and in `tests/`.
- Use `?`, `Option` combinators and `chars().take(n)` instead. A byte slice panics on a multibyte
  boundary, which is exactly what `clippy::string_slice` exists to prevent.
- `sort_unstable*` is banned in `src/domain/select.rs` and `src/search/**`. Every documented
  ordering is a composition of stable sorts.
- New workspace crates mirror the same clippy denies.

### Git commit standards

Format: **`type(scope): subject`**. Write it imperative and lowercase, at most 50 chars, with no
trailing period.

Allowed types: `feat`, `fix`, `refactor`, `perf`, `style`, `test`, `docs`, `build`, `ci`, `chore`, `revert`.

```
feat(task): add atomic claim via O_EXCL lockfile
fix(search): fall back to the builtin engine when indexed is down
docs(spec): wrap indexed for ranked retrieval
```

### Branching & pushing

- Develop on the assigned feature branch. Never push to the default branch without permission.
- Before you branch, check that the base commit builds and passes its tests on your OS (see
  `.spec/lessons.md`).
- Run the full test suite **before** any push.
- Do **not** open a pull request unless the user explicitly asks.

---

## 5. Repository Structure

```
shards/
├── AGENTS.md            # this guide  (CLAUDE.md is a symlink to it)
├── CLAUDE.md -> AGENTS.md
├── README.md            # user-facing overview: app, install, config, CLI surface, MCP
├── docs/concepts.md     # architecture Q&A: spaces, memories vs notes vs scratch, assets,
│                        #   derived readiness, atomicity, vault/config resolution
├── Cargo.toml, Cargo.lock, rust-toolchain.toml, rustfmt.toml, clippy.toml
├── config.example.toml  # every config key, documented; loaded by tests/bundle.rs
├── docs/screenshots/    # desktop prototype screenshots used by the README
├── scripts/             # smoke.sh (verb smoke test), install.sh (cargo install wrapper),
│                        #   demo-vault.sh (demo vault + config for the app)
├── .spec/               # THE SPEC: source of truth (managed through the `spec` skill)
│   ├── product.md  tech.md  design.md  plan.md  lessons.md   (+ product-*/tech-* branch docs)
│   └── features/<name>/ # in-flight arcs only; deleted after compounding
├── plugins/shards/      # the Claude Code plugin: .mcp.json, hooks, skills/shards/SKILL.md
├── src/                 # root package `shards`: core lib + CLI + stdio MCP
│   ├── main.rs lib.rs ctx.rs        # parse → dispatch → exit code; module surface; invocation ctx
│   ├── bin/shards-mcp.rs            # shim binary the plugin bundle wires up
│   ├── error.rs                     # ShardsError; code() IS the exit status
│   ├── config.rs spaces.rs          # config load (+ MESH_* / ~/.mesh fallbacks) + five-space sandbox
│   ├── ids.rs timefmt.rs text.rs render.rs
│   ├── fm/                          # frontmatter: value, load (yaml-rust2), canonical emit, doc
│   ├── storage/                     # atomic write, O_EXCL locks, sandbox, THE walk
│   ├── model/                       # per-space typed views + field order
│   ├── domain/                      # the verbs + select/tags/owner/wikilinks/deps/lenses
│   ├── search/                      # route, corpus, tokenize, builtin, tagpull, indexed, health
│   ├── cli/                         # one file per verb family + globals, out, admin, watch, dashboard
│   └── mcp/                         # stdio JSON-RPC server, schemas, the 40-tool table
├── tests/               # one integration file per verb family, plus compat_corpus, race,
│                        #   bundle, foundation_cli, review_regressions
├── crates/              # added by desktop-app
│   ├── shards-host/     # lib.rs (Host::call, watcher, identity), tools.rs (16 host_* names),
│   │                    #   members.rs ([core].me, [[members]]), bin/shards-host.rs (axum
│   │                    #   HTTP/SSE + Host/Origin/token guard), tests/{host_tools,identity,open}.rs
│   └── shards-server/   # RESERVED: sync API + remote MCP + OAuth (features 18–19)
└── apps/                # added by desktop-app
    └── desktop/         # pnpm package: React + Vite UI (src/: app/, views/, components/, lib/),
                         #   Tauri 2 shell (src-tauri/: shards_call + shards_open, capabilities/default.json)
```

**One primitive, one implementation, one owner.**

- Each of these lives in exactly one module: frontmatter round-trip, atomic write, locks, the
  vault walk, filter/sort/limit, JSON rendering and the error→exit mapping.
- The app and the host reuse the core through `Host::call`. They never re-implement a verb.
- If you are about to write a second walk, a second sort or a second task parser, stop.

---

## 6. Key Design Constraints

- **No daemon for the CLI or the core.**
  - Every command reads disk directly and behaves the same whether or not a watcher runs.
  - `shards watch` is an optional foreground accelerator for search freshness and folder
    reconciliation. It is never a gatekeeper and never a dependency.
  - The desktop app, `shards-host` and the future `shards sync --watch` are long-running
    processes by choice, and nothing depends on them. This is pivot reversal 4.
- **Spaces are configuration, not layout.**
  - Each of the five spaces is a folder relative to the vault, an absolute folder, the vault root
    itself, or `false` (disabled).
  - The sandbox is the union of the enabled roots.
  - Type and status routing is relative to a **space root**, never the vault root.
  - Folders are created lazily on first write.
  - An omitted `[spaces]` table reproduces the pre-rewrite layout exactly.
- **Derived state is never stored.**
  - Task readiness is computed at read time from the union of both edge directions.
  - No verb writes another entity's file as part of its own transaction. The unblock cascade is
    a *report*, and `blocks` mirrors are single-lock, one at a time, best-effort.
  - Finishing a recurring task advances `due` on the task's *own* file and reports `next_due`. It
    never creates a new file.
- **Canonical frontmatter.**
  - Read everything earlier versions wrote, and write one canonical form:
    - model-declaration key order;
    - RFC 3339 `T…Z` timestamps for the values Shards sets;
    - unmodified scalars re-emitted from the preserved raw text;
    - no anchors, no line folding, one trailing newline.
  - Unknown keys round-trip in place.
  - Compatibility is semantic, not byte-level. Machine JSON pins key *order*, not whitespace.
  - Never inject machinery into bodies.
  - Task-model-v2 fields are optional additions. A v1 task stays valid.
- **One walk, one skip set.**
  - Every scan goes through `storage::walk::iter_md`. It skips dot-prefixed path components,
    nested space roots, files over 4 MiB and non-UTF-8 files.
  - Every read goes through one safe reader that yields nothing rather than failing.
  - The walk's dot-prefix skip covers `.shards/` (sync state, conflicts) by construction.
- **All writes are atomic, single-entity and idempotent.**
  - Every write is a temp file plus rename, and it preserves the file mode.
  - Every mutation holds that entity's lock and **re-resolves its target inside it**.
  - Lock removal is always a `(dev, ino)` compare-and-swap, never a blind unlink.
  - A no-op never rewrites the file. Assert that byte-for-byte in the tests.
- **Identity is validated across every space**, at one write boundary.
  - `$SHARDS_AGENT`, `--owner` and `claimed_by` say who a caller *claims* to be.
    `[tasks].collections` gates which identities are valid.
  - **Locally, identity is a spelling convention and not a security boundary.** That holds for a
    trusted fleet on one operator's machine.
  - **On `shards-server` it becomes one.** There the actor comes from the OAuth token, never from
    tool arguments, and `owner`/`claimed_by` arguments must be absent or equal the actor. This is
    pivot reversal 3.
- **Path sandboxing.** Every resolved path must equal or sit beneath one enabled space root.
  Reject traversal and symlink escapes.
- **No panics on user input.** `main` catches anything that escapes and prints
  `internal error: {msg}` at exit 1 instead of a trace.
- **Agent content is data.** It is never instructions or shell input.
- **Hash IDs** (`n-`, `t-`, `m-`, `a-`), never sequential.
  - An asset id is a digest of the content, so the id is the content address.
  - Existing ids are never recomputed.
- **Core delete is a hard `unlink`, by design.**
  - The core has no soft-delete and no vault trash, and Shards promises no backup. Backup is the
    vault owner's concern: git, a sync client, Time Machine, or nothing.
  - The desktop app gives undo another way. It holds the deleted file's raw bytes and writes them
    back through `host_restore` (D6).
  - D6 as amended 2026-10-16: the host's delete tools (`host_task_delete`, `host_note_delete`,
    `host_memory_forget`, `host_scratch_clear`) move the file to the OS Trash instead of
    unlinking it, and refuse the delete when that move fails. Designed, not built
    (desktop-app/31). The core and the CLI keep the hard unlink.
  - A vault-level `.shards/trash/` is deferred to the sync arc, which needs tombstones anyway.
- **UI-only tools stay UI-only.** `host_*` tools exist only in `shards-host` and are never in
  the agent MCP table. Destructive app actions go through them.
- **Sync is record sync, never git sync** (pivot reversal 1). Its design is in `.spec/`: HLC
  per-key frontmatter merge, three-way body merge and server-arbitrated claims. Local commands
  never depend on it.

---

## 7. Claude Code Skills

- **`spec`**: *required* for all spec work (see §0). Invoke it with `/spec`.
- **`feature-dev`** (if available): for multi-file features that need architectural guidance.
- **`find-skills`**: discovers more capabilities.

`plugins/shards/skills/shards/SKILL.md` is a *product* artefact, not a dev skill. It is the
playbook shipped to the agents that consume Shards, and `tests/bundle.rs` pins its invariants.

---

## 8. DO / DON'T

**DO ✅**
- Read the spec and route spec changes through the `spec` skill, first.
- Ask → plan → confirm → execute. Get approval before you code.
- Keep the core surface at granular verbs over five spaces. Add tests alongside every behaviour.
- Make writes atomic, single-entity and idempotent. Keep every command working with no watcher,
  no app and no server running.
- Reuse the one walk, the one reader, the one select engine and the one output surface. Reach
  the core from the app only through `Host::call`.
- Let the UI degrade gracefully when a task lacks optional fields.

**DON'T ❌**
- Never hand-edit the spec or skip the `spec` skill.
- Never add a daemon to the CLI or the core, a warm index, or any CLI read path that is not
  "read the folder".
- Never reintroduce a separate memory store or a standalone handoff primitive.
- Never make an external tracker (Todoist, Linear, …) the task backend. Shards is the backend;
  importers and bridges only copy data in or out.
- Never store derived state (readiness, counts, backlinks) on disk, and never write another
  entity's file inside your own verb's transaction.
- Never add sequential IDs, a vector DB to operate, or git-sync logic.
- Never expose a `host_*` tool over agent MCP, and never trust a caller-supplied identity on a
  server path.
- Never upgrade the desktop shell to Tauri 3.
- Never `unwrap`/`expect`/`panic` in `src/`, and never slice a string by bytes.
- Never push to the default branch or open a PR without explicit permission.

---

**Remember:** spec first, then ASK → PLAN → CONFIRM → EXECUTE. Quality and simplicity over speed.

<!-- vibe:instructions:start -->
<!-- Managed by vibe (merge-agents.sh). Edits inside these markers are
     replaced on the next setup.apply / install. Content outside the markers
     (above this line, or inside vibe:active-rules) is user-owned. -->

This project runs the **vibe flow** — a spec-first workflow harness. `.spec/` is the
durable memory; sessions are ephemeral. Read the specs before you write code.

## Session start

1. Read `.spec/lessons.md` and `.spec/plan.md`. (The spec half owns `.spec/`; a
   flow-only install has no tree — the flow still runs, the specs are just absent.)
2. Identify the feature you are working on and load its specs:
   `.spec/features/<name>/{product,tech,plan}.md`.
3. If `.agents/skills/vibe/state.json` exists and you are continuing a flow session,
   read `{flow, phase, feature}` and resume the linked `vibe` skill. A missing cursor
   means `idle` — proceed with the specs; a missing cursor is not an error.

## Driving the flow

- `/flow <flow.phase> [feature] [confirm]` transitions the state machine. Pass the feature
  name to carry it into the cursor; add the literal `confirm` token to cross a gated edge
  (the two human gates below). Never edit `state.json` by hand.
- Under the hood `/flow` runs
  `bash .agents/skills/vibe/scripts/set-state.sh <flow.phase> [feature]`. That script is a
  *writer*, not a gate — it moves the cursor but enforces no approval. The gate teeth live
  in the `/flow` command and the hooks, not the writer.
- Per-turn **orders** for the current state come from the linked `vibe` skill, resolved by
  `orders.sh`. Follow the current state's orders over any delegated skill's own prose.

## Working model

```
ASK → read .spec/ → PLAN → CONFIRM → IMPL → verify → compound
```

Most transitions auto-advance. Two edges are **human gates** — stop and get explicit
approval before crossing: plan → impl, and verify → ship. Everything else flows without
pausing to ask.

**Output: brief technical English** — answer first, then the detail. One idea per
sentence, active voice, no filler or hedging; compress receipts and subagent
summaries. Never compress security warnings, irreversible-action confirmations, or
code/paths/commands — those stay full and byte-exact.

## Write policy

Which paths this harness restricts, and in which states, is **data**:
`content/policy.json`, read by `detect-context.sh decide` (which defaults to `idle`
when `state.json` is absent). The rules are rendered rule-by-rule into the
`vibe:rules` block below — this section states no state list of its own, because a
second hand-written copy is a copy that can disagree with the enforcer. Check any
path before writing it:

```bash
bash .agents/skills/vibe/scripts/detect-context.sh decide <path>
```

## Precedence

The cursor owns sequencing and artifact destinations; delegated skills own method. When a
delegated skill's text names its own artifact path or hands off elsewhere, the current
state's orders win: write to the state's surface, transition only via `set-state.sh`. Scope
edits are not a state — edit within the current state's write surface and stay put.
`set-state.sh idle` is always legal: abort ends any flow.

## Injected rules

Standing rules are authored as content blocks and composed into channels: the
per-turn prompt, session start, and the `vibe:rules` block below. Configure them in
this repo's root `vibe.json` — add, remove, reorder, disable, or define your own —
never by editing the block, which is regenerated.

## Commands

```bash
# Spec validation — run before claiming done (spec half; absent on --only flow)
bash .agents/skills/spec/scripts/validate.sh
# Write policy for a path (works without state.json)
bash .agents/skills/vibe/scripts/detect-context.sh decide <path>
# Health-check the harness wiring (hooks, cursor, machine)
bash .agents/skills/vibe/scripts/doctor.sh
# Injection config: what each channel composes, and lint it
node .agents/skills/vibe/engine/cli.mjs render --list
node .agents/skills/vibe/engine/cli.mjs render --check
# Re-render the AGENTS.md rules block after editing vibe.json
node .agents/skills/vibe/engine/cli.mjs render agents-md --write
```

## Enforcement is partial — do not trust it blindly

- The `pre-tool-use-guard` hook only intercepts `Edit`, `Write`, and `NotebookEdit` tool
  calls. Shell redirection (`>`, `tee`, `sed -i`) bypasses it — honoring the write
  invariants there is a **convention**, backed only by a warn-only Bash sniffer.
- `set-state.sh` writes the cursor; it does not gate. Approvals are enforced by `/flow` and
  the hooks, not by the writer.
- The Stop receipt tooth (a `*.verify` state needs a fresh evidence receipt) fires only when
  the hooks are wired into the platform (e.g. `.claude/settings.json`). No wiring, no tooth.

## Degrade

Scripts graceful-degrade: `jq` is recommended but optional (a pure-bash path keeps the
cursor byte-identical), and other agents may edit concurrently — touch only your own files
and prefer warn over hard-fail.
<!-- vibe:instructions:end -->

<!-- vibe:rules -->
_Managed by vibe — rendered from the `agents-md` channel by `vibe render agents-md --write`. Edit the blocks or `vibe.json`, not this region._

## Write invariants

Every write this harness restricts is one rule in `content/policy.json`. The
list below is RENDERED from that file — the same data
`detect-context.sh decide` enforces — so the prose and the enforcer cannot
disagree. Edit the rules, never this text.

- `.agents/skills/vibe/state.json` — otherwise: block — state.json is written only via set-state.sh, never by direct edit
- `.spec/lessons.md` — `feature.compound`, `setup.apply`, `strategy.spec`, `quick.verify`: allow; otherwise: block — .spec/lessons.md is writable only during feature.compound, setup.apply, strategy.spec, or quick.verify (current: the current state)
- `.spec/product.md`, `.spec/tech.md`, `.spec/design.md`, `.spec/plan.md` — `strategy.spec`, `feature.compound`, `setup.apply`: allow; otherwise: block — root .spec specs are writable only during strategy.spec, feature.compound, or setup.apply (current: the current state)
- `.spec/features/*` — `feature.impl`, `quick.fix`: warn — .spec/features edits are frozen during impl/fix — route back to feature.design/plan to change scope (current: the current state); otherwise: allow
- `CLAUDE.md`, `AGENTS.md` — otherwise: warn — CLAUDE.md/AGENTS.md active-rules block is generated by regen-active-rules.sh; edits inside the markers are overwritten next compound
- `src/*`, `tests/*` — `feature.verify`: warn — verify writes no src — route findings back to impl (set-state.sh feature.impl); `quick.verify`: warn — verify writes no src — route findings back to fix (set-state.sh quick.fix); `feature.impl`, `quick.fix`, `setup.apply`: allow; otherwise: warn — source/test edits outside an impl/fix state (current: the current state)

Check a path before writing it:

```bash
bash .agents/skills/vibe/scripts/detect-context.sh decide <path>
```

## Delegating to sub-agents

Model tiers for ANY delegated work — Agent-tool calls and Workflow-script `agent()`
calls alike. Set the `model` parameter explicitly on every call; never omit it
(omission silently inherits the session model):

- `haiku` — mechanical bulk work: renames, boilerplate, format conversion, log triage.
- `sonnet` — default for well-specified implementation with clear acceptance criteria.
- `opus` — genuinely tricky work: concurrency, subtle algorithms, adversarial
  verify/judge panels, gnarly debugging.
- `fable` — rare; only when independence from your context is the point (e.g.
  adversarial review of your own plan or a large diff). If the complexity of the task
  warrants a Fable sub-agent, ALWAYS check with me first — never spawn one unprompted.

When unsure between tiers, pick the cheaper and escalate on failure.

## Dynamic workflows (Workflow tool)

Applies to ALL sessions, any model. Dynamic workflows do not need to be avoided —
reach for the Workflow tool when a task has 3+ independent parallelizable subtasks or
would benefit from a pipeline/judge panel.

Standing rule on opt-in: if ultracode is NOT on for the session (no "ultracode"
keyword, no toggle, no orchestration request in my own words), plan first — propose
the workflow in one or two sentences with the rough shape and cost, and wait for my
reply; my "yes" is the opt-in. If ultracode IS on, invoke directly.

**Agent models inside workflow scripts:** every `agent()` call MUST set the `model`
parameter explicitly, chosen per "Delegating to sub-agents" above — with one
tightening: NEVER use `fable` agents in a dynamic workflow, not even with approval.
Only `haiku`, `sonnet`, or `opus`. If a Fable review is warranted, it happens AFTER
the workflow completes, as a standalone Agent-tool call (ask first, per above) —
never as a workflow stage.
<!-- /vibe:rules -->

<!-- coding-environment:start -->
## Coding environment (applies across /home/agent/projects)

This repo is one of the repos in the shared coding environment at `/home/agent/projects`.
**Read `/home/agent/projects/AGENTS.md` before you touch code — it is not optional.** It carries
the cross-repo rules: work inside a repo (never in a Paseo worktree), spec first with its two
human gates, never push to a default branch or open a PR unless explicitly asked, verify before
claiming, and never commit secrets. Where that file and this one disagree, this repo's rules win.
<!-- coding-environment:end -->
