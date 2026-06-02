import type { CompanionNotification } from "./notification";

/**
 * Producer for Live Follow updates: when a followed session grows by one
 * or more new events (a reaction fired during a foreground poll), emit one
 * feed notification so the user is told their still-running session moved.
 *
 * Pure and stateless: the session-store poll captures the inputs at poll
 * time (because pending events are consumed on reaction) and pushes the
 * result into the feed. The notification carries no raw event text, only a
 * count, honouring the Companion rules.
 */
export type BuildFollowNotificationInput = {
  /** Whether the poll fired a reaction (new events at/above the threshold). */
  shouldNotify: boolean;
  /** How many new events arrived. */
  newCount: number;
  sessionId: string;
  sessionTitle?: string;
  projectLabel?: string;
  /** ISO timestamp of the poll, used as the feed timestamp + id seed. */
  at: string;
};

export function buildFollowNotification(
  input: BuildFollowNotificationInput,
): CompanionNotification | null {
  if (!input.shouldNotify || input.newCount <= 0) return null;
  return {
    id: `live-follow-${input.sessionId}-${input.at}`,
    kind: "live_follow_update",
    severity: "info",
    title: "팔로우 중인 세션이 진행됐습니다",
    message: `새 활동 ${input.newCount}건이 도착했습니다.`,
    basis: "state",
    linkedItemIds: [],
    evidenceRefs: [],
    actionLabel: "열기",
    actionTarget: { kind: "session", sessionId: input.sessionId },
    createdAt: input.at,
    source: {
      projectLabel: input.projectLabel,
      sessionTitle: input.sessionTitle,
      sessionId: input.sessionId,
    },
  };
}
