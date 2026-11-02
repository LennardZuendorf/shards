---
type: flow
updated: 2026-11-02
---

# plan: Resolved

## Resolved

- **Product-positioning review**: superseded by the 2026-10-15 pivot.
  - Positioning, personas and pricing are now decided in [product.md](../../concepts/product/README.md) (D2, D3, D5).
  - The banked finding is fixed in code. `ROOT_ABOUT` in `src/cli/mod.rs` now names five spaces,
    and the `search` about string covers notes, tasks, memories and assets.
- **Rust rewrite for CLI startup performance**: shelved 2026-08, reversed 2026-09.
  → [tech-core.md](../../tech/core/README.md) § Performance.
- **Vault adaptivity**: resolved by the spaces model. Foreign Markdown is readable and searchable,
  and it is never mutated. → [tech-core.md](../../tech/core/README.md) § Invariants (detail).

Parent: [Section index](README.md).
