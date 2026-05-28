import { describe, expect, it } from "vitest";
import type { StoredSessionSummary } from "../storage/storageTypes";
import {
  buildHomeOverview,
  formatRelativeKo,
  type HomeOverviewInput,
  type HomeSessionMetricSnapshot,
} from "./homeOverview";

const NOW = Date.parse("2026-05-22T12:00:00+09:00");

function stored(
  over: Partial<StoredSessionSummary> = {},
): StoredSessionSummary {
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
    it("leads with import and follows with calm demo / memory entry points so the column never reads as one floating CTA", () => {
      const overview = buildHomeOverview(
        input({ storedSessions: [], realSessionCount: 0 }),
      );

      expect(overview.isEmpty).toBe(true);
      expect(overview.onlyDemo).toBe(true);
      expect(overview.metrics).toHaveLength(0);
      expect(overview.recentSessions).toHaveLength(0);
      expect(overview.nextActions.map((a) => a.kind)).toEqual([
        "import",
        "explore_demo",
        "open_memory",
      ]);
      expect(overview.nextActions[0]!.destination).toBe("connections");
      expect(overview.nextActions[1]!.destination).toBe("session");
      expect(overview.nextActions[2]!.destination).toBe("memory");
    });

    it("treats a demo-only store (sessions present but realSessionCount 0) as onlyDemo and offers just import", () => {
      const overview = buildHomeOverview(
        input({
          storedSessions: [
            stored({ sessionId: "demo-1", sourceLabel: undefined }),
          ],
          realSessionCount: 0,
          isDemo: true,
        }),
      );

      expect(overview.onlyDemo).toBe(true);
      // A demo session in the store still lists, but it is not "empty".
      expect(overview.isEmpty).toBe(false);
      // Import leads; demo and memory peeks follow so the column never
      // reads as a single floating CTA in an empty install.
      expect(overview.nextActions.map((a) => a.kind)).toEqual([
        "import",
        "explore_demo",
        "open_memory",
      ]);
    });
  });

  describe("metrics aggregation", () => {
    it("reports session count, project count, reconstructed steps, and recent activity from real data", () => {
      const overview = buildHomeOverview(
        input({
          realSessionCount: 2,
          isDemo: false,
          storedSessions: [
            stored({
              sessionId: "a",
              sourceLabel: "C:/dev/mori",
              startedAt: "2026-05-22T11:00:00+09:00",
            }),
            stored({
              sessionId: "b",
              sourceLabel: "C:/dev/other",
              startedAt: "2026-05-21T11:00:00+09:00",
            }),
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
            stored({
              sessionId: "a",
              sourceLabel: "C:/dev/mori",
              projectId: "p1",
            }),
            stored({
              sessionId: "b",
              sourceLabel: "C:/dev/mori",
              projectId: "p1",
            }),
            stored({ sessionId: "c", sourceLabel: undefined, projectId: "p2" }),
          ],
        }),
      );

      const projects = overview.metrics.find((m) => m.key === "projects");
      // Two distinct: the "C:/dev/mori" source group + the manual project.
      expect(projects!.value).toBe("2");
    });

    it("derives current and longest activity streaks from session anchor days", () => {
      const overview = buildHomeOverview(
        input({
          realSessionCount: 7,
          isDemo: false,
          // NOW is 2026-05-22 (KST).
          storedSessions: [
            // Live run ending today: 3 consecutive days.
            stored({ sessionId: "c1", startedAt: "2026-05-22T09:00:00+09:00" }),
            stored({ sessionId: "c2", startedAt: "2026-05-21T09:00:00+09:00" }),
            stored({ sessionId: "c3", startedAt: "2026-05-20T09:00:00+09:00" }),
            // Earlier, longer run (4 days) separated by a gap.
            stored({ sessionId: "l1", startedAt: "2026-05-13T09:00:00+09:00" }),
            stored({ sessionId: "l2", startedAt: "2026-05-12T09:00:00+09:00" }),
            stored({ sessionId: "l3", startedAt: "2026-05-11T09:00:00+09:00" }),
            stored({ sessionId: "l4", startedAt: "2026-05-10T09:00:00+09:00" }),
          ],
        }),
      );
      const byKey = Object.fromEntries(overview.metrics.map((m) => [m.key, m]));
      expect(byKey["streak-current"]!.value).toBe("3일");
      expect(byKey["streak-longest"]!.value).toBe("4일");
    });

    it("counts the current streak from yesterday when today has no session yet", () => {
      const overview = buildHomeOverview(
        input({
          realSessionCount: 2,
          isDemo: false,
          // No session today (05-22); two consecutive days ending yesterday.
          storedSessions: [
            stored({ sessionId: "y1", startedAt: "2026-05-21T09:00:00+09:00" }),
            stored({ sessionId: "y2", startedAt: "2026-05-20T09:00:00+09:00" }),
          ],
        }),
      );
      const current = overview.metrics.find((m) => m.key === "streak-current");
      expect(current!.value).toBe("2일");
    });

    it("shows no streak tiles when activity is older than yesterday", () => {
      const overview = buildHomeOverview(
        input({
          realSessionCount: 1,
          isDemo: false,
          storedSessions: [
            stored({
              sessionId: "old",
              startedAt: "2026-05-10T09:00:00+09:00",
            }),
          ],
        }),
      );
      expect(overview.metrics.some((m) => m.key === "streak-current")).toBe(
        false,
      );
      // A lone day is not a "longest streak" worth a tile either.
      expect(overview.metrics.some((m) => m.key === "streak-longest")).toBe(
        false,
      );
    });
  });

  describe("recent sessions", () => {
    it("sorts sessions newest-first", () => {
      const overview = buildHomeOverview(
        input({
          realSessionCount: 3,
          isDemo: false,
          storedSessions: [
            stored({
              sessionId: "old",
              startedAt: "2026-05-20T08:00:00+09:00",
            }),
            stored({
              sessionId: "new",
              startedAt: "2026-05-22T08:00:00+09:00",
            }),
            stored({
              sessionId: "mid",
              startedAt: "2026-05-21T08:00:00+09:00",
            }),
          ],
        }),
      );

      expect(overview.recentSessions.map((s) => s.sessionId)).toEqual([
        "new",
        "mid",
        "old",
      ]);
    });

    it("attaches a factual count summary only when there are reconstructed items", () => {
      const overview = buildHomeOverview(
        input({
          realSessionCount: 2,
          isDemo: false,
          storedSessions: [
            stored({ sessionId: "rich" }),
            stored({
              sessionId: "bare",
              startedAt: "2026-05-21T08:00:00+09:00",
            }),
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
            stored({
              sessionId: "man",
              sourceLabel: undefined,
              startedAt: "2026-05-21T08:00:00+09:00",
            }),
          ],
        }),
      );

      expect(
        overview.recentSessions.find((s) => s.sessionId === "imp")!.origin,
      ).toBe("imported");
      expect(
        overview.recentSessions.find((s) => s.sessionId === "man")!.origin,
      ).toBe("manual");
    });

    it("respects the recent limit", () => {
      const many = Array.from({ length: 10 }, (_, i) =>
        stored({
          sessionId: `s-${i}`,
          startedAt: `2026-05-${10 + i}T08:00:00+09:00`,
        }),
      );
      const overview = buildHomeOverview(
        input({
          realSessionCount: 10,
          isDemo: false,
          storedSessions: many,
          recentLimit: 4,
        }),
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
      const review = overview.nextActions.find(
        (a) => a.kind === "review_decisions",
      );
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
      expect(kinds.indexOf("resume")).toBeLessThan(
        kinds.indexOf("open_issues"),
      );
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
        stored({
          sessionId: "a",
          startedAt: "2026-05-22T08:00:00+09:00",
          eventCount: 12,
          tokenTotal: 5_000,
        }),
        stored({
          sessionId: "b",
          startedAt: "2026-05-21T08:00:00+09:00",
          eventCount: 8,
          tokenTotal: 3_000,
        }),
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
    const overview = buildHomeOverview({
      ...withSessions(),
      metric: "activity",
    });
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
    expect(overview.metricAvailability).toEqual({
      sessions: true,
      activity: true,
      tokens: true,
    });
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

describe("current / most-recent session strip", () => {
  it("shows the active session with its real event count and a resume action when it has work", () => {
    const overview = buildHomeOverview(
      input({
        realSessionCount: 2,
        isDemo: false,
        storedSessions: [
          stored({ sessionId: "old", startedAt: "2026-05-20T08:00:00+09:00" }),
          stored({
            sessionId: "active",
            startedAt: "2026-05-21T08:00:00+09:00",
            title: "활성 세션",
          }),
        ],
        sessionMetrics: [
          { sessionId: "active", events: 14, hasReconstructedWork: true },
        ],
        activeSession: { sessionId: "active", eventCount: 14 },
      }),
    );

    expect(overview.currentSessions).toHaveLength(1);
    const strip = overview.currentSessions[0]!;
    expect(strip.sessionId).toBe("active");
    expect(strip.isActive).toBe(true);
    expect(strip.eventCount).toBe(14);
    expect(strip.action.kind).toBe("resume");
    expect(strip.action.label).toBe("이어가기");
    expect(strip.action.destination).toBe("reports");
  });

  it("falls back to the most-recent captured session, hiding the event count, when no real session is active", () => {
    const overview = buildHomeOverview(
      input({
        realSessionCount: 2,
        isDemo: false,
        storedSessions: [
          stored({ sessionId: "old", startedAt: "2026-05-20T08:00:00+09:00" }),
          stored({
            sessionId: "recent",
            startedAt: "2026-05-22T08:00:00+09:00",
            title: "최근 세션",
          }),
        ],
        sessionMetrics: [{ sessionId: "recent", events: 9 }],
        activeSession: null,
      }),
    );

    const strip = overview.currentSessions[0]!;
    expect(strip.sessionId).toBe("recent");
    expect(strip.isActive).toBe(false);
    // The event count is real only for the loaded active session.
    expect(strip.eventCount).toBeNull();
    expect(strip.action.kind).toBe("resume");
  });

  it("offers 열기 (open → workspace) when the session has no reconstructed work", () => {
    const overview = buildHomeOverview(
      input({
        realSessionCount: 1,
        isDemo: false,
        storedSessions: [stored({ sessionId: "bare" })],
        sessionMetrics: [{ sessionId: "bare" }],
        activeSession: null,
      }),
    );
    const strip = overview.currentSessions[0]!;
    expect(strip.action.kind).toBe("open");
    expect(strip.action.label).toBe("열기");
    expect(strip.action.destination).toBe("workspace");
  });

  it("derives a non-live status word from session status, never 녹화 중", () => {
    const overview = buildHomeOverview(
      input({
        realSessionCount: 3,
        isDemo: false,
        storedSessions: [
          stored({
            sessionId: "done",
            status: "complete",
            startedAt: "2026-05-22T08:00:00+09:00",
          }),
        ],
        activeSession: null,
      }),
    );
    const strip = overview.currentSessions[0]!;
    expect(strip.statusLabel).toBe("분석 완료");
    expect(strip.statusLabel).not.toContain("녹화");

    const analyzing = buildHomeOverview(
      input({
        realSessionCount: 1,
        isDemo: false,
        storedSessions: [stored({ sessionId: "x", status: "analyzing" })],
        activeSession: null,
      }),
    );
    expect(analyzing.currentSessions[0]!.statusLabel).toBe("분석 중");

    const recording = buildHomeOverview(
      input({
        realSessionCount: 1,
        isDemo: false,
        storedSessions: [stored({ sessionId: "y", status: "recording" })],
        activeSession: null,
      }),
    );
    expect(recording.currentSessions[0]!.statusLabel).toBe("최근 작업");
  });

  it("emits no strip when there are no sessions", () => {
    const overview = buildHomeOverview(
      input({ storedSessions: [], realSessionCount: 0 }),
    );
    expect(overview.currentSessions).toEqual([]);
  });
});

describe("usage section panels", () => {
  function withUsage(over: Partial<HomeOverviewInput> = {}): HomeOverviewInput {
    return input({
      realSessionCount: 3,
      isDemo: false,
      storedSessions: [
        stored({
          sessionId: "a",
          sourceLabel: "C:/dev/mori",
          startedAt: "2026-05-22T08:00:00+09:00",
          tokenTotal: 5_000,
          tokenInput: 3_000,
          tokenOutput: 2_000,
        }),
        stored({
          sessionId: "b",
          sourceLabel: "C:/dev/mori",
          startedAt: "2026-05-15T08:00:00+09:00",
          tokenTotal: 3_000,
          tokenInput: 2_000,
          tokenOutput: 1_000,
        }),
        stored({
          sessionId: "c",
          sourceLabel: "C:/dev/other",
          startedAt: "2026-05-08T08:00:00+09:00",
        }),
      ],
      ...over,
    });
  }

  it("sums tokens only across sessions that carry them and states a partial scope honestly", () => {
    const overview = buildHomeOverview(withUsage());
    const tokens = overview.usagePanels.find((p) => p.key === "tokens")!;
    expect(tokens).toBeDefined();
    expect(tokens.value).toBe("8K"); // 5000 + 3000, third session has no tokens
    // Two of three sessions carry tokens → say so rather than implying a full total.
    expect(tokens.context).toBe("토큰 정보가 있는 세션 2개");
  });

  it("plots per-session token columns oldest→newest, normalised to the busiest session", () => {
    const overview = buildHomeOverview(withUsage());
    const tokens = overview.usagePanels.find((p) => p.key === "tokens")!;
    // Two of three sessions carry tokens; the token-less one is not plotted.
    expect(tokens.columns).toHaveLength(2);
    // Oldest first: session b (3000) then the busiest, newest session a (5000).
    expect(tokens.columns![0]!.fraction).toBeCloseTo(0.6);
    expect(tokens.columns![1]!.fraction).toBe(1);
    expect(tokens.columns![0]!.label).toContain("토큰");
  });

  it("omits the token column chart for a single token session (a one-bar chart is noise)", () => {
    const overview = buildHomeOverview(
      input({
        realSessionCount: 1,
        isDemo: false,
        storedSessions: [
          stored({
            sessionId: "solo",
            startedAt: "2026-05-22T08:00:00+09:00",
            tokenTotal: 4_000,
            tokenInput: 3_000,
            tokenOutput: 1_000,
          }),
        ],
      }),
    );
    const tokens = overview.usagePanels.find((p) => p.key === "tokens")!;
    expect(tokens).toBeDefined();
    expect(tokens.value).toBe("4K");
    expect(tokens.columns).toBeUndefined();
  });

  it("hides the token panel entirely when no session carries tokens (no fake zero)", () => {
    const overview = buildHomeOverview(
      input({
        realSessionCount: 2,
        isDemo: false,
        storedSessions: [
          stored({ sessionId: "a", startedAt: "2026-05-22T08:00:00+09:00" }),
          stored({ sessionId: "b", startedAt: "2026-05-15T08:00:00+09:00" }),
        ],
      }),
    );
    expect(overview.usagePanels.some((p) => p.key === "tokens")).toBe(false);
  });

  it("labels the token scope as a full total when every session carries tokens", () => {
    const overview = buildHomeOverview(
      input({
        realSessionCount: 2,
        isDemo: false,
        storedSessions: [
          stored({
            sessionId: "a",
            startedAt: "2026-05-22T08:00:00+09:00",
            tokenTotal: 4_000,
            tokenInput: 3_000,
            tokenOutput: 1_000,
          }),
          stored({
            sessionId: "b",
            startedAt: "2026-05-15T08:00:00+09:00",
            tokenTotal: 2_000,
            tokenInput: 1_500,
            tokenOutput: 500,
          }),
        ],
      }),
    );
    const tokens = overview.usagePanels.find((p) => p.key === "tokens")!;
    expect(tokens.context).toBe("가져온 세션 전체 합계");
  });

  it("reports sessions-per-week from the anchor span", () => {
    const overview = buildHomeOverview(withUsage());
    const cadence = overview.usagePanels.find((p) => p.key === "cadence")!;
    expect(cadence).toBeDefined();
    // 3 sessions over a 2-week span → ~1.5/week.
    expect(cadence.value).toBe("매주 1.5개");
    expect(cadence.context).toBe("세션 3개 기준");
  });

  it("hides the cadence panel for a single session (too thin to state a rate)", () => {
    const overview = buildHomeOverview(
      input({
        realSessionCount: 1,
        isDemo: false,
        storedSessions: [stored({ sessionId: "solo" })],
      }),
    );
    expect(overview.usagePanels.some((p) => p.key === "cadence")).toBe(false);
  });

  it("shows the top source labels with counts in the project spread", () => {
    const overview = buildHomeOverview(withUsage());
    const spread = overview.usagePanels.find((p) => p.key === "projects")!;
    expect(spread).toBeDefined();
    expect(spread.value).toBe("2"); // two distinct sources
    expect(spread.context).toContain("mori 2");
    expect(spread.context).toContain("other 1");
  });

  it("hides the project spread when only one group exists", () => {
    const overview = buildHomeOverview(
      input({
        realSessionCount: 2,
        isDemo: false,
        storedSessions: [
          stored({
            sessionId: "a",
            sourceLabel: "C:/dev/mori",
            startedAt: "2026-05-22T08:00:00+09:00",
          }),
          stored({
            sessionId: "b",
            sourceLabel: "C:/dev/mori",
            startedAt: "2026-05-15T08:00:00+09:00",
          }),
        ],
      }),
    );
    expect(overview.usagePanels.some((p) => p.key === "projects")).toBe(false);
  });

  it("yields an empty usage section when nothing is honestly derivable", () => {
    const overview = buildHomeOverview(
      input({
        realSessionCount: 1,
        isDemo: false,
        storedSessions: [
          stored({ sessionId: "solo", sourceLabel: "C:/dev/mori" }),
        ],
      }),
    );
    // One session: no tokens, too thin for cadence, single project group.
    expect(overview.usagePanels).toEqual([]);
  });
});

describe("formatRelativeKo", () => {
  it("renders sub-minute, minute, hour, and day windows in Korean", () => {
    expect(formatRelativeKo(new Date(NOW - 30_000).toISOString(), NOW)).toBe(
      "방금",
    );
    expect(
      formatRelativeKo(new Date(NOW - 5 * 60_000).toISOString(), NOW),
    ).toBe("5분 전");
    expect(
      formatRelativeKo(new Date(NOW - 3 * 3_600_000).toISOString(), NOW),
    ).toBe("3시간 전");
    expect(
      formatRelativeKo(new Date(NOW - 2 * 86_400_000).toISOString(), NOW),
    ).toBe("2일 전");
  });

  it("falls back to a date label beyond a week", () => {
    const label = formatRelativeKo(
      new Date(NOW - 30 * 86_400_000).toISOString(),
      NOW,
    );
    expect(label).toMatch(/월 .*일/);
  });
});
