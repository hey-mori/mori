import { describe, expect, it } from "vitest";
import { moriMockSession } from "../../domain/mock-data";
import {
  describeConfidence,
  getBundleEvidenceSummary,
  getConfidenceTone,
  getDecisionEvidenceSources,
  getEvidenceCountForEvent,
  getEvidenceSourcesForEvent,
  getIssueEvidenceSources,
  getProvenanceDisplay,
  getProvenanceSummary,
  getSessionEvidenceSummary,
  getSourceDisplayName,
  getTrustDisplay,
  getTrustLabel,
  getTrustTone,
} from "./index";
import type { TimelineDisplayItem } from "../timeline/displayItems";

describe("trust helpers", () => {
  it("returns consistent label/tone for each trust level", () => {
    expect(getTrustDisplay("verified").label).toBe("Verified");
    expect(getTrustDisplay("observed").tone).toBe("blue");
    expect(getTrustDisplay("inferred").tone).toBe("purple");
    expect(getTrustLabel("verified")).toBe("Verified");
    expect(getTrustTone("inferred")).toBe("purple");
  });
});

describe("confidence helpers", () => {
  it("buckets confidence into tones", () => {
    expect(getConfidenceTone(95)).toBe("green");
    expect(getConfidenceTone(70)).toBe("blue");
    expect(getConfidenceTone(50)).toBe("orange");
    expect(getConfidenceTone(20)).toBe("red");
    expect(getConfidenceTone(Number.NaN)).toBe("gray");
  });

  it("rounds the percent into the human label", () => {
    expect(describeConfidence(72.7).label).toBe("73% confidence");
  });
});

describe("provenance helpers", () => {
  it("getSourceDisplayName resolves through the integration registry", () => {
    const source = moriMockSession.sources[0]!;
    const display = getProvenanceDisplay(source);
    expect(getSourceDisplayName(source)).toBe(display.integrationLabel);
  });

  it("getProvenanceSummary returns the joined fields we render in inspector rows", () => {
    const source = moriMockSession.sources[0]!;
    const summary = getProvenanceSummary(source);
    expect(summary.sourceId).toBe(source.id);
    expect(summary.title).toBe(source.title);
    expect(summary.integrationLabel.length).toBeGreaterThan(0);
    expect(summary.captureMethod.length).toBeGreaterThan(0);
    expect(summary.trustLabel.length).toBeGreaterThan(0);
    expect(summary.rawDataLabel.length).toBeGreaterThan(0);
  });
});

describe("source-links helpers", () => {
  it("getEvidenceCountForEvent matches the event's sourceRefs length", () => {
    const event = moriMockSession.events[0]!;
    expect(getEvidenceCountForEvent(event)).toBe(event.sourceRefs.length);
  });

  it("getEvidenceSourcesForEvent resolves SourceRefs from the session view", () => {
    const event = moriMockSession.events[0]!;
    const summary = getEvidenceSourcesForEvent(event, moriMockSession.sources);
    expect(summary.sourceCount).toBe(event.sourceRefs.length);
    expect(summary.sources.every((source) => event.sourceRefs.includes(source.id))).toBe(true);
  });

  it("getIssueEvidenceSources joins through sourceEventIds", () => {
    const issue = moriMockSession.issues[0];
    if (!issue) return;
    const summary = getIssueEvidenceSources(issue, moriMockSession.events, moriMockSession.sources);
    expect(summary.eventCount).toBe(issue.sourceEventIds.length);
  });

  it("getDecisionEvidenceSources adds direct sources to the event-derived sources", () => {
    const decision = moriMockSession.decisions[0];
    if (!decision) return;
    const summary = getDecisionEvidenceSources(decision, moriMockSession.events, moriMockSession.sources);
    expect(summary.directSourceCount).toBe(decision.relatedSourceIds.length);
  });

  it("getBundleEvidenceSummary returns null for non-bundle items", () => {
    const eventLike: TimelineDisplayItem = {
      kind: "event",
      id: "evt-x",
      laneType: "decision",
      start: "2026-01-01T00:00:00Z",
      event: moriMockSession.events[0]!,
      memberEventIds: ["evt-x"],
    };
    expect(getBundleEvidenceSummary(eventLike, moriMockSession.events, moriMockSession.sources)).toBeNull();
  });

  it("getSessionEvidenceSummary reports a non-empty data basis when sources exist", () => {
    const summary = getSessionEvidenceSummary(moriMockSession);
    expect(summary.sourceCount).toBe(moriMockSession.sources.length);
    expect(summary.dataBasis.length).toBeGreaterThan(0);
  });
});
