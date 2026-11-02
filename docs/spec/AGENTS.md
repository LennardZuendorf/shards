# Spec editing guide

Use the repository spec skill before editing this tree. `vibe-spec root --json` resolves this root through `.vibe/spec.json`.

- The four root hubs and folder hubs hold navigation and brief orientation, at most 80 lines.
- Detail belongs in a typed note in its matching kind folder, at most 60 lines.
- Every note has `updated:` and a link from a hub. Tech notes declare `applies:`.
- Preserve unfinished feature folders and their unit identifiers until their own wrap-up gates pass.
- New feature artifacts use the current spec router and Superpowers defaults.
- Historical verification belongs in `docs/research/`; source checks do not prove deployment or runtime execution.
- Run `vibe-spec validate` after edits. Do not suppress line budgets to make migration pass.
