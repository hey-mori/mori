import { describe, expect, it } from "vitest";
import {
  buildCommandSpaceResults,
  buildModeGuide,
  tokenizeQuery,
  type CommandModeId,
} from "./commandSpace";
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

describe("tokenizeQuery", () => {
  it("lowercases, splits, and drops command filler", () => {
    expect(tokenizeQuery("인증 정책 결정 찾아줘")).toEqual(["인증", "정책", "결정"]);
    expect(tokenizeQuery("  Find AUTH  ")).toEqual(["auth"]);
    expect(tokenizeQuery("보여줘")).toEqual([]);
    expect(tokenizeQuery("")).toEqual([]);
  });
});

describe("buildCommandSpaceResults", () => {
  it("finds work from a full typed sentence, not just a bare keyword", () => {
    // "찾아줘" is stripped, so the keywords 인증 / 정책 / 결정 drive the match.
    const { rows, hasQuery } = buildCommandSpaceResults({
      modeId: "find",
      query: "인증 정책 결정 찾아줘",
      sessions: SESSIONS,
    });
    expect(hasQuery).toBe(true);
    const sessions = rows.filter((row) => row.kind === "session");
    expect(sessions.map((row) => row.id)).toEqual(["session:s1"]);
  });

  it("treats a filler-only query as empty: recent sessions, no projects", () => {
    const { rows, hasQuery } = buildCommandSpaceResults({
      modeId: "find",
      query: "보여줘",
      sessions: SESSIONS,
    });
    expect(hasQuery).toBe(false);
    expect(rows.some((row) => row.kind === "project")).toBe(false);
    const sessions = rows.filter((row) => row.kind === "session");
    expect(sessions.map((row) => row.id)).toEqual([
      "session:s3",
      "session:s2",
      "session:s1",
    ]);
  });

  it("ranks sessions by how many keywords hit", () => {
    const { rows } = buildCommandSpaceResults({
      modeId: "find",
      query: "게이트웨이 라우팅",
      sessions: SESSIONS,
    });
    const sessions = rows.filter((row) => row.kind === "session");
    // s2 hits both keywords; nothing else hits, so it stands alone on top.
    expect(sessions[0]?.id).toBe("session:s2");
  });

  it("matches sessions across title, project, and source label", () => {
    const { rows } = buildCommandSpaceResults({
      modeId: "find",
      query: "ng-gw",
      sessions: SESSIONS,
    });
    const sessions = rows.filter((row) => row.kind === "session");
    expect(sessions.map((row) => row.id)).toEqual(["session:s2", "session:s1"]);
  });

  it("leads with matches in 찾기 and trails the full-search action", () => {
    const { rows } = buildCommandSpaceResults({
      modeId: "find",
      query: "ng-gw",
      sessions: SESSIONS,
    });
    expect(rows[0].kind).not.toBe("action");
    expect(rows[rows.length - 1]).toMatchObject({
      kind: "action",
      target: { type: "palette" },
    });
  });

  it("leads with the verb in the doing modes", () => {
    const { rows } = buildCommandSpaceResults({
      modeId: "create",
      query: "결제 모듈",
      sessions: SESSIONS,
    });
    expect(rows[0]).toMatchObject({
      kind: "action",
      target: { type: "navigate", view: "start" },
    });
    expect(rows[0].label).toContain("결제 모듈");
  });

  it("words the find action with the cleaned keywords", () => {
    const { rows } = buildCommandSpaceResults({
      modeId: "find",
      query: "인증 정책 찾아줘",
      sessions: [],
    });
    const action = rows.find((row) => row.kind === "action");
    expect(action?.label).toContain("인증 정책");
    expect(action?.label).not.toContain("찾아줘");
  });

  it("routes each mode's primary action", () => {
    const routes: Record<CommandModeId, unknown> = {
      find: { type: "palette" },
      ask: { type: "ask", question: "" },
      shape: { type: "navigate", view: "consolidation" },
      create: { type: "navigate", view: "start" },
      review: { type: "navigate", view: "continue" },
      connect: { type: "navigate", view: "connections" },
    };
    for (const modeId of Object.keys(routes) as CommandModeId[]) {
      const { rows } = buildCommandSpaceResults({ modeId, query: "", sessions: [] });
      const action = rows.find((row) => row.kind === "action");
      expect(action?.kind).toBe("action");
      if (action?.kind === "action") {
        expect(action.target).toEqual(routes[modeId]);
      }
    }
  });

  it("carries the raw question on the ask action, leading with the verb", () => {
    const { rows } = buildCommandSpaceResults({
      modeId: "ask",
      query: "인증 방식은 어떻게 결정했나요?",
      sessions: SESSIONS,
    });
    // The ask verb leads (a doing mode), and it keeps the full sentence —
    // grammar and all — not the filler-stripped keywords.
    expect(rows[0]).toMatchObject({
      kind: "action",
      target: { type: "ask", question: "인증 방식은 어떻게 결정했나요?" },
    });
    expect(rows[0].label).toContain("인증 방식은 어떻게 결정했나요?");
  });

  it("offers an ask action with an empty question when nothing is typed", () => {
    const { rows } = buildCommandSpaceResults({
      modeId: "ask",
      query: "",
      sessions: [],
    });
    expect(rows[0]).toMatchObject({
      kind: "action",
      target: { type: "ask", question: "" },
    });
  });

  it("surfaces matching sessions as context under the ask action", () => {
    const { rows } = buildCommandSpaceResults({
      modeId: "ask",
      query: "라우팅 관련 결정",
      sessions: SESSIONS,
    });
    expect(rows[0].kind).toBe("action");
    // s2 ("게이트웨이 라우팅 재설계") is the matching supporting context.
    expect(rows.some((row) => row.kind === "session" && row.id === "session:s2")).toBe(true);
  });

  it("caps keyword session matches at five", () => {
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

describe("buildModeGuide", () => {
  it("gives the input-led modes example prompts plus a related feature", () => {
    for (const modeId of ["find", "ask"] as CommandModeId[]) {
      const guide = buildModeGuide({ modeId, sessions: SESSIONS });
      expect(guide.headline.length).toBeGreaterThan(0);
      expect(guide.headline.endsWith(".")).toBe(false);
      expect(guide.prompts.length).toBeGreaterThan(0);
      expect(guide.features.length).toBeGreaterThan(0);
    }
  });

  it("labels the prompt group with the mode's own verb", () => {
    expect(buildModeGuide({ modeId: "find", sessions: SESSIONS }).promptsLabel).toBe(
      "이렇게 찾아보세요",
    );
    expect(buildModeGuide({ modeId: "ask", sessions: SESSIONS }).promptsLabel).toBe(
      "이렇게 물어보세요",
    );
  });

  it("cleans a path-shaped project label down to its leaf name", () => {
    const guide = buildModeGuide({
      modeId: "ask",
      sessions: [
        session({
          sessionId: "only",
          projectName: "",
          sourceLabel: "C:/dev/ng-gw",
          startedAt: "2026-06-01T10:00:00.000Z",
        }),
      ],
    });
    expect(guide.prompts.some((p) => p.label.includes("ng-gw"))).toBe(true);
    expect(guide.prompts.some((p) => p.label.includes("C:/dev"))).toBe(false);
  });

  it("leads the navigation-only modes with the feature and no prompts", () => {
    const routes: Partial<Record<CommandModeId, unknown>> = {
      shape: { type: "navigate", view: "consolidation" },
      create: { type: "navigate", view: "start" },
      review: { type: "navigate", view: "continue" },
      connect: { type: "navigate", view: "connections" },
    };
    for (const modeId of Object.keys(routes) as CommandModeId[]) {
      const guide = buildModeGuide({ modeId, sessions: SESSIONS });
      expect(guide.prompts).toHaveLength(0);
      expect(guide.features[0]?.target).toEqual(routes[modeId]);
    }
  });

  it("seeds examples with the most recent project so they read like the user's work", () => {
    const guide = buildModeGuide({ modeId: "ask", sessions: SESSIONS });
    // s3 ("타임라인 재기획", project "mori") is the most recent by startedAt.
    expect(guide.prompts.some((p) => p.label.includes("mori"))).toBe(true);
  });

  it("falls back to generic examples with no sessions", () => {
    const guide = buildModeGuide({ modeId: "find", sessions: [] });
    expect(guide.prompts.length).toBeGreaterThan(0);
    expect(guide.features[0]?.target).toEqual({ type: "palette" });
  });
});
