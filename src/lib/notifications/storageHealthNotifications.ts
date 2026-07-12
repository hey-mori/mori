import type { StorageQuotaFailure } from "../storage/storageQuota";
import type { CompanionNotification } from "./notification";

/**
 * Build the storage-health notification from the latest quota failure.
 *
 * One risk-severity notice: the user's last save did not complete because
 * browser storage is full. Honest and actionable — the calm path out is to
 * export a `.mori` package (freeing nothing by itself, but preserving the
 * work) and clear old sessions. The notification is state-grounded
 * (`basis: "state"`, no evidence refs) and routes to Settings where the
 * storage surface lives.
 */
export function buildStorageHealthNotifications(
  failure: StorageQuotaFailure | null,
): CompanionNotification[] {
  if (!failure) return [];
  return [
    {
      id: `storage-quota:${failure.at}`,
      kind: "storage_write_failure",
      severity: "risk",
      title: "저장 공간이 가득 찼습니다",
      message:
        "마지막 저장이 완료되지 않았습니다. 오래된 세션을 정리하거나 .mori 패키지로 내보낸 뒤 다시 시도하세요.",
      basis: "state",
      linkedItemIds: [],
      evidenceRefs: [],
      actionLabel: "설정 열기",
      actionTarget: { kind: "view", view: "settings" },
      createdAt: failure.at,
    },
  ];
}
