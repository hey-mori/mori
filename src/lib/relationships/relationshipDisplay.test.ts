import { describe, expect, it } from "vitest";
import {
  describeRelationshipConfidence,
  describeTrustLevel,
  getRelationshipDisplay,
} from "./relationshipDisplay";

describe("getRelationshipDisplay", () => {
  it("returns a label and tone for known relationship types", () => {
    expect(getRelationshipDisplay("createdIssue").label).toBe("Created issue");
    expect(getRelationshipDisplay("influencedDecision").tone).toBe("purple");
  });

  it("falls back to the raw type for unknown values", () => {
    const display = getRelationshipDisplay("unknownType" as never);
    expect(display.label).toBe("unknownType");
    expect(display.tone).toBe("gray");
  });
});

describe("describeRelationshipConfidence", () => {
  it("maps confidence ranges to tones", () => {
    expect(describeRelationshipConfidence(0.9).tone).toBe("green");
    expect(describeRelationshipConfidence(0.7).tone).toBe("blue");
    expect(describeRelationshipConfidence(0.5).tone).toBe("orange");
    expect(describeRelationshipConfidence(0.2).tone).toBe("red");
  });

  it("clamps invalid values", () => {
    expect(describeRelationshipConfidence(2).label).toBe("100% confidence");
    expect(describeRelationshipConfidence(-1).label).toBe("0% confidence");
    expect(describeRelationshipConfidence(Number.NaN).tone).toBe("gray");
  });
});

describe("describeTrustLevel", () => {
  it("returns tone metadata for each trust level", () => {
    expect(describeTrustLevel("verified").tone).toBe("green");
    expect(describeTrustLevel("observed").tone).toBe("blue");
    expect(describeTrustLevel("inferred").tone).toBe("purple");
  });
});
