import { describe, expect, it } from "vitest";
import type { StoredSessionSummary } from "../storage/storageTypes";
import {
  buildHomeOverview,
  formatRelativeKo,
  type HomeOverviewInput,
  type HomeSessionMetricSnapshot,
} from "./homeOverview";

const NOW = Date.parse("2026-05-22T12:00:00+09:00");

function stored(over: Partial<StoredSessionSummary> = {}): StoredSessionSummary {
  return {
    sessionId: "s-1",
    projectId: "proj-1",
    title: "리팩터링 세션",
    projectName: "Mori",
    savedAt: "2026-05-22T10:00:00+09:00",
    status: "complete",
    startedAt: "2026-05-22T08:00:00+09:00",
    sourceLabel: "C:/dev/mori",
    ...over,
  };
}

function input(over: Partial<HomeOverviewInput> = {}): HomeOverviewInput {
  return {
    storedSessions: [],
    sessionMetrics: [],
    realSessionCount: 0,
    isDemo: true,
    now: NOW,
    ...over,
  };
}

describe("buildHomeOverview", () => {
  describe("empty / demo-only state", () => {
    it("is empty with only the import next action when there are no real sessions and no stored sessions", () => {
      const overview = buildHomeOverview(input({ storedSessions: [], realSessionCount: 0 }));

      expect(overview.isEmpty).toBe(true);
      expect(overview.onlyDemo).toBe(true);
      expect(overview.metrics).toHaveLength(0);
      expect(overview.recentSessions).toHaveLength(0);
      expect(overview.nextActions).toHaveLength(1);
      expect(overview.nextActions[0]!.kind).toBe("import");
      expect(overview.nextActions[0]!.destination).toBe("connections");
    });

    it("treats a demo-only store (sessions present but realSessionCount 0) as onlyDemo and offers just import", () => {
      const overview = buildHomeOverview(
        input({
          storedSessions: [stored({ sessionId: "demo-1", sourceLabel: undefined })],
          realSessionCount: 0,
          isDemo: true,
        }),
      );

      expect(overview.onlyDemo).toBe(true);
      // A demo session in the store still lists, but it is not "empty".
      expect(overview.isEmpty).toBe(false);
      expect(overview.nextActions.map((a) => a.kind)).toEqual(["import"]);
    });
  });

  describe("metrics aggregation", () => {
    it("reports session count, project count, reconstructed steps, and recent activity from real data", () => {
      const overview = buildHomeOverview(
        input({
          realSessionCount: 2,
          isDemo: false,
          storedSessions: [
            stored({ sessionId: "a", sourceLabel: "C:/dev/mori", startedAt: "2026-05-22T11:00:00+09:00" }),
            stored({ sessionId: "b", sourceLabel: "C:/dev/other", startedAt: "2026-05-21T11:00:00+09:00" }),
          ],
          sessionMetrics: [
            { sessionId: "a", events: 12 },
            { sessionId: "b", events: 8 },
          ],
        }),
      );

      const byKey = Object.fromEntries(overview.metrics.map((m) => [m.key, m]));
      expect(byKey.sessions!.value).toBe("2");
      expect(byKey.projects!.value).toBe("2");
      expect(byKey.events!.value).toBe("20");
      expect(byKey.recent).toBeDefined();
    });

    it("omits the reconstructed-steps metric when no events exist (no fake widget)", () => {
      const overview = buildHomeOverview(
        input({
          realSessionCount: 1,
          isDemo: false,
          storedSessions: [stored({ sessionId: "a" })],
          sessionMetrics: [{ sessionId: "a" }],
        }),
      );

      expect(overview.metrics.some((m) => m.key === "events")).toBe(false);
    });

    it("counts manual and imported sessions as distinct projects honestly", () => {
      const overview = buildHomeOverview(
        input({
          realSessionCount: 3,
          isDemo: false,
          storedSessions: [
            stored({ sessionId: "a", sourceLabel: "C:/dev/mori", projectId: "p1" }),
            stored({ sessionId: "b", sourceLabel: "C:/dev/mori", projectId: "p1" }),
            stored({ sessionId: "c", sourceLabel: undefined, projectId: "p2" }),
          ],
        }),
      );

      const projects = overview.metrics.find((m) => m.key === "projects");
      // Two distinct: the "C:/dev/mori" source group + the manual project.
      expect(projects!.value).toBe("2");
    });
  });

  describe("recent sessions", () => {
    it("sorts active sessions newest-first and hides archived sessions", () => {
      const overview = buildHomeOverview(
        input({
          realSessionCount: 3,
          isDemo: false,
          storedSessions: [
            stored({ sessionId: "old", startedAt: "2026-05-20T08:00:00+09:00" }),
            stored({ sessionId: "new", startedAt: "2026-05-22T08:00:00+09:00" }),
            stored({ sessionId: "gone", startedAt: "2026-05-21T08:00:00+09:00", archivedAt: "2026-05-21T09:00:00+09:00" }),
          ],
        }),
      );

      expect(overview.recentSessions.map((s) => s.sessionId)).toEqual(["new", "old"]);
    });

    it("attaches a factual count summary only when there are reconstructed items", () => {
      const overview = buildHomeOverview(
        input({
          realSessionCount: 2,
          isDemo: false,
          storedSessions: [
            stored({ sessionId: "rich" }),
            stored({ sessionId: "bare", startedAt: "2026-05-21T08:00:00+09:00" }),
          ],
          sessionMetrics: [
            { sessionId: "rich", events: 12, decisions: 3, issues: 2 },
            { sessionId: "bare" },
          ],
        }),
      );

      const rich = overview.recentSessions.find((s) => s.sessionId === "rich")!;
      const bare = overview.recentSessions.find((s) => s.sessionId === "bare")!;
      expect(rich.countSummary).toBe("이벤트 12 · 결정 3 · 이슈 2");
      expect(bare.countSummary).toBeNull();
    });

    it("derives origin from the source label", () => {
      const overview = buildHomeOverview(
        input({
          realSessionCount: 2,
          isDemo: false,
          storedSessions: [
            stored({ sessionId: "imp", sourceLabel: "C:/dev/mori" }),
            stored({ sessionId: "man", sourceLabel: undefined, startedAt: "2026-05-21T08:00:00+09:00" }),
          ],
        }),
      );

      expect(overview.recentSessions.find((s) => s.sessionId === "imp")!.origin).toBe("imported");
      expect(overview.recentSessions.find((s) => s.sessionId === "man")!.origin).toBe("manual");
    });

    it("respects the recent limit", () => {
      const many = Array.from({ length: 10 }, (_, i) =>
        stored({ sessionId: `s-${i}`, startedAt: `2026-05-${10 + i}T08:00:00+09:00` }),
      );
      const overview = buildHomeOverview(
        input({ realSessionCount: 10, isDemo: false, storedSessions: many, recentLimit: 4 }),
      );
      expect(overview.recentSessions).toHaveLength(4);
    });
  });

  describe("value-centric next actions", () => {
    const richMetrics: HomeSessionMetricSnapshot[] = [
      {
        sessionId: "a",
        events: 20,
        unconfirmedDecisions: 3,
        importantDecisions: 1,
        openIssues: 2,
        pendingNextActions: 4,
        decisions: 5,
        issues: 3,
      },
    ];

    function realInput(): HomeOverviewInput {
      return input({
        realSessionCount: 1,
        isDemo: false,
        storedSessions: [stored({ sessionId: "a" })],
        sessionMetrics: richMetrics,
      });
    }

    it("frames decision review around the value of leaving them in project memory", () => {
      const overview = buildHomeOverview(realInput());
      const review = overview.nextActions.find((a) => a.kind === "review_decisions");
      expect(review).toBeDefined();
      expect(review!.title).toContain("메모리에 남기기");
      expect(review!.description).toContain("프로젝트 메모리에 남아");
      expect(review!.destination).toBe("review");
      expect(review!.targetSessionId).toBe("a");
    });

    it("ranks decision review ahead of resume, issues, and report", () => {
      const overview = buildHomeOverview(realInput());
      const kinds = overview.nextActions.map((a) => a.kind);
      expect(kinds[0]).toBe("review_decisions");
      // Resume must precede open issues and report by rank.
      expect(kinds.indexOf("resume")).toBeLessThan(kinds.indexOf("open_issues"));
    });

    it("offers resume framed as carrying context forward, targeting the most recent session", () => {
      const overview = buildHomeOverview(realInput());
      const resume = overview.nextActions.find((a) => a.kind === "resume");
      expect(resume).toBeDefined();
      expect(resume!.targetSessionId).toBe("a");
      expect(resume!.description).toContain("다음 작업 4개");
      expect(resume!.destination).toBe("reports");
    });

    it("caps next actions at the calm maximum and never floods the panel", () => {
      const overview = buildHomeOverview(realInput());
      expect(overview.nextActions.length).toBeLessThanOrEqual(4);
    });

    it("stays quiet about review/issues when there is nothing to act on (no forced item)", () => {
      const overview = buildHomeOverview(
        input({
          realSessionCount: 1,
          isDemo: false,
          storedSessions: [stored({ sessionId: "a" })],
          sessionMetrics: [{ sessionId: "a", events: 10 }],
        }),
      );
      const kinds = overview.nextActions.map((a) => a.kind);
      expect(kinds).not.toContain("review_decisions");
      expect(kinds).not.toContain("open_issues");
      // Resume + report are valid (events exist), and import is a fallback.
      expect(kinds).toContain("resume");
      expect(kinds).toContain("report");
    });

    it("proposes resume/report when the memory body flags reconstructed work, without an event count", () => {
      const overview = buildHomeOverview(
        input({
          realSessionCount: 1,
          isDemo: false,
          storedSessions: [stored({ sessionId: "a" })],
          sessionMetrics: [{ sessionId: "a", hasReconstructedWork: true }],
        }),
      );
      const kinds = overview.nextActions.map((a) => a.kind);
      expect(kinds).toContain("resume");
      expect(kinds).toContain("report");
    });

    it("does not propose resume or report for a session with no reconstructed events", () => {
      const overview = buildHomeOverview(
        input({
          realSessionCount: 1,
          isDemo: false,
          storedSessions: [stored({ sessionId: "a" })],
          sessionMetrics: [{ sessionId: "a", events: 0 }],
        }),
      );
      const kinds = overview.nextActions.map((a) => a.kind);
      expect(kinds).not.toContain("resume");
      expect(kinds).not.toContain("report");
      // With nothing else actionable, import is the honest fallback.
      expect(kinds).toContain("import");
    });
  });
});

describe("잔디 metric lens", () => {
  function withSessions(): HomeOverviewInput {
    return input({
      realSessionCount: 2,
      isDemo: false,
      storedSessions: [
        stored({ sessionId: "a", startedAt: "2026-05-22T08:00:00+09:00", eventCount: 12, tokenTotal: 5_000 }),
        stored({ sessionId: "b", startedAt: "2026-05-21T08:00:00+09:00", eventCount: 8, tokenTotal: 3_000 }),
      ],
    });
  }

  it("defaults to the sessions lens with value 1 per session anchor day", () => {
    const overview = buildHomeOverview(withSessions());
    expect(overview.resolvedMetric).toBe("sessions");
    expect(overview.contributionGrid.metric).toBe("sessions");
    expect(overview.contributionGrid.total).toBe(2); // one per session
  });

  it("sums eventCount per day for the activity lens", () => {
    const overview = buildHomeOverview({ ...withSessions(), metric: "activity" });
    expect(overview.resolvedMetric).toBe("activity");
    expect(overview.contributionGrid.total).toBe(20); // 12 + 8
  });

  it("sums tokenTotal per day for the tokens lens", () => {
    const overview = buildHomeOverview({ ...withSessions(), metric: "tokens" });
    expect(overview.resolvedMetric).toBe("tokens");
    expect(overview.contributionGrid.total).toBe(8_000); // 5000 + 3000
  });

  it("reports availability per lens from the derived totals", () => {
    const overview = buildHomeOverview(withSessions());
    expect(overview.metricAvailability).toEqual({ sessions: true, activity: true, tokens: true });
  });

  it("marks a lens unavailable when its total is zero and resolves back to sessions", () => {
    const overview = buildHomeOverview(
      input({
        realSessionCount: 1,
        isDemo: false,
        storedSessions: [stored({ sessionId: "a", eventCount: 5 })], // no tokenTotal
        metric: "tokens",
      }),
    );
    expect(overview.metricAvailability.tokens).toBe(false);
    expect(overview.metricAvailability.activity).toBe(true);
    // Requested tokens has no data -> grid falls back to sessions, never blank.
    expect(overview.resolvedMetric).toBe("sessions");
    expect(overview.contributionGrid.metric).toBe("sessions");
    expect(overview.contributionGrid.total).toBe(1);
  });
});

describe("formatRelativeKo", () => {
  it("renders sub-minute, minute, hour, and day windows in Korean", () => {
    expect(formatRelativeKo(new Date(NOW - 30_000).toISOString(), NOW)).toBe("방금");
    expect(formatRelativeKo(new Date(NOW - 5 * 60_000).toISOString(), NOW)).toBe("5분 전");
    expect(formatRelativeKo(new Date(NOW - 3 * 3_600_000).toISOString(), NOW)).toBe("3시간 전");
    expect(formatRelativeKo(new Date(NOW - 2 * 86_400_000).toISOString(), NOW)).toBe("2일 전");
  });

  it("falls back to a date label beyond a week", () => {
    const label = formatRelativeKo(new Date(NOW - 30 * 86_400_000).toISOString(), NOW);
    expect(label).toMatch(/월 .*일/);
  });
});
