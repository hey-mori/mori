/**
 * OS-native notification effect.
 *
 * Watches the same composed notification feed the in-app bell renders, runs the
 * tested `selectOsNotifications` gate (only just-completed / just-detected kinds,
 * deduped, fresh, not muted, cooled-down), and fires an OS-native notification
 * for each new one through `sendOsNotification`. Already-fired ids are remembered
 * for the session so a feed that recomputes every render never re-pings, and a
 * per-kind ping time collapses a kind that re-emits with a fresh id each cycle
 * (the 90s auto-import pass re-notifying a still-growing session). Desktop-only in
 * effect: the bridge no-ops in the browser. The policy is entirely here + in the
 * gate, so the OS layer stays a thin, honest sink over the in-app feed.
 */
import { useEffect, useRef } from "react";
import type {
  CompanionNotification,
  CompanionNotificationKind,
} from "../../lib/notifications/notification";
import { selectOsNotifications } from "../../lib/notifications/osNotification";
import { isNotificationKindMuted } from "../../lib/notifications/notificationCategories";
import { loadNotificationPreferences } from "../../lib/settings/notificationPreferences";
import { sendOsNotification } from "../../lib/desktop/osNotificationBridge";

/** How long (ms) to wait before a second OS ping of a re-emitting kind. Longer
 *  than the 90s auto-import pass, so a still-growing session pings at most once
 *  per window while the in-app feed still shows every pass. */
const IMPORT_FINISHED_OS_COOLDOWN_MS = 5 * 60 * 1000;

export function useOsNotifications(notifications: CompanionNotification[]): void {
  const notifiedRef = useRef<Set<string>>(new Set());
  const lastPingByKindRef = useRef<Partial<Record<CompanionNotificationKind, number>>>({});

  useEffect(() => {
    const preferences = loadNotificationPreferences();
    const fresh = selectOsNotifications(notifications, {
      alreadyNotifiedIds: notifiedRef.current,
      isMuted: (kind) => isNotificationKindMuted(kind, preferences),
      cooldownByKind: { import_finished: IMPORT_FINISHED_OS_COOLDOWN_MS },
      lastNotifiedAtByKind: lastPingByKindRef.current,
    });
    for (const payload of fresh) {
      notifiedRef.current.add(payload.notificationId);
      lastPingByKindRef.current[payload.kind] = Date.now();
      void sendOsNotification(payload);
    }
  }, [notifications]);
}
