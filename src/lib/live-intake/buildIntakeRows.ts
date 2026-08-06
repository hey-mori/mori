/**
 * Live Intake Buffer · the pure derivation from the live feed to T1 rows.
 *
 * The feed already does the hard part: it groups messages into request blocks
 * using the same rule as import, and it rolls file touches onto each step. This
 * module reduces that to something durable, dropping every message body and
 * keeping the shape of the work plus a locator to re-derive the rest (D1).
 *
 * Status deserves a note, because it is the reason this is not a trivial map.
 * `deriveSessionActivity` answers for the SESSION, and only the session's newest
 * request is still live; every earlier request in the same session ended when
 * the next one opened. So the session's status lands on its newest request only,
 * and older ones settle to `completed`, or to `blocked` when they carried an
 * error that never resolved. Applying the session status to every row would
 * report a whole history as "running".
 */
import type { FileTouch } from "../../domain/types";
import {
  deriveSessionActivity,
  isErrorStep,
  type FollowedSession,
  type LiveFeedRequest,
  type SessionActivityStatus,
} from "../../features/live-session/liveFeed";
import {
  INTAKE_ROW_VERSION,
  INTAKE_TITLE_MAX,
  type IntakeFileChange,
  type IntakeRequestRow,
} from "./intakeTypes";

export function buildIntakeRows(
  sessions: readonly FollowedSession[],
  requests: readonly LiveFeedRequest[],
  opts: { now: number; observedAt: string },
): IntakeRequestRow[] {
  const sessionStatus = new Map<string, SessionActivityStatus>();
  const sessionOffset = new Map<string, number>();
  for (const { meta, follow } of sessions) {
    sessionStatus.set(
      meta.filePath,
      deriveSessionActivity(follow.messages, {
        now: opts.now,
        lastActiveAt: meta.modifiedAt,
      }),
    );
    sessionOffset.set(meta.filePath, follow.offset);
  }

  // The newest request per session is the only one that can still be live.
  const newestPerSession = new Map<string, string>();
  for (const request of requests) {
    const held = newestPerSession.get(request.sessionKey);
    if (!held) {
      newestPerSession.set(request.sessionKey, request.id);
      continue;
    }
    const heldStart = Date.parse(requests.find((r) => r.id === held)?.startedAt ?? "") || 0;
    if ((Date.parse(request.startedAt) || 0) > heldStart) {
      newestPerSession.set(request.sessionKey, request.id);
    }
  }

  return requests.map((request) => {
    const hasError = request.items.some((item) => item.text.length > 0 && isErrorStep(item.text));
    const isNewest = newestPerSession.get(request.sessionKey) === request.id;
    const status: SessionActivityStatus = isNewest
      ? (sessionStatus.get(request.sessionKey) ?? "unknown")
      : hasError
        ? "blocked"
        : "completed";

    const title = request.requestTitle.trim();
    const truncated = title.length > INTAKE_TITLE_MAX;

    return {
      schemaVersion: INTAKE_ROW_VERSION,
      id: request.id,
      sessionKey: request.sessionKey,
      sessionLabel: request.sessionLabel,
      title: truncated ? `${title.slice(0, INTAKE_TITLE_MAX).trimEnd()}...` : title,
      titleTruncated: truncated,
      startedAt: request.startedAt,
      endedAt: request.updatedAt,
      stepCount: request.items.reduce((sum, item) => sum + item.repeatCount, 0),
      tools: distinctTools(request),
      files: rollUpFiles(request),
      hasError,
      status,
      locator: {
        path: request.sessionKey,
        offset: sessionOffset.get(request.sessionKey) ?? 0,
      },
      observedAt: opts.observedAt,
    } satisfies IntakeRequestRow;
  });
}

/** Tool names in first-use order, so the row reads as the work was done. */
function distinctTools(request: LiveFeedRequest): string[] {
  const seen = new Set<string>();
  const tools: string[] = [];
  for (const item of request.items) {
    const name = item.toolName?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    tools.push(name);
  }
  return tools;
}

/**
 * One entry per path, summing line counts across every step that touched it.
 * A file both read and written reports the strongest change kind, because
 * "edited" is the fact a reader cares about and "read" would hide it.
 */
function rollUpFiles(request: LiveFeedRequest): IntakeFileChange[] {
  const byPath = new Map<string, IntakeFileChange>();
  for (const item of request.items) {
    for (const touch of item.fileTouches) {
      const held = byPath.get(touch.path);
      if (!held) {
        byPath.set(touch.path, {
          path: touch.path,
          changeKind: touch.changeKind,
          additions: touch.additions ?? 0,
          deletions: touch.deletions ?? 0,
          touchCount: 1,
        });
        continue;
      }
      held.additions += touch.additions ?? 0;
      held.deletions += touch.deletions ?? 0;
      held.touchCount += 1;
      if (changeRank(touch.changeKind) > changeRank(held.changeKind)) {
        held.changeKind = touch.changeKind;
      }
    }
  }
  // Changed files first, then by volume, so the row's lead file is the one the
  // request actually did something to.
  return [...byPath.values()].sort((a, b) => {
    const byKind = changeRank(b.changeKind) - changeRank(a.changeKind);
    if (byKind !== 0) return byKind;
    return b.additions + b.deletions - (a.additions + a.deletions);
  });
}

function changeRank(kind: FileTouch["changeKind"]): number {
  switch (kind) {
    case "wrote":
      return 3;
    case "edited":
      return 2;
    case "touched":
      return 1;
    default:
      return 0;
  }
}

