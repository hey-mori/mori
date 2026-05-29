import { describe, expect, it } from "vitest";
import type { CompanionSignal } from "../companion/companionSignals";
import {
  companionSignalToNotification,
  composeNotifications,
  type CompanionNotification,
} from "./notification";

function signal(partial: Partial<CompanionSignal>): CompanionSignal {
  return {
    id: partial.id ?? "sig-1",
    type: partial.type ?? "unresolved_issue",
    severity: partial.severity ?? "review",
    title: partial.title ?? "Issue needs review",
    message: partial.message ?? "Two issues are still open.",
    sourceSurface: partial.sourceSurface ?? "review",
    linkedItemIds: partial.linkedItemIds ?? ["issue-1"],
    evidenceRefs: partial.evidenceRefs ?? ["evt-1"],
    basis: partial.basis ?? "verified",
    actionLabel: partial.actionLabel ?? "검토",
    destination: partial.destination ?? "review",
    audience: partial.audience ?? "real",
  };
}

function notification(partial: Partial<CompanionNotification>): CompanionNotification {
  return {
    id: partial.id ?? "n-1",
    kind: partial.kind ?? "import_ready",
    severity: partial.severity ?? "info",
    title: partial.title ?? "n",
    message: partial.message ?? "n",
    basis: partial.basis ?? "state",
    linkedItemIds: partial.linkedItemIds ?? [],
    evidenceRefs: partial.evidenceRefs ?? [],
    actionLabel: partial.actionLabel ?? "열기",
    actionTarget: partial.actionTarget ?? null,
  };
}

describe("companionSignalToNotification", () => {
  it("maps a companion signal lossless onto the producer-neutral notification", () => {
    const result = companionSignalToNotification(
      signal({ id: "sig-7", linkedItemIds: ["i-1", "i-2"] }),
      { kind: "view", view: "review" },
    );
    expect(result.id).toBe("sig-7");
    expect(result.kind).toBe("unresolved_issue");
    expect(result.severity).toBe("review");
    expect(result.linkedItemIds).toEqual(["i-1", "i-2"]);
    expect(result.evidenceRefs).toEqual(["evt-1"]);
    expect(result.actionTarget).toEqual({ kind: "view", view: "review" });
  });

  it("supports a review-selection target so deep links into the insights tab work", () => {
    const result = companionSignalToNotification(signal({}), {
      kind: "review",
      selection: { kind: "issue", issueId: "issue-9" },
    });
    expect(result.actionTarget).toEqual({
      kind: "review",
      selection: { kind: "issue", issueId: "issue-9" },
    });
  });

  it("supports a null target for informational notices with no destination", () => {
    const result = companionSignalToNotification(signal({}), null);
    expect(result.actionTarget).toBeNull();
  });
});

describe("composeNotifications", () => {
  it("preserves the order producers were registered in", () => {
    const composed = composeNotifications([
      [notification({ id: "a" }), notification({ id: "b" })],
      [notification({ id: "c" })],
    ]);
    expect(composed.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  it("deduplicates by id so a notification raised by two producers appears once", () => {
    const composed = composeNotifications([
      [notification({ id: "a" }), notification({ id: "b" })],
      [notification({ id: "b", title: "duplicate" }), notification({ id: "c" })],
    ]);
    // The first producer wins for the duplicate id; later producers fall through.
    expect(composed.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(composed.find((n) => n.id === "b")?.title).toBe("n");
  });

  it("returns an empty feed when no producer has anything to say", () => {
    expect(composeNotifications([])).toEqual([]);
    expect(composeNotifications([[], []])).toEqual([]);
  });
});
