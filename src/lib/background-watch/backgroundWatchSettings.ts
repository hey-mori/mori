/**
 * Background watch settings — the opt-in that governs whether Mori watches the
 * connector inbox on its own.
 *
 * Mori's doctrine bans an always-on watcher *by default*; a background process
 * that reads the already-connected connector inbox is allowed only when it is
 * explicit (opt-in, off by default), local-only, and review-gated. This is that
 * opt-in. `enabled` turns on detection (surface newly-arrived agent work for
 * review while the app is open); `autoAnalyze` additionally runs a local Quick
 * Pass on a detected session — still review-before-apply, never a silent write
 * to memory. Both default off. Device-local, persisted in localStorage like the
 * engine presets; never synced.
 */
export type BackgroundWatchSettings = {
  /** Watch the connector inbox and surface newly-arrived work for review. */
  enabled: boolean;
  /** Also run a local Quick Pass on a detected session (results still reviewed). */
  autoAnalyze: boolean;
};

export const DEFAULT_BACKGROUND_WATCH: BackgroundWatchSettings = {
  enabled: false,
  autoAnalyze: false,
};

export const BACKGROUND_WATCH_KEY = "mori.backgroundWatch.v1";

type WatchStorage = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): WatchStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Load the opt-in, defaulting to off. Never throws; a malformed value is off. */
export function loadBackgroundWatchSettings(
  storage: WatchStorage | null = defaultStorage(),
): BackgroundWatchSettings {
  if (!storage) return { ...DEFAULT_BACKGROUND_WATCH };
  try {
    const raw = storage.getItem(BACKGROUND_WATCH_KEY);
    if (!raw) return { ...DEFAULT_BACKGROUND_WATCH };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_BACKGROUND_WATCH };
    const record = parsed as Partial<BackgroundWatchSettings>;
    const enabled = record.enabled === true;
    return {
      enabled,
      // autoAnalyze only matters when watching is on, and never defaults true.
      autoAnalyze: enabled && record.autoAnalyze === true,
    };
  } catch {
    return { ...DEFAULT_BACKGROUND_WATCH };
  }
}

/** Persist the opt-in. Best-effort; never throws. */
export function saveBackgroundWatchSettings(
  settings: BackgroundWatchSettings,
  storage: WatchStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(
      BACKGROUND_WATCH_KEY,
      JSON.stringify({
        enabled: settings.enabled === true,
        autoAnalyze: settings.enabled === true && settings.autoAnalyze === true,
      }),
    );
  } catch {
    // Device-local convenience; a failed write just keeps the prior value.
  }
}
