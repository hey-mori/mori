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
    expect(n!.title).toBe("세션 3건 새로 수집");
    expect(n!.message).toBe("새 세션 3건 · 업데이트 2건");
    expect(n!.actionTarget).toEqual({ kind: "view", view: "sessions" });
  });

  it("words an update-only pass without a new count", () => {
    const n = buildSessionSyncNotification({ newCount: 0, updatedCount: 4, at });
    expect(n!.title).toBe("세션 4건 업데이트");
    expect(n!.message).toBe("업데이트 4건");
  });
});
