/**
 * Storage fallback reporting.
 *
 * The runtime-aware repositories prefer SQLite on desktop and fall back to
 * localStorage when a SQLite call fails, returning `fellBack: true` with a
 * reason. That contract is right. What was missing is a reader: the 기록
 * workspace calls `saveRecord` in ten places and inspects `fellBack` in none,
 * so a desktop device with a broken SQLite path wrote every record into the
 * ~5-10 MB browser store and said nothing about it.
 *
 * That is the failure `docs/design/sqlite-source-of-truth-promotion.md`
 * §0.4.3 names: a fallback is correct for one call and wrong as a resting
 * state. It is also a plausible contributor to issue #12, since a user can
 * fill the small store while believing they are on SQLite.
 *
 * This module gives the fallback a process-wide observer seam, mirroring
 * `storageQuota`, so a repository reports it in one place instead of every
 * call site threading a flag upward. It is deliberately the same shape as the
 * quota seam: one observer, never throws into the storage path, and the app
 * layer wires it to the health store once.
 *
 * Reporting is per-scope rather than per-operation. Which command failed is a
 * diagnostics question; what the user needs to know is that this device is not
 * resting on SQLite, which is true whichever call fell back first.
 */

/** Which family of durable data fell back. One per repository that routes. */
export type StorageFallbackScope = "kernel";

export type StorageFallbackEvent = {
  scope: StorageFallbackScope;
  /** Why SQLite did not service the call, taken from the underlying error. */
  reason: string;
  /** ISO timestamp of the fallback. */
  at: string;
};

type StorageFallbackObserver = (event: StorageFallbackEvent) => void;

let observer: StorageFallbackObserver | null = null;

/**
 * Register the process-wide fallback observer. The app layer wires this to its
 * health store once; `null` unregisters (tests use this). A single observer,
 * not a list: there is one health surface, and a missing observer must never
 * break a storage path that is already degraded.
 */
export function setStorageFallbackObserver(next: StorageFallbackObserver | null): void {
  observer = next;
}

/** Notify the registered observer; never throws into the storage path. */
export function notifyStorageFallback(event: StorageFallbackEvent): void {
  if (!observer) return;
  try {
    observer(event);
  } catch {
    // The health surface must never take down a path that is already falling back.
  }
}
