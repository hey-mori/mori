/**
 * Which notification, if any, deserves a toast: one that newly arrived during
 * this run, not one a view merely derived again. The feed is recomputed from
 * stored state, so opening a session imported yesterday re-derives its
 * "가져오기 완료" item; that is a load, not a new import, and stays quiet.
 */
import type { CompanionNotification } from "./notification";

/** Kinds whose item is derived from stored history by whatever view is open. */
const DERIVED_FROM_HISTORY = new Set<CompanionNotification["kind"]>(["import_finished"]);

export function toastArrival(
  notifications: readonly CompanionNotification[],
  knownIds: ReadonlySet<string>,
  runStartedAt: number,
): CompanionNotification | null {
  for (const notification of notifications) {
    if (knownIds.has(notification.id)) continue;
    if (DERIVED_FROM_HISTORY.has(notification.kind)) {
      const at = Date.parse(notification.createdAt ?? "");
      // Written before this run started (or undated): history, not an arrival.
      if (Number.isNaN(at) || at < runStartedAt) continue;
    }
    return notification;
  }
  return null;
}
