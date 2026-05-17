import { create } from "zustand";
import {
  DEFAULT_THEME_PREFERENCE,
  applyThemeToDocument,
  loadThemePreference,
  saveThemePreference,
  type MoriThemeId,
} from "../lib/settings/themePreference";

/**
 * Theme store.
 *
 * Holds Mori's local appearance preference. `hydrate` loads the saved
 * theme and applies it to the document root; `setTheme` persists,
 * applies, and updates state so every surface restyles immediately.
 * Local-only — no account, no sync.
 */
export type MoriThemeState = {
  initialized: boolean;
  theme: MoriThemeId;
  hydrate: () => void;
  setTheme: (theme: MoriThemeId) => void;
};

export const useMoriThemeStore = create<MoriThemeState>((set, get) => ({
  initialized: false,
  theme: DEFAULT_THEME_PREFERENCE.theme,
  hydrate: () => {
    if (get().initialized) return;
    const preference = loadThemePreference();
    applyThemeToDocument(preference.theme);
    set({ theme: preference.theme, initialized: true });
  },
  setTheme: (theme) => {
    if (get().theme === theme) return;
    saveThemePreference({ ...DEFAULT_THEME_PREFERENCE, theme });
    applyThemeToDocument(theme);
    set({ theme });
  },
}));
