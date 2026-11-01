# Build, test and release Shards

Feature branches merge into `main` continuously. Pull requests and `main` pushes run CI.
A pushed version tag builds and tests release artifacts, publishes a GitHub release with
checksums and provenance attestations, then updates the stable Homebrew tap. Ordinary
merges do not publish. A prerelease tag publishes downloads without changing stable Homebrew.

The pipeline is implemented locally. Remote activation and the first published installation
still require the setup below and a successful GitHub run. Local tests do not establish that
the tap, credentials, repository protections or GitHub releases have been activated.

## Variants

| Variant | Artifacts and installation |
|---|---|
| CLI + MCP | `shards-cli-VERSION-TARGET.tar.gz`; both executables, three shell completions, license and README |
| Desktop + CLI + MCP | `Shards-VERSION-TARGET.dmg`; app plus matching private copies of both executables |
| Server | Disabled until the separately implemented server meets its release contract |

Mac targets are Apple Silicon and Intel, macOS 13.3+. The standalone Linux tools target
x86_64 with glibc 2.35+. Minimum macOS metadata is checked; a newer CI runner does not prove
runtime compatibility on macOS 13.3. Linux desktop and Windows are not release targets.

## One-time activation

1. Merge this pipeline through normal review and CI. Existing required-check names acquire
   the reusable `quality` workflow prefix; compare the actual check names and update branch
   protection before requiring them. The pipeline does not change repository protection.
2. Create or reuse the public `LennardZuendorf/homebrew-tap` repository with default branch
   `main`. Initialize it with a README. Generated formula, cask, README and tap CI are owned
   under `packaging/homebrew/` in the Shards source repository.
3. Add `HOMEBREW_TAP_TOKEN` to the Shards repository or its `release` environment. Scope it
   to the tap repository. It needs **Contents: read and write** and **Workflows: read and write**
   to push package definitions and generated verification CI. A GitHub App installation token
   can use the same repository-scoped permissions. Do not use a broadly scoped personal token
   when a repository-scoped token suffices.
4. Permit the publisher's declared GitHub Actions permissions: release contents writes,
   Actions artifact reads, OIDC and artifact attestations. The built-in token publishes
   Shards releases; it cannot independently push to another repository's tap.
5. The `release` environment may hold the tap token. The default routine has no additional
   manual approval after a tag push; environment protection may add one if desired.
6. Run a manual candidate first. Inspect every matrix target, native app result and generated
   tap lifecycle test. Publish the first version only after its evidence is approved.

No deployment, first tag, repository creation or secret configuration is implicit in local
implementation. Never paste tokens into commands, URLs, logs or the repository.

## Daily development and version preparation

Use feature branches and merge to `main` when CI passes. Keep release-only version changes
in the same reviewed flow. The root `Cargo.toml` package version is authoritative.

```bash
node scripts/release/version.mjs prepare 0.3.0
node scripts/release/version.mjs check
node --test scripts/release/*.test.mjs
```

`prepare` synchronizes product package metadata and local Cargo lockfile entries. It does
not commit, tag or push. Commit the reviewed version change and merge it into `main` before
tagging. The example version is illustrative; choose the intended release version explicitly.

Direct Cargo desktop checks need generated sidecars and frontend output first:

```bash
node scripts/release/desktop.mjs stage
pnpm -C apps/desktop build
cargo clippy -p shards-desktop --all-targets --locked -- -D warnings
cargo test -p shards-desktop --locked
```

Tauri's normal dev/build hooks stage the tools automatically. Generated sidecars, package
outputs and dependency caches are ignored. The CLI still builds independently of Tauri.

## Build an unpublished candidate

Run the **Release** workflow manually on the intended ref. Its default selection is all
enabled variants; `cli` selects tools only. Manual runs never publish.

For a local native Mac candidate:

```bash
node scripts/release/cli.mjs aarch64-apple-darwin dist/release
node scripts/release/desktop.mjs build aarch64-apple-darwin dist/release
```

Use `x86_64-apple-darwin` on Intel. These wrappers run the produced executables natively;
do not claim cross-architecture runtime evidence from a cross build. Desktop packaging uses
unattended DMG creation and locked Cargo dependencies. Its isolated launch check establishes
that the native process starts and stays running; it is not a full native UI acceptance test.

The GitHub matrix assembles `release-manifest.json` and `SHA256SUMS` only after all selected
targets pass. The manifest names the source commit, variant status, target, payload hash,
size, signing state and evidence. `server_not_implemented` is explicit, not a successful build.

## Tag a release

After the reviewed version is on `main`, create a matching tag and push only that tag:

```bash
git switch main
git pull --ff-only
node scripts/release/version.mjs check v0.3.0
git tag -a v0.3.0 -m "Shards 0.3.0"
git push origin v0.3.0
```

The pipeline refuses tags whose version disagrees with the product or whose commit is not
reachable from `main`. Failed, cancelled or unexpectedly skipped prerequisites block publication.
It publishes the verified candidate bytes, without rebuilding in the publisher. A same-name
existing asset must have identical bytes; conflicting tags or assets are refused.
Publication is serialized across tags. An older stable tag can publish its own downloads but
cannot move GitHub's latest release or Homebrew back from a newer stable version.

For a prerelease, prepare and tag a version such as `0.3.0-rc.1`. Its downloads appear as a
GitHub prerelease. The stable tap remains on the prior stable version.

## Homebrew installation after activation

Tools only:

```bash
brew install LennardZuendorf/tap/shards-cli
```

Desktop plus tools:

```bash
brew install --cask LennardZuendorf/tap/shards
```

The formula owns public `shards` and `shards-mcp` commands. The app contains private matching
tools under `Shards.app/Contents/MacOS/`; the cask does not create duplicate command links.
Agents may use the formula's `shards-mcp` on PATH, or the absolute bundled executable path
for an app-only DMG installation. Public tools can be newer after an independent brew upgrade.
Homebrew's `crystal` formula also owns a `shards` executable. Installation refuses that
conflict and unrelated command files; it never forces link replacement.

```bash
brew update
brew upgrade LennardZuendorf/tap/shards-cli
brew upgrade --cask LennardZuendorf/tap/shards
```

Removing the desktop leaves the tools installed:

```bash
brew uninstall --cask LennardZuendorf/tap/shards
```

Remove the tools separately if desired. Uninstallation does not delete vaults or configuration.
There is no `zap` rule for user data.

## First Mac launch

The initial packages have ad-hoc integrity signatures, without an Apple Developer ID or
notarization. macOS may prevent first launch. After attempting to open the app, use
**System Settings → Privacy & Security → Open Anyway** only when you trust the source and
have verified the download. The package does not remove quarantine or disable Gatekeeper.
See [Apple's per-app approval instructions](https://support.apple.com/en-us/102445).

## Installation verification

The tag workflow tests both native Mac architectures using the generated tap against local
candidate payloads. It verifies tools-first and desktop-first installs, reinstall, desktop
removal, command conflict refusal and preservation of disposable vault/configuration data.
It downloads and verifies the prior stable release for an actual upgrade test when one exists.
On the first release, it reports that no previous upgrade baseline exists.

The test changes Homebrew and therefore requires an explicit disposable-machine guard:

```bash
SHARDS_BREW_SMOKE_DISPOSABLE=1 node scripts/release/brew-smoke.mjs dist/release aarch64-apple-darwin --previous /path/to/previous-dist
```

Do not run it against a personal Homebrew installation. Once the tap update is public,
its own CI repeats installation against the real versioned release URLs. Candidate-local
tests and public installation evidence are separate results.

## Retry or recover a release

- A failed source/build/install job publishes nothing. Fix it in a feature branch, merge,
  prepare a new version and tag it. Do not move an existing public version tag.
- If a transient publication step fails, rerun failed jobs in the tag workflow. It verifies
  candidate identity and reuses identical assets. An existing incomplete draft can be completed;
  a published incomplete or changed release is refused.
- If the release succeeds but the tap update fails, repair the tap credential or repository
  state and rerun the publisher. It checks the same published hashes and never rebuilds.
- Prefer a new corrected release for a bad version. A deliberate tap rollback must point at
  retained, verified artifacts and receive review. Do not replace release bytes in place.
- Application data downgrade compatibility belongs to the owning feature. Packaging does not
  roll back, migrate or delete a vault.

## Server handoff

The server is disabled in `release/config.json`. An explicit server selection fails before
building. `shards-host` is the local development HTTP transport and cannot substitute for it.
The server implementation must provide:

- A real `shards-server` Cargo workspace package and binary.
- `crates/shards-server/scripts/release-smoke.sh`, accepting `native EXECUTABLE` and
  `image IMAGE_TAG`; it owns disposable runtime configuration, health/readiness, auth/isolation,
  migration and persistence checks, and graceful shutdown.
- `packaging/server/Dockerfile`, whose runtime image is tested before packaging.
- Matching product version metadata and successful native/image evidence before enablement.

The prepared reusable workflow builds, tests and packages a Linux x86_64 server. Its archive
contains the native binary and `image.tar` exported from the already tested OCI image, so
distribution does not rebuild the image. Registry deployment and hosted infrastructure remain
server activation work. The existing CLI and desktop never depend on this server.
