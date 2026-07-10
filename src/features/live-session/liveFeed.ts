/**
 * Live feed model: merge every followed session's accumulated work into one
 * time-ordered stream of request blocks, newest request on top. Pure derivation
 * over the same import + request-span path a session view uses, so what the live
 * feed shows matches what those sessions would show once imported.
 *
 * Each followed session is projected to events, segmented into requests
 * (`buildRequestSpans`), and every request across every session is merged and
 * sorted newest-first. Consecutive identical work items collapse into one with a
 * repeat count, so a burst of the same line (a repeated error, a rate-limit
 * notice) reads as "×N" instead of flooding the block.
 */
import { buildImportCandidateFromClaudeCodeSession } from "../../lib/claude/claudeImport";
import type { ClaudeCodeSessionMeta } from "../../lib/claude/types";
import { buildFollowSubject, type AgentStoreFollowState } from "../../lib/live-follow";
import { buildRequestSpans } from "../../lib/timeline/requestSpans";
import type { EventActor, FileTouch, TimelineEvent } from "../../domain/types";

export type FollowedSession = {
  meta: ClaudeCodeSessionMeta;
  follow: AgentStoreFollowState;
};

export type LiveFeedItem = {
  id: string;
  actor: EventActor;
  toolName?: string;
  text: string;
  fileTouches: FileTouch[];
  /** >1 when consecutive identical items were collapsed. */
  repeatCount: number;
};

export type LiveFeedRequest = {
  /** Stable id: session file + request span id. */
  id: string;
  /** The session's file path, a stable session identity across polls. */
  sessionKey: string;
  /** Short session label (project basename). */
  sessionLabel: string;
  requestTitle: string;
  /** ISO start of the opening ask. */
  startedAt: string;
  /** ISO of the latest activity in the request. */
  updatedAt: string;
  items: LiveFeedItem[];
};

/**
 * Build the merged, newest-first live feed from every followed session. Requests
 * with no work yet are still shown (the ask landed, work is coming). Capped to
 * `limit` most-recent requests so the feed stays about what is happening now.
 */
export function buildLiveFeed(
  sessions: readonly FollowedSession[],
  opts: { limit?: number } = {},
): LiveFeedRequest[] {
  const limit = opts.limit ?? 60;
  const requests: LiveFeedRequest[] = [];

  for (const { meta, follow } of sessions) {
    if (follow.messages.length === 0) continue;
    const subject = buildFollowSubject(follow, {
      sessionId: meta.sessionId,
      title: meta.title,
      startedAt: meta.startedAt,
      projectName: meta.projectName,
      filePath: meta.filePath,
      projectPath: meta.projectPath,
      tokenUsage: meta.tokenUsage,
    });
    const { events } = buildImportCandidateFromClaudeCodeSession(subject, {
      projectId: meta.filePath,
      sessionId: meta.sessionId,
      capturedAt: meta.startedAt,
    });
    const spans = buildRequestSpans(events);
    const byId = new Map(events.map((event) => [event.id, event]));
    const sessionLabel = sessionShortLabel(meta);

    for (const span of spans) {
      const spanEvents = span.eventIds
        .map((id) => byId.get(id))
        .filter((event): event is TimelineEvent => Boolean(event));
      requests.push({
        id: `${meta.filePath}::${span.id}`,
        sessionKey: meta.filePath,
        sessionLabel,
        requestTitle: span.title,
        startedAt: span.start,
        updatedAt: span.end,
        items: buildItems(spanEvents, span.title),
      });
    }
  }

  requests.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  return requests.slice(0, limit);
}

/**
 * Turn a request's events into display items: the assistant's reply text (not
 * the ask, which is already the block header), tool actions, and file touches,
 * with consecutive identical items collapsed into a repeat count.
 */
function buildItems(events: readonly TimelineEvent[], requestTitle: string): LiveFeedItem[] {
  const items: LiveFeedItem[] = [];
  for (const event of events) {
    const actor = event.actor ?? "system";
    const text = displayText(event);
    if (!text.trim()) continue;
    // The opening ask is already the block header; don't repeat it as an item.
    if (event.openedByUser && text === requestTitle) continue;
    const touches = event.fileTouches ?? [];
    const last = items[items.length - 1];
    if (
      last &&
      last.actor === actor &&
      last.text === text &&
      touches.length === 0 &&
      last.fileTouches.length === 0
    ) {
      last.repeatCount += 1;
      continue;
    }
    items.push({
      id: event.id,
      actor,
      ...(event.toolName ? { toolName: event.toolName } : {}),
      text,
      fileTouches: touches,
      repeatCount: 1,
    });
  }
  return items;
}

/**
 * The text to show for an event. For an assistant turn the title is the user's
 * ask; show the reply summary instead so the item is the work, not the ask.
 */
function displayText(event: TimelineEvent): string {
  if ((event.actor ?? "system") === "assistant") {
    return event.summary?.trim() || event.title;
  }
  return event.title;
}

/** Short session label: the project path's last segment ("C:/dev/mori" -> "mori"). */
export function sessionShortLabel(meta: ClaudeCodeSessionMeta): string {
  const raw = (meta.projectName || meta.projectPath || "").trim();
  if (!raw) return meta.sessionId.slice(0, 8);
  const parts = raw.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || raw;
}
