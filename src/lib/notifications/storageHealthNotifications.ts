import type { StorageFallbackEvent } from "../storage/storageFallback";
import type { StorageQuotaFailure } from "../storage/storageQuota";
import type { CompanionNotification } from "./notification";

/**
 * Build the storage-health notification from the latest quota failure.
 *
 * One risk-severity notice: the user's last save did not complete because
 * Mori's own app storage (browser localStorage, ~5–10 MB) is full — NOT the
 * disk. This is the common confusion: the disk has tens of GB free, but the
 * app store is a separate, small bucket, so the copy says so plainly. The calm
 * path out is to export a `.mori` package (preserving the work) and clear old
 * sessions.
 *
 * The id is STABLE (not timestamped): a full store fails many writes in a row,
 * and each should update the one notice in place, never pile up a new unread
 * (and re-fire an OS ping) every time. The notification is state-grounded
 * (`basis: "state"`) and routes to Settings where the storage surface lives.
 */
export function buildStorageHealthNotifications(
  failure: StorageQuotaFailure | null,
  fallback: StorageFallbackEvent | null = null,
): CompanionNotification[] {
  const notices: CompanionNotification[] = [];
  if (fallback) notices.push(buildFallbackNotice(fallback));
  if (!failure) return notices;
  return [
    ...notices,
    {
      id: "storage-quota",
      kind: "storage_write_failure",
      severity: "risk",
      title: "저장 공간 부족",
      message:
        "앱 내부 저장 공간이 가득 찼습니다. 디스크 용량과는 무관하며, 오래된 세션을 정리해 공간을 확보하세요.",
      basis: "state",
      linkedItemIds: [],
      evidenceRefs: [],
      actionLabel: "설정 열기",
      actionTarget: { kind: "view", view: "settings" },
      createdAt: failure.at,
    },
  ];
}

/**
 * Build the notice for a desktop device that is not resting on SQLite.
 *
 * Separate from the quota notice because they are different moments of the
 * same problem and both can be true at once: this one says writes are going
 * into the small store, the quota one says they have stopped fitting. Showing
 * only the second would tell the user their store is full without telling them
 * why it filled.
 *
 * The id is stable for the same reason as the quota notice: a broken SQLite
 * path falls back on every call, and each should update one notice in place
 * rather than pile up unread items and re-fire an OS ping.
 *
 * The copy avoids naming SQLite. What the user can act on is that this device
 * is storing records in the small app store; the engine name belongs in
 * diagnostics, and the reason is carried there rather than in the message.
 */
function buildFallbackNotice(fallback: StorageFallbackEvent): CompanionNotification {
  return {
    id: "storage-fallback",
    kind: "storage_write_failure",
    severity: "risk",
    title: "기록이 임시 저장소에 저장되고 있습니다",
    message:
      "이 기기에서 기록 저장소를 열지 못해 용량이 작은 앱 내부 저장소를 대신 쓰고 있습니다. 기록은 남아 있지만 공간이 곧 가득 찰 수 있습니다.",
    basis: "state",
    linkedItemIds: [],
    evidenceRefs: [],
    actionLabel: "설정 열기",
    actionTarget: { kind: "view", view: "settings" },
    createdAt: fallback.at,
  };
}
