---
type: flow
updated: 2026-11-02
---

# product-cli: Errors and degradation

## Errors and degradation

- Human mode: one plain-text line on stderr.
- Machine mode (`--json`): exactly one JSON object on stderr with `kind`, `message`,
  `next_action` and structured fields, plus `candidates` on a not-found and `retry_after_ms` on a
  lock conflict. Exit codes are identical in both modes. No `next_action` may read as an
  authorisation decision. MCP renders the identical object, and the desktop app shows `message`
  and `next_action` in its error toast.
- Degradation (substring fallback, a missing search binary, a blocked claim, an unblock report, a
  duplicate title, a dangling rename) is one stderr line, suppressed by `--quiet`, and never
  enters a payload.
- Exit codes are a typed contract owned by [tech.md](../../tech/architecture/README.md).

---

Parent: [Section index](README.md).
