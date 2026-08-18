import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveUserProjects } from "./userProjects";
import { saveConnectedProjects } from "./projectConnection";
import { setQuotaFailureObserver } from "../storage/storageQuota";

/**
 * Both mappings used to swallow a storage failure entirely, keeping the
 * in-memory list and dropping persistence with only a comment to say so. They
 * do not go through `BrowserDraftRepository.write()`, so the process-wide quota
 * observer never fired for them either: the user's own project mapping could
 * vanish on the next launch with nothing having reported anything.
 */
describe("project mapping persistence", () => {
  const original = globalThis.localStorage;

  beforeEach(() => {
    const failing = {
      getItem: () => null,
      setItem: () => {
        const error = new Error("quota");
        error.name = "QuotaExceededError";
        throw error;
      },
      removeItem: () => {},
      key: () => null,
      length: 0,
    };
    Object.defineProperty(globalThis, "localStorage", { value: failing, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", { value: original, configurable: true });
    setQuotaFailureObserver(null);
  });

  it("reports a quota failure when saving user projects", () => {
    const seen: string[] = [];
    setQuotaFailureObserver((failure) => seen.push(failure.key));

    expect(() => saveUserProjects([{ key: "mori", created: true } as never])).not.toThrow();

    expect(seen).toEqual(["mori.userProjects.v1"]);
  });

  it("reports a quota failure when saving connected projects", () => {
    const seen: string[] = [];
    setQuotaFailureObserver((failure) => seen.push(failure.key));

    expect(() => saveConnectedProjects([{ key: "mori" } as never])).not.toThrow();

    expect(seen).toEqual(["mori.projectConnections.v1"]);
  });

  it("still does not throw into the caller, which keeps its in-memory list", () => {
    // The behaviour that was right about the original code, kept: a mapping
    // edit must not fail in the user's face because the store is full.
    setQuotaFailureObserver(null);
    expect(() => saveUserProjects([])).not.toThrow();
  });
});

// Unrelated to quota, but the same seam: a non-quota storage error must not be
// reported as one, since the notice tells the user their store is full.
describe("project mapping persistence, non-quota failure", () => {
  const original = globalThis.localStorage;

  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", { value: original, configurable: true });
    setQuotaFailureObserver(null);
  });

  it("does not report a disabled-storage error as a quota failure", () => {
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: () => null,
        setItem: () => {
          throw new Error("storage is disabled");
        },
        removeItem: () => {},
        key: () => null,
        length: 0,
      },
      configurable: true,
    });
    const seen: string[] = [];
    setQuotaFailureObserver((failure) => seen.push(failure.key));

    saveUserProjects([]);

    expect(seen).toEqual([]);
  });
});
