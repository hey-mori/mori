import { describe, expect, it } from "vitest";
import { buildProjectChronology } from "./projectChronology";

const utcDay = (iso: string) => iso.slice(0, 10);
const pr = (number: number, at: string) => ({ repository: "swarea/infra", number, url: `https://github.com/swarea/infra/pull/${number}`, firstObservedAt: at, firstLine: 1, observations: 1 });

describe("project chronology", () => {
  const chronology = buildProjectChronology({
    dayOf: utcDay,
    sessions: [
      { id: "s1", title: "CI 개선", start: "2026-10-09T06:22:00Z", end: "2026-10-09T12:09:00Z", messages: 412, evidence: { prs: [pr(219, "2026-10-09T09:00:00Z"), pr(217, "2026-10-09T07:00:00Z")], branches: [], repositories: [], complete: true } },
      { id: "s2", title: "Bootstrap", start: "2026-10-05T23:00:00Z", end: "2026-10-06T02:00:00Z", evidence: { prs: [pr(217, "2026-10-06T01:00:00Z")], branches: [{ name: "feat/boot", basis: "record", firstObservedAt: "", lastObservedAt: "", firstLine: 1 }], repositories: [], complete: true, continuedInSessionId: "s1" } },
      { id: "s3", title: "no time" },
    ],
    records: [
      { id: "r1", title: "dataset access review", schemaId: "note", at: "2026-10-09T10:00:00Z" },
      { id: "r2", title: "undated note", schemaId: "note" },
    ],
  });

  it("groups by the day of last activity, newest first, newest item first", () => {
    expect(chronology.days.map((day) => day.date)).toEqual(["2026-10-09", "2026-10-06"]);
    expect(chronology.days[0]!.items.map((item) => item.id)).toEqual(["s1", "r1"]);
  });

  it("says the quiet stretch between active days, and never places an item without a time", () => {
    expect(chronology.days[1]!.quietDaysAfter).toBe(2);
    expect(chronology.undated.map((item) => item.id)).toEqual(["s3", "r2"]);
  });

  it("keeps a session's real span: minutes, days touched, PRs most recent first, branches, continuation", () => {
    const s1 = chronology.days[0]!.items.find((item) => item.id === "s1");
    expect(s1).toMatchObject({ minutes: 347, days: 1, messages: 412 });
    expect(s1?.kind === "session" ? s1.prs.map((p) => p.number) : null).toEqual([219, 217]);
    const s2 = chronology.days[1]!.items[0]!;
    expect(s2).toMatchObject({ days: 2, branches: ["feat/boot"], continuedIn: "s1", messages: null });
  });

  it("counts distinct PRs and reports the span from the earliest start to the latest activity", () => {
    expect(chronology).toMatchObject({ prs: 2, sessions: 3, records: 2, activeDays: 2 });
    expect(chronology.span).toEqual({ first: "2026-10-05T23:00:00Z", last: "2026-10-09T12:09:00Z" });
  });

  it("is empty and spanless with nothing dated", () => {
    expect(buildProjectChronology({ sessions: [], records: [] })).toMatchObject({ days: [], span: null, activeDays: 0 });
  });

  it("ignores an end before the start rather than inventing a span", () => {
    const [day] = buildProjectChronology({ dayOf: utcDay, sessions: [{ id: "x", title: "x", start: "2026-10-09T10:00:00Z", end: "2026-10-09T09:00:00Z" }], records: [] }).days;
    expect(day!.items[0]).toMatchObject({ end: null, minutes: null, days: 1 });
  });
});
