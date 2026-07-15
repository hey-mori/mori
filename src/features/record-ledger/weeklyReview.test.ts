import { describe, expect, it } from "vitest";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { createSchemaRegistry } from "../../lib/record-kernel/schemaRegistry";
import { buildWeeklyReview, shiftWeeks, weekRange } from "./weeklyReview";

const registry = createSchemaRegistry();
// 2026-07-15 Wed → week 2026-07-12 (Sun) .. 2026-07-18 (Sat).
const anchor = new Date(2026, 6, 15);

function record(id: string, schemaId: string, day: string, properties: MoriRecord["properties"] = {}): MoriRecord {
  return {
    id,
    schemaId,
    title: id,
    body: "",
    occurredStart: day,
    capturedAt: `${day}T09:00:00`,
    timeBasis: "user-provided",
    status: "active",
    origin: "user",
    ownership: "db",
    contextIds: [],
    properties,
    createdAt: `${day}T09:00:00`,
    updatedAt: `${day}T09:00:00`,
  };
}

describe("weekRange / shiftWeeks", () => {
  it("returns the Sunday-Saturday week and shifts by whole weeks", () => {
    expect(weekRange(anchor).start).toBe("2026-07-12");
    expect(weekRange(anchor).end).toBe("2026-07-18");
    expect(weekRange(shiftWeeks(anchor, -1)).start).toBe("2026-07-05");
  });
});

describe("buildWeeklyReview", () => {
  it("bars each day and totals the week, ignoring other weeks", () => {
    const review = buildWeeklyReview(
      [
        record("a", "activity", "2026-07-13"),
        record("b", "workout", "2026-07-14"),
        record("c", "activity", "2026-07-14"),
        record("z", "activity", "2026-07-05"), // previous week
      ],
      registry,
      [],
      [],
      anchor,
    );
    expect(review.total).toBe(3);
    expect(review.days).toHaveLength(7);
    const tue = review.days.find((d) => d.date === "2026-07-14");
    expect(tue?.total).toBe(2);
    expect(tue?.kinds.map((k) => k.schemaId).sort()).toEqual(["activity", "workout"]);
  });

  it("computes a metric delta against the previous week", () => {
    const review = buildWeeklyReview(
      [
        record("a", "workout", "2026-07-14", { durationMinutes: 60 }),
        record("b", "workout", "2026-07-15", { durationMinutes: 30 }),
        record("p", "workout", "2026-07-07", { durationMinutes: 45 }), // last week
      ],
      registry,
      [],
      [],
      anchor,
    );
    const workout = review.trackers.find((t) => t.group.schemaId === "workout");
    expect(workout?.group.totalMetric).toBe(90);
    expect(workout?.deltaMetric).toBe(45); // 90 this week - 45 last week
  });

  it("collects the week's insights and decisions", () => {
    const review = buildWeeklyReview(
      [
        record("i", "insight", "2026-07-14"),
        record("d", "decision", "2026-07-15"),
        record("n", "note", "2026-07-15"),
      ],
      registry,
      [],
      [],
      anchor,
    );
    expect(review.insights.map((r) => r.id).sort()).toEqual(["d", "i"]);
  });
});
