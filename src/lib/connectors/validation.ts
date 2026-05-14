import {
  CONNECTOR_CAPTURE_METHODS,
  CONNECTOR_EVENT_KINDS,
  CONNECTOR_RAW_DATA_POLICIES,
  type ConnectorEvent,
  type ConnectorEventKind,
  type ConnectorParseOutcome,
  type ConnectorValidationError,
} from "./types";

/**
 * Validate a single object as a ConnectorEvent. Returns either the typed
 * event or a list of structured errors — never throws. Field-level errors
 * carry the offending field name so the UI can show "line 12: tool.name
 * required" without parsing the message string.
 */
export function validateConnectorEvent(
  value: unknown,
  context: { line?: number; index?: number } = {},
): { event: ConnectorEvent } | { errors: ConnectorValidationError[] } {
  const errors: ConnectorValidationError[] = [];

  if (!isObject(value)) {
    errors.push({ ...context, field: null, message: "Event must be a JSON object." });
    return { errors };
  }

  const id = readString(value, "id");
  if (!id) errors.push({ ...context, field: "id", message: "id is required" });

  const connectorId = readString(value, "connectorId");
  if (!connectorId) errors.push({ ...context, field: "connectorId", message: "connectorId is required" });

  const kindRaw = readString(value, "kind");
  if (!kindRaw) {
    errors.push({ ...context, field: "kind", message: "kind is required" });
  } else if (!CONNECTOR_EVENT_KINDS.includes(kindRaw as ConnectorEventKind)) {
    errors.push({
      ...context,
      field: "kind",
      message: `kind must be one of ${CONNECTOR_EVENT_KINDS.join(", ")}`,
    });
  }

  const occurredAt = readString(value, "occurredAt");
  if (!occurredAt) {
    errors.push({ ...context, field: "occurredAt", message: "occurredAt is required (ISO 8601)" });
  } else if (Number.isNaN(new Date(occurredAt).getTime())) {
    errors.push({ ...context, field: "occurredAt", message: "occurredAt is not a valid timestamp" });
  }

  const summary = readString(value, "summary");
  if (!summary) errors.push({ ...context, field: "summary", message: "summary is required" });

  const privacy = readObject(value, "privacy");
  if (!privacy) {
    errors.push({ ...context, field: "privacy", message: "privacy boundary is required" });
  } else {
    const captureMethod = readString(privacy, "captureMethod");
    if (!captureMethod || !CONNECTOR_CAPTURE_METHODS.includes(captureMethod as any)) {
      errors.push({
        ...context,
        field: "privacy.captureMethod",
        message: `captureMethod must be one of ${CONNECTOR_CAPTURE_METHODS.join(", ")}`,
      });
    }
    const rawPolicy = readString(privacy, "rawDataPolicy");
    if (!rawPolicy || !CONNECTOR_RAW_DATA_POLICIES.includes(rawPolicy as any)) {
      errors.push({
        ...context,
        field: "privacy.rawDataPolicy",
        message: `rawDataPolicy must be one of ${CONNECTOR_RAW_DATA_POLICIES.join(", ")}`,
      });
    }
  }

  const provenance = readObject(value, "provenance");
  if (!provenance) {
    errors.push({ ...context, field: "provenance", message: "provenance is required" });
  } else if (!readString(provenance, "toolName")) {
    errors.push({ ...context, field: "provenance.toolName", message: "provenance.toolName is required" });
  }

  // Kind-specific clusters
  if (!errors.length) {
    const kind = kindRaw as ConnectorEventKind;
    if (kind === "command_finished" || kind === "command_started") {
      if (!readString(value, "command")) {
        errors.push({ ...context, field: "command", message: `command is required for ${kind}` });
      }
    }
    if (kind === "file_changed") {
      const filePath = readString(value, "filePath");
      const git = readObject(value, "git");
      const hasFiles = Boolean(git && Array.isArray((git as any).files) && (git as any).files.length > 0);
      if (!filePath && !hasFiles) {
        errors.push({
          ...context,
          field: "filePath",
          message: "file_changed requires either filePath or git.files[]",
        });
      }
    }
    if (kind === "tool_finished" || kind === "tool_started") {
      const tool = readObject(value, "tool");
      if (!tool || !readString(tool, "name")) {
        errors.push({ ...context, field: "tool.name", message: `tool.name is required for ${kind}` });
      }
    }
  }

  if (errors.length) return { errors };
  return { event: value as ConnectorEvent };
}

/**
 * Parse JSONL text into a ConnectorParseOutcome. Never throws. Empty lines
 * and `#`-prefixed comments are silently skipped; every other malformed
 * line is reported as a `ConnectorValidationError` with line number.
 */
export function parseConnectorJsonl(text: string): ConnectorParseOutcome {
  const events: ConnectorEvent[] = [];
  const errors: ConnectorValidationError[] = [];
  let skippedBlankLines = 0;

  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    const lineNumber = idx + 1;
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      skippedBlankLines += 1;
      return;
    }
    if (trimmed.startsWith("#")) {
      // Treat hash-prefixed lines as comments — keep counted as skipped.
      skippedBlankLines += 1;
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      errors.push({
        line: lineNumber,
        field: null,
        message: `Invalid JSON: ${error instanceof Error ? error.message : "parse error"}`,
      });
      return;
    }
    const result = validateConnectorEvent(parsed, { line: lineNumber });
    if ("event" in result) {
      events.push(result.event);
    } else {
      errors.push(...result.errors);
    }
  });

  return { events, errors, skippedBlankLines };
}

/**
 * Validate an in-memory array of events (e.g. from a Tauri command).
 * Returns the same outcome shape as `parseConnectorJsonl`.
 */
export function validateConnectorEventBatch(events: unknown[]): ConnectorParseOutcome {
  const valid: ConnectorEvent[] = [];
  const errors: ConnectorValidationError[] = [];
  events.forEach((value, index) => {
    const result = validateConnectorEvent(value, { index });
    if ("event" in result) {
      valid.push(result.event);
    } else {
      errors.push(...result.errors);
    }
  });
  return { events: valid, errors, skippedBlankLines: 0 };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: Record<string, unknown>, key: string): string | null {
  const raw = value[key];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readObject(value: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const raw = value[key];
  if (!isObject(raw)) return null;
  return raw;
}
