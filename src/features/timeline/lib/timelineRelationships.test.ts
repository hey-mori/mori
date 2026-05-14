import { describe, expect, it } from "vitest";
import { moriMockSession } from "../../../domain/mock-data";
import type { Relationship } from "../../../domain/types";
import { buildTimelineRelationshipViewModels } from "./timelineRelationships";

describe("buildTimelineRelationshipViewModels", () => {
  it("returns one entry per relationship touching the selected event", () => {
    const target = moriMockSession.events[0]!;
    const sibling = moriMockSession.events[1]!;
    const rel: Relationship = {
      id: "rel-test-1",
      fromId: target.id,
      fromType: "event",
      toId: sibling.id,
      toType: "event",
      type: "ledTo",
      confidence: 0.9,
      reason: "test",
    };
    const list = buildTimelineRelationshipViewModels({
      selectedEvent: target,
      relationships: [rel],
    });
    expect(list).toHaveLength(1);
    expect(list[0]!.relationship.id).toBe("rel-test-1");
    expect(list[0]!.label).toBe("Led to");
  });

  it("marks the relationship as focused when the other endpoint is in the focus set", () => {
    const target = moriMockSession.events[0]!;
    const other = "evt-other";
    const rel: Relationship = {
      id: "rel-test-2",
      fromId: target.id,
      fromType: "event",
      toId: other,
      toType: "event",
      type: "caused",
      confidence: 0.7,
      reason: "test",
    };
    const list = buildTimelineRelationshipViewModels({
      selectedEvent: target,
      relationships: [rel],
      focusedSet: new Set([other]),
    });
    expect(list[0]!.focused).toBe(true);
  });

  it("returns an empty list when no relationships touch the selected event", () => {
    const target = moriMockSession.events[0]!;
    const unrelated: Relationship = {
      id: "rel-unrelated",
      fromId: "x",
      fromType: "event",
      toId: "y",
      toType: "event",
      type: "ledTo",
      confidence: 0.5,
      reason: "test",
    };
    const list = buildTimelineRelationshipViewModels({
      selectedEvent: target,
      relationships: [unrelated],
    });
    expect(list).toEqual([]);
  });
});
