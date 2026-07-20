import type { CompanionNotification } from "./notification";

/**
 * Build "백그라운드 감지" notifications from the background watcher's detections.
 *
 * The background watch surfaces newly-arrived or grown connector files while the
 * app is open; each becomes a feed event that deep-links into the 소스 surface
 * (the `connections` view), where the inbox file is listed and importing it is
 * the review-gated next step. A detection is a pointer, never an applied import
 * — the watcher does not write to memory on its own.
 *
 * This is a producer feeding `composeNotifications` from `useNotifications`,
 * slotting in the same way as the import-finished and package-export pulses. Id
 * is stable per path (`background-detection:<path>`) so the renderer's dedupe
 * never doubles a single detection, and the eligible kind earns an OS ping so a
 * session that ran while you were elsewhere reaches you.
 */
export type DetectedInboxNotice = {
  path: string;
  fileName: string;
  kind: "new" | "updated";
  detectedAt: string;
};

/** Cap so a burst of inbox activity never floods the feed. */
const DEFAULT_LIMIT = 5;

export function buildBackgroundDetectionNotifications(
  detections: readonly DetectedInboxNotice[],
  limit = DEFAULT_LIMIT,
): CompanionNotification[] {
  return [...detections]
    .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
    .slice(0, limit)
    .map(toNotification);
}

function toNotification(detection: DetectedInboxNotice): CompanionNotification {
  // The title states what happened; the file name belongs in the body as
  // context, not chained into the headline.
  const title = detection.kind === "new" ? "새 작업을 찾았습니다" : "작업이 더 진행됐습니다";
  return {
    id: `background-detection:${detection.path}`,
    kind: "background_detection",
    severity: "info",
    title,
    message:
      detection.kind === "new"
        ? `연동한 에이전트에서 ${detection.fileName} 작업을 확인했습니다. 검토한 뒤 가져올 수 있습니다.`
        : `${detection.fileName} 작업이 이어졌습니다. 검토한 뒤 가져올 수 있습니다.`,
    basis: "verified",
    linkedItemIds: [],
    evidenceRefs: [],
    actionLabel: "연동 열기",
    actionTarget: { kind: "view", view: "connections" },
    createdAt: detection.detectedAt,
  };
}
