import { describe, expect, it } from "vitest";
import { buildFollowNotification } from "./followNotifications";

describe("buildFollowNotification", () => {
  it("emits a feed notification when a followed session grows", () => {
    const notification = buildFollowNotification({
      shouldNotify: true,
      newCount: 3,
      sessionId: "sess-live",
      sessionTitle: "인증 리팩터링",
      projectLabel: "mori",
      at: "2026-06-02T00:05:00Z",
    });
    expect(notification).not.toBeNull();
    expect(notification?.kind).toBe("live_follow_update");
    expect(notification?.message).toContain("3");
    expect(notification?.actionTarget).toEqual({ kind: "session", sessionId: "sess-live" });
    expect(notification?.createdAt).toBe("2026-06-02T00:05:00Z");
    // No raw event text leaks into the notification.
    expect(notification?.evidenceRefs).toEqual([]);
  });

  it("returns null when no reaction fired or there are no new events", () => {
    const base = { sessionId: "s", at: "2026-06-02T00:00:00Z" };
    expect(buildFollowNotification({ ...base, shouldNotify: false, newCount: 2 })).toBeNull();
    expect(buildFollowNotification({ ...base, shouldNotify: true, newCount: 0 })).toBeNull();
  });
});
