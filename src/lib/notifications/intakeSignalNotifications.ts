/**
 * Adapter · a promoted intake signal becomes one feed notification.
 *
 * Kept apart from `buildIntakeSignals` and from `signalPolicy` on purpose. The
 * producer decides *what happened*, the policy decides *whether it may reach the
 * user*, and only this module decides *what it says*. That separation is a rule
 * the notification policy states outright: the reason code is stored apart from
 * the generated copy, so wording can change without touching policy and a policy
 * change cannot silently alter what a user reads.
 *
 * Honours the Companion rules the rest of the feed follows: no raw source text
 * beyond the user's own request title, an honest `basis`, and an id keyed to the
 * signal so a repeat collapses rather than stacking.
 */
import type { PromotedSignal } from "./signalPolicy";
import type { CompanionNotification } from "./notification";
import type { IntakeRequestRow } from "../live-intake/intakeTypes";

const COPY: Record<
  string,
  { title: (row: IntakeRequestRow) => string; severity: CompanionNotification["severity"] }
> = {
  sessionCompleted: {
    title: (row) => (row.hasError ? "오류와 함께 작업을 마쳤습니다" : "작업을 마쳤습니다"),
    severity: "info",
  },
  blocked: {
    title: () => "작업이 멈춰 있습니다",
    severity: "review",
  },
  longRunningNoProgress: {
    title: () => "작업이 오래 진행되고 있습니다",
    severity: "info",
  },
};

export function buildIntakeSignalNotification(
  signal: PromotedSignal,
  row: IntakeRequestRow,
): CompanionNotification | null {
  const copy = COPY[signal.reason];
  // A reason with no copy is not a notification. Returning null rather than
  // inventing a generic string keeps an unhandled reason visibly unhandled.
  if (!copy) return null;

  const steps = row.stepCount > 0 ? ` (${row.stepCount}단계)` : "";
  return {
    id: signal.id,
    kind: "live_follow_update",
    severity: copy.severity,
    title: copy.title(row),
    message: `${row.title}${steps}`,
    // Observed, not inferred: every intake signal is a parse of the agent's own
    // transcript. This is the same claim the policy checked before allowing an
    // OS notification, restated where the user can see it.
    basis: "state",
    linkedItemIds: [],
    evidenceRefs: [],
    actionLabel: "라이브 열기",
    actionTarget: { kind: "view", view: "liveSession" },
    createdAt: row.endedAt || row.observedAt,
    source: {
      projectLabel: row.sessionLabel,
      sessionTitle: row.sessionLabel,
      sessionId: row.sessionKey,
    },
  };
}
