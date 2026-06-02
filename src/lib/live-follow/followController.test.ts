import { describe, expect, it } from "vitest";
import {
  computeNewEventIds,
  decideFollowReaction,
  followReducer,
  initialFollowState,
  isActivelyFollowing,
  type FollowState,
} from "./followController";

function following(overrides: Partial<FollowState> = {}): FollowState {
  return {
    status: "following",
    sessionId: "sess-1",
    knownEventIds: [],
    pendingEventIds: [],
    lastPolledAt: null,
    lastError: null,
    ...overrides,
  };
}

describe("computeNewEventIds", () => {
  it("returns only ids absent from known, order-preserving and deduped", () => {
    expect(computeNewEventIds(["a", "b"], ["b", "c", "c", "d"])).toEqual(["c", "d"]);
    expect(computeNewEventIds(["a"], ["a"])).toEqual([]);
  });
});

describe("followReducer", () => {
  it("starts following and seeds known events so only later events are new", () => {
    const state = followReducer(initialFollowState(), {
      type: "start",
      sessionId: "sess-1",
      knownEventIds: ["e1", "e1", "e2"],
      at: "2026-06-02T00:00:00Z",
    });
    expect(state.status).toBe("following");
    expect(state.sessionId).toBe("sess-1");
    expect(state.knownEventIds).toEqual(["e1", "e2"]);
    expect(state.pendingEventIds).toEqual([]);
  });

  it("accumulates new events from a poll into known and pending", () => {
    let state = following({ knownEventIds: ["e1"] });
    state = followReducer(state, {
      type: "poll",
      incomingEventIds: ["e1", "e2", "e3"],
      at: "2026-06-02T00:01:00Z",
    });
    expect(state.knownEventIds).toEqual(["e1", "e2", "e3"]);
    expect(state.pendingEventIds).toEqual(["e2", "e3"]);
    expect(state.lastPolledAt).toBe("2026-06-02T00:01:00Z");
  });

  it("a poll with no new events only updates the timestamp", () => {
    let state = following({ knownEventIds: ["e1", "e2"], pendingEventIds: [] });
    state = followReducer(state, {
      type: "poll",
      incomingEventIds: ["e1", "e2"],
      at: "2026-06-02T00:02:00Z",
    });
    expect(state.pendingEventIds).toEqual([]);
    expect(state.lastPolledAt).toBe("2026-06-02T00:02:00Z");
  });

  it("ignores a poll when not actively following", () => {
    const paused = following({ status: "paused", knownEventIds: ["e1"] });
    const next = followReducer(paused, {
      type: "poll",
      incomingEventIds: ["e2"],
      at: "2026-06-02T00:03:00Z",
    });
    expect(next).toEqual(paused);
  });

  it("consumes pending events after a reaction", () => {
    const state = following({ pendingEventIds: ["e2", "e3"] });
    expect(followReducer(state, { type: "consumePending" }).pendingEventIds).toEqual([]);
  });

  it("pauses only from following and resumes only from paused", () => {
    const paused = followReducer(following(), { type: "pause" });
    expect(paused.status).toBe("paused");
    expect(followReducer(paused, { type: "resume" }).status).toBe("following");
    // resume from following is a no-op
    expect(followReducer(following(), { type: "resume" }).status).toBe("following");
  });

  it("records an error without leaving the following state", () => {
    const state = followReducer(following(), {
      type: "error",
      message: "connector unreadable",
      at: "2026-06-02T00:04:00Z",
    });
    expect(state.status).toBe("following");
    expect(state.lastError).toBe("connector unreadable");
  });

  it("stops, clearing pending work", () => {
    const state = followReducer(following({ pendingEventIds: ["e2"] }), { type: "stop" });
    expect(state.status).toBe("stopped");
    expect(state.pendingEventIds).toEqual([]);
    expect(isActivelyFollowing(state)).toBe(false);
  });
});

describe("decideFollowReaction", () => {
  it("reacts when following and at least minNewEvents are pending", () => {
    expect(decideFollowReaction(following({ pendingEventIds: ["e2"] }))).toEqual({
      shouldReanalyze: true,
      shouldNotify: true,
      newCount: 1,
    });
    expect(
      decideFollowReaction(following({ pendingEventIds: ["e2"] }), { minNewEvents: 2 }),
    ).toEqual({ shouldReanalyze: false, shouldNotify: false, newCount: 1 });
  });

  it("never reacts when not actively following", () => {
    const stopped = following({ status: "stopped", pendingEventIds: ["e2", "e3"] });
    expect(decideFollowReaction(stopped)).toEqual({
      shouldReanalyze: false,
      shouldNotify: false,
      newCount: 2,
    });
  });
});
