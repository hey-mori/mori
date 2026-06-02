import { describe, expect, it, vi } from "vitest";
import { runFollowPoll } from "./followDriver";
import type { FollowReaction } from "./followController";

const A1 = "claude-code::sess-A::e1";
const A2 = "claude-code::sess-A::e2";
const B1 = "claude-code::sess-B::e1";

const reaction = (over: Partial<FollowReaction> = {}): FollowReaction => ({
  shouldReanalyze: true,
  shouldNotify: true,
  newCount: 1,
  ...over,
});

describe("runFollowPoll", () => {
  it("imports only the genuinely-new same-session events and polls with the full set", async () => {
    const importEvents = vi.fn();
    const applyPoll = vi.fn(() => reaction());
    const outcome = await runFollowPoll({
      knownIds: [A1],
      read: async () => [{ id: A1 }, { id: A2 }, { id: B1 }],
      importEvents,
      applyPoll,
      at: "2026-06-02T00:01:00Z",
    });

    // Only A2 is new + same-session (B1 belongs to another session).
    expect(importEvents).toHaveBeenCalledWith([{ id: A2 }]);
    expect(applyPoll).toHaveBeenCalledWith([A1, A2], "2026-06-02T00:01:00Z");
    expect(outcome.importedCount).toBe(1);
    expect(outcome.reaction.shouldNotify).toBe(true);
  });

  it("does not import when there are no new events, but still polls", async () => {
    const importEvents = vi.fn();
    const applyPoll = vi.fn(() => reaction({ shouldReanalyze: false, shouldNotify: false, newCount: 0 }));
    const outcome = await runFollowPoll({
      knownIds: [A1],
      read: async () => [{ id: A1 }],
      importEvents,
      applyPoll,
      at: "2026-06-02T00:02:00Z",
    });

    expect(importEvents).not.toHaveBeenCalled();
    expect(applyPoll).toHaveBeenCalledWith([A1], "2026-06-02T00:02:00Z");
    expect(outcome.importedCount).toBe(0);
  });

  it("propagates a read failure to the caller", async () => {
    await expect(
      runFollowPoll({
        knownIds: [A1],
        read: async () => {
          throw new Error("inbox unreadable");
        },
        importEvents: vi.fn(),
        applyPoll: vi.fn(() => reaction()),
        at: "2026-06-02T00:03:00Z",
      }),
    ).rejects.toThrow("inbox unreadable");
  });
});
