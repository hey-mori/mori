import { describe, expect, it } from "vitest";
import { mockSession } from "../../domain/mock-data";
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
  getRawDataPolicyTone,
  getSessionEvidenceSummary,
  getSourceDisplayName,
  getTrustDisplay,
  getTrustLabel,
  getTrustTone,
} from "./index";
import type { TimelineDisplayItem } from "../timeline/displayItems";

describe("trust helpers", () => {
  it("returns consistent label/tone for each trust level", () => {
    expect(getTrustDisplay("verified").label).toBe("검증됨");
    expect(getTrustDisplay("observed").tone).toBe("blue");
    expect(getTrustDisplay("inferred").tone).toBe("purple");
    expect(getTrustLabel("verified")).toBe("검증됨");
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
    expect(describeConfidence(72.7).label).toBe("신뢰도 73%");
  });
});

describe("provenance helpers", () => {
  it("getSourceDisplayName resolves through the integration registry", () => {
    const source = mockSession.sources[0]!;
    const display = getProvenanceDisplay(source);
    expect(getSourceDisplayName(source)).toBe(display.integrationLabel);
  });

  it("getProvenanceSummary returns the joined fields we render in inspector rows", () => {
    const source = mockSession.sources[0]!;
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
    const event = mockSession.events[0]!;
    expect(getEvidenceCountForEvent(event)).toBe(event.sourceRefs.length);
  });

  it("getEvidenceSourcesForEvent resolves SourceRefs from the session view", () => {
    const event = mockSession.events[0]!;
    const summary = getEvidenceSourcesForEvent(event, mockSession.sources);
    expect(summary.sourceCount).toBe(event.sourceRefs.length);
    expect(summary.sources.every((source) => event.sourceRefs.includes(source.id))).toBe(true);
  });

  it("getIssueEvidenceSources joins through sourceEventIds", () => {
    const issue = mockSession.issues[0];
    if (!issue) return;
    const summary = getIssueEvidenceSources(issue, mockSession.events, mockSession.sources);
    expect(summary.eventCount).toBe(issue.sourceEventIds.length);
  });

  it("getDecisionEvidenceSources adds direct sources to the event-derived sources", () => {
    const decision = mockSession.decisions[0];
    if (!decision) return;
    const summary = getDecisionEvidenceSources(decision, mockSession.events, mockSession.sources);
    expect(summary.directSourceCount).toBe(decision.relatedSourceIds.length);
  });

  it("getBundleEvidenceSummary returns null for non-bundle items", () => {
    const eventLike: TimelineDisplayItem = {
      kind: "event",
      id: "evt-x",
      laneType: "review",
      start: "2026-01-01T00:00:00Z",
      event: mockSession.events[0]!,
      memberEventIds: ["evt-x"],
    };
    expect(getBundleEvidenceSummary(eventLike, mockSession.events, mockSession.sources)).toBeNull();
  });

  it("getSessionEvidenceSummary reports a non-empty data basis when sources exist", () => {
    const summary = getSessionEvidenceSummary(mockSession);
    expect(summary.sourceCount).toBe(mockSession.sources.length);
    expect(summary.dataBasis.length).toBeGreaterThan(0);
  });
});

describe("raw-data policy tone", () => {
  it("gives each raw-data policy a distinct, meaningful badge tone", () => {
    expect(getRawDataPolicyTone("retained")).toBe("blue");
    expect(getRawDataPolicyTone("summaryOnly")).toBe("orange");
    expect(getRawDataPolicyTone("redacted")).toBe("purple");
    expect(getRawDataPolicyTone("notCaptured")).toBe("gray");
  });

  it("does not collapse retained / summary / redacted policies to one tone", () => {
    // Regression guard: the raw-data badge tone must come from the policy
    // enum, not from string-matching the (Korean) label.
    const tones = new Set([
      getRawDataPolicyTone("retained"),
      getRawDataPolicyTone("summaryOnly"),
      getRawDataPolicyTone("redacted"),
    ]);
    expect(tones.size).toBe(3);
  });

  it("carries the policy tone on every provenance display row", () => {
    for (const source of mockSession.sources) {
      const display = getProvenanceDisplay(source);
      expect(["blue", "orange", "purple", "gray"]).toContain(display.rawDataTone);
    }
  });
});
