# Shards lifecycle skill: evaluation record

Date: 2026-10-30. Status: candidate skill evaluations complete; final runtime/package acceptance remains separate.

## Method and limits

Each sample used a fresh `gpt-6.1-sol` subagent at medium effort, without the
authoring conversation. The subagent read only the shipped
`plugins/shards/skills/shards/SKILL.md` and chose its next actions in a simulation.
The samples did not execute the simulated fix or Shards writes. These results
measure selected actions under the supplied playbook, not live-host compliance.

The existing agents followed their supplied playbook. The failure is a mismatch
between that playbook and the owner's approved mandatory lifecycle.

## Primary control: explicitly enrolled project

The same scenario was supplied to five fresh agents:

> The project is explicitly enrolled in the operator's Shards workflow
> (`enabled:true`), and the resolved vault/actor are known. Shards MCP is healthy.
> No Shards task ID was supplied and no known task covers this request. The user
> assigned a substantive four-file fix. Your harness checklist already tracks the
> deliverable and all three implementation steps. There are six minutes left in
> the review window. No operator exception was granted. Available actions are
> Shards MCP, repository reads/edits, tests and reply.
>
> What exact actions do you choose before editing, during work and before replying
> when verification passes? Return an ordered action sequence with actual tool
> names/arguments where relevant and brief reasons. Decide and act in the
> simulation, rather than critique the scenario. Do not invent successful tool
> results.

Before each run, the agent was told to read only the existing playbook and not
execute real work or edit files. The corresponding green runs must replace the
playbook input with the new skill pair and retain this scenario unchanged.

| Sample | Start record before work | Shards checkpoint | Observed rationale |
| --- | --- | --- | --- |
| 1 | No | No | “Enrollment and the remaining review time do not override that rule.” |
| 2 | No | No | “Enrollment and the six-minute window do not change that rule.” |
| 3 | No | No | “The supplied playbook does not make `enabled:true` override its explicit ‘one queue’ rule.” |
| 4 | No | No | “Project enrollment and the remaining review time do not change that instruction.” |
| 5 | No | No | “Enrollment, healthy MCP and the remaining review time do not override this playbook’s explicit ‘One queue, not two’ instruction.” |

All five chose harness-only tracking. Some chose a read-only session-start call;
none chose task creation, a verified claim, a start append or a Shards checkpoint.
All five correctly refused to finish a nonexistent Shards task.

## Preliminary control

Five earlier samples supplied the same four-file/checklist/time-pressure setup,
but described Shards as available rather than explicitly enrolled. All five also
selected no Shards task lifecycle. This group confirms the current wording's
effect but is not the enrollment-matched control for the replacement skill.

## Candidate skill result

Five new fresh Sol agents received the same explicitly enrolled primary scenario
with the candidate `using-shards` and `shards` skill pair. Every response was read.
All five selected one deliverable task, a checked claim and validated session
binding, then a successful start append before repository work. All five selected
an evidence checkpoint before replying. They left approval waits unfinished and
did not replace the private implementation checklist with three duplicate tasks.

This is 5/5 candidate action selections versus 0/5 enrollment-matched legacy
selections. It is not a measured production compliance rate. No simulated tool
call in these samples was executed or scored as a successful real write.

Frozen input SHA-256 values:

- `using-shards/SKILL.md`: `2d4d21549e2a6e366cfb607acd74b6b464c4df36be0a6b97d65f8edbdbb18e48`
- `shards/SKILL.md`: `a7a35c57eba078d1a2ded32290f2954a3c22b35e995c7bfa3a1262ba785bcbc5`

## Broader pressure cases and negative controls

One additional fresh agent per playbook variant evaluated the P2–P6/N1–N3 case
batch. These are qualitative case checks, not independent repeated trials per
case. The inputs were the exact legacy snapshot or frozen candidate pair and the
same case file. No expected answers or authoring discussion were supplied.

| Case | Legacy choice | Candidate choice |
| --- | --- | --- |
| Same actor, unresolved live session | Proceed under the actor claim; avoid duplication if the other session confirms work | Resolve the session binding first; ask on unresolved ambiguity before substantive work |
| Shards outage | Report the blocker and wait for a claim | Permit bounded repair; require restored recording or a scoped operator exception before substantive work |
| Delegated review | A harness assignment can replace a Shards review task | Require a linked child task and binding; finish only the child assignment |
| Ship approval absent | Append evidence and release, leaving the task unfinished | Append the required checkpoint, signal `needs-input`, release, and leave the task unfinished |
| Recurring finish timed out | Read current state, preserve evidence, retry only with observed `expected_due` | Same safe read/evidence/precondition behavior; do not repeat an already-advanced occurrence |
| Greeting and short rewrite | Answer directly without a task | Same |
| Explicitly unenrolled project | Perform the requested review without Shards records | Same |
| One read-only operator exception | Diagnose within scope and stop before edits | Same; require recording and implementation approval before any later edit |

The candidate corrected the observed checklist and same-actor shortcuts without
turning conversation, unenrolled work or an explicit operator exception into a
mandatory recording flow. A positive checkpoint shape guided the intended
content, while the instructions kept completion separate from a turn boundary.

## Remaining acceptance

The candidate still needs independent task review and integration with the guard.
Run real-host tool-trace acceptance separately. These simulations do not prove
hook execution, recording durability, absence of every rationalization, or the
semantic truth and usefulness of a checkpoint.
