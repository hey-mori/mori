import { describe, expect, it } from "vitest";
import type { ProjectSessionRow } from "./projectOverview";
import {
  countProjectSessionFilters,
  filterProjectSessions,
} from "./projectSessionFilter";

const NOW = new Date("2026-06-03T15:00:00").getTime();

function row(partial: Partial<ProjectSessionRow>): ProjectSessionRow {
  return {
    sessionId: partial.sessionId ?? "s",
    title: partial.title ?? "세션",
    timestamp: partial.timestamp ?? new Date(NOW).toISOString(),
    status: partial.status ?? "complete",
    eventCount: partial.eventCount,
    sourceCount: partial.sourceCount,
    reviewCount: partial.reviewCount,
    memoryCandidateCount: partial.memoryCandidateCount,
    reportCount: partial.reportCount,
  };
}

const ROWS: ProjectSessionRow[] = [
  row({ sessionId: "recent-review", reviewCount: 3, timestamp: new Date(NOW - 2 * 3600_000).toISOString() }),
  row({ sessionId: "recent-clean", reviewCount: 0, timestamp: new Date(NOW - 3 * 3600_000).toISOString() }),
  row({ sessionId: "old-review", reviewCount: 1, timestamp: new Date(NOW - 5 * 86_400_000).toISOString() }),
  row({ sessionId: "old-clean", reviewCount: 0, timestamp: new Date(NOW - 9 * 86_400_000).toISOString() }),
];

describe("filterProjectSessions", () => {
  it("returns everything for the all filter, preserving order", () => {
    const result = filterProjectSessions(ROWS, { filter: "all", now: NOW });
    expect(result.map((r) => r.sessionId)).toEqual([
      "recent-review",
      "recent-clean",
      "old-review",
      "old-clean",
    ]);
  });

  it("keeps only sessions with open review items for needsReview", () => {
    const result = filterProjectSessions(ROWS, { filter: "needsReview", now: NOW });
    expect(result.map((r) => r.sessionId)).toEqual(["recent-review", "old-review"]);
  });

  it("keeps only sessions inside the recency window for recent", () => {
    const result = filterProjectSessions(ROWS, { filter: "recent", now: NOW });
    expect(result.map((r) => r.sessionId)).toEqual(["recent-review", "recent-clean"]);
  });

  it("treats an unparseable timestamp as not recent", () => {
    const result = filterProjectSessions([row({ sessionId: "bad", timestamp: "nope", reviewCount: 0 })], {
      filter: "recent",
      now: NOW,
    });
    expect(result).toEqual([]);
  });
});

describe("countProjectSessionFilters", () => {
  it("counts each filter bucket", () => {
    expect(countProjectSessionFilters(ROWS, { now: NOW })).toEqual({
      all: 4,
      needsReview: 2,
      recent: 2,
    });
  });

  it("counts zero buckets honestly", () => {
    const clean = [row({ sessionId: "a", reviewCount: 0, timestamp: new Date(NOW - 30 * 86_400_000).toISOString() })];
    expect(countProjectSessionFilters(clean, { now: NOW })).toEqual({
      all: 1,
      needsReview: 0,
      recent: 0,
    });
  });
});
