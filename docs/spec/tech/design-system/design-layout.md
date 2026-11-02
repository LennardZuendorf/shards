---
type: tech
applies: "**"
updated: 2026-11-02
---

# design: Layout

## Layout

The sidebar is 224px with three separated trays: Tasks, Agent team and Library. Search and Add
task sit above the trays; operator identity, appearance and Settings sit below them. Tasks
includes the existing project and label lists. Collapse state and keyboard routes remain.

The main content is a rounded card on frame. Task lists use 44px comfortable rows and 36px
compact rows. Existing saved density choices keep their meaning. Metadata may increase row
height to prevent clipping. Focus uses 46px minimum rows in a centered 620px content column.
Actions reserve their own row space in hover and keyboard states. Wrapped metadata must not
cover other metadata or vertically displace the title below its completion control.

The detail surface is 372px preferred width and remains scrollable independently. At 1100px
and wider it floats inside a reserved right column rather than hiding list rows. Below 1100px
it overlays the list with dialog focus handling. Below 768px it occupies the available width
and the sidebar is a drawer. At 200% zoom, layout reflows; the app never scales a screenshot.
Boards may scroll horizontally within their own region, while the document does not overflow.

Parent: [Section index](README.md).
