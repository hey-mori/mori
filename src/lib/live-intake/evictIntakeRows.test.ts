import { describe, expect, it } from "vitest";
import { evictIntakeRows, MAX_ROWS_PER_SESSION } from "./evictIntakeRows";
import { INTAKE_ROW_VERSION, type IntakeRequestRow } from "./intakeTypes";

const NOW = Date.parse("2026-08-13T12:00:00.000Z");

function daysAgo(days: number): string {
  return new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();
}

function row(partial: Partial<IntakeRequestRow> & { id: string }): IntakeRequestRow {
  return {
    schemaVersion: INTAKE_ROW_VERSION,
    sessionKey: "/s/a.jsonl",
    projectPath: "C:\dev\mori",
    sessionLabel: "mori",
    title: "an ask",
    titleTruncated: false,
    startedAt: daysAgo(1),
    endedAt: daysAgo(1),
    stepCount: 3,
    tools: [],
    files: [],
    hasError: false,
    status: "completed",
    locator: { path: "/s/a.jsonl", offset: 0 },
    observedAt: daysAgo(1),
    ...partial,
  };
}

describe("evictIntakeRows", () => {
  it("keeps everything a normal session holds", () => {
    // A heavy real session measured 89 to 713 requests; a normal one is far
    // below the cap and must not be trimmed at all.
    const rows = Array.from({ length: 120 }, (_, i) => row({ id: `r${i}` }));
    const result = evictIntakeRows(rows, NOW);

    expect(result.dropped).toBe(0);
    expect(result.kept).toHaveLength(120);
  });

  it("caps a session that would otherwise grow without limit", () => {
    const rows = Array.from({ length: MAX_ROWS_PER_SESSION + 50 }, (_, i) =>
      row({ id: `r${i}`, startedAt: new Date(NOW - i * 60_000).toISOString() }),
    );
    const result = evictIntakeRows(rows, NOW);

    expect(result.kept).toHaveLength(MAX_ROWS_PER_SESSION);
    expect(result.dropped).toBe(50);
  });

  it("keeps the recent end, not an arbitrary slice", () => {
    const rows = Array.from({ length: MAX_ROWS_PER_SESSION + 10 }, (_, i) =>
      row({ id: `r${i}`, startedAt: new Date(NOW - i * 60_000).toISOString() }),
    );
    const kept = evictIntakeRows(rows, NOW).kept.map((r) => r.id);

    expect(kept[0]).toBe("r0");
    expect(kept).not.toContain(`r${MAX_ROWS_PER_SESSION + 9}`);
  });

  it("drops rows older than the age bound even when the count is small", () => {
    const result = evictIntakeRows(
      [row({ id: "fresh" }), row({ id: "ancient", startedAt: daysAgo(90) })],
      NOW,
    );

    expect(result.kept.map((r) => r.id)).toEqual(["fresh"]);
    expect(result.dropped).toBe(1);
  });

  it("drops a row with an unusable timestamp rather than keeping it forever", () => {
    // It sorts oldest and cannot be placed on any time-ordered surface, so
    // keeping it would only consume budget.
    const result = evictIntakeRows([row({ id: "bad", startedAt: "not a date" })], NOW);

    expect(result.kept).toEqual([]);
    expect(result.dropped).toBe(1);
  });

  it("reports what it dropped rather than trimming silently", () => {
    const rows = Array.from({ length: MAX_ROWS_PER_SESSION + 3 }, (_, i) =>
      row({ id: `r${i}`, startedAt: new Date(NOW - i * 60_000).toISOString() }),
    );

    expect(evictIntakeRows(rows, NOW).dropped).toBe(3);
  });

  it("returns nothing for nothing", () => {
    expect(evictIntakeRows([], NOW)).toEqual({ kept: [], dropped: 0 });
  });
});
