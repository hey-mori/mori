/**
 * R6: where durable reads come from.
 *
 * Every promoted class has been dual-written since R2, so SQLite should hold
 * what localStorage holds. This is the step that starts believing it, and the
 * only step in the whole promotion that changes what the user sees.
 *
 * ## The flip is conditional, not scheduled
 *
 * "Dual-write has been on for a release" is a proxy for the thing that
 * actually matters, which is whether the copy is complete on **this** device.
 * A mirror write that failed, a device that ran an older build, a pass that was
 * interrupted: each leaves a gap that a release count cannot see.
 *
 * So the flip checks. It reads the durable keys localStorage holds and the
 * documents SQLite holds, and serves from SQLite only when SQLite is not
 * missing any of them. When it is, reads stay exactly where they are today and
 * the gap is reported rather than served around.
 *
 * That makes the worst case "no change" instead of "data missing", which is
 * what lets this ship without a staged rollout.
 *
 * ## Why reads are cached rather than made async
 *
 * `DraftRepository` is synchronous, and its readers run inside React render and
 * inside store hydration. Making them async would mean rewriting the session
 * store, which is a far larger change than this one and would risk the thing it
 * was meant to protect.
 *
 * Instead the documents are loaded once, into a `KeyValueStorage` shaped exactly
 * like the one the adapter already reads. The adapter is unchanged; only what it
 * reads from moves.
 */
import { durableKeyToDocument, documentToDurableKey, durableKinds } from "./durableKeyMap";
import { MemoryKeyValueStorage } from "./memoryStorage";
import type { KeyValueStorage } from "./storageTypes";
import type { DurableDocumentKind, SqliteDurableDocumentRow } from "../sqlite/durableDocumentRows";

export type DurableReadSource = {
  /** Where reads will come from. */
  source: "desktop-sqlite" | "browser-local-storage";
  /** Present only when the flip did not engage. */
  heldBack?: { missingKeys: number; example: string | null; reason: string };
};

export type ResolveInput = {
  local: KeyValueStorage;
  listDocuments: (kind: DurableDocumentKind) => Promise<SqliteDurableDocumentRow[]>;
};

/**
 * A storage that reads from SQLite and writes to localStorage.
 *
 * Dual-write continues until R7, so a write still has to reach localStorage;
 * it also updates the cache so a read after a write sees it, which the adapter
 * relies on and which a read straight from a startup snapshot would break.
 */
export function createReadThroughStorage(
  cache: KeyValueStorage,
  local: KeyValueStorage,
): KeyValueStorage {
  return {
    get length() {
      return cache.length;
    },
    key: (index) => cache.key(index),
    getItem: (key) => cache.getItem(key),
    // localStorage first: a write it refuses (a full store) must throw before
    // the cache shows it, or the rest of the run would read a value that is
    // persisted nowhere and the mirror would never be asked to copy it.
    setItem: (key, value) => {
      local.setItem(key, value);
      cache.setItem(key, value);
    },
    removeItem: (key) => {
      local.removeItem(key);
      cache.removeItem(key);
    },
  };
}

/**
 * Decide where durable reads come from, and build the cache when they move.
 *
 * Returns the decision and, when it flipped, a storage to hand the adapter.
 */
export async function resolveDurableReadSource(
  input: ResolveInput,
): Promise<DurableReadSource & { storage: KeyValueStorage | null }> {
  const localKeys: string[] = [];
  for (let index = 0; index < input.local.length; index += 1) {
    const key = input.local.key(index);
    if (key && durableKeyToDocument(key)) localKeys.push(key);
  }

  const cache = new MemoryKeyValueStorage();
  const held = new Set<string>();
  try {
    for (const kind of durableKinds()) {
      for (const row of await input.listDocuments(kind)) {
        const key = documentToDurableKey(row.kind, row.ownerId);
        if (!key) continue;
        held.add(key);
        cache.setItem(key, row.bodyJson);
      }
    }
  } catch (error) {
    // Unreadable is not the same as incomplete, but the response is: stay
    // where the data certainly is.
    return {
      source: "browser-local-storage",
      heldBack: {
        missingKeys: localKeys.length,
        example: null,
        reason: error instanceof Error ? error.message : String(error),
      },
      storage: null,
    };
  }

  const missing = localKeys.filter((key) => !held.has(key));
  if (missing.length > 0) {
    return {
      source: "browser-local-storage",
      heldBack: {
        missingKeys: missing.length,
        example: missing[0] ?? null,
        reason: "SQLite is missing documents localStorage holds",
      },
      storage: null,
    };
  }

  // Anything in localStorage that is not a durable class is carried across
  // unchanged, because the adapter reads preferences and other keys through the
  // same storage and they were never part of this promotion.
  for (let index = 0; index < input.local.length; index += 1) {
    const key = input.local.key(index);
    if (!key || durableKeyToDocument(key)) continue;
    const value = input.local.getItem(key);
    if (value !== null) cache.setItem(key, value);
  }

  return {
    source: "desktop-sqlite",
    storage: createReadThroughStorage(cache, input.local),
  };
}
