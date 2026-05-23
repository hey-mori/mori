import { useMemo } from "react";
import {
  composeNotifications,
  companionSignalToNotification,
  type MoriNotification,
  type MoriNotificationActionTarget,
} from "../../lib/notifications/notification";
import {
  getCompanionSignalActionTarget,
  type CompanionSignal,
} from "../../lib/companion/companionSignals";
import { useCompanionSignals } from "./useCompanionSignals";

/**
 * Producer-neutral notifications hook.
 *
 * The Mori 노트 panel today renders Companion signals directly. As more
 * producers come online (an import-finished pulse, a memory-stale detector,
 * a package-export-ready ping), each one will emit `MoriNotification[]`,
 * and this hook composes them into the single feed the renderer consumes.
 *
 * Adding a producer is a one-line `composeNotifications` entry here — the
 * renderer never has to know about it. This keeps the seam from
 * `lib/notifications/notification.ts` live in production code, not just in
 * tests, so future producers slot in without a surface rewrite.
 *
 * Companion signals are translated into notifications with their original
 * navigation target preserved (`view` / `review` selection), so a click on
 * a "결정 6건 확인 필요" notification still opens the insights tab on the
 * right item.
 */
export function useMoriNotifications(): {
  notifications: MoriNotification[];
  isDemo: boolean;
} {
  const { feed, isDemo } = useCompanionSignals();

  const companionNotifications = useMemo<MoriNotification[]>(() => {
    return feed.map((signal) =>
      companionSignalToNotification(signal, resolveTarget(signal)),
    );
  }, [feed]);

  // Future producers fan in here. Order = priority for the compose-time
  // dedupe — earlier feeds win when two producers raise the same id.
  const notifications = useMemo(
    () => composeNotifications([companionNotifications]),
    [companionNotifications],
  );

  return { notifications, isDemo };
}

/**
 * Translate a Companion signal's action into the producer-neutral target
 * shape MoriNotification carries. Centralised so any producer can reuse the
 * same translation without re-implementing the Companion's quirks.
 */
function resolveTarget(signal: CompanionSignal): MoriNotificationActionTarget {
  const target = getCompanionSignalActionTarget(signal);
  if (!target) return null;
  if (target.kind === "review") {
    return { kind: "review", selection: target.selection };
  }
  return { kind: "view", view: target.view };
}
