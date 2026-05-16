import { describe, expect, it } from "vitest";
import { moriMockSession } from "../../../domain/mock-data";
import type { TimelineDisplayBundle } from "../../../lib/timeline/displayItems";
import {
  buildTimelineBundleViewModel,
  buildTimelineEventCardViewModel,
  buildTrustGlyph,
} from "./timelineCards";

describe("buildTimelineEventCardViewModel", () => {
  const event = moriMockSession.events[0]!;

  it("returns the event id + title + tone + lane label", () => {
    const vm = buildTimelineEventCardViewModel(event);
    expect(vm.kind).toBe("event");
    expect(vm.id).toBe(event.id);
    expect(vm.title).toBe(event.title);
    expect(vm.tone).toBeTruthy();
    expect(vm.laneLabel.length).toBeGreaterThan(0);
  });

  it("returns a time range when the event spans ≥1 minute", () => {
    const rangeEvent = {
      ...event,
      start: "2026-05-14T10:00:00Z",
      end: "2026-05-14T10:05:00Z",
    };
    const vm = buildTimelineEventCardViewModel(rangeEvent);
    expect(vm.hasTimeRange).toBe(true);
    expect(vm.timeLabel).toMatch(/-/);
  });

  it("returns a single time when the event is < 1 minute or has no end", () => {
    const pointEvent = { ...event, end: undefined };
    const vm = buildTimelineEventCardViewModel(pointEvent);
    expect(vm.hasTimeRange).toBe(false);
    expect(vm.timeLabel).not.toMatch(/-/);
  });

  it("emits no footer meta when the event has no sources or links", () => {
    const empty = {
      ...event,
      sourceRefs: [],
      linkedIssueIds: [],
      linkedDecisionIds: [],
    };
    const vm = buildTimelineEventCardViewModel(empty);
    expect(vm.primaryMeta).toBeNull();
  });

  it("shows a single evidence count when the event has sources", () => {
    const populated = {
      ...event,
      sourceRefs: ["s1", "s2"],
      linkedIssueIds: ["i1"],
      linkedDecisionIds: ["d1", "d2"],
    };
    const vm = buildTimelineEventCardViewModel(populated);
    // Evidence leads; the card never shows three competing counts.
    expect(vm.primaryMeta).toBe("근거 2");
  });

  it("falls back to a combined link count when there are no sources", () => {
    const populated = {
      ...event,
      sourceRefs: [],
      linkedIssueIds: ["i1", "i2"],
      linkedDecisionIds: ["d1"],
    };
    const vm = buildTimelineEventCardViewModel(populated);
    expect(vm.primaryMeta).toBe("연결 3");
  });
});

describe("buildTrustGlyph", () => {
  it("emits the confidence percent for inferred events", () => {
    const glyph = buildTrustGlyph("inferred", 0.847);
    expect(glyph.tone).toBe("inferred");
    expect(glyph.tooltip).toMatch(/85% confidence/);
  });

  it("does not embed confidence for verified / observed", () => {
    expect(buildTrustGlyph("verified", 0.9).tooltip).toBe("Verified");
    expect(buildTrustGlyph("observed", 0.5).tooltip).toBe("Observed");
  });
});

describe("buildTimelineBundleViewModel", () => {
  const bundle: TimelineDisplayBundle = {
    kind: "bundle",
    id: "bundle-1",
    laneType: "aiConversation",
    start: "2026-05-14T10:00:00Z",
    end: "2026-05-14T10:30:00Z",
    title: "Work-flow bundle",
    summary: "summary",
    bundleKind: "sequence",
    dominantType: "aiConversation",
    memberEventIds: ["e1", "e2", "e3"],
    members: [],
    count: 3,
    eventTypeCounts: { aiConversation: 2, decision: 1 },
    trustLevel: "observed",
    evidenceCount: 2,
    sourceCount: 2,
    issueCount: 1,
    decisionCount: 1,
    artifactCount: 0,
    representedIssueIds: ["i1"],
    representedDecisionIds: ["d1"],
    reason: {
      code: "preserveSingleRow",
      message: "test",
      timeWindowMinutes: 12,
      laneType: "aiConversation",
    },
    anchorEventId: "e2",
  };

  it("produces a time range string", () => {
    const vm = buildTimelineBundleViewModel(bundle);
    expect(vm.kind).toBe("bundle");
    expect(vm.timeLabel).toMatch(/-/);
  });

  it("ranks the type mix label by count desc", () => {
    const vm = buildTimelineBundleViewModel(bundle);
    // aiConversation (2) should come before decision (1).
    const aiIndex = vm.typeMixLabel.indexOf("AI 대화");
    const decIndex = vm.typeMixLabel.indexOf("결정");
    expect(aiIndex).toBeGreaterThanOrEqual(0);
    expect(decIndex).toBeGreaterThan(aiIndex);
  });

  it("emits footer parts for src / dec / issues", () => {
    const vm = buildTimelineBundleViewModel(bundle);
    expect(vm.metaParts).toContain("2 src");
    expect(vm.metaParts).toContain("1 dec");
    expect(vm.metaParts).toContain("1 issue");
  });
});
