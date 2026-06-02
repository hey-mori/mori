import { describe, expect, it } from "vitest";
import { buildCommandSpaceResults, type CommandModeId } from "./commandSpace";
import type { StoredSessionSummary } from "../storage/storageTypes";

function session(
  overrides: Partial<StoredSessionSummary> & { sessionId: string },
): StoredSessionSummary {
  return {
    projectId: "p",
    title: "제목",
    projectName: "mori",
    savedAt: "2026-01-01T00:00:00.000Z",
    status: "complete",
    ...overrides,
  };
}

const SESSIONS: StoredSessionSummary[] = [
  session({
    sessionId: "s1",
    title: "JWT 인증 미들웨어 도입",
    projectName: "ng-gw",
    sourceLabel: "/Users/x/dev/ng-gw",
    startedAt: "2026-05-01T10:00:00.000Z",
  }),
  session({
    sessionId: "s2",
    title: "게이트웨이 라우팅 재설계",
    projectName: "ng-gw",
    sourceLabel: "/Users/x/dev/ng-gw",
    startedAt: "2026-05-10T10:00:00.000Z",
  }),
  session({
    sessionId: "s3",
    title: "타임라인 재기획",
    projectName: "mori",
    sourceLabel: "/Users/x/dev/mori",
    startedAt: "2026-05-20T10:00:00.000Z",
  }),
];

describe("buildCommandSpaceResults", () => {
  it("always yields the mode action first, even with no query", () => {
    const { rows, hasQuery } = buildCommandSpaceResults({
      modeId: "find",
      query: "",
      sessions: [],
    });
    expect(hasQuery).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "action", target: { type: "palette" } });
  });

  it("lists the most recent sessions when the query is empty", () => {
    const { rows } = buildCommandSpaceResults({
      modeId: "find",
      query: "",
      sessions: SESSIONS,
    });
    const sessionRows = rows.filter((row) => row.kind === "session");
    // Most-recent-first: s3 (May 20) before s2 (May 10) before s1 (May 1).
    expect(sessionRows.map((row) => row.id)).toEqual([
      "session:s3",
      "session:s2",
      "session:s1",
    ]);
    // No project rows surface until the user types.
    expect(rows.some((row) => row.kind === "project")).toBe(false);
  });

  it("filters sessions by title, project name, and source label", () => {
    const byTitle = buildCommandSpaceResults({
      modeId: "find",
      query: "라우팅",
      sessions: SESSIONS,
    });
    expect(byTitle.rows.filter((r) => r.kind === "session").map((r) => r.id)).toEqual([
      "session:s2",
    ]);

    const byProject = buildCommandSpaceResults({
      modeId: "find",
      query: "ng-gw",
      sessions: SESSIONS,
    });
    expect(
      byProject.rows.filter((r) => r.kind === "session").map((r) => r.id),
    ).toEqual(["session:s2", "session:s1"]);
  });

  it("surfaces matching projects (ranked by session count) once a query is typed", () => {
    const { rows } = buildCommandSpaceResults({
      modeId: "find",
      query: "g",
      sessions: SESSIONS,
    });
    const projectRows = rows.filter((row) => row.kind === "project");
    // Both "ng-gw" and "mori" (path contains no 'g' but label match): only the
    // ones whose label/key contains "g" survive. ng-gw matches twice → first.
    expect(projectRows[0]).toMatchObject({
      kind: "project",
      projectKey: "/Users/x/dev/ng-gw",
      hint: "/Users/x/dev/ng-gw",
    });
  });

  it("orders rows actions → projects → sessions", () => {
    const { rows } = buildCommandSpaceResults({
      modeId: "find",
      query: "ng-gw",
      sessions: SESSIONS,
    });
    const kinds = rows.map((row) => row.kind);
    const firstSession = kinds.indexOf("session");
    const firstProject = kinds.indexOf("project");
    expect(kinds[0]).toBe("action");
    expect(firstProject).toBeGreaterThan(0);
    expect(firstSession).toBeGreaterThan(firstProject);
  });

  it("words the find/create actions with the query and routes each mode", () => {
    const find = buildCommandSpaceResults({ modeId: "find", query: "인증", sessions: [] });
    expect(find.rows[0].label).toContain("인증");

    const create = buildCommandSpaceResults({ modeId: "create", query: "결제 모듈", sessions: [] });
    expect(create.rows[0]).toMatchObject({
      kind: "action",
      target: { type: "navigate", view: "start" },
    });
    expect(create.rows[0].label).toContain("결제 모듈");

    const routes: Record<CommandModeId, unknown> = {
      find: { type: "palette" },
      shape: { type: "navigate", view: "consolidation" },
      create: { type: "navigate", view: "start" },
      review: { type: "navigate", view: "continue" },
      connect: { type: "navigate", view: "connections" },
    };
    for (const modeId of Object.keys(routes) as CommandModeId[]) {
      const { rows } = buildCommandSpaceResults({ modeId, query: "", sessions: [] });
      const first = rows[0];
      expect(first.kind).toBe("action");
      if (first.kind === "action") {
        expect(first.target).toEqual(routes[modeId]);
      }
    }
  });

  it("caps query session matches at five", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      session({ sessionId: `m${i}`, title: `auth case ${i}`, projectName: "svc" }),
    );
    const { rows } = buildCommandSpaceResults({
      modeId: "find",
      query: "auth",
      sessions: many,
    });
    expect(rows.filter((row) => row.kind === "session")).toHaveLength(5);
  });
});
