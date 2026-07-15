/**
 * Auto-import settings — a small, standalone opt-out.
 *
 * Kept separate from the background-watch settings on purpose: background watch
 * is opt-IN and off by default (it can run a headless analysis), whereas
 * auto-import only REGISTERS discovered sessions into the 과거 list (it never
 * applies to memory), so it is on by default and merely makes visible what the
 * user already connected. A distinct key keeps the two policies from entangling.
 */
const AUTO_IMPORT_SETTINGS_KEY = "mori.autoImport.settings.v1";

export type AutoImportSettings = {
  /** Continuously register discovered agent sessions into 과거. Default on. */
  enabled: boolean;
};

export const DEFAULT_AUTO_IMPORT_SETTINGS: AutoImportSettings = { enabled: true };

/** Fires when the settings change so a mounted hook can react without a reload. */
export const AUTO_IMPORT_SETTINGS_CHANGED_EVENT = "mori:auto-import-settings-changed";

export function loadAutoImportSettings(): AutoImportSettings {
  if (typeof window === "undefined") return DEFAULT_AUTO_IMPORT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(AUTO_IMPORT_SETTINGS_KEY);
    if (!raw) return DEFAULT_AUTO_IMPORT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AutoImportSettings>;
    return {
      enabled: typeof parsed?.enabled === "boolean" ? parsed.enabled : true,
    };
  } catch {
    return DEFAULT_AUTO_IMPORT_SETTINGS;
  }
}

export function saveAutoImportSettings(settings: AutoImportSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUTO_IMPORT_SETTINGS_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent(AUTO_IMPORT_SETTINGS_CHANGED_EVENT));
  } catch {
    // Persistence is best-effort; a failed write just keeps the prior value.
  }
}
