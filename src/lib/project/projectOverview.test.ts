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
    archivedAt: partial.archivedAt,
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

  it("derives a short display name from the last path segment", () => {
    const overview = buildProjectOverview({
      projectKey: "C:/dev/mori",
      sessions: [],
    });
    expect(overview.shortName).toBe("mori");
    expect(overview.fullPath).toBe("C:/dev/mori");
  });

  it("aggregates totals, splitting active vs archived sessions", () => {
    const overview = buildProjectOverview({
      projectKey: "C:/dev/mori",
      sessions: [
        summary({ sessionId: "a", sourceLabel: "C:/dev/mori", eventCount: 5 }),
        summary({ sessionId: "b", sourceLabel: "C:/dev/mori", eventCount: 3 }),
        summary({
          sessionId: "c",
          sourceLabel: "C:/dev/mori",
          eventCount: 1,
          archivedAt: "2026-05-22T10:00:00.000Z",
        }),
      ],
      now: NOW,
    });
    expect(overview.stats.sessions).toBe(3);
    expect(overview.stats.activeSessions).toBe(2);
    expect(overview.stats.archivedSessions).toBe(1);
    expect(overview.stats.totalEvents).toBe(9);
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
    expect(overview.groups).toEqual([]);
  });
});
