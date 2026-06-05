import { describe, expect, it } from "vitest";
import type { EventActor, TimelineEvent } from "../../domain/types";
import { buildSessionWorkSummary } from "./sessionWorkSummary";

function ev(
  id: string,
  start: string,
  title: string,
  actor: EventActor,
  toolName?: string,
  summary = "",
): TimelineEvent {
  return {
    id,
    sessionId: "s1",
    projectId: "p1",
    start,
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
    actor,
    ...(toolName ? { toolName } : {}),
  };
}

describe("buildSessionWorkSummary", () => {
  it("is empty for no events", () => {
    const summary = buildSessionWorkSummary([]);
    expect(summary.isEmpty).toBe(true);
    expect(summary.topFiles).toEqual([]);
  });

  it("builds a factual headline from the work shape", () => {
    const summary = buildSessionWorkSummary([
      ev("c1", "2026-06-04T09:00:00Z", "질문", "assistant"),
      ev("c2", "2026-06-04T09:10:00Z", "답변", "user"),
      ev("f1", "2026-06-04T09:20:00Z", "🔧 Edit: C:\\dev\\mori\\src\\foo.ts", "tool", "Edit"),
      ev("f2", "2026-06-04T11:00:00Z", "🔧 Edit: C:\\dev\\mori\\src\\foo.ts", "tool", "Edit"),
      ev("b1", "2026-06-04T11:30:00Z", "테스트", "tool", "Bash", "🔧 Bash: npm test"),
    ]);
    expect(summary.isEmpty).toBe(false);
    expect(summary.headline).toContain("대화 2회");
    expect(summary.headline).toContain("파일 변경 2건");
    expect(summary.headline).toContain("빌드·테스트 1회");
    expect(summary.headline).toContain("foo.ts");
  });

  it("ranks the most-touched files first", () => {
    const summary = buildSessionWorkSummary([
      ev("f1", "2026-06-04T09:00:00Z", "🔧 Write: src/a.ts", "tool", "Write"),
      ev("f2", "2026-06-04T09:01:00Z", "🔧 Edit: src/b.ts", "tool", "Edit"),
      ev("f3", "2026-06-04T09:02:00Z", "🔧 Edit: src/b.ts", "tool", "Edit"),
    ]);
    expect(summary.topFiles[0]).toEqual({ name: "b.ts", count: 2 });
    expect(summary.topFiles.map((f) => f.name)).toContain("a.ts");
  });
});
