# Local agent harness capability evidence

> Historical probe evidence. The Python candidate was rejected and replaced by the [native Rust implementation](../../../.spec/tech-surfaces.md#local-agent-harness). These observations establish host payload/package discovery contracts, not execution of the replacement hooks.

Date: 2026-10-30. Task 1 gate: **PASS for dynamic-host receipt primitives**, enabling Tasks 2/3. The full package contract freeze is **PARTIAL / ACCEPTANCE DEPENDENCY** until Task 4 observes package namespace and root substitution; candidate-runtime acceptance remains Tasks 4/5.
No production implementation, installation, enrollment, or normal host configuration change is established by this report. The owner separately approved trusting exactly six disposable Codex hook definitions; that approval was exercised through the normal hook UI.

## Evidence boundary

Claude observations below came from the installed real host and real Shards MCP server, driven by a deterministic localhost mock Messages API. The mock emitted predetermined tool calls; it did not evaluate the skills. These observations establish hook transport and tool execution, not model obedience, semantic checkpoint quality, or hosted model connectivity. All task writes went to a disposable vault.

Codex observations use the app-bundled real host, the same real temporary Shards MCP server, and a deterministic localhost mock Responses API. Trusted command hooks executed on the nested code-mode tool path. Official documentation is not treated as runtime evidence.

Disposable probe root: `/private/tmp/shards-host-capability-2nxaecmd`. No credentials were read or copied. Isolated configuration directories have no real login. The first network-backed Codex probe failed DNS resolution inside the sandbox and was stopped. The sandbox also rejected localhost listening; the bounded mock runs used approved elevated execution. No sandbox or hook-trust bypass flag was used.

## Durable observation evidence

Sanitized source evidence lives in [`plugins/shards/tests/fixtures/observed/evidence/`](../../../plugins/shards/tests/fixtures/observed/evidence/). [`manifest.json`](../../../plugins/shards/tests/fixtures/observed/evidence/manifest.json) lists provenance, extraction rules, source artifacts, and SHA-256 values. The retained files contain actual output or explicitly labeled request excerpts:

| Claim | Durable artifact in `plugins/shards/tests/fixtures/observed/evidence/` |
| --- | --- |
| Fresh Codex task started open, became claimed, and contains checkpoint | `codex-task-before.json`, `codex-task-canonical-read.json`, `codex-probe-stream.jsonl` |
| Claude checkpoint is present in canonical task body | `claude-task-before.json`, `claude-task-canonical-read.json`, `claude-probe-stream.jsonl` |
| Exactly six definitions trusted with recorded hashes | `codex-hooks-list-trusted.json` |
| Startup marker reached each outgoing model request | `codex-startup-request-excerpt.json`, `claude-startup-request-excerpt.json` |
| Bash denial actually reached the tool caller | `codex-denial-result.txt`, `claude-denial-result.json` |
| Full event order, success callbacks, absence of Codex error success callback | `codex-hook-events.jsonl`, `claude-hook-events.jsonl`, and the corresponding complete `*-probe-stream.jsonl` files |

The startup request files omit unrelated instructions and are labeled excerpts. The Claude excerpt was captured in a no-work follow-up run with the same startup hook. The lifecycle streams and event logs remain the original successful receipt probe sessions. Sanitized `hooks/list` paths are not valid trust-registration inputs; their hashes are the observed hashes of the original approved disposable definitions.

## Baseline and installed versions

The approved plan records base `56a4777bc16602d83f8072e8269e2b4e1b041de7`, successful offline build, 1477 core tests passed, and spec validation with 0 errors / 70 pre-existing warnings. This research track did not repeat that baseline.

| Component | Absolute executable | Observed version |
| --- | --- | --- |
| Codex on PATH | `/Users/lennarddib/.nvm/versions/node/v24.15.0/bin/codex` | `codex-cli 0.160.1` |
| App-bundled Codex | `/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex` | `codex-cli 0.165.0-alpha.1.2` |
| Current Claude Code | `/Users/lennarddib/.local/bin/claude` | `2.1.314 (Claude Code)` |
| Homebrew Claude Code | `/opt/homebrew/bin/claude` | `2.1.277 (Claude Code)` |
| Python | `python3` | `Python 3.14.7` |
| Temporary build | `/private/tmp/shards-agent-harness-target/debug/shards` | `0.2.0` |

Use absolute binaries. One env-prefixed invocation resolved the older Homebrew Claude despite a preceding PATH version query returning the newer binary. Its stream initialization exposed the mismatch. Only the absolute 2.1.314 binary received the full Claude probe.

## Observed capability matrix

| Capability | Claude Code 2.1.314 | App-bundled Codex 0.165.0-alpha.1.2 |
| --- | --- | --- |
| Temporary hook source | `--settings FILE --setting-sources ''`; observed | Disposable `$CODEX_HOME/hooks.json`; all six trusted after explicit approval, no schema errors |
| Startup context | Command hook succeeded; marker appeared in actual outgoing mock-model request | Observed: injected marker reached actual model request |
| PreToolUse denial | Bash denied with `SHARDS_TEST_DENY`; no Bash PostToolUse followed | Observed: nested Bash denied with SHARDS_TEST_DENY |
| Successful Shards claim | Actual MCP tool executed; PostToolUse captured `status:"claimed"`, `claimed_by:"probe-agent"` | Actual new task transitioned open to claimed; PostToolUse captured state |
| Successful Shards append | Actual MCP tool executed; normal CLI task reader confirmed checkpoint text | Actual MCP append; canonical CLI reader confirmed exact checkpoint text |
| Shards failure | Invalid task claim emitted PostToolUseFailure with structured error text; no successful PostToolUse | Failed CLI MCP item; no PostToolUse hook, so no success receipt |
| Stop continuation | First Stop had `stop_hook_active:false`; one block response caused another model request; next Stop had `true` and was allowed | Same false → one continuation → true sequence observed |
| Delegated agent | Agent tool created child; SubagentStart/Stop contained child agent_id; child Read PreToolUse also contained same agent_id | Child PreToolUse carries parent session_id plus matching child agent_id/agent_type |
| Resume | `--resume ID` retained session_id and emitted `source:"resume"` | Observed: same session_id and source resume |
| Fork | `--resume ID --fork-session` produced new session_id and `source:"fork"` | Observed: new session_id and source fork |
| Compaction | Documented only | Documented only |
| Interruption / closure | Documented only; not exercised | Documented only; not exercised |
| Native desktop UI | Not exercised | Bundled binary hooks executed; native desktop conversation and candidate package not exercised |

## Claude adapter contract frozen by observed inputs

Fixtures are under `plugins/shards/tests/fixtures/observed/`. They are direct event payloads. `claude-provenance.json` states version, stimulus, and sanitization. Temporary roots and session/prompt/delegate identifiers are replaced consistently. Field types and relationships are preserved. No constructed payload is labeled observed.

Common identity: `session_id` and `cwd`. Root work events carry `prompt_id`; delegated work carries the parent's same `session_id` and adds `agent_id` and `agent_type`. A root receipt must not be granted to a child by omitting agent_id. `tool_use_id` identifies a call. Resume retained the root ID; fork changed it. Startup events did not contain `prompt_id`.

Observed tool names: `Bash`, `Read`, `Agent`, `mcp__shards__shards_task_claim`, and `mcp__shards__shards_task_append`. For explicit hooks, use exact anchored matchers such as `^mcp__shards__shards_task_claim$`; enumerate the selected package's actual MCP namespace. Do not accept arbitrary suffix or substring matches. A broad work gate must also cover other supported tools, using a default-deny policy and narrowly defined recording/clarification/repair exceptions.

Successful MCP PostToolUse fields:

- `hook_event_name: "PostToolUse"`
- `tool_name`, `tool_input`, `tool_use_id`
- `tool_response`: **a string containing JSON task data**, not the raw MCP CallToolResult envelope
- `mcp_server: {"name":"shards","source":"dynamic"}`
- `duration_ms`, session/delegate identity

The claim result included `id`, `status`, and `claimed_by`. The append result included task metadata but **no body**. Therefore an append receipt must be corroborated through the normal Shards reader; success metadata alone does not prove the intended text was appended. A normal CLI read confirmed the exact test checkpoint and an unfinished claimed task.

Failure fields on the tested MCP error:

- `hook_event_name: "PostToolUseFailure"`
- `tool_name`, `tool_input`, `tool_use_id`
- `error`: a JSON string with `kind:"not_found"`, `message`, `next_action`, `task_id`, and `candidates`
- `is_interrupt:false`; `mcp_server` and timing metadata

An error must never produce a successful lifecycle receipt. Do not require errors to appear as `PostToolUse.tool_response.isError`: that is not the observed Claude shape. Other non-Shards tools use different response types; the observed Read result was an object.

Command output observed at startup:

```json
{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"The capability probe marker is SHARDS_CONTEXT_7E4B."}}
```

Synchronous PreToolUse denial:

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"SHARDS_TEST_DENY"}}
```

One bounded Stop/SubagentStop continuation, then `{}` on the next stop:

```json
{"decision":"block","reason":"SHARDS_TEST_CONTINUE_ONCE: finish the temporary capability probe."}
```

The actual probe script persisted a per-session/delegate continuation marker under the disposable root. The observations do not prove enforcement against a hostile local process.

## Codex adapter and approved trust evidence

The owner explicitly approved the six disposable definitions. Before selection, the immutable script/config SHA-256 values were rechecked. The held normal `/hooks` UI showed the six known definitions, then its `t` action trusted all six. A fresh app-server `hooks/list` response independently confirmed six `trustStatus:"trusted"` values, no errors, and unchanged definition hashes. No dangerous bypass flag, normal configuration, installed plugin, credential, or live vault was used.

Immutable reviewed files remain:

- `/private/tmp/shards-host-capability-2nxaecmd/codex-recorder-final.py`, SHA-256 `51286891a46cb5d6ca33dd65ccaab41e4979002e6386bc8ee3bc8fbd51d0a0a7`.
- `/private/tmp/shards-host-capability-2nxaecmd/codex-home/hooks.json`, SHA-256 `812cce12aca251913830abb525ef498bcd05f1cda428708735a2e4e82f707890`.

The normal trust command was:

```sh
CODEX_HOME=/private/tmp/shards-host-capability-2nxaecmd/codex-home TERM=xterm-256color /Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex --no-daemon --no-alt-screen -C /private/tmp/shards-host-capability-2nxaecmd/work
```

Its disposable config selected a no-auth localhost provider. The exact warning was `Hooks can run outside the sandbox after you trust them.` The UI also said `Hooks need review` and `6 hooks are new or changed.` `codex hooks trust` is not an installed CLI command. No trust key/hash was manually fabricated or written. The generated experimental app-server schema offered `hooks/list`, not a trust-mutation method.

`mock_codex.py` runs the actual bundled `codex exec` with a disposable CODEX_HOME and a local Responses API provider. It exposes only `shards_task_claim` and `shards_task_append`, with per-invocation exact `mcp_servers.shards.tools.<tool>.approval_mode="approve"` settings. This authorizes only the already-approved temporary writes. An earlier run without those settings rejected the calls with `MCP tool call requires approval, but approval policy is never`; those calls emitted no success receipts. Normal MCP approval remains separate from hook trust.

The installed model protocol put tool definitions in an `additional_tools` input item. The mock emitted `functions.exec` custom calls, whose JavaScript called `tools.exec_command` or `tools.mcp__shards__shards_task_claim/append`. Actual nested calls fired the hooks. The denied shell call had `tool_name:"Bash"` and `tool_input.command`, even though JavaScript supplied `exec_command({cmd:...})`.

Observed successful Codex MCP PostToolUse `tool_response` is an object with `content` (text blocks containing task JSON) and **`structuredContent`** (camelCase task data). There was no `isError` field on the observed successes. The separate CLI JSONL item exposes **`structured_content`** (snake_case); it is not the hook schema. The failed task claim produced a CLI item with `status:"failed"`, content containing structured not_found JSON, and `structured_content:null`. It emitted **no PostToolUse**. The error fixture is explicitly labeled a CLI stream item, never a hook input.

Both successful append envelopes omit task body. A fresh task `t-12K6` started open, was claimed by the real Codex MCP call, and received the checkpoint append. The canonical Shards CLI reader confirmed `status:"claimed"`, `claimed_by:"probe-agent"`, and the exact appended text. It remained unfinished. The earlier same-actor successful claim was a no-op; this fresh transition avoids treating no-op success as new execution.

Codex child PreToolUse carried parent `session_id`, a distinct `agent_id`, `agent_type:"default"`, its own `turn_id`, and its child transcript path. SubagentStart/Stop used the same child identity. SubagentStop false/true continuation was observed. Resume retained the root ID; fork used a new root ID/source fork. `collaboration.spawn_agent` was normalized by this host to hook `tool_name:"collaborationspawn_agent"`; wait was `"collaborationwait_agent"`. Do not assume a literal Agent tool name for every Codex collaboration path.

## Exact normalizer input contract

| Normalized field | Claude Code 2.1.314 | Codex 0.165.0-alpha.1.2 |
| --- | --- | --- |
| Event | `hook_event_name` | `hook_event_name` |
| Root session | `session_id` | `session_id` |
| Delegate | optional `agent_id`, `agent_type` | optional `agent_id`, `agent_type` |
| Work directory | `cwd` | `cwd` |
| Turn reference | optional `prompt_id` | optional `turn_id` |
| Tool/call | `tool_name`, `tool_input`, `tool_use_id` | `tool_name`, `tool_input`, `tool_use_id` |
| MCP success | `PostToolUse.tool_response`: JSON **string** | `PostToolUse.tool_response`: MCP **object**, `structuredContent` and `content` |
| MCP failure observed | `PostToolUseFailure.error`: JSON string; `is_interrupt` | no PostToolUse; failed CLI item is diagnostics, never a receipt |
| Tool server | `mcp_server.name`, `mcp_server.source` | encoded in exact `mcp__shards__...` tool name; no mcp_server on these hook inputs |
| Session restoration | `SessionStart.source` = startup/resume/fork | same |
| Stop continuation | `stop_hook_active`, `last_assistant_message` | same |
| Child stop context | `agent_transcript_path`, `background_tasks`, `session_crons` | `agent_transcript_path`; no background_tasks/session_crons observed |

All startup events lacked a turn reference; require only the identity needed for that event. Child work must not inherit a root receipt by dropping `agent_id`. Missing required identity or an unrecognized result shape cannot create an approval receipt. Do not ingest CLI stream items through the hook normalizer.

## Proposed candidate entrypoints and acceptance dependency

Freeze these **proposed** package commands for implementation. They were not executed by this capability probe:

| Host | Proposed command |
| --- | --- |
| Claude Code | `python3 "${CLAUDE_PLUGIN_ROOT}/scripts/harness.py" --host claude` |
| Codex | `python3 "${PLUGIN_ROOT}/scripts/harness.py" --host codex` |

The Python standard-library runner reads one event JSON object from stdin and writes one event-appropriate structured JSON response to stdout. Diagnostic output goes to stderr. The tested recorder used an absolute temporary script path; no observed candidate invocation is claimed here.

The substitution syntax above is documented by the respective official hook/plugin references. **Runtime substitution and installed-plugin MCP namespace are not yet observed.** Task 1 freezes only the proposed syntax, normalizer fields, dynamic-server matcher evidence, and explicit support policy. The actual package-specific namespace and command resolution remain a **Task 4 acceptance dependency**, followed by candidate-runtime checks in Task 5. Task 4 must prove the resolved runner path and exact installed MCP tool names in temporary package runs before declaring that wiring enabled. It must not reuse `mcp__shards__...` merely because that name appeared in a dynamic-server probe.

Dynamic-host receipts unlock Tasks 2/3. They do not complete the full Task 1 package contract freeze, enable package guards, or waive Task 4/5 acceptance.

## Explicit initial support policy

The initial acceptance target supports **only the exact observed host pins**: Claude Code `2.1.314` and app-bundled Codex `0.165.0-alpha.1.2` on the tested local macOS environment. This is an allowlist policy, not a minimum-version or semver range. Codex CLI `0.160.1`, Homebrew Claude `2.1.277`, all other versions, other operating systems, cloud clients, and native desktop conversation wiring remain unsupported by this evidence until their required probes pass.

These pins are eligible for package implementation and final acceptance; this policy does not claim that the candidate harness has already passed package acceptance. A host upgrade or changed hook envelope requires rerunning the capability and package checks before adding that version. Python `3.14.7` is the observed runner; the plan's Python 3.11+ prerequisite remains an implementation target, not a tested range established here.

## Packaging and documented limits

Current official sources:

- [Codex hooks](https://learn.chatgpt.com/docs/hooks.md)
- [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins)
- [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp.md?surface=cli)
- [Claude Code hooks](https://code.claude.com/docs/en/hooks)
- [Claude plugin manifest reference](https://code.claude.com/docs/en/plugins-reference.md)

Codex documents root portable `plugin.json`, `mcp.json`, and `skills/`; OpenAI hook settings go under `extensions.com.openai`. `.codex-plugin/plugin.json` remains a compatibility fallback. The packaging page restricts hook-containing plugins to manual desktop installation and excludes them from the public plugin directory. That limits distribution; it does not prove these hooks executed in a desktop conversation.

Claude uses `.claude-plugin/plugin.json`, `.mcp.json`, `skills/`, and `hooks/hooks.json`. Plugin-root substitution is documented as `${CLAUDE_PLUGIN_ROOT}`. Codex documents `${PLUGIN_ROOT}` and compatibility `${CLAUDE_PLUGIN_ROOT}`. This probe used absolute temporary command paths and a dynamic MCP server; **plugin loading, installed-plugin MCP namespace, and plugin-root substitution remain unobserved**. Do not freeze a plugin-specific namespace from this dynamic-server probe.

Both hosts document direct `mcp_tool` hooks. Codex requires an existing connection and may reach SessionStart before MCP is ready. Claude skips startup/resume SessionStart MCP hooks before connection availability. MCP errors are non-blocking. Command bootstrap avoids that startup dependency.

Codex documents PreToolUse coverage for Bash, apply_patch, MCP, and most local function tools. Hosted tools and specialized paths can opt out; write_stdin does not repeat PreToolUse for an existing process. Errors or unsupported output shapes can fail the hook without blocking the underlying tool. A PostToolUse decision cannot undo side effects. Stop continuation is a turn boundary, not proof that a task completed. SessionEnd is advisory, short-lived, and does not run for subagents.

Claude documents PreToolUse excluding EndConversation, and no PreToolUse event for files attached directly with `@`. PostToolUse cannot undo a tool. Stop does not run after user interruption; API errors use StopFailure. Stop/SubagentStop have loop protection. `onFailure:"block"` exists for command/HTTP hooks from 2.1.295, but does not apply to Stop/SubagentStop. This mechanism was not needed or exercised by the successful hooks here.

The explicit support policy above governs these tested pins. No guarantee covers earlier/later releases, all tool paths, crash recovery, remote/cloud execution, or an untested client.

## Gate decision

**PASS for Task 1 dynamic-host receipt primitives.** Both installed hosts executed startup injection, a denied work tool, successful real Shards claim/append, failure exclusion, one bounded stop continuation, delegated work identity, resume, and fork. The fixture set contains 13 observed Claude hook payloads, 12 observed Codex hook payloads, one clearly labeled Codex failed-call CLI item, and two provenance files.

**Full package contract freeze remains partial; Tasks 4/5 final acceptance remains unproven.** This recorder is a probe, not the candidate harness. Package loading, installed-plugin MCP namespaces, plugin-root substitution, enrollment/receipt implementation, concurrency recovery, interruption behavior, and native desktop task/UI integration still need their planned checks. The successful dynamic probes do not waive those requirements or authorize activation.
