import { describe, expect, it } from "vitest";
import { mockSession } from "../domain/mock-data";
import type { Decision, Issue, SourceRef, TimelineEvent } from "../domain/types";
import {
  deriveEvidenceSources,
  deriveTimelineCandidates,
  deriveReviewContext,
  getProvenanceForDecision,
  getProvenanceForEvent,
  getProvenanceForIssue,
  getProvenanceForSource,
  getSessionPipelineOverview,
} from "./dataPipeline";

describe("deriveEvidenceSources", () => {
  it("returns sources ordered by captured time", () => {
    const sources = deriveEvidenceSources(mockSession);
    for (let i = 1; i < sources.length; i += 1) {
      expect(new Date(sources[i]!.capturedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(sources[i - 1]!.capturedAt).getTime(),
      );
    }
  });

  it("doesn't mutate the input array", () => {
    const before = mockSession.sources.map((source) => source.id);
    deriveEvidenceSources(mockSession);
    const after = mockSession.sources.map((source) => source.id);
    expect(after).toEqual(before);
  });
});

describe("deriveTimelineCandidates", () => {
  it("flattens normalized candidates in chronological order", () => {
    const candidates = [
      {
        source: { id: "src-1" } as SourceRef,
        events: [
          { id: "evt-2", start: "2026-05-14T10:01:00Z" } as TimelineEvent,
          { id: "evt-1", start: "2026-05-14T10:00:00Z" } as TimelineEvent,
        ],
      },
    ];
    const events = deriveTimelineCandidates(candidates);
    expect(events.map((e) => e.id)).toEqual(["evt-1", "evt-2"]);
  });
});

describe("deriveReviewContext", () => {
  it("creates an ImportReviewDraft from a normalized candidate", () => {
    const candidate = {
      source: { id: "src-x", trustLevel: "verified" } as SourceRef,
      events: [
        {
          id: "evt-x",
          start: "2026-05-14T10:00:00Z",
          title: "test",
          summary: "",
          type: "documentNote",
          sourceRefs: ["src-x"],
        } as TimelineEvent,
      ],
    };
    const draft = deriveReviewContext({
      candidate,
      origin: "manual-note",
    });
    expect(draft.source).toBe(candidate.source);
    expect(draft.events).toHaveLength(1);
    expect(draft.events[0]!.status).toBe("pending");
  });
});

describe("provenance helpers", () => {
  it("getProvenanceForEvent surfaces source ids + trust", () => {
    const event = mockSession.events[0]!;
    const record = getProvenanceForEvent(event, mockSession);
    expect(record.itemKind).toBe("event");
    expect(record.sourceIds).toEqual(event.sourceRefs);
    expect(record.trustLevel).toBe(event.trustLevel);
  });

  it("getProvenanceForIssue is non-zero when the issue has source events", () => {
    const issue = mockSession.issues[0];
    if (!issue) return;
    const record = getProvenanceForIssue(issue, mockSession);
    expect(record.itemKind).toBe("issue");
    expect(record.trustLevel).toBe(issue.trustLevel);
  });

  it("getProvenanceForDecision combines events + relatedSourceIds", () => {
    const decision = mockSession.decisions[0];
    if (!decision) return;
    const record = getProvenanceForDecision(decision, mockSession);
    expect(record.itemKind).toBe("decision");
    expect(record.sourceIds.length).toBeGreaterThanOrEqual(decision.relatedSourceIds.length);
  });

  it("getProvenanceForSource is user-correctable: false", () => {
    const source = mockSession.sources[0]!;
    const record = getProvenanceForSource(source);
    expect(record.itemKind).toBe("source");
    expect(record.userCorrectable).toBe(false);
  });

  it("maps SourceRef.rawRetention='deleted' to 'notCaptured'", () => {
    const source = { ...mockSession.sources[0]!, rawRetention: "deleted" as const };
    const record = getProvenanceForSource(source);
    expect(record.rawDataPolicy).toBe("notCaptured");
  });
});

describe("getSessionPipelineOverview", () => {
  it("returns counts matching the view", () => {
    const overview = getSessionPipelineOverview(mockSession, true);
    expect(overview.sourceCount).toBe(mockSession.sources.length);
    expect(overview.eventCount).toBe(mockSession.events.length);
    expect(overview.issueCount).toBe(mockSession.issues.length);
    expect(overview.hasAnalysis).toBe(true);
    expect(overview.dataBasis.length).toBeGreaterThan(0);
  });
});

describe("issue / decision references stay consistent with their domain rows", () => {
  it("Issue trust matches provenance trust", () => {
    for (const issue of mockSession.issues.slice(0, 3) as Issue[]) {
      expect(getProvenanceForIssue(issue, mockSession).trustLevel).toBe(issue.trustLevel);
    }
  });

  it("Decision trust matches provenance trust", () => {
    for (const decision of mockSession.decisions.slice(0, 3) as Decision[]) {
      expect(getProvenanceForDecision(decision, mockSession).trustLevel).toBe(decision.trustLevel);
    }
  });
});
