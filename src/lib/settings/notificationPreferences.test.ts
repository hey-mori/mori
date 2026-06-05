import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_TOAST_POSITIONS,
  parseNotificationPreferences,
  serializeNotificationPreferences,
  setNotificationPreference,
  setNotificationToastPosition,
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
    expect(parsed.toastPosition).toBe("topRight");
  });

  it("round-trips the toast position and rejects unknown positions", () => {
    const next = setNotificationToastPosition(
      DEFAULT_NOTIFICATION_PREFERENCES,
      "bottomRight",
    );
    const parsed = parseNotificationPreferences(serializeNotificationPreferences(next));
    expect(parsed.toastPosition).toBe("bottomRight");

    const malformed = JSON.stringify({
      schemaVersion: DEFAULT_NOTIFICATION_PREFERENCES.schemaVersion,
      enabled: {},
      toastPosition: "center",
    });
    expect(parseNotificationPreferences(malformed).toastPosition).toBe("topRight");
    expect(NOTIFICATION_TOAST_POSITIONS).toContain("topLeft");
  });
});
