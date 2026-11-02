---
type: concept
updated: 2026-11-02
---

# product-roadmap: Todoist parity matrix (1/4)

## Todoist parity matrix

The scope contract. R1 is met when every **MVP** row reads "have". Tiers: **MVP** is the Now
horizon, **v1** is Next, **later** is Later. Status as of 2026-10-16:
- **have**: the row's evidence passes. For an MVP row that means its step in the desktop-app/22
  acceptance run ([features/desktop-app/plan.md](../../features/desktop-app/plan.md) § desktop-app/22,
  parity evidence steps P1–P31) passes in both modes against a 15-DONE core. Code that exists but
  has not passed its step reads "building";
- **building**: the capability is in a Now arc, built or not;
- **planned**: it is scheduled in a named Next or Later arc;
- **not planned**: it is deliberately out of scope.

**Owning requirement** names the requirement whose scenarios define the row. Feature requirement
ids read `<feature> R<n>`; app-polish outcomes read `AP<n>` (§ Next). **Evidence** names the test
file and the acceptance step that flip the row to "have". Next and Later rows get their evidence
when their arc's plan is written. A row with no owning requirement cannot be scheduled.

Todoist P1–P4 map to urgent, high, normal and low. Todoist labels are Shards tags, shown as
labels. Assignee and delegate are owner and claimed_by.

Parent: [Section index](README.md).
