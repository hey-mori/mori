import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserDraftRepository } from "./localStorageAdapter";
import {
  isStorageQuotaError,
  setQuotaFailureObserver,
} from "./storageQuota";
import type { KeyValueStorage } from "./storageTypes";

afterEach(() => {
  setQuotaFailureObserver(null);
});

function quotaThrowingStorage(): KeyValueStorage {
  const error = new Error("QuotaExceededError");
  error.name = "QuotaExceededError";
  return {
    length: 0,
    getItem: () => null,
    setItem: () => {
      throw error;
    },
    removeItem: () => undefined,
    key: () => null,
  };
}

const draft = {
  project: { id: "p-1", name: "P" },
  session: { id: "s-1", title: "S" },
} as unknown as Parameters<
  ReturnType<typeof createBrowserDraftRepository>["saveCurrentSessionDraft"]
>[0];

describe("BrowserDraftRepository quota guard", () => {
  it("throws a typed StorageQuotaError when the store is full", () => {
    const repository = createBrowserDraftRepository(quotaThrowingStorage());
    let caught: unknown;
    try {
      repository.saveCurrentSessionDraft(draft);
    } catch (error) {
      caught = error;
    }
    expect(isStorageQuotaError(caught)).toBe(true);
  });

  it("notifies the quota observer before throwing", () => {
    const seen = vi.fn();
    setQuotaFailureObserver(seen);
    const repository = createBrowserDraftRepository(quotaThrowingStorage());
    expect(() => repository.saveCurrentSessionDraft(draft)).toThrow();
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0][0].key).toBe("mori.currentSessionDraft");
    expect(typeof seen.mock.calls[0][0].at).toBe("string");
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
    const repository = createBrowserDraftRepository(storage);
    let caught: unknown;
    try {
      repository.saveCurrentSessionDraft(draft);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(boom);
    expect(isStorageQuotaError(caught)).toBe(false);
  });
});
