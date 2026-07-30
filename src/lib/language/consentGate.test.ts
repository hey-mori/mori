import { beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateConsent } from "./languageConsent";
import {
  blockApp,
  grantConsent,
  isAppBlocked,
  listGrants,
  resetConsentStoreForTests,
  revokeConsent,
  unblockApp,
} from "./consentStore";

/** A minimal in-memory `localStorage`. The unit suite runs in plain Node, and
 *  the durability rule is precisely about what happens when a write fails, so
 *  the store has to be real enough to be broken on purpose. */
function installMemoryStorage(): Storage {
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });
  return storage;
}

beforeEach(() => {
  installMemoryStorage();
  resetConsentStoreForTests();
});

function decide(overrides: Partial<Parameters<typeof evaluateConsent>[0]> = {}) {
  return evaluateConsent(
    {
      providerId: "openai",
      processingLocation: "cloud",
      ...overrides,
    },
    listGrants(),
  );
}

describe("nothing local needs consent", () => {
  it("allows a local provider without asking", () => {
    expect(decide({ processingLocation: "local" })).toEqual({
      outcome: "allowed",
      reason: "local",
    });
  });

  it("allows a fixture without asking", () => {
    expect(decide({ processingLocation: "fixture" })).toEqual({
      outcome: "allowed",
      reason: "fixture",
    });
  });
});

describe("cloud and unknown providers are gated", () => {
  it("asks before the first cloud send", () => {
    expect(decide().outcome).toBe("ask");
  });

  it("treats an undeclared location as external, never as safe", () => {
    expect(decide({ processingLocation: "unknown" }).outcome).toBe("ask");
  });

  it("allows after a provider-scoped grant", () => {
    grantConsent({ providerId: "openai", scope: "provider" });
    expect(decide()).toEqual({ outcome: "allowed", reason: "granted" });
  });

  it("does not let one vendor's grant cover another", () => {
    grantConsent({ providerId: "openai", scope: "provider" });
    expect(decide({ providerId: "anthropic" }).outcome).toBe("ask");
  });

  it("stops allowing once revoked", () => {
    grantConsent({ providerId: "openai", scope: "provider" });
    revokeConsent("openai");
    expect(decide().outcome).toBe("ask");
  });

  it("scopes an application grant to that application only", () => {
    grantConsent({ providerId: "openai", scope: "application", applicationId: "chrome" });
    expect(decide({ applicationId: "chrome" }).outcome).toBe("allowed");
    expect(decide({ applicationId: "keepass" }).outcome).toBe("ask");
  });

  it("replaces rather than stacks, so a later narrower choice wins", () => {
    grantConsent({ providerId: "openai", scope: "provider" });
    grantConsent({ providerId: "openai", scope: "application", applicationId: "chrome" });
    expect(listGrants().filter((g) => g.providerId === "openai")).toHaveLength(1);
    expect(decide({ applicationId: "notepad" }).outcome).toBe("ask");
  });
});

describe("the two hard blocks outrank every grant", () => {
  it("refuses a secure input field even with a broad grant", () => {
    grantConsent({ providerId: "openai", scope: "provider" });
    expect(decide({ isSecureInput: true })).toEqual({
      outcome: "blocked",
      reason: "secure-input",
    });
  });

  it("refuses a blocked app even with a broad grant", () => {
    grantConsent({ providerId: "openai", scope: "provider" });
    expect(decide({ isBlockedApp: true })).toEqual({
      outcome: "blocked",
      reason: "blocked-app",
    });
  });

  it("refuses secure input for a local provider too", () => {
    // Local processing is not a licence to read a password field.
    expect(decide({ processingLocation: "local", isSecureInput: true }).outcome).toBe("blocked");
  });
});

describe("the block list is per application and case-insensitive", () => {
  it("blocks and unblocks by process name", () => {
    expect(isAppBlocked("KeePass")).toBe(false);
    blockApp("KeePass");
    expect(isAppBlocked("keepass")).toBe(true);
    unblockApp("keepass");
    expect(isAppBlocked("KeePass")).toBe(false);
  });

  it("treats an unknown application as not blocked", () => {
    expect(isAppBlocked(undefined)).toBe(false);
  });
});

describe("a grant never claims to be more durable than it is", () => {
  it("reports session scope as non-durable, because it is meant to expire", () => {
    const grant = grantConsent({ providerId: "openai", scope: "session" });
    expect(grant.durable).toBe(false);
  });

  it("degrades to non-durable when the store refuses the write", () => {
    // Issue #12: the web store is quota-exhausted. Telling someone their choice
    // was saved permanently when the write threw is the failure this prevents.
    const setItem = vi
      .spyOn(globalThis.localStorage, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    const grant = grantConsent({ providerId: "openai", scope: "provider" });
    expect(grant.durable).toBe(false);
    // It still applies for this run: failing closed on storage would make the
    // feature unusable rather than safer.
    expect(decide().outcome).toBe("allowed");
    setItem.mockRestore();
  });

  it("reports durable only when the write actually succeeded", () => {
    const grant = grantConsent({ providerId: "openai", scope: "provider" });
    expect(grant.durable).toBe(true);
  });

  it("is not durable when there is no store at all", () => {
    // A missing store is a failed write. Optional-chaining into `undefined` and
    // calling that a success would claim permanence in exactly the environments
    // where nothing was saved.
    Object.defineProperty(globalThis, "localStorage", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    resetConsentStoreForTests();
    expect(grantConsent({ providerId: "openai", scope: "provider" }).durable).toBe(false);
  });

  it("never stores captured text in a grant", () => {
    grantConsent({ providerId: "openai", scope: "provider", applicationId: "chrome" });
    const serialized = JSON.stringify(listGrants());
    expect(serialized).not.toMatch(/text|selection|prompt/i);
  });
});
