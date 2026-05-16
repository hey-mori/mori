/**
 * Connector JSONL preview helper.
 *
 * Given the raw JSONL text the user pasted (or the bytes of a selected file),
 * `buildConnectorJsonlPreview` runs the parser + validator and returns a
 * **typed snapshot** the Evidence Hub renders directly. The Hub does NOT
 * need to know how `ConnectorEvent` is parsed; it just renders the preview
 * shape returned here.
 *
 * Honesty contract:
 *   - Never throws. Empty input → `kind: "empty"`. Garbage input → an
 *     `errors` list. Mixed valid/invalid → both arrays populated.
 *   - The preview also walks the buckets the normalizer would produce, so
 *     the UI can show "Claude Code session abc · 18 events" before the user
 *     opens Import Review.
 *   - Redaction status is surfaced when any event was flagged as redacted
 *     either by the source tool or by the import pass.
 */
import type {
  ConnectorEvent,
  ConnectorEventKind,
  ConnectorId,
  ConnectorParseOutcome,
  ConnectorValidationError,
} from "./types";
import { parseConnectorJsonl } from "./validation";
import { redactText } from "./redaction";
import type { ConnectorEventIdentity } from "./connectorEventIdentity";
import {
  buildConnectorImportHistory,
  classifyConnectorImportBatch,
  pickDuplicateEventsFromClassification,
  pickNewEventsFromClassification,
  summarizeConnectorImportOverlap,
  type ConnectorImportHistory,
  type ConnectorImportHistoryInput,
  type ConnectorImportHistorySavedSession,
  type ConnectorImportOverlapSummary,
} from "./connectorImportHistory";
import type { TimelineEvent } from "../../domain/types";

export type ConnectorJsonlPreviewKind = "empty" | "errors-only" | "valid" | "mixed";

export type ConnectorJsonlBucketPreview = {
  connectorId: ConnectorId;
  /** External session id when the connector grouped events under one. */
  externalSessionId: string | null;
  /** Human label suitable for the UI ("Claude Code session abc-123"). */
  label: string;
  /** Number of valid events in the bucket. */
  eventCount: number;
  /** Earliest occurredAt in the bucket (ISO). */
  startedAt: string;
  /** Latest occurredAt in the bucket (ISO). */
  endedAt: string;
};

export type ConnectorJsonlPreview = {
  kind: ConnectorJsonlPreviewKind;
  /** Total non-blank, non-comment lines processed. */
  totalLines: number;
  /** Skipped lines (blank or `#` comments). */
  skippedBlankLines: number;
  /** Successfully parsed + validated events. */
  validEventCount: number;
  /** Lines that failed parse or validation. */
  invalidLineCount: number;
  /** Distinct connector ids represented in the valid events. */
  connectorIds: ConnectorId[];
  /** Event kinds represented in the valid events (sorted alphabetically). */
  eventKinds: ConnectorEventKind[];
  /** Bucket breakdown (matches what normalizeConnectorEventBatch would produce). */
  buckets: ConnectorJsonlBucketPreview[];
  /** Distinct project paths the events mention (unique, in encounter order). */
  projectPaths: string[];
  /** Earliest occurredAt across all valid events (ISO), or null when empty. */
  earliestOccurredAt: string | null;
  /** Latest occurredAt across all valid events (ISO), or null when empty. */
  latestOccurredAt: string | null;
  /** Whether any event was flagged as redacted (by source tool or this pass). */
  redacted: boolean;
  /** Whether at least one suspected-secret string was found in summary/rawText/command. */
  containsLikelySecret: boolean;
  /** Validation errors, line-tagged. */
  errors: ConnectorValidationError[];
  /** Soft warnings (e.g. "kind X carries no required cluster — skipping"). */
  warnings: ConnectorPreviewWarning[];
  /** Whether the user should be allowed to send this to Import Review. */
  canImport: boolean;
  /** Single sentence to render at the top of the preview card. */
  headline: string;
  /** The validated events themselves — passed downstream to the normalizer. */
  events: ConnectorEvent[];
  /**
   * Duplicate summary populated by `buildConnectorJsonlPreviewWithSession`.
   * The plain `buildConnectorJsonlPreview` helper returns the zero-value
   * (no session to compare against) so callers can read this field without
   * branching on session-aware vs session-less previews.
   */
  newEventCount: number;
  duplicateEventCount: number;
  /** Events whose `connectorEventId` is NOT in the imported set. */
  newEvents: ConnectorEvent[];
  /** Events whose `connectorEventId` collides with an already-imported event. */
  duplicateEvents: ConnectorEvent[];
  /** Identities (encoded as `connectorId::session::id`) of the duplicates. */
  duplicateIdentities: ConnectorEventIdentity[];
  /**
   * Cross-session overlap counts populated by
   * `buildConnectorJsonlPreviewWithHistory`. The plain preview reports
   * zero everywhere so callers can read the fields unconditionally.
   *
   * `currentSessionDuplicateCount` mirrors the old `duplicateEventCount`
   * but only counts active-session matches. `savedSessionDuplicateCount`
   * picks up the cross-session hits. `inBatchDuplicateCount` covers
   * repeats inside the incoming JSONL itself. `identityUnavailableCount`
   * counts events with no usable identity (kept at zero today; reserved
   * for future parser changes).
   */
  currentSessionDuplicateCount: number;
  savedSessionDuplicateCount: number;
  inBatchDuplicateCount: number;
  identityUnavailableCount: number;
  /**
   * Whether the preview had access to saved-session history. False in
   * the legacy session-only path and the no-input path. The UI uses this
   * to render "Saved-session history unavailable" instead of pretending
   * detection ran.
   */
  savedSessionHistoryAvailable: boolean;
  /**
   * Saved-session metadata for the rows that matched. Each entry is the
   * exact `ConnectorImportHistorySavedSession` the caller passed in.
   */
  matchedSavedSessions: ConnectorImportHistorySavedSession[];
};

export type ConnectorPreviewWarningCode =
  | "redacted"
  | "missing_session_id"
  | "unknown_connector_id"
  | "all_invalid"
  | "all_duplicate"
  | "partial_duplicate"
  | "saved_session_duplicate"
  | "saved_session_history_unavailable";

export type ConnectorPreviewWarning = {
  code: ConnectorPreviewWarningCode;
  message: string;
  affectedLines?: number[];
};

/**
 * Short Korean label for a connector preview warning code — the badge
 * copy beside the full `message`. Keeps the raw enum out of the UI.
 */
export function describeConnectorWarningCode(
  code: ConnectorPreviewWarningCode,
): string {
  switch (code) {
    case "redacted":
      return "민감정보 감지";
    case "missing_session_id":
      return "세션 ID 없음";
    case "unknown_connector_id":
      return "알 수 없는 커넥터";
    case "all_invalid":
      return "전부 파싱 실패";
    case "all_duplicate":
      return "전부 중복";
    case "partial_duplicate":
      return "일부 중복";
    case "saved_session_duplicate":
      return "저장 세션 중복";
    case "saved_session_history_unavailable":
      return "이력 확인 불가";
    default:
      return code;
  }
}

/**
 * Set of `connectorId` values the foundation explicitly recognises. Anything
 * outside this set is allowed (it still parses), but the preview surfaces a
 * warning so the UI can show "unknown connector" without rejecting the row.
 */
const KNOWN_IDS = new Set<ConnectorId>([
  "claudeCodeHook",
  "codexCliWrapper",
  "terminalShell",
  "terminal",
  "gitCommand",
  "git",
  "desktopTranscriptImport",
  "githubPrImport",
  "manual",
]);

export function buildConnectorJsonlPreview(text: string): ConnectorJsonlPreview {
  const trimmed = text.trim();
  if (!trimmed) {
    return emptyPreview();
  }

  const outcome = parseConnectorJsonl(text);
  return summarisePreview(outcome);
}

/**
 * Same shape but takes an already-parsed outcome — used by the in-memory
 * variant (future Tauri ingest) and by tests.
 */
export function summariseParseOutcome(outcome: ConnectorParseOutcome): ConnectorJsonlPreview {
  return summarisePreview(outcome);
}

// ─── internal ──────────────────────────────────────────────────────────────

function emptyPreview(): ConnectorJsonlPreview {
  return {
    kind: "empty",
    totalLines: 0,
    skippedBlankLines: 0,
    validEventCount: 0,
    invalidLineCount: 0,
    connectorIds: [],
    eventKinds: [],
    buckets: [],
    projectPaths: [],
    earliestOccurredAt: null,
    latestOccurredAt: null,
    redacted: false,
    containsLikelySecret: false,
    errors: [],
    warnings: [],
    canImport: false,
    headline: "JSONL을 붙여넣으면 미리보기가 표시됩니다.",
    events: [],
    newEventCount: 0,
    duplicateEventCount: 0,
    newEvents: [],
    duplicateEvents: [],
    duplicateIdentities: [],
    currentSessionDuplicateCount: 0,
    savedSessionDuplicateCount: 0,
    inBatchDuplicateCount: 0,
    identityUnavailableCount: 0,
    savedSessionHistoryAvailable: false,
    matchedSavedSessions: [],
  };
}

function summarisePreview(outcome: ConnectorParseOutcome): ConnectorJsonlPreview {
  const events = outcome.events;
  const errors = outcome.errors;

  if (events.length === 0 && errors.length === 0) {
    return emptyPreview();
  }

  const validEventCount = events.length;
  const invalidLineCount = countInvalidLines(errors);
  const totalLines = validEventCount + invalidLineCount + outcome.skippedBlankLines;

  const connectorIds = uniqueOrdered(events.map((event) => event.connectorId));
  const eventKinds = uniqueOrdered(events.map((event) => event.kind)).sort();
  const projectPaths = uniqueOrdered(
    events.map((event) => event.projectPath).filter((path): path is string => Boolean(path)),
  );

  let earliest: number | null = null;
  let latest: number | null = null;
  for (const event of events) {
    const occurredMs = new Date(event.occurredAt).getTime();
    if (Number.isFinite(occurredMs)) {
      if (earliest === null || occurredMs < earliest) earliest = occurredMs;
      if (latest === null || occurredMs > latest) latest = occurredMs;
    }
  }

  const buckets = buildBuckets(events);

  // Redaction & secret detection. We don't rewrite events here — that happens
  // in the canonical ingest pass. We just report whether the events look
  // suspicious so the UI can warn the user before they hit Import Review.
  let redactedFlag = false;
  let secretFlag = false;
  for (const event of events) {
    if (event.privacy.redacted === true) redactedFlag = true;
    const summaryRedaction = redactText(event.summary);
    if (summaryRedaction.matchedPatterns.length > 0) secretFlag = true;
    if (event.rawText) {
      const rawRedaction = redactText(event.rawText);
      if (rawRedaction.matchedPatterns.length > 0) secretFlag = true;
    }
    if (event.command) {
      const commandRedaction = redactText(event.command);
      if (commandRedaction.matchedPatterns.length > 0) secretFlag = true;
    }
  }

  const warnings: ConnectorPreviewWarning[] = [];
  if (secretFlag && !redactedFlag) {
    warnings.push({
      code: "redacted",
      message:
        "이벤트의 summary / rawText / command 안에 토큰 / API 키처럼 보이는 문자열이 감지되었습니다. Import Review 단계에서 redaction이 적용됩니다.",
    });
  }
  const eventsMissingSession = events.filter((event) => !event.sessionId);
  if (eventsMissingSession.length > 0 && validEventCount > 1) {
    warnings.push({
      code: "missing_session_id",
      message:
        `${eventsMissingSession.length}개 이벤트에 외부 sessionId가 없습니다. Mori는 이들을 하나의 unscoped 배치로 묶습니다.`,
    });
  }
  const unknownIdEvents = events.filter((event) => !KNOWN_IDS.has(event.connectorId));
  if (unknownIdEvents.length > 0) {
    warnings.push({
      code: "unknown_connector_id",
      message:
        `Mori 레지스트리에 없는 connectorId가 ${uniqueOrdered(unknownIdEvents.map((event) => event.connectorId)).join(", ")}에 해당합니다. 생성 시 manualNote 통합으로 폴백됩니다.`,
    });
  }
  if (validEventCount === 0 && invalidLineCount > 0) {
    warnings.push({
      code: "all_invalid",
      message: "모든 라인이 파싱에 실패했습니다. 형식이 docs/connectors/connector-event-format.md를 따르는지 확인하세요.",
    });
  }

  const kind: ConnectorJsonlPreviewKind =
    validEventCount === 0
      ? "errors-only"
      : invalidLineCount > 0
        ? "mixed"
        : "valid";

  const canImport = validEventCount > 0;
  const headline = buildHeadline({
    kind,
    validEventCount,
    invalidLineCount,
    connectorCount: connectorIds.length,
  });

  return {
    kind,
    totalLines,
    skippedBlankLines: outcome.skippedBlankLines,
    validEventCount,
    invalidLineCount,
    connectorIds,
    eventKinds,
    buckets,
    projectPaths,
    earliestOccurredAt: earliest === null ? null : new Date(earliest).toISOString(),
    latestOccurredAt: latest === null ? null : new Date(latest).toISOString(),
    redacted: redactedFlag,
    containsLikelySecret: secretFlag,
    errors,
    warnings,
    canImport,
    headline,
    events,
    // Default duplicate fields. `buildConnectorJsonlPreviewWithSession`
    // overlays the real values once we have a session to compare against.
    newEventCount: events.length,
    duplicateEventCount: 0,
    newEvents: events,
    duplicateEvents: [],
    duplicateIdentities: [],
    currentSessionDuplicateCount: 0,
    savedSessionDuplicateCount: 0,
    inBatchDuplicateCount: 0,
    identityUnavailableCount: 0,
    savedSessionHistoryAvailable: false,
    matchedSavedSessions: [],
  };
}

function countInvalidLines(errors: ConnectorValidationError[]): number {
  const lines = new Set<number>();
  let anonymous = 0;
  for (const error of errors) {
    if (typeof error.line === "number") {
      lines.add(error.line);
    } else {
      // Errors without a line number arise from in-memory array validation
      // rather than JSONL parsing. They still count as one invalid record.
      anonymous += 1;
    }
  }
  return lines.size + anonymous;
}

function buildBuckets(events: ConnectorEvent[]): ConnectorJsonlBucketPreview[] {
  const map = new Map<string, ConnectorJsonlBucketPreview>();
  for (const event of events) {
    const externalSessionId = event.sessionId ?? null;
    const key = `${event.connectorId}::${externalSessionId ?? "unscoped"}`;
    const occurredMs = new Date(event.occurredAt).getTime();
    const occurredIso = Number.isFinite(occurredMs)
      ? new Date(occurredMs).toISOString()
      : event.occurredAt;
    const existing = map.get(key);
    if (existing) {
      existing.eventCount += 1;
      if (occurredIso < existing.startedAt) existing.startedAt = occurredIso;
      if (occurredIso > existing.endedAt) existing.endedAt = occurredIso;
    } else {
      map.set(key, {
        connectorId: event.connectorId,
        externalSessionId,
        label: bucketLabel(event.connectorId, externalSessionId),
        eventCount: 1,
        startedAt: occurredIso,
        endedAt: occurredIso,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

function bucketLabel(connectorId: ConnectorId, externalSessionId: string | null): string {
  const base = connectorReadableLabel(connectorId);
  return externalSessionId ? `${base} · ${externalSessionId}` : base;
}

function connectorReadableLabel(connectorId: ConnectorId): string {
  switch (connectorId) {
    case "claudeCodeHook":
      return "Claude Code session";
    case "codexCliWrapper":
      return "Codex CLI session";
    case "terminalShell":
    case "terminal":
      return "Terminal session";
    case "gitCommand":
    case "git":
      return "Git capture";
    case "desktopTranscriptImport":
      return "Desktop transcript";
    case "githubPrImport":
      return "GitHub PR import";
    case "manual":
      return "Manual connector";
    default:
      return `Connector · ${connectorId}`;
  }
}

function uniqueOrdered<T>(values: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

function buildHeadline(args: {
  kind: ConnectorJsonlPreviewKind;
  validEventCount: number;
  invalidLineCount: number;
  connectorCount: number;
}): string {
  if (args.kind === "valid") {
    return `${args.validEventCount}개 이벤트 / ${args.connectorCount}개 커넥터를 가져올 준비가 되었습니다.`;
  }
  if (args.kind === "mixed") {
    return `${args.validEventCount}개 유효 / ${args.invalidLineCount}개 잘못된 라인. 유효한 이벤트만 Import Review로 전달됩니다.`;
  }
  if (args.kind === "errors-only") {
    return `유효한 이벤트가 없습니다. ${args.invalidLineCount}개 라인이 파싱에 실패했습니다.`;
  }
  return "JSONL을 붙여넣으면 미리보기가 표시됩니다.";
}

// ─── duplicate-aware preview ────────────────────────────────────────────────

/**
 * Session-only duplicate-aware preview. Kept for callers that don't have
 * (or don't want) saved-session history. Internally this routes through
 * the cross-session helper with an empty saved-session list.
 */
export function buildConnectorJsonlPreviewWithSession(
  text: string,
  session: { events: TimelineEvent[] } | null | undefined,
): ConnectorJsonlPreview {
  return buildConnectorJsonlPreviewWithHistory(text, {
    activeSession: session ?? null,
    savedSessions: [],
  });
}

/**
 * Cross-session duplicate-aware preview. Detects duplicates against:
 *
 *   1. the active session's already-applied TimelineEvents,
 *   2. every saved session in `input.savedSessions`,
 *   3. repeats inside the incoming JSONL batch itself.
 *
 * The preview's `events` field still carries the full validated set so
 * callers that opt into "Include duplicates" can use it; the `newEvents`
 * / `duplicateEvents` partitions are what the default skip-duplicates
 * path reads from.
 */
export function buildConnectorJsonlPreviewWithHistory(
  text: string,
  input: ConnectorImportHistoryInput,
): ConnectorJsonlPreview {
  const base = buildConnectorJsonlPreview(text);
  return applyHistoryOverlay(base, input);
}

/**
 * Pure version of the cross-session overlay. Tests and future Tauri
 * ingest paths can reuse it without re-parsing.
 */
export function applyHistoryOverlay(
  preview: ConnectorJsonlPreview,
  input: ConnectorImportHistoryInput,
): ConnectorJsonlPreview {
  if (preview.kind === "empty" || preview.kind === "errors-only") {
    return preview;
  }

  const history = buildConnectorImportHistory(input);
  const classified = classifyConnectorImportBatch(preview.events, history);
  const summary = summarizeConnectorImportOverlap(preview.events, history);
  const newEvents = pickNewEventsFromClassification(classified);
  const duplicateEvents = pickDuplicateEventsFromClassification(classified);

  const duplicateIdentities = uniqueOrdered(
    classified
      .filter(
        (row) =>
          row.classification === "duplicate-current-session" ||
          row.classification === "duplicate-saved-session" ||
          row.classification === "duplicate-in-batch",
      )
      .map((row) => row.identity),
  );

  const savedSessionHistoryAvailable = (input.savedSessions?.length ?? 0) > 0;

  const warnings: ConnectorPreviewWarning[] = [...preview.warnings];
  const totalDuplicates = summary.duplicateTotal;
  if (totalDuplicates > 0 && newEvents.length === 0) {
    warnings.push({
      code: "all_duplicate",
      message:
        `모든 ${totalDuplicates}개 이벤트가 이미 가져온 connector 이벤트와 동일합니다. 같은 JSONL을 한 번 더 import하셨거나 successor 파일이 동일 세션을 반복하는지 확인하세요.`,
    });
  } else if (totalDuplicates > 0) {
    warnings.push({
      code: "partial_duplicate",
      message:
        `${totalDuplicates}개 이벤트는 이미 가져왔습니다. 기본적으로 새 이벤트 ${newEvents.length}개만 Import Review로 전달됩니다.`,
    });
  }
  if (summary.savedSessionDuplicates > 0) {
    const sessionLabel = summary.matchedSavedSessions
      .map((entry) => entry.title ?? entry.sessionId)
      .slice(0, 3)
      .join(", ");
    warnings.push({
      code: "saved_session_duplicate",
      message:
        `${summary.savedSessionDuplicates}개 이벤트는 다른 저장 세션에서 이미 가져왔습니다${sessionLabel ? ` (${sessionLabel})` : ""}. 동일 connector 파일을 다시 import 중일 수 있습니다.`,
    });
  }
  if (!savedSessionHistoryAvailable && input.savedSessions !== undefined) {
    // Caller passed an explicit empty saved-session array — most likely
    // browser mode without history support. Surface honesty rather than
    // pretending cross-session detection happened.
    warnings.push({
      code: "saved_session_history_unavailable",
      message:
        "저장 세션 기록을 이 모드에서는 사용할 수 없어, 현재 세션과 이 파일 내부 중복만 검사했습니다.",
    });
  }

  const canImport = newEvents.length > 0;
  const headline = totalDuplicates > 0
    ? canImport
      ? buildDuplicateHeadline({
          newCount: newEvents.length,
          currentSessionDuplicates: summary.currentSessionDuplicates,
          savedSessionDuplicates: summary.savedSessionDuplicates,
          inBatchDuplicates: summary.inBatchDuplicates,
        })
      : `모든 이벤트가 이미 가져온 항목입니다. Import Review는 비활성화됩니다.`
    : preview.headline;

  return {
    ...preview,
    warnings,
    canImport,
    headline,
    newEventCount: newEvents.length,
    duplicateEventCount: totalDuplicates,
    newEvents,
    duplicateEvents,
    duplicateIdentities,
    currentSessionDuplicateCount: summary.currentSessionDuplicates,
    savedSessionDuplicateCount: summary.savedSessionDuplicates,
    inBatchDuplicateCount: summary.inBatchDuplicates,
    identityUnavailableCount: summary.identityUnavailable,
    savedSessionHistoryAvailable,
    matchedSavedSessions: summary.matchedSavedSessions,
  };
}

/**
 * @deprecated Prefer `applyHistoryOverlay`. Kept so older callers that
 * imported the session-only overlay continue to compile until they migrate.
 */
export function applyDuplicateOverlay(
  preview: ConnectorJsonlPreview,
  session: { events: TimelineEvent[] } | null | undefined,
): ConnectorJsonlPreview {
  return applyHistoryOverlay(preview, {
    activeSession: session ?? null,
    // Pass `undefined` (not `[]`) so the overlay doesn't emit a
    // saved-session-unavailable warning for callers that never opted
    // into cross-session history.
    savedSessions: undefined,
  });
}

function buildDuplicateHeadline(args: {
  newCount: number;
  currentSessionDuplicates: number;
  savedSessionDuplicates: number;
  inBatchDuplicates: number;
}): string {
  const dupParts: string[] = [];
  if (args.currentSessionDuplicates > 0) dupParts.push(`현재 세션 ${args.currentSessionDuplicates}`);
  if (args.savedSessionDuplicates > 0) dupParts.push(`저장 세션 ${args.savedSessionDuplicates}`);
  if (args.inBatchDuplicates > 0) dupParts.push(`파일 내부 ${args.inBatchDuplicates}`);
  const dupLabel = dupParts.length ? dupParts.join(" / ") : `${args.currentSessionDuplicates + args.savedSessionDuplicates + args.inBatchDuplicates}`;
  return `${args.newCount}개 새 이벤트 / 중복 ${dupLabel} (기본 스킵).`;
}

// Re-exported so callers can keep importing from this module if they prefer.
export type {
  ConnectorImportHistory,
  ConnectorImportHistoryInput,
  ConnectorImportHistorySavedSession,
  ConnectorImportOverlapSummary,
};

