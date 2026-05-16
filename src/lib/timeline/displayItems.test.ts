import { describe, expect, it } from "vitest";
import {
  describeBundleKind,
  describeBundleReason,
  sortDisplayItemsChronologically,
  type TimelineBundleKind,
  type TimelineBundleReasonCode,
  type TimelineDisplayItem,
} from "./displayItems";

const ALL_KINDS: TimelineBundleKind[] = [
  "sequence",
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
