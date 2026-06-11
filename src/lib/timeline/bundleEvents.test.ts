import { describe, expect, it } from "vitest";
import { mockSession } from "../../domain/mock-data";
import type { TimelineEvent } from "../../domain/types";
import {
  createTimelineBundles,
  createTimelineDisplayItems,
  deriveBundleConnectorSource,
} from "./bundleEvents";
import { isTimelineBundle } from "./displayItems";

describe("timeline workflow bundles", () => {
  it("creates a research bundle for nearby low-importance events", () => {
    const items = createTimelineBundles(mockSession.events, mockSession.relationships, {
      timeWindowMinutes: 12,
      minEventsForBundle: 3,
      preserveSelectedEventId: "evt-positioning",
      preserveImportantEventIds: ["evt-positioning", "evt-start-flow"],
      maxVisibleItemsPerLane: 4,
      decisions: mockSession.decisions,
    });

    const researchBundle = items.find((item) => item.id.includes("bundle-research"));
    expect(researchBundle && isTimelineBundle(researchBundle)).toBe(true);
    expect(researchBundle && isTimelineBundle(researchBundle) ? researchBundle.count : 0).toBeGreaterThanOrEqual(3);
    expect(researchBundle && isTimelineBundle(researchBundle) ? researchBundle.title : "").toContain("리서치");
  });

  it("preserves the selected event as an individual card", () => {
    const items = createTimelineBundles(mockSession.events, mockSession.relationships, {
      timeWindowMinutes: 12,
      minEventsForBundle: 2,
      preserveSelectedEventId: "evt-positioning",
      maxVisibleItemsPerLane: 4,
      decisions: mockSession.decisions,
    });

    const selected = items.find((item) => item.id === "evt-positioning");
    expect(selected?.kind).toBe("event");
  });

  it("keeps major decision events individual", () => {
    const items = createTimelineBundles(mockSession.events, mockSession.relationships, {
      timeWindowMinutes: 20,
      minEventsForBundle: 2,
      maxVisibleItemsPerLane: 4,
      decisions: mockSession.decisions,
    });

    expect(items.find((item) => item.id === "evt-start-flow")?.kind).toBe("event");
    expect(items.find((item) => item.id === "evt-local-llm-priority")?.kind).toBe("event");
  });

  it("does not bundle far-apart document notes", () => {
    const items = createTimelineBundles(mockSession.events, mockSession.relationships, {
      timeWindowMinutes: 10,
      minEventsForBundle: 2,
      maxVisibleItemsPerLane: 5,
      decisions: mockSession.decisions,
    });

    const noteBundles = items.filter((item) => item.kind === "bundle" && item.laneType === "docs");
    expect(noteBundles).toHaveLength(0);
  });

  it("records meaningful bundle counts and member ids instead of generic hidden clusters", () => {
    const items = createTimelineDisplayItems(mockSession.events, mockSession.relationships, {
      timeWindowMinutes: 12,
      minEventsForBundle: 3,
      preserveSelectedEventId: "evt-positioning",
      maxVisibleItemsPerLane: 4,
      decisions: mockSession.decisions,
    });

    const researchBundle = items.find((item) => item.id.includes("bundle-research"));
    expect(researchBundle && isTimelineBundle(researchBundle)).toBe(true);
    if (!researchBundle || !isTimelineBundle(researchBundle)) return;

    expect(researchBundle.memberEventIds).toEqual(
      expect.arrayContaining(["evt-dayflow", "evt-screenpipe", "evt-specstory", "evt-pieces"]),
    );
    expect(researchBundle.sourceCount).toBe(1);
    expect(researchBundle.eventTypeCounts.webResearch).toBe(4);
    expect(researchBundle.reason.message).not.toContain("+");
    expect(researchBundle.summary).toContain("조사 4건");
  });
});

describe("conversation bundles", () => {
  function convoTurn(index: number, minute: number): TimelineEvent {
    const start = `2026-05-22T09:${String(minute).padStart(2, "0")}:00Z`;
    return {
      id: `evt-turn-${index}`,
      sessionId: "s1",
      projectId: "p1",
      start,
      type: "aiConversation",
      title: `질문 ${index}`,
      summary: `응답 ${index}`,
      sourceRefs: [],
      linkedIssueIds: [],
      linkedDecisionIds: [],
      relationshipIds: [],
      trustLevel: "observed",
      confidence: 0.9,
      createdBy: "import",
      userModified: false,
    };
  }

  it("labels a conversation bundle with turn count and time range, never the abstract label", () => {
    const turns = Array.from({ length: 6 }, (_, index) => convoTurn(index, index));
    const items = createTimelineBundles(turns, [], {
      timeWindowMinutes: 3,
      minEventsForBundle: 3,
      maxVisibleItemsPerLane: 4,
    });

    const bundle = items.find((item) => isTimelineBundle(item));
    expect(bundle && isTimelineBundle(bundle)).toBe(true);
    if (!bundle || !isTimelineBundle(bundle)) return;
    expect(bundle.bundleKind).toBe("conversationBurst");
    expect(bundle.title).toContain("대화 턴");
    expect(bundle.title).not.toBe("AI 작업 흐름 묶음");
    // count + range, e.g. "6개 대화 턴 · 09:00–09:05"
    expect(bundle.title).toMatch(/\d+개 대화 턴/);
    expect(bundle.summary).toContain("대화 턴");
  });

  it("keeps individual turns visible when a higher per-lane threshold is set", () => {
    // Four turns under a min-of-6 threshold must NOT bundle — they read as
    // individual turns, which is the whole point of the conversation override.
    const turns = Array.from({ length: 4 }, (_, index) => convoTurn(index, index));
    const items = createTimelineBundles(turns, [], {
      timeWindowMinutes: 3,
      minEventsForBundle: 6,
      maxVisibleItemsPerLane: 14,
    });

    expect(items.every((item) => item.kind === "event")).toBe(true);
    expect(items).toHaveLength(4);
  });
});

describe("deriveBundleConnectorSource", () => {
  function ev(id: string, connectorEventId?: string): TimelineEvent {
    return { id, connectorEventId } as unknown as TimelineEvent;
  }

  it("returns the shared connector id when every event has the same source", () => {
    expect(
      deriveBundleConnectorSource([
        ev("a", "claude-code::sess1::a"),
        ev("b", "claude-code::sess1::b"),
        ev("c", "claude-code::sess2::c"),
      ]),
    ).toBe("claude-code");
  });

  it("returns null when connector sources are mixed", () => {
    expect(
      deriveBundleConnectorSource([
        ev("a", "claude-code::s::a"),
        ev("b", "codex-cli::s::b"),
      ]),
    ).toBeNull();
  });

  it("returns null when any event lacks a connector id", () => {
    expect(
      deriveBundleConnectorSource([ev("a", "claude-code::s::a"), ev("b")]),
    ).toBeNull();
  });
});
