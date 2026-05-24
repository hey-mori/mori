import type { SidebarArchiveFilter } from "./sessionList";

/**
 * Per-device sidebar "show archived" preference.
 *
 * Persisted to localStorage alongside the grouping preference so the toggle
 * survives reloads. Stored as a plain string in a single key — small,
 * schema-free, easy to wipe.
 */
const KEY = "mori.sidebar.archiveFilter";

const VALID: ReadonlySet<SidebarArchiveFilter> = new Set(["active", "all"]);

export function loadArchivePreference(): SidebarArchiveFilter {
  if (typeof window === "undefined") return "active";
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw && VALID.has(raw as SidebarArchiveFilter)) {
      return raw as SidebarArchiveFilter;
    }
  } catch {
    // localStorage may be unavailable (private browsing); default cleanly.
  }
  return "active";
}

export function saveArchivePreference(filter: SidebarArchiveFilter): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, filter);
  } catch {
    // Storage quota / permissions failure — preference simply doesn't stick.
  }
}
