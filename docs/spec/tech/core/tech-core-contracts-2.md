---
type: tech
applies: "**"
updated: 2026-11-02
---

# tech-core: Contracts (2/2)

### Entity fields

`id`, `type` (any string on read; `note|log|decision|reference|project` on Shards writes),
`title`, `tags`, `owner`, `claimed_by` (absent when never claimed, `null` after release),
`created`, `updated`, `related` — the shared base block, in declaration order. Shards-native is
the frontmatter id, never the stem: an adopted file keeps its foreign filename.

| Space | Adds (delivered) |
|---|---|
| tasks | `status` (open\|claimed\|done\|cancelled), `priority` (v1 writes `high\|normal\|low`, v2 adds `urgent` → [tech.md](../architecture/README.md) § Data Contracts; reads free-form, unknown sorts last), `claimed_by`, `project`, `blocks`, `blocked_by` — readiness derived from both directions |
| memories | `kind` (default `fact`), `scope` (default `shared`; `private` is a courtesy filter, not authorisation), `project` (optional raw string; workstream-envelope membership), `importance` (1–5, default 3), `source`, `expires`, `superseded_by` |
| scratch | `type`, `name`, `agent`, `tags`, `created`, `updated` — name-addressed, no id |
| assets | `filename`, `media_type`, `bytes`, `sha256`, `blob` on the sidecar; the blob is written first |

**Appends:** finish → `## Outcome` + timestamp; cancel → `## Cancelled` + timestamp.
**Payloads:** `render::entry` emits owned keys in declaration order, then unknown keys in file
order, then `body` (when asked), then an **absolute** `path`.

Parent: [Section index](README.md).
