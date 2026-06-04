import { describe, expect, it } from "vitest";
import type { EventActor, Project, Session, TimelineEvent } from "../../domain/types";
import { buildQuickPassPrompt } from "./promptTemplates";

const project: Project = {
  id: "p1",
  name: "P",
  description: "",
  createdAt: "2026-06-04T00:00:00Z",
  updatedAt: "2026-06-04T00:00:00Z",
};

const session: Session = {
  id: "s1",
  projectId: "p1",
  title: "S",
  startedAt: "2026-06-04T00:00:00Z",
  endedAt: "2026-06-04T01:00:00Z",
  recordingMode: "summary",
  llmProvider: "ollama",
  llmModel: "x",
  storageLocation: "",
  selectedSourceIds: [],
  status: "recording",
};

function ev(id: string, title: string, summary: string, actor?: EventActor, toolName?: string): TimelineEvent {
  return {
    id,
    sessionId: "s1",
    projectId: "p1",
    start: "2026-06-04T00:30:00Z",
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
    ...(toolName ? { toolName } : {}),
  };
}

function build(events: TimelineEvent[]) {
  return buildQuickPassPrompt({ project, session, sources: [], events });
}

describe("buildQuickPassPrompt", () => {
  it("annotates events with actor", () => {
    const { userPrompt } = build([ev("e1", "결정", "JWT를 채택", "assistant")]);
    expect(userPrompt).toContain("actor=assistant");
  });

  it("keeps tool events terse without their long output", () => {
    const { userPrompt } = build([
      ev("t1", "Bash", "🔧 Bash: ".concat("x".repeat(400)), "tool", "Bash"),
    ]);
    const toolLine = userPrompt.split("\n").find((line) => line.includes("id=t1")) ?? "";
    expect(toolLine).toContain("actor=tool");
    expect(toolLine).toContain("tool=Bash");
    expect(toolLine).not.toContain("summary=");
    expect(toolLine.length).toBeLessThan(120);
  });

  it("truncates a long conversation summary", () => {
    const { userPrompt } = build([ev("e1", "title", "y".repeat(500), "assistant")]);
    expect(userPrompt).toContain("…");
  });

  it("instructs the model to ignore tool noise and code comments", () => {
    const { systemPrompt } = build([]);
    expect(systemPrompt).toContain("Tool events (actor=tool) are machine output");
    expect(systemPrompt).toContain("not a code comment");
  });
});
