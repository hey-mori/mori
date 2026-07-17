/**
 * SQLite record kernel · row mirrors + converters.
 *
 * The desktop tables `kernel_records`, `kernel_objects`, and
 * `kernel_revisions` store the record kernel. Object / array fields flatten
 * to JSON `*_json` columns; the Rust layer treats those columns as opaque
 * text. This module owns the conversion between kernel objects and the flat
 * row shapes. Pure, no IO, so the Tauri bridge and tests round-trip without
 * a database.
 */
import type {
  KernelRevision,
  MoriRecord,
  RecordOrigin,
  RecordOwnership,
  RecordPropertyValue,
  RecordStatus,
  RevisionActor,
  RevisionOperation,
  TimeBasis,
} from "../record-kernel/kernelTypes";

/** Flat row mirror of the Rust `KernelRecordRow` (snake_case keys). */
export type SqliteKernelRecordRow = {
  id: string;
  schema_id: string;
  title: string;
  body: string;
  occurred_start: string | null;
  occurred_end: string | null;
  source_created_at: string | null;
  captured_at: string;
  time_basis: string;
  time_confidence: number | null;
  status: string;
  origin: string;
  ownership: string;
  context_ids_json: string;
  properties_json: string;
  created_at: string;
  updated_at: string;
};

/** Flat row mirror of the Rust `KernelObjectRow`. */
export type SqliteKernelObjectRow = {
  collection: string;
  id: string;
  payload_json: string;
  saved_at: string;
};

/** Flat row mirror of the Rust `KernelRevisionRow`. */
export type SqliteKernelRevisionRow = {
  id: string;
  record_id: string;
  actor: string;
  operation: string;
  before_json: string | null;
  after_json: string | null;
  created_at: string;
};

export type SqliteKernelWriteResult = { rowsWritten: number };

/** The `kernel_objects` collections. Must stay in sync with the Rust
 *  `KERNEL_OBJECT_COLLECTIONS` allowlist. */
export type KernelObjectCollection =
  | "reading"
  | "context"
  | "entity"
  | "entityAliases"
  | "relation"
  | "source"
  | "sourceLink"
  | "derivation"
  | "rule"
  | "userSchema";

export function toSqliteKernelRecordRow(record: MoriRecord): SqliteKernelRecordRow {
  return {
    id: record.id,
    schema_id: record.schemaId,
    title: record.title,
    body: record.body,
    occurred_start: record.occurredStart ?? null,
    occurred_end: record.occurredEnd ?? null,
    source_created_at: record.sourceCreatedAt ?? null,
    captured_at: record.capturedAt,
    time_basis: record.timeBasis,
    time_confidence: record.timeConfidence ?? null,
    status: record.status,
    origin: record.origin,
    ownership: record.ownership,
    context_ids_json: JSON.stringify(record.contextIds),
    properties_json: JSON.stringify(record.properties),
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSqliteKernelRecordRow(row: SqliteKernelRecordRow): MoriRecord {
  return {
    id: row.id,
    schemaId: row.schema_id,
    title: row.title,
    body: row.body,
    occurredStart: row.occurred_start ?? undefined,
    occurredEnd: row.occurred_end ?? undefined,
    sourceCreatedAt: row.source_created_at ?? undefined,
    capturedAt: row.captured_at,
    timeBasis: row.time_basis as TimeBasis,
    timeConfidence: row.time_confidence ?? undefined,
    status: row.status as RecordStatus,
    origin: row.origin as RecordOrigin,
    ownership: row.ownership as RecordOwnership,
    contextIds: parseJsonArray(row.context_ids_json),
    properties: parseJsonObject(row.properties_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toSqliteKernelObjectRow<T>(
  collection: KernelObjectCollection,
  id: string,
  payload: T,
  savedAt: string = new Date().toISOString(),
): SqliteKernelObjectRow {
  return {
    collection,
    id,
    payload_json: JSON.stringify(payload),
    saved_at: savedAt,
  };
}

export function fromSqliteKernelObjectRow<T>(row: SqliteKernelObjectRow): T | null {
  try {
    return JSON.parse(row.payload_json) as T;
  } catch {
    return null;
  }
}

export function toSqliteKernelRevisionRow(revision: KernelRevision): SqliteKernelRevisionRow {
  return {
    id: revision.id,
    record_id: revision.recordId,
    actor: revision.actor,
    operation: revision.operation,
    before_json: revision.before === undefined ? null : JSON.stringify(revision.before),
    after_json: revision.after === undefined ? null : JSON.stringify(revision.after),
    created_at: revision.createdAt,
  };
}

export function fromSqliteKernelRevisionRow(row: SqliteKernelRevisionRow): KernelRevision {
  return {
    id: row.id,
    recordId: row.record_id,
    actor: row.actor as RevisionActor,
    operation: row.operation as RevisionOperation,
    before: row.before_json === null ? undefined : parseJsonUnknown(row.before_json),
    after: row.after_json === null ? undefined : parseJsonUnknown(row.after_json),
    createdAt: row.created_at,
  };
}

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseJsonObject(raw: string): Record<string, RecordPropertyValue> {
  try {
    const parsed = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, RecordPropertyValue>)
      : {};
  } catch {
    return {};
  }
}

function parseJsonUnknown(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
