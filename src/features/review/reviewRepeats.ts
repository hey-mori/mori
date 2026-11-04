import type { Issue, NextAction } from "../../domain/types";

/**
 * What the review board leaves out because it would say the same thing twice.
 *
 * Analysis engines restate. The rule-based one titles an issue with its own
 * sentence and keeps the same sentence as the description; it titles a
 * decision the same way; and it derives a next action from every open issue as
 * "확인 또는 해결: <issue title>", which the board strips back to the issue
 * title. An open question then showed three times on one screen. LLM engines
 * do the same less predictably, so the board, not one engine, decides.
 */

const NEXT_ACTION_PREFIX = /^(확인 또는 해결|해결|Resolve):\s*/i;

/** Text as a reader compares it: case, spacing, markup and trailing marks aside. */
export function comparable(text: string | undefined): string {
  return (text ?? "")
    .replace(NEXT_ACTION_PREFIX, "")
    .replace(/[*`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?。…]+$/u, "")
    .trim()
    .toLowerCase();
}

/**
 * The summary to show under a title, or `undefined` when it only repeats it:
 * the same text, or the full sentence the title was cut from.
 */
export function summaryBesideTitle(title: string, summary: string | undefined): string | undefined {
  if (!summary?.trim()) return undefined;
  const head = comparable(title);
  const body = comparable(summary);
  if (!head) return summary;
  if (body === head || body.startsWith(head)) return undefined;
  return summary;
}

/**
 * Whether a next action is only its issue again: made by the engine, untouched
 * and still pending, tied to one issue, and titled with that issue's title.
 * Completing the issue is the same act, so the board shows the issue alone.
 * Anything the user promoted, edited or completed stays.
 */
export function restatesItsIssue(action: NextAction, issuesById: ReadonlyMap<string, Issue>): boolean {
  if (action.id.startsWith("nact-user-") || action.editedByUser || action.done) return false;
  if (action.relatedIssueIds.length !== 1) return false;
  const issue = issuesById.get(action.relatedIssueIds[0]);
  if (!issue) return false;
  return comparable(action.title) === comparable(issue.title);
}

/** The next actions worth a card of their own. `keepId` stays even if it repeats, so a selection never vanishes. */
export function nextActionsWorthShowing(
  actions: readonly NextAction[],
  issues: readonly Issue[],
  keepId?: string,
): NextAction[] {
  const issuesById = new Map(issues.map((issue) => [issue.id, issue] as const));
  return actions.filter((action) => action.id === keepId || !restatesItsIssue(action, issuesById));
}
