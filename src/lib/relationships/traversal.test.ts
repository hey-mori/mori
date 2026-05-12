import { describe, expect, it } from "vitest";
import { moriMockSession } from "../../domain/mock-data";
import { getFocusedEntitySet, getRelationshipsForEntity } from "./traversal";

describe("relationship traversal", () => {
  it("finds direct relationships for Flow Focus", () => {
    const focused = getFocusedEntitySet("evt-positioning", moriMockSession.relationships, 1);

    expect(focused.has("evt-positioning")).toBe(true);
    expect(focused.has("evt-competitor-research")).toBe(true);
    expect(focused.has("evt-start-flow")).toBe(true);
  });

  it("returns relationships connected to a selected event", () => {
    const relationships = getRelationshipsForEntity("evt-start-flow", moriMockSession.relationships);

    expect(relationships.length).toBeGreaterThan(0);
    expect(relationships.some((relationship) => relationship.type === "influencedDecision")).toBe(true);
  });
});
