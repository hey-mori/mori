/**
 * Ambient observation opt-in · whether Mori keeps watching connected agent
 * sessions while it is open, or only while the 세션 screen is.
 *
 * This is a rail-B setting and is written to satisfy all three rails, because
 * rail B is permitted only when every one of them holds
 * (`docs/mori-project-goal.md` §6):
 *
 *  1. **Scope.** Reads only the agent session files the user already connected.
 *     Unchanged by this setting: it moves *when* Mori reads, never *what*.
 *  2. **Review gate.** Observation auto-applies to the intake buffer and to
 *     nothing else; interpretation stays gated, exactly as before.
 *  3. **Transparency.** Off by default, so it is an opt-in rather than a default
 *     that arrives with an update. When on, the sidebar carries an always-
 *     visible watching state with a one-tap off, so it can never run unseen.
 *
 * What it does NOT do, and must not grow into: it never runs while the app is
 * closed. A tray-resident or autostart reader is a different decision, and the
 * goal doc calls it out as a non-goal rather than a later default.
 *
 * Device-local, persisted in localStorage like the background-watch opt-in it is
 * modelled on. Never synced.
 */
export type ObservationSettings = {
  /** Keep observing on every screen, not only while 세션 is open. */
  ambient: boolean;
};

export const DEFAULT_OBSERVATION: ObservationSettings = { ambient: false };

export const OBSERVATION_KEY = "mori.observation.v1";

type SettingsStorage = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): SettingsStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Load the opt-in, defaulting to off. Never throws; a malformed value is off. */
export function loadObservationSettings(
  storage: SettingsStorage | null = defaultStorage(),
): ObservationSettings {
  if (!storage) return DEFAULT_OBSERVATION;
  try {
    const raw = storage.getItem(OBSERVATION_KEY);
    if (!raw) return DEFAULT_OBSERVATION;
    const parsed = JSON.parse(raw) as Partial<ObservationSettings>;
    return { ambient: parsed.ambient === true };
  } catch {
    return DEFAULT_OBSERVATION;
  }
}

/** Persist the opt-in. A storage failure leaves the setting in memory only. */
export function saveObservationSettings(
  settings: ObservationSettings,
  storage: SettingsStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(OBSERVATION_KEY, JSON.stringify({ ambient: settings.ambient === true }));
  } catch {
    // Same contract as the rest of intake: a settings write that fails must not
    // break the app. The setting stays in memory for this run.
  }
}
