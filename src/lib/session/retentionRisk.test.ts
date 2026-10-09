import { describe, expect, it } from "vitest";
import {
  assessRetention,
  cleanupPhrase,
  estimateCleanup,
  keptPhrase,
  retentionAttention,
  type RetentionSourceInput,
} from "./retentionRisk";

const NOW = Date.parse("2026-10-09T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();
const unset = { periodDays: null, source: "unset" as const };

const source = (overrides: Partial<RetentionSourceInput> = {}): RetentionSourceInput => ({
  sessionId: "s",
  title: "t",
  modifiedAt: daysAgo(10),
  bytes: 1000,
  presence: "present",
  excerpts: 0,
  archive: null,
  imported: false,
  ...overrides,
});

describe("estimating when cleanup may reach a source", () => {
  it("assumes the default 30 days and says so when nothing is configured", () => {
    const estimate = estimateCleanup(daysAgo(10), unset, NOW);
    expect(estimate).toMatchObject({ state: "ok", basis: "default", periodDays: 30, daysLeft: 20 });
  });

  it("uses a configured period", () => {
    expect(estimateCleanup(daysAgo(10), { periodDays: 14, source: "user" }, NOW)).toMatchObject({ state: "approaching", basis: "configured", daysLeft: 4 });
  });

  it("says a source past the period may be eligible, never that it is deleted", () => {
    const estimate = estimateCleanup(daysAgo(31), unset, NOW);
    expect(estimate.state).toBe("mayBeEligible");
    expect(cleanupPhrase(estimate)).toBe("지금 정리 대상일 수 있음");
  });

  it("makes no estimate when the configured period cannot be read", () => {
    expect(estimateCleanup(daysAgo(40), { periodDays: null, source: "invalid" }, NOW)).toMatchObject({ state: "unknown" });
  });

  it("phrases even a distant estimate as a possibility", () => {
    expect(cleanupPhrase(estimateCleanup(daysAgo(10), unset, NOW))).toBe("약 20일 뒤 정리 대상일 수 있음");
  });

  it("does not guess without a file time", () => {
    expect(estimateCleanup(undefined, unset, NOW)).toMatchObject({ state: "unknown" });
    expect(estimateCleanup("not a date", unset, NOW)).toMatchObject({ state: "unknown" });
  });
});

describe("what deserves attention", () => {
  it("flags a present source near cleanup that Mori does not wholly keep", () => {
    const a = assessRetention(source({ modifiedAt: daysAgo(27), excerpts: 2 }), unset, NOW);
    expect(a).toMatchObject({ needsAttention: true, lost: false, archiveCurrent: false });
    expect(keptPhrase(a)).toBe("저장한 구절 2개");
  });

  it("is quiet for a source whose archive holds it as it is now", () => {
    const a = assessRetention(source({ modifiedAt: daysAgo(29), archive: { archivedAt: daysAgo(1), bytes: 1000 } }), unset, NOW);
    expect(a.needsAttention).toBe(false);
    expect(keptPhrase(a)).toBe("원본 보관됨");
  });

  it("still flags a source that grew after it was archived", () => {
    const a = assessRetention(source({ modifiedAt: daysAgo(29), bytes: 5000, archive: { archivedAt: daysAgo(5), bytes: 1000 } }), unset, NOW);
    expect(a.needsAttention).toBe(true);
    expect(keptPhrase(a)).toBe("보관 이후 대화 있음");
  });

  it("does not claim newer messages when the current size is unknown", () => {
    const a = assessRetention(source({ modifiedAt: daysAgo(29), bytes: undefined, archive: { archivedAt: daysAgo(1), bytes: 10 } }), unset, NOW);
    expect(a.archiveCurrent).toBe(true);
    expect(a.needsAttention).toBe(false);
  });

  it("is quiet for a source far from cleanup, however large", () => {
    expect(assessRetention(source({ modifiedAt: daysAgo(2), bytes: 200_000_000 }), unset, NOW).needsAttention).toBe(false);
  });

  it("says a gone source without an archive is lost, and what survives", () => {
    const a = assessRetention(source({ presence: "missing", imported: true, excerpts: 1 }), unset, NOW);
    expect(a).toMatchObject({ lost: true, needsAttention: false });
    expect(keptPhrase(a)).toBe("저장한 구절 1개 · 이전에 가져온 기록");
  });

  it("never flags a source whose presence is not known", () => {
    expect(assessRetention(source({ presence: "unknown", modifiedAt: daysAgo(40) }), unset, NOW).needsAttention).toBe(false);
  });

  it("orders attention by urgency", () => {
    const list = retentionAttention([
      assessRetention(source({ sessionId: "later", title: "b", modifiedAt: daysAgo(25) }), unset, NOW),
      assessRetention(source({ sessionId: "now", title: "a", modifiedAt: daysAgo(40) }), unset, NOW),
      assessRetention(source({ sessionId: "quiet", modifiedAt: daysAgo(1) }), unset, NOW),
    ]);
    expect(list.map((a) => a.sessionId)).toEqual(["now", "later"]);
  });

  it("says nothing is kept when nothing is", () => {
    expect(keptPhrase(assessRetention(source(), unset, NOW))).toBe("Mori에 남긴 것 없음");
  });
});
