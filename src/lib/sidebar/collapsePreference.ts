/**
 * Per-device sidebar collapse preference.
 *
 * The collapse toggle lives next to the user button so a user who wants a
 * wider workspace can hide the session list without losing the head /
 * navigation chrome. Persisted to localStorage so the choice survives
 * reloads — a small, schema-free entry that's easy to wipe.
 */
const KEY = "mori.sidebar.collapsed";

export function loadCollapsePreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function saveCollapsePreference(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (collapsed) window.localStorage.setItem(KEY, "1");
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage quota / permissions failure — preference simply doesn't stick.
  }
}
