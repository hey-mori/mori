import { describe, expect, it } from "vitest";
import {
  describeBundleKind,
  describeBundleReason,
  type TimelineBundleKind,
  type TimelineBundleReasonCode,
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
