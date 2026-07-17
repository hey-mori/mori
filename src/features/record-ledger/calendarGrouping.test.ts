import { describe, expect, it } from "vitest";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import {
  activityDay,
  dayLabel,
  groupByActivityDay,
  recordCountByDate,
  recordsByDate,
} from "./calendarGrouping";

/** An instant expressed as "this local wall-clock time", so these assertions
 *  hold in any zone rather than only in the one this machine happens to be in. */
function atLocal(year: number, month: number, day: number, hour: number): string {
  return new Date(year, month - 1, day, hour, 0, 0).toISOString();
}

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
    // Bare dates: this asserts that occurredStart WINS over capturedAt, and a
    // calendar day carries no zone to argue about.
    const byDay = recordsByDate([record("어제 일", "2026-07-13", "2026-07-14T09:00:00Z")]);
    expect([...byDay.keys()]).toEqual(["2026-07-13"]);
  });

  it("buckets a note by the day the user wrote it, not by its UTC date", () => {
    // A note has no occurredStart, so its day comes from capturedAt, which the
    // factory writes with toISOString(). Slicing that string bucketed by the UTC
    // date while every "today" on these surfaces is local, so in KST a note
    // written before 09:00 landed on YESTERDAY, and on the 1st it fell out of
    // the visible month. Both ends are checked so this holds either side of UTC.
    // A real note: capture-fallback with no occurredStart, which is a DECIDED
    // day (the day it was written), not an undecided one.
    const note = (id: string, capturedAt: string): MoriRecord => ({
      ...record(id, undefined, capturedAt),
      timeBasis: "capture-fallback",
    });
    const early = note("아침", atLocal(2026, 7, 14, 0));
    const late = note("자정 전", atLocal(2026, 7, 14, 23));
    expect([...recordsByDate([early]).keys()]).toEqual(["2026-07-14"]);
    expect([...recordsByDate([late]).keys()]).toEqual(["2026-07-14"]);
  });
});

describe("activityDay", () => {
  it("converts an instant to its LOCAL calendar day", () => {
    expect(activityDay(atLocal(2026, 7, 14, 0))).toBe("2026-07-14");
    expect(activityDay(atLocal(2026, 7, 14, 23))).toBe("2026-07-14");
  });

  it("returns a bare date untouched", () => {
    // "2026-07-14" is a calendar day, not an instant. Parsing it would drag it
    // through UTC midnight and shift it a day in any negative offset.
    expect(activityDay("2026-07-14")).toBe("2026-07-14");
  });

  it("does not throw on an unparseable time", () => {
    expect(activityDay("nonsense")).toBe("nonsense");
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

  it("uses the LOCAL day of a datetime occurredStart", () => {
    const groups = groupByActivityDay([record("a", atLocal(2026, 7, 14, 22))]);
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
      record("b", atLocal(2026, 7, 14, 22)),
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
