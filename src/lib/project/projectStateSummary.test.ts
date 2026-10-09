import { describe, expect, it } from "vitest";
import type { ProjectProjection } from "../live-intake";
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

function projection(overrides: Partial<ProjectProjection> = {}): ProjectProjection {
  return {
    projectPath: "C:\\dev\\mori",
    label: "mori",
    observedAt: new Date(NOW - 60_000).toISOString(),
    freshness: "live",
    runningCount: 0,
    waitingCount: 0,
    blockedCount: 0,
    blocked: [],
    countedObservedAt: null,
    running: [],
    recentRequests: [],
    waiting: [],
    topFiles: [],
    lastActivityAt: new Date(NOW - 60_000).toISOString(),
    rowCount: 1,
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

  describe("basis", () => {
    it("reports savedOnly for a project Mori has never watched run", () => {
      const summary = buildProjectStateSummary({
        now: NOW,
        rows: [row({ sessionId: "a", reviewCount: 1 })],
      });

      // Not a degraded state: it is every project imported before live
      // observation existed, and it can only ever be retrospective.
      expect(summary.basis).toBe("savedOnly");
      expect(summary.live).toBeNull();
    });

    it("reports liveOnly when observation is the only evidence", () => {
      const summary = buildProjectStateSummary({ now: NOW, rows: [], projection: projection() });

      expect(summary.basis).toBe("liveOnly");
    });

    it("reports liveAndSaved when both contributed", () => {
      const summary = buildProjectStateSummary({
        now: NOW,
        rows: [row({ sessionId: "a" })],
        projection: projection(),
      });

      expect(summary.basis).toBe("liveAndSaved");
    });

    it("reports none when there is nothing to say", () => {
      expect(buildProjectStateSummary({ now: NOW, rows: [] }).basis).toBe("none");
    });
  });

  describe("live state", () => {
    it("carries the present tense the projection reported", () => {
      const summary = buildProjectStateSummary({
        now: NOW,
        rows: [],
        projection: projection({ runningCount: 2, waitingCount: 1, freshness: "live" }),
      });

      expect(summary.live).toMatchObject({
        runningCount: 2,
        waitingCount: 1,
        freshness: "live",
      });
    });

    it("raises blocked, which saved rows alone could never produce", () => {
      const summary = buildProjectStateSummary({
        now: NOW,
        rows: [],
        projection: projection({ blockedCount: 1 }),
      });

      expect(summary.signalStatus).toBe("blocked");
    });

    it("puts a blocked run ahead of a review queue", () => {
      // A stopped run is time-sensitive in a way a queue of review items is not.
      const summary = buildProjectStateSummary({
        now: NOW,
        rows: [row({ sessionId: "a", reviewCount: 5 })],
        projection: projection({ blockedCount: 1 }),
      });

      expect(summary.signalStatus).toBe("blocked");
    });

    it("reads a running project as active even when nothing needs review", () => {
      const summary = buildProjectStateSummary({
        now: NOW,
        rows: [
          row({
            sessionId: "a",
            timestamp: new Date(NOW - 5 * 24 * HOUR).toISOString(),
            reviewCount: 0,
          }),
        ],
        projection: projection({ runningCount: 1 }),
      });

      expect(summary.signalStatus).toBe("active");
      expect(summary.hasContent).toBe(true);
    });

    it("claims no liveness from a stale projection", () => {
      // The projection zeroes its own counts once stale, so the summary cannot
      // resurrect a present tense the projection already withdrew.
      const summary = buildProjectStateSummary({
        now: NOW,
        rows: [],
        projection: projection({
          freshness: "stale",
          runningCount: 0,
          waitingCount: 0,
          blockedCount: 0,
        }),
      });

      expect(summary.signalStatus).toBe("quiet");
      expect(summary.live?.freshness).toBe("stale");
    });
  });

});
