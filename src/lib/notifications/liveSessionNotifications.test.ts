import { describe, expect, it } from "vitest";

import { isOsEligibleKind } from "./osNotification";
import { buildLiveCompletionNotification } from "./liveSessionNotifications";

describe("buildLiveCompletionNotification", () => {
  const base = {
    requestId: "req-1",
    requestTitle: "게이트웨이 라우팅 정리",
    stepCount: 7,
    hasError: false,
    sessionId: "/home/x/.claude/projects/ng-gw/abc.jsonl",
    sessionTitle: "ng-gw",
    projectLabel: "ng-gw",
    at: "2026-07-12T04:00:00.000Z",
  };

  it("keys the id to the request so a re-render never doubles a completion", () => {
    const a = buildLiveCompletionNotification(base);
    const b = buildLiveCompletionNotification({ ...base, at: "2026-07-12T05:00:00.000Z" });
    expect(a.id).toBe("live-session-done-req-1");
    expect(b.id).toBe(a.id);
  });

  it("is an OS-eligible kind that deep-links back to the live view", () => {
    const notification = buildLiveCompletionNotification(base);
    expect(isOsEligibleKind(notification.kind)).toBe(true);
    expect(notification.actionTarget).toEqual({ kind: "view", view: "liveSession" });
    expect(notification.createdAt).toBe(base.at);
    expect(notification.message).toContain("게이트웨이 라우팅 정리");
    expect(notification.message).toContain("7단계");
  });

  it("flags an error run and raises its severity, without leaking step text", () => {
    const clean = buildLiveCompletionNotification(base);
    const failed = buildLiveCompletionNotification({ ...base, hasError: true });
    expect(clean.severity).toBe("info");
    expect(clean.title).toBe("작업 완료");
    expect(failed.severity).toBe("review");
    expect(failed.title).toContain("오류");
  });

  it("omits the step suffix when nothing ran", () => {
    const notification = buildLiveCompletionNotification({ ...base, stepCount: 0 });
    expect(notification.message).toBe("게이트웨이 라우팅 정리");
  });
});
