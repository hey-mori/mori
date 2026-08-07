import { describe, expect, it } from "vitest";
import { buildProjectProjections } from "./buildProjectProjection";
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
