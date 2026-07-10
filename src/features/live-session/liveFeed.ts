/**
 * Live feed model: merge every followed session's raw messages into one
 * time-ordered stream of request blocks, ordered by each request's latest
 * activity so the request being worked right now sits on top.
 *
 * Unlike a timeline import, the live feed keeps the FULL text of every message
 * (no summary truncation) and one item per message, because the point is to
 * watch work happen, not to archive a tidy summary. Request boundaries reuse the
 * same rule as import (`classifyMessage` + boilerplate detection) so what opens
 * a request here matches an imported session. Each request carries a live status
 * derived from how recently it was touched.
 */
import { classifyMessage } from "../../lib/claude/conversationStats";
import { isAgentBoilerplateTitle } from "../../lib/import/sanitizeTitle";
import type {
  ClaudeCodeSessionMeta,
  ClaudeFileTouch,
  ClaudeMessage,
} from "../../lib/claude/types";
import type { AgentStoreFollowState } from "../../lib/live-follow";
import type { EventActor, FileTouch } from "../../domain/types";

export type FollowedSession = {
  meta: ClaudeCodeSessionMeta;
  follow: AgentStoreFollowState;
};

/** How live a request is, from how recently it was last touched. */
export type LiveRequestStatus = "working" | "recent" | "done";

/** A mid-turn session with no new activity for this long is treated as stalled,
 *  not actively working, so a crashed run does not pulse forever. */
const STALL_MS = 5 * 60_000;
/** A finished request touched within this window stays surfaced as "recent". */
const RECENT_MS = 6 * 60_000;

export type LiveFeedItem = {
  id: string;
  actor: EventActor;
  /** Tool name for a tool step (e.g. "Bash", "Edit"), else undefined. */
  toolName?: string;
  /** The full message text, never truncated. */
  text: string;
  fileTouches: FileTouch[];
  createdAt: string;
  /** >1 when consecutive identical steps were collapsed. */
  repeatCount: number;
};

export type LiveFeedRequest = {
  id: string;
  sessionKey: string;
  sessionLabel: string;
  /** The full request text, never truncated. */
  requestTitle: string;
  startedAt: string;
  updatedAt: string;
  status: LiveRequestStatus;
  items: LiveFeedItem[];
};

/**
 * Build the merged, newest-first live feed. `now` (ms) drives each request's
 * live status; pass the poll time so status refreshes each poll.
 */
export function buildLiveFeed(
  sessions: readonly FollowedSession[],
  opts: { now: number; limit?: number },
): LiveFeedRequest[] {
  const limit = opts.limit ?? 60;
  const requests: LiveFeedRequest[] = [];
  // Ids of the requests whose session is genuinely mid-turn right now.
  const workingIds = new Set<string>();

  for (const { meta, follow } of sessions) {
    if (follow.messages.length === 0) continue;
    const touchesByMessage = groupTouches(follow.fileTouches);
    const sessionLabel = sessionShortLabel(meta);
    let current: LiveFeedRequest | null = null;

    for (const message of follow.messages) {
      const text = message.content.trim();
      if (!text) continue;

      if (isRequestOpener(message)) {
        current = {
          id: `${meta.filePath}::${message.id}`,
          sessionKey: meta.filePath,
          sessionLabel,
          requestTitle: text,
          startedAt: message.createdAt,
          updatedAt: message.createdAt,
          status: "done",
          items: [],
        };
        requests.push(current);
        continue;
      }

      // Work before the first real request (a resume tool-result, say) has no
      // owning request; drop it from the feed rather than invent a block.
      if (!current) continue;

      const actor = itemActor(message);
      const touches = (touchesByMessage.get(message.id) ?? []).map(toDomainTouch);
      const last = current.items[current.items.length - 1];
      if (
        last &&
        last.actor === actor &&
        last.text === text &&
        touches.length === 0 &&
        last.fileTouches.length === 0
      ) {
        last.repeatCount += 1;
      } else {
        current.items.push({
          id: message.id || `${current.id}-${current.items.length}`,
          actor,
          ...(actor === "tool" ? { toolName: parseToolName(text) ?? undefined } : {}),
          text,
          fileTouches: touches,
          createdAt: message.createdAt,
          repeatCount: 1,
        });
      }
      if (message.createdAt) current.updatedAt = message.createdAt;
    }

    // The session's newest request is "working" only when the session is truly
    // mid-turn (its last message is not a finished assistant turn).
    if (current && isSessionWorking(follow.messages, opts.now)) {
      workingIds.add(current.id);
    }
  }

  for (const request of requests) {
    if (workingIds.has(request.id)) {
      request.status = "working";
      continue;
    }
    const age = opts.now - (Date.parse(request.updatedAt) || 0);
    request.status = age <= RECENT_MS ? "recent" : "done";
  }

  requests.sort((a, b) => {
    const byActivity = (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0);
    return byActivity !== 0 ? byActivity : (Date.parse(b.startedAt) || 0) - (Date.parse(a.startedAt) || 0);
  });
  return requests.slice(0, limit);
}

/**
 * Whether a session is genuinely working right now, from its last message.
 * A finished assistant turn (`end_turn` / `stop_sequence`) means the agent is
 * idle and waiting for the user, so the session is NOT working even if the reply
 * just landed a second ago. Any open turn (a tool step awaiting its result, a
 * tool result / request awaiting the reply, or a mid-stream message) is working
 * while fresh; a long stall reads as not working so a crashed run stops pulsing.
 * The `stop_reason` is the precise signal a time window alone cannot give.
 */
function isSessionWorking(messages: readonly ClaudeMessage[], now: number): boolean {
  const last = messages[messages.length - 1];
  if (!last) return false;
  if (
    last.role === "assistant" &&
    (last.stopReason === "end_turn" || last.stopReason === "stop_sequence")
  ) {
    return false;
  }
  const age = now - (Date.parse(last.createdAt) || 0);
  return age < STALL_MS;
}

/** Whether a message opens a request: a real human turn, not a tool result or
 *  an agent-injected boilerplate / system message. Mirrors the import rule. */
function isRequestOpener(message: ClaudeMessage): boolean {
  return (
    message.role === "human" &&
    classifyMessage(message) !== "tool_result" &&
    !isAgentBoilerplateTitle(message.content)
  );
}

function itemActor(message: ClaudeMessage): EventActor {
  const kind = classifyMessage(message);
  if (kind === "tool_use" || kind === "tool_result") return "tool";
  if (message.role === "assistant") return "assistant";
  if (message.role === "human") return "user";
  return "system";
}

/** Best-effort tool name from a rendered tool step ("🔧 Bash: …" -> "Bash"). */
function parseToolName(text: string): string | null {
  const match = /^\s*🔧\s*([^:\n]+?)\s*(?::|$)/.exec(text);
  const name = match?.[1]?.trim();
  return name ? name : null;
}

function groupTouches(touches: readonly ClaudeFileTouch[]): Map<string, ClaudeFileTouch[]> {
  const byMessage = new Map<string, ClaudeFileTouch[]>();
  for (const touch of touches) {
    if (!touch.messageId) continue;
    const list = byMessage.get(touch.messageId);
    if (list) list.push(touch);
    else byMessage.set(touch.messageId, [touch]);
  }
  return byMessage;
}

function toDomainTouch(touch: ClaudeFileTouch): FileTouch {
  return {
    path: touch.path,
    tool: touch.tool,
    changeKind: touch.changeKind,
    at: touch.at,
    additions: touch.additions,
    deletions: touch.deletions,
    messageId: touch.messageId,
    diffPreview: touch.diffPreview,
  };
}

/** Short session label: the project path's last segment ("C:/dev/mori" -> "mori"). */
export function sessionShortLabel(meta: ClaudeCodeSessionMeta): string {
  const raw = (meta.projectName || meta.projectPath || "").trim();
  if (!raw) return meta.sessionId.slice(0, 8);
  const parts = raw.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || raw;
}
