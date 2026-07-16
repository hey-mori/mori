import { describe, expect, it } from "vitest";
import { buildSessionSyncNotification } from "./sessionSyncNotifications";

describe("buildSessionSyncNotification", () => {
  const at = "2026-07-15T10:00:00.000Z";

  it("returns null when nothing was imported", () => {
    expect(buildSessionSyncNotification({ newCount: 0, updatedCount: 0, at })).toBeNull();
  });

  it("leads with the new count and carries a stable batch id + createdAt", () => {
    const n = buildSessionSyncNotification({ newCount: 3, updatedCount: 2, at });
    expect(n).not.toBeNull();
    expect(n!.id).toBe(`sessions-imported:${at}`);
    expect(n!.createdAt).toBe(at);
    expect(n!.kind).toBe("import_finished");
    expect(n!.title).toBe("새 세션 3건 수집");
    // The body describes the collection, it never restates the title's count.
    expect(n!.message).toContain("이어서 진행된 세션 2건");
    expect(n!.actionTarget).toEqual({ kind: "view", view: "sessions" });
  });

  it("words an update-only pass without a new count", () => {
    const n = buildSessionSyncNotification({ newCount: 0, updatedCount: 4, at });
    expect(n!.title).toBe("세션 4건 업데이트");
    expect(n!.message).toBe("이어서 진행된 작업을 세션 목록에 반영했습니다.");
  });
});
