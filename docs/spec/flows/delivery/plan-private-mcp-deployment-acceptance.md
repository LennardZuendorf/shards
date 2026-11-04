---
type: flow
updated: 2026-11-04
---

# Private MCP deployment acceptance

**Current result: local source path EXECUTED once, DEPLOYMENT UNPROVEN.** On 2026-11-04 the merged
source ran end to end on loopback: the real `shards-gateway` receiver and the real Node `/mcp`
adapter served a throwaway vault with throwaway credentials, with no Tailscale, DNS or public
listener. It answered initialize, `tools/list` (17 of the 39 tools for a `notes:write` +
`memories:read` grant), a read, a write, and refused unpermitted tools, ungranted spaces, foreign
identities, wrong Host/Origin, missing or invalid tokens (`401` with `WWW-Authenticate: Bearer
realm="shards-private"` and no `resource_metadata`) and a revoked grant. Evidence:
[first-run receipt](../../../../queries/shards-remote-mcp-first-run.md).
Any 16p DONE status refers only to local source; it does not close this gate. Image execution, real
Tailscale networking and Vercel support have not been proven. The root daemon declaration has zero
instances. No deployment, installation, live-vault trial or tailnet change is approved. The
[receipt](../../../research/private-remote-feasibility.md) records local evidence and limits; the
[runbook](../../../private-remote-mcp.md) owns operator steps. Local tests, one loopback run and
official platform documentation cannot establish the combined topology.
The public OAuth/synced-vault feature 19 remains designed, NOT STARTED; this private delivery
does not start sync, billing or public OAuth and does not gate desktop's local dispatch seam.

- [ ] Obtain explicit trial authorization identifying disposable project/team, spend limit,
  synthetic vault/config and receiver, client environments, tailnet Service/tags/HTTPS grants,
  short-lived credentials, enrollment identity and cleanup owner. Confirm secret injection.
- [ ] Build and execute the pinned image; prove native userspace Tailscale, TLS/DNS and explicit
  CONNECT routing with a destination that cannot resolve locally.
- [ ] Obtain written platform support clarification for private overlay ingress on Vercel;
  prove real private Service advertisement and cloud-to-local forwarding. FAIL or UNPROVEN
  blocks release; no public route, Funnel or unapproved provider fallback is selected.
- [ ] Use the chosen real HTTP MCP client and a second enrolled environment. Prove stable
  discovery, denied access outside the tailnet, exact Host/Origin guards and no public site data.
- [ ] Prove all 39 policy entries (39 of the 42 local tools), mixed-space/private/overlapping-root visibility, hidden
  blockers, actor races, expiry/revocation, overload and uncertain-write handling on the trial.
- [ ] Exercise restart/redeploy, rollout overlap, bounded shutdown, child reaping, loss of
  receiver/overlay readiness and log redaction. Verify CLI/stdio/app with new processes stopped.
- [ ] Remove disposable nodes, Services, secrets and cloud resources; record resource IDs and
  cleanup evidence. Removing an enrollment key alone does not remove an enrolled node.
- [ ] Record PASS evidence and obtain separate verify-to-ship approval before activation.


Parent: [Section index](README.md).
