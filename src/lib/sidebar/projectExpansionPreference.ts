/**
 * Per-project expand/collapse state for the sidebar's project-tree mode.
 *
 * Stored as a single comma-separated string of *collapsed* project labels.
 * Defaulting to expanded means a fresh install reads as "all projects
 * open", which matches the natural "I want to see my work" intent — the
 * user only persists explicit closes.
 *
 * The label space is the same `sourceLabel` the project grouping uses
 * (full project path), so the state survives across renames of the
 * shorter display label but resets if the user reorganises their
 * underlying project paths.
 */
const KEY = "mori.sidebar.collapsedProjects";

export function loadCollapsedProjects(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return new Set();
    return new Set(raw.split("\n").filter(Boolean));
  } catch {
    return new Set();
  }
}

export function saveCollapsedProjects(collapsed: ReadonlySet<string>): void {
  if (typeof window === "undefined") return;
  try {
    if (collapsed.size === 0) {
      window.localStorage.removeItem(KEY);
      return;
    }
    window.localStorage.setItem(KEY, Array.from(collapsed).join("\n"));
  } catch {
    // Storage quota / permissions failure — preference simply doesn't stick.
  }
}
