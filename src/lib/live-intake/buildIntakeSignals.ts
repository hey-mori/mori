/**
 * Turns observed change into signal candidates.
 *
 * This is the producer `signalPolicy` was written for and never had: the policy
 * module is complete and tested, and until now had **zero** production callers,
 * so its `blocked` reason had never once been reachable. Meanwhile the only live
 * notification in the product was built inside a React effect from a component's
 * own `useRef`, which meant it bypassed the policy entirely (no reason code, no
 * muting, no batching) and existed only for as long as that component did.
 *
 * The fix is to derive signals from the durable buffer instead of from component
 * state. Signals become a function of *what changed between two observations*,
 * which is why this takes the previous rows and the next ones and stays pure:
 * no clock of its own beyond the one passed in, no storage, no delivery.
 *
 * What it deliberately does NOT do: decide delivery. That is
 * `promoteNotificationSignals`, which owns muting, batching, the trace-only ban,
 * and the rule that inference alone may never reach an OS notification. Keeping
 * production and promotion apart is what lets the reason code stay separate from
 * any generated copy.
 */
import type { SignalCandidate } from "../notifications/signalPolicy";
import type { IntakeRequestRow } from "./intakeTypes";

/**
 * How long a request may run before it is worth mentioning. Deliberately
 * generous: the notification policy sends this reason to a digest and never
 * interrupts, but a threshold that fires on ordinary work would still be noise
 * in that digest.
 */
const LONG_RUN_MS = 45 * 60_000;

export type BuildIntakeSignalsInput = {
  /** Rows as they were at the previous observation. */
  previous: readonly IntakeRequestRow[];
  /** Rows as they are now. */
  next: readonly IntakeRequestRow[];
  now: number;
};

/**
 * Emit one candidate per meaningful transition since the last observation.
 *
 * Every candidate here carries `hasObservedEvidence: true`, and that is a claim
 * worth being able to defend: each one is a deterministic parse of the agent's
 * own transcript, never an inference. That is exactly the distinction the policy
 * uses to decide whether a signal may reach the OS, so producing an inferred
 * candidate through this function would be a category error. Interpretation
 * belongs to the later analysis layer and enters as its own producer.
 */
export function buildIntakeSignals(input: BuildIntakeSignalsInput): SignalCandidate[] {
  const before = new Map(input.previous.map((row) => [row.id, row]));
  const signals: SignalCandidate[] = [];

  for (const row of input.next) {
    const was = before.get(row.id);
    const previousStatus = was?.status;

    // A request that stopped running. Reported once, on the transition, so a
    // request that stays finished does not re-announce on every poll.
    if (previousStatus === "running" && row.status !== "running") {
      if (row.status === "blocked") {
        signals.push(candidate(row, "blocked"));
      } else if (row.status === "completed" || row.status === "waitingForUser") {
        signals.push(candidate(row, "sessionCompleted"));
      }
      // A run that decayed to `unknown` raises nothing: Mori stopped watching
      // and does not know what happened, so there is no event to report.
      continue;
    }

    // Newly blocked without having been seen running, which happens when the
    // first observation of a request already caught it failed.
    if (row.status === "blocked" && previousStatus !== "blocked" && previousStatus !== undefined) {
      signals.push(candidate(row, "blocked"));
      continue;
    }

    // Still running, and running long. Reported on the crossing only.
    //
    // "How long had it been running last time" must be measured against the
    // PREVIOUS observation's clock, not the current one. Measuring both sides
    // with `now` makes the two elapsed values identical, so the crossing can
    // never be detected and the signal never fires. A request seen for the first
    // time raises nothing either: opening the app to three long runs already in
    // flight should not produce three notices about work plainly on screen.
    if (row.status === "running" && was?.status === "running") {
      const elapsed = input.now - epoch(row.startedAt);
      const elapsedAtLastLook = epoch(was.observedAt) - epoch(was.startedAt);
      if (elapsed >= LONG_RUN_MS && elapsedAtLastLook < LONG_RUN_MS) {
        signals.push(candidate(row, "longRunningNoProgress"));
      }
    }
  }

  return signals;
}

function candidate(
  row: IntakeRequestRow,
  reason: SignalCandidate["reason"],
): SignalCandidate {
  return {
    // Keyed by row and reason, never by time, so a re-observation of the same
    // transition collapses onto the same signal instead of raising a second.
    id: `intake:${reason}:${row.id}`,
    reason,
    // Always true here: see the note on this function. Every candidate is a
    // parse of the agent's own log, not a guess about it.
    hasObservedEvidence: true,
    sessionId: row.sessionKey,
    occurredAt: row.endedAt || row.observedAt,
  };
}

function epoch(iso: string | null | undefined): number {
  return Date.parse(iso ?? "") || 0;
}
