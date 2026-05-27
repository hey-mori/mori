import type { StoredSessionSummary } from "../storage/storageTypes";
import type { MoriNotification } from "./notification";

/**
 * Cross-session notification feed.
 *
 * The Companion layer derives *triage signals from the active session only*.
 * That makes a fine "what needs a glance right now" surface, but it is not a
 * notification feed — a feed is a time-ordered record of things that happened
 * across every session, accumulating as work lands.
 *
 * This module is that missing producer: it turns each stored session summary
 * into a timestamped notification ("이 세션이 정리됐어요 · 프로젝트 · 2시간 전"),
 * so the bell and the 알림 page read as a real activity stream. It is pure and
 * honest by construction — every item traces to a real stored session; nothing
 * is invented, and a session with no anchor time is skipped rather than faked.
 *
 * Extensible by design: a session can emit more than one event later (imported
 * → analyzed → reviewed) just by pushing additional records here, all keyed off
 * the same `feed:<sessionId>:<event>` id scheme so dedupe and read-state stay
 * stable.
 */

/** Trailing path segment of a source label, e.g. "C:/dev/ng-gw" → "ng-gw". */
function shortProjectName(label?: string): string | undefined {
  const trimmed = label?.trim();
  if (!trimmed) return undefined;
  const parts = trimmed.split(/[\\/]/).filter(Boolean);
  const tail = parts.length > 0 ? parts[parts.length - 1]! : trimmed;
  return tail.length <= 22 ? tail : `${tail.slice(0, 21)}…`;
}

function anchorIso(session: StoredSessionSummary): string | undefined {
  return session.startedAt ?? session.savedAt;
}

/**
 * One feed notification per stored session, describing its current state as a
 * timestamped event. Newest sessions naturally sort to the top once the caller
 * orders by `createdAt`. Sessions without any anchor time are skipped.
 */
export function buildSessionFeedNotifications(
  sessions: StoredSessionSummary[],
): MoriNotification[] {
  const out: MoriNotification[] = [];
  for (const session of sessions) {
    const createdAt = anchorIso(session);
    if (!createdAt) continue;

    const projectLabel = shortProjectName(session.sourceLabel) ?? session.projectName;
    const source = {
      projectLabel,
      sessionTitle: session.title,
      sessionId: session.sessionId,
    };

    const { message, severity } = describeSessionEvent(session.status);

    out.push({
      id: `feed:${session.sessionId}:captured`,
      kind: "import_finished",
      severity,
      title: session.title,
      message,
      basis: "verified",
      linkedItemIds: [],
      evidenceRefs: [],
      actionLabel: "세션 열기",
      actionTarget: { kind: "session", sessionId: session.sessionId },
      createdAt,
      source,
    });
  }
  return out;
}

function describeSessionEvent(status: StoredSessionSummary["status"]): {
  message: string;
  severity: MoriNotification["severity"];
} {
  switch (status) {
    case "complete":
      return { message: "분석이 끝나 이슈·결정을 검토할 수 있어요.", severity: "review" };
    case "analyzing":
      return { message: "분석을 진행하고 있어요.", severity: "info" };
    case "recording":
    default:
      return { message: "작업 세션이 추가됐어요.", severity: "info" };
  }
}
