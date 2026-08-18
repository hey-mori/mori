import { create } from "zustand";
import {
  setStorageFallbackObserver,
  type StorageFallbackEvent,
} from "../lib/storage/storageFallback";
import {
  setQuotaFailureObserver,
  type StorageQuotaFailure,
} from "../lib/storage/storageQuota";

/**
 * Storage health store.
 *
 * Holds the most recent browser-storage quota failure so the notification
 * feed (and any future settings banner) can surface it honestly. The write
 * path itself stays in `BrowserDraftRepository.write()`: it throws a typed
 * `StorageQuotaError` and notifies the process-wide observer registered
 * below, so every repository instance (session store, persistence service,
 * import repository) reports here without threading callbacks.
 *
 * Only the latest failure is kept: the honest signal is "your last save
 * did not complete", not a log. It clears when the user acknowledges it
 * or a later write to the same key succeeds is out of scope for now.
 */
export type StorageHealthState = {
  lastQuotaFailure: StorageQuotaFailure | null;
  /**
   * The most recent time a desktop SQLite call fell back to localStorage.
   * Kept beside the quota failure because they are the same question asked at
   * two moments: this one is "your writes are going somewhere small", the
   * other is "and now they have stopped fitting".
   */
  lastFallback: StorageFallbackEvent | null;
  reportQuotaFailure: (failure: StorageQuotaFailure) => void;
  clearQuotaFailure: () => void;
  reportFallback: (event: StorageFallbackEvent) => void;
  clearFallback: () => void;
};

export const useStorageHealthStore = create<StorageHealthState>((set) => ({
  lastQuotaFailure: null,
  lastFallback: null,
  reportQuotaFailure: (failure) => set({ lastQuotaFailure: failure }),
  clearQuotaFailure: () => set({ lastQuotaFailure: null }),
  reportFallback: (event) => set({ lastFallback: event }),
  clearFallback: () => set({ lastFallback: null }),
}));

// Register the process-wide observer once at module load. The observer seam
// never throws into the save path (guarded in storageQuota).
setQuotaFailureObserver((failure) =>
  useStorageHealthStore.getState().reportQuotaFailure(failure),
);

setStorageFallbackObserver((event) =>
  useStorageHealthStore.getState().reportFallback(event),
);
