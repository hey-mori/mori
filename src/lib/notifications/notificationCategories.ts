/**
 * Notification category mapping — the single source of truth that turns a
 * `CompanionNotificationKind` into the user-facing preference category it
 * belongs to, so both the in-app feed and the OS gate honor the same mute
 * switches (`NotificationsCard`).
 *
 * Mute semantics (kept in one place so nothing else has to reason about the
 * field name): `NotificationPreferences.enabled[category] === true` means the
 * user turned that category OFF (muted). The default is `false` for every
 * category, i.e. notifications fire, so wiring these switches never changes
 * behavior until the user flips one. A kind with no category (safety and
 * informational notices) is never mutable.
 */
import type { CompanionNotificationKind } from "./notification";
import type {
  NotificationCategory,
  NotificationPreferences,
} from "../settings/notificationPreferences";

/**
 * The category a notification kind belongs to, or `null` when the kind must
 * never be user-muted. `storage_write_failure` is a safety signal (a save did
 * not complete) and `demo_mode_notice` / `real_session_gap` are informational
 * product-state notices, so all three stay unmutable. Reserved categories
 * (`tokenAnomaly`, `sourceDisconnected`, `projectSummaryChanged`) have no
 * emitting kind yet; they map in when their producers land.
 */
export function notificationCategoryForKind(
  kind: CompanionNotificationKind,
): NotificationCategory | null {
  switch (kind) {
    case "import_finished":
    case "import_ready":
    case "background_detection":
      return "importComplete";
    case "live_follow_update":
      return "longRunningSessionUpdated";
    case "package_export_ready":
    case "ready_to_report":
      return "reportReady";
    case "stale_memory":
    case "memory_stale_detected":
    case "memory_contradiction_detected":
      return "memoryReviewNeeded";
    case "needs_review":
    case "unresolved_issue":
    case "important_decision":
    case "background_analysis_ready":
      return "decisionIssueReviewNeeded";
    default:
      // demo_mode_notice, real_session_gap, weak_evidence,
      // suggested_next_action, ready_to_resume, storage_write_failure.
      return null;
  }
}

/**
 * Whether a notification of this kind is currently muted by the user's
 * preferences. Uncategorized kinds are never muted.
 */
export function isNotificationKindMuted(
  kind: CompanionNotificationKind,
  preferences: NotificationPreferences,
): boolean {
  const category = notificationCategoryForKind(kind);
  if (!category) return false;
  return preferences.enabled[category] === true;
}
