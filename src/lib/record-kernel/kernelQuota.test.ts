/**
 * Quota-failure behavior of the kernel browser store and the record+revision
 * save pair. Guards the visible-and-reversible invariant under a full
 * localStorage: a failed save must throw typed (never look successful), the
 * app-level health observer must fire, and a record must never persist
 * without its revision (nor a revision without its record).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryKeyValueStorage } from "../storage/memoryStorage";
import { isStorageQuotaError, setQuotaFailureObserver } from "../storage/storageQuota";
import type { KeyValueStorage } from "../storage/storageTypes";
import { KernelBrowserStore } from "./kernelStore";
import { KernelRepository } from "./kernelRepository";
import { createRecord } from "./recordFactory";
import { createSchemaRegistry } from "./schemaRegistry";

afterEach(() => {
  setQuotaFailureObserver(null);
});

const registry = createSchemaRegistry();

function makeRecord(title = "메모") {
  return createRecord({ schemaId: "note", title, body: "러닝 기록", origin: "user" }, registry);
}

function quotaError(): Error {
  const error = new Error("QuotaExceededError");
  error.name = "QuotaExceededError";
  return error;
}

/** A real in-memory storage whose writes fail (as quota) on one key prefix. */
function storageFailingOn(prefix: string): KeyValueStorage {
  const inner = new MemoryKeyValueStorage();
  return {
    get length() {
      return inner.length;
    },
    getItem: (key) => inner.getItem(key),
    setItem: (key, value) => {
      if (key.startsWith(prefix)) throw quotaError();
      inner.setItem(key, value);
    },
    removeItem: (key) => inner.removeItem(key),
    key: (index) => inner.key(index),
  };
}

describe("KernelBrowserStore quota guard", () => {
  it("throws a typed StorageQuotaError and notifies the observer on quota exceed", () => {
    const seen = vi.fn();
    setQuotaFailureObserver(seen);
    const store = new KernelBrowserStore(storageFailingOn("mori.kernel.record."));
    const { record } = makeRecord();

    let caught: unknown;
    try {
      store.saveRecord(record);
    } catch (error) {
      caught = error;
    }

    expect(isStorageQuotaError(caught)).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0][0].key).toBe(`mori.kernel.record.${record.id}`);
  });

  it("rethrows non-quota errors untyped", () => {
    const boom = new Error("disk on fire");
    const storage: KeyValueStorage = {
      length: 0,
      getItem: () => null,
      setItem: () => {
        throw boom;
      },
      removeItem: () => undefined,
      key: () => null,
    };
    const store = new KernelBrowserStore(storage);
    const { record } = makeRecord();

    let caught: unknown;
    try {
      store.saveRecord(record);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(boom);
    expect(isStorageQuotaError(caught)).toBe(false);
  });
});

describe("KernelRepository.saveRecord atomicity under quota failure", () => {
  it("persists nothing when the revision write fails", async () => {
    const store = new KernelBrowserStore(storageFailingOn("mori.kernel.revision."));
    const repository = new KernelRepository({ runtime: "browser", store });
    const { record, revision } = makeRecord();

    await expect(repository.saveRecord(record, revision)).rejects.toSatisfy(isStorageQuotaError);

    expect(store.getRecord(record.id)).toBeNull();
    expect(store.listRevisions(record.id)).toHaveLength(0);
  });

  it("rolls the revision back when the record write fails, so no orphan survives", async () => {
    const store = new KernelBrowserStore(storageFailingOn("mori.kernel.record."));
    const repository = new KernelRepository({ runtime: "browser", store });
    const { record, revision } = makeRecord();

    await expect(repository.saveRecord(record, revision)).rejects.toSatisfy(isStorageQuotaError);

    expect(store.getRecord(record.id)).toBeNull();
    expect(store.listRevisions(record.id)).toHaveLength(0);
  });

  it("still saves the pair normally when storage has room", async () => {
    const store = new KernelBrowserStore(new MemoryKeyValueStorage());
    const repository = new KernelRepository({ runtime: "browser", store });
    const { record, revision } = makeRecord();

    const result = await repository.saveRecord(record, revision);

    expect(result.source).toBe("browser-local-storage");
    expect(store.getRecord(record.id)).toEqual(record);
    expect(store.listRevisions(record.id)).toHaveLength(1);
  });
});
