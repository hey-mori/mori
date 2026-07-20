import type { CompanionNotification } from "./notification";

/**
 * Producer for 라이브 세션 completions: when a request in the live dashboard
 * finishes (its session stopped working), emit one feed notification so a run
 * that completed while the user was on another screen still surfaces, both in
 * the in-app bell and, because `live_follow_update` is OS-eligible, as a single
 * OS-native ping (the OS gate dedupes by id and drops anything stale).
 *
 * Pure and stateless: the view detects the working, done transition and calls
 * this once per request. The id is keyed to the request alone (no timestamp) so
 * a re-render never raises a second notice for the same completion, and the OS
 * gate and `composeNotifications` both collapse repeats by that id. The notice
 * carries no raw step text, only a title and a step count, honouring the
 * Companion rule that a notification never leaks source content.
 */
export type BuildLiveCompletionInput = {
  /** Stable request id from the live feed; seeds the notification id. */
  requestId: string;
  /** The user's request title, shown as the notice body. */
  requestTitle: string;
  /** How many work steps the request ran. */
  stepCount: number;
  /** Whether any step hit a tool error, so the notice can flag it. */
  hasError: boolean;
  /** The session key (file path) the request belongs to. */
  sessionId: string;
  /** Short session / project labels for the "어디서" meta line. */
  sessionTitle?: string;
  projectLabel?: string;
  /** ISO timestamp of the completion, used as the feed timestamp. */
  at: string;
};

export function buildLiveCompletionNotification(
  input: BuildLiveCompletionInput,
): CompanionNotification {
  const title = input.hasError ? "오류와 함께 작업을 마쳤습니다" : "작업을 마쳤습니다";
  // Step count is metadata about the request, so it sits in parentheses after
  // the request itself rather than as another `·`-chained fragment.
  const steps = input.stepCount > 0 ? ` (${input.stepCount}단계)` : "";
  return {
    id: `live-session-done-${input.requestId}`,
    kind: "live_follow_update",
    severity: input.hasError ? "review" : "info",
    title,
    message: `${input.requestTitle}${steps}`,
    basis: "state",
    linkedItemIds: [],
    evidenceRefs: [],
    actionLabel: "라이브 열기",
    actionTarget: { kind: "view", view: "liveSession" },
    createdAt: input.at,
    source: {
      projectLabel: input.projectLabel,
      sessionTitle: input.sessionTitle,
      sessionId: input.sessionId,
    },
  };
}
