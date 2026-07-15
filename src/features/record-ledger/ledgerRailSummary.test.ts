import { describe, expect, it } from "vitest";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { createSchemaRegistry } from "../../lib/record-kernel/schemaRegistry";
import { buildWeekSummary, recordsInWeek, weekBounds } from "./ledgerRailSummary";

const registry = createSchemaRegistry();
// 2026-07-15 is a Wednesday; its week is 2026-07-12 (Sun) .. 2026-07-18 (Sat).
const now = new Date("2026-07-15T09:00:00Z");

function record(
  id: string,
  schemaId: string,
  occurredStart?: string,
  properties: MoriRecord["properties"] = {},
): MoriRecord {
  return {
    id,
    schemaId,
    title: id,
    body: "",
    occurredStart,
    capturedAt: "2026-07-15T09:00:00Z",
    timeBasis: occurredStart ? "user-provided" : "unknown",
    status: "active",
    origin: "user",
    ownership: "db",
    contextIds: [],
    properties,
    createdAt: "2026-07-15T09:00:00Z",
    updatedAt: "2026-07-15T09:00:00Z",
  };
}

describe("weekBounds", () => {
  it("returns the Sunday-Saturday week containing the date", () => {
    expect(weekBounds(now)).toEqual({ start: "2026-07-12", end: "2026-07-18" });
  });
});

describe("recordsInWeek", () => {
  it("keeps in-week dated records and drops out-of-week and unknown ones", () => {
    const inWeek = recordsInWeek(
      [
        record("a", "workout", "2026-07-14"),
        record("b", "activity", "2026-07-08"), // previous week
        record("c", "note"), // unknown date
        record("d", "study-session", "2026-07-18"), // week edge
      ],
      now,
    );
    expect(inWeek.map((r) => r.id)).toEqual(["a", "d"]);
  });
});

describe("buildWeekSummary", () => {
  it("counts kinds this week, most frequent first", () => {
    const summary = buildWeekSummary(
      [
        record("a", "activity", "2026-07-13"),
        record("b", "activity", "2026-07-14"),
        record("c", "workout", "2026-07-14"),
        record("z", "activity", "2026-07-01"), // out of week, ignored
      ],
      registry,
      now,
    );
    expect(summary.total).toBe(3);
    expect(summary.kinds[0]).toMatchObject({ schemaId: "activity", count: 2 });
    expect(summary.kinds.map((k) => k.name)).toContain("운동");
  });

  it("builds a cumulative metric line from duration-minutes", () => {
    const summary = buildWeekSummary(
      [
        record("a", "workout", "2026-07-13", { durationMinutes: 45 }),
        record("b", "workout", "2026-07-14", { durationMinutes: 60 }),
      ],
      registry,
      now,
    );
    expect(summary.metricLine).toBe("운동 누적 1시간 45분");
  });

  it("has no metric line when no metric-bearing records exist", () => {
    const summary = buildWeekSummary([record("a", "note", "2026-07-14")], registry, now);
    expect(summary.metricLine).toBeNull();
  });
});
