import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryKeyValueStorage } from "../storage/memoryStorage";
import { isStorageQuotaError, setQuotaFailureObserver } from "../storage/storageQuota";
import type { KeyValueStorage } from "../storage/storageTypes";
import { IntakeBrowserStore } from "./intakeStore";
import { INTAKE_ROW_VERSION, type IntakeRequestRow } from "./intakeTypes";

afterEach(() => {
  setQuotaFailureObserver(null);
});

function row(partial: Partial<IntakeRequestRow> & { id: string }): IntakeRequestRow {
  return {
    schemaVersion: INTAKE_ROW_VERSION,
    sessionKey: "/s/a.jsonl",
    sessionLabel: "mori",
    title: "an ask",
    titleTruncated: false,
    startedAt: "2026-08-06T10:00:00.000Z",
    endedAt: "2026-08-06T10:05:00.000Z",
    stepCount: 3,
    tools: ["Edit"],
    files: [],
    hasError: false,
    status: "completed",
    locator: { path: "/s/a.jsonl", offset: 0 },
    observedAt: "2026-08-06T10:05:00.000Z",
    ...partial,
  };
}

describe("IntakeBrowserStore", () => {
  it("round-trips a session's rows", () => {
    const store = new IntakeBrowserStore(new MemoryKeyValueStorage());
    store.saveSessionRows("/s/a.jsonl", [row({ id: "r1" }), row({ id: "r2" })]);

    expect(store.listSessionRows("/s/a.jsonl").map((r) => r.id)).toEqual(["r1", "r2"]);
  });

  it("replaces a session's rows instead of accumulating them", () => {
    const store = new IntakeBrowserStore(new MemoryKeyValueStorage());
    store.saveSessionRows("/s/a.jsonl", [row({ id: "r1" })]);
    // The follower re-derives every request each poll, so the newest write is
    // the whole truth for that session. Merging would double-count.
    store.saveSessionRows("/s/a.jsonl", [row({ id: "r1" }), row({ id: "r2" })]);

    expect(store.listSessionRows("/s/a.jsonl").map((r) => r.id)).toEqual(["r1", "r2"]);
  });

  it("removes the entry rather than storing an empty one", () => {
    const storage = new MemoryKeyValueStorage();
    const store = new IntakeBrowserStore(storage);
    store.saveSessionRows("/s/a.jsonl", [row({ id: "r1" })]);
    store.saveSessionRows("/s/a.jsonl", []);

    expect(store.listSessionKeys()).toEqual([]);
    expect(storage.length).toBe(0);
  });

  it("lists every session's rows newest first", () => {
    const store = new IntakeBrowserStore(new MemoryKeyValueStorage());
    store.saveSessionRows("/s/a.jsonl", [
      row({ id: "old", startedAt: "2026-08-01T00:00:00.000Z" }),
    ]);
    store.saveSessionRows("/s/b.jsonl", [
      row({ id: "new", sessionKey: "/s/b.jsonl", startedAt: "2026-08-06T00:00:00.000Z" }),
    ]);

    expect(store.listAllRows().map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("survives a Windows path with separators and spaces as a key", () => {
    const store = new IntakeBrowserStore(new MemoryKeyValueStorage());
    const key = "C:\\Users\\Admin\\.claude\\projects\\my project\\s.jsonl";
    store.saveSessionRows(key, [row({ id: "r1", sessionKey: key })]);

    expect(store.listSessionKeys()).toEqual([key]);
    expect(store.listSessionRows(key)).toHaveLength(1);
  });

  it("reads an unknown envelope version as empty rather than corrupting a caller", () => {
    const storage = new MemoryKeyValueStorage();
    storage.setItem(
      "mori.liveIntake.session.%2Fs%2Fa.jsonl",
      JSON.stringify({ envelopeVersion: 99, savedAt: "x", data: [row({ id: "r1" })] }),
    );

    expect(new IntakeBrowserStore(storage).listSessionRows("/s/a.jsonl")).toEqual([]);
  });

  it("reads malformed JSON as empty rather than throwing", () => {
    const storage = new MemoryKeyValueStorage();
    storage.setItem("mori.liveIntake.session.%2Fs%2Fa.jsonl", "{ not json");

    expect(new IntakeBrowserStore(storage).listSessionRows("/s/a.jsonl")).toEqual([]);
  });

  it("ignores keys that belong to another store", () => {
    const storage = new MemoryKeyValueStorage();
    storage.setItem("mori.kernel.record.abc", JSON.stringify({ envelopeVersion: 1, data: {} }));
    const store = new IntakeBrowserStore(storage);
    store.saveSessionRows("/s/a.jsonl", [row({ id: "r1" })]);

    expect(store.listSessionKeys()).toEqual(["/s/a.jsonl"]);
    expect(store.listAllRows()).toHaveLength(1);
  });

  it("clears one session without touching another", () => {
    const store = new IntakeBrowserStore(new MemoryKeyValueStorage());
    store.saveSessionRows("/s/a.jsonl", [row({ id: "r1" })]);
    store.saveSessionRows("/s/b.jsonl", [row({ id: "r2", sessionKey: "/s/b.jsonl" })]);

    store.clearSession("/s/a.jsonl");

    expect(store.listSessionKeys()).toEqual(["/s/b.jsonl"]);
  });

  it("fails loudly on a full store, so the overview cannot claim a stale freshness", () => {
    const observer = vi.fn();
    setQuotaFailureObserver(observer);
    const full: KeyValueStorage = {
      length: 0,
      getItem: () => null,
      key: () => null,
      removeItem: () => {},
      setItem: () => {
        const error = new Error("quota") as Error & { name: string };
        error.name = "QuotaExceededError";
        throw error;
      },
    };

    let caught: unknown;
    try {
      new IntakeBrowserStore(full).saveSessionRows("/s/a.jsonl", [row({ id: "r1" })]);
    } catch (error) {
      caught = error;
    }

    expect(isStorageQuotaError(caught)).toBe(true);
    expect(observer).toHaveBeenCalledTimes(1);
  });
});
