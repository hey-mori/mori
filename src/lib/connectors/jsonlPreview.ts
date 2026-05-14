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
import {
  collectImportedConnectorEventIds,
  partitionConnectorEventsByIdentity,
  type ConnectorEventIdentity,
} from "./connectorEventIdentity";
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
};

export type ConnectorPreviewWarning = {
  code:
    | "redacted"
    | "missing_session_id"
    | "unknown_connector_id"
    | "all_invalid"
    | "all_duplicate"
    | "partial_duplicate";
  message: string;
  affectedLines?: number[];
};

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
 * Same shape as `buildConnectorJsonlPreview`, plus duplicate detection
 * against the active session's already-applied TimelineEvents.
 *
 * Events whose `connectorEventId` is already present in the session are
 * classified as duplicates. The preview's `events` field still carries the
 * full validated set so callers that opt into "Include duplicates" can use
 * it; the `newEvents` / `duplicateEvents` partitions are what the default
 * skip-duplicates path reads from.
 *
 * Edge cases:
 *   - When there is no session (e.g. demo) the importedIds set is empty
 *     and every valid event ends up in `newEvents`.
 *   - When everything is a duplicate, `canImport` is flipped to `false`
 *     and an `all_duplicate` warning is emitted. The UI surfaces this
 *     state by disabling Import to Review with a clear message.
 *   - When the batch is a partial duplicate, `canImport` stays true (the
 *     new events ARE importable) and a `partial_duplicate` warning is
 *     emitted so the UI can show the skip count.
 */
export function buildConnectorJsonlPreviewWithSession(
  text: string,
  session: { events: TimelineEvent[] } | null | undefined,
): ConnectorJsonlPreview {
  const base = buildConnectorJsonlPreview(text);
  return applyDuplicateOverlay(base, session);
}

/**
 * Pure version of the overlay so callers that already have a parsed
 * outcome (tests, future Tauri ingest) can re-use it without re-parsing.
 */
export function applyDuplicateOverlay(
  preview: ConnectorJsonlPreview,
  session: { events: TimelineEvent[] } | null | undefined,
): ConnectorJsonlPreview {
  if (preview.kind === "empty" || preview.kind === "errors-only") {
    return preview;
  }
  const importedIds = session
    ? collectImportedConnectorEventIds(session)
    : new Set<ConnectorEventIdentity>();
  const { newEvents, duplicateEvents, duplicateIdentities } =
    partitionConnectorEventsByIdentity(preview.events, importedIds);

  const warnings = [...preview.warnings];
  if (duplicateEvents.length > 0 && newEvents.length === 0) {
    warnings.push({
      code: "all_duplicate",
      message:
        `모든 ${duplicateEvents.length}개 이벤트가 이미 가져온 connector 이벤트와 동일합니다. 같은 JSONL을 한 번 더 import하셨거나 successor 파일이 동일 세션을 반복하는지 확인하세요.`,
    });
  } else if (duplicateEvents.length > 0) {
    warnings.push({
      code: "partial_duplicate",
      message:
        `${duplicateEvents.length}개 이벤트는 이미 가져왔습니다. 기본적으로 새 이벤트 ${newEvents.length}개만 Import Review로 전달됩니다.`,
    });
  }

  const canImport = newEvents.length > 0;
  const headline = duplicateEvents.length > 0
    ? canImport
      ? `${newEvents.length}개 새 이벤트 / ${duplicateEvents.length}개 중복 (기본 스킵).`
      : `모든 이벤트가 이미 가져온 항목입니다. Import Review는 비활성화됩니다.`
    : preview.headline;

  return {
    ...preview,
    warnings,
    canImport,
    headline,
    newEventCount: newEvents.length,
    duplicateEventCount: duplicateEvents.length,
    newEvents,
    duplicateEvents,
    duplicateIdentities,
  };
}

