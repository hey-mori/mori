import { create } from "zustand";
import {
  DEFAULT_THEME_PREFERENCE,
  applyThemePreferenceToDocument,
  loadThemePreference,
  saveThemePreference,
  type ThemeFontScale,
  type ThemeId,
} from "../lib/settings/themePreference";

/**
 * Theme store.
 *
 * Holds Mori's local appearance preference. `hydrate` loads the saved
 * theme and applies it to the document root; `setTheme` persists,
 * applies, and updates state so every surface restyles immediately.
 * Local-only — no account, no sync.
 */
export type ThemeState = {
  initialized: boolean;
  theme: ThemeId;
  fontScale: ThemeFontScale;
  hydrate: () => void;
  setTheme: (theme: ThemeId) => void;
  setFontScale: (fontScale: ThemeFontScale) => void;
};

export const useThemeStore = create<ThemeState>((set, get) => ({
  initialized: false,
  theme: DEFAULT_THEME_PREFERENCE.theme,
  fontScale: DEFAULT_THEME_PREFERENCE.fontScale,
  hydrate: () => {
    if (get().initialized) return;
    const preference = loadThemePreference();
    applyThemePreferenceToDocument(preference);
    set({
      theme: preference.theme,
      fontScale: preference.fontScale,
      initialized: true,
    });
  },
  setTheme: (theme) => {
    if (get().theme === theme) return;
    const preference = {
      ...DEFAULT_THEME_PREFERENCE,
      theme,
      fontScale: get().fontScale,
    };
    saveThemePreference(preference);
    applyThemePreferenceToDocument(preference);
    set({ theme });
  },
  setFontScale: (fontScale) => {
    if (get().fontScale === fontScale) return;
    const preference = {
      ...DEFAULT_THEME_PREFERENCE,
      theme: get().theme,
      fontScale,
    };
    saveThemePreference(preference);
    applyThemePreferenceToDocument(preference);
    set({ fontScale });
  },
}));
