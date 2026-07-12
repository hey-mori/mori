import { afterEach, describe, expect, it, vi } from "vitest";
import {
  StorageQuotaError,
  isQuotaExceededError,
  isStorageQuotaError,
  notifyQuotaFailure,
  setQuotaFailureObserver,
} from "./storageQuota";

afterEach(() => {
  setQuotaFailureObserver(null);
});

function domException(name: string, code?: number): Error {
  const error = new Error(name);
  error.name = name;
  if (code !== undefined) {
    (error as Error & { code: number }).code = code;
  }
  return error;
}

describe("isQuotaExceededError", () => {
  it("detects the standard QuotaExceededError name", () => {
    expect(isQuotaExceededError(domException("QuotaExceededError"))).toBe(true);
  });

  it("detects Firefox's NS_ERROR_DOM_QUOTA_REACHED", () => {
    expect(isQuotaExceededError(domException("NS_ERROR_DOM_QUOTA_REACHED"))).toBe(true);
  });

  it("detects legacy code 22 and 1014 regardless of name", () => {
    expect(isQuotaExceededError(domException("SomethingElse", 22))).toBe(true);
    expect(isQuotaExceededError(domException("SomethingElse", 1014))).toBe(true);
  });

  it("rejects unrelated errors and non-errors", () => {
    expect(isQuotaExceededError(new Error("boom"))).toBe(false);
    expect(isQuotaExceededError("QuotaExceededError")).toBe(false);
    expect(isQuotaExceededError(null)).toBe(false);
  });
});

describe("StorageQuotaError", () => {
  it("carries the failed key and a stable name", () => {
    const error = new StorageQuotaError("mori.sessionDraft.s-1");
    expect(error.key).toBe("mori.sessionDraft.s-1");
    expect(error.name).toBe("StorageQuotaError");
    expect(isStorageQuotaError(error)).toBe(true);
    expect(isStorageQuotaError(new Error("other"))).toBe(false);
  });

  it("preserves the original error as cause", () => {
    const cause = domException("QuotaExceededError");
    const error = new StorageQuotaError("k", { cause });
    expect(error.cause).toBe(cause);
  });
});

describe("quota failure observer", () => {
  it("notifies the registered observer with the failure", () => {
    const seen = vi.fn();
    setQuotaFailureObserver(seen);
    notifyQuotaFailure({ key: "k", at: "2026-07-12T00:00:00.000Z" });
    expect(seen).toHaveBeenCalledWith({ key: "k", at: "2026-07-12T00:00:00.000Z" });
  });

  it("is a no-op with no observer and survives an observer that throws", () => {
    expect(() => notifyQuotaFailure({ key: "k", at: "t" })).not.toThrow();
    setQuotaFailureObserver(() => {
      throw new Error("observer bug");
    });
    expect(() => notifyQuotaFailure({ key: "k", at: "t" })).not.toThrow();
  });
});
