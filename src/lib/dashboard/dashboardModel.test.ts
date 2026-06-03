import { describe, expect, it } from "vitest";
import type { StoredSessionSummary } from "../storage/storageTypes";
import {
  applyDashboardFilters,
  attentionValue,
  buildActivityTrend,
  buildDashboardStatus,
  buildKpiDeltas,
  buildSpotlight,
  buildWeeklySeries,
  sortProjects,
  summarizeProjects,
  type ProjectStatus,
} from "./dashboardModel";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-06-03T00:00:00Z");
const iso = (epoch: number) => new Date(epoch).toISOString();

let counter = 0;
function session(over: Partial<StoredSessionSummary> = {}): StoredSessionSummary {
  counter += 1;
  return {
    sessionId: `s${counter}`,
    projectId: "proj",
    title: "Session",
    projectName: "Project",
    savedAt: iso(NOW),
    status: "complete",
    ...over,
  };
}

function project(over: Partial<ProjectStatus> = {}): ProjectStatus {
  return {
    key: "k",
    name: "name",
    sourceLabel: "src",
    sessionCount: 0,
    analyzedSessions: 0,
    lastActiveIso: null,
    eventCount: 0,
    tokenTotal: 0,
    openIssues: 0,
    unconfirmedDecisions: 0,
    pendingNextActions: 0,
    attentionScore: 0,
    coverageScore: 0,
    activityScore: 0,
    recentSessions: 0,
    ...over,
  };
}

describe("buildWeeklySeries", () => {
  it("buckets weekly session counts oldest-first", () => {
    const series = buildWeeklySeries(
      [
        session({ savedAt: iso(NOW) }),
        session({ savedAt: iso(NOW - 8 * DAY) }),
        session({ savedAt: iso(NOW - 8 * DAY) }),
      ],
      12,
      "sessions",
      NOW,
    );
    expect(series).toHaveLength(12);
    expect(series[11]).toBe(1);
    expect(series[10]).toBe(2);
  });

  it("sums tokenTotal for the tokens metric and ignores token-less sessions", () => {
    const series = buildWeeklySeries(
      [
        session({ savedAt: iso(NOW), tokenTotal: 100 }),
        session({ savedAt: iso(NOW), tokenTotal: 50 }),
        session({ savedAt: iso(NOW) }),
      ],
      12,
      "tokens",
      NOW,
    );
    expect(series[11]).toBe(150);
  });
});

describe("buildActivityTrend", () => {
  it("buckets a week into 7 daily points, today last", () => {
    const trend = buildActivityTrend(
      [session({ savedAt: iso(NOW) }), session({ savedAt: iso(NOW - 2 * DAY) })],
      "week",
      NOW,
    );
    expect(trend.points).toHaveLength(7);
    expect(trend.points[6]).toMatchObject({ value: 1, label: "오늘", isCurrent: true });
    expect(trend.points[4]).toMatchObject({ value: 1, label: "2일 전" });
    expect(trend.startLabel).toBe("7일 전");
    expect(trend.endLabel).toBe("오늘");
  });

  it("buckets a month into 30 daily points", () => {
    const trend = buildActivityTrend([session({ savedAt: iso(NOW - 10 * DAY) })], "month", NOW);
    expect(trend.points).toHaveLength(30);
    expect(trend.points[29]!.label).toBe("오늘");
    expect(trend.points[19]).toMatchObject({ value: 1, label: "10일 전" });
  });

  it("buckets a year into 12 monthly points, dropping out-of-window and bad dates", () => {
    const trend = buildActivityTrend(
      [
        session({ savedAt: iso(NOW) }),
        session({ savedAt: iso(NOW - 60 * DAY) }), // 2 months ago
        session({ savedAt: iso(NOW - 400 * DAY) }), // beyond a year
        session({ savedAt: "nope" }),
      ],
      "year",
      NOW,
    );
    expect(trend.points).toHaveLength(12);
    expect(trend.points[11]).toMatchObject({ value: 1, label: "이번 달", isCurrent: true });
    expect(trend.points[9]).toMatchObject({ value: 1, label: "2개월 전" });
    expect(trend.points.reduce((sum, point) => sum + point.value, 0)).toBe(2);
    expect(trend.startLabel).toBe("12개월 전");
  });
});

describe("buildKpiDeltas", () => {
  it("computes week-over-week session and token deltas", () => {
    const delta = buildKpiDeltas(
      [
        session({ savedAt: iso(NOW - 1 * DAY), tokenTotal: 100 }),
        session({ savedAt: iso(NOW - 2 * DAY), tokenTotal: 50 }),
        session({ savedAt: iso(NOW - 9 * DAY), tokenTotal: 30 }),
      ],
      NOW,
    );
    expect(delta.sessions.current).toBe(2);
    expect(delta.sessions.previous).toBe(1);
    expect(delta.sessions.delta).toBe(1);
    expect(delta.sessions.direction).toBe("up");
    expect(delta.sessions.hasPrior).toBe(true);
    expect(delta.tokens.current).toBe(150);
    expect(delta.tokens.previous).toBe(30);
  });

  it("flags no prior data when every session falls within this week", () => {
    const delta = buildKpiDeltas(
      [session({ savedAt: iso(NOW - 1 * DAY) }), session({ savedAt: iso(NOW - 3 * DAY) })],
      NOW,
    );
    expect(delta.sessions.hasPrior).toBe(false);
    expect(delta.sessions.current).toBe(2);
    expect(delta.sessions.previous).toBe(0);
  });

  it("excludes sessions missing tokenTotal from the token delta", () => {
    const delta = buildKpiDeltas(
      [
        session({ savedAt: iso(NOW - 1 * DAY) }),
        session({ savedAt: iso(NOW - 9 * DAY), tokenTotal: 40 }),
      ],
      NOW,
    );
    expect(delta.tokens.current).toBe(0);
    expect(delta.tokens.previous).toBe(40);
    expect(delta.tokens.direction).toBe("down");
  });
});

describe("summarizeProjects / buildDashboardStatus", () => {
  it("summarizes and scores deterministically", () => {
    const projects = [
      project({
        tokenTotal: 1000,
        sessionCount: 4,
        analyzedSessions: 2,
        openIssues: 1,
        unconfirmedDecisions: 2,
        attentionScore: 3,
        eventCount: 40,
      }),
      project({ tokenTotal: 500, sessionCount: 2, analyzedSessions: 2, eventCount: 10 }),
    ];
    const totals = summarizeProjects(projects);
    expect(totals.projectCount).toBe(2);
    expect(totals.tokenTotal).toBe(1500);
    expect(totals.sessionCount).toBe(6);

    const status = buildDashboardStatus(totals, projects);
    expect(status.attentionCount).toBe(3);
    expect(status.maxTokenTotal).toBe(1000);
    expect(status.maxAttention).toBe(3);
    expect(status.recentSessions).toBe(0);
  });
});

describe("buildSpotlight", () => {
  it("prioritizes the project with the most review backlog", () => {
    const a = project({ key: "a", attentionScore: 5, lastActiveIso: "2026-01-01" });
    const b = project({ key: "b", attentionScore: 0, lastActiveIso: "2026-02-01" });
    const spot = buildSpotlight([a, b]);
    expect(spot.reason).toBe("review");
    expect(spot.project?.key).toBe("a");
  });

  it("falls back to the most recently active project when nothing needs review", () => {
    const a = project({ key: "a", attentionScore: 0, lastActiveIso: "2026-01-01" });
    const b = project({ key: "b", attentionScore: 0, lastActiveIso: "2026-02-01" });
    const spot = buildSpotlight([a, b]);
    expect(spot.reason).toBe("recent");
    expect(spot.project?.key).toBe("b");
  });

  it("is empty when no project has review backlog or activity", () => {
    const spot = buildSpotlight([project({ attentionScore: 0, lastActiveIso: null })]);
    expect(spot.reason).toBe("empty");
    expect(spot.project).toBeNull();
  });
});

describe("sortProjects / applyDashboardFilters / attentionValue", () => {
  const alpha = project({
    key: "a",
    name: "alpha",
    sourceLabel: "x",
    tokenTotal: 100,
    openIssues: 2,
    attentionScore: 2,
    lastActiveIso: "2026-01-02",
  });
  const beta = project({
    key: "b",
    name: "beta",
    sourceLabel: "y",
    tokenTotal: 300,
    unconfirmedDecisions: 1,
    attentionScore: 1,
    lastActiveIso: "2026-01-01",
  });

  it("sorts by tokens and by attention", () => {
    expect(sortProjects([alpha, beta], "tokens").map((p) => p.key)).toEqual(["b", "a"]);
    expect(sortProjects([alpha, beta], "attention").map((p) => p.key)).toEqual(["a", "b"]);
  });

  it("filters by query, then focus, then review lens", () => {
    expect(
      applyDashboardFilters([alpha, beta], {
        query: "alp",
        sort: "recent",
        focusKey: null,
        lens: "all",
      }).map((p) => p.key),
    ).toEqual(["a"]);
    expect(
      applyDashboardFilters([alpha, beta], {
        query: "",
        sort: "recent",
        focusKey: "b",
        lens: "all",
      }).map((p) => p.key),
    ).toEqual(["b"]);
    // lens=issues keeps only rows with openIssues > 0
    expect(
      applyDashboardFilters([alpha, beta], {
        query: "",
        sort: "recent",
        focusKey: null,
        lens: "issues",
      }).map((p) => p.key),
    ).toEqual(["a"]);
  });

  it("attentionValue reads the right field per lens", () => {
    expect(attentionValue(alpha, "issues")).toBe(2);
    expect(attentionValue(beta, "decisions")).toBe(1);
    expect(attentionValue(beta, "next")).toBe(0);
    expect(attentionValue(alpha, "all")).toBe(2);
  });
});
