import { describe, expect, it } from "vitest";

import type { TimelineEvent } from "../../domain/types";
import { buildLabColumns } from "./labColumns";

function event(
  id: string,
  start: string,
  opts: Partial<TimelineEvent> = {},
): TimelineEvent {
  return {
    id,
    sessionId: "s",
    projectId: "p",
    start,
    type: "aiConversation",
    title: id,
    summary: "",
    sourceRefs: [],
    linkedIssueIds: [],
    linkedDecisionIds: [],
    relationshipIds: [],
    trustLevel: "observed",
    confidence: 0.9,
    createdBy: "import",
    userModified: false,
    ...opts,
  };
}

describe("buildLabColumns", () => {
  it("groups events into one column per user request", () => {
    const events = [
      event("u1", "2026-01-01T00:00:00Z", { openedByUser: true, turnId: "t1", title: "첫 요청" }),
      event("a1", "2026-01-01T00:00:01Z", { actor: "assistant" }),
      event("u2", "2026-01-01T00:00:02Z", { openedByUser: true, turnId: "t2", title: "둘째 요청" }),
      event("a2", "2026-01-01T00:00:03Z", { actor: "assistant" }),
    ];
    const columns = buildLabColumns(events);
    expect(columns.map((c) => c.title)).toEqual(["첫 요청", "둘째 요청"]);
    expect(columns[0].events.map((e) => e.id)).toEqual(["u1", "a1"]);
    expect(columns[1].events.map((e) => e.id)).toEqual(["u2", "a2"]);
    expect(columns.every((c) => c.kind === "request")).toBe(true);
  });

  it("prepends an orphan column for events before the first request", () => {
    const events = [
      event("tr0", "2026-01-01T00:00:00Z", { actor: "tool" }),
      event("u1", "2026-01-01T00:00:01Z", { openedByUser: true, turnId: "t1", title: "요청" }),
      event("a1", "2026-01-01T00:00:02Z", { actor: "assistant" }),
    ];
    const columns = buildLabColumns(events);
    expect(columns).toHaveLength(2);
    expect(columns[0].kind).toBe("orphan");
    expect(columns[0].events.map((e) => e.id)).toEqual(["tr0"]);
    expect(columns[1].kind).toBe("request");
    expect(columns[1].events.map((e) => e.id)).toEqual(["u1", "a1"]);
  });

  it("returns no columns for a flat session with no request boundaries", () => {
    const events = [
      event("a1", "2026-01-01T00:00:00Z", { actor: "assistant" }),
      event("a2", "2026-01-01T00:00:01Z", { actor: "assistant" }),
    ];
    // No openedByUser marker anywhere: buildRequestSpans yields nothing, and
    // every event is an orphan, so the lab still shows them (nothing dropped).
    const columns = buildLabColumns(events);
    expect(columns).toHaveLength(1);
    expect(columns[0].kind).toBe("orphan");
    expect(columns[0].events).toHaveLength(2);
  });
});
