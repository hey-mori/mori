/**
 * The key-value storage the app reads and writes durable classes through.
 *
 * On desktop, once `prepareDurableReads` has decided, reads of the promoted
 * classes come from the SQLite-backed cache (R6 of
 * `docs/design/sqlite-source-of-truth-promotion.md`); before that, and in the
 * browser, this is plain localStorage. Readers that reached for
 * `window.localStorage` directly bypassed that decision, so on a profile
 * restored from its storage folder they saw nothing SQLite held.
 *
 * The app layer registers the provider; library code asks here, never the
 * window, for anything the promotion covers.
 */
import type { KeyValueStorage } from "./storageTypes";

let provider: (() => KeyValueStorage) | null = null;

export function setAppStorageProvider(next: (() => KeyValueStorage) | null): void {
  provider = next;
}

/** The storage to use now, or `null` where there is no window (tests, workers). */
export function getAppStorage(): KeyValueStorage | null {
  if (provider) return provider();
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}
