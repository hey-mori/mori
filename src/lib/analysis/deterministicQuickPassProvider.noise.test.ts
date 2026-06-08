import { describe, expect, it } from "vitest";
import type { EventActor, Project, Session, TimelineEvent } from "../../domain/types";
import { extractFromInput } from "./deterministicQuickPassProvider";

const project: Project = {
  id: "p1",
  name: "P",
  description: "",
  createdAt: "2026-05-12T13:00:00Z",
  updatedAt: "2026-05-12T13:00:00Z",
};

const session: Session = {
  id: "s1",
  projectId: "p1",
  title: "S",
  startedAt: "2026-05-12T13:00:00Z",
  endedAt: "2026-05-12T14:00:00Z",
  recordingMode: "summary",
  llmProvider: "ollama",
  llmModel: "x",
  storageLocation: "",
  selectedSourceIds: [],
  status: "recording",
};

function ev(id: string, title: string, summary: string, actor?: EventActor): TimelineEvent {
  return {
    id,
    sessionId: "s1",
    projectId: "p1",
    start: "2026-05-12T13:30:00Z",
    type: "aiConversation",
    title,
    summary,
    sourceRefs: [],
    linkedIssueIds: [],
    linkedDecisionIds: [],
    relationshipIds: [],
    trustLevel: "observed",
    confidence: 0.9,
    createdBy: "import",
    userModified: false,
    ...(actor ? { actor } : {}),
  };
}

function run(events: TimelineEvent[]) {
  return extractFromInput({ project, session, sources: [], events, now: "2026-05-12T14:00:00Z" });
}

describe("deterministic Quick Pass noise filtering", () => {
  it("does not extract issues from tool events", () => {
    const result = run([
      ev("e1", "↳ 도구 결과", "↳ 도구 결과: warning: in the working copy of config.ts", "tool"),
    ]);
    expect(result.issues).toHaveLength(0);
  });

  it("still extracts a real issue stated in a conversation turn", () => {
    const result = run([
      ev("e1", "Auth bug", "우리는 인증 토큰 만료 처리가 필요하다. 미정 상태.", "assistant"),
    ]);
    expect(result.issues.length).toBeGreaterThanOrEqual(1);
  });

  it("filters an error envelope quoted inside a conversation turn", () => {
    // Neutral title so we isolate the envelope sentence (a title that itself
    // said "failure" would be a legitimately stated issue).
    const result = run([
      ev("e1", "응답 확인", "GEMINI_API_ERROR: 작업 시간이 초과되었습니다", "assistant"),
    ]);
    expect(result.issues).toHaveLength(0);
  });

  it("does not treat a code comment as a decision", () => {
    const result = run([
      ev("e1", "config", "config 2 3 /** 4 * Decides which AI provider is active */", "assistant"),
    ]);
    expect(result.decisions).toHaveLength(0);
  });

  it("still extracts a real decision stated in conversation", () => {
    const result = run([
      ev("e1", "Storage", "우리는 SQLite를 채택하기로 결정했다.", "assistant"),
    ]);
    expect(result.decisions.length).toBeGreaterThanOrEqual(1);
  });

  it("caps a flood of issue candidates and keeps the highest priority", () => {
    const events: TimelineEvent[] = [];
    // 30 low/medium "need/fix" lines (medium) ...
    for (let i = 0; i < 30; i += 1) {
      events.push(ev(`m${i}`, `need item ${i}`, `이 기능이 필요하다 ${i}`, "assistant"));
    }
    // ... plus a couple of genuine high-priority error lines.
    events.push(ev("h1", "Build broken", "the build crashed on CI", "assistant"));
    events.push(ev("h2", "Risk", "위험: 토큰 회전 미정", "assistant"));

    const result = run(events);

    expect(result.issues.length).toBeLessThanOrEqual(20);
    // The high-priority issues survive the cap.
    expect(result.issues.some((issue) => issue.priority === "high")).toBe(true);
    // The cap is disclosed, never silent.
    expect(result.notes.some((note) => note.includes("상위"))).toBe(true);
  });
});
