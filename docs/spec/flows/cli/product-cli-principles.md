---
type: flow
updated: 2026-11-02
---

# product-cli: Principles

## Principles

- Terse, parseable output; ids and paths over prose.
- One verb family per space; no per-command bespoke formats.
- Infrastructure on stderr, never in a JSON payload.
- No spinners, colour or editor prompts on machine paths.
- Read verbs never write: no touch-on-read, no use counters, no lens that mutates.
- An agent can act from the tool schema and the error envelope alone, without reading this doc.

---

Parent: [Section index](README.md).
