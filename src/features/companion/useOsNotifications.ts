/**
 * OS-native notification effect.
 *
 * Watches the same composed notification feed the in-app bell renders, runs the
 * tested `selectOsNotifications` gate (only just-completed / just-detected kinds,
 * deduped, fresh), and fires an OS-native notification for each new one through
 * `sendOsNotification`. Already-fired ids are remembered for the session so a
 * feed that recomputes every render never re-pings. Desktop-only in effect: the
 * bridge no-ops in the browser. The policy is entirely here + in the gate, so
 * the OS layer stays a thin, honest sink over the in-app feed.
 */
import { useEffect, useRef } from "react";
import type { CompanionNotification } from "../../lib/notifications/notification";
import { selectOsNotifications } from "../../lib/notifications/osNotification";
import { sendOsNotification } from "../../lib/desktop/osNotificationBridge";

export function useOsNotifications(notifications: CompanionNotification[]): void {
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const fresh = selectOsNotifications(notifications, {
      alreadyNotifiedIds: notifiedRef.current,
    });
    for (const payload of fresh) {
      notifiedRef.current.add(payload.notificationId);
      void sendOsNotification(payload);
    }
  }, [notifications]);
}
