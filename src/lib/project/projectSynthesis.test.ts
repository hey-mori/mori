import { describe, expect, it } from "vitest";
import {
  buildProjectSynthesis,
  type ProjectSessionContent,
} from "./projectSynthesis";
import type { Decision, Issue, NextAction } from "../../domain/types";

function decision(title: string, confirmed: boolean): Decision {
  return { id: title, title, decision: title, confirmed } as unknown as Decision;
}
function issue(title: string, status: Issue["status"]): Issue {
  return { id: title, title, description: title, status } as unknown as Issue;
}
function action(title: string, done = false): NextAction {
  return { id: title, title, done } as unknown as NextAction;
}
function session(
  sessionId: string,
  parts: Partial<Pick<ProjectSessionContent, "issues" | "decisions" | "nextActions">>,
): ProjectSessionContent {
  return {
    sessionId,
    title: `세션 ${sessionId}`,
    issues: parts.issues ?? [],
    decisions: parts.decisions ?? [],
    nextActions: parts.nextActions ?? [],
  };
}

describe("buildProjectSynthesis", () => {
  it("returns no content for empty sessions", () => {
    const result = buildProjectSynthesis([session("a", {})]);
    expect(result.hasContent).toBe(false);
    expect(result.sessionsWithContent).toBe(0);
  });

  it("collects decisions, open issues, and pending actions across sessions", () => {
    const result = buildProjectSynthesis([
      session("a", {
        decisions: [decision("토큰 버킷 채택", true), decision("미정 안", false)],
        issues: [issue("p99 지연", "open"), issue("해결된 것", "resolved")],
        nextActions: [action("부하 테스트"), action("완료된 것", true)],
      }),
      session("b", {
        decisions: [decision("서킷 브레이커 폴백", true)],
        issues: [issue("캐시 무효화", "open")],
      }),
    ]);

    expect(result.hasContent).toBe(true);
    expect(result.sessionsWithContent).toBe(2);
    // All recorded decisions roll up (the synthesis is a derived overview, not
    // the reviewed durable-memory layer), in session (recency) order.
    expect(result.decisions.map((d) => d.text)).toEqual([
      "토큰 버킷 채택",
      "미정 안",
      "서킷 브레이커 폴백",
    ]);
    expect(result.decisions[0]).toMatchObject({ sessionId: "a", sessionTitle: "세션 a" });
    expect(result.openIssues.map((i) => i.text)).toEqual(["p99 지연", "캐시 무효화"]);
    expect(result.pendingNextActions.map((a) => a.text)).toEqual(["부하 테스트"]);
    expect(result.totals).toEqual({ decisions: 3, openIssues: 2, pendingNextActions: 1 });
  });

  it("caps each list and preserves input (recency) order", () => {
    const decisions = Array.from({ length: 8 }, (_, i) => decision(`결정 ${i}`, true));
    const result = buildProjectSynthesis([session("a", { decisions })], { cap: 3 });
    expect(result.decisions).toHaveLength(3);
    expect(result.decisions.map((d) => d.text)).toEqual(["결정 0", "결정 1", "결정 2"]);
    expect(result.totals.decisions).toBe(8);
  });

  it("skips items with blank titles", () => {
    const result = buildProjectSynthesis([
      session("a", { decisions: [decision("  ", true)], issues: [issue("", "open")] }),
    ]);
    expect(result.hasContent).toBe(false);
  });
});
