import { describe, expect, it } from "vitest";
import type { AnalysisResult } from "../analysis";
import { mockSession } from "../../domain/mock-data";
import {
  createIssueFromEvent,
  eventIssueId,
  isEventPromotedToIssue,
} from "./eventToIssue";

function analysis(): AnalysisResult {
  return {
    runId: "run-evt-issue",
    providerName: "deterministic-heuristic-v1",
    providerLabel: "Deterministic",
    sessionId: mockSession.session.id,
    projectId: mockSession.project.id,
    generatedAt: "2026-05-18T11:00:00.000Z",
    durationMs: 1,
    inputEventCount: 0,
    inputSourceCount: 0,
    summary: { sessionSummary: "summary", resumePrompt: "prompt", highlights: [] },
    issues: [],
    decisions: [],
    relationships: [],
    nextActions: [],
    rendered: {
      summary: {
        id: "summary-run-evt-issue",
        sessionId: mockSession.session.id,
        sessionSummary: "summary",
        resumePrompt: "prompt",
        reportMarkdown: "",
        nextActionIds: [],
        generatedAt: "2026-05-18T11:00:00.000Z",
      },
    },
    confidence: 0.5,
    notes: [],
  };
}

const event = mockSession.events[0]!;
const now = "2026-05-18T12:00:00.000Z";

describe("eventIssueId", () => {
  it("derives a deterministic id from the event id", () => {
    expect(eventIssueId("evt-9")).toBe("issue-from-evt-9");
  });
});

describe("createIssueFromEvent", () => {
  it("appends a user-asserted issue derived from the event", () => {
    const result = createIssueFromEvent(analysis(), event, now);

    expect(result.changed).toBe(true);
    const issue = result.analysis.issues.find((i) => i.id === eventIssueId(event.id));
    expect(issue).toBeDefined();
    expect(issue?.title).toBe(event.title);
    expect(issue?.description).toBe(event.summary);
    expect(issue?.status).toBe("open");
    expect(issue?.sourceEventIds).toEqual([event.id]);
    expect(issue?.trustLevel).toBe("observed");
    expect(issue?.confidence).toBe(1);
    expect(issue?.editedByUser).toBe(true);
  });

  it("is idempotent — a second promotion is a no-op", () => {
    const once = createIssueFromEvent(analysis(), event, now);
    expect(isEventPromotedToIssue(once.analysis, event.id)).toBe(true);

    const twice = createIssueFromEvent(once.analysis, event, now);
    expect(twice.changed).toBe(false);
    expect(twice.analysis).toBe(once.analysis);
    expect(twice.analysis.issues).toHaveLength(1);
  });

  it("isEventPromotedToIssue is false before promotion", () => {
    expect(isEventPromotedToIssue(analysis(), event.id)).toBe(false);
  });
});
