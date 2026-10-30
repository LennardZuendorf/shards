---
type: feature-plan
feature: release-pipeline
sibling: tech.md
parent: ../../plan.md
updated: 2026-10-30
---

# Release pipeline implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` for coordinated inline implementation;
> delegate independent research and reviews as required by AGENTS.md. Read this plan and its
> product/technical specs before editing. No commits, pushes, PRs or publication are implicit.

**Goal:** Deliver tested CLI/MCP and desktop release candidates, a custom Homebrew tap payload,
and a server release integration point that refuses to publish an absent server.
**Architecture:** One version authority and one manifest join reusable source checks, native
artifact builders, installation verification and separate promotion. The desktop embeds matching
CLI/MCP executables; the Homebrew formula owns public command links.
**Tech stack:** Existing Rust 1.94.1, Tauri 2.12, pnpm, Node 24.15.0, GitHub Actions, Ruby/Homebrew;
Node standard-library release tooling and tests avoid a new core dependency.
**Spec:** [product.md](product.md), [tech.md](tech.md).
**Parent:** [root sequence](../../plan.md).
**Approval:** APPROVED on 2026-10-30 with continuous merges into `main` and occasional pushed
version tags triggering verified publication. No separate routine manual promotion is required.

## Global constraints

- Variants: `cli`, `desktop`, `server`; desktop always includes CLI and MCP.
- Core stays synchronous and independent of any app/server. No new core surface or Tauri v3.
- macOS 13.3+ on Apple Silicon and Intel; CLI additionally Linux x86_64/glibc 2.35+.
- No Developer ID/notarization required for this release; preserve quarantine and record ad-hoc signing.
- Server application is separate work. Disabled/missing server never yields a server artifact.
- Keep the current 80% core line-coverage floor and existing test/format/lint gates.
- Use exact versioned URLs, manifest identity and verified checksums; promotion never rebuilds.
- All runtime verification uses disposable vaults and isolated configuration.
- Build/test the current base before branching or changing implementation. Record counts and warnings.
- Plan approval permits local implementation. The later verify→ship gate covers remote activation
  and publication. A commit still requires an explicit current-session request.

## Review focus

1. Existing Crystal or user-managed `shards` executable: refuse link takeover.
2. Tools-only install followed by desktop upgrade/removal: commands and vaults survive.
3. Wrong architecture, missing shim or version drift inside an otherwise valid bundle: reject it.
4. Untrusted ref/filename/manifest or stale candidate run: fail before any credentialed action.
5. A skipped required job or missing server: never report that variant verified or publishable.

## Requirements trace

| Requirement | Units |
|---|---|
| R1 variants | release-pipeline/1, /3, /4, /6 |
| R2 source gates | release-pipeline/2, /7 |
| R3 identity | release-pipeline/1, /3, /4, /7 |
| R4 Homebrew | release-pipeline/5, /8 |
| R5 unsigned macOS | release-pipeline/4, /5, /8 |
| R6 server | release-pipeline/1, /6 |
| R7 promotion/recovery | release-pipeline/7, /8 |
| R8 installed evidence | release-pipeline/3, /4, /5, /8 |

## File responsibilities

| Surface | Responsibility |
|---|---|
| `release/config.json` | Enabled variants and target declarations, no secret values |
| `scripts/release/version.mjs`, `config.mjs`, `manifest.mjs` | Version checking/preparation, strict selection/preflight, artifact metadata/checksums |
| `scripts/release/cli.mjs`, `desktop.mjs`, `verify.mjs` | Build/stage archives and sidecars, validate extracted artifacts |
| `scripts/release/homebrew.mjs`, `publish.mjs`, `server.mjs` | Deterministic tap rendering, promotion validation, future server adapter |
| `scripts/release/*.test.mjs` | Standard-library tests over producer output and invalid inputs |
| `.github/workflows/quality.yml`, `ci.yml` | Shared source checks and PR/default-branch entrypoint |
| `.github/workflows/release.yml`, `release-server.yml`, `publish.yml` | Candidate builds, server integration, approved promotion |
| `packaging/homebrew/` | Tap templates, generated payload layout, tap CI template |
| `apps/desktop/src-tauri/tauri.conf.json`, `.gitignore` | App/DMG sidecars and ignored generated binaries |
| `docs/releases.md`, `README.md` | Operator runbook and user installation instructions |

## Implementation units

### release-pipeline/1 — Version authority and variant preflight

**Requirements:** R1, R3, R6. **Dependencies:** none.
**Files:** `release/config.json`, `scripts/release/{version,config}.mjs`, their `.test.mjs`
files; version fields in root/host/desktop Cargo manifests, frontend/Tauri/plugin metadata,
relevant lockfiles and `tests/mcp_cli.rs`.
**Interfaces:** `loadConfig(path) -> config`; `selectVariants(config, names) -> variants`;
`checkVersions(root, expectedTag?) -> {version, tag}`; `prepareVersion(root, version)`.
All functions reject invalid inputs. CLI entrypoints return nonzero with actionable messages.

- [ ] Capture clean-tree SHA and current source-check baselines; record exact environment limits.
- [ ] Write red tests for valid selections, unknown/disabled server, malformed config, tag mismatch
  and every existing version consumer; generate a complete fixture before mutating one field.
- [ ] Run `node --test scripts/release/config.test.mjs scripts/release/version.test.mjs` and observe the failures.
- [ ] Implement strict config, read-only version validation and explicit version preparation.
  Normalize metadata to the current core version initially; leave selecting the first release
  number to an explicit release preparation step. Replace literal MCP test versions with the authority.
- [ ] Rerun these tests plus `cargo test -p shards --test bundle --test mcp_cli --locked`.
  Expected: zero failed tests and matching metadata; no implicit tag or commit.

### release-pipeline/2 — Reusable source quality gates

**Requirements:** R2. **Dependencies:** /1.
**Files:** `.github/workflows/{ci,quality}.yml`, release-tool tests, workflow validation wiring.
**Interfaces:** reusable workflow `quality.yml` accepts the exact source `ref`; produces an
aggregate required result. Read-only credentials. Preserve current externally visible names
where possible; document any name changes for branch-protection activation.

- [ ] Write tests that reject gate acceptance for `failure`, `cancelled`, unexpected `skipped`
  or a job set missing a required check. Test CLI-only gate selection independently of desktop.
- [ ] Run the new tests red, then move existing CI commands into reusable quality checks without
  weakening the OS matrix, dependency guard, a11y behavior or coverage floor.
- [ ] Add release-tool tests, `actionlint` and spec validation. Pin action commits only after
  verifying each referenced upstream revision and runtime compatibility.
- [ ] Run `actionlint` on all workflows and the current Rust/frontend checks from CI.
  Record real results. An unavailable Linux runner or missing dependency is an explicit evidence gap.

### release-pipeline/3 — CLI/MCP archives and executable smoke

**Requirements:** R1, R3, R8. **Dependencies:** /1, /2.
**Files:** `scripts/release/{cli,manifest,verify}.mjs`, corresponding tests, `release.yml`.
**Interfaces:** `buildCli({target, version, outDir}) -> artifact`;
`verifyCli({directory, version, target}) -> evidence`;
`writeManifest({version, tag, sourceSha, variants, artifacts}, outDir) -> manifestPath`.

- [ ] Write red tests that unpack generated fixture archives and reject missing/non-executable
  `shards-mcp`, wrong version/target, unsafe archive paths and checksum mismatch.
- [ ] Build both actual binaries with locked Cargo dependencies and generate completions/license
  payloads. Run each target natively on its advertised architecture; Linux uses the pinned runtime floor.
- [ ] Execute the extracted CLI with `scripts/smoke.sh` and additional semantic assertions.
  Initialize the actual extracted MCP shim, list tools, reject `host_*` exposure, and make a
  read-only call against the disposable vault. Bound processes and check return codes.
- [ ] Run `node --test scripts/release/cli.test.mjs scripts/release/manifest.test.mjs scripts/release/verify.test.mjs`;
  build and extract a native candidate, then invoke `verify.mjs` on it.
  Expected: actual artifact evidence and checksums, not only fixture success.

### release-pipeline/4 — Unsigned desktop with embedded tools

**Requirements:** R1, R3, R5, R8. **Dependencies:** /3.
**Files:** `scripts/release/desktop.mjs`, `desktop.test.mjs`, Tauri config, frontend build
hook, `.gitignore`, desktop candidate matrix.
**Interfaces:** `stageSidecars({target, binaryDir, tauriDir}) -> paths`;
`buildDesktop({target, version, outDir}) -> artifact`;
`verifyDesktop({appPath, version, target}) -> evidence`.

- [ ] Write red tests for explicit-target staging, missing shim, mismatched embedded version,
  wrong Mach-O architecture and accidental development-host inclusion.
- [ ] Add target-suffixed external binaries, app+DMG packaging and macOS deployment target 13.3.
  Keep ordinary local builds usable by preparing sidecars through the build hook; do not add
  shell execution permissions or a host daemon dependency to the UI.
- [ ] Stage sidecars explicitly before direct Cargo desktop Clippy/test/build commands in quality
  jobs and documented local checks, because those commands do not execute Tauri's build hook.
- [ ] Build both Mac architectures through native candidate jobs. Inspect the final plist,
  architectures and deployment target, verify ad-hoc integrity where used, and run embedded tools
  after mounting the produced DMG. Assert both versions match the app.
- [ ] Run `node --test scripts/release/desktop.test.mjs`, frontend build/lint/tests, desktop
  Clippy/tests and `pnpm -C apps/desktop tauri build --bundles app,dmg` through the release wrapper.
  Record an isolated native launch and clean quit. A machine on the minimum macOS version is a
  separate manual acceptance if CI cannot provide one.

### release-pipeline/5 — Generated custom Homebrew tap

**Requirements:** R4, R5, R8. **Dependencies:** /3, /4.
**Files:** `packaging/homebrew/Formula/shards-cli.rb.in`, `Casks/shards.rb.in`, tap README/CI
templates, `scripts/release/homebrew.mjs`, `homebrew.test.mjs`.
**Interfaces:** `renderTap({manifest, releaseRepository, tapRepository, outputDir}) -> files`;
emits a complete tap payload with fixed URLs and platform-specific hashes. Stable renderer
rejects prereleases, draft/unverified artifacts, invalid repository names and incomplete target sets.

- [ ] Write red tests against real manifest output: ARM/Intel mapping, no `sha256 :no_check`,
  no `latest` URL, no duplicate cask command links, declared Crystal conflict and no data deletion.
- [ ] Implement `shards-cli` formula and dependent `shards` cask. Keep embedded binaries inside
  the app; formula alone owns public commands. Include unsigned-launch caveats and no quarantine hooks.
- [ ] In disposable macOS CI, render candidate-local URLs, run Ruby syntax and Homebrew style/audit,
  install tools, run `brew test`, then install/remove desktop and verify commands still work.
  Also test desktop-first, reinstall, previous-version fixture upgrade and existing-file refusal.
- [ ] Run `node --test scripts/release/homebrew.test.mjs` and native install verification on both
  architectures. Repeat using final public URLs after ship approval before advancing tap metadata.
  No tap repository is published by this local unit.

### release-pipeline/6 — Honest server integration point

**Requirements:** R1, R6. **Dependencies:** /1, /2.
**Files:** `.github/workflows/release-server.yml`, `scripts/release/server.mjs`, `server.test.mjs`.
**Interfaces:** `preflightServer(root, config) -> contract` requires the package/bin, enabled
variant, server-owned smoke script and Dockerfile named in [tech.md](tech.md#server-handoff-contract).
The reusable workflow calls package-specific lint/test/build, native smoke and image smoke;
produces a manifest entry only after those succeed.

- [ ] Write red tests for the current absent server, partial scaffolds, disabled selection,
  and a fixture mistakenly substituting `shards-host` for the real server.
- [ ] Add the adapter and reusable workflow. Keep server disabled in the real config; the
  default candidate summary reports `server_not_implemented` without producing a placeholder image.
- [ ] Test the orchestration with a small disposable contract fixture and injected process runner.
  Label that evidence as orchestration only. Document the future native/image health, auth,
  migration and shutdown evidence required to enable the real target.
- [ ] Run `node --test scripts/release/server.test.mjs` and `actionlint`.
  Expected: explicit server request fails preflight and no server artifact is emitted.

### release-pipeline/7 — Promotion and independently retryable tap update

**Requirements:** R2, R3, R7. **Dependencies:** /2, /3, /4, /5, /6.
**Files:** `.github/workflows/{release,publish}.yml`, `scripts/release/publish.mjs`, `publish.test.mjs`.
**Interfaces:** `validatePromotion({candidateRun, expectedSha, expectedManifestHash, releaseState}) -> plan`;
promotion plan contains immutable asset uploads/reuse, publication and optional stable tap update.
Only explicit execution of this validated plan may mutate GitHub. Tests inject fake GitHub responses.

- [ ] Write red tests for foreign/failed runs, stale SHA, corrupted manifest/payload, missing target,
  skipped gate, unsafe inputs, changed same-name asset, prerelease stable update, tap retry and
  an existing version tag resolving to a commit other than the tested `source_sha`.
- [ ] Implement tag-triggered release and minimal-privilege automatic promotion after validation.
  Require tag ancestry from `main`; main merges run CI only. Manual dispatch produces an
  unpublished candidate. Fetch exact tested bytes, compare identities, and publish a complete draft.
  Require the public tag to resolve to the full tested SHA; refuse conflicting existing tags.
  Never load candidate executable code in the privileged job.
- [ ] Make stable tap update consume published release hashes with its separately scoped credential.
  Handle partial publication idempotently and refuse release replacement or retagging.
- [ ] Run `node --test scripts/release/publish.test.mjs`, complete release-tool suite and `actionlint`;
  exercise a credential-free end-to-end dry run from fixture build through rendered tap payload.
  Verify no workflow grants publication writes to PR jobs.

### release-pipeline/8 — Runbook, complete verification and ship gate

**Requirements:** R4, R5, R7, R8. **Dependencies:** /1–/7.
**Files:** `docs/releases.md`, `README.md`, root specs and lessons through the spec skill.

- [ ] Document exact commands for prepare/check/candidate/promote, both brew installs, MCP config
  path, unsigned first launch, upgrades, conflicts, uninstall, failed tap update and rollback.
  Distinguish configured, locally tested, CI-tested and publicly installed states.
- [ ] Run `node --test scripts/release/*.test.mjs`, `actionlint`, spec validation,
  `cargo fmt --all --check`, core/host/desktop Clippy and tests, frontend build/lint/tests,
  existing accessibility suite, core coverage and native release/install smoke.
  Run Linux checks on Linux; do not claim local macOS tests prove Linux portability.
- [ ] Obtain independent final-diff review, repair findings and rerun affected checks.
  Record per-unit evidence and unresolved external requirements.
- [ ] Present the candidate manifest, hashes, test results, tap diff and activation checklist.
  Ask for verify→ship approval. Report any unavailable native/minimum-OS acceptance explicitly.
- [ ] After approval only: create/reuse the tap, configure required protection/credentials with the
  owner where tool permissions require it, publish the approved candidate and verify both brew
  commands from real URLs. Do not merge, push, commit or create a PR without its required authorization.
- [ ] Compound verified cross-cutting facts and lessons through the spec skill; keep undelivered
  server/signing/updater work explicitly separate from this pipeline's completion evidence.

## Planning verification

Baseline before these documents: `bash .agents/skills/spec/scripts/validate.sh` →
`Errors: 0`, `Warnings: 0`, exit 0 on 2026-10-30. No application source/build changes made.
Current CI/test counts must be measured in /1 rather than copied from historical root specs.


## Progress at local handoff

| Units | State | Evidence |
|---|---|---|
| /1–/7 | Implemented locally | 26 release tests; native ARM archive/DMG; actionlint; source checks |
| /8 | Local verification and review complete; remote verification/ship gate pending | See [technical evidence](tech.md#local-verification-on-2026-10-30) |

The owner authorized a feature-branch commit, push and PR on 2026-10-30 for the real GitHub
matrix. Tap creation, credential setup and first publication remain pending. Server runtime
remains unimplemented by design. No feature is marked DONE from local or fixture evidence alone.
