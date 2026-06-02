import type {
  CaptureFidelity,
  CreatedBy,
  EventType,
  SourceKind,
  SourceRef,
  TimelineEvent,
  TrustLevel,
} from "../../domain/types";
import { createImportId } from "../import/id";
import { redactText } from "./redaction";
import { getConnectorEventIdentity } from "./connectorEventIdentity";
import type {
  ConnectorEvent,
  ConnectorEventKind,
  ConnectorId,
  ConnectorRawDataPolicy,
  NormalizedImportCandidateLike,
} from "./types";

export type NormalizeConnectorBatchInput = {
  projectId: string;
  sessionId: string;
  events: ConnectorEvent[];
  /** When true (default), apply redaction to summary / rawText before persisting. */
  applyRedaction?: boolean;
};

/**
 * Convert a list of validated connector events into one or more import
 * candidates ready for `Import Review`. Events from the same
 * (connectorId, external sessionId) tuple share a single SourceRef so
 * Project Memory can show "Claude Code session <id>" with all its events.
 *
 * The shape mirrors what `normalizeAiTranscript` and `normalizeGitDiff`
 * already produce, so the downstream Import Review + session store paths
 * do not need to change.
 */
export function normalizeConnectorEventBatch({
  projectId,
  sessionId,
  events,
  applyRedaction = true,
}: NormalizeConnectorBatchInput): NormalizedImportCandidateLike[] {
  if (events.length === 0) return [];

  type Bucket = {
    connectorId: ConnectorId;
    externalSessionId: string | null;
    events: ConnectorEvent[];
    capturedAt: string;
  };

  const buckets = new Map<string, Bucket>();
  for (const event of events) {
    const externalSessionId = event.sessionId ?? null;
    const key = `${event.connectorId}::${externalSessionId ?? "unscoped"}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.events.push(event);
      if (new Date(event.occurredAt).getTime() < new Date(existing.capturedAt).getTime()) {
        existing.capturedAt = event.occurredAt;
      }
    } else {
      buckets.set(key, {
        connectorId: event.connectorId,
        externalSessionId,
        events: [event],
        capturedAt: event.occurredAt,
      });
    }
  }

  const candidates: NormalizedImportCandidateLike[] = [];
  for (const bucket of buckets.values()) {
    candidates.push(buildCandidate(bucket, projectId, sessionId, applyRedaction));
  }
  return candidates;
}

function buildCandidate(
  bucket: { connectorId: ConnectorId; externalSessionId: string | null; events: ConnectorEvent[]; capturedAt: string },
  projectId: string,
  sessionId: string,
  applyRedaction: boolean,
): NormalizedImportCandidateLike {
  const sortedEvents = [...bucket.events].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );

  const sourceTitle = deriveSourceTitle(bucket.connectorId, sortedEvents, bucket.externalSessionId);
  const integration = mapConnectorToSourceKind(bucket.connectorId, sortedEvents);
  const sourceId = createImportId(
    `src-conn-${bucket.connectorId.toLowerCase().slice(0, 10)}`,
    sourceTitle,
    bucket.capturedAt,
  );

  const timelineEvents: TimelineEvent[] = sortedEvents
    .map((event, idx) => mapConnectorEventToTimelineEvent({
      event,
      sourceId,
      projectId,
      sessionId,
      ordinal: idx,
      applyRedaction,
    }))
    .filter((event): event is TimelineEvent => event !== null);

  const rawRetention = deriveSourceRetention(sortedEvents);
  const trustLevel = deriveSourceTrust(sortedEvents);
  const detail = describeBucket(bucket.connectorId, sortedEvents, bucket.externalSessionId);

  const source: SourceRef = {
    id: sourceId,
    sessionId,
    kind: integration,
    title: sourceTitle,
    detail,
    trustLevel,
    redactionStatus: anyRedacted(sortedEvents, applyRedaction) ? "redacted" : "notNeeded",
    rawRetention,
    capturedAt: bucket.capturedAt,
    relatedEventIds: timelineEvents.map((event) => event.id),
    captureFidelity: deriveSourceFidelity(sortedEvents),
  };

  return { source, events: timelineEvents };
}

function deriveSourceTitle(
  connectorId: ConnectorId,
  events: ConnectorEvent[],
  externalSessionId: string | null,
): string {
  const start = events.find((event) => event.kind === "session_started");
  if (start?.sourceTitle) return start.sourceTitle;
  if (start?.summary) return truncate(start.summary, 80);
  const firstPrompt = events.find(
    (event) => event.kind === "prompt_submitted" || event.kind === "assistant_message",
  );
  if (firstPrompt?.sourceTitle) return firstPrompt.sourceTitle;
  if (firstPrompt?.summary) return truncate(firstPrompt.summary, 80);
  const label = connectorLabel(connectorId);
  return externalSessionId ? `${label} · ${externalSessionId}` : label;
}

function connectorLabel(connectorId: ConnectorId): string {
  switch (connectorId) {
    case "claudeCodeHook":
      return "Claude Code session";
    case "codexCliWrapper":
      return "Codex CLI session";
    case "openCodeCli":
      return "OpenCode session";
    case "terminalShell":
      return "Terminal shell session";
    case "terminal":
      return "Terminal session";
    case "gitCommand":
      return "Git command capture";
    case "git":
      return "Git session";
    case "desktopTranscriptImport":
      return "Desktop transcript import";
    case "githubPrImport":
      return "GitHub PR import";
    case "mcpServer":
      return "MCP capture session";
    case "manual":
      return "Manual connector batch";
    default:
      return `Connector · ${connectorId}`;
  }
}

/**
 * Map the connector id to an existing `SourceKind`. We deliberately reuse
 * the existing registry — `claudeTranscript`, `codexTranscript`, `terminal`,
 * `gitDiff`, `manualNote` — so connector evidence flows through every
 * downstream traceability helper without any registry churn.
 */
function mapConnectorToSourceKind(connectorId: ConnectorId, events: ConnectorEvent[]): SourceKind {
  switch (connectorId) {
    case "claudeCodeHook":
      return "claudeTranscript";
    case "codexCliWrapper":
      return "codexTranscript";
    case "openCodeCli":
      // OpenCode is an AI coding agent. There is no dedicated SourceKind yet,
      // so its capture flows through the generic AI-conversation path (its
      // OpenCode identity is preserved via connectorId + the "OpenCode
      // session" source title) — the same pattern as desktop transcript import.
      return "aiConversation";
    case "terminalShell":
    case "terminal":
      return "terminal";
    case "gitCommand":
    case "git":
      return "gitDiff";
    case "desktopTranscriptImport":
      // Desktop / web transcript imports come in via file paste — treat them
      // as AI conversations so they hit the existing AI-transcript path.
      return "aiConversation";
    case "githubPrImport":
      // GitHub PR import is planned; until a richer path lands, treat the
      // imported text as a gitDiff-style source so existing helpers run.
      return "gitDiff";
    case "mcpServer":
      // An MCP host (Claude Desktop, etc.) explicitly hands Mori context via
      // the local MCP server. Treat it as AI-conversation evidence so it flows
      // through the existing transcript path; the MCP origin is preserved via
      // connectorId + the "MCP capture session" source title.
      return "aiConversation";
    case "manual":
      return "manualNote";
    default: {
      // Fall back to the dominant kind across the batch.
      const dominant = events[0]?.kind;
      if (dominant === "git_diff_captured" || dominant === "commit_created") return "gitDiff";
      if (dominant === "command_finished" || dominant === "command_started") return "terminal";
      if (dominant === "transcript_imported") return "aiConversation";
      return "manualNote";
    }
  }
}

function describeBucket(
  connectorId: ConnectorId,
  events: ConnectorEvent[],
  externalSessionId: string | null,
): string {
  const totals: Record<ConnectorEventKind, number> = {
    session_started: 0,
    prompt_submitted: 0,
    assistant_message: 0,
    tool_started: 0,
    tool_finished: 0,
    file_changed: 0,
    command_started: 0,
    command_finished: 0,
    git_diff_captured: 0,
    commit_created: 0,
    transcript_imported: 0,
    session_finished: 0,
  };
  // Only count known kinds; an unknown / future kind has no slot here and is
  // reflected in the `events.length` fallback below.
  for (const event of events) {
    if (event.kind in totals) totals[event.kind] += 1;
  }
  const parts: string[] = [];
  if (totals.prompt_submitted) parts.push(`${totals.prompt_submitted} prompts`);
  if (totals.assistant_message) parts.push(`${totals.assistant_message} assistant`);
  if (totals.tool_finished) parts.push(`${totals.tool_finished} tools`);
  if (totals.command_finished) parts.push(`${totals.command_finished} commands`);
  if (totals.file_changed) parts.push(`${totals.file_changed} files`);
  if (totals.git_diff_captured) parts.push(`${totals.git_diff_captured} diffs`);
  if (totals.commit_created) parts.push(`${totals.commit_created} commits`);
  if (totals.transcript_imported) parts.push(`${totals.transcript_imported} transcripts`);
  const summary = parts.length > 0 ? parts.join(" · ") : `${events.length} events`;
  const session = externalSessionId ? ` · session ${externalSessionId}` : "";
  return `${connectorLabel(connectorId)} · ${summary}${session}`;
}

/** Stable reason codes for connector-bucket capture fidelity. */
export const CONNECTOR_FIDELITY_REASON = {
  /** A session-shaped bucket has no `session_started` event — capture began mid-session. */
  noSessionStart: "noSessionStart",
  /** A session-shaped bucket has no `session_finished` event — the session end was not captured. */
  noSessionEnd: "noSessionEnd",
} as const;

// Live-activity kinds that mark a bucket as "session-shaped": their presence
// means the bucket represents an ongoing session, for which a missing
// start / finish marker is a real completeness gap. Single-artifact buckets
// (a lone git diff, a transcript import, a note) are complete on their own.
const SESSION_ACTIVITY_KINDS: ReadonlySet<ConnectorEventKind> = new Set([
  "prompt_submitted",
  "assistant_message",
  "tool_started",
  "tool_finished",
  "command_started",
  "command_finished",
  "file_changed",
]);

/**
 * Honest read of how complete a connector bucket is. A bucket built from live
 * session activity is `full` only when it is bracketed by both a
 * `session_started` and a `session_finished` event; otherwise it is a
 * mid-session slice and reported `partial`. Buckets that are a single discrete
 * artifact (a captured diff, an imported transcript, a note) are `full`.
 */
function deriveSourceFidelity(events: ConnectorEvent[]): CaptureFidelity {
  const kinds = new Set(events.map((event) => event.kind));
  const sessionShaped = [...kinds].some((kind) => SESSION_ACTIVITY_KINDS.has(kind));
  if (!sessionShaped) return { level: "full", reasons: [] };

  const reasons: string[] = [];
  if (!kinds.has("session_started")) reasons.push(CONNECTOR_FIDELITY_REASON.noSessionStart);
  if (!kinds.has("session_finished")) reasons.push(CONNECTOR_FIDELITY_REASON.noSessionEnd);
  return reasons.length === 0 ? { level: "full", reasons: [] } : { level: "partial", reasons };
}

function deriveSourceRetention(events: ConnectorEvent[]): SourceRef["rawRetention"] {
  // If any event retains raw data, the source is retained; otherwise
  // summary-only is the default.
  const policies = new Set<ConnectorRawDataPolicy>(events.map((event) => event.privacy.rawDataPolicy));
  if (policies.has("retained")) return "retained";
  if (policies.has("redacted") || policies.has("summary_only")) return "summaryOnly";
  // Treat reference_only as summaryOnly for storage purposes — Mori still
  // does not retain raw text, it stores summary metadata only.
  return "summaryOnly";
}

function deriveSourceTrust(events: ConnectorEvent[]): TrustLevel {
  // Hook/wrapper events from a controlled local tool are treated as
  // observed evidence (Mori watched them happen via the connector) rather
  // than fully verified user input. AI-message events without ground
  // truth fall to inferred.
  const allCaptureMethods = new Set(events.map((event) => event.privacy.captureMethod));
  if (allCaptureMethods.has("manual_paste") && allCaptureMethods.size === 1) return "verified";
  const allKinds = new Set(events.map((event) => event.kind));
  const onlyAiMessages =
    allKinds.size > 0 &&
    [...allKinds].every((kind) => kind === "assistant_message");
  if (onlyAiMessages) return "inferred";
  return "observed";
}

function anyRedacted(events: ConnectorEvent[], applyRedaction: boolean): boolean {
  if (!applyRedaction) return false;
  return events.some((event) => event.privacy.redacted === true);
}

function mapConnectorEventToTimelineEvent({
  event,
  sourceId,
  projectId,
  sessionId,
  ordinal,
  applyRedaction,
}: {
  event: ConnectorEvent;
  sourceId: string;
  projectId: string;
  sessionId: string;
  ordinal: number;
  applyRedaction: boolean;
}): TimelineEvent | null {
  // session_started events become the source but do not need a Timeline
  // event of their own — the source already carries the session label.
  if (event.kind === "session_started") return null;

  const type = mapConnectorKindToEventType(event.kind);
  if (!type) return null;

  // Append the connector event's structured fields (command / filePath /
  // git.files paths) to the human summary when they are not already mentioned.
  // The summary is the only string most downstream consumers see — without
  // this enrichment a `command_finished` event whose summary reads "Tests
  // failing" loses the command line ("npm test src/sync/queue.test.ts") that
  // explains *what* failed, and a `file_changed` event loses the touched path
  // entirely. Redaction still runs after enrichment so secrets surfaced from
  // the structured fields get masked too.
  const enriched = enrichConnectorSummary(event);
  const summary = applyRedaction ? redactText(enriched).redacted : enriched;
  const titleBase = event.sourceTitle ?? event.summary;
  const eventTitle = truncate(titleBase, 80);
  const eventId = createImportId(
    `evt-conn-${event.connectorId.toLowerCase().slice(0, 10)}-${ordinal}`,
    titleBase,
    event.occurredAt,
  );

  const trustLevel = trustForEvent(event);
  const createdBy: CreatedBy = "import";

  return {
    id: eventId,
    sessionId,
    projectId,
    start: event.occurredAt,
    type,
    title: eventTitle,
    summary,
    sourceRefs: [sourceId],
    linkedIssueIds: [],
    linkedDecisionIds: [],
    relationshipIds: [],
    trustLevel,
    confidence: confidenceForEvent(event),
    createdBy,
    userModified: false,
    // Preserve the connector identity so subsequent imports can detect
    // duplicates without re-parsing the original connector event id.
    connectorEventId: getConnectorEventIdentity(event),
  };
}

/**
 * Conditionally append structured fields to the human summary so downstream
 * consumers (Timeline cards, evidence chips, Work Bundle file detection, the
 * reconstruction-lab lenses) see what the event acted on, not only the
 * connector tool's prose summary. Additive only — never replaces the base
 * summary, never duplicates content the summary already mentions.
 */
export function enrichConnectorSummary(event: ConnectorEvent): string {
  const base = event.summary ?? "";
  const parts: string[] = [];

  if (
    (event.kind === "command_started" || event.kind === "command_finished") &&
    event.command &&
    !base.includes(event.command)
  ) {
    parts.push(`$ ${event.command}`);
  }

  if (
    event.kind === "file_changed" &&
    event.filePath &&
    !base.includes(event.filePath)
  ) {
    parts.push(event.filePath);
  }

  if (
    (event.kind === "commit_created" || event.kind === "git_diff_captured") &&
    event.git?.files &&
    event.git.files.length > 0
  ) {
    const fresh = event.git.files
      .map((file) => file.path)
      .filter((path): path is string => Boolean(path) && !base.includes(path))
      .slice(0, 3);
    if (fresh.length > 0) parts.push(fresh.join(", "));
  }

  if (parts.length === 0) return base;
  return base ? `${base} · ${parts.join(" · ")}` : parts.join(" · ");
}

function mapConnectorKindToEventType(kind: ConnectorEventKind): EventType | null {
  switch (kind) {
    case "prompt_submitted":
    case "assistant_message":
    case "tool_started":
    case "tool_finished":
    case "transcript_imported":
      return "aiConversation";
    case "command_started":
    case "command_finished":
      return "fileCode";
    case "file_changed":
      return "fileCode";
    case "git_diff_captured":
    case "commit_created":
      return "fileCode";
    case "session_finished":
      return "documentNote";
    case "session_started":
      return null;
    default:
      // Tolerant reader: an unknown / future kind is preserved as a generic
      // note event rather than dropped.
      return "documentNote";
  }
}

function trustForEvent(event: ConnectorEvent): TrustLevel {
  // Manual paste of a connector batch is verified (the user vetted it).
  if (event.privacy.captureMethod === "manual_paste") return "verified";
  if (event.kind === "assistant_message") return "inferred";
  return "observed";
}

function confidenceForEvent(event: ConnectorEvent): number {
  // The connector tool itself observed the event happen, so confidence is
  // high. We dampen AI-generated assistant messages slightly.
  if (event.kind === "assistant_message") return 0.85;
  return 0.95;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
