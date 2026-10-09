import { describe, expect, it } from "vitest";
import { buildProjectProjections, buildScopedProjection } from "./buildProjectProjection";
import { INTAKE_ROW_VERSION, type IntakeRequestRow } from "./intakeTypes";

const NOW = Date.parse("2026-08-07T12:00:00.000Z");

function ago(minutes: number): string {
  return new Date(NOW - minutes * 60_000).toISOString();
}

function row(partial: Partial<IntakeRequestRow> & { id: string }): IntakeRequestRow {
  return {
    schemaVersion: INTAKE_ROW_VERSION,
    sessionKey: "/s/a.jsonl",
    projectPath: "C:\\dev\\mori",
    sessionLabel: "mori",
    title: "an ask",
    titleTruncated: false,
    startedAt: ago(10),
    endedAt: ago(2),
    stepCount: 12,
    tools: ["Edit"],
    files: [],
    hasError: false,
    status: "completed",
    locator: { path: "/s/a.jsonl", offset: 0 },
    observedAt: ago(1),
    ...partial,
  };
}

describe("buildProjectProjections", () => {
  it("folds rows into one entry per project", () => {
    const out = buildProjectProjections(
      [
        row({ id: "a1" }),
        row({ id: "a2" }),
        row({ id: "b1", projectPath: "C:\\dev\\other", sessionLabel: "other" }),
      ],
      { now: NOW },
    );

    expect(out).toHaveLength(2);
    expect(out.map((p) => p.projectPath).sort()).toEqual(["C:\\dev\\mori", "C:\\dev\\other"]);
    expect(out.find((p) => p.label === "mori")?.rowCount).toBe(2);
  });

  it("never folds two projects that merely share a trailing name", () => {
    const out = buildProjectProjections(
      [
        row({ id: "w", projectPath: "C:\\work\\api", sessionLabel: "api" }),
        row({ id: "p", projectPath: "C:\\play\\api", sessionLabel: "api" }),
      ],
      { now: NOW },
    );

    expect(out).toHaveLength(2);
  });

  it("drops a row the reader could not attribute rather than inventing a project", () => {
    const out = buildProjectProjections([row({ id: "x", projectPath: "" })], { now: NOW });

    expect(out).toEqual([]);
  });

  describe("freshness", () => {
    it("reads a just-observed project as live", () => {
      const out = buildProjectProjections([row({ id: "a", observedAt: ago(1) })], { now: NOW });

      expect(out[0].freshness).toBe("live");
    });

    it("reads an hour-old observation as recent, not live", () => {
      const out = buildProjectProjections([row({ id: "a", observedAt: ago(60) })], { now: NOW });

      expect(out[0].freshness).toBe("recent");
    });

    it("reads a day-old observation as stale", () => {
      const out = buildProjectProjections([row({ id: "a", observedAt: ago(60 * 24) })], {
        now: NOW,
      });

      expect(out[0].freshness).toBe("stale");
    });

    it("takes freshness from the newest contributing row", () => {
      const out = buildProjectProjections(
        [row({ id: "old", observedAt: ago(600) }), row({ id: "new", observedAt: ago(1) })],
        { now: NOW },
      );

      expect(out[0].freshness).toBe("live");
    });
  });

  describe("present tense", () => {
    it("counts what is running, waiting and blocked while live", () => {
      const out = buildProjectProjections(
        [
          row({ id: "r", status: "running" }),
          row({ id: "w", status: "waitingForUser" }),
          row({ id: "b", status: "blocked" }),
          row({ id: "c", status: "completed" }),
        ],
        { now: NOW },
      );

      expect(out[0]).toMatchObject({ runningCount: 1, waitingCount: 1, blockedCount: 1 });
    });

    it("stops claiming a present tense once the observation is stale", () => {
      // Mori has not been watching. Reporting "1개 진행 중" here would be
      // inventing a present, which the never-fabricate invariant forbids.
      const out = buildProjectProjections(
        [
          row({ id: "r", status: "running", observedAt: ago(60 * 24) }),
          row({ id: "b", status: "blocked", observedAt: ago(60 * 24) }),
        ],
        { now: NOW },
      );

      expect(out[0].freshness).toBe("stale");
      expect(out[0]).toMatchObject({ runningCount: 0, waitingCount: 0, blockedCount: 0 });
      expect(out[0].running).toEqual([]);
    });

    it("decays a stale running request to unknown, never to completed", () => {
      const out = buildProjectProjections(
        [row({ id: "r", status: "running", observedAt: ago(60 * 24) })],
        { now: NOW },
      );

      expect(out[0].recentRequests[0].status).toBe("unknown");
    });

    it("keeps a completed request completed when stale, since the past does not decay", () => {
      const out = buildProjectProjections(
        [row({ id: "c", status: "completed", observedAt: ago(60 * 24) })],
        { now: NOW },
      );

      expect(out[0].recentRequests[0].status).toBe("completed");
    });

    it("still reports the last activity when stale, so the surface is not blank", () => {
      const out = buildProjectProjections(
        [row({ id: "c", observedAt: ago(60 * 24), endedAt: ago(60 * 25) })],
        { now: NOW },
      );

      expect(out[0].lastActivityAt).toBe(ago(60 * 25));
    });
  });

  describe("waiting for the user", () => {
    it("lists what waits for the user, newest first, with the session to open", () => {
      const out = buildProjectProjections(
        [
          row({ id: "older", status: "waitingForUser", endedAt: ago(30), sessionKey: "/c/a.jsonl" }),
          row({ id: "newer", status: "waitingForUser", endedAt: ago(5), sessionKey: "/c/b.jsonl" }),
          row({ id: "busy", status: "running", startedAt: ago(3) }),
        ],
        { now: NOW },
      );
      expect(out[0].waitingCount).toBe(2);
      expect(out[0].waiting.map((r) => [r.id, r.sessionKey])).toEqual([
        ["newer", "/c/b.jsonl"],
        ["older", "/c/a.jsonl"],
      ]);
      expect(out[0].running[0]?.sessionKey).toBeDefined();
    });

    it("lists nothing as waiting once the observation is stale", () => {
      const out = buildProjectProjections(
        [row({ id: "w", status: "waitingForUser", endedAt: ago(60 * 25), observedAt: ago(60 * 25) })],
        { now: NOW },
      );
      expect(out[0].waiting).toEqual([]);
      expect(out[0].waitingCount).toBe(0);
    });
  });

  describe("running detail", () => {
    it("carries elapsed time and step count, so a long run is visible as one", () => {
      const out = buildProjectProjections(
        [row({ id: "r", status: "running", startedAt: ago(30), stepCount: 71 })],
        { now: NOW },
      );

      expect(out[0].running).toHaveLength(1);
      expect(out[0].running[0]).toMatchObject({ stepCount: 71, elapsedMs: 30 * 60_000 });
    });

    it("puts the longest-running request first", () => {
      const out = buildProjectProjections(
        [
          row({ id: "short", status: "running", startedAt: ago(2) }),
          row({ id: "long", status: "running", startedAt: ago(40) }),
        ],
        { now: NOW },
      );

      expect(out[0].running.map((r) => r.id)).toEqual(["long", "short"]);
    });
  });

  it("lists recent requests newest first and caps them", () => {
    const rows = [1, 2, 3, 4].map((n) => row({ id: `r${n}`, endedAt: ago(n) }));
    const out = buildProjectProjections(rows, { now: NOW, recentRequestLimit: 2 });

    expect(out[0].recentRequests.map((r) => r.id)).toEqual(["r1", "r2"]);
  });

  it("sums file changes across requests and leads with the most changed", () => {
    const out = buildProjectProjections(
      [
        row({
          id: "a",
          files: [
            { path: "big.ts", changeKind: "edited", additions: 10, deletions: 2, touchCount: 1 },
            { path: "small.ts", changeKind: "edited", additions: 1, deletions: 0, touchCount: 1 },
          ],
        }),
        row({
          id: "b",
          files: [
            { path: "big.ts", changeKind: "edited", additions: 5, deletions: 1, touchCount: 1 },
          ],
        }),
      ],
      { now: NOW },
    );

    expect(out[0].topFiles[0]).toMatchObject({ path: "big.ts", additions: 15, deletions: 3 });
    expect(out[0].topFiles[1].path).toBe("small.ts");
  });

  it("orders projects by most recent activity", () => {
    const out = buildProjectProjections(
      [
        row({ id: "quiet", projectPath: "C:\\dev\\quiet", endedAt: ago(600) }),
        row({ id: "busy", projectPath: "C:\\dev\\busy", endedAt: ago(1) }),
      ],
      { now: NOW },
    );

    expect(out.map((p) => p.label)).toEqual(["busy", "quiet"]);
  });

  it("returns nothing for no rows", () => {
    expect(buildProjectProjections([], { now: NOW })).toEqual([]);
  });
});

describe("each request is judged by its own observation", () => {
  it("a session observed now does not make another session's old request current", () => {
    const out = buildProjectProjections(
      [
        row({ id: "fresh", sessionKey: "/s/a.jsonl", status: "completed", observedAt: ago(1) }),
        row({ id: "old-run", sessionKey: "/s/b.jsonl", status: "running", startedAt: ago(60 * 9), observedAt: ago(60 * 8) }),
        row({ id: "old-wait", sessionKey: "/s/b.jsonl", status: "waitingForUser", endedAt: ago(60 * 8), observedAt: ago(60 * 8) }),
      ],
      { now: NOW },
    );
    expect(out[0].freshness).toBe("live");
    expect(out[0].runningCount).toBe(0);
    expect(out[0].waitingCount).toBe(0);
    expect(out[0].running).toEqual([]);
    expect(out[0].waiting).toEqual([]);
    // Still listed as last observed, without a present-tense status.
    const recent = Object.fromEntries(out[0].recentRequests.map((r) => [r.id, r.status]));
    expect(recent).toMatchObject({ "old-run": "unknown", "old-wait": "unknown", fresh: "completed" });
  });

  it("keeps a recently observed request in each session current", () => {
    const out = buildProjectProjections(
      [
        row({ id: "a", sessionKey: "/s/a.jsonl", status: "waitingForUser", observedAt: ago(30) }),
        row({ id: "b", sessionKey: "/s/b.jsonl", status: "running", startedAt: ago(10), observedAt: ago(2) }),
      ],
      { now: NOW },
    );
    expect([out[0].waitingCount, out[0].runningCount]).toEqual([1, 1]);
    // The counts are dated by their oldest observation, not the newest.
    expect(out[0].countedObservedAt).toBe(ago(30));
  });

  it("measures a request not seen moments ago only up to when it was seen", () => {
    const out = buildProjectProjections(
      [row({ id: "r", status: "running", startedAt: ago(60 * 5), observedAt: ago(60 * 2) })],
      { now: NOW },
    );
    expect(out[0].running[0]?.elapsedMs).toBe(3 * 60 * 60_000);
  });

  it("dates nothing when nothing is counted", () => {
    const out = buildProjectProjections([row({ id: "c", status: "completed" })], { now: NOW });
    expect(out[0].countedObservedAt).toBeNull();
  });
});

describe("blocked requests", () => {
  it("lists a current blocked request so it can be opened, newest first", () => {
    const out = buildProjectProjections(
      [
        row({ id: "b-old", sessionKey: "/s/a.jsonl", status: "blocked", endedAt: ago(40), observedAt: ago(5) }),
        row({ id: "b-new", sessionKey: "/s/b.jsonl", status: "blocked", endedAt: ago(10), observedAt: ago(5) }),
      ],
      { now: NOW },
    );
    expect(out[0].blockedCount).toBe(2);
    expect(out[0].blocked.map((r) => r.id)).toEqual(["b-new", "b-old"]);
  });

  it("does not list a blocked request whose own observation is stale", () => {
    const out = buildProjectProjections(
      [
        row({ id: "fresh", sessionKey: "/s/a.jsonl", observedAt: ago(1) }),
        row({ id: "b", sessionKey: "/s/b.jsonl", status: "blocked", observedAt: ago(60 * 8) }),
      ],
      { now: NOW },
    );
    expect(out[0].blockedCount).toBe(0);
    expect(out[0].blocked).toEqual([]);
  });
});

describe("a projection over chosen sessions", () => {
  it("folds rows from different folders under the project's own label", () => {
    const projection = buildScopedProjection(
      [
        row({ id: "main", projectPath: "/home/u/dev/infra", sessionKey: "/c/main.jsonl", status: "running", observedAt: ago(1) }),
        row({ id: "wt", projectPath: "/home/u/dev", sessionKey: "/c/worktree.jsonl", status: "waitingForUser", observedAt: ago(2) }),
      ],
      { now: NOW, label: "infra" },
    );
    expect(projection).toMatchObject({ label: "infra", runningCount: 1, waitingCount: 1, rowCount: 2 });
    expect(projection!.waiting.map((r) => r.sessionKey)).toEqual(["/c/worktree.jsonl"]);
  });

  it("is null without rows", () => {
    expect(buildScopedProjection([], { now: NOW, label: "infra" })).toBeNull();
  });
});

describe("an observation the session has since moved past", () => {
  const blockedThen = row({ id: "b", sessionKey: "/s/a.jsonl", status: "blocked", endedAt: ago(125), observedAt: ago(120) });
  const waitingNow = row({ id: "w", sessionKey: "/s/b.jsonl", status: "waitingForUser", endedAt: ago(31), observedAt: ago(30) });
  const activeAt = (map: Record<string, string>) => (key: string) => map[key];

  it("stops counting a status once the source was written after it, and lists the session", () => {
    const out = buildProjectProjections([blockedThen, waitingNow], {
      now: NOW,
      sourceActiveAt: activeAt({ "/s/a.jsonl": ago(1) }),
    })[0]!;
    expect(out.blockedCount).toBe(0);
    expect(out.blocked).toEqual([]);
    expect(out.waitingCount).toBe(1);
    expect(out.countedObservedAt).toBe(ago(30));
    expect(out.continued).toEqual([
      { sessionKey: "/s/a.jsonl", lastTitle: "an ask", lastStatus: "blocked", lastObservedAt: ago(120), activeAt: ago(1) },
    ]);
    expect(out.recentRequests.find((r) => r.id === "b")?.status).toBe("unknown");
    expect(out.lastActivityAt).toBe(ago(1));
  });

  it("keeps the observation when the source was written before it or within the poll grace", () => {
    for (const written of [ago(200), ago(119)]) {
      const out = buildProjectProjections([blockedThen], {
        now: NOW,
        sourceActiveAt: activeAt({ "/s/a.jsonl": written }),
      })[0]!;
      expect(out.blockedCount).toBe(1);
      expect(out.continued).toEqual([]);
    }
  });

  it("changes nothing when the source activity is unknown", () => {
    const out = buildProjectProjections([blockedThen], { now: NOW })[0]!;
    expect(out.blockedCount).toBe(1);
    expect(out.continued).toEqual([]);
  });

  it("lists a session that went on long after a stale observation", () => {
    const old = { ...blockedThen, observedAt: ago(60 * 30), endedAt: ago(60 * 30) };
    const out = buildProjectProjections([old], {
      now: NOW,
      sourceActiveAt: activeAt({ "/s/a.jsonl": ago(60 * 2) }),
    })[0]!;
    expect(out.freshness).toBe("stale");
    expect(out.continued.map((s) => s.sessionKey)).toEqual(["/s/a.jsonl"]);
  });

  it("judges a session by its newest observation, not its oldest row", () => {
    const earlier = row({ id: "e", sessionKey: "/s/a.jsonl", status: "completed", endedAt: ago(300), observedAt: ago(300) });
    const out = buildProjectProjections([earlier, blockedThen], {
      now: NOW,
      sourceActiveAt: activeAt({ "/s/a.jsonl": ago(119) }),
    })[0]!;
    expect(out.continued).toEqual([]);
    expect(out.blockedCount).toBe(1);
  });

  it("applies to a projection over chosen sessions too", () => {
    const out = buildScopedProjection([blockedThen], {
      now: NOW,
      label: "infra",
      sourceActiveAt: activeAt({ "/s/a.jsonl": ago(1) }),
    })!;
    expect(out.blockedCount).toBe(0);
    expect(out.continued).toHaveLength(1);
  });
});
