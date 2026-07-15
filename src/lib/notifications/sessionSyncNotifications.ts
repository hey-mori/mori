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

  const parts: string[] = [];
  if (newCount > 0) parts.push(`새 세션 ${newCount}건`);
  if (updatedCount > 0) parts.push(`업데이트 ${updatedCount}건`);

  const title =
    newCount > 0 ? `세션 ${newCount}건 새로 수집` : `세션 ${updatedCount}건 업데이트`;

  return {
    id: `sessions-imported:${input.at}`,
    kind: "import_finished",
    severity: "info",
    title,
    message: parts.join(" · "),
    basis: "verified",
    linkedItemIds: [],
    evidenceRefs: [],
    actionLabel: "세션 열기",
    actionTarget: { kind: "view", view: "sessions" },
    createdAt: input.at,
  };
}
