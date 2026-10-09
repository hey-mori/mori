/**
 * Which notification, if any, deserves a toast: one that newly arrived during
 * this run, not one a view merely derived again from stored state.
 *
 * `import_finished` items come from three producers: the open session's
 * recent imports (re-derived whenever a session is opened), the per-session
 * feed (dated by when the session started) and the auto-import pass summary
 * (dated by that pass). Opening a session imported yesterday re-derives its
 * 가져오기 완료 item; that is a load, not a new import, and stays quiet. An
 * item of this kind toasts only when it is dated within this run.
 */
import type { CompanionNotification } from "./notification";

const DERIVED_FROM_HISTORY = new Set<CompanionNotification["kind"]>(["import_finished"]);

export function isDerivedFromHistory(notification: Pick<CompanionNotification, "kind">): boolean {
  return DERIVED_FROM_HISTORY.has(notification.kind);
}

export function toastArrival(
  notifications: readonly CompanionNotification[],
  knownIds: ReadonlySet<string>,
  runStartedAt: number,
): CompanionNotification | null {
  for (const notification of notifications) {
    if (knownIds.has(notification.id)) continue;
    if (isDerivedFromHistory(notification)) {
      const at = Date.parse(notification.createdAt ?? "");
      // Dated before this run started (or undated): history, not an arrival.
      if (Number.isNaN(at) || at < runStartedAt) continue;
    }
    return notification;
  }
  return null;
}
