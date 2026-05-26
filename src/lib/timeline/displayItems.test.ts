import { describe, expect, it } from "vitest";
import {
  buildBundleDensityProfile,
  describeBundleKind,
  describeBundleReason,
  sortDisplayItemsChronologically,
  type TimelineBundleKind,
  type TimelineBundleMember,
  type TimelineBundleReasonCode,
  type TimelineDisplayBundle,
  type TimelineDisplayItem,
} from "./displayItems";

const ALL_KINDS: TimelineBundleKind[] = [
  "sequence",
  "conversationBurst",
  "decisionBurst",
  "issueBurst",
  "researchBurst",
  "codeBurst",
  "evidenceBurst",
  "workflowBurst",
];

const ALL_REASONS: TimelineBundleReasonCode[] = [
  "laneDensity",
  "timeWindow",
  "microSequence",
  "preserveSingleRow",
];

describe("describeBundleKind", () => {
  it("gives every bundle kind a non-empty Korean label, never the raw enum", () => {
    for (const kind of ALL_KINDS) {
      const label = describeBundleKind(kind);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(kind);
      expect(/[a-zA-Z]/.test(label)).toBe(false);
    }
  });
});

describe("describeBundleReason", () => {
  it("gives every reason code a non-empty Korean label", () => {
    for (const code of ALL_REASONS) {
      const label = describeBundleReason(code);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(code);
    }
  });
});

describe("buildBundleDensityProfile", () => {
  function member(start: string): TimelineBundleMember {
    return {
      eventId: `evt-${start}`,
      type: "aiConversation",
      title: "member",
      start,
      trustLevel: "observed",
      sourceCount: 0,
      decisionCount: 0,
      issueCount: 0,
      artifactCount: 0,
    };
  }

  function bundle(
    start: string,
    end: string,
    members: TimelineBundleMember[],
  ): Pick<TimelineDisplayBundle, "start" | "end" | "members"> {
    return { start, end, members };
  }

  it("returns a zeroed profile of the requested length when there are no members", () => {
    const profile = buildBundleDensityProfile(
      bundle("2026-05-22T09:00:00Z", "2026-05-22T09:30:00Z", []),
      7,
    );
    expect(profile).toHaveLength(7);
    expect(profile.every((value) => value === 0)).toBe(true);
  });

  it("normalizes the busiest segment to 1", () => {
    const profile = buildBundleDensityProfile(
      bundle("2026-05-22T09:00:00Z", "2026-05-22T09:40:00Z", [
        member("2026-05-22T09:01:00Z"),
        member("2026-05-22T09:02:00Z"),
        member("2026-05-22T09:21:00Z"),
      ]),
      4,
    );
    expect(profile).toHaveLength(4);
    expect(Math.max(...profile)).toBe(1);
    expect(profile[0]).toBe(1);
    expect(profile[2]).toBeGreaterThan(0);
    expect(profile[2]).toBeLessThan(1);
  });

  it("leans left when the whole burst clusters at the start", () => {
    const profile = buildBundleDensityProfile(
      bundle("2026-05-22T09:00:00Z", "2026-05-22T10:00:00Z", [
        member("2026-05-22T09:00:30Z"),
        member("2026-05-22T09:01:00Z"),
      ]),
      6,
    );
    expect(profile[0]).toBe(1);
    expect(profile.slice(1).every((value) => value === 0)).toBe(true);
  });

  it("collapses an instantaneous cluster to a single full bar", () => {
    const profile = buildBundleDensityProfile(
      bundle("2026-05-22T09:00:00Z", "2026-05-22T09:00:00Z", [
        member("2026-05-22T09:00:00Z"),
        member("2026-05-22T09:00:00Z"),
      ]),
      5,
    );
    expect(profile).toEqual([1, 0, 0, 0, 0]);
  });

  it("clamps a member at the end boundary into the last segment", () => {
    const profile = buildBundleDensityProfile(
      bundle("2026-05-22T09:00:00Z", "2026-05-22T09:10:00Z", [
        member("2026-05-22T09:10:00Z"),
      ]),
      5,
    );
    expect(profile[4]).toBe(1);
    expect(profile.slice(0, 4).every((value) => value === 0)).toBe(true);
  });
});

describe("sortDisplayItemsChronologically", () => {
  function item(id: string, start: string): TimelineDisplayItem {
    return { id, start } as unknown as TimelineDisplayItem;
  }

  it("orders items by start time regardless of input order", () => {
    const sorted = sortDisplayItemsChronologically([
      item("c", "2026-06-01T14:00:00Z"),
      item("a", "2026-06-01T09:00:00Z"),
      item("b", "2026-06-01T11:30:00Z"),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      item("c", "2026-06-01T14:00:00Z"),
      item("a", "2026-06-01T09:00:00Z"),
    ];
    sortDisplayItemsChronologically(input);
    expect(input.map((entry) => entry.id)).toEqual(["c", "a"]);
  });
});
