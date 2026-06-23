import type { SessionJson } from "@studio/review-contracts";

/** Command the agent runs verbatim to start the next review round. */
export function buildNextCommand(key: string): string {
  return `studio review --session ${key}`;
}

/** Human-readable instruction returned to the agent when a round finishes. */
export function buildFinishPrompt(
  session: SessionJson,
  reviewFile: string,
  unresolved: number,
): string {
  if (unresolved === 0) {
    return `Review approved — no unresolved comments in round ${session.review_round}. You are done.`;
  }
  const plural = unresolved === 1 ? "comment" : "comments";
  return [
    `Round ${session.review_round} finished with ${unresolved} unresolved ${plural}.`,
    `Read the review file at ${reviewFile}, address each unresolved comment in the source,`,
    `then reply with: studio comment --session ${session.session_key} --reply-to <id> --author 'Cursor' '<what you did>'.`,
    `When done applying fixes, run: ${buildNextCommand(session.session_key)}`,
  ].join(" ");
}
