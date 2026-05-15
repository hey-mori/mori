/**
 * SQLite Accepted Memory Storage — row mirrors + converters.
 *
 * The desktop SQLite tables `consolidated_memories` and
 * `consolidated_memory_audit` store accepted project memory and the
 * review-action audit log. Object / array fields are flattened to JSON
 * `*_json` columns; the Rust layer treats those columns as opaque text.
 *
 * This module owns the conversion between the durable in-app records
 * (`StoredAcceptedProjectMemory` / `StoredMemoryReviewAction`) and the
 * flat SQLite row shapes. It is pure — no IO — so the Tauri bridge and
 * tests can round-trip records without touching a database.
 */
import type {
  StoredAcceptedProjectMemory,
  StoredMemoryEvidenceRef,
  StoredMemoryReviewAction,
} from "../storage/storageTypes";

/** Flat row mirror of the Rust `AcceptedMemoryRow` (snake_case keys). */
export type SqliteAcceptedMemoryRow = {
  id: string;
  project_id: string;
  kind: string;
  title: string;
  summary: string;
  status: string;
  importance: string;
  confidence_label: string;
  confidence_score: number | null;
  confidence_rationale: string | null;
  evidence_refs_json: string;
  source_session_ids_json: string;
  origin_proposal_ids_json: string;
  related_issue_ids_json: string;
  related_decision_ids_json: string;
  proposed_action: string;
  review_note: string | null;
  sensitivity: string;
  resume_eligible: number;
  report_eligibility: string;
  superseded_by: string | null;
  created_at: string;
  updated_at: string;
  accepted_at: string;
  accepted_by: string;
  review_action_ids_json: string;
  schema_version: number;
};

/** Flat row mirror of the Rust `MemoryReviewActionRow` (snake_case keys). */
export type SqliteMemoryReviewActionRow = {
  id: string;
  project_id: string;
  action_type: string;
  actor: string;
  timestamp: string;
  source_proposal_id: string | null;
  target_memory_ids_json: string;
  before_json: string | null;
  after_json: string | null;
  note: string | null;
  reversible: number;
  schema_version: number;
};

export type SqliteAcceptedMemoryWriteResult = { memoriesWritten: number };
export type SqliteMemoryReviewActionWriteResult = { actionsWritten: number };

// ─── accepted memory ──────────────────────────────────────────────────

export function toSqliteAcceptedMemoryRow(
  memory: StoredAcceptedProjectMemory,
): SqliteAcceptedMemoryRow {
  return {
    id: memory.id,
    project_id: memory.projectId,
    kind: memory.kind,
    title: memory.title,
    summary: memory.summary,
    status: memory.status,
    importance: memory.importance,
    confidence_label: memory.confidence.label,
    confidence_score: memory.confidence.score ?? null,
    confidence_rationale: memory.confidence.rationale ?? null,
    evidence_refs_json: JSON.stringify(memory.evidenceRefs),
    source_session_ids_json: JSON.stringify(memory.sourceSessionIds),
    origin_proposal_ids_json: JSON.stringify(memory.originProposalIds),
    related_issue_ids_json: JSON.stringify(memory.relatedIssueIds),
    related_decision_ids_json: JSON.stringify(memory.relatedDecisionIds),
    proposed_action: memory.proposedAction,
    review_note: memory.reviewNote ?? null,
    sensitivity: memory.sensitivity,
    resume_eligible: memory.resumeEligible ? 1 : 0,
    report_eligibility: memory.reportEligibility,
    superseded_by: memory.supersededBy ?? null,
    created_at: memory.createdAt,
    updated_at: memory.updatedAt,
    accepted_at: memory.acceptedAt,
    accepted_by: memory.acceptedBy,
    review_action_ids_json: JSON.stringify(memory.reviewActionIds),
    schema_version: memory.schemaVersion,
  };
}

export function fromSqliteAcceptedMemoryRow(
  row: SqliteAcceptedMemoryRow,
): StoredAcceptedProjectMemory {
  const confidence: StoredAcceptedProjectMemory["confidence"] = {
    label: row.confidence_label as StoredAcceptedProjectMemory["confidence"]["label"],
  };
  if (row.confidence_score !== null) confidence.score = row.confidence_score;
  if (row.confidence_rationale !== null) confidence.rationale = row.confidence_rationale;

  const memory: StoredAcceptedProjectMemory = {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind as StoredAcceptedProjectMemory["kind"],
    title: row.title,
    summary: row.summary,
    status: row.status as StoredAcceptedProjectMemory["status"],
    importance: row.importance as StoredAcceptedProjectMemory["importance"],
    confidence,
    evidenceRefs: parseJsonArray<StoredMemoryEvidenceRef>(row.evidence_refs_json),
    sourceSessionIds: parseJsonArray<string>(row.source_session_ids_json),
    originProposalIds: parseJsonArray<string>(row.origin_proposal_ids_json),
    relatedIssueIds: parseJsonArray<string>(row.related_issue_ids_json),
    relatedDecisionIds: parseJsonArray<string>(row.related_decision_ids_json),
    proposedAction: row.proposed_action as StoredAcceptedProjectMemory["proposedAction"],
    sensitivity: row.sensitivity as StoredAcceptedProjectMemory["sensitivity"],
    resumeEligible: row.resume_eligible !== 0,
    reportEligibility: row.report_eligibility as StoredAcceptedProjectMemory["reportEligibility"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acceptedAt: row.accepted_at,
    acceptedBy: "local-user",
    reviewActionIds: parseJsonArray<string>(row.review_action_ids_json),
    schemaVersion: 1,
    adapter: "desktop-sqlite",
  };
  if (row.review_note !== null) memory.reviewNote = row.review_note;
  if (row.superseded_by !== null) memory.supersededBy = row.superseded_by;
  return memory;
}

// ─── review actions ───────────────────────────────────────────────────

export function toSqliteMemoryReviewActionRow(
  action: StoredMemoryReviewAction,
): SqliteMemoryReviewActionRow {
  return {
    id: action.id,
    project_id: action.projectId,
    action_type: action.actionType,
    actor: action.actor,
    timestamp: action.timestamp,
    source_proposal_id: action.sourceProposalId ?? null,
    target_memory_ids_json: JSON.stringify(action.targetMemoryIds),
    before_json: action.before === undefined ? null : JSON.stringify(action.before),
    after_json: action.after === undefined ? null : JSON.stringify(action.after),
    note: action.note ?? null,
    reversible: action.reversible ? 1 : 0,
    schema_version: action.schemaVersion,
  };
}

export function fromSqliteMemoryReviewActionRow(
  row: SqliteMemoryReviewActionRow,
): StoredMemoryReviewAction {
  const action: StoredMemoryReviewAction = {
    id: row.id,
    projectId: row.project_id,
    actionType: row.action_type as StoredMemoryReviewAction["actionType"],
    actor: "local-user",
    timestamp: row.timestamp,
    targetMemoryIds: parseJsonArray<string>(row.target_memory_ids_json),
    reversible: row.reversible !== 0,
    schemaVersion: 1,
    adapter: "desktop-sqlite",
  };
  if (row.source_proposal_id !== null) action.sourceProposalId = row.source_proposal_id;
  if (row.before_json !== null) action.before = JSON.parse(row.before_json);
  if (row.after_json !== null) action.after = JSON.parse(row.after_json);
  if (row.note !== null) action.note = row.note;
  return action;
}

// ─── internals ────────────────────────────────────────────────────────

function parseJsonArray<T>(json: string): T[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}
