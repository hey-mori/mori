/**
 * Source-level connector import summary.
 *
 * The Connector JSONL preview already knows everything about an import
 * pass: how many events are new, how many are duplicates against the
 * current session / saved sessions / the file itself, how many lines
 * failed to parse, and which saved sessions overlapped. This module
 * collapses that low-level shape into a single typed summary the UI
 * surfaces (preview card, Evidence Hub row, Import Review meta strip)
 * can read without re-deriving classification logic per-call.
 *
 * The summary is intentionally a *derivation* — no IO, no new sources of
 * truth. Every field is computed from a `ConnectorJsonlPreview` or
 * `StoredSessionImport` payload. Callers store the summary alongside an
 * import row when they want the badge to survive a page reload; nothing
 * about the model requires persistence.
 */
import type {
  ConnectorEventKind,
  ConnectorId,
} from "./types";
import type { ConnectorJsonlPreview } from "./jsonlPreview";
import type { ConnectorImportHistorySavedSession } from "./connectorImportHistory";

/**
 * The user-facing state of a connector source/file with respect to
 * Mori's connector identity index. Each value maps to a single, honest
 * UI affordance — there is no "in between" state.
 */
export type ConnectorSourceImportStatus =
  | "new"
  | "partialReimport"
  | "duplicateOnly"
  | "historyUnavailable"
  | "invalidOnly"
  | "unknown";

/**
 * What Mori suggests the user do next, given the status. The UI maps
 * this to an enabled / disabled / muted action so we never paint a
 * button the user can't act on.
 */
export type ConnectorSourceImportDefaultAction =
  | "importNewEvents"
  | "reviewDuplicatesOptional"
  | "noNewEvents"
  | "fixInvalidLines"
  | "historyUnavailableReview";

/**
 * Lightweight reference to a saved session that overlapped with this
 * import. Mirrors `ConnectorImportHistorySavedSession` but strips the
 * events array — the summary only needs identification, not payload.
 */
export type ConnectorImportSummaryMatchedSession = {
  sessionId: string;
  title?: string;
  savedAt?: string;
};

export type ConnectorSourceImportTimeRange = {
  earliestOccurredAt: string | null;
  latestOccurredAt: string | null;
};

export type ConnectorSourceImportSummary = {
  status: ConnectorSourceImportStatus;
  /** Valid (parsed + schema-clean) event count. */
  totalValidEvents: number;
  newEventCount: number;
  /** Sum of every duplicate class. */
  duplicateEventCount: number;
  currentSessionDuplicateCount: number;
  savedSessionDuplicateCount: number;
  inBatchDuplicateCount: number;
  invalidLineCount: number;
  /** Saved sessions that owned at least one duplicate identity. */
  matchedSavedSessions: ConnectorImportSummaryMatchedSession[];
  connectorIds: ConnectorId[];
  eventKinds: ConnectorEventKind[];
  timeRange: ConnectorSourceImportTimeRange;
  /**
   * True when at least one new event is importable. The UI uses this to
   * enable / disable the "Import new events" affordance.
   */
  canImportNewEvents: boolean;
  /**
   * False when the preview ran without saved-session history (browser
   * fallback). The UI must surface this as an honesty note rather than
   * pretending cross-session detection ran.
   */
  savedSessionHistoryAvailable: boolean;
  defaultAction: ConnectorSourceImportDefaultAction;
  /**
   * One-line label suitable for a badge or row chip. Always English-
   * neutral with a Korean copy at the call site preferred over this
   * value when both surfaces speak Korean.
   */
  userMessage: string;
  /** Two-to-three-line description for the preview card / detail panel. */
  detailMessage: string;
};

/**
 * Default fallback summary so callers can render unconditionally without
 * branching on `summary === null`. The default represents the "no
 * imports parsed yet" state.
 */
export function emptyConnectorSourceImportSummary(): ConnectorSourceImportSummary {
  return {
    status: "unknown",
    totalValidEvents: 0,
    newEventCount: 0,
    duplicateEventCount: 0,
    currentSessionDuplicateCount: 0,
    savedSessionDuplicateCount: 0,
    inBatchDuplicateCount: 0,
    invalidLineCount: 0,
    matchedSavedSessions: [],
    connectorIds: [],
    eventKinds: [],
    timeRange: { earliestOccurredAt: null, latestOccurredAt: null },
    canImportNewEvents: false,
    savedSessionHistoryAvailable: false,
    defaultAction: "noNewEvents",
    userMessage: "Connector JSONL을 붙여넣으면 요약이 표시됩니다.",
    detailMessage:
      "Mori는 로컬에 저장된 세션만 참고합니다. 백그라운드 폴더 감시도, 클라우드 동기화도 없습니다.",
  };
}

/**
 * Build the source-level summary from a `ConnectorJsonlPreview`. The
 * preview is the canonical input — every field on the summary maps to a
 * field already on the preview. No new low-level classification logic
 * lives here.
 *
 * Status precedence (top-down):
 *   1. `kind: "empty"`             → `unknown`
 *   2. `kind: "errors-only"`       → `invalidOnly`
 *   3. `validEventCount === 0`     → `invalidOnly`
 *   4. `newEventCount > 0` and `duplicateEventCount === 0` → `new`
 *      (downgraded to `historyUnavailable` if saved-session history
 *       was missing — we never claim "new across all sessions" without
 *       proof).
 *   5. `newEventCount > 0` and `duplicateEventCount > 0`  → `partialReimport`
 *   6. `newEventCount === 0`        → `duplicateOnly`
 */
export function buildConnectorSourceImportSummary(
  preview: ConnectorJsonlPreview,
): ConnectorSourceImportSummary {
  const totalValidEvents = preview.validEventCount;
  const newEventCount = preview.newEventCount;
  const duplicateEventCount = preview.duplicateEventCount;
  const invalidLineCount = preview.invalidLineCount;
  const matchedSavedSessions = preview.matchedSavedSessions.map(toSummaryMatchedSession);
  const savedSessionHistoryAvailable = preview.savedSessionHistoryAvailable;

  const status = resolveStatus({
    kind: preview.kind,
    totalValidEvents,
    newEventCount,
    duplicateEventCount,
    invalidLineCount,
    savedSessionHistoryAvailable,
  });

  const defaultAction = resolveDefaultAction(status, {
    newEventCount,
    duplicateEventCount,
    invalidLineCount,
  });

  return {
    status,
    totalValidEvents,
    newEventCount,
    duplicateEventCount,
    currentSessionDuplicateCount: preview.currentSessionDuplicateCount,
    savedSessionDuplicateCount: preview.savedSessionDuplicateCount,
    inBatchDuplicateCount: preview.inBatchDuplicateCount,
    invalidLineCount,
    matchedSavedSessions,
    connectorIds: [...preview.connectorIds],
    eventKinds: [...preview.eventKinds],
    timeRange: {
      earliestOccurredAt: preview.earliestOccurredAt,
      latestOccurredAt: preview.latestOccurredAt,
    },
    canImportNewEvents: preview.canImport && newEventCount > 0,
    savedSessionHistoryAvailable,
    defaultAction,
    userMessage: buildUserMessage(status, {
      newEventCount,
      duplicateEventCount,
      invalidLineCount,
    }),
    detailMessage: buildDetailMessage(status, {
      newEventCount,
      currentSessionDuplicateCount: preview.currentSessionDuplicateCount,
      savedSessionDuplicateCount: preview.savedSessionDuplicateCount,
      inBatchDuplicateCount: preview.inBatchDuplicateCount,
      invalidLineCount,
      matchedSavedSessions,
      savedSessionHistoryAvailable,
    }),
  };
}

/**
 * Compress the summary into a one-line Korean badge label, used by
 * Evidence Hub `ImportedSourceRow` and the connector preview card.
 * Always returns a non-empty string so the UI can render unconditionally.
 */
export function describeConnectorSourceImportBadge(
  summary: ConnectorSourceImportSummary,
): string {
  switch (summary.status) {
    case "new":
      return `새 import · ${summary.newEventCount}개 이벤트`;
    case "partialReimport":
      return `부분 재import · 새 ${summary.newEventCount} / 이미 ${summary.duplicateEventCount}`;
    case "duplicateOnly":
      return `재import · 새 이벤트 0 / 이미 ${summary.duplicateEventCount}`;
    case "historyUnavailable":
      return `저장 세션 기록 없음 · 새 ${summary.newEventCount} / 이미 ${summary.duplicateEventCount}`;
    case "invalidOnly":
      return `잘못된 라인 · ${summary.invalidLineCount}`;
    case "unknown":
    default:
      return "요약 없음";
  }
}

/** Stable badge tone hint for UI surfaces. */
export function getConnectorSourceImportBadgeTone(
  summary: ConnectorSourceImportSummary,
): "green" | "orange" | "blue" | "red" | "gray" {
  switch (summary.status) {
    case "new":
      return "green";
    case "partialReimport":
      return "blue";
    case "duplicateOnly":
      return "orange";
    case "historyUnavailable":
      return "gray";
    case "invalidOnly":
      return "red";
    case "unknown":
    default:
      return "gray";
  }
}

// ─── internal helpers ─────────────────────────────────────────────────────

function toSummaryMatchedSession(
  session: ConnectorImportHistorySavedSession,
): ConnectorImportSummaryMatchedSession {
  return {
    sessionId: session.sessionId,
    title: session.title,
    savedAt: session.savedAt,
  };
}

function resolveStatus(args: {
  kind: ConnectorJsonlPreview["kind"];
  totalValidEvents: number;
  newEventCount: number;
  duplicateEventCount: number;
  invalidLineCount: number;
  savedSessionHistoryAvailable: boolean;
}): ConnectorSourceImportStatus {
  if (args.kind === "empty") return "unknown";
  if (args.kind === "errors-only") return "invalidOnly";
  if (args.totalValidEvents === 0 && args.invalidLineCount > 0) return "invalidOnly";

  if (args.newEventCount > 0 && args.duplicateEventCount === 0) {
    // We only claim "new across all sessions" when saved-session history
    // was actually checked. Otherwise downgrade to historyUnavailable so
    // the UI is honest about the missing detection surface.
    return args.savedSessionHistoryAvailable ? "new" : "historyUnavailable";
  }
  if (args.newEventCount > 0 && args.duplicateEventCount > 0) return "partialReimport";
  if (args.newEventCount === 0 && args.duplicateEventCount > 0) return "duplicateOnly";

  return "unknown";
}

function resolveDefaultAction(
  status: ConnectorSourceImportStatus,
  counts: { newEventCount: number; duplicateEventCount: number; invalidLineCount: number },
): ConnectorSourceImportDefaultAction {
  switch (status) {
    case "new":
      return "importNewEvents";
    case "partialReimport":
      return "importNewEvents";
    case "duplicateOnly":
      return counts.duplicateEventCount > 0 ? "reviewDuplicatesOptional" : "noNewEvents";
    case "historyUnavailable":
      return counts.newEventCount > 0 ? "historyUnavailableReview" : "noNewEvents";
    case "invalidOnly":
      return "fixInvalidLines";
    case "unknown":
    default:
      return "noNewEvents";
  }
}

function buildUserMessage(
  status: ConnectorSourceImportStatus,
  counts: { newEventCount: number; duplicateEventCount: number; invalidLineCount: number },
): string {
  switch (status) {
    case "new":
      return `New import · ${counts.newEventCount} events`;
    case "partialReimport":
      return `Partial re-import · ${counts.newEventCount} new / ${counts.duplicateEventCount} already imported`;
    case "duplicateOnly":
      return `Already imported · 0 new / ${counts.duplicateEventCount} duplicates`;
    case "historyUnavailable":
      return `History unavailable · ${counts.newEventCount} candidate events`;
    case "invalidOnly":
      return `Invalid lines · ${counts.invalidLineCount}`;
    case "unknown":
    default:
      return "Nothing to summarise yet";
  }
}

function buildDetailMessage(
  status: ConnectorSourceImportStatus,
  args: {
    newEventCount: number;
    currentSessionDuplicateCount: number;
    savedSessionDuplicateCount: number;
    inBatchDuplicateCount: number;
    invalidLineCount: number;
    matchedSavedSessions: ConnectorImportSummaryMatchedSession[];
    savedSessionHistoryAvailable: boolean;
  },
): string {
  const matchedLabel = args.matchedSavedSessions
    .map((entry) => entry.title ?? entry.sessionId)
    .slice(0, 3)
    .join(", ");

  switch (status) {
    case "new":
      return `이 파일의 ${args.newEventCount}개 이벤트는 현재 세션과 저장 세션 어디에서도 발견되지 않았습니다. Import Review에서 검토 후 Apply 하세요.`;
    case "partialReimport": {
      const matched = args.savedSessionDuplicateCount > 0 && matchedLabel
        ? ` 매칭된 저장 세션: ${matchedLabel}.`
        : "";
      return `새 이벤트 ${args.newEventCount}개를 가져오고, 이미 가져온 ${args.currentSessionDuplicateCount + args.savedSessionDuplicateCount + args.inBatchDuplicateCount}개는 기본적으로 건너뜁니다. (현재 세션 ${args.currentSessionDuplicateCount} · 저장 세션 ${args.savedSessionDuplicateCount} · 파일 내부 ${args.inBatchDuplicateCount})${matched}`;
    }
    case "duplicateOnly": {
      const matched = matchedLabel ? ` 매칭된 저장 세션: ${matchedLabel}.` : "";
      return `이 파일의 모든 이벤트가 이미 가져온 connector 이벤트입니다. Import Review는 기본 비활성화 — '중복 포함' 토글로 다시 가져오거나 매칭된 세션을 열어보세요.${matched}`;
    }
    case "historyUnavailable":
      return `저장 세션 기록을 이 모드에서는 사용할 수 없어, 현재 세션과 파일 내부 중복만 검사했습니다. Import Review에서 확인 후 진행하세요. 새 이벤트 ${args.newEventCount}개 후보.`;
    case "invalidOnly":
      return `유효한 connector 이벤트가 없습니다. ${args.invalidLineCount}개 라인의 형식을 docs/connectors/connector-event-format.md에 맞춰 수정한 뒤 다시 시도하세요.`;
    case "unknown":
    default:
      return "Connector JSONL을 붙여넣거나 Inbox에서 파일을 선택하면 요약이 표시됩니다.";
  }
}
