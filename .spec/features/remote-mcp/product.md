---
type: feature-product
feature: remote-mcp
status: planned
sibling: tech.md
parent: ../../product.md
children:
  - research.md
updated: 2026-10-16
---

# Feature: Remote MCP — Product

Remote MCP lets cloud agents reach a Shards workspace safely. Claude (claude.ai, Desktop, mobile,
Claude Code), ChatGPT, VS Code and headless agents connect to one public endpoint with OAuth 2.1
or a personal access token. They get the same `shards_*` tools as the local stdio server, against
the server-side copy of the workspace that sync maintains. Unlike the local server, identity is a
security boundary here: the acting member comes from the token, never from tool arguments, and
each connection is limited to the spaces the human approved. The hosted endpoint is part of
Personal Sync ($5/month) and Team; self-host is free and needs no third-party identity provider.

**Status:** designed, not started. Roadmap #19; starts when [sync](../sync/product.md) is done.
**Parent:** [../../product.md](../../product.md)
**Architecture:** [tech.md](tech.md)
**Research:** [research.md](research.md)

---

## Problem

Cloud agents cannot reach a stdio server on the user's laptop. Claude.ai connectors and ChatGPT
apps connect from the vendor's cloud, so a local server needs a tunnel and has no access control
(research §4). Today the local server trusts whatever `owner` or `claimer` a caller passes, and a
`private` memory is a courtesy filter. That is fine for one operator's trusted fleet, and unsafe
for a public endpoint. Todoist and TickTick already ship hosted MCP with OAuth, so hosted MCP is
table stakes (DECISIONS D2). Shards' edge is what sits behind the endpoint: tasks, memory and
scratch in the user's own Markdown, with a separate, revocable identity per connected agent.

## Users and jobs

| Persona (D3) | Job |
|---|---|
| Agent operator | "I add Shards to Claude.ai once. Each Claude connection works as its own agent member, and I can see and revoke it." |
| Agent itself | "I call `shards_task_next` from the cloud and get the same answer I would get locally." |
| Headless agent (CI, cron, Responses API) | "I use a token with exactly the scopes I need, no browser." |
| Small team | "Our agents write to the shared workspace, and every write is attributed to a verified member." |

## Success metrics

| Metric | Target | How measured |
|---|---|---|
| Time to first tool call | KPI K13 ([product-roadmap.md](../../product-roadmap.md) § KPIs), from "Add connector" to the first successful call in Claude.ai | Dogfood timing with 5 users |
| Client coverage at launch | Claude.ai, Claude Desktop, Claude Code, ChatGPT developer mode, VS Code all connect, refresh and recover from a missing scope | Release checklist, one pass per client |
| Protocol conformance | 100% of the MCP 2026-07-28 authorization checks used in the suite pass, plus the legacy 2025-06-18 / 2025-11-25 handshake | Conformance tests in CI |
| Parity | All 39 remotely exposed tools return the same result as stdio for the same vault state, except documented remote rules | Parity test suite |
| Isolation | 0 cross-workspace or private-memory leaks | Negative tests per tool |
| Revocation | A revoked grant or token is refused within 60 s | Integration test |
| Latency | p95 ≤ 300 ms server time per tool call on a 10,000-entity workspace | Server metrics |
| Business | KPI K14 | Server count from the grants table; no client telemetry |

---

## Scope

| | |
|---|---|
| **Owns** | The public MCP endpoint over Streamable HTTP; protected resource metadata and the 401/403 challenges; the OAuth 2.1 authorization server extensions for MCP (client ID metadata documents, dynamic registration behind a flag, the consent screen with workspace and act-as selection, per-space scopes, refresh rotation for MCP clients); agent personal access tokens; grants and their revocation; the identity rules that bind the actor to the token; remote-safe tool outputs; the "Connected agents" list and revoke (server API and CLI); rate limits on MCP and authorization endpoints; external identity provider mode. |
| **Does not own** | The sync protocol, the server replica, server accounts, devices and first-party sign-in for the desktop app and CLI ([sync](../sync/product.md)). The tool implementations and the 40-tool table (core). Workspaces, invites and roles (multiplayer, #20). The desktop "Connected agents" screen layout (desktop-app / app-polish; it calls this feature's API). MCP Apps widgets, subscriptions and enterprise SSO (later). |
| **Deferred** | Confirmation prompts inside a call for `shards_task_cancel`; push subscriptions ("my tasks changed"); a task-board widget inside Claude or ChatGPT; enterprise-managed authorization; passkey login; per-workspace endpoint URLs. |

---

## Decisions recorded in this spec

1. **One universal endpoint; the workspace is chosen at consent** and bound to the grant. One
   grant is one workspace (research §6).
2. **Embedded authorization server by default; external identity provider as an option.** A
   self-hoster must not need a third-party account (research §5).
3. **Each connection is its own agent identity.** All Claude.ai users present the same client, so
   the client cannot be the identity. At consent the human picks or creates the agent member the
   connection acts as, or picks "myself".
4. **Scopes are per space:** read and write for notes, tasks, memories, scratch and assets, plus
   offline access for refresh. No other scopes in this feature (DECISIONS).
5. **Identity arguments must match the token.** An argument that names who is acting (claimer,
   the owner of a release, the owner of a new entity) must be absent or equal the actor; any
   other value is an error, never a silent override. **Assigning** a task to another member is not
   an identity claim and is allowed. Refinement of DECISIONS ("owner/claimed_by args must be
   absent or equal the actor"): a task's `owner` is the accountable assignee (D4), so setting it
   on create or update is assignment.
6. **Note adoption is not offered remotely.** It works on foreign files by path, and foreign files
   do not sync (sync R15). 41 of the 42 tools are exposed.
7. **Remote MCP is off for end-to-end-encrypted workspaces** (DECISIONS, e2ee #23).

---

## Requirements

### Requirement: One endpoint serving current and legacy MCP clients (R1)

The server SHALL expose one MCP endpoint over Streamable HTTP. It MUST serve clients on protocol
2026-07-28 (stateless) and clients on 2025-06-18 and 2025-11-25 (initialize handshake) at the
same URL. It MUST refuse requests whose browser origin is not allowed.

#### Scenario: Legacy client

- **Given** a client that sends an initialize request with protocol 2025-06-18
- **When** it then lists tools
- **Then** it receives the tool list and can call tools without a session id

#### Scenario: Current client

- **Given** a client on protocol 2026-07-28 that sends no initialize request
- **When** it calls `shards_task_list`
- **Then** it receives the task list

#### Scenario: Hostile web page

- **Given** a web page on an unknown origin that posts to the endpoint from a browser
- **When** the request arrives
- **Then** it is refused with 403

### Requirement: Discovery and sign-in challenge (R2)

An unauthenticated request SHALL receive a 401 that points to the resource metadata and lists
the scopes. The challenge MUST be produced before any MCP processing. The resource identifier in
the metadata MUST equal the endpoint URL users type.

#### Scenario: First contact

- **Given** a client with no token
- **When** it posts any request to the endpoint
- **Then** it receives 401 with a pointer to the resource metadata and the supported scopes

### Requirement: Claude connects with its published identity (R3)

Claude.ai, Claude Desktop and Claude mobile SHALL be able to add Shards as a custom connector by
URL and sign in using Claude's client ID metadata document, without dynamic registration. Claude
Code MUST be able to do the same with a loopback redirect on any port.

#### Scenario: Claude.ai connector

- **Given** a user on claude.ai with a Shards account
- **When** they add a custom connector with URL `https://mcp.shards.app/mcp`, choose "Use Claude's
  published identity", and sign in
- **Then** the Shards consent screen shows the client host `claude.ai` and the redirect host
  `claude.ai`
- **And** after approval Claude lists the Shards tools and can call `shards_task_next`

#### Scenario: Claude Code on a random port

- **Given** Claude Code adds the server and opens the browser with a loopback redirect on port
  53127
- **When** the user approves
- **Then** Claude Code receives tokens, and the consent screen showed a warning that the client
  redirects to this computer

### Requirement: ChatGPT connects (R4)

ChatGPT developer mode and ChatGPT apps SHALL be able to connect and sign in with ChatGPT's stable
client identity. The server MUST accept ChatGPT's client metadata document format, and MUST let
ChatGPT trigger sign-in from a tool result as well as from the HTTP challenge.

#### Scenario: ChatGPT developer mode

- **Given** a ChatGPT user who adds `https://mcp.shards.app/mcp` in developer mode
- **When** they sign in and approve
- **Then** ChatGPT uses its stable client identity, receives a refresh token, and can call read
  tools

### Requirement: Consent picks workspace, acting member and spaces (R5)

The consent screen SHALL show the requesting client's host and redirect host (never only the
client's self-declared name), let the human choose exactly one workspace, choose to act as
themselves, an existing agent member they sponsor, or a new agent member (named on the screen),
and grant or withhold each requested scope. The human MUST be able to approve fewer scopes than
requested.

#### Scenario: New agent member

- **Given** lennard approves Claude.ai for workspace "Lennard"
- **When** he picks "New agent: claude-lennard" and unticks "Write memories"
- **Then** a member `claude-lennard` (kind agent, sponsor lennard) exists
- **And** the token lets the connection read memories but not write them

#### Scenario: Two connections, two identities

- **Given** lennard connects Claude.ai twice, as `claude-research` and `claude-coding`
- **When** each writes a private memory
- **Then** each memory is owned by its own agent member and is not visible to the other agent

### Requirement: Personal access tokens for headless agents (R6)

A human SHALL be able to create a personal access token for an agent member they sponsor, with
chosen scopes, one workspace and an expiry (default 90 days, maximum 1 year), from the app or
the CLI. The token MUST be shown once, stored only as a hash, listed with its last use, and
revocable.

#### Scenario: CI agent

- **Given** lennard creates a token for agent `ci-bot` with `tasks:read tasks:write`
- **When** a CI job calls the endpoint with that token in the authorization header
- **Then** it can claim and finish tasks as `ci-bot`
- **And** a call to `shards_memory_recall` is refused for missing scope

### Requirement: Scope enforcement with step-up (R7)

A call to a tool whose scope the token lacks SHALL be refused with 403 `insufficient_scope`
naming the needed scope, so the client can ask the user for more access. Cross-space read tools
(search, recent activity, build context, graph, project, session start) MUST NOT be refused for a
missing space scope; they MUST return only results from spaces the token can read.

#### Scenario: Missing write scope

- **Given** a token with `tasks:read` only
- **When** the client calls `shards_task_claim`
- **Then** it receives 403 with `insufficient_scope` and `scope="tasks:write"`
- **And** Claude prompts the user to grant more access

#### Scenario: Search without memories

- **Given** a token with `notes:read tasks:read` but not `memories:read`
- **When** the client calls `shards_search` for "flights"
- **Then** the results contain notes and tasks and no memories

### Requirement: The actor comes from the token (R8)

For every call, the acting member SHALL be the member bound to the token. An argument that states
the acting identity MUST be absent or equal the actor, otherwise the call MUST fail with a
validation error that names the actor. Assigning a task's owner to any active workspace member
MUST be allowed with `tasks:write`. List filters by owner MUST keep working, and "mine" MUST mean
the actor.

#### Scenario: Spoofed claimer

- **Given** a token bound to agent `claude-lennard`
- **When** the client calls `shards_task_claim` with `claimer: "flights-agent"`
- **Then** the call fails with a validation error "claimer must be claude-lennard or absent"
- **And** the task is unchanged

#### Scenario: Default identity

- **Given** a token bound to agent `claude-lennard`
- **When** the client calls `shards_task_claim` without a claimer
- **Then** the task's claimant is `claude-lennard`

#### Scenario: Assignment

- **Given** a token bound to agent `claude-lennard` with `tasks:write`
- **When** it creates a task with owner `lennard`
- **Then** the task is created with owner `lennard` and the activity feed shows
  "claude-lennard created t-… for lennard"

### Requirement: Private memories and scratch are enforced (R9)

A memory with private scope SHALL be readable only by its owner member and the human who sponsors
that owner. Every read path (get, list, recall, search, build context, graph, session start) MUST
apply this rule. Scratch MUST be readable only in the actor's own namespace or, for a human, the
namespaces of agents they sponsor, and writable only in the actor's own namespace.

#### Scenario: Another agent's private memory

- **Given** agent `claude-research` owns private memory m-8H2K
- **When** agent `claude-coding` calls `shards_memory_get` for m-8H2K
- **Then** it receives not found

#### Scenario: Sponsor reads it

- **Given** the same memory
- **When** lennard, connected as himself, recalls memories
- **Then** m-8H2K is among the results

### Requirement: Revocation takes effect within 60 seconds (R10)

A human SHALL be able to list the connections and tokens acting in their workspaces (client host,
acting member, scopes, created, last used) and revoke any of them from the app or the CLI. A
revoked grant or token MUST be refused within 60 seconds, and its refresh tokens MUST stop
working at once.

#### Scenario: Revoke Claude.ai

- **Given** a Claude.ai connection acting as `claude-lennard`
- **When** lennard revokes it in Connected agents
- **Then** within 60 seconds the next call from Claude receives 401
- **And** a refresh attempt fails with `invalid_grant`

#### Scenario: Stolen refresh token

- **Given** a refresh token that was already used once
- **When** someone presents it again
- **Then** the whole token family is revoked and the connection must sign in again

### Requirement: Same tools, remote-safe outputs (R11)

The endpoint SHALL expose the same tools as the local stdio server, with the same names,
annotations, inputs and error envelope, except note adoption. UI-only host tools MUST never be
exposed. Outputs MUST NOT reveal server file paths or host details: asset reads MUST return a
short-lived download link, and the health tool MUST be redacted.

#### Scenario: Asset get

- **Given** an asset a-3F9K in the workspace
- **When** the client calls `shards_asset_get`
- **Then** the result contains a vault-relative path and a download link valid for 10 minutes,
  and no server path

#### Scenario: Host tools are absent

- **Given** any token
- **When** the client lists tools
- **Then** no tool name starts with `host_` and `shards_note_adopt` is absent

### Requirement: Claims stay exclusive across remote and local agents (R12)

A claim made through remote MCP SHALL use the same server arbitration and agent lease as sync
claims, so a remote agent and a local agent on a synced device can never both hold one task.

#### Scenario: Remote and local race

- **Given** a local agent on a synced laptop and a remote Claude agent
- **When** both claim t-3C8D at the same moment
- **Then** exactly one holds the claim and the other gets a claim conflict naming the holder

### Requirement: Every write is attributed (R13)

Every write through remote MCP SHALL record the acting member, the sponsoring human and the
client host in the activity log.

#### Scenario: Activity line

- **Given** agent `claude-lennard` connected through claude.ai
- **When** it finishes t-1A2B
- **Then** the activity feed shows "claude-lennard (for lennard) via claude.ai finished t-1A2B"

### Requirement: Abuse limits (R14)

The server SHALL rate-limit tool calls per grant and authorization attempts per IP and per
client, and MUST answer over-limit calls with 429 and a retry time. Fair-use limits MUST be the
same for agent and human members (agents are free members, D5).

#### Scenario: Runaway agent loop

- **Given** a grant that sends 1,000 calls in one minute
- **When** it exceeds 600 calls per minute
- **Then** further calls get 429 with a retry time, and other grants are not affected

### Requirement: Self-host without a third-party account; external IdP optional (R15)

A self-hosted server SHALL run the full sign-in and consent flow with no external account. An
administrator MAY instead configure an external identity provider for tokens, provided it supports
client ID metadata documents and audience binding.

#### Scenario: Self-host bootstrap

- **Given** a fresh self-hosted server on a VPS with a domain and TLS
- **When** the owner creates the first user with the admin command and adds the URL in Claude.ai
- **Then** Claude connects and calls tools without any third-party account

### Requirement: E2EE workspaces refuse remote MCP (R16)

A workspace in end-to-end-encrypted mode SHALL not be selectable at consent and MUST refuse any
token for it with a clear message.

#### Scenario: Consent lists workspaces

- **Given** lennard has workspaces "Lennard" (standard) and "Private" (e2ee)
- **When** he reaches the consent screen
- **Then** only "Lennard" can be selected and "Private" shows "remote access is off for encrypted workspaces"

---

## User Experience

Consent screen (embedded authorization server):

```
Claude  ·  client claude.ai  ·  returns to claude.ai
wants to use your Shards workspace

Workspace     [ Lennard ▾ ]
Act as        ( ) Myself (lennard)
              (•) New agent  [ claude-lennard ]
              ( ) Existing agent [ research-bot ▾ ]
Permissions   [x] Read tasks     [x] Write tasks
              [x] Read notes     [ ] Write notes
              [x] Read memories  [x] Write memories
              [ ] Scratch        [ ] Assets
              [x] Stay signed in (refresh)
                                  [ Cancel ]  [ Allow ]
```

CLI for tokens and connections:

```
$ shards sync agents
GRANT     CLIENT      ACTING AS        SCOPES                         LAST USED
gr_7f2a   claude.ai   claude-lennard   tasks:rw notes:r memories:rw   2m ago
pat_91c0  token       ci-bot           tasks:rw                       1h ago
$ shards sync agents --revoke gr_7f2a
revoked gr_7f2a (claude-lennard via claude.ai)
$ shards sync token create --agent ci-bot --scope tasks:read,tasks:write --expires 90d
shd_pat_… (shown once)
```

## Non-Goals

- No client-credentials grant (Claude does not support it); headless agents use tokens.
- No token passthrough to any upstream service.
- No MCP Apps widget, push subscriptions or in-call confirmations in this feature.
- No enterprise SSO without consent (enterprise-managed authorization) in this feature.
- No new tools beyond the existing 40; multiplayer tools (members, activity, conflicts) need
  owner sign-off.
- No remote MCP for end-to-end-encrypted workspaces.

## Risks

| Risk | Mitigation |
|---|---|
| Clients lag the 2026-07-28 revision | Keep the legacy handshake on; do not require 2026-only metadata |
| Client ID metadata fetch is a server-side request forgery vector | HTTPS only, private-address block, size and time caps, optional allowlist |
| Phishing through a lookalike client | Consent shows the client and redirect hosts, warns on loopback-only clients |
| Prompt injection across members: one agent reads text another member wrote | Treat tool output as untrusted in clients; accurate destructive hints; scopes per space |
| Self-hosters need a public domain and TLS for Claude.ai | Document a tunnel setup; PATs work from local agents without exposure |
| ChatGPT write access is limited to Business and Enterprise plans | Position ChatGPT as read and plan-dependent write; Claude as primary |

## Open Questions

1. **Multiplayer MCP tools** (`members_list`, `activity_feed`, `conflicts_list`,
   `conflict_resolve`) — useful for agents in teams; need owner sign-off as surface growth.
   Recommendation: decide in multiplayer (#20).
2. **Hide tools a token cannot use** instead of listing all and stepping up — better for model
   context; costs per-token list caching. Recommendation: list all at launch, revisit with client
   behaviour data.
3. **Owner sign-off on new surface** — `shards sync agents` and `shards sync token` are proposed
   CLI growth and need explicit owner sign-off (AGENTS.md §0.4).
4. **Hosted endpoint hostname** — `mcp.shards.app` is assumed; depends on domain and trademark
   checks (market research §7).
