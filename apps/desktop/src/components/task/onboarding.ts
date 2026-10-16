/** First-run onboarding rules and copy (see GettingStarted.tsx). */

/** The quick-add example step 1 offers; it must parse into a dated, prioritised, labelled task. */
export const QUICK_ADD_EXAMPLE = "Call Sam tomorrow 3pm p2 @phone";

/** The command step 3 offers for Claude Code. */
export const MCP_SNIPPET = "claude mcp add shards -- shards-mcp";

/**
 * Show onboarding only for a vault with no task in any state (finished ones count, so a user
 * who cleared everything is not onboarded again) and no project. Unknown counts never show it.
 */
export function isEmptyVault(taskCount: number | null | undefined, projectCount: number | null | undefined): boolean {
  return taskCount === 0 && projectCount === 0;
}
