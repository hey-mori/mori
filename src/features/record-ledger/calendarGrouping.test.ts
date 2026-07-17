import { describe, expect, it } from "vitest";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { dayLabel, groupByActivityDay, recordCountByDate, recordsByDate } from "./calendarGrouping";

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

describe("recordsByDate · what the calendar can show", () => {
  /** A note as createNote actually writes it: written today, no occurredStart. */
  function writtenNote(id: string, capturedAt: string): MoriRecord {
    return { ...record(id), capturedAt, createdAt: capturedAt, updatedAt: capturedAt, occurredStart: undefined, timeBasis: "capture-fallback" };
  }

  it("puts a written note on the day it was written", () => {
    // Regression: keying off a raw occurredStart dropped every note, so the
    // calendar showed agent sessions and nothing the user had typed.
    const byDay = recordsByDate([writtenNote("오늘 회고", "2026-07-14T09:00:00Z")]);
    expect([...byDay.keys()]).toEqual(["2026-07-14"]);
    expect(byDay.get("2026-07-14")?.map((r) => r.id)).toEqual(["오늘 회고"]);
  });

  it("still keeps a genuinely undecided record out of the grid", () => {
    // timeBasis unknown has no honest day; it belongs in the 날짜 미정 tray.
    expect(recordsByDate([record("날짜 없음")]).size).toBe(0);
  });

  it("keeps a user-dated record on its activity day, not its capture day", () => {
    const byDay = recordsByDate([record("어제 일", "2026-07-13T22:00:00Z", "2026-07-14T09:00:00Z")]);
    expect([...byDay.keys()]).toEqual(["2026-07-13"]);
  });
});

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

describe("recordCountByDate", () => {
  it("counts records per activity day, excluding unknown dates", () => {
    const counts = recordCountByDate([
      record("a", "2026-07-14"),
      record("b", "2026-07-14T22:00:00Z"),
      record("c", "2026-07-13"),
      record("d"),
    ]);
    expect(counts.get("2026-07-14")).toBe(2);
    expect(counts.get("2026-07-13")).toBe(1);
    expect(counts.has("unknown")).toBe(false);
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(3);
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
