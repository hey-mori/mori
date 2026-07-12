/**
 * Storage quota guard.
 *
 * Browser localStorage is quota-bound (typically 5–10 MB) and Mori's
 * load-bearing writes (session drafts, imports, analysis, memory bodies)
 * all flow through `BrowserDraftRepository.write()`. Before this module,
 * a full store made `setItem` throw a raw `QuotaExceededError` that no
 * caller handled — the save silently failed mid-action.
 *
 * This module gives the failure a typed shape and a process-wide observer
 * seam so the app layer can surface it honestly (a notification, a
 * settings banner) without every repository call site threading a
 * callback. The write still throws — a failed save must never look like
 * a successful one — but it throws a `StorageQuotaError` the caller can
 * distinguish, and the observer fires first so the user sees the failure
 * even when a caller swallows the exception.
 */

export type StorageQuotaFailure = {
  /** The storage key whose write failed. */
  key: string;
  /** ISO timestamp of the failure. */
  at: string;
};

export class StorageQuotaError extends Error {
  readonly key: string;
  /** The original storage error. A manual field: the build target predates
   *  the ES2022 `Error` cause option. */
  readonly cause?: unknown;

  constructor(key: string, options?: { cause?: unknown }) {
    super(`Browser storage quota exceeded while writing "${key}". The save did not complete.`);
    this.name = "StorageQuotaError";
    this.key = key;
    this.cause = options?.cause;
  }
}

export function isStorageQuotaError(error: unknown): error is StorageQuotaError {
  return error instanceof StorageQuotaError;
}

/**
 * Detect a browser quota error across engines: the standard
 * `QuotaExceededError` DOMException name (Chromium / WebKit), legacy
 * code 22, and Firefox's `NS_ERROR_DOM_QUOTA_REACHED` (code 1014).
 */
export function isQuotaExceededError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "QuotaExceededError") return true;
  if (error.name === "NS_ERROR_DOM_QUOTA_REACHED") return true;
  const code = (error as { code?: unknown }).code;
  return code === 22 || code === 1014;
}

type QuotaFailureObserver = (failure: StorageQuotaFailure) => void;

let observer: QuotaFailureObserver | null = null;

/**
 * Register the process-wide quota-failure observer. The app layer wires
 * this to its health store once; `null` unregisters (tests use this).
 * Deliberately a single observer, not a list — there is one health
 * surface, and a missing observer must never break the write path.
 */
export function setQuotaFailureObserver(next: QuotaFailureObserver | null): void {
  observer = next;
}

/** Notify the registered observer; never throws into the write path. */
export function notifyQuotaFailure(failure: StorageQuotaFailure): void {
  if (!observer) return;
  try {
    observer(failure);
  } catch {
    // The health surface must never take down the save path.
  }
}
