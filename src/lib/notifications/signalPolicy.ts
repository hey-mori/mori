/**
 * Live signal promotion policy — the pure gate that decides which signals may
 * interrupt the user.
 *
 * The Live Project Intelligence thesis is "manage attention, not maximise
 * visibility" (see `docs/live-project-intelligence.md` § Notification Policy).
 * An AI work session emits far more events than a user wants pings for, so this
 * module is the deterministic policy that turns reason-coded signal candidates
 * into a delivery decision. It holds no IO and no copy generation: producers
 * feed it candidates (a reason code plus honest evidence flags), and it returns
 * how each one may be delivered. The reason code is kept separate from any
 * generated notification copy, so the policy never depends on wording.
 *
 * MVP policy (the only reasons that may interrupt at first):
 *
 * | Reason | Delivery | Notes |
 * |---|---|---|
 * | needsUserDecision | in-app, optional system | a decision is waiting |
 * | sessionCompleted | in-app, optional system | low-noise completion |
 * | blocked | in-app, optional system | failed / stuck work |
 * | riskDetected | in-app only | never system without observed evidence |
 * | conflictDetected | in-app only | two sessions touching related work |
 * | longRunningNoProgress | digest only | never interrupts by default |
 *
 * Hard rules carried from the doc:
 *  - Never notify on trace-only events.
 *  - Never send a system notification grounded only in inference (no observed
 *    evidence behind it).
 *  - Prefer in-app before OS-level: system delivery is opt-in per call.
 *  - Batch repeated events from the same session and reason.
 *  - A muted project / session / connector / reason is suppressed.
 */

export type NotificationReason =
  | "needsUserDecision"
  | "sessionCompleted"
  | "blocked"
  | "riskDetected"
  | "conflictDetected"
  | "longRunningNoProgress";

export type NotificationDelivery = "system" | "inApp" | "digestOnly" | "suppressed";

export type NotificationSeverity = "info" | "attention" | "warning";

export type SignalCandidate = {
  id: string;
  reason: NotificationReason;
  /**
   * True when at least one observed (not purely inferred) event backs this
   * candidate. Required before a signal may escalate to a system notification.
   */
  hasObservedEvidence: boolean;
  /** A pure trace-only event must never notify. */
  traceOnly?: boolean;
  /** The session the signal belongs to, used to batch repeats. */
  sessionId?: string;
  /** The user muted this signal's project / session / connector / reason. */
  muted?: boolean;
  /** ISO timestamp; the most recent of a batched group is the one kept. */
  occurredAt?: string;
};

export type PromotedSignal = {
  id: string;
  reason: NotificationReason;
  severity: NotificationSeverity;
  delivery: NotificationDelivery;
  /** Why this delivery was chosen, for transparency. */
  policyNote: string;
};

type ReasonRule = {
  /** A promoted MVP class may reach in-app and (with evidence + opt-in) system. */
  promoted: boolean;
  severity: NotificationSeverity;
  /** Delivery before mute / trace / batch / system rules are applied. */
  base: Exclude<NotificationDelivery, "suppressed">;
};

const REASON_RULES: Record<NotificationReason, ReasonRule> = {
  needsUserDecision: { promoted: true, severity: "attention", base: "inApp" },
  sessionCompleted: { promoted: true, severity: "info", base: "inApp" },
  blocked: { promoted: true, severity: "warning", base: "inApp" },
  riskDetected: { promoted: false, severity: "warning", base: "inApp" },
  conflictDetected: { promoted: false, severity: "attention", base: "inApp" },
  longRunningNoProgress: { promoted: false, severity: "info", base: "digestOnly" },
};

function decideDelivery(
  candidate: SignalCandidate,
  rule: ReasonRule,
  allowSystem: boolean,
): { delivery: NotificationDelivery; note: string } {
  if (candidate.muted) return { delivery: "suppressed", note: "muted" };
  if (candidate.traceOnly) {
    return { delivery: "suppressed", note: "trace-only events never notify" };
  }
  // A promoted class may escalate to a system ping, but only when the user
  // opted in for this call and the signal has observed evidence behind it.
  if (
    rule.base === "inApp" &&
    rule.promoted &&
    allowSystem &&
    candidate.hasObservedEvidence
  ) {
    return { delivery: "system", note: "promoted reason with observed evidence" };
  }
  if (rule.base === "inApp" && rule.promoted && allowSystem) {
    return { delivery: "inApp", note: "inference-only signal stays in-app" };
  }
  return { delivery: rule.base, note: `${candidate.reason} base delivery` };
}

/**
 * Promote reason-coded signal candidates into delivery decisions. System
 * delivery is opt-in via `allowSystem` (default false: prefer in-app). Repeats
 * from the same session and reason are batched to the most recent, with the
 * earlier ones suppressed. Output order follows the input order; a batched-away
 * candidate keeps its place so callers can show "and N earlier".
 */
export function promoteNotificationSignals(
  candidates: ReadonlyArray<SignalCandidate>,
  opts: { allowSystem?: boolean } = {},
): PromotedSignal[] {
  const allowSystem = opts.allowSystem ?? false;

  // Pick the surviving candidate per (sessionId, reason) group: the latest by
  // occurredAt. Candidates with no session are never batched together.
  const survivor = new Map<string, string>();
  for (const candidate of candidates) {
    if (!candidate.sessionId) continue;
    const key = `${candidate.sessionId}::${candidate.reason}`;
    const currentId = survivor.get(key);
    if (!currentId) {
      survivor.set(key, candidate.id);
      continue;
    }
    const current = candidates.find((entry) => entry.id === currentId)!;
    if (time(candidate.occurredAt) >= time(current.occurredAt)) {
      survivor.set(key, candidate.id);
    }
  }

  return candidates.map((candidate) => {
    const rule = REASON_RULES[candidate.reason];
    const batchKey = candidate.sessionId
      ? `${candidate.sessionId}::${candidate.reason}`
      : null;
    const batchedAway = batchKey ? survivor.get(batchKey) !== candidate.id : false;

    if (batchedAway && !candidate.muted && !candidate.traceOnly) {
      return {
        id: candidate.id,
        reason: candidate.reason,
        severity: rule.severity,
        delivery: "suppressed",
        policyNote: "batched with a newer signal from the same session",
      };
    }

    const { delivery, note } = decideDelivery(candidate, rule, allowSystem);
    return {
      id: candidate.id,
      reason: candidate.reason,
      severity: rule.severity,
      delivery,
      policyNote: note,
    };
  });
}

/** Convenience: the candidates that will actually surface (in-app or system). */
export function selectDeliverableSignals(
  promoted: ReadonlyArray<PromotedSignal>,
): PromotedSignal[] {
  return promoted.filter(
    (signal) => signal.delivery === "inApp" || signal.delivery === "system",
  );
}

function time(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}
