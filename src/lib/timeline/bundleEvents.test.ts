import { describe, expect, it } from "vitest";
import { moriMockSession } from "../../domain/mock-data";
import { createTimelineBundles } from "./bundleEvents";
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
});
