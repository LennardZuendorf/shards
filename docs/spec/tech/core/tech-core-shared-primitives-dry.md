---
type: tech
applies: "**"
updated: 2026-11-02
---

# tech-core: Shared primitives (DRY)

## Shared primitives (DRY)

Every space is note-shaped, so each cross-cutting mechanic has **one** implementation the verb
families share — never per-verb copies: one frontmatter loader/emitter/document reader-writer;
one safe reader (yields nothing on I/O error, malformed YAML or non-UTF-8); one vault walk with
one skip set; one select engine (filter/sort/limit, generic over a typed view — every list verb
and the tag pull use it); one lock module and one atomic-write function; one CLI output surface
(mutation/rows/object emitters, notices, the delete guard, the error envelope); one error enum
whose `code()` is the exit status, mapped once in `main`.

Parent: [Section index](README.md).
