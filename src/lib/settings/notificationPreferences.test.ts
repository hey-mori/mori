import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  parseNotificationPreferences,
  serializeNotificationPreferences,
  setNotificationPreference,
} from "./notificationPreferences";

describe("notificationPreferences", () => {
  it("falls back to defaults for missing or malformed settings", () => {
    expect(parseNotificationPreferences(null)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(parseNotificationPreferences("{nope")).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(parseNotificationPreferences(JSON.stringify({ schemaVersion: 99 }))).toEqual(
      DEFAULT_NOTIFICATION_PREFERENCES,
    );
  });

  it("round-trips known notification categories and drops unknown shape", () => {
    const next = setNotificationPreference(
      DEFAULT_NOTIFICATION_PREFERENCES,
      "reportReady",
      true,
    );
    const parsed = parseNotificationPreferences(serializeNotificationPreferences(next));
    expect(parsed.enabled.reportReady).toBe(true);
    expect(parsed.enabled.importComplete).toBe(false);
  });
});
