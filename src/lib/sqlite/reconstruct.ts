import type {
  Artifact,
  Decision,
  EventType,
  Issue,
  IssueStatus,
  MockSession,
  NextAction,
  Priority,
  Project,
  Relationship,
  Session,
  SourceKind,
  SourceRef,
  Summary,
  TimelineEvent,
  TrustLevel,
} from "../../domain/types";
import type { SqlitePersistenceSnapshot } from "./records";

export function reconstructMoriSession(snapshot: SqlitePersistenceSnapshot): MockSession {
  const project = snapshot.projects[0];
  const session = snapshot.sessions[0];
  if (!project) throw new Error("Snapshot has no project row");
  if (!session) throw new Error("Snapshot has no session row");

  return {
    project: reconstructProject(project),
    session: reconstructSession(session),
    sources: snapshot.sources.map(reconstructSource),
    events: snapshot.events.map(reconstructEvent),
    issues: snapshot.issues.map(reconstructIssue),
    decisions: snapshot.decisions.map(reconstructDecision),
    relationships: snapshot.relationships.map(reconstructRelationship),
    artifacts: snapshot.artifacts.map(reconstructArtifact),
    nextActions: snapshot.nextActions.map(reconstructNextAction),
    summary: snapshot.summaries[0] ? reconstructSummary(snapshot.summaries[0]) : emptySummary(session.id),
  };
}

function reconstructProject(row: SqlitePersistenceSnapshot["projects"][number]): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function reconstructSession(row: SqlitePersistenceSnapshot["sessions"][number]): Session {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    recordingMode: row.recording_mode as Session["recordingMode"],
    llmProvider: row.llm_provider as Session["llmProvider"],
    llmModel: row.llm_model,
    storageLocation: row.storage_location,
    selectedSourceIds: parseStringArray(row.selected_source_ids_json),
    status: row.status as Session["status"],
    ...(row.source_label ? { sourceLabel: row.source_label } : {}),
  };
}

function reconstructSource(row: SqlitePersistenceSnapshot["sources"][number]): SourceRef {
  const captureFidelity = parseCaptureFidelity(row.capture_fidelity_json);
  return {
    id: row.id,
    sessionId: row.session_id,
    kind: row.kind as SourceKind,
    title: row.title,
    detail: row.detail,
    uri: row.uri ?? undefined,
    trustLevel: row.trust_level as TrustLevel,
    redactionStatus: row.redaction_status as SourceRef["redactionStatus"],
    rawRetention: row.raw_retention as SourceRef["rawRetention"],
    capturedAt: row.captured_at,
    relatedEventIds: parseStringArray(row.related_event_ids_json),
    ...(captureFidelity ? { captureFidelity } : {}),
  };
}

function parseCaptureFidelity(raw: string | null): SourceRef["captureFidelity"] {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { level?: unknown }).level === "string" &&
      Array.isArray((parsed as { reasons?: unknown }).reasons)
    ) {
      return parsed as SourceRef["captureFidelity"];
    }
  } catch {
    // Malformed JSON → treat as not assessed.
  }
  return undefined;
}

function reconstructEvent(row: SqlitePersistenceSnapshot["events"][number]): TimelineEvent {
  const artifactIds = parseStringArray(row.artifact_ids_json);
  return {
    id: row.id,
    sessionId: row.session_id,
    projectId: row.project_id,
    start: row.start_at,
    end: row.end_at ?? undefined,
    type: row.type as EventType,
    title: row.title,
    summary: row.summary,
    sourceRefs: parseStringArray(row.source_refs_json),
    linkedIssueIds: parseStringArray(row.linked_issue_ids_json),
    linkedDecisionIds: parseStringArray(row.linked_decision_ids_json),
    relationshipIds: parseStringArray(row.relationship_ids_json),
    artifactIds: artifactIds.length ? artifactIds : undefined,
    trustLevel: row.trust_level as TrustLevel,
    confidence: row.confidence,
    createdBy: row.created_by as TimelineEvent["createdBy"],
    userModified: row.user_modified === 1,
    connectorEventId: row.connector_event_id ?? undefined,
  };
}

function reconstructIssue(row: SqlitePersistenceSnapshot["issues"][number]): Issue {
  return {
    id: row.id,
    projectId: row.project_id,
    sessionId: row.session_id,
    title: row.title,
    description: row.description,
    status: row.status as IssueStatus,
    priority: row.priority as Priority,
    sourceEventIds: parseStringArray(row.source_event_ids_json),
    relatedDecisionIds: parseStringArray(row.related_decision_ids_json),
    relatedFileIds: parseStringArray(row.related_file_ids_json),
    suggestedNextAction: row.suggested_next_action,
    assignee: row.assignee ?? undefined,
    dueDate: row.due_date ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    confidence: row.confidence,
    trustLevel: row.trust_level as TrustLevel,
  };
}

function reconstructDecision(row: SqlitePersistenceSnapshot["decisions"][number]): Decision {
  return {
    id: row.id,
    projectId: row.project_id,
    sessionId: row.session_id,
    title: row.title,
    decision: row.decision,
    rationale: row.rationale,
    rejectedOptions: parseStringArray(row.rejected_options_json),
    impact: parseStringArray(row.impact_json),
    sourceEventIds: parseStringArray(row.source_event_ids_json),
    relatedIssueIds: parseStringArray(row.related_issue_ids_json),
    relatedSourceIds: parseStringArray(row.related_source_ids_json),
    createdAt: row.created_at,
    importance: row.importance as Priority,
    trustLevel: row.trust_level as TrustLevel,
    confirmed: row.confirmed === 1,
  };
}

function reconstructRelationship(row: SqlitePersistenceSnapshot["relationships"][number]): Relationship {
  return {
    id: row.id,
    fromId: row.from_id,
    fromType: row.from_type as Relationship["fromType"],
    toId: row.to_id,
    toType: row.to_type as Relationship["toType"],
    type: row.type as Relationship["type"],
    confidence: row.confidence,
    reason: row.reason,
  };
}

function reconstructArtifact(row: SqlitePersistenceSnapshot["artifacts"][number]): Artifact {
  return {
    id: row.id,
    projectId: row.project_id,
    sessionId: row.session_id,
    title: row.title,
    kind: row.kind as Artifact["kind"],
    path: row.path ?? undefined,
    sourceEventIds: parseStringArray(row.source_event_ids_json),
    createdAt: row.created_at,
  };
}

function reconstructNextAction(row: SqlitePersistenceSnapshot["nextActions"][number]): NextAction {
  return {
    id: row.id,
    sessionId: row.session_id,
    title: row.title,
    priority: row.priority as Priority,
    relatedIssueIds: parseStringArray(row.related_issue_ids_json),
    relatedEventIds: parseStringArray(row.related_event_ids_json),
  };
}

function reconstructSummary(row: SqlitePersistenceSnapshot["summaries"][number]): Summary {
  return {
    id: row.id,
    sessionId: row.session_id,
    sessionSummary: row.session_summary,
    resumePrompt: row.resume_prompt,
    reportMarkdown: row.report_markdown,
    nextActionIds: parseStringArray(row.next_action_ids_json),
    generatedAt: row.generated_at,
  };
}

function emptySummary(sessionId: string): Summary {
  return {
    id: `summary-${sessionId}-empty`,
    sessionId,
    sessionSummary: "",
    resumePrompt: "",
    reportMarkdown: "",
    nextActionIds: [],
    generatedAt: new Date().toISOString(),
  };
}

function parseStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}
