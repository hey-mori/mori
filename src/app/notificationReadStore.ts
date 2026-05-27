import { create } from "zustand";

/**
 * Notification read-state store.
 *
 * Notifications are *recomputed* every render (the feed is derived, never
 * stored), so "read" cannot live on the record itself — it lives here, keyed by
 * the notification's stable id, and persists across reloads. This is what makes
 * the bell badge an honest *unread* count (so it grows as work piles up and the
 * 9+ cap actually means something) and powers "모두 읽음".
 *
 * Append-only by nature: ids only ever get marked read. We never need to prune
 * because the id space is bounded by the number of sessions / events, and stale
 * ids simply never match a live notification again.
 */

const STORAGE_KEY = "mori.notifications.read.v1";

function loadReadIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((v) => typeof v === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function persist(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Read-state is a convenience, never load-bearing — ignore quota failures.
  }
}

type NotificationReadState = {
  readIds: Set<string>;
  isRead: (id: string) => boolean;
  markRead: (id: string) => void;
  markAllRead: (ids: string[]) => void;
  /** Count of ids in `candidates` that are not yet read. */
  unreadCount: (candidates: string[]) => number;
};

export const useNotificationReadStore = create<NotificationReadState>((set, get) => ({
  readIds: loadReadIds(),
  isRead: (id) => get().readIds.has(id),
  markRead: (id) =>
    set((state) => {
      if (state.readIds.has(id)) return state;
      const next = new Set(state.readIds);
      next.add(id);
      persist(next);
      return { readIds: next };
    }),
  markAllRead: (ids) =>
    set((state) => {
      const next = new Set(state.readIds);
      let changed = false;
      for (const id of ids) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      if (!changed) return state;
      persist(next);
      return { readIds: next };
    }),
  unreadCount: (candidates) => {
    const read = get().readIds;
    let count = 0;
    for (const id of candidates) if (!read.has(id)) count += 1;
    return count;
  },
}));
