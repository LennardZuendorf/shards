# Local package loading and candidate preview

> Historical probe evidence. The Python candidate was rejected and replaced by the [native Rust implementation](../../../.spec/tech-surfaces.md#local-agent-harness). These observations establish host payload/package discovery contracts, not execution of the replacement hooks.

Date: 2026-10-30. Tested pins: Claude Code `2.1.314` and app-bundled Codex `0.165.0-alpha.1.2`.

**PASS:** inert package loading, MCP root expansion, namespace and successful read-only real MCP calls on both hosts. **PASS:** read-only parser preview of the actual generated legacy Codex artifact exposes all six intended hooks, server `shards`, and both skills. The candidate artifact was not installed, trusted, enabled or executed. Full candidate hook/runtime acceptance remains separate.

The execution probes used the real hosts and temporary Shards `0.2.0` MCP server, driven by deterministic localhost mock model APIs. They prove transport and packaging behavior, not model obedience or hosted API connectivity. Normal-user configuration/install, credentials and the live vault were unchanged. The inert Codex package was registered/installed only inside the explicitly approved disposable HOME/CODEX_HOME. No new hook trust was granted.

## Curated durable evidence

All retained package evidence is under `plugins/shards/tests/fixtures/package/`:

| Artifact | Preserved proof |
| --- | --- |
| `claude-package-execution.json` | Actual host init/plugin server, lifecycle catalog names, successful task-get PostToolUse and expanded wrapper invocation |
| `codex-package-execution.json` | Actual successful health PostToolUse, connected plugin runtime inventory, lifecycle code catalog and expanded cached wrapper invocation |
| `inert-package-inputs.json` | Actual inert manifests, MCP configuration and safe logging wrapper source; no hooks |
| `codex-disposable-install.json` | Actual normal temporary install/registration outputs and confined state paths |
| `codex-legacy-artifact-preview.json` | Actual generated candidate's read-only response, exact input manifest/MCP/hooks and SHA-256 values for every source artifact file |
| `codex-portable-shadow-control.json` | Actual portable-root-plus-legacy negative control, including both input manifests, hook file and empty hook preview |
| `provenance.json` | Scope, sanitization, hashes/sizes and recoverable raw-history archive location |

The combined execution records are explicitly labeled excerpts. Their callbacks and manifest values are observed data; they are not constructed fixtures. Full raw streams, repeated declaration experiments, original manifests and duplicate logs were moved byte-for-byte to the disposable archive recorded below. Tests import only `fixtures/observed`; none imports this package-evidence directory. `fixtures/observed` was not changed.

## Namespaces and provenance

| Context | Hook tool namespace | Provenance |
| --- | --- | --- |
| Claude dynamic server, earlier | `mcp__shards__...` | hook `mcp_server:{"name":"shards","source":"dynamic"}` |
| Claude package | `mcp__plugin_shards_shards__...` | hook `mcp_server:{"name":"plugin:shards:shards","source":"plugin"}` |
| Codex dynamic server, earlier | `mcp__shards__...` | no hook mcp_server/pluginId field |
| Codex package | `mcp__shards__...` | no hook mcp_server/pluginId field; runtime inventory has `name:"shards"`, `pluginId:"shards@shards-capability"`, `runtimeStatus:"connected"` |

The exercised names were `mcp__plugin_shards_shards__shards_task_get` and `mcp__shards__shards_health`. Their actual PostToolUse callbacks are retained. Claim/append names were observed in each host's catalog, not invoked through the package.

For this package/server identity, lifecycle matchers are `^mcp__plugin_shards_shards__shards_task_claim$` / `^mcp__plugin_shards_shards__shards_task_append$` on Claude, plus its exact plugin descriptor. Codex uses `^mcp__shards__shards_task_claim$` / `^mcp__shards__shards_task_append$`. Codex names collide with dynamic-server names; hook names alone do not attest origin. Establish configured/runtime origin separately. Collision resolution with simultaneous same-named dynamic/plugin servers was not tested.

## Observed root expansion and bounded loading

Claude loaded the inert source package with session-only `--plugin-dir`, isolated HOME/CLAUDE_CONFIG_DIR, empty normal setting sources and existing temporary observer settings. Its `.mcp.json` used `command:"python3"`, `args:["${CLAUDE_PLUGIN_ROOT}/scripts/mcp_probe.py"]` and explicit temporary Shards env. The wrapper actually ran at the source package path with `CLAUDE_PLUGIN_ROOT` set, `PLUGIN_ROOT:null`, and project cwd. The exact allowed tool was `mcp__plugin_shards_shards__shards_task_get`; `--strict-mcp-config` was omitted because it suppressed plugin MCP.

Codex normal `plugin add` / `plugin marketplace add` registered only the local test source under `/private/tmp/shards-host-capability-2nxaecmd/package-probe`. HOME, CODEX_HOME, XDG paths, TMPDIR, sqlite and logs stayed under the disposable root. Its inert installedPath was `/private/tmp/shards-host-capability-2nxaecmd/codex-home/plugins/cache/shards-capability/shards/0.0.0-capability`. No hook-containing candidate was installed. The source portable `mcp.json` used `type:"stdio"`, `command:"python3"`, `args:["${PLUGIN_ROOT}/scripts/mcp_probe.py"]`, and explicit temporary config. The cached wrapper actually ran with `PLUGIN_ROOT` equal to installedPath, `CLAUDE_PLUGIN_ROOT:null`, and cwd equal to that plugin cache root.

The wrapper logged only safe invocation fields, then execed the temporary Shards MCP binary. The retained install/path record documents the preflight. Three existing `tmp/arg0` executable aliases pointed to the installed Codex binary; these were read-only executable aliases, not configuration/plugin-state escapes.

## Actual generated legacy candidate parser preview

Read-only `plugin/read` inspected `/private/tmp/shards-agent-package-verified-91eoht2n/shards-codex` through an unregistered temporary marketplace and a verified read alias. No install, enable, trust, thread-start or candidate command execution was sent. The returned source is tied to the artifact by retained file hashes and the verified alias target.

The actual result has `installed:false`, `enabled:false`, no parser error, MCP server `shards`, and both `shards:shards` and `shards:using-shards` skills. Hook summaries are exactly:

- `preToolUse`
- `postToolUse`
- `sessionStart`
- `subagentStart`
- `subagentStop`
- `stop`

The artifact contains **no root plugin.json**. Its `.codex-plugin/plugin.json` includes:

```json
{
  "name": "shards",
  "version": "0.2.0",
  "hooks": "./hooks/codex.json",
  "mcpServers": "./mcp.json",
  "skills": "./skills/"
}
```

The referenced MCP file has named stdio server `shards`. The actual hooks reference `python3 "${PLUGIN_ROOT}/scripts/harness.py" --host codex`. The parser's discovery of these commands is not execution evidence. The candidate command and six-hook set are retained as actual inputs in the preview artifact.

## Portable declaration limit on the tested pin

Current official docs allow portable root `extensions.com.openai.hooks` as a `./` path, path array, inline object or object array. An inline object is not required by that documented contract.

The installed parser preview did not expose hooks from tested portable root path/inline/default declarations. It also returned empty hooks for root-plus-legacy copies. A legacy-only source did preview hooks. The retained negative control shows both root and legacy manifests plus a readable hook file, but `hooks:[]`, installed/enabled false. This is why the pinned artifact is legacy-only. These previews do not establish how every installed runtime/version behaves. The fuller variant history is recoverable in the archive; it is not duplicated in the review diff.

The chosen explicit `mcpServers:"./mcp.json"` and `skills:"./skills/"` declarations were also positively previewed in prior exact-name tests. Both portable stdio-shaped and legacy command-shaped referenced MCP files worked; default `.mcp.json` worked too. Those controls were archived after the actual generated artifact supplied the stronger final positive proof.

## Project context and config selection

The observed Codex MCP cwd and PLUGIN_ROOT are the plugin cache root. Neither identifies the thread's project. Codex docs document explicit server cwd/env/env_vars; this research established no Codex per-thread project-root MCP environment variable or substitution. Do not invent CODEX_PROJECT_DIR or CODEX_CWD.

Claude documents CLAUDE_PROJECT_DIR for stdio servers, but it denotes the original session project and remains there when entering a worktree. It was not logged by our wrapper. It is not a proven cross-host current-project contract. Hook-event cwd was observed separately and cannot be assumed to become MCP environment.

Keep the selected design default: preserve an existing host-launch SHARDS_CONFIG_PATH pin; otherwise preserve ambient normal Shards configuration for standalone use. In enrolled operation, compare the resolved ambient MCP context against enrolled selected context and deny mismatch before writes. Do not guess enrollment from cached package cwd or silently retarget a shared MCP process.

## Remaining acceptance and sources

The scoped package/MCP prerequisites and actual candidate parser preview pass. Candidate hooks have not run; no new definitions were trusted. Candidate enrollment/receipts/concurrency, packaged lifecycle mutations, interruption and native desktop integration still require their planned acceptance. Normal-user installation/activation remains unapproved.

- [OpenAI local stdio and PLUGIN_ROOT](https://developers.openai.com/plugins/deploy/desktop-only.md)
- [OpenAI plugin/hook declaration](https://developers.openai.com/plugins/build/plugins.md)
- [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp.md)
- [Codex environment variables](https://learn.chatgpt.com/docs/config-file/environment-variables.md)
- [Claude plugin manifests](https://code.claude.com/docs/en/plugins-reference.md)
- [Claude hook/project-path reference](https://code.claude.com/docs/en/hooks.md)

## Evidence curation record

Retained **7 files, 23186 bytes** in the package evidence directory (including provenance). Original package evidence: 76 files, 97831 bytes. Every original file was moved and hash-checked; no raw history was discarded. Recoverable archive: `/private/tmp/shards-host-capability-2nxaecmd/package-evidence-archive-2yxm9w6a`; its `archive-manifest.json` records every original path/hash. The final artifact read was additional read-only validation. Tests/code and Task 1 observed fixtures were left unchanged.


## Final reviewed artifact refresh

The current parser evidence targets `/private/tmp/shards-agent-package-verified-91eoht2n/shards-codex` (eight source files). Read-only plugin/read again returned all six intended hook summaries, MCP server `shards`, both skills, installed false and enabled false, with no parser error. Manifest, hook, MCP and skill declarations match the previous artifact; only current source hashes were refreshed. No candidate command ran. The prior response/provenance/report snapshot is recoverable at `/private/tmp/shards-host-capability-2nxaecmd/package-evidence-archive-2yxm9w6a/reviewed-preview-refresh-mk0pdb38`. The six other curated package files retain their previous bytes, except provenance which records the refresh. Source/tests/skills and observed fixtures were not changed.
