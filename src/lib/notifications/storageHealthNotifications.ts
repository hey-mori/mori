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
  readFlipHeldBack: { reason: string; missingKeys: number; at: string } | null = null,
): CompanionNotification[] {
  const notices: CompanionNotification[] = [];
  if (fallback) notices.push(buildFallbackNotice(fallback));
  if (readFlipHeldBack) notices.push(buildReadFlipNotice(readFlipHeldBack));
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

/**
 * Build the notice for a durable read flip that declined to engage.
 *
 * Review severity, not risk: nothing is lost and nothing is in the wrong place,
 * because reads stayed exactly where they already were. What it means is that
 * the SQLite copy is missing something, and that is worth seeing while it is
 * still harmless rather than after the second copy stops being written.
 *
 * The copy says what the user can act on, which is that some of their work has
 * not been copied over yet. Which engine, and which keys, belong in diagnostics.
 */
function buildReadFlipNotice(held: {
  reason: string;
  missingKeys: number;
  at: string;
}): CompanionNotification {
  return {
    id: "storage-read-flip-held-back",
    kind: "storage_write_failure",
    severity: "review",
    title: "일부 기록이 아직 옮겨지지 않았습니다",
    message:
      held.missingKeys > 0
        ? `${held.missingKeys}개 항목이 새 저장소에 아직 없습니다. 지금은 이전 저장소에서 그대로 읽고 있어 사용에는 문제가 없습니다.`
        : "새 저장소를 확인하지 못해 이전 저장소에서 그대로 읽고 있습니다. 사용에는 문제가 없습니다.",
    basis: "state",
    linkedItemIds: [],
    evidenceRefs: [],
    actionLabel: "설정 열기",
    actionTarget: { kind: "view", view: "settings" },
    createdAt: held.at,
  };
}
