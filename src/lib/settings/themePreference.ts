/**
 * Theme preference — Mori's local appearance setting.
 *
 * Mori ships two runtime themes today: `formal` (the default product
 * look) and `forest` (a sage variant). Both are real Layer-3 token
 * sets in `src/styles/theme.css`. The preference is a single value
 * held in browser localStorage; it is local-only, never synced, and
 * never affects data access, capture, privacy, or memory.
 *
 * `nightLake` is a reserved Planned theme — it is intentionally not a
 * valid stored value because selecting it would render nothing.
 *
 * See `docs/theme-system.md`.
 */

import type { KeyValueStorage } from "../storage/storageTypes";

const THEME_KEY = "mori.themePreference";
const THEME_SCHEMA_VERSION = 1 as const;

/** Runtime-selectable themes — both are real token sets today. */
export const SELECTABLE_THEMES = ["formal", "forest"] as const;

export type MoriThemeId = (typeof SELECTABLE_THEMES)[number];

export const DEFAULT_THEME: MoriThemeId = "formal";

export type MoriThemePreference = {
  schemaVersion: typeof THEME_SCHEMA_VERSION;
  theme: MoriThemeId;
};

export const DEFAULT_THEME_PREFERENCE: MoriThemePreference = {
  schemaVersion: THEME_SCHEMA_VERSION,
  theme: DEFAULT_THEME,
};

/** Type guard: is `value` one of the runtime-selectable theme ids. */
export function isSelectableTheme(value: unknown): value is MoriThemeId {
  return (
    typeof value === "string" &&
    (SELECTABLE_THEMES as readonly string[]).includes(value)
  );
}

/**
 * Parse a stored preference string into a valid `MoriThemePreference`.
 * Unknown / malformed / wrong-version / non-selectable payloads fall
 * back to the default rather than rendering an unknown theme.
 */
export function parseThemePreference(raw: string | null): MoriThemePreference {
  if (!raw) return DEFAULT_THEME_PREFERENCE;
  try {
    const parsed = JSON.parse(raw) as Partial<MoriThemePreference>;
    if (parsed.schemaVersion !== THEME_SCHEMA_VERSION) {
      return DEFAULT_THEME_PREFERENCE;
    }
    if (!isSelectableTheme(parsed.theme)) {
      return DEFAULT_THEME_PREFERENCE;
    }
    return { schemaVersion: THEME_SCHEMA_VERSION, theme: parsed.theme };
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

/** Serialize a preference for storage. */
export function serializeThemePreference(preference: MoriThemePreference): string {
  return JSON.stringify(preference);
}

/**
 * Resolve the key-value store to use. Defaults to `window.localStorage`;
 * callers (and tests) may inject any `KeyValueStorage`. Returns `null`
 * when no DOM is available and none was injected.
 */
function resolveStorage(storage?: KeyValueStorage): KeyValueStorage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

/** Read the theme preference from local storage. */
export function loadThemePreference(storage?: KeyValueStorage): MoriThemePreference {
  const store = resolveStorage(storage);
  if (!store) return DEFAULT_THEME_PREFERENCE;
  try {
    return parseThemePreference(store.getItem(THEME_KEY));
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

/** Persist the theme preference to local storage. */
export function saveThemePreference(
  preference: MoriThemePreference,
  storage?: KeyValueStorage,
): void {
  const store = resolveStorage(storage);
  if (!store) return;
  try {
    store.setItem(THEME_KEY, serializeThemePreference(preference));
  } catch {
    // localStorage can be unavailable (private mode / quota); a failed
    // write just means the theme is not persisted, not a crash.
  }
}

/**
 * Reflect the selected theme on the document root. The
 * `[data-mori-theme="…"]` selectors in `theme.css` remap the Layer-2
 * semantic tokens; setting the attribute on `<html>` cascades the
 * override to every surface.
 */
export function applyThemeToDocument(theme: MoriThemeId): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-mori-theme", theme);
}
