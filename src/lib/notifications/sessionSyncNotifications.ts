/**
 * Auto-import sync notification producer.
 *
 * When a background auto-import pass registers newly-discovered or grown agent
 * sessions, it emits ONE aggregate notification ("세션 N건 새로 수집") rather than
 * a per-session card — the bell feed is an event stream, not a triage list. The
 * notice deep-links into the 세션 workspace, which always resolves. Returns null
 * when the pass brought in nothing, so a quiet poll stays silent.
 */
import type { CompanionNotification } from "./notification";

export type SessionSyncInput = {
  /** Sessions registered for the first time this pass. */
  newCount: number;
  /** Previously-registered sessions that changed this pass. */
  updatedCount: number;
  /** ISO time of the sync — required so the OS gate + recency sort work. */
  at: string;
};

export function buildSessionSyncNotification(
  input: SessionSyncInput,
): CompanionNotification | null {
  const newCount = Math.max(0, Math.floor(input.newCount));
  const updatedCount = Math.max(0, Math.floor(input.updatedCount));
  if (newCount + updatedCount === 0) return null;

  // Title carries the primary count; the body says what was collected and where
  // it went, so it never just restates the title.
  const title =
    newCount > 0 ? `새 세션 ${newCount}건 수집` : `세션 ${updatedCount}건 업데이트`;
  const message =
    newCount > 0 && updatedCount > 0
      ? `연결된 에이전트의 새 작업을 담았고, 이어서 진행된 세션 ${updatedCount}건도 함께 업데이트했습니다.`
      : newCount > 0
        ? "연결된 에이전트의 새 작업을 세션 목록에 담았습니다."
        : "이어서 진행된 작업을 세션 목록에 반영했습니다.";

  return {
    id: `sessions-imported:${input.at}`,
    kind: "import_finished",
    severity: "info",
    title,
    message,
    basis: "verified",
    linkedItemIds: [],
    evidenceRefs: [],
    actionLabel: "세션 열기",
    actionTarget: { kind: "view", view: "sessions" },
    createdAt: input.at,
  };
}
