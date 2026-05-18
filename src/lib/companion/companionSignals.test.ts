import { describe, expect, it } from "vitest";
import type { Decision, Issue, NextAction, TimelineEvent } from "../../domain/types";
import {
  buildCompanionSignals,
  buildCompanionSignalFeed,
  companionSeverityRank,
  companionSeverityTone,
  companionSignalReviewSelection,
  COMPANION_ACTION_CATEGORY_ORDER,
  getCompanionSignalActionTarget,
  getCompanionSignalActionCategory,
  groupCompanionSignalsByAction,
  MAX_COMPANION_SIGNALS,
  summarizeCompanionSignals,
  type CompanionSignalInput,
  type CompanionSignalSeverity,
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

  it("flags accepted memory that has gone stale or contradicted", () => {
    const signals = buildCompanionSignals(input({ attentionMemoryCount: 3 }));
    const stale = signals.find((signal) => signal.type === "stale_memory");
    expect(stale).toBeDefined();
    expect(stale?.severity).toBe("review");
    expect(stale?.destination).toBe("memory");
  });

  it("raises no memory-health signal when no memory needs attention", () => {
    expect(
      buildCompanionSignals(input({ attentionMemoryCount: 0 })).some(
        (signal) => signal.type === "stale_memory",
      ),
    ).toBe(false);
    expect(
      buildCompanionSignals(input({})).some(
        (signal) => signal.type === "stale_memory",
      ),
    ).toBe(false);
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

describe("companionSeverityTone", () => {
  it("derives each severity tone from the shared product-state vocabulary", () => {
    expect(companionSeverityTone("risk")).toBe("danger");
    expect(companionSeverityTone("review")).toBe("warning");
    expect(companionSeverityTone("suggestion")).toBe("info");
    expect(companionSeverityTone("info")).toBe("neutral");
  });

  it("never tones a review-or-risk signal as the available success state", () => {
    for (const severity of ["risk", "review"] as CompanionSignalSeverity[]) {
      expect(companionSeverityTone(severity)).not.toBe("success");
    }
  });
});

describe("buildCompanionSignalFeed", () => {
  it("returns the full sorted feed, never fewer than the capped card set", () => {
    const feedInput = input({
      sessionMode: "demo",
      issues: [
        issue({ id: "i1", status: "open", trustLevel: "inferred", confidence: 0.4 }),
        issue({ id: "i2", status: "open", trustLevel: "verified", confidence: 0.9 }),
      ],
      decisions: [decision({ id: "d1", confirmed: false, importance: "high" })],
      nextActions: [nextAction("n1"), nextAction("n2")],
    });
    const feed = buildCompanionSignalFeed(feedInput);
    const capped = buildCompanionSignals(feedInput);
    expect(feed.length).toBeGreaterThanOrEqual(capped.length);
    expect(capped.length).toBeLessThanOrEqual(MAX_COMPANION_SIGNALS);
  });

  it("keeps the feed sorted most-urgent-first", () => {
    const feed = buildCompanionSignalFeed(
      input({
        sessionMode: "draft",
        importCount: 0,
        issues: [issue({ id: "i1", status: "open", trustLevel: "verified", confidence: 0.9 })],
      }),
    );
    for (let i = 1; i < feed.length; i += 1) {
      expect(
        companionSeverityRank(feed[i - 1].severity),
      ).toBeLessThanOrEqual(companionSeverityRank(feed[i].severity));
    }
  });
});

describe("companionSignalReviewSelection", () => {
  it("maps a weak-evidence signal to its first linked issue", () => {
    const signals = buildCompanionSignalFeed(
      input({
        issues: [issue({ id: "i-weak", status: "open", trustLevel: "inferred", confidence: 0.3 })],
      }),
    );
    const weak = signals.find((signal) => signal.type === "weak_evidence")!;
    expect(companionSignalReviewSelection(weak)).toEqual({
      kind: "issue",
      issueId: "i-weak",
    });
  });

  it("maps a needs-review signal to its first linked decision", () => {
    const signals = buildCompanionSignalFeed(
      input({ decisions: [decision({ id: "d-draft", confirmed: false })] }),
    );
    const review = signals.find((signal) => signal.type === "needs_review")!;
    expect(companionSignalReviewSelection(review)).toEqual({
      kind: "decision",
      decisionId: "d-draft",
    });
  });

  it("returns null for a state signal with no linked Review item", () => {
    const signals = buildCompanionSignalFeed(input({ sessionMode: "demo" }));
    const demo = signals.find((signal) => signal.type === "demo_mode_notice")!;
    expect(companionSignalReviewSelection(demo)).toBeNull();
  });
});

describe("summarizeCompanionSignals", () => {
  it("counts a signal feed by severity tier", () => {
    const feed = buildCompanionSignalFeed(
      input({
        sessionMode: "draft",
        importCount: 0,
        issues: [issue({ id: "i1", status: "open", trustLevel: "verified", confidence: 0.9 })],
      }),
    );
    const summary = summarizeCompanionSignals(feed);
    expect(summary.total).toBe(feed.length);
    expect(summary.risk + summary.review + summary.suggestion + summary.info).toBe(
      feed.length,
    );
  });

  it("returns an all-zero summary for an empty feed", () => {
    expect(summarizeCompanionSignals([])).toEqual({
      total: 0,
      risk: 0,
      review: 0,
      suggestion: 0,
      info: 0,
    });
  });
});

describe("getCompanionSignalActionCategory", () => {
  it("routes review-oriented signal types to the review category", () => {
    const feed = buildCompanionSignalFeed(
      input({
        decisions: [decision({ id: "d1", confirmed: false })],
        issues: [issue({ id: "i1", status: "open" })],
        attentionMemoryCount: 2,
      }),
    );
    for (const type of ["needs_review", "unresolved_issue", "stale_memory"]) {
      const signal = feed.find((entry) => entry.type === type)!;
      expect(signal).toBeDefined();
      expect(getCompanionSignalActionCategory(signal)).toBe("review");
    }
  });

  it("routes weak evidence to risk and continuation signals to resume / report", () => {
    const feed = buildCompanionSignalFeed(
      input({
        issues: [issue({ id: "i1", status: "open", trustLevel: "inferred", confidence: 0.3 })],
        events: [timelineEvent("e1")],
        hasAnalysis: true,
      }),
    );
    expect(
      getCompanionSignalActionCategory(feed.find((s) => s.type === "weak_evidence")!),
    ).toBe("risk");
    expect(
      getCompanionSignalActionCategory(feed.find((s) => s.type === "ready_to_resume")!),
    ).toBe("resume");
    expect(
      getCompanionSignalActionCategory(feed.find((s) => s.type === "ready_to_report")!),
    ).toBe("report");
  });
});

describe("getCompanionSignalActionTarget", () => {
  it("deep-links review signals to the exact review item", () => {
    const feed = buildCompanionSignalFeed(
      input({
        issues: [issue({ id: "issue-target", status: "open" })],
      }),
    );
    const signal = feed.find((entry) => entry.type === "unresolved_issue")!;
    expect(getCompanionSignalActionTarget(signal)).toEqual({
      kind: "review",
      selection: { kind: "issue", issueId: "issue-target" },
    });
  });

  it("routes non-review signals to their destination surface", () => {
    const feed = buildCompanionSignalFeed(
      input({
        events: [timelineEvent("event-target")],
      }),
    );
    const signal = feed.find((entry) => entry.type === "ready_to_resume")!;
    expect(getCompanionSignalActionTarget(signal)).toEqual({
      kind: "view",
      view: "reports",
    });
  });
});

describe("groupCompanionSignalsByAction", () => {
  const busyFeed = buildCompanionSignalFeed(
    input({
      issues: [
        issue({ id: "i-weak", status: "open", trustLevel: "inferred", confidence: 0.3 }),
        issue({ id: "i-open", status: "open" }),
      ],
      decisions: [
        decision({ id: "d-draft", confirmed: false }),
        decision({ id: "d-big", importance: "high" }),
      ],
      nextActions: [nextAction("n1")],
      events: [timelineEvent("e1")],
      hasAnalysis: true,
    }),
  );

  it("drops empty categories and keeps the most-actionable order", () => {
    const groups = groupCompanionSignalsByAction(busyFeed);
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(group.signals.length).toBeGreaterThan(0);
    }
    const order = groups.map((group) => group.category);
    const expectedOrder = COMPANION_ACTION_CATEGORY_ORDER.filter((category) =>
      order.includes(category),
    );
    expect(order).toEqual(expectedOrder);
  });

  it("places every signal in exactly one group", () => {
    const groups = groupCompanionSignalsByAction(busyFeed);
    const grouped = groups.flatMap((group) => group.signals);
    expect(grouped.length).toBe(busyFeed.length);
    expect(new Set(grouped.map((s) => s.id)).size).toBe(busyFeed.length);
  });

  it("returns no groups for an empty feed", () => {
    expect(groupCompanionSignalsByAction([])).toEqual([]);
  });
});
