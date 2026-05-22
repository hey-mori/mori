import { describe, expect, it } from "vitest";
import type { TimelineEvent } from "../../domain/types";
import { buildTurns, inferActorFallback } from "./buildTurns";

function event(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: "evt-1",
    sessionId: "s1",
    projectId: "p1",
    start: "2026-05-22T09:00:00Z",
    type: "aiConversation",
    title: "사용자 질문",
    summary: "Claude 응답",
    sourceRefs: [],
    linkedIssueIds: [],
    linkedDecisionIds: [],
    relationshipIds: [],
    trustLevel: "observed",
    confidence: 0.9,
    createdBy: "import",
    userModified: false,
    ...overrides,
  };
}

describe("buildTurns", () => {
  it("folds events sharing a turnId into one turn, bucketed by actor", () => {
    const turns = buildTurns([
      event({ id: "ask", turnId: "t1", turnIndex: 0, actor: "user", title: "충돌 해결?" }),
      event({ id: "reply", turnId: "t1", turnIndex: 0, actor: "assistant", summary: "merge 추천" }),
      event({ id: "tool", turnId: "t1", turnIndex: 0, actor: "tool", toolName: "Bash" }),
    ]);

    expect(turns).toHaveLength(1);
    const [turn] = turns;
    expect(turn.id).toBe("t1");
    expect(turn.index).toBe(0);
    expect(turn.ask?.id).toBe("ask");
    expect(turn.assistant?.id).toBe("reply");
    expect(turn.toolCalls.map((event) => event.id)).toEqual(["tool"]);
  });

  it("keeps distinct turns separate and preserves first-seen order", () => {
    const turns = buildTurns([
      event({ id: "a", turnId: "t1", actor: "user" }),
      event({ id: "b", turnId: "t2", actor: "user" }),
      event({ id: "c", turnId: "t1", actor: "assistant" }),
    ]);

    expect(turns.map((turn) => turn.id)).toEqual(["t1", "t2"]);
    expect(turns[0].index).toBe(0);
    expect(turns[1].index).toBe(1);
    expect(turns[0].ask?.id).toBe("a");
    expect(turns[0].assistant?.id).toBe("c");
  });

  it("buckets file edits, decisions, and issues onto their turn", () => {
    const turns = buildTurns([
      event({ id: "file", turnId: "t1", actor: "file", type: "fileCode" }),
      event({ id: "decision", turnId: "t1", actor: "decision", type: "decision" }),
      event({ id: "issue", turnId: "t1", actor: "assistant", type: "issue" }),
    ]);

    const [turn] = turns;
    expect(turn.fileEdits.map((event) => event.id)).toEqual(["file"]);
    expect(turn.decisions.map((event) => event.id)).toEqual(["decision"]);
    expect(turn.issues.map((event) => event.id)).toEqual(["issue"]);
  });

  it("resolves a missing actor through the fallback heuristic", () => {
    const turns = buildTurns([
      // Legacy event: no actor, reply text reads as tool activity.
      event({ id: "legacy", turnId: "t1", summary: "$ npm test" }),
    ]);
    expect(turns[0].toolCalls.map((event) => event.id)).toEqual(["legacy"]);
    expect(turns[0].ask).toBeNull();
    expect(turns[0].assistant).toBeNull();
  });

  it("never drops orphan events lacking a turnId — each becomes its own turn", () => {
    const turns = buildTurns([
      event({ id: "o1", actor: "user" }),
      event({ id: "o2", actor: "assistant" }),
    ]);

    expect(turns).toHaveLength(2);
    expect(turns.map((turn) => turn.id)).toEqual(["o1", "o2"]);
    expect(turns[0].ask?.id).toBe("o1");
    expect(turns[1].assistant?.id).toBe("o2");
  });

  it("returns no turns for an empty event list", () => {
    expect(buildTurns([])).toEqual([]);
  });
});

describe("inferActorFallback", () => {
  it("classifies a conversation reply as assistant", () => {
    expect(inferActorFallback(event({ title: "질문", summary: "답변입니다." }))).toBe("assistant");
  });

  it("classifies mechanical tool output as a tool turn", () => {
    expect(inferActorFallback(event({ title: "실행", summary: "$ npm test" }))).toBe("tool");
    expect(inferActorFallback(event({ title: "x", summary: "> running build" }))).toBe("tool");
    expect(inferActorFallback(event({ title: "x", summary: "executing migration" }))).toBe("tool");
  });

  it("classifies an ask-only turn as user", () => {
    expect(inferActorFallback(event({ title: "질문만 있음", summary: "" }))).toBe("user");
  });

  it("classifies an empty turn as system", () => {
    expect(
      inferActorFallback(event({ title: "(no response captured)", summary: "" })),
    ).toBe("system");
  });

  it("maps decision and fileCode event types onto their actors", () => {
    expect(inferActorFallback(event({ type: "decision" }))).toBe("decision");
    expect(inferActorFallback(event({ type: "fileCode" }))).toBe("file");
    expect(inferActorFallback(event({ type: "artifact" }))).toBe("file");
  });
});
