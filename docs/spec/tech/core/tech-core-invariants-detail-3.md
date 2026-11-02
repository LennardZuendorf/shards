---
type: tech
applies: "**"
updated: 2026-11-02
---

# tech-core: Invariants (detail) (3/3)

11. **A shared space is not Shards' to delete.** A space may resolve to a folder the operator also
    writes (`assets = "."` puts one at the vault root), so "nothing else names this file" is not
    an ownership test. A file is Shards' exactly when its **name is one Shards itself would have
    minted**, and that test is derived as the inverse of the namer so the two cannot drift; it
    must match *this* entity's id before any unlink. Frontmatter an agent or an editor can write
    (an asset's `blob`) names a file only through that test — passing the sandbox check answers
    "inside the vault", never "mine".

Parent: [Section index](README.md).
