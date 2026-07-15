import { describe, expect, it } from "vitest";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { dateSituation, isDateUndecided } from "./dateResolution";

const now = new Date("2026-07-15T09:00:00");

function record(over: Partial<MoriRecord> = {}): MoriRecord {
  return {
    id: "r1",
    schemaId: "note",
    title: "메모",
    body: "",
    capturedAt: "2026-07-15T09:00:00",
    timeBasis: "unknown",
    status: "active",
    origin: "user",
    ownership: "db",
    contextIds: [],
    properties: {},
    createdAt: "2026-07-15T09:00:00",
    updatedAt: "2026-07-15T09:00:00",
    ...over,
  };
}

describe("isDateUndecided", () => {
  it("is true only for the unknown time basis", () => {
    expect(isDateUndecided(record({ timeBasis: "unknown" }))).toBe(true);
    expect(isDateUndecided(record({ timeBasis: "ai-inferred", occurredStart: "2026-07-14" }))).toBe(false);
    expect(isDateUndecided(record({ timeBasis: "user-provided", occurredStart: "2026-07-14" }))).toBe(false);
    expect(isDateUndecided(record({ timeBasis: "capture-fallback" }))).toBe(false);
  });
});

describe("dateSituation", () => {
  it("returns null for a record with a decided date", () => {
    expect(dateSituation(record({ timeBasis: "user-provided", occurredStart: "2026-07-14" }), now)).toBeNull();
  });

  it("offers today alone when captured today", () => {
    const situation = dateSituation(record({ capturedAt: "2026-07-15T09:00:00" }), now);
    expect(situation?.choices.map((c) => c.id)).toEqual(["today", "pick", "keep-none"]);
    const today = situation?.choices.find((c) => c.id === "today");
    expect(today).toMatchObject({ kind: "set", date: "2026-07-15" });
  });

  it("offers the capture day and today when captured on an earlier day", () => {
    const situation = dateSituation(record({ capturedAt: "2026-07-13T14:00:00" }), now);
    expect(situation?.choices.map((c) => c.id)).toEqual(["capture", "today", "pick", "keep-none"]);
    expect(situation?.choices.find((c) => c.id === "capture")).toMatchObject({ date: "2026-07-13" });
  });

  it("offers the previous day first for a late-night capture", () => {
    const situation = dateSituation(record({ capturedAt: "2026-07-15T01:30:00" }), now);
    expect(situation?.reason).toContain("새벽");
    expect(situation?.choices[0]).toMatchObject({ id: "prev", kind: "set", date: "2026-07-14" });
    expect(situation?.choices[1]).toMatchObject({ id: "capture", date: "2026-07-15" });
  });
});
