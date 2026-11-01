---
type: feature-tech
feature: release-pipeline
sibling: product.md
parent: ../../tech.md
updated: 2026-10-30
---

# Release pipeline — Architecture

**Status:** implemented locally; remote matrix and activation pending. **Parent:** [architecture](../../tech.md).
**Requirements:** [product.md](product.md). **Execution:** [plan.md](plan.md).

## Baseline evidence before implementation

- GitHub resolves the local `LennardZuendorf/mesh` remote to the public
  `LennardZuendorf/shards` repository. No GitHub releases exist as of 2026-10-30.
- `.github/workflows/ci.yml` checks Linux/macOS core and host, macOS desktop,
  frontend, fixture-based Chromium accessibility, 80% core line coverage and Linux package smoke.
  It has no release publication or macOS bundle test.
- Versions disagree: core/plugin 0.2.0; host/desktop/Tauri 0.1.0; frontend 0.0.0.
  `tests/bundle.rs` pins plugin equality; `tests/mcp_cli.rs` pins literal 0.2.0.
- `apps/desktop/src-tauri/tauri.conf.json` bundles only `app`, requires macOS 13.3,
  and declares no external binaries. The UI embeds the host library.
- `crates/shards-server` does not exist and is not a Cargo workspace member.
  `shards-host` is the loopback development transport, not the server.
- The existing startup test measures a minimum of ten warm runs at 50 ms.
  It does not establish the product's 10 ms cold-start target.

## Artifact contract

`Cargo.toml` package `shards.version` is the release authority. A preparation command
synchronizes the host, desktop Rust package, frontend, Tauri and plugin metadata, plus lockfiles.
A read-only check rejects differences, including the future server when its manifest exists. MCP reports `CARGO_PKG_VERSION`; tests derive the
expected product version. No version bump, commit or tag is implicit in building a candidate.

`release/config.json` records a schema version, variant enablement and explicit targets.
`cli` and `desktop` are enabled; `server` is disabled with reason `server_not_implemented`.
Default candidates build enabled variants. An explicit disabled selection fails preflight.

| Variant | Initial targets | Contents |
|---|---|---|
| `cli` | `aarch64-apple-darwin`, `x86_64-apple-darwin`, `x86_64-unknown-linux-gnu` | `shards`, `shards-mcp`, completions, license and README |
| `desktop` | Apple Silicon and Intel macOS 13.3+ | architecture-specific DMG containing `Shards.app`, embedded tools, license |
| `server` | integration contract for `x86_64-unknown-linux-gnu` and OCI `linux/amd64` | future `shards-server` archive and container; unavailable now |

Linux binary builds use an explicit Ubuntu 22.04/glibc 2.35 build environment and are
runtime-tested there; macOS builds use explicit runner architecture labels available at
implementation time. Set macOS deployment target 13.3 for app and bundled tools and
inspect the final Mach-O load commands. Do not claim a minimum-OS runtime test from a
newer GitHub runner. Linux ARM and Windows require later qualification.

Artifact names are `shards-cli-{version}-{target}.tar.gz`,
`Shards-{version}-{target}.dmg`, and, once enabled,
`shards-server-{version}-{target}.tar.gz`.
`release-manifest.json` contains `schema_version`, `version`, `tag`, `source_sha`,
`variants` (state/reason), and `artifacts` with `variant`, `target`, `filename`, `sha256`,
`size`, `signing` and exact test evidence identifiers. It never embeds credentials.
`SHA256SUMS` covers every downloadable artifact and the manifest. The manifest lists
payload artifacts only, avoiding a circular checksum dependency.

## Candidate and publication

1. A reusable `quality.yml` owns the existing source gates. Preserve existing visible
   job names until required-check configuration has been checked. Add release-tool tests,
   spec validation and workflow validation with `actionlint`.
2. `release.yml` runs on pushed `v*` tags; manual dispatch builds a candidate without publishing.
   Feature merges into `main` run CI only. The tagged commit must be reachable from `main`. Tag
   `vX.Y.Z[-prerelease]` must agree with the version authority. It calls quality checks on
   that same commit, then builds and verifies all selected enabled targets.
3. Candidate artifacts and a manifest are uploaded as Actions artifacts. The aggregate
   gate checks each required result explicitly. `skipped`, `cancelled` and `failure` do not pass.
4. `publish.yml` consumes a successful candidate run ID, full source SHA and manifest hash.
   It validates workflow identity, same repository, full artifact set and checksums.
   The public tag MUST resolve to that exact `source_sha`; refuse an existing tag pointing
   elsewhere. Any authorized new tag is created against the full tested SHA explicitly.
   It never executes candidate-supplied scripts with publication credentials.
   The tag push is the operator's routine release decision. Publication runs automatically
   after verification; a `release` environment scopes secrets without requiring a second
   manual approval by default. Optional repository protection can tighten that policy.
5. Promotion uploads those bytes to a GitHub draft, checks the complete set, then publishes.
   Existing identical releases are idempotent; same-name/different-hash assets are refused.
   Prereleases remain prereleases and never modify the stable tap.
6. For stable versions, render and verify the tap payload from the release manifest.
   Updating the tap is independently retryable. Never update the tap to draft/unreachable assets.
   Publication is serialized across tags. Numeric stable-version guards prevent an older run
   or retry from moving GitHub latest or the tap backwards.

PR and candidate jobs use read-only repository access. Only promotion gets `contents: write`;
future image publication gets `packages: write`. Cross-repository tap writes use a token or
GitHub App scoped to the tap; the main repository token is insufficient. Pin third-party
actions to verified commit SHAs, set timeouts, separate release concurrency from cancellable
PR checks, and pass workflow inputs through validated environment variables rather than shell
source interpolation. Do not use `pull_request_target` to run untrusted code with secrets.
Attest published payloads when repository/account support is verified; SHA-256 is always required.

Credentials, optional environment protection, repository creation and first publication are activation
steps after local implementation review. Missing settings are reported, not treated as configured.

## Desktop bundle

Stage target-specific binaries under `apps/desktop/src-tauri/binaries/` and use Tauri 2
`bundle.externalBin` for `shards` and `shards-mcp`. Packaging targets `app,dmg`.
`beforeBuildCommand` prepares the current target tools; explicit cross-target builds pass
the selected triple rather than infer the build host. Generated binaries remain ignored.
Direct Cargo desktop Clippy/test/build commands bypass this Tauri hook. The reusable desktop
quality job explicitly stages sidecars before those commands, and the local runbook names
the same prerequisite. Do not recursively invoke Cargo from the desktop crate's build script.
Existing frontend build/lint/test commands stay intact. Adding files alone needs no shell
plugin or new webview execution capability. Do not ship the development HTTP host executable.

Unsigned means no Developer ID and no notarization. Ad-hoc code signing, where needed for
Mach-O execution on Apple Silicon, is permitted and recorded separately. Finish all bundle
contents before final ad-hoc signing; validate nested binaries and the final bundle. This does
not establish Apple trust. Never remove quarantine or disable Gatekeeper in install hooks.
The runbook points to System Settings → Privacy & Security → Open Anyway after a blocked launch.

## Homebrew ownership

Proposed tap: `LennardZuendorf/homebrew-tap` (`LennardZuendorf/tap`). Public search found
no matching Homebrew repository; activation must recheck before creation.
Keep reproducible tap templates and tap CI under `packaging/homebrew/` in this repository.
The generated tap has `Formula/shards-cli.rb`, `Casks/shards.rb`, a README and verification workflow.

- Formula `shards-cli` selects the fixed macOS architecture archive and owns public
  `bin/shards`, `bin/shards-mcp` and completions. It declares the executable conflict with
  Crystal's `shards`; the package name alone does not solve that collision.
- Cask `shards` selects the architecture-specific DMG, requires macOS Ventura 13.3+, and
  depends on `LennardZuendorf/tap/shards-cli`. It installs the app with private matching tools,
  without duplicate cask `binary` links. Public tools can be newer after an independent brew
  upgrade; only embedded tools are required to match the app version exactly.
- `brew install LennardZuendorf/tap/shards-cli` installs tools only.
  `brew install --cask LennardZuendorf/tap/shards` installs the desktop and tools dependency.
  These are proposed commands until the tap and first release are published.
- No zap/uninstall operation targets user data. Test tools-only → desktop → desktop removal,
  desktop-first install, reinstall, previous-version upgrade and a conflicting executable.
- Test draft tap definitions against local candidate payloads via a disposable HTTP server
  before public assets exist. After publication, repeat against real release URLs before
  advancing stable tap metadata. A failed tap update leaves the prior version usable.

## Server handoff contract

`release-server.yml` is reusable but never runs implicitly while the server is disabled.
Preflight requires the real `shards-server` Cargo package and binary, enabled configuration,
`crates/shards-server/scripts/release-smoke.sh`, and `packaging/server/Dockerfile` from the
server implementation. Missing requirements fail with their exact names before publish jobs.
The server arc owns its configuration, database, health/readiness endpoint, auth and migrations.
Preflight checks the real Cargo package version against the product authority. The verified
server archive contains the native binary and the OCI image exported after its runtime smoke;
registry deployment remains server activation work.
Its smoke entrypoint must start the built artifact in disposable storage, wait with a bound,
check health and authentication/isolation behavior, and verify graceful shutdown. The pipeline
invokes it with the native executable or candidate image, and requires success before inclusion.
Once the server arc supplies a real contract, enablement requires independent native/image
runtime evidence. Fixture tests of orchestration never count as a tested server application.
No live server deployment or infrastructure provisioning is part of this change.

## Verification boundaries and recovery

Use isolated HOME/config and cleared `SHARDS_*`/`MESH_*` values for tests, with explicitly
seeded disposable vaults. Exercise the actual shipped `shards-mcp` with bounded stdio
`initialize`, `tools/list` and a read-only call. Reject leaked `host_*` agent tools.
Reuse `scripts/smoke.sh` through `SHARDS_BIN`, then add semantic result assertions.
Mount DMGs read-only and inspect/run embedded tools. Record native app launch separately;
fixture Chromium accessibility results cannot substitute for native macOS evidence.

Test release orchestration with valid generated fixtures, mutating one property at a time:
version, variant selection, target, missing binary, unsafe path, checksum, stale source SHA,
skipped check, prerelease promotion, duplicate asset or unavailable server. Validate consumers
with generated archives/manifests rather than handcrafted lookalikes alone.
Keep the existing coverage floor. Establish current build/test/lint baselines before implementation;
historical spec counts are not current evidence. A supported older Mac needs a recorded manual
launch acceptance; do not silently call it CI-covered.

Recovery uses a new fixed release or an explicitly reviewed tap rollback referencing retained,
verified bytes. Never retag or replace an existing artifact. Uninstall and rollback never touch
the vault; application-level data downgrade compatibility remains the owning feature's contract.

## Primary references checked 2026-10-30

- [Homebrew tap structure and maintenance](https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap)
- [Homebrew cask artifacts, dependencies and architecture selection](https://docs.brew.sh/Cask-Cookbook)
- [Tauri external binaries and target suffixes](https://v2.tauri.app/develop/sidecar/)
- [Tauri macOS app bundle structure](https://v2.tauri.app/distribute/macos-application-bundle/)
- [Apple per-app Gatekeeper approval](https://support.apple.com/en-us/102445)
- [GitHub artifact attestations and plan availability](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)


## Local verification on 2026-10-30

- `cargo test --workspace --locked`: 1,537 passed, zero failed.
- After rebasing onto Flint (`b9aafc5`), frontend Vitest: 41 files, 731 passed; production build passed.
- Core/host and desktop Clippy with `-D warnings`, plus workspace formatting: passed.
- Release Node suite: 26 passed. `actionlint` and spec validation: passed (zero errors/warnings).
- Browser accessibility: zero known/new violations, zero zoom findings. The harness now uses
  platform-correct shortcuts and waits after opening overlays before measuring contrast.
- Before the Flint integration, native Apple Silicon CLI archive and DMG built. Extracted and
  bundled tools passed real MCP/CLI smoke, architecture/deployment metadata and app integrity
  checks; native process launch passed. Rebased app artwork and font packaging await the CI candidate.
- After the Flint integration, frontend lint: zero errors and 20 existing warnings.

Local Rust is Homebrew 1.98.1/LLVM 22.1.8; it does not honor the repository's rustup pin.
The local coverage command could not find matching `llvm-tools-preview`, and rustup is absent.
Pinned Rust 1.94.1, the 80% coverage gate, native Intel/Linux, minimum-macOS launch and disposable
Homebrew lifecycle still require CI or their actual machines. The CI coverage job installs the
matching LLVM component explicitly. Commit, push and PR creation are authorized. Release
tags, secret setup and public distribution remain outside this verification record.

Independent review found stale stable promotion and missing future-server version enforcement;
both have failing-then-passing regression tests. Deferred minor: the CLI formula has no early
macOS 13.3 installer refusal; the cask and binary deployment metadata enforce the supported floor.
