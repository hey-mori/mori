import { describe, expect, it } from "vitest";
import type { Project, Session, SourceRef, TimelineEvent } from "../../domain/types";
import {
  createDeterministicQuickPassProvider,
  extractFromInput,
  parseOllamaQuickPassJson,
} from "./index";

const project: Project = {
  id: "proj-test",
  name: "Test Project",
  description: "Mori test project",
  createdAt: "2026-05-12T13:00:00+09:00",
  updatedAt: "2026-05-12T13:00:00+09:00",
};

const session: Session = {
  id: "sess-test",
  projectId: project.id,
  title: "Quick Pass test session",
  startedAt: "2026-05-12T13:00:00+09:00",
  endedAt: "2026-05-12T14:00:00+09:00",
  recordingMode: "summary",
  llmProvider: "ollama",
  llmModel: "llama3.1:8b",
  storageLocation: "~/Mori/Records",
  selectedSourceIds: [],
  status: "recording",
};

function event(id: string, type: TimelineEvent["type"], title: string, summary: string, sourceRef: string): TimelineEvent {
  return {
    id,
    sessionId: session.id,
    projectId: project.id,
    start: "2026-05-12T13:30:00+09:00",
    type,
    title,
    summary,
    sourceRefs: [sourceRef],
    linkedIssueIds: [],
    linkedDecisionIds: [],
    relationshipIds: [],
    trustLevel: "verified",
    confidence: 0.9,
    createdBy: "import",
    userModified: false,
  };
}

function source(id: string, kind: SourceRef["kind"], title: string, eventId: string): SourceRef {
  return {
    id,
    sessionId: session.id,
    kind,
    title,
    detail: "test source",
    trustLevel: "verified",
    redactionStatus: "notNeeded",
    rawRetention: "retained",
    capturedAt: "2026-05-12T13:30:00+09:00",
    relatedEventIds: [eventId],
  };
}

describe("DeterministicQuickPassProvider", () => {
  it("extracts issues from risk and TODO keywords", async () => {
    const events: TimelineEvent[] = [
      event("evt-1", "documentNote", "Risk note", "위험: 인증 토큰 만료 처리가 미정. TODO: rotate token.", "src-1"),
    ];
    const provider = createDeterministicQuickPassProvider();
    const result = await provider.analyze({
      project,
      session,
      sources: [source("src-1", "manualNote", "Risk note", "evt-1")],
      events,
      now: "2026-05-12T14:00:00+09:00",
    });

    expect(result.issues.length).toBeGreaterThanOrEqual(2);
    expect(result.issues.some((issue) => issue.priority === "high")).toBe(true);
    expect(result.issues.every((issue) => issue.trustLevel === "inferred")).toBe(true);
    expect(result.providerName).toBe("deterministic-heuristic-v1");
  });

  it("extracts decision candidates and links them to source events", async () => {
    const events: TimelineEvent[] = [
      event(
        "evt-2",
        "aiConversation",
        "Provider choice",
        "결정: Mori는 기본 LLM 제공자로 Ollama를 채택한다. choose ollama as default.",
        "src-2",
      ),
    ];
    const provider = createDeterministicQuickPassProvider();
    const result = await provider.analyze({
      project,
      session,
      sources: [source("src-2", "aiConversation", "Provider choice", "evt-2")],
      events,
    });

    expect(result.decisions.length).toBeGreaterThan(0);
    const decision = result.decisions[0];
    expect(decision.sourceEventIds).toContain("evt-2");
    expect(decision.confirmed).toBe(false);
    expect(decision.trustLevel).toBe("inferred");
  });

  it("creates relationships from events to extracted issues and decisions", async () => {
    const events: TimelineEvent[] = [
      event("evt-3", "documentNote", "Mixed note", "결정한 점: API를 우선 정리. risk: 토큰 누수 가능.", "src-3"),
    ];
    const provider = createDeterministicQuickPassProvider();
    const result = await provider.analyze({
      project,
      session,
      sources: [source("src-3", "manualNote", "Mixed note", "evt-3")],
      events,
    });

    expect(result.relationships.some((rel) => rel.type === "createdIssue" && rel.fromId === "evt-3")).toBe(true);
    expect(result.relationships.some((rel) => rel.type === "influencedDecision" && rel.fromId === "evt-3")).toBe(true);
  });

  it("creates next actions from unresolved issues only", async () => {
    const events: TimelineEvent[] = [
      event("evt-4", "documentNote", "Plain note", "TODO: write more tests.", "src-4"),
    ];
    const provider = createDeterministicQuickPassProvider();
    const result = await provider.analyze({
      project,
      session,
      sources: [source("src-4", "manualNote", "Plain note", "evt-4")],
      events,
    });

    expect(result.nextActions.length).toBeGreaterThan(0);
    expect(result.nextActions[0].relatedEventIds).toContain("evt-4");
  });

  it("returns an empty result and notes when no events are present", async () => {
    const provider = createDeterministicQuickPassProvider();
    const result = await provider.analyze({
      project,
      session,
      sources: [],
      events: [],
    });

    expect(result.issues).toHaveLength(0);
    expect(result.decisions).toHaveLength(0);
    expect(result.nextActions).toHaveLength(0);
    expect(result.notes.length).toBeGreaterThan(0);
    expect(result.confidence).toBe(0);
  });

  it("rolls events into summary highlights", () => {
    const events: TimelineEvent[] = [
      event("evt-5", "documentNote", "Kickoff", "Mori 기본 흐름을 정리하고 다음 단계를 잡았다.", "src-5"),
      event("evt-6", "aiConversation", "Pricing chat", "결정: 가격 정책은 단순 freemium 으로 채택한다.", "src-6"),
    ];
    const extraction = extractFromInput({
      project,
      session,
      sources: [
        source("src-5", "manualNote", "Kickoff", "evt-5"),
        source("src-6", "aiConversation", "Pricing chat", "evt-6"),
      ],
      events,
    });

    expect(extraction.summary.highlights.length).toBeGreaterThan(0);
    expect(extraction.summary.sessionSummary).toMatch(/2 imported events/);
  });
});

describe("OllamaQuickPassProvider response parsing", () => {
  it("parses a valid JSON envelope", () => {
    const raw = `{
      "summary": { "sessionSummary": "ok", "resumePrompt": "prompt", "highlights": ["one"] },
      "issues": [{ "title": "A", "priority": "high" }],
      "decisions": [{ "title": "B" }]
    }`;
    const parsed = parseOllamaQuickPassJson(raw);
    expect(parsed.issues).toHaveLength(1);
    expect(parsed.decisions).toHaveLength(1);
    expect(parsed.summary?.sessionSummary).toBe("ok");
  });

  it("recovers JSON embedded in surrounding prose", () => {
    const raw = `Sure thing, here is your analysis:\n{"issues": [{"title": "A"}], "decisions": []}\nThanks!`;
    const parsed = parseOllamaQuickPassJson(raw);
    expect(parsed.issues).toHaveLength(1);
  });

  it("throws when the response is not a JSON object", () => {
    expect(() => parseOllamaQuickPassJson("not json at all")).toThrow();
  });
});
