import { describe, expect, it } from "vitest";
import { buildStorageHealthNotifications } from "./storageHealthNotifications";

describe("buildStorageHealthNotifications", () => {
  it("returns an empty feed with no failure", () => {
    expect(buildStorageHealthNotifications(null)).toEqual([]);
  });

  it("builds one risk notification from the latest quota failure", () => {
    const feed = buildStorageHealthNotifications({
      key: "mori.sessionDraft.s-1",
      at: "2026-07-12T08:00:00.000Z",
    });

    expect(feed).toHaveLength(1);
    const notice = feed[0];
    expect(notice.id).toBe("storage-quota:2026-07-12T08:00:00.000Z");
    expect(notice.kind).toBe("storage_write_failure");
    expect(notice.severity).toBe("risk");
    expect(notice.basis).toBe("state");
    expect(notice.evidenceRefs).toEqual([]);
    expect(notice.actionTarget).toEqual({ kind: "view", view: "settings" });
    expect(notice.createdAt).toBe("2026-07-12T08:00:00.000Z");
    // Honest copy: the failure is stated, not softened into a suggestion.
    expect(notice.title).toContain("저장 공간");
    expect(notice.message).toContain("저장이 완료되지 않았습니다");
  });
});
