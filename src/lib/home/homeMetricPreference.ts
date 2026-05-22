/**
 * Home 잔디 metric preference — which lens the contribution heatmap shows.
 *
 * A single local-only value held in browser localStorage, modelled on the
 * theme preference (`src/lib/settings/themePreference.ts`): schema-versioned,
 * `KeyValueStorage`-injectable, and degrading to the default on any malformed
 * or unknown payload. It never affects data access, capture, or memory — only
 * which of `sessions` / `activity` / `tokens` the user last viewed.
 */

import type { ContributionMetric } from "./contributionGrid";
import type { KeyValueStorage } from "../storage/storageTypes";

const HOME_METRIC_KEY = "mori.homeMetricPreference";
const HOME_METRIC_SCHEMA_VERSION = 1 as const;

export const SELECTABLE_HOME_METRICS: readonly ContributionMetric[] = [
  "sessions",
  "activity",
  "tokens",
];

export const DEFAULT_HOME_METRIC: ContributionMetric = "sessions";

export type HomeMetricPreference = {
  schemaVersion: typeof HOME_METRIC_SCHEMA_VERSION;
  metric: ContributionMetric;
};

export const DEFAULT_HOME_METRIC_PREFERENCE: HomeMetricPreference = {
  schemaVersion: HOME_METRIC_SCHEMA_VERSION,
  metric: DEFAULT_HOME_METRIC,
};

/** Type guard: is `value` one of the selectable 잔디 lenses. */
export function isSelectableHomeMetric(value: unknown): value is ContributionMetric {
  return (
    typeof value === "string" &&
    (SELECTABLE_HOME_METRICS as readonly string[]).includes(value)
  );
}

/**
 * Parse a stored preference string into a valid `HomeMetricPreference`.
 * Unknown / malformed / wrong-version / non-selectable payloads fall back to
 * the default rather than selecting an unknown lens.
 */
export function parseHomeMetricPreference(raw: string | null): HomeMetricPreference {
  if (!raw) return DEFAULT_HOME_METRIC_PREFERENCE;
  try {
    const parsed = JSON.parse(raw) as Partial<HomeMetricPreference>;
    if (parsed.schemaVersion !== HOME_METRIC_SCHEMA_VERSION) {
      return DEFAULT_HOME_METRIC_PREFERENCE;
    }
    if (!isSelectableHomeMetric(parsed.metric)) {
      return DEFAULT_HOME_METRIC_PREFERENCE;
    }
    return { schemaVersion: HOME_METRIC_SCHEMA_VERSION, metric: parsed.metric };
  } catch {
    return DEFAULT_HOME_METRIC_PREFERENCE;
  }
}

/** Serialize a preference for storage. */
export function serializeHomeMetricPreference(preference: HomeMetricPreference): string {
  return JSON.stringify(preference);
}

function resolveStorage(storage?: KeyValueStorage): KeyValueStorage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

/** Read the 잔디 metric preference from local storage. */
export function loadHomeMetricPreference(storage?: KeyValueStorage): HomeMetricPreference {
  const store = resolveStorage(storage);
  if (!store) return DEFAULT_HOME_METRIC_PREFERENCE;
  try {
    return parseHomeMetricPreference(store.getItem(HOME_METRIC_KEY));
  } catch {
    return DEFAULT_HOME_METRIC_PREFERENCE;
  }
}

/** Persist the 잔디 metric preference to local storage. */
export function saveHomeMetricPreference(
  metric: ContributionMetric,
  storage?: KeyValueStorage,
): void {
  const store = resolveStorage(storage);
  if (!store) return;
  try {
    store.setItem(
      HOME_METRIC_KEY,
      serializeHomeMetricPreference({ schemaVersion: HOME_METRIC_SCHEMA_VERSION, metric }),
    );
  } catch {
    // localStorage can be unavailable (private mode / quota); a failed write
    // just means the lens choice is not persisted, not a crash.
  }
}
