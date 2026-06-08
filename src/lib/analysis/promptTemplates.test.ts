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

  it("omits tool events from the prompt and notes how many", () => {
    const { userPrompt } = build([
      ev("c1", "결정", "JWT 채택", "assistant"),
      ev("t1", "Bash", "🔧 Bash: ".concat("x".repeat(400)), "tool", "Bash"),
      ev("t2", "Read", "🔧 Read: file", "tool", "Read"),
    ]);
    expect(userPrompt).not.toContain("id=t1");
    expect(userPrompt).not.toContain("id=t2");
    expect(userPrompt).toContain("id=c1");
    expect(userPrompt).toContain("2 tool events omitted");
  });

  it("caps the number of conversation events and notes the omission", () => {
    const events = Array.from({ length: 150 }, (_, i) => ev(`c${i}`, `t${i}`, `s${i}`, "assistant"));
    const { userPrompt } = build(events);
    // Most recent kept, earliest omitted.
    expect(userPrompt).toContain("id=c149");
    expect(userPrompt).not.toContain("id=c0 ");
    expect(userPrompt).toContain("earlier turns omitted");
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

  it("lists the allowed enum values so a weak model emits valid fields", () => {
    const { systemPrompt } = build([]);
    expect(systemPrompt).toContain('"high" | "medium" | "low"');
    expect(systemPrompt).toContain('"open" | "inProgress" | "resolved" | "watching"');
    expect(systemPrompt).toContain('"verified" | "observed" | "inferred"');
  });

  it("requires non-empty, non-duplicate titles", () => {
    const { systemPrompt } = build([]);
    expect(systemPrompt).toContain("non-empty title");
    expect(systemPrompt).toContain("Do not repeat the same title");
  });

  it("includes a concrete output shape the model can mimic", () => {
    const { systemPrompt } = build([]);
    const exampleStart = systemPrompt.indexOf('{"summary":');
    expect(exampleStart).toBeGreaterThanOrEqual(0);
    // The example must itself be valid JSON so we never ship a malformed sample.
    const example = systemPrompt.slice(exampleStart);
    expect(() => JSON.parse(example)).not.toThrow();
  });
});
