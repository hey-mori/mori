import { describe, expect, it, vi } from "vitest";
import { browserEvidenceToHistory, createBrowserEvidenceHistory } from "./browserEvidenceHistory";
import {
  browserEvidenceRepository,
  type BrowserEvidencePage,
  type BrowserEvidenceRow,
} from "./browserEvidenceRepository";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

export function evidenceRow(sequence = 1): BrowserEvidenceRow {
  return {
    sequence,
    deliveryId: `private-delivery-${sequence}`,
    kind: "navigation_committed",
    observedAt: "2026-09-12T01:02:03.004Z",
    receivedAt: "2026-09-12T01:02:04.005Z",
    data: {
      provider: "chrome",
      runtimeId: "runtime",
      tabId: "17",
      windowId: "2",
      url: "https://example.com/docs",
      active: true,
      focused: true,
      transitionType: "link",
      transitionQualifiers: ["forward_back"],
    },
  };
}
const cursor = { snapshotSequence: 300, observedAt: evidenceRow().observedAt, sequence: 200 };
const batch = (seq: number, more = true): BrowserEvidencePage => ({
  items: [evidenceRow(seq)],
  nextCursor: more ? cursor : null,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("Browser history projection and bridge", () => {
  it("projects observable fields with distinct canonical times and no delivery identity", () => {
    const item = browserEvidenceToHistory(evidenceRow());
    expect(item).toMatchObject({
      observedAt: evidenceRow().observedAt,
      receivedAt: evidenceRow().receivedAt,
      url: "https://example.com/docs",
      provider: "chrome",
      transitionType: "link",
    });
    expect(item).not.toHaveProperty("deliveryId");
    expect(item).not.toHaveProperty("data");
    expect(item).not.toHaveProperty("traceEvent");
  });
  it("reuses the URL privacy projection and supports URL-less activation", () => {
    const row = evidenceRow();
    row.data.url = "https://user:password@example.com/docs?secret=private#fragment";
    expect(browserEvidenceToHistory(row).url).toBe("https://example.com/docs");
    row.kind = "tab_activated";
    row.data.url = null;
    expect(browserEvidenceToHistory(row)).toMatchObject({ kind: "tab_activated", url: null });
  });
  it("propagates typed pages and cursors without changing recent callers", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(batch(250));
    expect(await browserEvidenceRepository.page(50, cursor)).toEqual(batch(250));
    expect(invoke).toHaveBeenLastCalledWith("list_browser_evidence_page", { limit: 50, cursor });
    vi.mocked(invoke).mockResolvedValueOnce([]);
    await browserEvidenceRepository.recent(200);
    expect(invoke).toHaveBeenLastCalledWith("list_recent_browser_evidence", { limit: 200 });
  });
});

describe("Browser history read session", () => {
  it("loads first, appends older, reaches end and refreshes a new snapshot", async () => {
    const page = vi
      .fn()
      .mockResolvedValueOnce(batch(250))
      .mockResolvedValueOnce(batch(150, false))
      .mockResolvedValueOnce(batch(301));
    const history = createBrowserEvidenceHistory({ page });
    const listener = vi.fn();
    const unsubscribe = history.subscribe(listener);
    const first = history.refresh();
    expect(history.getState().loading).toBe("first");
    await first;
    expect(history.getState().nextCursor).toEqual(cursor);
    const older = history.loadOlder();
    expect(history.getState().loading).toBe("older");
    await older;
    expect(page).toHaveBeenNthCalledWith(2, 50, cursor);
    expect(history.getState().items.map((item) => item.key)).toEqual(["250", "150"]);
    expect(history.getState().nextCursor).toBeNull();
    await history.loadOlder();
    expect(page).toHaveBeenCalledTimes(2);
    await history.refresh();
    expect(page).toHaveBeenLastCalledWith(50, null);
    expect(history.getState().items.map((item) => item.key)).toEqual(["301"]);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });
  it("preserves rows and cursor on older failure and retries that exact page", async () => {
    const page = vi
      .fn()
      .mockResolvedValueOnce(batch(250))
      .mockRejectedValueOnce(new Error("SQL private path"))
      .mockResolvedValueOnce(batch(150, false));
    const history = createBrowserEvidenceHistory({ page });
    await history.refresh();
    const before = history.getState();
    await history.loadOlder();
    expect(history.getState()).toMatchObject({
      items: before.items,
      nextCursor: before.nextCursor,
      error: "older",
      loading: null,
    });
    expect(JSON.stringify(history.getState())).not.toContain("private path");
    await history.retry();
    expect(page).toHaveBeenLastCalledWith(50, cursor);
    expect(history.getState().items).toHaveLength(2);
  });
  it("distinguishes first failure from empty and retains rows on failed refresh", async () => {
    const page = vi
      .fn()
      .mockRejectedValueOnce("private SQL")
      .mockResolvedValueOnce({ items: [], nextCursor: null })
      .mockResolvedValueOnce(batch(250))
      .mockRejectedValueOnce("failed")
      .mockResolvedValueOnce(batch(301));
    const history = createBrowserEvidenceHistory({ page });
    await history.refresh();
    expect(history.getState()).toMatchObject({ loaded: false, error: "first" });
    await history.retry();
    expect(history.getState()).toMatchObject({ loaded: true, error: null, items: [] });
    await history.refresh();
    await history.refresh();
    expect(history.getState().items[0].key).toBe("250");
    await history.loadOlder();
    expect(page).toHaveBeenCalledTimes(4);
    await history.retry();
    expect(page).toHaveBeenLastCalledWith(50, null);
    expect(history.getState().items[0].key).toBe("301");
  });
  it("ignores stale success or failure after refresh and coalesces older requests", async () => {
    for (const fail of [false, true]) {
      const pending = deferred<BrowserEvidencePage>();
      const page = vi
        .fn()
        .mockResolvedValueOnce(batch(250))
        .mockReturnValueOnce(pending.promise)
        .mockResolvedValueOnce(batch(301));
      const history = createBrowserEvidenceHistory({ page });
      await history.refresh();
      const older = history.loadOlder();
      await history.loadOlder();
      expect(page).toHaveBeenCalledTimes(2);
      await history.refresh();
      if (fail) pending.reject("stale error");
      else pending.resolve(batch(150));
      await older;
      expect(history.getState().items.map((item) => item.key)).toEqual(["301"]);
      expect(history.getState().error).toBeNull();
    }
  });
  it("bounds the view window while continuing the same snapshot through 650 rows", async () => {
    let offset = 0;
    const page = vi.fn(async (): Promise<BrowserEvidencePage> => {
      const items = Array.from({ length: 50 }, (_, i) => evidenceRow(650 - offset - i));
      offset += 50;
      return {
        items,
        nextCursor:
          offset === 650 ? null : { ...cursor, snapshotSequence: 650, sequence: 651 - offset },
      };
    });
    const history = createBrowserEvidenceHistory({ page });
    await history.refresh();
    for (let i = 1; i < 13; i++) await history.loadOlder();
    expect(history.getState().items).toHaveLength(500);
    expect(history.getState().omitted).toBe(150);
    expect(history.getState().items.at(-1)?.key).toBe("1");
    expect(history.getState().nextCursor).toBeNull();
  });
});
