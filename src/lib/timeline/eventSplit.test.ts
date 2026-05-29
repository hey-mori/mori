import { describe, expect, it } from "vitest";
import { mockSession } from "../../domain/mock-data";
import type { StoredSessionImport } from "../storage/storageTypes";
import type { TimelineEvent } from "../../domain/types";
import { canSplitEvent, splitEventAtMidpoint } from "./eventSplit";

// Mock events are instantaneous (no end), so build a ranged event to split.
const ranged: TimelineEvent = {
  ...mockSession.events[0]!,
  id: "evt-ranged",
  start: "2026-05-12T13:00:00+09:00",
  end: "2026-05-12T14:00:00+09:00",
};

function imports(events: TimelineEvent[]): StoredSessionImport[] {
  return [
    {
      id: "imp-1",
      sessionId: mockSession.session.id,
      source: mockSession.sources[0]!,
      events: events.map((event) => ({ ...event })),
      savedAt: "2026-05-18T11:00:00.000Z",
      adapter: "browser-local-storage",
    },
  ];
}

describe("canSplitEvent", () => {
  it("is true for an event with a real time range", () => {
    expect(canSplitEvent(ranged)).toBe(true);
  });

  it("is false for an instantaneous event with no end", () => {
    expect(canSplitEvent({ ...ranged, end: undefined })).toBe(false);
  });
});

describe("splitEventAtMidpoint", () => {
  it("cuts the event into two halves that meet at the midpoint", () => {
    const next = splitEventAtMidpoint(imports([ranged]), ranged.id);
    const events = next[0]!.events;

    expect(events).toHaveLength(2);
    const [first, second] = events;
    expect(first!.id).toBe(ranged.id);
    expect(first!.start).toBe(ranged.start);
    expect(first!.end).toBe(second!.start);
    expect(second!.end).toBe(ranged.end);
    expect(first!.userModified).toBe(true);
    expect(second!.userModified).toBe(true);
    // The second half carries no derived links — the user re-links it.
    expect(second!.linkedIssueIds).toEqual([]);
    expect(second!.relationshipIds).toEqual([]);
  });

  it("returns the same imports for an unsplittable or unknown event", () => {
    const flat = imports([{ ...ranged, end: undefined }]);
    expect(splitEventAtMidpoint(flat, ranged.id)).toBe(flat);
    const before = imports([ranged]);
    expect(splitEventAtMidpoint(before, "missing")).toBe(before);
  });
});
