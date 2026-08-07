import { describe, expect, it } from "vitest";
import { promoteNotificationSignals } from "../notifications/signalPolicy";
import { buildIntakeSignals } from "./buildIntakeSignals";
import { INTAKE_ROW_VERSION, type IntakeRequestRow } from "./intakeTypes";

const NOW = Date.parse("2026-08-07T12:00:00.000Z");

function ago(minutes: number): string {
  return new Date(NOW - minutes * 60_000).toISOString();
}

function row(partial: Partial<IntakeRequestRow> & { id: string }): IntakeRequestRow {
  return {
    schemaVersion: INTAKE_ROW_VERSION,
    sessionKey: "/s/a.jsonl",
    projectPath: "C:\\dev\\mori",
    sessionLabel: "mori",
    title: "an ask",
    titleTruncated: false,
    startedAt: ago(10),
    endedAt: ago(1),
    stepCount: 5,
    tools: [],
    files: [],
    hasError: false,
    status: "running",
    locator: { path: "/s/a.jsonl", offset: 0 },
    observedAt: ago(1),
    ...partial,
  };
}

function signals(previous: IntakeRequestRow[], next: IntakeRequestRow[]) {
  return buildIntakeSignals({ previous, next, now: NOW });
}

describe("buildIntakeSignals", () => {
  it("reports a run that finished", () => {
    const out = signals([row({ id: "r" })], [row({ id: "r", status: "completed" })]);

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ reason: "sessionCompleted", hasObservedEvidence: true });
  });

  it("reports a run that stopped on a failure", () => {
    const out = signals([row({ id: "r" })], [row({ id: "r", status: "blocked" })]);

    expect(out[0].reason).toBe("blocked");
  });

  it("treats a finished turn waiting on the user as a completion", () => {
    const out = signals([row({ id: "r" })], [row({ id: "r", status: "waitingForUser" })]);

    expect(out[0].reason).toBe("sessionCompleted");
  });

  it("says nothing when a run decayed to unknown", () => {
    // Mori stopped watching. It does not know what happened, so there is no
    // event to report and inventing one would be the same error as inventing a
    // present tense.
    expect(signals([row({ id: "r" })], [row({ id: "r", status: "unknown" })])).toEqual([]);
  });

  it("reports nothing while a run is still running", () => {
    expect(signals([row({ id: "r" })], [row({ id: "r" })])).toEqual([]);
  });

  it("reports nothing for a request that was already finished", () => {
    const finished = row({ id: "r", status: "completed" });
    expect(signals([finished], [finished])).toEqual([]);
  });

  it("says nothing about a request it is seeing for the first time", () => {
    // A first observation is not a transition. Announcing every pre-existing
    // request on startup would be a burst of notices for work already done.
    expect(signals([], [row({ id: "r", status: "completed" })])).toEqual([]);
  });

  describe("a long run", () => {
    // Started 50 minutes ago, so it is over the 45-minute threshold now.
    const started = ago(50);

    it("is raised on the observation that crosses the threshold", () => {
      const out = signals(
        // Last look was 40 minutes into the run: under the threshold.
        [row({ id: "r", startedAt: started, observedAt: ago(10) })],
        [row({ id: "r", startedAt: started })],
      );

      expect(out[0]?.reason).toBe("longRunningNoProgress");
    });

    it("is not raised again once it has already been reported", () => {
      const out = signals(
        // Last look was already 48 minutes in, so the crossing happened before.
        [row({ id: "r", startedAt: started, observedAt: ago(2) })],
        [row({ id: "r", startedAt: started })],
      );

      expect(out).toEqual([]);
    });

    it("is not raised for a run seen for the first time", () => {
      // Opening the app to a long run already in flight should not announce
      // work that is plainly on screen.
      expect(signals([], [row({ id: "r", startedAt: started })])).toEqual([]);
    });

    it("is not raised for an ordinary short run", () => {
      const out = signals(
        [row({ id: "r", startedAt: ago(5), observedAt: ago(4) })],
        [row({ id: "r", startedAt: ago(5) })],
      );

      expect(out).toEqual([]);
    });
  });

  it("keys a signal by row and reason so a repeat collapses onto it", () => {
    const a = signals([row({ id: "r" })], [row({ id: "r", status: "completed" })]);
    const b = signals([row({ id: "r" })], [row({ id: "r", status: "completed" })]);

    expect(a[0].id).toBe(b[0].id);
    expect(a[0].id).not.toContain(String(NOW));
  });

  describe("through the policy it was written for", () => {
    it("lets a completion reach the user, which no producer could do before", () => {
      const out = signals([row({ id: "r" })], [row({ id: "r", status: "completed" })]);
      const promoted = promoteNotificationSignals(out, { allowSystem: true });

      expect(promoted[0].delivery).toBe("system");
    });

    it("makes the policy's blocked reason reachable for the first time", () => {
      const out = signals([row({ id: "r" })], [row({ id: "r", status: "blocked" })]);
      const promoted = promoteNotificationSignals(out);

      expect(promoted[0].reason).toBe("blocked");
      expect(promoted[0].delivery).toBe("inApp");
    });

    it("keeps a long run out of the way, as the policy intends", () => {
      const out = signals(
        [row({ id: "r", startedAt: ago(50), observedAt: ago(10) })],
        [row({ id: "r", startedAt: ago(50) })],
      );
      const promoted = promoteNotificationSignals(out, { allowSystem: true });

      expect(promoted[0].delivery).toBe("digestOnly");
    });

    it("batches two completions in one session down to the newest", () => {
      const out = signals(
        [row({ id: "r1" }), row({ id: "r2" })],
        [
          row({ id: "r1", status: "completed", endedAt: ago(9) }),
          row({ id: "r2", status: "completed", endedAt: ago(1) }),
        ],
      );
      const promoted = promoteNotificationSignals(out);

      expect(promoted.filter((s) => s.delivery !== "suppressed")).toHaveLength(1);
    });
  });
});
