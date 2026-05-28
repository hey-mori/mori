import { describe, expect, it } from "vitest";
import { buildProjectActivityStats } from "./projectActivityStats";

// A fixed "now" so streak boundaries are deterministic: Wed 2026-05-27.
const NOW = new Date("2026-05-27T12:00:00").getTime();

describe("buildProjectActivityStats", () => {
  it("returns zeros for no sessions", () => {
    const s = buildProjectActivityStats([], NOW);
    expect(s).toEqual({ sessions: 0, currentStreak: 0, longestStreak: 0, lastActive: null });
  });

  it("counts sessions and reports the most recent activity", () => {
    const s = buildProjectActivityStats(
      ["2026-05-01T09:00:00", "2026-05-20T09:00:00", "2026-05-20T15:00:00"],
      NOW,
    );
    expect(s.sessions).toBe(3);
    expect(s.lastActive).toBe(new Date("2026-05-20T15:00:00").toISOString());
  });

  it("measures the longest consecutive-day run", () => {
    const s = buildProjectActivityStats(
      ["2026-05-10T09:00:00", "2026-05-11T09:00:00", "2026-05-12T09:00:00", "2026-05-20T09:00:00"],
      NOW,
    );
    expect(s.longestStreak).toBe(3);
  });

  it("counts the current streak back from today", () => {
    const s = buildProjectActivityStats(
      ["2026-05-25T09:00:00", "2026-05-26T09:00:00", "2026-05-27T09:00:00"],
      NOW,
    );
    expect(s.currentStreak).toBe(3);
  });

  it("anchors the current streak at yesterday when today is empty", () => {
    const s = buildProjectActivityStats(
      ["2026-05-25T09:00:00", "2026-05-26T09:00:00"],
      NOW,
    );
    // Nothing on the 27th (today), so the streak runs 26th → 25th.
    expect(s.currentStreak).toBe(2);
  });

  it("reads the current streak as 0 when the latest gap is older than yesterday", () => {
    const s = buildProjectActivityStats(["2026-05-20T09:00:00"], NOW);
    expect(s.currentStreak).toBe(0);
    expect(s.longestStreak).toBe(1);
  });

  it("ignores unparseable timestamps", () => {
    const s = buildProjectActivityStats(["nonsense", "2026-05-20T09:00:00"], NOW);
    expect(s.sessions).toBe(1);
  });
});
