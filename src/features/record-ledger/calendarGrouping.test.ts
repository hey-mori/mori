import { describe, expect, it } from "vitest";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { dayLabel, groupByActivityDay } from "./calendarGrouping";

function record(id: string, occurredStart?: string, capturedAt = "2026-07-14T09:00:00Z"): MoriRecord {
  return {
    id,
    schemaId: "note",
    title: id,
    body: "",
    occurredStart,
    capturedAt,
    timeBasis: occurredStart ? "user-provided" : "unknown",
    status: "active",
    origin: "user",
    ownership: "db",
    contextIds: [],
    properties: {},
    createdAt: capturedAt,
    updatedAt: capturedAt,
  };
}

describe("groupByActivityDay", () => {
  it("groups by activity day, newest first, unknown last", () => {
    const groups = groupByActivityDay([
      record("a", "2026-07-13"),
      record("b", "2026-07-14"),
      record("c"),
      record("d", "2026-07-14"),
    ]);
    expect(groups.map((group) => group.date)).toEqual(["2026-07-14", "2026-07-13", null]);
    expect(groups[0].records.map((r) => r.id).sort()).toEqual(["b", "d"]);
    expect(groups[2].records.map((r) => r.id)).toEqual(["c"]);
  });

  it("uses the date part of a datetime occurredStart", () => {
    const groups = groupByActivityDay([record("a", "2026-07-14T22:00:00Z")]);
    expect(groups[0].date).toBe("2026-07-14");
  });

  it("returns an empty array for no records", () => {
    expect(groupByActivityDay([])).toEqual([]);
  });
});

describe("dayLabel", () => {
  const now = new Date("2026-07-14T09:00:00Z");

  it("marks 오늘 and 어제", () => {
    expect(dayLabel("2026-07-14", now)).toBe("2026년 7월 14일 (오늘)");
    expect(dayLabel("2026-07-13", now)).toBe("2026년 7월 13일 (어제)");
  });

  it("plain label for other days", () => {
    expect(dayLabel("2026-07-08", now)).toBe("2026년 7월 8일");
  });
});
