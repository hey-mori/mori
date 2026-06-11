import { describe, expect, it } from "vitest";
import {
  BACKGROUND_WATCH_KEY,
  loadBackgroundWatchSettings,
  saveBackgroundWatchSettings,
} from "./backgroundWatchSettings";
import { detectInboxChanges, fingerprintInbox } from "./inboxWatch";

function memoryStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    raw: store,
  };
}

describe("background watch settings", () => {
  it("defaults to off, and reads an explicit opt-in", () => {
    expect(loadBackgroundWatchSettings(memoryStorage())).toEqual({
      enabled: false,
      autoAnalyze: false,
    });
    const on = memoryStorage({
      [BACKGROUND_WATCH_KEY]: JSON.stringify({ enabled: true, autoAnalyze: true }),
    });
    expect(loadBackgroundWatchSettings(on)).toEqual({ enabled: true, autoAnalyze: true });
  });

  it("never lets autoAnalyze be on while watching is off", () => {
    const storage = memoryStorage();
    saveBackgroundWatchSettings({ enabled: false, autoAnalyze: true }, storage);
    expect(loadBackgroundWatchSettings(storage)).toEqual({ enabled: false, autoAnalyze: false });
  });

  it("treats a malformed value as off", () => {
    const storage = memoryStorage({ [BACKGROUND_WATCH_KEY]: "{not json" });
    expect(loadBackgroundWatchSettings(storage)).toEqual({ enabled: false, autoAnalyze: false });
  });

  it("round-trips a saved opt-in", () => {
    const storage = memoryStorage();
    saveBackgroundWatchSettings({ enabled: true, autoAnalyze: false }, storage);
    expect(loadBackgroundWatchSettings(storage)).toEqual({ enabled: true, autoAnalyze: false });
  });
});

describe("detectInboxChanges", () => {
  const file = (path: string, modifiedAt: string, sizeBytes: number) => ({
    path,
    modifiedAt,
    sizeBytes,
  });

  it("reports nothing on the first reading (establishes a baseline)", () => {
    const current = fingerprintInbox([file("a.jsonl", "t1", 100)]);
    expect(detectInboxChanges(null, current)).toEqual([]);
  });

  it("flags a newly-arrived file as new", () => {
    const prev = fingerprintInbox([file("a.jsonl", "t1", 100)]);
    const current = fingerprintInbox([file("a.jsonl", "t1", 100), file("b.jsonl", "t2", 50)]);
    expect(detectInboxChanges(prev, current)).toEqual([{ path: "b.jsonl", kind: "new" }]);
  });

  it("flags a file that grew or changed mtime as updated", () => {
    const prev = fingerprintInbox([file("a.jsonl", "t1", 100)]);
    const grown = fingerprintInbox([file("a.jsonl", "t1", 180)]);
    expect(detectInboxChanges(prev, grown)).toEqual([{ path: "a.jsonl", kind: "updated" }]);
    const retimed = fingerprintInbox([file("a.jsonl", "t2", 100)]);
    expect(detectInboxChanges(prev, retimed)).toEqual([{ path: "a.jsonl", kind: "updated" }]);
  });

  it("stays silent for an unchanged inbox and ignores deletions", () => {
    const prev = fingerprintInbox([file("a.jsonl", "t1", 100), file("b.jsonl", "t2", 50)]);
    const current = fingerprintInbox([file("a.jsonl", "t1", 100)]);
    expect(detectInboxChanges(prev, current)).toEqual([]);
  });
});
