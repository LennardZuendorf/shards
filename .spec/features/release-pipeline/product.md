---
type: feature-product
feature: release-pipeline
sibling: tech.md
parent: ../../product.md
updated: 2026-10-30
---

# Release pipeline — Product

Give Shards users tested, versioned downloads and two Homebrew installation options.
Prepare a third release variant for the separately implemented server.

**Status:** implemented locally on 2026-10-30; remote verification and activation pending.
See [the plan](plan.md).
**Parent:** [product](../../product.md). **Architecture:** [tech.md](tech.md).

## Scope

| Boundary | Scope |
|---|---|
| Owns | CI, release candidates, artifact verification, version consistency, macOS distribution, custom Homebrew tap, server packaging integration contract, release documentation |
| Does not own | Server application, sync, OAuth, billing, remote MCP implementation, new task behavior, in-app updater, onboarding or command-line installer UI |
| Deferred | Apple Developer signing/notarization, Windows support, Linux desktop distribution |

## Decisions from the owner

- Release three variants: MCP + CLI; desktop UI always including MCP + CLI; server.
- Homebrew must offer desktop + CLI + MCP and CLI + MCP alone.
- Prepare the server pipeline now; implement the server application separately.
- Release the Mac application without Developer ID signing or notarization for now.
  The owner accepts the macOS security prompt.
- Merge feature branches into `main` continuously; occasionally push a version tag to
  build, verify and publish a release to GitHub and the appropriate distribution channels.

Architecture, package names, initial target matrix and publication mechanics below are
proposals for approval, rather than additional owner decisions.

## Requirements

### R1 — Three explicit variants

The release system SHALL distinguish MCP + CLI, desktop, and server. Every desktop
artifact MUST physically contain the CLI and MCP executables of that release.
The standalone tools MUST work without the desktop application or a server.

#### Scenario: Desktop download

- **Given** a verified desktop release
- **When** a user installs it from a direct download
- **Then** the application and both executable tools are present in the application bundle.

#### Scenario: Standalone tools

- **Given** the tools-only package
- **When** an agent initializes MCP and a human runs the CLI
- **Then** both work without installing the UI or starting a server.

### R2 — Required source checks

Release candidates MUST pass the existing relevant Rust, frontend, accessibility,
coverage and package checks. A required failed, cancelled or unexpectedly skipped job
MUST prevent promotion. Pull-request validation MUST run without publication credentials.

#### Scenario: A failed prerequisite

- **Given** a candidate whose required test job failed
- **When** publication is requested
- **Then** no release is published and no Homebrew version is advanced.

### R3 — Version and artifact identity

Each product release SHALL have one version and source revision across its packages,
MCP identity, plugin metadata, checksums and Homebrew definitions. A release MUST publish
the same artifact bytes that passed verification. Stable packages MUST use fixed
versioned downloads and verified checksums.

#### Scenario: Version drift or corrupted download

- **Given** an inconsistent embedded version or a changed artifact
- **When** candidate verification runs
- **Then** verification fails before promotion.

### R4 — Two Homebrew installations

The custom tap SHALL offer standalone CLI + MCP and desktop + CLI + MCP.
The two packages MUST coexist without competing ownership of command links.
Installation, upgrade and uninstall MUST preserve user vaults and configuration.
An unrelated existing executable MUST never be overwritten to force installation.

#### Scenario: Add the desktop to an existing tools installation

- **Given** CLI + MCP installed through the tap
- **When** the user installs the desktop package
- **Then** the desktop includes its own matching tools and the public command links keep
  a single Homebrew owner.

#### Scenario: Remove the desktop

- **Given** desktop and tools installed through Homebrew
- **When** the desktop is uninstalled
- **Then** the tools remain usable and no vault or configuration is deleted.

### R5 — Unsigned macOS distribution

Unsigned releases MUST state that Developer ID signing and notarization are absent.
Installation documentation SHALL describe Apple's per-app approval process.
Packaging MUST preserve macOS quarantine and MUST NOT globally disable Gatekeeper.
The pipeline MUST validate executable integrity even when notarization is unavailable.

#### Scenario: First launch

- **Given** a downloaded unsigned desktop release
- **When** macOS prevents its first launch
- **Then** documentation identifies the expected warning and the supported per-app
  approval path, without promising warning-free installation.

### R6 — Prepared server target

The pipeline SHALL define a separate server build, test and artifact integration point.
Until the real server implements that contract, its release status MUST say unavailable.
Explicitly requesting a server build MUST fail with the missing prerequisites.
The local desktop host MUST never be published as the server variant.

#### Scenario: Request the absent server

- **Given** no server application exists
- **When** a server candidate is requested
- **Then** preflight fails, produces no server artifact and leaves tools/desktop candidates usable.

### R7 — Candidate, promotion and recovery

The system SHALL separate verified artifact construction from publication within the tag workflow.
Pushing a version tag on a commit reachable from `main` SHALL trigger the release automatically;
ordinary merges into `main` SHALL run CI without publishing. Prereleases MUST NOT advance stable
Homebrew packages. Promotion SHALL validate candidate identity, test evidence and artifact set.
Reruns MUST refuse conflicting existing assets and avoid
duplicate releases. Documentation SHALL explain retries, a bad release and a safe upgrade.

#### Scenario: Partial publication

- **Given** verified release assets but a failed tap update
- **When** the operator retries the tap update
- **Then** it uses the same release checksums and does not rebuild or replace release assets.

### R8 — Evidence from installed artifacts

Verification SHALL execute the extracted and installed CLI and actual MCP shim, inspect
desktop bundle contents, and exercise fresh Homebrew installs and upgrades on the supported
Mac architectures. Native GUI launch evidence MUST be distinguished from browser fixture tests.
Tests MUST use disposable vaults and isolated configuration.

#### Scenario: Shipped shim regression

- **Given** a working CLI MCP subcommand and a broken separate MCP executable
- **When** release verification runs
- **Then** it fails on the shipped executable rather than accepting the subcommand as a proxy.
