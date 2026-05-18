import { describe, expect, it } from "vitest";
import { moriMockSession } from "../../domain/mock-data";
import type { StoredSessionImport } from "../storage/storageTypes";
import { applyEventEdits } from "./eventEdits";

function imports(): StoredSessionImport[] {
  return [
    {
      id: "imp-1",
      sessionId: moriMockSession.session.id,
      source: moriMockSession.sources[0]!,
      events: moriMockSession.events.slice(0, 3).map((event) => ({ ...event })),
      savedAt: "2026-05-18T11:00:00.000Z",
      adapter: "browser-local-storage",
    },
  ];
}

const eventId = moriMockSession.events[0]!.id;

describe("applyEventEdits", () => {
  it("applies a trimmed title / summary and stamps userModified", () => {
    const next = applyEventEdits(imports(), eventId, {
      title: "  새 제목  ",
      summary: "새 요약",
    });

    const event = next[0]!.events.find((e) => e.id === eventId)!;
    expect(event.title).toBe("새 제목");
    expect(event.summary).toBe("새 요약");
    expect(event.userModified).toBe(true);
  });

  it("leaves other events in the import untouched", () => {
    const before = imports();
    const next = applyEventEdits(before, eventId, { title: "바뀐 제목" });
    expect(next[0]!.events[1]).toBe(before[0]!.events[1]);
  });

  it("returns the same imports on a blank or unchanged edit", () => {
    const before = imports();
    expect(applyEventEdits(before, eventId, { title: "   " })).toBe(before);
    const current = before[0]!.events[0]!;
    expect(
      applyEventEdits(before, eventId, { title: current.title, summary: current.summary }),
    ).toBe(before);
  });

  it("returns the same imports when the event id is unknown", () => {
    const before = imports();
    expect(applyEventEdits(before, "missing-event", { title: "x" })).toBe(before);
  });
});
