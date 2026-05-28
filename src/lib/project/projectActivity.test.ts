import { describe, expect, it } from "vitest";
import { buildProjectActivity } from "./projectActivity";

// A fixed "now" so bucket boundaries are deterministic: Wed 2026-05-27.
const NOW = new Date("2026-05-27T12:00:00").getTime();
const iso = (s: string) => new Date(s).toISOString();

describe("buildProjectActivity", () => {
  it("returns an empty series for no sessions", () => {
    const a = buildProjectActivity([], NOW);
    expect(a.total).toBe(0);
    expect(a.buckets).toEqual([]);
    expect(a.firstAt).toBeNull();
    expect(a.maxCount).toBe(0);
  });

  it("buckets weekly for a short span and reports span + recency", () => {
    const a = buildProjectActivity(
      ["2026-05-04T09:00:00", "2026-05-05T09:00:00", "2026-05-20T09:00:00"],
      NOW,
    );
    expect(a.granularity).toBe("week");
    expect(a.total).toBe(3);
    expect(a.firstAt).toBe(iso("2026-05-04T09:00:00"));
    expect(a.lastAt).toBe(iso("2026-05-20T09:00:00"));
    // Two sessions in the first week, one two weeks later.
    expect(a.maxCount).toBe(2);
    expect(a.buckets[0]!.count).toBe(2);
    expect(a.buckets.reduce((s, b) => s + b.count, 0)).toBe(3);
    // First-session week through the current week, inclusive.
    expect(a.buckets.length).toBeGreaterThanOrEqual(3);
  });

  it("switches to monthly buckets for a long-lived project", () => {
    const a = buildProjectActivity(
      ["2025-06-01T09:00:00", "2025-09-01T09:00:00", "2026-05-01T09:00:00"],
      NOW,
    );
    expect(a.granularity).toBe("month");
    expect(a.total).toBe(3);
    // Jun 2025 .. May 2026 inclusive = 12 monthly buckets.
    expect(a.buckets.length).toBe(12);
  });

  it("ignores unparseable timestamps", () => {
    const a = buildProjectActivity(["nonsense", "2026-05-20T09:00:00"], NOW);
    expect(a.total).toBe(1);
  });
});
