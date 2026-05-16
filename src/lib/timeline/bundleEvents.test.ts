import { describe, expect, it } from "vitest";
import { moriMockSession } from "../../domain/mock-data";
import type { TimelineEvent } from "../../domain/types";
import {
  createTimelineBundles,
  createTimelineDisplayItems,
  deriveBundleConnectorSource,
} from "./bundleEvents";
import { isTimelineBundle } from "./displayItems";

describe("timeline workflow bundles", () => {
  it("creates a research bundle for nearby low-importance events", () => {
    const items = createTimelineBundles(moriMockSession.events, moriMockSession.relationships, {
      timeWindowMinutes: 12,
      minEventsForBundle: 3,
      preserveSelectedEventId: "evt-positioning",
      preserveImportantEventIds: ["evt-positioning", "evt-start-flow"],
      maxVisibleItemsPerLane: 4,
      decisions: moriMockSession.decisions,
    });

    const researchBundle = items.find((item) => item.id.includes("bundle-webResearch"));
    expect(researchBundle && isTimelineBundle(researchBundle)).toBe(true);
    expect(researchBundle && isTimelineBundle(researchBundle) ? researchBundle.count : 0).toBeGreaterThanOrEqual(3);
    expect(researchBundle && isTimelineBundle(researchBundle) ? researchBundle.title : "").toContain("조사");
  });

  it("preserves the selected event as an individual card", () => {
    const items = createTimelineBundles(moriMockSession.events, moriMockSession.relationships, {
      timeWindowMinutes: 12,
      minEventsForBundle: 2,
      preserveSelectedEventId: "evt-positioning",
      maxVisibleItemsPerLane: 4,
      decisions: moriMockSession.decisions,
    });

    const selected = items.find((item) => item.id === "evt-positioning");
    expect(selected?.kind).toBe("event");
  });

  it("keeps major decision events individual", () => {
    const items = createTimelineBundles(moriMockSession.events, moriMockSession.relationships, {
      timeWindowMinutes: 20,
      minEventsForBundle: 2,
      maxVisibleItemsPerLane: 4,
      decisions: moriMockSession.decisions,
    });

    expect(items.find((item) => item.id === "evt-start-flow")?.kind).toBe("event");
    expect(items.find((item) => item.id === "evt-local-llm-priority")?.kind).toBe("event");
  });

  it("does not bundle far-apart document notes", () => {
    const items = createTimelineBundles(moriMockSession.events, moriMockSession.relationships, {
      timeWindowMinutes: 10,
      minEventsForBundle: 2,
      maxVisibleItemsPerLane: 5,
      decisions: moriMockSession.decisions,
    });

    const noteBundles = items.filter((item) => item.kind === "bundle" && item.laneType === "documentNote");
    expect(noteBundles).toHaveLength(0);
  });

  it("records meaningful bundle counts and member ids instead of generic hidden clusters", () => {
    const items = createTimelineDisplayItems(moriMockSession.events, moriMockSession.relationships, {
      timeWindowMinutes: 12,
      minEventsForBundle: 3,
      preserveSelectedEventId: "evt-positioning",
      maxVisibleItemsPerLane: 4,
      decisions: moriMockSession.decisions,
    });

    const researchBundle = items.find((item) => item.id.includes("bundle-webResearch"));
    expect(researchBundle && isTimelineBundle(researchBundle)).toBe(true);
    if (!researchBundle || !isTimelineBundle(researchBundle)) return;

    expect(researchBundle.memberEventIds).toEqual(
      expect.arrayContaining(["evt-dayflow", "evt-screenpipe", "evt-specstory", "evt-pieces"]),
    );
    expect(researchBundle.sourceCount).toBe(1);
    expect(researchBundle.eventTypeCounts.webResearch).toBe(4);
    expect(researchBundle.reason.message).not.toContain("+");
    expect(researchBundle.summary).toContain("research burst");
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
