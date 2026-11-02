---
type: concept
updated: 2026-11-02
---

# product-roadmap: Pricing and business model

## Pricing and business model

| Tier | Price | Includes |
|---|---|---|
| **Local** | Free forever, MIT core, no account | Desktop app, CLI, stdio MCP. Unlimited tasks, projects and agents on one machine. Syncing the folder yourself (git, iCloud, Syncthing) is at your own risk; see the README's known failure modes. |
| **Personal Sync** | $5/month or $48/year, 14-day trial | Multi-device sync, version history and trash, **a hosted remote MCP endpoint for cloud agents**, phone and email capture, and web and mobile apps when they ship |
| **Team** | $8 per human seat per month | Shared workspaces, roles, verified agent identities with scoped tokens, audit and activity feed. **Agents are free members**, within the plan limits in [product-hosting.md](../hosting/README.md). |
| **Self-hosted server** | Free | One binary on SQLite, with sync and remote MCP on your own infrastructure |

- **Rationale.** Personal Sync undercuts Todoist Pro ($48 against $60 a year), and Team matches
  Todoist Business annual pricing. These match local-first price points that users already
  accept: Obsidian Sync at $4/$8 and Anytype at $4/$8/$16 (research: market §6). The hosted
  MCP endpoint is a concrete reason to pay. Cloud agents cannot reach a local stdio server.
- **Never resell LLM compute.** Notion credits, Rovo credits and Mem0's $249 graph tier all draw
  pushback from buyers. Users bring their own agent and their own model.
- **Free self-host.** It is a trust signal for the privacy-first personas, and revenue comes from
  convenience. Enterprise SSO and SCIM may become a paid add-on later. That is not decided.
- **Illustrative targets.** 1,000 Personal Sync subscribers at $48 is ≈$48k ARR. 50 teams of 6
  seats at $96 per seat per year is ≈$29k ARR. Sustainability for one maintainer starts at
  roughly 2,500 subscribers, or the equivalent mix. Cost of goods: [product-hosting.md](../hosting/README.md) § Unit economics.

Parent: [Section index](README.md).
