import { describe, expect, it } from "vitest";
import {
  promoteNotificationSignals,
  selectDeliverableSignals,
  type SignalCandidate,
} from "./signalPolicy";

function candidate(partial: Partial<SignalCandidate>): SignalCandidate {
  return {
    id: partial.id ?? "c",
    reason: partial.reason ?? "sessionCompleted",
    hasObservedEvidence: partial.hasObservedEvidence ?? true,
    traceOnly: partial.traceOnly,
    sessionId: partial.sessionId,
    muted: partial.muted,
    occurredAt: partial.occurredAt,
  };
}

function deliveryOf(candidates: SignalCandidate[], id: string, allowSystem = false) {
  const promoted = promoteNotificationSignals(candidates, { allowSystem });
  return promoted.find((signal) => signal.id === id)!.delivery;
}

describe("promoteNotificationSignals", () => {
  it("delivers the promoted MVP reasons in-app by default", () => {
    const candidates = [
      candidate({ id: "decide", reason: "needsUserDecision" }),
      candidate({ id: "done", reason: "sessionCompleted" }),
      candidate({ id: "stuck", reason: "blocked" }),
    ];
    for (const id of ["decide", "done", "stuck"]) {
      expect(deliveryOf(candidates, id)).toBe("inApp");
    }
  });

  it("escalates a promoted, observed-backed reason to system only when opted in", () => {
    const candidates = [candidate({ id: "done", reason: "sessionCompleted" })];
    expect(deliveryOf(candidates, "done", false)).toBe("inApp");
    expect(deliveryOf(candidates, "done", true)).toBe("system");
  });

  it("never escalates an inference-only signal to system", () => {
    const candidates = [
      candidate({ id: "decide", reason: "needsUserDecision", hasObservedEvidence: false }),
    ];
    expect(deliveryOf(candidates, "decide", true)).toBe("inApp");
  });

  it("keeps risk and conflict in-app, never system, even when opted in", () => {
    const candidates = [
      candidate({ id: "risk", reason: "riskDetected" }),
      candidate({ id: "conflict", reason: "conflictDetected" }),
    ];
    expect(deliveryOf(candidates, "risk", true)).toBe("inApp");
    expect(deliveryOf(candidates, "conflict", true)).toBe("inApp");
  });

  it("sends long-running-no-progress to the digest, never interrupting", () => {
    const candidates = [candidate({ id: "idle", reason: "longRunningNoProgress" })];
    expect(deliveryOf(candidates, "idle", true)).toBe("digestOnly");
  });

  it("suppresses trace-only and muted candidates", () => {
    const candidates = [
      candidate({ id: "trace", reason: "blocked", traceOnly: true }),
      candidate({ id: "muted", reason: "needsUserDecision", muted: true }),
    ];
    expect(deliveryOf(candidates, "trace")).toBe("suppressed");
    expect(deliveryOf(candidates, "muted")).toBe("suppressed");
  });

  it("batches repeats from the same session and reason, keeping the newest", () => {
    const candidates = [
      candidate({
        id: "old",
        reason: "blocked",
        sessionId: "s1",
        occurredAt: "2026-06-03T09:00:00Z",
      }),
      candidate({
        id: "new",
        reason: "blocked",
        sessionId: "s1",
        occurredAt: "2026-06-03T10:00:00Z",
      }),
    ];
    const promoted = promoteNotificationSignals(candidates);
    expect(promoted.find((s) => s.id === "new")!.delivery).toBe("inApp");
    expect(promoted.find((s) => s.id === "old")!.delivery).toBe("suppressed");
    expect(promoted.find((s) => s.id === "old")!.policyNote).toContain("batched");
  });

  it("does not batch across different sessions or reasons", () => {
    const candidates = [
      candidate({ id: "a", reason: "blocked", sessionId: "s1" }),
      candidate({ id: "b", reason: "blocked", sessionId: "s2" }),
      candidate({ id: "c", reason: "sessionCompleted", sessionId: "s1" }),
    ];
    const deliverable = selectDeliverableSignals(promoteNotificationSignals(candidates));
    expect(deliverable.map((s) => s.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("derives a stable severity per reason", () => {
    const promoted = promoteNotificationSignals([
      candidate({ id: "decide", reason: "needsUserDecision" }),
      candidate({ id: "done", reason: "sessionCompleted" }),
      candidate({ id: "stuck", reason: "blocked" }),
    ]);
    expect(promoted.map((s) => [s.id, s.severity])).toEqual([
      ["decide", "attention"],
      ["done", "info"],
      ["stuck", "warning"],
    ]);
  });
});

describe("selectDeliverableSignals", () => {
  it("keeps only in-app and system deliveries", () => {
    const promoted = promoteNotificationSignals(
      [
        candidate({ id: "done", reason: "sessionCompleted" }),
        candidate({ id: "idle", reason: "longRunningNoProgress" }),
        candidate({ id: "muted", reason: "blocked", muted: true }),
      ],
      { allowSystem: true },
    );
    expect(selectDeliverableSignals(promoted).map((s) => s.id)).toEqual(["done"]);
  });
});
