---
type: flow
updated: 2026-11-02
---

# plan: Feature Sequence (3/3)

- **14 DONE** means all of these hold, and each check is binary:
  - `git grep --untracked -n -i mesh -- . ':!Cargo.lock' ':!docs/spec/' ':!src/config.rs' ':!tests/compat_env_cli.rs' ':!scripts/demo-vault.sh' ':!README.md' ':!AGENTS.md' ':!**/node_modules/**'`
    prints nothing. `--untracked` is required while the scaffolds are uncommitted. The allowlist
    holds compat and history only: `src/config.rs` (fallbacks), `tests/compat_env_cli.rs`
    (created by shards-rebrand/3), `scripts/demo-vault.sh` (one `unset` of both prefixes, the
    harness rule), `README.md` (upgrade note, history), `AGENTS.md` (fallback notes) and
    `docs/spec/` (lessons, plan row 6, mesh-era decisions). On 2026-10-16 it prints nothing.
  - `tests/compat_env_cli.rs` exists and passes, and the harness clears `MESH_*`
    (shards-rebrand/3–5). Open on 2026-10-16.
  - `shards --version` prints `0.3.0` (shards-rebrand/6). Open: still 0.2.0.
  - `cargo fmt --all --check` is clean (green on 2026-10-16).
  - `cargo clippy --all-targets --locked -- -D warnings` is clean.
  - `cargo test -p shards` is green.
  - Root `docs/spec/` names Shards only.
  - A trademark knockout search (EUIPO, USPTO, DPMA; classes 9 and 42) and a domain check
    (shards.app) are recorded in [product-roadmap.md](../../concepts/roadmap/README.md) § Decision log. The
    full clearance search stays a public-beta gate.
  - The rename is committed.
- **15** started ahead of its gate. Its model and domain code landed in the working tree in a
  parallel pass before 14 DONE. That code is not committed until 14 commits; then 15's units are
  finished against their scenarios, not restarted.
- **The sanctioned exception 15 ∥ 16.** Normally a feature that reads the task model would wait
  for the feature that changes it. Here the desktop UI degrades gracefully when a task has no v2
  fields: no due date, no section, default priority `normal`. 16's edits inside 15's paths are
  additive only: S1 `Server::call_with`, S0 `[core].me` and `Config::operator()` beside
  `[[members]]` in `src/config.rs`, and the S7 instruction text (desktop-app/24). Each lands
  first and 15 rebases. 16 is DONE only when its acceptance runs against a 15-DONE core.
- **Overlap inside the exception:** `Cargo.toml` and `Cargo.lock`. 15 adds no core dependency
  (the RRULE subset is hand-rolled, [tech.md](../../tech/architecture/README.md) § Tech Stack). 16 owns `[workspace]` and
  the host and app dependencies. Body replace for every space is S2 `entity::set_body`
  ([features/desktop-app/tech.md](../../features/desktop-app/tech.md) § Core seams).
- **The sanctioned exception 17 ∥ 18.** Sync is the only revenue and must not wait for polish.
  The two do not share paths: 18 lives in `crates/shards-server` and the client module, and the
  app only gains a sync status badge, which 18 adds after 17's last UI unit lands.
- **18b** starts when 18 reaches beta (multi-device dogfood running). 18 is DONE only when 18b is
  DONE and every [product-hosting.md](../../concepts/hosting/README.md) commitment is met.
- **20** carries a business gate: paying Personal Sync subscribers at the KPI K9 threshold (server count), at any time, not only within K9's 90-day window.
- **Rows 17–23** get their own feature spec when tackled. app-polish's folder is created at
  15 DONE and 16 DONE, from the outcomes in [product-roadmap.md](../../concepts/roadmap/README.md) § Next.

---

Parent: [Section index](README.md).
