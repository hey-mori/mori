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

  it("builds the fallback notice on its own, with no quota failure", () => {
    const feed = buildStorageHealthNotifications(null, {
      scope: "kernel",
      reason: "database is locked",
      at: "2026-08-18T09:00:00.000Z",
    });

    expect(feed).toHaveLength(1);
    const notice = feed[0];
    expect(notice.id).toBe("storage-fallback");
    expect(notice.severity).toBe("risk");
    expect(notice.createdAt).toBe("2026-08-18T09:00:00.000Z");
    // The user is told where their records went, not which engine failed.
    expect(notice.message).not.toContain("SQLite");
  });

  it("surfaces both notices at once, since they are different moments", () => {
    const feed = buildStorageHealthNotifications(
      { key: "mori.kernel.record.abc", at: "2026-08-18T09:05:00.000Z" },
      { scope: "kernel", reason: "database is locked", at: "2026-08-18T09:00:00.000Z" },
    );

    // Reporting only the full store would say the store filled without saying
    // why it filled, which is the thing the user can act on.
    expect(feed.map((notice) => notice.id).sort()).toEqual(["storage-fallback", "storage-quota"]);
  });

  it("keeps a stable id across fallbacks, so a broken path is one notice", () => {
    const a = buildStorageHealthNotifications(null, {
      scope: "kernel",
      reason: "database is locked",
      at: "2026-08-18T09:00:00.000Z",
    })[0];
    const b = buildStorageHealthNotifications(null, {
      scope: "kernel",
      reason: "disk I/O error",
      at: "2026-08-18T09:00:01.000Z",
    })[0];
    // Every call falls back on a broken device; one notice, not thousands.
    expect(a.id).toBe(b.id);
  });

  it("builds a review notice when the read flip was held back", () => {
    const feed = buildStorageHealthNotifications(null, null, {
      reason: "SQLite is missing documents localStorage holds",
      missingKeys: 3,
      at: "2026-08-18T11:00:00.000Z",
    });

    expect(feed).toHaveLength(1);
    const notice = feed[0];
    expect(notice.id).toBe("storage-read-flip-held-back");
    // Review, not risk: nothing is lost and reads stayed where they were. It
    // matters because R7 must not ship on top of a gap, not because the user is
    // in trouble today.
    expect(notice.severity).toBe("review");
    expect(notice.message).toContain("3");
    expect(notice.message).not.toContain("SQLite");
  });

  it("says something honest when it could not read the new store at all", () => {
    const feed = buildStorageHealthNotifications(null, null, {
      reason: "database is locked",
      missingKeys: 0,
      at: "2026-08-18T11:00:00.000Z",
    });

    // Zero missing is not "nothing to do": it means the count is unknown
    // because the store could not be read, so the copy must not claim a number.
    expect(feed[0].message).not.toContain("0개");
  });

  it("surfaces all three storage notices at once", () => {
    const feed = buildStorageHealthNotifications(
      { key: "k", at: "2026-08-18T11:02:00.000Z" },
      { scope: "kernel", reason: "locked", at: "2026-08-18T11:01:00.000Z" },
      { reason: "missing", missingKeys: 1, at: "2026-08-18T11:00:00.000Z" },
    );

    expect(feed.map((notice) => notice.id).sort()).toEqual([
      "storage-fallback",
      "storage-quota",
      "storage-read-flip-held-back",
    ]);
  });

  it("keeps a stable id across different failure timestamps", () => {
    const a = buildStorageHealthNotifications({ key: "k", at: "2026-07-12T08:00:00.000Z" })[0];
    const b = buildStorageHealthNotifications({ key: "k", at: "2026-07-12T08:05:00.000Z" })[0];
    // Same id so the feed dedupes to one row and never re-pings per failure.
    expect(a.id).toBe(b.id);
  });
});
