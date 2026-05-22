import { describe, expect, it } from "vitest";
import type { TimelineEvent } from "../../domain/types";
import type { Turn } from "./buildTurns";
import { buildTurns } from "./buildTurns";
import { buildTurnCardModel } from "./turnCard";

let seq = 0;
function event(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  seq += 1;
  return {
    id: `evt-${seq}`,
    sessionId: "s1",
    projectId: "p1",
    start: "2026-05-22T09:00:00Z",
    type: "aiConversation",
    title: "",
    summary: "",
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

function turnOf(events: TimelineEvent[]): Turn {
  return buildTurns(events)[0]!;
}

describe("buildTurnCardModel", () => {
  it("reads the ask from the title and the reply from the summary of a paired turn", () => {
    const turn = turnOf([
      event({
        turnId: "t1",
        actor: "assistant",
        title: "충돌을 어떻게 해결하지?",
        summary: "rebase 대신 merge를 추천합니다.",
      }),
    ]);
    const card = buildTurnCardModel(turn);
    expect(card.ask).toBe("충돌을 어떻게 해결하지?");
    expect(card.reply).toBe("rebase 대신 merge를 추천합니다.");
    expect(card.fallback).toBeNull();
  });

  it("collapses tool calls and file edits into a labelled strip with a summary", () => {
    const turn = turnOf([
      event({ turnId: "t1", actor: "user", title: "리팩터링 해줘" }),
      event({ turnId: "t1", actor: "tool", toolName: "Bash", summary: "npm test" }),
      event({ turnId: "t1", actor: "tool", toolName: "Grep", summary: "search foo" }),
      event({ turnId: "t1", type: "fileCode", actor: "file", title: "src/a.ts 수정" }),
    ]);
    const card = buildTurnCardModel(turn);
    expect(card.toolCount).toBe(2);
    expect(card.fileCount).toBe(1);
    expect(card.activitySummary).toBe("도구 2 · 파일 1");
    expect(card.activity.map((item) => item.label)).toEqual(["Bash", "Grep", "파일"]);
    expect(card.activity[2]?.isFileEdit).toBe(true);
  });

  it("labels a tool call with a fallback when no tool name was parsed", () => {
    const turn = turnOf([
      event({ turnId: "t1", actor: "user", title: "실행" }),
      event({ turnId: "t1", actor: "tool", summary: "ran something" }),
    ]);
    const card = buildTurnCardModel(turn);
    expect(card.activity[0]?.label).toBe("도구");
    expect(card.activitySummary).toBe("도구 1");
  });

  it("treats a tool-actor reply as activity, not a reply", () => {
    const turn = turnOf([
      event({
        turnId: "t1",
        actor: "tool",
        toolName: "Bash",
        title: "테스트 실행해줘",
        summary: "npm test 실행",
      }),
    ]);
    const card = buildTurnCardModel(turn);
    expect(card.ask).toBe("테스트 실행해줘");
    expect(card.reply).toBeNull();
    expect(card.toolCount).toBe(1);
    expect(card.activity[0]?.label).toBe("Bash");
  });

  it("surfaces the assistant token usage compactly", () => {
    const turn = turnOf([
      event({
        turnId: "t1",
        actor: "assistant",
        title: "질문",
        summary: "답변",
        tokenUsage: { input: 1200, output: 800, total: 2000, model: "claude-opus" },
      }),
    ]);
    const card = buildTurnCardModel(turn);
    expect(card.tokenUsage).toEqual({
      input: 1200,
      output: 800,
      total: 2000,
      model: "claude-opus",
    });
  });

  it("has no token usage when the turn reported none", () => {
    const turn = turnOf([event({ turnId: "t1", actor: "assistant", title: "q", summary: "a" })]);
    expect(buildTurnCardModel(turn).tokenUsage).toBeNull();
  });

  it("collects distinct decision and issue ids across the turn's members", () => {
    const turn = turnOf([
      event({ turnId: "t1", actor: "user", title: "q", linkedDecisionIds: ["d1"] }),
      event({
        turnId: "t1",
        actor: "tool",
        toolName: "Bash",
        linkedDecisionIds: ["d1", "d2"],
        linkedIssueIds: ["i1"],
      }),
    ]);
    const card = buildTurnCardModel(turn);
    expect(card.decisionIds).toEqual(["d1", "d2"]);
    expect(card.issueIds).toEqual(["i1"]);
  });

  it("never leaves a bare turn blank — falls back to a single line", () => {
    const turn = turnOf([
      event({ turnId: "t1", actor: "system", title: "(no response captured)", summary: "" }),
    ]);
    const card = buildTurnCardModel(turn);
    expect(card.ask).toBeNull();
    expect(card.reply).toBeNull();
    expect(card.fallback).toBe("내용 없음");
  });

  it("does not echo the ask as the reply when they are identical", () => {
    const turn = turnOf([
      event({ turnId: "t1", actor: "user", title: "같은 텍스트", summary: "같은 텍스트" }),
    ]);
    const card = buildTurnCardModel(turn);
    expect(card.ask).toBe("같은 텍스트");
    expect(card.reply).toBeNull();
  });
});
