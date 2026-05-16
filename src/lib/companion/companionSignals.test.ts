import { describe, expect, it } from "vitest";
import type { Decision, Issue, NextAction, TimelineEvent } from "../../domain/types";
import {
  buildCompanionSignals,
  companionSeverityRank,
  MAX_COMPANION_SIGNALS,
  type CompanionSignalInput,
} from "./companionSignals";

function issue(over: Partial<Issue>): Issue {
  return {
    id: "issue-1",
    status: "resolved",
    trustLevel: "verified",
    confidence: 0.9,
    sourceEventIds: [],
    description: "",
    ...over,
  } as unknown as Issue;
}

function decision(over: Partial<Decision>): Decision {
  return {
    id: "decision-1",
    confirmed: true,
    importance: "medium",
    trustLevel: "verified",
    sourceEventIds: [],
    ...over,
  } as unknown as Decision;
}

function nextAction(id: string): NextAction {
  return { id, sessionId: "s", title: id, priority: "medium", relatedIssueIds: [], relatedEventIds: [] };
}

function timelineEvent(id: string): TimelineEvent {
  return { id } as unknown as TimelineEvent;
}

function input(over: Partial<CompanionSignalInput>): CompanionSignalInput {
  return {
    sessionMode: "draft",
    events: [],
    issues: [],
    decisions: [],
    nextActions: [],
    hasAnalysis: false,
    importCount: 3,
    ...over,
  };
}

describe("buildCompanionSignals — session-state signals", () => {
  it("surfaces a demo-mode notice in a demo session", () => {
    const signals = buildCompanionSignals(input({ sessionMode: "demo" }));
    const demo = signals.find((signal) => signal.type === "demo_mode_notice");
    expect(demo).toBeDefined();
    expect(demo?.audience).toBe("demo");
    expect(demo?.basis).toBe("state");
  });

  it("flags a real session with no imports", () => {
    const signals = buildCompanionSignals(input({ sessionMode: "draft", importCount: 0 }));
    const gap = signals.find((signal) => signal.type === "real_session_gap");
    expect(gap).toBeDefined();
    expect(gap?.destination).toBe("evidence");
  });

  it("does not raise the import-gap signal once a source is imported", () => {
    const signals = buildCompanionSignals(input({ importCount: 2 }));
    expect(signals.some((signal) => signal.type === "real_session_gap")).toBe(false);
  });

  it("offers import_ready when sources are imported but Quick Pass has not run", () => {
    const signals = buildCompanionSignals(
      input({ importCount: 2, hasAnalysis: false }),
    );
    const ready = signals.find((signal) => signal.type === "import_ready");
    expect(ready).toBeDefined();
    expect(ready?.destination).toBe("evidence");
  });

  it("drops import_ready once Quick Pass analysis exists", () => {
    const signals = buildCompanionSignals(
      input({ importCount: 2, hasAnalysis: true }),
    );
    expect(signals.some((signal) => signal.type === "import_ready")).toBe(false);
  });
});

describe("buildCompanionSignals — evidence-based signals", () => {
  it("detects weak evidence — low-confidence inferred issues — as a risk", () => {
    const signals = buildCompanionSignals(
      input({
        issues: [issue({ id: "i-weak", status: "open", trustLevel: "inferred", confidence: 0.4 })],
      }),
    );
    const weak = signals.find((signal) => signal.type === "weak_evidence");
    expect(weak).toBeDefined();
    expect(weak?.severity).toBe("risk");
    expect(weak?.basis).toBe("inferred");
    expect(weak?.linkedItemIds).toContain("i-weak");
  });

  it("does not flag a high-confidence inferred issue as weak evidence", () => {
    const signals = buildCompanionSignals(
      input({ issues: [issue({ trustLevel: "inferred", confidence: 0.85 })] }),
    );
    expect(signals.some((signal) => signal.type === "weak_evidence")).toBe(false);
  });

  it("detects unresolved (open) issues", () => {
    const signals = buildCompanionSignals(
      input({ issues: [issue({ id: "i-open", status: "open" })] }),
    );
    const unresolved = signals.find((signal) => signal.type === "unresolved_issue");
    expect(unresolved).toBeDefined();
    expect(unresolved?.severity).toBe("review");
  });

  it("detects unconfirmed decisions as needs-review", () => {
    const signals = buildCompanionSignals(
      input({ decisions: [decision({ id: "d-draft", confirmed: false })] }),
    );
    const review = signals.find((signal) => signal.type === "needs_review");
    expect(review).toBeDefined();
    expect(review?.linkedItemIds).toContain("d-draft");
  });

  it("detects ready-to-report once events and analysis exist", () => {
    const signals = buildCompanionSignals(
      input({ events: [timelineEvent("e1")], hasAnalysis: true }),
    );
    expect(signals.some((signal) => signal.type === "ready_to_report")).toBe(true);
  });

  it("does not offer ready-to-report before Quick Pass has run", () => {
    const signals = buildCompanionSignals(
      input({ events: [timelineEvent("e1")], hasAnalysis: false }),
    );
    expect(signals.some((signal) => signal.type === "ready_to_report")).toBe(false);
  });
});

describe("buildCompanionSignals — prioritisation and limits", () => {
  const busy = input({
    issues: [
      issue({ id: "i-weak", status: "open", trustLevel: "inferred", confidence: 0.3 }),
      issue({ id: "i-open", status: "open" }),
    ],
    decisions: [
      decision({ id: "d-draft", confirmed: false }),
      decision({ id: "d-big", importance: "high" }),
    ],
    nextActions: [nextAction("n1"), nextAction("n2")],
    events: [timelineEvent("e1")],
    hasAnalysis: true,
  });

  it("orders signals most-urgent-first by severity", () => {
    const signals = buildCompanionSignals(busy);
    for (let i = 1; i < signals.length; i += 1) {
      expect(companionSeverityRank(signals[i]!.severity)).toBeGreaterThanOrEqual(
        companionSeverityRank(signals[i - 1]!.severity),
      );
    }
    expect(signals[0]?.severity).toBe("risk");
  });

  it("caps the visible signal set", () => {
    const signals = buildCompanionSignals(busy);
    expect(signals.length).toBeLessThanOrEqual(MAX_COMPANION_SIGNALS);
  });

  it("returns no signals when a real session has nothing to surface", () => {
    // Sources imported and Quick Pass already run, but no events / issues /
    // decisions / next actions — genuinely nothing for Mori to flag.
    expect(
      buildCompanionSignals(input({ importCount: 4, hasAnalysis: true })),
    ).toEqual([]);
  });
});

describe("buildCompanionSignals — raw-data safety", () => {
  it("never copies raw issue/source body text into a signal", () => {
    const secret = "RAW-TRANSCRIPT-여기에-민감한-원문-텍스트";
    const signals = buildCompanionSignals(
      input({
        issues: [
          issue({
            id: "i1",
            status: "open",
            trustLevel: "inferred",
            confidence: 0.2,
            description: secret,
          }),
        ],
      }),
    );
    expect(signals.length).toBeGreaterThan(0);
    for (const signal of signals) {
      expect(signal.title).not.toContain(secret);
      expect(signal.message).not.toContain(secret);
    }
  });
});
