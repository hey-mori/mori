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
import { readableAgentText } from "../../lib/session/agentText";
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
/** A cleanly ended session quiet this long counts as finished, not as waiting
 *  on the user. Matches the follower's active-session discovery window. */
const SESSION_QUIET_MS = 30 * 60_000;

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
 * How many of a session's most recent messages to scan when a caller asks for a
 * bounded build.
 *
 * The whole feed is rebuilt from scratch on every poll, so its cost is a
 * function of accumulated history rather than of what actually arrived. At the
 * follower's ceiling (8 sessions x 4000 messages) a full rebuild measured ~90ms,
 * which is a visible main-thread stall every few seconds now that observation
 * runs app-wide.
 *
 * Bounding the scan is safe because nothing downstream needs the whole history:
 * the feed itself caps at 60 requests, and the intake buffer upserts by row id,
 * so a request that falls outside the window keeps the row it was already given.
 */
const BOUNDED_SCAN_MESSAGES = 1200;

/**
 * Build the merged, newest-first live feed. `now` (ms) drives each request's
 * live status; pass the poll time so status refreshes each poll.
 *
 * `bounded` limits how far back each session is scanned. Callers that poll
 * continuously should pass it; a one-off build over a small session need not.
 */
export function buildLiveFeed(
  sessions: readonly FollowedSession[],
  opts: { now: number; limit?: number; bounded?: boolean },
): LiveFeedRequest[] {
  const limit = opts.limit ?? 60;
  const requests: LiveFeedRequest[] = [];
  // Ids of the requests whose session is genuinely mid-turn right now.
  const workingIds = new Set<string>();

  for (const { meta, follow } of sessions) {
    if (follow.messages.length === 0) continue;
    // Slice before grouping touches, so both stay in step.
    const scanned =
      opts.bounded && follow.messages.length > BOUNDED_SCAN_MESSAGES
        ? follow.messages.slice(-BOUNDED_SCAN_MESSAGES)
        : follow.messages;
    const touchesByMessage = groupTouches(follow.fileTouches);
    const sessionLabel = sessionShortLabel(meta);
    let current: LiveFeedRequest | null = null;

    for (const message of scanned) {
      const text = message.content.trim();
      if (!text) continue;

      if (isRequestOpener(message)) {
        current = {
          id: `${meta.filePath}::${message.id}`,
          sessionKey: meta.filePath,
          sessionLabel,
          requestTitle: readableAgentText(text),
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

      // Injected noise (an interruption marker, a task notification, a reminder)
      // is not a real step; skip it so it neither opens a request nor clutters
      // one.
      if (isAgentBoilerplateTitle(text)) continue;

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
    if (current && isSessionWorking(scanned, opts.now)) {
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

  // Order by when the user opened each request, not by latest activity, so a
  // request stays put while it works and only a genuinely new request rises to
  // the top. Sorting by activity would make the feed jump on every step.
  requests.sort((a, b) => {
    const byStart = (Date.parse(b.startedAt) || 0) - (Date.parse(a.startedAt) || 0);
    return byStart !== 0 ? byStart : (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0);
  });
  return requests.slice(0, limit);
}

/**
 * A session's real activity state, from its last message.
 *
 * The feed renders only three presentation states, but the transcript carries
 * enough to say more, and the intake buffer persists the fuller answer. The
 * precise signal is `stop_reason`: a finished assistant turn (`end_turn` /
 * `stop_sequence`) means the agent is idle and waiting for the user, which a
 * time window alone cannot distinguish from a reply that merely landed a second
 * ago. Any open turn (a tool step awaiting its result, a tool result awaiting
 * the reply, a mid-stream message) is running while fresh; a long stall reads as
 * blocked so a crashed run stops pulsing forever.
 */
export type SessionActivityStatus =
  | "running"
  | "waitingForUser"
  | "blocked"
  | "completed"
  | "unknown";

export function deriveSessionActivity(
  messages: readonly ClaudeMessage[],
  opts: { now: number; lastActiveAt?: string },
): SessionActivityStatus {
  const last = messages[messages.length - 1];
  if (!last) return "unknown";
  // An errored final step is blocked regardless of how recent it is: the run
  // stopped for a reason the user may need to act on.
  if (isErrorStep(last.content)) return "blocked";

  if (last.role === "assistant" && endsTheTurn(last.stopReason)) {
    // A cleanly ended turn is only "completed" once the session itself has gone
    // quiet. Until then the user could still reply, so it is waiting on them.
    const quietSince = Date.parse(opts.lastActiveAt ?? last.createdAt);
    const quietFor = opts.now - (Number.isFinite(quietSince) ? quietSince : opts.now);
    return quietFor >= SESSION_QUIET_MS ? "completed" : "waitingForUser";
  }

  const age = opts.now - (Date.parse(last.createdAt) || 0);
  return age < STALL_MS ? "running" : "blocked";
}

/**
 * Whether an assistant `stop_reason` ends the turn.
 *
 * Stated as "anything but `tool_use`" rather than as a list of terminal values,
 * because the list is open: a real transcript carries `end_turn`,
 * `stop_sequence` and `refusal`, and the API can add more. Enumerating the
 * terminal side would silently read each new one as an open turn, which is the
 * failure that leaves a finished session pulsing as if it were still working.
 * `tool_use` is the only reason that genuinely means "more is coming".
 */
function endsTheTurn(stopReason: string | undefined): boolean {
  return Boolean(stopReason) && stopReason !== "tool_use";
}

/** Whether a session is genuinely mid-turn right now. */
function isSessionWorking(messages: readonly ClaudeMessage[], now: number): boolean {
  return deriveSessionActivity(messages, { now }) === "running";
}

/**
 * Whether a step reads as a tool failure. Deliberately conservative, because it
 * decides a `blocked` status that can raise a signal, and a false alarm there
 * costs more than a miss. Only unambiguous machine markers count; prose that
 * merely mentions an error does not.
 */
export function isErrorStep(text: string): boolean {
  const head = text.slice(0, 200).toLowerCase();
  return (
    head.includes("<tool_use_error>") ||
    head.includes("command failed with exit code") ||
    head.includes("↳ 도구 오류")
  );
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
  if (raw) {
    const parts = raw.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] || raw;
  }
  // Every field here comes off disk, so none of them is guaranteed. This used
  // to call `.slice` on `sessionId` directly, which throws on a session read
  // without one. That was survivable while the feed was built inside 세션, where
  // a route boundary caught it; once observation moved to the shell the same
  // throw blanked the entire window. A label is cosmetic, so it degrades.
  return (meta.sessionId ?? "").slice(0, 8) || "세션";
}

/**
 * A live session's title: the text of its most recent real request (what it is
 * working on right now), so the index reads by conversation, not by project
 * path. Falls back to the first request, then the project label. One line,
 * trimmed to a readable length.
 */
export function liveSessionTitle(session: FollowedSession): string {
  const openers = session.follow.messages.filter(isRequestOpener);
  const opener = openers[openers.length - 1] ?? openers[0];
  const text = opener ? readableAgentText(opener.content) : "";
  if (text) return oneLine(text, 80);
  return sessionShortLabel(session.meta);
}

/** Whether a followed session is genuinely mid-turn right now (exported for the
 *  session index, which shows only truly-working sessions under 라이브 피드). */
export function sessionIsWorking(session: FollowedSession, now: number): boolean {
  return isSessionWorking(session.follow.messages, now);
}

/** Collapse a message to a single clean line, capped, with an ellipsis. */
function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
