import {
  Bell,
  CheckCircle2,
  FileText,
  Lightbulb,
  PackageCheck,
  ShieldAlert,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { MoriNotification, MoriNotificationKind } from "./notification";

/**
 * Shared presentation helpers for the notification feed.
 *
 * Both surfaces — the bell popover and the 알림 page — render the same feed, so
 * the icon vocabulary and the relative-time format live here once. Keeping them
 * shared is what stops the two surfaces from drifting apart.
 */

/** Icon for a notification kind — by what it is *about*, not who raised it. */
export function notificationIcon(kind: MoriNotificationKind): LucideIcon {
  switch (kind) {
    case "weak_evidence":
    case "memory_contradiction_detected":
      return ShieldAlert;
    case "needs_review":
    case "unresolved_issue":
    case "stale_memory":
    case "memory_stale_detected":
      return CheckCircle2;
    case "import_ready":
    case "import_finished":
    case "real_session_gap":
      return FileText;
    case "ready_to_report":
    case "package_export_ready":
      return PackageCheck;
    case "suggested_next_action":
    case "ready_to_resume":
      return Lightbulb;
    case "important_decision":
      return Sparkles;
    case "demo_mode_notice":
    default:
      return Bell;
  }
}

/**
 * Compact Korean relative time for a feed item. Live triage notices have no
 * timestamp and read as "방금" — they describe the session right now.
 */
export function formatNotificationTime(
  createdAt: string | undefined,
  now: number = Date.now(),
): string {
  if (!createdAt) return "방금";
  const time = new Date(createdAt).getTime();
  if (Number.isNaN(time)) return "";
  const diff = now - time;
  if (diff < 60_000) return "방금";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  const date = new Date(time);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/**
 * The feed item's source label — the project the event belongs to, shown in the
 * meta line next to the relative time. Returns null when the notification has
 * no project context (a current-session triage notice).
 */
export function notificationProjectLabel(notification: MoriNotification): string | null {
  return notification.source?.projectLabel?.trim() || null;
}
