#!/bin/sh
# PostToolUse reminder for `shards_task_finish` - SKILL.md rule 6.
#
# The hook payload arrives on stdin, so the script takes no arguments. When
# the call carried a non-empty `outcome` it stays silent and exits 0. When it
# did not, it exits 2 and Claude Code shows the stderr line to the agent: a
# PostToolUse hook cannot block the call, because the tool has already run.
#
# A terminal finish is idempotent and never records a late outcome, so the
# remedy is `shards_task_append`, not a second `task finish`.
#
# POSIX sh and `grep` only: `jq` is not assumed to exist on an operator's
# machine. The check looks for the `outcome` key followed by a non-empty JSON
# string, which is the whole shape it needs.

payload=$(cat)

# `grep` is line-oriented and the payload may be pretty-printed, so fold the
# line breaks first: an `"outcome":` key and its value can sit on two lines.
if printf '%s\n' "$payload" | tr '\012' ' ' | grep -q '"outcome"[[:space:]]*:[[:space:]]*"[^"]'; then
	exit 0
fi

printf '%s\n' 'shards: task finished without an outcome - if you have not already done so, record what happened with shards_task_append (a finished task never records a late outcome). See SKILL.md rule 6.' >&2
exit 2
