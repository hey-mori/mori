import {
  normalizeConnectorEventBatch,
  type NormalizeConnectorBatchInput,
} from "./normalizeConnectorEvents";
import { redactText } from "./redaction";
import type {
  ConnectorEvent,
  ConnectorIngestResult,
  ConnectorParseOutcome,
  NormalizedImportCandidateLike,
} from "./types";
import { parseConnectorJsonl, validateConnectorEventBatch } from "./validation";

/**
 * High-level facade that combines parse → validate → (optional redact) →
 * normalize into a single call site. This is the only thing the UI needs
 * to call when a user imports a Mori connector JSONL file.
 *
 * The function never throws — every failure surfaces in
 * `result.outcome.errors` so the UI can render them line-by-line.
 */
export function ingestConnectorJsonl({
  text,
  projectId,
  sessionId,
  applyRedaction = true,
}: {
  text: string;
  projectId: string;
  sessionId: string;
  applyRedaction?: boolean;
}): ConnectorIngestResult {
  const outcome = parseConnectorJsonl(text);
  const events = applyRedaction ? outcome.events.map(applyEventRedaction) : outcome.events;
  const candidates = normalizeConnectorEventBatch({
    projectId,
    sessionId,
    events,
    applyRedaction,
  });
  return { outcome: { ...outcome, events }, candidates };
}

/**
 * Same facade for an in-memory array (used by a future Tauri command that
 * decodes events on the Rust side and forwards them as structured JSON).
 */
export function ingestConnectorEventBatch({
  events,
  projectId,
  sessionId,
  applyRedaction = true,
}: {
  events: unknown[];
  projectId: string;
  sessionId: string;
  applyRedaction?: boolean;
}): ConnectorIngestResult {
  const outcome = validateConnectorEventBatch(events);
  const redacted = applyRedaction ? outcome.events.map(applyEventRedaction) : outcome.events;
  const candidates = normalizeConnectorEventBatch({
    projectId,
    sessionId,
    events: redacted,
    applyRedaction,
  });
  return { outcome: { ...outcome, events: redacted }, candidates };
}

/**
 * Apply field-level redaction. The original event is shallow-cloned so the
 * caller's input is never mutated.
 */
function applyEventRedaction(event: ConnectorEvent): ConnectorEvent {
  const summary = redactText(event.summary);
  const rawText = event.rawText ? redactText(event.rawText) : null;
  const command = event.command ? redactText(event.command) : null;
  const anyRedacted =
    summary.matchedPatterns.length > 0 ||
    (rawText?.matchedPatterns.length ?? 0) > 0 ||
    (command?.matchedPatterns.length ?? 0) > 0;
  return {
    ...event,
    summary: summary.redacted,
    rawText: rawText ? rawText.redacted : event.rawText,
    command: command ? command.redacted : event.command,
    privacy: { ...event.privacy, redacted: event.privacy.redacted === true || anyRedacted },
  };
}

/**
 * Helper exported so a future Tauri ingest command can re-use the
 * normalization without the parse step.
 */
export function buildCandidatesFromEvents(
  input: NormalizeConnectorBatchInput,
): NormalizedImportCandidateLike[] {
  return normalizeConnectorEventBatch(input);
}

export type { ConnectorIngestResult, ConnectorParseOutcome };
