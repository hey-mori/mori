import type { SidebarGroupingMode } from "./sessionList";

/**
 * Per-device sidebar grouping preference.
 *
 * Persisted to localStorage so the choice survives reloads. Stored as a
 * plain string in a single key — small, schema-free, easy to wipe.
 */
const KEY = "mori.sidebar.groupingMode";

const VALID: ReadonlySet<SidebarGroupingMode> = new Set(["recency", "project"]);

/**
 * Default to "project" so the sidebar reads as a project navigator out of
 * the box — projects are the unit users think in, sessions are the work
 * inside one. The toggle in the search row flips to "recency" for anyone
 * who prefers time-ordered scanning.
 */
const DEFAULT_GROUPING: SidebarGroupingMode = "project";

export function loadGroupingPreference(): SidebarGroupingMode {
  if (typeof window === "undefined") return DEFAULT_GROUPING;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw && VALID.has(raw as SidebarGroupingMode)) {
      return raw as SidebarGroupingMode;
    }
  } catch {
    // localStorage may be unavailable (private browsing); default cleanly.
  }
  return DEFAULT_GROUPING;
}

export function saveGroupingPreference(mode: SidebarGroupingMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    // Storage quota / permissions failure — preference simply doesn't stick.
  }
}
