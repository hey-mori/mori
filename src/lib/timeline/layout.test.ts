import { describe, expect, it } from "vitest";
import { laneOrder } from "../../domain/constants";
import { mockSession } from "../../domain/mock-data";
import { groupEventsByLane, timestampToXPercent } from "./layout";

describe("timeline layout", () => {
  it("maps timestamps to horizontal percentages", () => {
    const range = {
      start: "2026-05-12T13:00:00+09:00",
      end: "2026-05-12T18:00:00+09:00",
    };

    expect(timestampToXPercent("2026-05-12T13:00:00+09:00", range)).toBe(0);
    expect(timestampToXPercent("2026-05-12T15:30:00+09:00", range)).toBe(50);
    expect(timestampToXPercent("2026-05-12T18:00:00+09:00", range)).toBe(100);
  });

  it("groups Mori events into lane buckets", () => {
    const grouped = groupEventsByLane(mockSession.events, laneOrder);

    expect(grouped.aiConversation.length).toBeGreaterThan(0);
    expect(grouped.decision.length).toBeGreaterThan(0);
    expect(grouped.issue.length).toBeGreaterThan(0);
    expect(grouped.fileCode.length).toBeGreaterThan(0);
    expect(grouped.webResearch.length).toBeGreaterThan(0);
  });
});
