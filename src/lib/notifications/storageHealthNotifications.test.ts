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
    // Stable id · repeated failures update one notice instead of piling up.
    expect(notice.id).toBe("storage-quota");
    expect(notice.kind).toBe("storage_write_failure");
    expect(notice.severity).toBe("risk");
    expect(notice.basis).toBe("state");
    expect(notice.evidenceRefs).toEqual([]);
    expect(notice.actionTarget).toEqual({ kind: "view", view: "settings" });
    expect(notice.createdAt).toBe("2026-07-12T08:00:00.000Z");
    // Honest copy: it is the app store, not the disk, so disk free space is
    // called out as irrelevant.
    expect(notice.title).toContain("저장 공간");
    expect(notice.message).toContain("디스크");
  });

  it("keeps a stable id across different failure timestamps", () => {
    const a = buildStorageHealthNotifications({ key: "k", at: "2026-07-12T08:00:00.000Z" })[0];
    const b = buildStorageHealthNotifications({ key: "k", at: "2026-07-12T08:05:00.000Z" })[0];
    // Same id so the feed dedupes to one row and never re-pings per failure.
    expect(a.id).toBe(b.id);
  });
});
