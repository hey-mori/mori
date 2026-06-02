import { describe, expect, it } from "vitest";
import { selectNewFollowEventIds } from "./followSource";

// Identities are `connectorId::externalSession::eventId`.
const A1 = "claude-code::sess-A::e1";
const A2 = "claude-code::sess-A::e2";
const A3 = "claude-code::sess-A::e3";
const B1 = "claude-code::sess-B::e1";

describe("selectNewFollowEventIds", () => {
  it("returns candidates sharing the session's source key that are not yet known", () => {
    expect(selectNewFollowEventIds([A1], [A1, A2, A3])).toEqual([A2, A3]);
  });

  it("excludes events from a different session even on the same connector", () => {
    expect(selectNewFollowEventIds([A1], [A2, B1])).toEqual([A2]);
  });

  it("dedupes repeated candidate ids", () => {
    expect(selectNewFollowEventIds([A1], [A2, A2])).toEqual([A2]);
  });

  it("returns nothing when the session has no known connector identities", () => {
    expect(selectNewFollowEventIds([], [A1, A2])).toEqual([]);
  });

  it("ignores malformed identities on both sides", () => {
    expect(selectNewFollowEventIds(["not-an-identity"], [A1])).toEqual([]);
    expect(selectNewFollowEventIds([A1], ["bad", A2])).toEqual([A2]);
  });
});
