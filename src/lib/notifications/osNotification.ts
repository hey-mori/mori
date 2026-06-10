/**
 * OS-native notification bridge — the pure gate + mapping that turns the
 * in-app companion feed into the handful of notices worth an OS-level ping.
 *
 * Mori already composes a rich in-app feed (`composeNotifications`) and the
 * `signalPolicy` decides when an abstract signal *may* escalate to "system"
 * delivery. What was missing is the seam between the rendered feed and the
 * desktop's OS notification plugin: which `CompanionNotification`s deserve to
 * interrupt the user at the OS level, and what `{ title, body }` each becomes.
 *
 * The doctrine is "manage attention, not maximise visibility" (see
 * `signalPolicy.ts` and `docs/live-project-intelligence.md`). So this gate is
 * deliberately narrow:
 *  - Only a small allowlist of "something just completed or was detected" kinds
 *    is OS-eligible; everything else stays in the in-app feed.
 *  - The caller passes the ids it has already OS-notified, so a feed that
 *    recomputes every render never re-fires the same ping. Repeats inside one
 *    batch are deduped too.
 *  - A freshness window drops stale notices, so opening the app does not replay
 *    a backlog of historical completions as a burst of OS toasts.
 *
 * Pure and synchronous: the desktop shell calls `selectOsNotifications`, then
 * hands each payload to the Tauri notification plugin (after a permission
 * check). No IO, no timer, no Tauri here — so the policy stays testable.
 */
import type { CompanionNotification, CompanionNotificationKind } from "./notification";

/**
 * A minimal OS-native notification payload — what the desktop shell hands to
 * the Tauri notification plugin. `notificationId` traces it back to the feed
 * item so the shell can record it as already-notified.
 */
export type OsNotificationPayload = {
  title: string;
  body: string;
  notificationId: string;
};

/**
 * Kinds important enough to interrupt at the OS level: each names something
 * that just *completed* or was just *detected*, where a delayed in-app glance
 * would miss the moment. Quality / triage / suggestion kinds (weak_evidence,
 * needs_review, suggested_next_action, …) stay in the in-app feed by design —
 * they are ambient, not time-sensitive.
 */
export const OS_ELIGIBLE_KINDS: ReadonlySet<CompanionNotificationKind> = new Set([
  "import_finished",
  "package_export_ready",
  "live_follow_update",
  "memory_contradiction_detected",
]);

/** How old (ms) an eligible notice may be and still earn an OS ping. Beyond
 *  this it is history, so app-start does not replay a backlog of completions. */
const DEFAULT_MAX_AGE_MS = 2 * 60 * 1000;

const TITLE_MAX = 100;
const BODY_MAX = 240;

export type SelectOsNotificationsOptions = {
  /** Feed-item ids already delivered to the OS, so they are not re-fired. */
  alreadyNotifiedIds?: Iterable<string>;
  /** Drop eligible notices older than this many ms (default 2 min). */
  maxAgeMs?: number;
  /** Clock injection point for tests; defaults to now. */
  now?: number;
};

/** Whether a notification kind is eligible for an OS-level ping at all. */
export function isOsEligibleKind(kind: CompanionNotificationKind): boolean {
  return OS_ELIGIBLE_KINDS.has(kind);
}

/**
 * Map a companion notification to its OS payload. Korean-first, mirroring the
 * in-app copy: the OS title carries the project context when present so a
 * cross-project ping reads as "where", and both fields are whitespace-collapsed
 * and clamped to OS-sensible lengths.
 */
export function toOsNotificationPayload(notification: CompanionNotification): OsNotificationPayload {
  const project = notification.source?.projectLabel?.trim();
  const baseTitle = collapse(notification.title);
  const title = project ? `${collapse(project)} · ${baseTitle}` : baseTitle;
  return {
    title: clamp(title, TITLE_MAX),
    body: clamp(collapse(notification.message), BODY_MAX),
    notificationId: notification.id,
  };
}

/**
 * Select the feed items that should fire an OS-native notification this tick:
 * OS-eligible by kind, not already notified (across calls and within the
 * batch), and fresh enough. Returns ready-to-send payloads in feed order.
 */
export function selectOsNotifications(
  notifications: readonly CompanionNotification[],
  options: SelectOsNotificationsOptions = {},
): OsNotificationPayload[] {
  const seen = new Set<string>(options.alreadyNotifiedIds ?? []);
  const maxAgeMs = Math.max(0, options.maxAgeMs ?? DEFAULT_MAX_AGE_MS);
  const now = options.now ?? Date.now();

  const out: OsNotificationPayload[] = [];
  for (const notification of notifications) {
    if (!isOsEligibleKind(notification.kind)) continue;
    if (seen.has(notification.id)) continue;
    if (isStale(notification, now, maxAgeMs)) continue;
    seen.add(notification.id);
    out.push(toOsNotificationPayload(notification));
  }
  return out;
}

/**
 * A notice with a `createdAt` is stale once it is older than the window. A
 * notice without one is a recomputed current-session triage item ("방금"), so
 * it is never aged out here — eligibility + dedupe already bound it.
 */
function isStale(notification: CompanionNotification, now: number, maxAgeMs: number): boolean {
  if (!notification.createdAt) return false;
  const created = Date.parse(notification.createdAt);
  if (!Number.isFinite(created)) return false;
  return now - created > maxAgeMs;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clamp(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
