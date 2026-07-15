/**
 * Record factory · the one door for creating and updating kernel records.
 *
 * Enforces the invariants that must hold on every record regardless of who
 * writes it: schema validity, three-time honesty (an unknown activity time
 * stays unknown; a claimed time carries a basis), and an append-only
 * `KernelRevision` per write so automated changes stay visible and
 * reversible.
 */
import type {
  KernelRevision,
  MoriRecord,
  RecordOrigin,
  RecordOwnership,
  RecordPropertyValue,
  RecordStatus,
  RevisionActor,
  TimeBasis,
} from "./kernelTypes";
import { KernelValidationError, type SchemaRegistry, validateRecordAgainstSchema } from "./schemaRegistry";

export function createKernelId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export type CreateRecordInput = {
  schemaId: string;
  title: string;
  body?: string;
  occurredStart?: string;
  occurredEnd?: string;
  sourceCreatedAt?: string;
  timeBasis?: TimeBasis;
  timeConfidence?: number;
  status?: RecordStatus;
  origin: RecordOrigin;
  ownership?: RecordOwnership;
  contextIds?: string[];
  properties?: Record<string, RecordPropertyValue>;
  /** Injection point for deterministic tests. */
  now?: () => Date;
  id?: string;
};

/** Who a write is attributed to in the revision trail, by origin. */
function actorForOrigin(origin: RecordOrigin): RevisionActor {
  if (origin === "user") return "user";
  if (origin === "automation") return "rule";
  return "ai";
}

/** Direct user input lands active; anything machine-produced enters as a
 *  candidate until the apply policy (K2) promotes it. */
function defaultStatusForOrigin(origin: RecordOrigin): RecordStatus {
  return origin === "user" ? "active" : "candidate";
}

function resolveTimeBasis(input: CreateRecordInput): TimeBasis {
  if (input.timeBasis) return input.timeBasis;
  if (input.occurredStart === undefined) return "unknown";
  return input.origin === "user" ? "user-provided" : "ai-inferred";
}

function validateTimes(input: CreateRecordInput, timeBasis: TimeBasis): string[] {
  const issues: string[] = [];
  if (timeBasis === "unknown" && input.occurredStart !== undefined) {
    issues.push("timeBasis \"unknown\" cannot carry an occurredStart (never fabricate)");
  }
  if (timeBasis !== "unknown" && timeBasis !== "capture-fallback" && input.occurredStart === undefined) {
    issues.push(`timeBasis "${timeBasis}" requires an occurredStart`);
  }
  if (input.occurredEnd !== undefined && input.occurredStart === undefined) {
    issues.push("occurredEnd requires an occurredStart");
  }
  if (
    input.occurredStart !== undefined &&
    input.occurredEnd !== undefined &&
    input.occurredEnd < input.occurredStart
  ) {
    issues.push("occurredEnd must not precede occurredStart");
  }
  if (
    input.timeConfidence !== undefined &&
    (input.timeConfidence < 0 || input.timeConfidence > 1)
  ) {
    issues.push("timeConfidence must be within 0..1");
  }
  return issues;
}

export type CreatedRecord = {
  record: MoriRecord;
  revision: KernelRevision;
};

export function createRecord(input: CreateRecordInput, registry: SchemaRegistry): CreatedRecord {
  const schema = registry.get(input.schemaId);
  if (!schema) {
    throw new KernelValidationError(`unknown schema "${input.schemaId}"`);
  }

  const timeBasis = resolveTimeBasis(input);
  const issues = validateTimes(input, timeBasis);
  if (input.title.trim().length === 0) issues.push("title is required");
  if (issues.length > 0) {
    throw new KernelValidationError(`invalid record for schema "${input.schemaId}"`, issues);
  }

  const properties = input.properties ?? {};
  const validation = validateRecordAgainstSchema({ properties }, schema);
  if (validation.errors.length > 0) {
    throw new KernelValidationError(
      `record violates schema "${input.schemaId}"`,
      validation.errors,
    );
  }

  const nowIso = (input.now ?? (() => new Date()))().toISOString();
  const record: MoriRecord = {
    id: input.id ?? createKernelId("rec"),
    schemaId: input.schemaId,
    title: input.title,
    body: input.body ?? "",
    occurredStart: input.occurredStart,
    occurredEnd: input.occurredEnd,
    sourceCreatedAt: input.sourceCreatedAt,
    capturedAt: nowIso,
    timeBasis,
    timeConfidence: input.timeConfidence,
    status: input.status ?? defaultStatusForOrigin(input.origin),
    origin: input.origin,
    ownership: input.ownership ?? "db",
    contextIds: input.contextIds ?? [],
    properties,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const revision: KernelRevision = {
    id: createKernelId("rev"),
    recordId: record.id,
    actor: actorForOrigin(input.origin),
    operation: "create",
    after: record,
    createdAt: nowIso,
  };

  return { record, revision };
}

export type RecordPatch = Partial<
  Pick<
    MoriRecord,
    | "schemaId"
    | "title"
    | "body"
    | "occurredStart"
    | "occurredEnd"
    | "sourceCreatedAt"
    | "timeBasis"
    | "timeConfidence"
    | "status"
    | "contextIds"
    | "properties"
    | "ownership"
  >
>;

export type UpdatedRecord = {
  record: MoriRecord;
  revision: KernelRevision;
};

export function applyRecordPatch(
  record: MoriRecord,
  patch: RecordPatch,
  actor: RevisionActor,
  registry: SchemaRegistry,
  now: () => Date = () => new Date(),
): UpdatedRecord {
  const next: MoriRecord = { ...record, ...patch, updatedAt: now().toISOString() };
  // A patch may retype the record (유형 변경 in review / detail); validation
  // then runs against the schema the record is becoming, not the one it was.
  const schema = registry.get(next.schemaId);
  if (!schema) {
    throw new KernelValidationError(`unknown schema "${next.schemaId}"`);
  }

  const issues = validateTimes(next, next.timeBasis);
  if (next.title.trim().length === 0) issues.push("title is required");
  const validation = validateRecordAgainstSchema(next, schema);
  issues.push(...validation.errors);
  if (issues.length > 0) {
    throw new KernelValidationError(`invalid patch for record "${record.id}"`, issues);
  }

  const operation = patch.status !== undefined && patch.status !== record.status
    ? "status-change"
    : "update";
  const revision: KernelRevision = {
    id: createKernelId("rev"),
    recordId: record.id,
    actor,
    operation,
    before: record,
    after: next,
    createdAt: next.updatedAt,
  };

  return { record: next, revision };
}
