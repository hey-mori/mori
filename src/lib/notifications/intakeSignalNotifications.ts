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
import type { ConflictFinding } from "../live-intake/buildConflictSignals";
import { HIDDEN_REQUEST_TITLE } from "../disclosure/eventDisclosure";

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

/**
 * A cross-session conflict, which has no single owning request and so cannot use
 * the row-shaped builder above. It names the file and who is touching it, and
 * links both sessions as evidence: the point of the notice is that the user goes
 * and looks at two traces, not that they trust this one line.
 */
export function buildConflictNotification(finding: ConflictFinding): CompanionNotification {
  const labels = finding.sessions.map((session) => session.sessionLabel);
  const where = finding.path.split(/[\\/]/).filter(Boolean).slice(-2).join("/");
  return {
    id: `intake:conflict:${finding.projectPath} ${finding.path}`,
    kind: "live_follow_update",
    severity: "review",
    title: "두 세션이 같은 파일을 고치고 있습니다",
    message: `${where} · ${labels.join(", ")}`,
    // Observed: the file changes are parsed from each transcript. The reading
    // that they collide is Mori's, which is why the policy keeps this in-app.
    basis: "mixed",
    linkedItemIds: finding.sessions.map((session) => session.requestId),
    evidenceRefs: finding.sessions.map((session) => session.sessionKey),
    actionLabel: "라이브 열기",
    // 세션, the nav destination, not the bare `liveSession` route. That route
    // renders the feed without the session index beside it, so arriving there
    // from a notification drops the user somewhere they cannot navigate from.
    // Matches what `sessionSyncNotifications` already does.
    actionTarget: { kind: "view", view: "sessions" },
    createdAt: finding.at,
    source: {
      projectLabel: finding.sessions[0]?.sessionLabel,
      sessionId: finding.sessions[0]?.sessionKey,
    },
  };
}

export function buildIntakeSignalNotification(
  signal: PromotedSignal,
  row: IntakeRequestRow,
  /** At 숨김 the request's text is withheld: this message can reach an OS
   *  banner, a lock screen or a shared screen. */
  hideRequest = false,
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
    message: `${hideRequest ? HIDDEN_REQUEST_TITLE : row.title}${steps}`,
    // Observed, not inferred: every intake signal is a parse of the agent's own
    // transcript. This is the same claim the policy checked before allowing an
    // OS notification, restated where the user can see it.
    basis: "state",
    linkedItemIds: [],
    evidenceRefs: [],
    actionLabel: "라이브 열기",
    // 세션, the nav destination, not the bare `liveSession` route. That route
    // renders the feed without the session index beside it, so arriving there
    // from a notification drops the user somewhere they cannot navigate from.
    // Matches what `sessionSyncNotifications` already does.
    actionTarget: { kind: "view", view: "sessions" },
    createdAt: row.endedAt || row.observedAt,
    source: {
      projectLabel: row.sessionLabel,
      sessionTitle: row.sessionLabel,
      sessionId: row.sessionKey,
    },
  };
}
