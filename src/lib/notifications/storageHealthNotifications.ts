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
): CompanionNotification[] {
  if (!failure) return [];
  return [
    {
      id: "storage-quota",
      kind: "storage_write_failure",
      severity: "risk",
      title: "앱 저장 공간이 가득 찼어요",
      message:
        "디스크가 아니라 Mori 앱 내부 저장 공간이에요 · 디스크 여유 공간과는 무관합니다. 오래된 세션을 정리하거나 .mori 패키지로 내보낸 뒤 다시 시도하세요.",
      basis: "state",
      linkedItemIds: [],
      evidenceRefs: [],
      actionLabel: "설정 열기",
      actionTarget: { kind: "view", view: "settings" },
      createdAt: failure.at,
    },
  ];
}
