import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryKeyValueStorage } from "./memoryStorage";
import { notifyStorageFallback, setStorageFallbackObserver } from "./storageFallback";
import { KernelBrowserStore } from "../record-kernel/kernelStore";
import { KernelRepository, type KernelDesktopCommands } from "../record-kernel/kernelRepository";
import { createRecord } from "../record-kernel/recordFactory";
import { createSchemaRegistry } from "../record-kernel/schemaRegistry";

const registry = createSchemaRegistry();

afterEach(() => setStorageFallbackObserver(null));

function makeRecord() {
  return createRecord({ schemaId: "note", title: "메모", body: "본문", origin: "user" }, registry);
}

/** A desktop bridge whose every call fails, i.e. a device with no usable SQLite. */
function brokenCommands(): KernelDesktopCommands {
  const fail = () => Promise.reject(new Error("database is locked"));
  return new Proxy({} as KernelDesktopCommands, { get: () => vi.fn(fail) });
}

describe("storage fallback seam", () => {
  it("does not throw when no observer is registered", () => {
    setStorageFallbackObserver(null);
    expect(() =>
      notifyStorageFallback({ scope: "kernel", reason: "x", at: "2026-08-18T00:00:00.000Z" }),
    ).not.toThrow();
  });

  it("survives an observer that throws, because the path is already degraded", () => {
    setStorageFallbackObserver(() => {
      throw new Error("health surface exploded");
    });
    expect(() =>
      notifyStorageFallback({ scope: "kernel", reason: "x", at: "2026-08-18T00:00:00.000Z" }),
    ).not.toThrow();
  });
});

describe("kernel repository fallback reporting", () => {
  it("reports once per fallback, carrying the underlying reason", async () => {
    const seen: string[] = [];
    setStorageFallbackObserver((event) => seen.push(`${event.scope}:${event.reason}`));

    const store = new KernelBrowserStore(new MemoryKeyValueStorage());
    const repository = new KernelRepository({
      runtime: "desktop",
      store,
      commands: brokenCommands(),
    });

    const created = makeRecord();
    const result = await repository.saveRecord(created.record, created.revision);

    expect(result.fellBack).toBe(true);
    expect(seen).toEqual(["kernel:database is locked"]);
  });

  it("still persists the record it reported about, so the fallback is not a loss", async () => {
    setStorageFallbackObserver(() => {});
    const store = new KernelBrowserStore(new MemoryKeyValueStorage());
    const repository = new KernelRepository({
      runtime: "desktop",
      store,
      commands: brokenCommands(),
    });

    const created = makeRecord();
    await repository.saveRecord(created.record, created.revision);

    expect(store.getRecord(created.record.id)?.id).toBe(created.record.id);
  });

  // The case that decides whether this signal is worth anything. In browser
  // mode localStorage IS the store, so reporting there would tell every web
  // user their data is in the wrong place, and the notice would become noise
  // the desktop user learns to ignore.
  it("stays silent in browser mode, where localStorage is not a fallback", async () => {
    const seen: unknown[] = [];
    setStorageFallbackObserver((event) => seen.push(event));

    const store = new KernelBrowserStore(new MemoryKeyValueStorage());
    const repository = new KernelRepository({ runtime: "browser", store });

    const created = makeRecord();
    const result = await repository.saveRecord(created.record, created.revision);

    expect(result.fellBack).toBe(false);
    expect(seen).toEqual([]);
  });
});
