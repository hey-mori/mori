/**
 * Theme preference — Mori's local appearance setting.
 *
 * Mori ships two runtime themes today: `formal` (the default product
 * look) and `forest` (a sage variant). Both are real Layer-3 token
 * sets in `src/styles/theme.css`. The preference is a single value
 * held in browser localStorage; it is local-only, never synced, and
 * never affects data access, capture, privacy, or memory.
 *
 * `nightLake` is the dark theme — a full set of dark-mode tokens in `theme.css`.
 *
 * See `docs/theme-system.md`.
 */

import type { KeyValueStorage } from "../storage/storageTypes";

const THEME_KEY = "mori.themePreference";
const THEME_SCHEMA_VERSION = 2 as const;

/** Runtime-selectable themes — all three are real token sets today. */
export const SELECTABLE_THEMES = ["formal", "forest", "nightLake"] as const;

export type ThemeId = (typeof SELECTABLE_THEMES)[number];

export type ThemeColorScheme = "light" | "dark";
export type ThemeFontScale = "small" | "normal" | "large" | "xlarge";

/** Ordered font-scale steps, smallest to largest, for slider-style controls. */
export const FONT_SCALE_STEPS = ["small", "normal", "large", "xlarge"] as const;

/** Returns the color-scheme (light/dark) for a given theme. */
export function getThemeColorScheme(theme: ThemeId): ThemeColorScheme {
  return theme === "nightLake" ? "dark" : "light";
}

export const DEFAULT_THEME: ThemeId = "formal";

export type ThemePreference = {
  schemaVersion: typeof THEME_SCHEMA_VERSION;
  theme: ThemeId;
  fontScale: ThemeFontScale;
};

export const DEFAULT_THEME_PREFERENCE: ThemePreference = {
  schemaVersion: THEME_SCHEMA_VERSION,
  theme: DEFAULT_THEME,
  fontScale: "normal",
};

function isThemeFontScale(value: unknown): value is ThemeFontScale {
  return (FONT_SCALE_STEPS as readonly string[]).includes(value as string);
}

/** Type guard: is `value` one of the runtime-selectable theme ids. */
export function isSelectableTheme(value: unknown): value is ThemeId {
  return (
    typeof value === "string" &&
    (SELECTABLE_THEMES as readonly string[]).includes(value)
  );
}

/**
 * Parse a stored preference string into a valid `ThemePreference`.
 * Unknown / malformed / wrong-version / non-selectable payloads fall
 * back to the default rather than rendering an unknown theme.
 */
export function parseThemePreference(raw: string | null): ThemePreference {
  if (!raw) return DEFAULT_THEME_PREFERENCE;
  try {
    const parsed = JSON.parse(raw) as Partial<ThemePreference>;
    if (parsed.schemaVersion !== THEME_SCHEMA_VERSION && parsed.schemaVersion !== 1) {
      return DEFAULT_THEME_PREFERENCE;
    }
    if (!isSelectableTheme(parsed.theme)) {
      return DEFAULT_THEME_PREFERENCE;
    }
    return {
      schemaVersion: THEME_SCHEMA_VERSION,
      theme: parsed.theme,
      fontScale: isThemeFontScale(parsed.fontScale) ? parsed.fontScale : DEFAULT_THEME_PREFERENCE.fontScale,
    };
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

/** Serialize a preference for storage. */
export function serializeThemePreference(preference: ThemePreference): string {
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
export function loadThemePreference(storage?: KeyValueStorage): ThemePreference {
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
  preference: ThemePreference,
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
 * `[data-base-theme="…"]` selectors in `theme.css` remap the Layer-2
 * semantic tokens; setting the attribute on `<html>` cascades the
 * override to every surface.
 */
export function applyThemeToDocument(theme: ThemeId): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-base-theme", theme);
}

export function applyThemePreferenceToDocument(preference: ThemePreference): void {
  if (typeof document === "undefined") return;
  applyThemeToDocument(preference.theme);
  document.documentElement.setAttribute("data-font-scale", preference.fontScale);
}
