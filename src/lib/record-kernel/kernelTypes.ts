/**
 * Record kernel · domain types.
 *
 * The generic center of the personal context workspace
 * (docs/design/mori-context-workspace-architecture.md §3): every unit the
 * user accumulates is a `MoriRecord` typed by a `SchemaDefinition` that is
 * **data, not code**. New life domains (독서, 수면, 여행 ...) arrive as
 * schemas; nothing here may grow a per-domain field or enum member.
 *
 * Kernel objects never depend on the legacy session-centric domain
 * (`src/domain/types.ts`). Adapters convert sessions INTO records
 * (architecture doc §18, the no-leak rule), never the reverse.
 */

/** Apply-policy outcome states plus the archive tail. `candidate` = proposed,
 *  waiting in the inbox; `provisional` = applied but marked, excluded from
 *  external outputs until confirmed; `active` = confirmed / normal. */
export type RecordStatus = "candidate" | "provisional" | "active" | "archived" | "discarded";

export type RecordOrigin = "user" | "import" | "agent" | "automation" | "derived";

/** Storage canonicality per record (architecture doc §10): structured and
 *  derived records are DB-canonical; user-authored prose flips to
 *  file-canonical in storage stage 2. Present from day one so the flip is a
 *  flag change, not a format change. */
export type RecordOwnership = "db" | "file";

/** How the activity time was established. `unknown` is first-class: an
 *  unknown date is never fabricated into a known one. */
export type TimeBasis =
  | "source-exact"
  | "source-observed"
  | "user-provided"
  | "ai-inferred"
  | "capture-fallback"
  | "unknown";

export type PropertyType =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "duration-minutes"
  | "select"
  | "entity"
  | "entity-list"
  | "json";

/** A JSON-shaped property value: scalars, arrays, or objects. Arrays and
 *  objects back the `json` / `entity-list` property types. */
export type RecordPropertyValue =
  | string
  | number
  | boolean
  | null
  | unknown[]
  | Record<string, unknown>;

export type SchemaPropertyDefinition = {
  key: string;
  /** Korean display label (Korean-first UI copy). */
  label: string;
  type: PropertyType;
  required?: boolean;
  /** Allowed values when `type === "select"`. */
  options?: string[];
  /** Entity type constraint when `type` is `entity` / `entity-list`. */
  entityType?: string;
  /** Metric-bearing: projected into time-series for charts / trends. */
  metric?: boolean;
  unit?: string;
};

/** Which layer of the model a schema's records live in (architecture §2). */
export type RecordLayer = "occurrence" | "distilled" | "container" | "source" | "aggregate";

export type SchemaScope = "system" | "user";

export type SchemaDefinition = {
  /** Kebab-case, stable. User schemas must not collide with system ids. */
  id: string;
  version: number;
  scope: SchemaScope;
  /** Korean display name. */
  name: string;
  description: string;
  layer: RecordLayer;
  properties: SchemaPropertyDefinition[];
};

export type MoriRecord = {
  id: string;
  schemaId: string;
  title: string;
  body: string;
  /** Activity time: when it actually happened. Absent when unknown. */
  occurredStart?: string;
  occurredEnd?: string;
  /** The trace's own date (commit time, publish date). */
  sourceCreatedAt?: string;
  /** When it entered Mori. Always present. */
  capturedAt: string;
  timeBasis: TimeBasis;
  /** 0..1 confidence in the activity time when it was inferred. */
  timeConfidence?: number;
  status: RecordStatus;
  origin: RecordOrigin;
  ownership: RecordOwnership;
  contextIds: string[];
  properties: Record<string, RecordPropertyValue>;
  createdAt: string;
  updatedAt: string;
};

export type ContextType =
  | "project"
  | "workstream"
  | "topic"
  | "area"
  | "routine"
  | "person"
  | "custom";

export type KernelContext = {
  id: string;
  type: ContextType;
  name: string;
  parentId?: string;
  archived?: boolean;
  createdAt: string;
};

export type KernelEntity = {
  id: string;
  /** Open vocabulary: exercise, term, ticker, person, tool, place ... */
  type: string;
  canonicalName: string;
  createdAt: string;
};

export type EntityAlias = {
  entityId: string;
  alias: string;
  addedFrom: "user" | "import" | "rule";
};

export type RelationType =
  | "belongs-to"
  | "part-of"
  | "derived-from"
  | "supports"
  | "contradicts"
  | "references"
  | "follows"
  | "duplicates";

/** Exactly one of the `to*` targets is set. */
export type KernelRelation = {
  id: string;
  fromRecordId: string;
  type: RelationType;
  toRecordId?: string;
  toContextId?: string;
  toEntityId?: string;
  createdAt: string;
};

export type SourceKind =
  | "text"
  | "url"
  | "file"
  | "pasted-conversation"
  | "git"
  | "agent-session"
  | "connected-sync";

export type SourceRetention = "retained" | "summaryOnly" | "redacted" | "notCaptured";

/** A raw trace. Raw-input retention is the default (architecture §16.4):
 *  originals are kept for re-derivation; deleting them is an explicit user
 *  action, never a silent policy. */
export type KernelSource = {
  id: string;
  kind: SourceKind;
  /** URL, file path, agent-session locator ... */
  locator?: string;
  /** The raw body when `retention === "retained"` (redacted when policy says). */
  rawBody?: string;
  contentHash?: string;
  publishedAt?: string;
  capturedAt: string;
  retention: SourceRetention;
};

export type SourceLinkRole = "origin" | "supports" | "references" | "contradicts" | "inspired";

export type SourceLink = {
  sourceId: string;
  recordId: string;
  role: SourceLinkRole;
  /** Line span, timestamp range, commit hash ... inside the source. */
  locator?: string;
  confidence?: number;
};

/** Explainability: which engine produced which record from which sources. */
export type KernelDerivation = {
  id: string;
  recordId: string;
  engine: string;
  model?: string;
  promptVersion?: string;
  inputSourceIds: string[];
  confidence?: number;
  createdAt: string;
};

export type RevisionActor = "user" | "ai" | "rule";

export type RevisionOperation = "create" | "update" | "status-change" | "revert";

/** Append-only change history. Every automated write carries one, so it is
 *  visible and reversible (invariant). */
export type KernelRevision = {
  id: string;
  recordId: string;
  actor: RevisionActor;
  operation: RevisionOperation;
  before?: unknown;
  after?: unknown;
  createdAt: string;
};

export type RuleKind =
  | "alias"
  | "classification"
  | "context-binding"
  | "summary-preference"
  | "automation-level"
  | "extraction-template"
  | "date-inference";

/** Personalization: a user correction made durable (architecture §7). Rules
 *  are visible, editable, disable-able; automated applications cite them. */
export type KernelRule = {
  id: string;
  kind: RuleKind;
  condition: Record<string, unknown>;
  effect: Record<string, unknown>;
  learnedFromRevisionIds: string[];
  enabled: boolean;
  createdAt: string;
};
