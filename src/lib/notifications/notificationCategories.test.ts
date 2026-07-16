import { describe, expect, it } from "vitest";
import {
  isNotificationKindMuted,
  notificationCategoryForKind,
} from "./notificationCategories";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  setNotificationPreference,
  type NotificationPreferences,
} from "../settings/notificationPreferences";

function prefs(): NotificationPreferences {
  return {
    schemaVersion: DEFAULT_NOTIFICATION_PREFERENCES.schemaVersion,
    enabled: { ...DEFAULT_NOTIFICATION_PREFERENCES.enabled },
    toastPosition: DEFAULT_NOTIFICATION_PREFERENCES.toastPosition,
  };
}

describe("notificationCategoryForKind", () => {
  it("maps import kinds to importComplete", () => {
    expect(notificationCategoryForKind("import_finished")).toBe("importComplete");
    expect(notificationCategoryForKind("import_ready")).toBe("importComplete");
    expect(notificationCategoryForKind("background_detection")).toBe("importComplete");
  });

  it("maps review and memory kinds to their categories", () => {
    expect(notificationCategoryForKind("live_follow_update")).toBe("longRunningSessionUpdated");
    expect(notificationCategoryForKind("package_export_ready")).toBe("reportReady");
    expect(notificationCategoryForKind("memory_contradiction_detected")).toBe("memoryReviewNeeded");
    expect(notificationCategoryForKind("needs_review")).toBe("decisionIssueReviewNeeded");
  });

  it("never categorizes safety or informational kinds", () => {
    expect(notificationCategoryForKind("storage_write_failure")).toBeNull();
    expect(notificationCategoryForKind("demo_mode_notice")).toBeNull();
    expect(notificationCategoryForKind("real_session_gap")).toBeNull();
  });
});

describe("isNotificationKindMuted", () => {
  it("is false for every kind by default (default false means enabled)", () => {
    const p = prefs();
    expect(isNotificationKindMuted("import_finished", p)).toBe(false);
    expect(isNotificationKindMuted("live_follow_update", p)).toBe(false);
  });

  it("mutes only the kinds in a category the user turned off", () => {
    const p = setNotificationPreference(prefs(), "importComplete", true);
    expect(isNotificationKindMuted("import_finished", p)).toBe(true);
    expect(isNotificationKindMuted("import_ready", p)).toBe(true);
    // A different category is unaffected.
    expect(isNotificationKindMuted("live_follow_update", p)).toBe(false);
  });

  it("cannot mute a safety signal even if some category is off", () => {
    const p = setNotificationPreference(prefs(), "importComplete", true);
    expect(isNotificationKindMuted("storage_write_failure", p)).toBe(false);
  });
});
