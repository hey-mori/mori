import { describe, expect, it } from "vitest";
import type { StoredSessionSummary } from "../storage/storageTypes";
import { buildProjectOverview } from "./projectOverview";

const NOW = new Date("2026-05-24T15:00:00").getTime();

function summary(partial: Partial<StoredSessionSummary>): StoredSessionSummary {
  return {
    sessionId: partial.sessionId ?? "s-1",
    projectId: partial.projectId ?? "p-1",
    title: partial.title ?? "세션",
    projectName: partial.projectName ?? "프로젝트",
    savedAt: partial.savedAt ?? "2026-05-22T10:00:00.000Z",
    status: partial.status ?? "complete",
    startedAt: partial.startedAt,
    sourceLabel: partial.sourceLabel,
    eventCount: partial.eventCount,
    tokenTotal: partial.tokenTotal,
    tokenInput: partial.tokenInput,
    tokenOutput: partial.tokenOutput,
  };
}

describe("buildProjectOverview", () => {
  it("keeps only sessions whose sourceLabel matches the project key", () => {
    const overview = buildProjectOverview({
      projectKey: "C:/dev/mori",
      sessions: [
        summary({ sessionId: "in", sourceLabel: "C:/dev/mori" }),
        summary({ sessionId: "out", sourceLabel: "C:/dev/jinga" }),
      ],
      now: NOW,
    });
    expect(overview.stats.sessions).toBe(1);
    expect(overview.groups.flatMap((g) => g.rows).map((r) => r.sessionId)).toEqual(["in"]);
  });

  it("groups sessions whose sourceLabel is the same project written differently", () => {
    const overview = buildProjectOverview({
      projectKey: "C:/dev/mori",
      sessions: [
        summary({ sessionId: "slash", sourceLabel: "C:\\dev\\mori" }),
        summary({ sessionId: "trailing", sourceLabel: "C:/dev/mori/" }),
        summary({ sessionId: "case", sourceLabel: "c:/dev/mori" }),
        summary({ sessionId: "other", sourceLabel: "C:/dev/jinga" }),
      ],
      now: NOW,
    });
    expect(overview.stats.sessions).toBe(3);
    expect(
      overview.groups
        .flatMap((g) => g.rows)
        .map((r) => r.sessionId)
        .sort(),
    ).toEqual(["case", "slash", "trailing"]);
  });

  it("does not merge a different project that only shares a trailing name", () => {
    const overview = buildProjectOverview({
      projectKey: "/work/api",
      sessions: [
        summary({ sessionId: "mine", sourceLabel: "/work/api" }),
        summary({ sessionId: "lookalike", sourceLabel: "/play/api" }),
      ],
      now: NOW,
    });
    expect(overview.stats.sessions).toBe(1);
    expect(overview.groups.flatMap((g) => g.rows).map((r) => r.sessionId)).toEqual([
      "mine",
    ]);
  });

  it("derives a short display name from the last path segment", () => {
    const overview = buildProjectOverview({
      projectKey: "C:/dev/mori",
      sessions: [],
    });
    expect(overview.shortName).toBe("mori");
    expect(overview.fullPath).toBe("C:/dev/mori");
  });

  it("aggregates totals across all sessions", () => {
    const overview = buildProjectOverview({
      projectKey: "C:/dev/mori",
      sessions: [
        summary({ sessionId: "a", sourceLabel: "C:/dev/mori", eventCount: 5 }),
        summary({ sessionId: "b", sourceLabel: "C:/dev/mori", eventCount: 3 }),
        summary({ sessionId: "c", sourceLabel: "C:/dev/mori", eventCount: 1 }),
      ],
      now: NOW,
    });
    expect(overview.stats.sessions).toBe(3);
    expect(overview.stats.activeSessions).toBe(3);
    expect(overview.stats.totalEvents).toBe(9);
  });

  it("adds evidence, review, memory, and report readiness from session insights", () => {
    const overview = buildProjectOverview({
      projectKey: "C:/dev/mori",
      sessions: [
        summary({ sessionId: "a", sourceLabel: "C:/dev/mori", eventCount: 5 }),
        summary({ sessionId: "b", sourceLabel: "C:/dev/mori", eventCount: 3 }),
      ],
      sessionInsights: [
        {
          sessionId: "a",
          sourceCount: 2,
          openIssues: 1,
          unconfirmedDecisions: 2,
          pendingNextActions: 1,
          decisionCount: 3,
          hasSummary: true,
          reportCount: 1,
        },
        {
          sessionId: "b",
          sourceCount: 1,
          openIssues: 0,
          unconfirmedDecisions: 1,
          pendingNextActions: 0,
          decisionCount: 1,
          hasSummary: false,
        },
      ],
      now: NOW,
    });

    expect(overview.stats.totalSources).toBe(3);
    expect(overview.stats.reviewItems).toBe(5);
    expect(overview.stats.memoryCandidates).toBe(6);
    expect(overview.stats.savedReports).toBe(1);
    expect(overview.focusItems.map((item) => [item.key, item.count, item.enabled])).toEqual([
      ["review", 5, true],
      ["evidence", 3, true],
      ["memory", 6, true],
      ["report", 1, true],
    ]);
  });

  it("keeps readiness rows but disables unavailable work", () => {
    const overview = buildProjectOverview({
      projectKey: "alpha",
      sessions: [summary({ sessionId: "a", sourceLabel: "alpha" })],
      now: NOW,
    });

    expect(overview.focusItems).toHaveLength(4);
    expect(overview.focusItems.find((item) => item.key === "review")?.enabled).toBe(false);
    expect(overview.focusItems.find((item) => item.key === "evidence")?.enabled).toBe(false);
    expect(overview.focusItems.find((item) => item.key === "memory")?.enabled).toBe(false);
    expect(overview.focusItems.find((item) => item.key === "report")?.enabled).toBe(true);
  });

  it("groups active sessions into today / thisWeek / earlier", () => {
    const overview = buildProjectOverview({
      projectKey: "alpha",
      sessions: [
        summary({
          sessionId: "today",
          sourceLabel: "alpha",
          savedAt: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(),
        }),
        summary({
          sessionId: "week",
          sourceLabel: "alpha",
          savedAt: new Date(NOW - 4 * 86_400_000).toISOString(),
        }),
        summary({
          sessionId: "old",
          sourceLabel: "alpha",
          savedAt: new Date(NOW - 30 * 86_400_000).toISOString(),
        }),
      ],
      now: NOW,
    });
    expect(overview.groups.map((g) => g.bucket)).toEqual(["today", "thisWeek", "earlier"]);
  });

  it("returns null lastActivity when no sessions are present", () => {
    const overview = buildProjectOverview({
      projectKey: "alpha",
      sessions: [summary({ sessionId: "out", sourceLabel: "beta" })],
      now: NOW,
    });
    expect(overview.stats.sessions).toBe(0);
    expect(overview.stats.lastActivity).toBeNull();
    expect(overview.stats.totalSources).toBe(0);
    expect(overview.focusItems.every((item) => !item.enabled)).toBe(true);
    expect(overview.groups).toEqual([]);
  });
});
