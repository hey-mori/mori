import { describe, expect, it } from "vitest";
import type { ProjectSessionRow } from "./projectOverview";
import { buildProjectStateSummary } from "./projectStateSummary";

const NOW = Date.parse("2026-06-03T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function row(overrides: Partial<ProjectSessionRow> & { sessionId: string }): ProjectSessionRow {
  return {
    title: `세션 ${overrides.sessionId}`,
    timestamp: new Date(NOW).toISOString(),
    status: "complete",
    ...overrides,
  };
}

describe("buildProjectStateSummary", () => {
  it("treats an old, fully reviewed project as quiet and hides the strip", () => {
    const summary = buildProjectStateSummary({
      now: NOW,
      rows: [
        row({
          sessionId: "a",
          timestamp: new Date(NOW - 5 * 24 * HOUR).toISOString(),
          reviewCount: 0,
        }),
      ],
    });
    expect(summary.signalStatus).toBe("quiet");
    expect(summary.hasContent).toBe(false);
    expect(summary.needsReviewSessions).toBe(0);
    expect(summary.recentlyActiveSessions).toBe(0);
  });

  it("marks recent activity with no review items as active", () => {
    const summary = buildProjectStateSummary({
      now: NOW,
      rows: [
        row({ sessionId: "a", timestamp: new Date(NOW - 2 * HOUR).toISOString(), reviewCount: 0 }),
      ],
    });
    expect(summary.signalStatus).toBe("active");
    expect(summary.hasContent).toBe(true);
    expect(summary.recentlyActiveSessions).toBe(1);
  });

  it("promotes a project with open review items to needsAttention", () => {
    const summary = buildProjectStateSummary({
      now: NOW,
      rows: [
        row({ sessionId: "a", timestamp: new Date(NOW - 3 * HOUR).toISOString(), reviewCount: 2 }),
        row({ sessionId: "b", timestamp: new Date(NOW - 4 * 24 * HOUR).toISOString(), reviewCount: 1 }),
        row({ sessionId: "c", timestamp: new Date(NOW - 5 * HOUR).toISOString(), reviewCount: 0 }),
      ],
    });
    expect(summary.signalStatus).toBe("needsAttention");
    expect(summary.needsReviewSessions).toBe(2);
    expect(summary.reviewItemCount).toBe(3);
    // 'a' is recent, 'c' is recent; 'b' is 4 days old.
    expect(summary.recentlyActiveSessions).toBe(2);
  });

  it("ranks attention rows by review weight then recency and caps them", () => {
    const summary = buildProjectStateSummary({
      now: NOW,
      attentionLimit: 2,
      rows: [
        row({ sessionId: "low", timestamp: new Date(NOW - 1 * HOUR).toISOString(), reviewCount: 1 }),
        row({ sessionId: "high", timestamp: new Date(NOW - 9 * HOUR).toISOString(), reviewCount: 5 }),
        row({ sessionId: "mid-new", timestamp: new Date(NOW - 1 * HOUR).toISOString(), reviewCount: 3 }),
        row({ sessionId: "mid-old", timestamp: new Date(NOW - 8 * HOUR).toISOString(), reviewCount: 3 }),
      ],
    });
    expect(summary.attention.map((entry) => entry.sessionId)).toEqual(["high", "mid-new"]);
    expect(summary.attention[0]?.reviewItemCount).toBe(5);
  });

  it("selects the most recent session as latest regardless of input order", () => {
    const summary = buildProjectStateSummary({
      now: NOW,
      rows: [
        row({ sessionId: "old", timestamp: new Date(NOW - 10 * HOUR).toISOString(), reviewCount: 0 }),
        row({ sessionId: "newest", timestamp: new Date(NOW - 1 * HOUR).toISOString(), reviewCount: 4 }),
        row({ sessionId: "mid", timestamp: new Date(NOW - 5 * HOUR).toISOString(), reviewCount: 0 }),
      ],
    });
    expect(summary.latest?.sessionId).toBe("newest");
    expect(summary.latest?.reviewItemCount).toBe(4);
  });

  it("returns an empty, quiet summary for a project with no sessions", () => {
    const summary = buildProjectStateSummary({ now: NOW, rows: [] });
    expect(summary.totalSessions).toBe(0);
    expect(summary.latest).toBeNull();
    expect(summary.attention).toEqual([]);
    expect(summary.signalStatus).toBe("quiet");
    expect(summary.hasContent).toBe(false);
  });

  it("never treats an unparseable timestamp as recent and sinks it below latest", () => {
    const summary = buildProjectStateSummary({
      now: NOW,
      rows: [
        row({ sessionId: "broken", timestamp: "not-a-date", reviewCount: 0 }),
        row({ sessionId: "real", timestamp: new Date(NOW - 2 * HOUR).toISOString(), reviewCount: 0 }),
      ],
    });
    expect(summary.recentlyActiveSessions).toBe(1);
    expect(summary.latest?.sessionId).toBe("real");
  });

  it("does not count a future-dated session as recent activity", () => {
    const summary = buildProjectStateSummary({
      now: NOW,
      rows: [
        row({ sessionId: "future", timestamp: new Date(NOW + 3 * HOUR).toISOString(), reviewCount: 0 }),
      ],
    });
    expect(summary.recentlyActiveSessions).toBe(0);
    expect(summary.signalStatus).toBe("quiet");
  });

  it("always reports a savedSessions basis", () => {
    const summary = buildProjectStateSummary({
      now: NOW,
      rows: [row({ sessionId: "a", reviewCount: 1 })],
    });
    expect(summary.basis).toBe("savedSessions");
  });
});
