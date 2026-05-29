import { describe, expect, it } from "vitest";
import { mockSession } from "../../domain/mock-data";
import type { StoredSessionImport } from "../storage/storageTypes";
import type { AnalysisResult } from "../analysis";
import type { TimelineEvent } from "../../domain/types";
import {
  findMergeTarget,
  mergeEventWithNext,
  remapEventIdInAnalysis,
} from "./eventMerge";

function event(id: string, start: string): TimelineEvent {
  return {
    ...mockSession.events[0]!,
    id,
    start,
    end: undefined,
    sourceRefs: [`src-${id}`],
    linkedIssueIds: [],
    linkedDecisionIds: [],
    relationshipIds: [],
  };
}

const eventA = event("evt-a", "2026-05-12T13:00:00+09:00");
const eventB = event("evt-b", "2026-05-12T13:30:00+09:00");
const eventC = event("evt-c", "2026-05-12T14:00:00+09:00");

function imports(events: TimelineEvent[]): StoredSessionImport[] {
  return [
    {
      id: "imp-1",
      sessionId: mockSession.session.id,
      source: mockSession.sources[0]!,
      events: events.map((e) => ({ ...e })),
      savedAt: "2026-05-18T11:00:00.000Z",
      adapter: "browser-local-storage",
    },
  ];
}

describe("findMergeTarget", () => {
  it("returns the next chronological event", () => {
    expect(findMergeTarget([eventA, eventB, eventC], "evt-a")?.id).toBe("evt-b");
  });

  it("returns null for the last event", () => {
    expect(findMergeTarget([eventA, eventB, eventC], "evt-c")).toBeNull();
  });
});

describe("mergeEventWithNext", () => {
  it("folds the next event into the selected one, keeping its id", () => {
    const next = mergeEventWithNext(imports([eventA, eventB, eventC]), "evt-a");
    const events = next[0]!.events;

    expect(events.map((e) => e.id)).toEqual(["evt-a", "evt-c"]);
    const merged = events.find((e) => e.id === "evt-a")!;
    expect(merged.sourceRefs).toEqual(["src-evt-a", "src-evt-b"]);
    expect(merged.userModified).toBe(true);
  });

  it("returns the same imports when the event is already last", () => {
    const before = imports([eventA, eventB, eventC]);
    expect(mergeEventWithNext(before, "evt-c")).toBe(before);
  });
});

describe("remapEventIdInAnalysis", () => {
  function analysis(): AnalysisResult {
    return {
      runId: "run-merge",
      providerName: "deterministic-heuristic-v1",
      providerLabel: "Deterministic",
      sessionId: mockSession.session.id,
      projectId: mockSession.project.id,
      generatedAt: "2026-05-18T11:00:00.000Z",
      durationMs: 1,
      inputEventCount: 0,
      inputSourceCount: 0,
      summary: { sessionSummary: "", resumePrompt: "", highlights: [] },
      issues: [{ ...mockSession.issues[0]!, id: "iss-1", sourceEventIds: ["evt-b"] }],
      decisions: [],
      relationships: [
        {
          id: "rel-1",
          fromId: "evt-a",
          fromType: "event",
          toId: "evt-b",
          toType: "event",
          type: "ledTo",
          confidence: 0.9,
          reason: "test",
        },
      ],
      nextActions: [],
      rendered: {
        summary: {
          id: "s",
          sessionId: mockSession.session.id,
          sessionSummary: "",
          resumePrompt: "",
          reportMarkdown: "",
          nextActionIds: [],
          generatedAt: "2026-05-18T11:00:00.000Z",
        },
      },
      confidence: 0.5,
      notes: [],
    };
  }

  it("repoints issue source events and relationship endpoints", () => {
    const next = remapEventIdInAnalysis(analysis(), "evt-b", "evt-a");
    expect(next.issues[0]!.sourceEventIds).toEqual(["evt-a"]);
    // The relationship evt-a → evt-b becomes a self-link and is dropped.
    expect(next.relationships).toHaveLength(0);
  });

  it("returns the original analysis when nothing references the id", () => {
    const base = analysis();
    expect(remapEventIdInAnalysis(base, "evt-unused", "evt-a")).toBe(base);
  });
});
