import type { KeyValueStorage } from "../storage/storageTypes";

const NOTIFICATION_KEY = "mori.notificationPreferences";
const NOTIFICATION_SCHEMA_VERSION = 1 as const;

export const NOTIFICATION_CATEGORIES = [
  "importComplete",
  "longRunningSessionUpdated",
  "reportReady",
  "memoryReviewNeeded",
  "decisionIssueReviewNeeded",
  "tokenAnomaly",
  "sourceDisconnected",
  "projectSummaryChanged",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export type NotificationPreferences = {
  schemaVersion: typeof NOTIFICATION_SCHEMA_VERSION;
  enabled: Record<NotificationCategory, boolean>;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  schemaVersion: NOTIFICATION_SCHEMA_VERSION,
  enabled: {
    importComplete: false,
    longRunningSessionUpdated: false,
    reportReady: false,
    memoryReviewNeeded: false,
    decisionIssueReviewNeeded: false,
    tokenAnomaly: false,
    sourceDisconnected: false,
    projectSummaryChanged: false,
  },
};

export function parseNotificationPreferences(raw: string | null): NotificationPreferences {
  if (!raw) return cloneDefault();
  try {
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
    if (parsed.schemaVersion !== NOTIFICATION_SCHEMA_VERSION || !parsed.enabled) {
      return cloneDefault();
    }
    return {
      schemaVersion: NOTIFICATION_SCHEMA_VERSION,
      enabled: Object.fromEntries(
        NOTIFICATION_CATEGORIES.map((category) => [
          category,
          parsed.enabled?.[category] === true,
        ]),
      ) as Record<NotificationCategory, boolean>,
    };
  } catch {
    return cloneDefault();
  }
}

export function serializeNotificationPreferences(preferences: NotificationPreferences): string {
  return JSON.stringify(preferences);
}

export function loadNotificationPreferences(storage?: KeyValueStorage): NotificationPreferences {
  const store = resolveStorage(storage);
  if (!store) return cloneDefault();
  try {
    return parseNotificationPreferences(store.getItem(NOTIFICATION_KEY));
  } catch {
    return cloneDefault();
  }
}

export function saveNotificationPreferences(
  preferences: NotificationPreferences,
  storage?: KeyValueStorage,
): void {
  const store = resolveStorage(storage);
  if (!store) return;
  try {
    store.setItem(NOTIFICATION_KEY, serializeNotificationPreferences(preferences));
  } catch {
    // Notification settings are a UI preference; storage failure should not
    // break the preferences surface.
  }
}

export function setNotificationPreference(
  preferences: NotificationPreferences,
  category: NotificationCategory,
  enabled: boolean,
): NotificationPreferences {
  return {
    schemaVersion: NOTIFICATION_SCHEMA_VERSION,
    enabled: {
      ...preferences.enabled,
      [category]: enabled,
    },
  };
}

function resolveStorage(storage?: KeyValueStorage): KeyValueStorage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function cloneDefault(): NotificationPreferences {
  return {
    schemaVersion: NOTIFICATION_SCHEMA_VERSION,
    enabled: { ...DEFAULT_NOTIFICATION_PREFERENCES.enabled },
  };
}
