import { describe, expect, it } from "vitest";
import type { StoredSessionSummary } from "../../lib/storage/storageTypes";
import { sessionFeedFor } from "./useNotifications";

const asIs = (title: string) => title;

describe("sessionFeedFor", () => {
  it("raises nothing on a fresh install, where only demo sessions are shown", () => {
    expect(sessionFeedFor([], asIs)).toEqual([]);
  });

  it("raises one feed item per stored session of the user's own", () => {
    const summary: StoredSessionSummary = {
      sessionId: "s1",
      projectId: "p1",
      title: "Checkout speed",
      projectName: "shop",
      savedAt: "2026-11-04T05:00:00Z",
      startedAt: "2026-11-04T04:00:00Z",
      status: "complete",
    };
    const feed = sessionFeedFor([summary], asIs);
    expect(feed).toHaveLength(1);
    expect(feed[0]?.id).toBe("feed:s1:captured");
  });
});
