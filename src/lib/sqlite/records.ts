import type {
  Artifact,
  Decision,
  Issue,
  MoriMockSession,
  NextAction,
  Project,
  Relationship,
  Session,
  SourceRef,
  Summary,
  TimelineEvent,
} from "../../domain/types";

export type ProjectRow = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
};

export type SessionRow = {
  id: string;
  project_id: string;
  title: string;
  started_at: string;
  ended_at: string;
  recording_mode: string;
  llm_provider: string;
  llm_model: string;
  storage_location: string;
  selected_source_ids_json: string;
  status: string;
  /**
   * Optional grouping label (e.g. the Claude project path) for sessions
   * created from an external import. NULL for manual / pre-import sessions.
   * Persisted via migration V005.
   */
  source_label: string | null;
  created_at: string;
  updated_at: string;
};

export type SourceRow = {
  id: string;
  session_id: string;
  kind: string;
  title: string;
  detail: string;
  uri: string | null;
  trust_level: string;
  redaction_status: string;
  raw_retention: string;
  captured_at: string;
  related_event_ids_json: string;
  /** JSON-encoded `CaptureFidelity`, or NULL when not assessed. Added by V006. */
  capture_fidelity_json: string | null;
};

export type EventRow = {
  id: string;
  session_id: string;
  project_id: string;
  start_at: string;
  end_at: string | null;
  type: string;
  title: string;
  summary: string;
  source_refs_json: string;
  linked_issue_ids_json: string;
  linked_decision_ids_json: string;
  relationship_ids_json: string;
  artifact_ids_json: string;
  trust_level: string;
  confidence: number;
  created_by: string;
  user_modified: 0 | 1;
  /**
   * Stable connector identity (`<connectorId>::<sessionId|unscoped>::<eventId>`)
   * for events imported through the connector JSONL pipeline. NULL on every
   * other import kind. Persisted to SQLite via V002 so cross-session
   * duplicate detection survives reload.
   */
  connector_event_id: string | null;
};

export type IssueRow = {
  id: string;
  project_id: string;
  session_id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  source_event_ids_json: string;
  related_decision_ids_json: string;
  related_file_ids_json: string;
  suggested_next_action: string;
  assignee: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  confidence: number;
  trust_level: string;
};

export type DecisionRow = {
  id: string;
  project_id: string;
  session_id: string;
  title: string;
  decision: string;
  rationale: string;
  rejected_options_json: string;
  impact_json: string;
  source_event_ids_json: string;
  related_issue_ids_json: string;
  related_source_ids_json: string;
  created_at: string;
  importance: string;
  trust_level: string;
  confirmed: 0 | 1;
};

export type RelationshipRow = {
  id: string;
  from_id: string;
  from_type: string;
  to_id: string;
  to_type: string;
  type: string;
  confidence: number;
  reason: string;
};

export type ArtifactRow = {
  id: string;
  project_id: string;
  session_id: string;
  title: string;
  kind: string;
  path: string | null;
  source_event_ids_json: string;
  created_at: string;
};

export type NextActionRow = {
  id: string;
  session_id: string;
  title: string;
  priority: string;
  related_issue_ids_json: string;
  related_event_ids_json: string;
};

export type SummaryRow = {
  id: string;
  session_id: string;
  session_summary: string;
  resume_prompt: string;
  report_markdown: string;
  next_action_ids_json: string;
  generated_at: string;
};

export type SqlitePersistenceSnapshot = {
  projects: ProjectRow[];
  sessions: SessionRow[];
  sources: SourceRow[];
  events: EventRow[];
  issues: IssueRow[];
  decisions: DecisionRow[];
  relationships: RelationshipRow[];
  artifacts: ArtifactRow[];
  nextActions: NextActionRow[];
  summaries: SummaryRow[];
};

export function createSqlitePersistenceSnapshot(data: MoriMockSession): SqlitePersistenceSnapshot {
  return {
    projects: [projectToRow(data.project)],
    sessions: [sessionToRow(data.session)],
    sources: data.sources.map(sourceToRow),
    events: data.events.map(eventToRow),
    issues: data.issues.map(issueToRow),
    decisions: data.decisions.map(decisionToRow),
    relationships: data.relationships.map(relationshipToRow),
    artifacts: data.artifacts.map(artifactToRow),
    nextActions: data.nextActions.map(nextActionToRow),
    summaries: [summaryToRow(data.summary)],
  };
}

function projectToRow(project: Project): ProjectRow {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
  };
}

function sessionToRow(session: Session): SessionRow {
  return {
    id: session.id,
    project_id: session.projectId,
    title: session.title,
    started_at: session.startedAt,
    ended_at: session.endedAt,
    recording_mode: session.recordingMode,
    llm_provider: session.llmProvider,
    llm_model: session.llmModel,
    storage_location: session.storageLocation,
    selected_source_ids_json: json(session.selectedSourceIds),
    status: session.status,
    source_label: session.sourceLabel ?? null,
    created_at: session.startedAt,
    updated_at: session.endedAt,
  };
}

function sourceToRow(source: SourceRef): SourceRow {
  return {
    id: source.id,
    session_id: source.sessionId,
    kind: source.kind,
    title: source.title,
    detail: source.detail,
    uri: source.uri ?? null,
    trust_level: source.trustLevel,
    redaction_status: source.redactionStatus,
    raw_retention: source.rawRetention,
    captured_at: source.capturedAt,
    related_event_ids_json: json(source.relatedEventIds),
    capture_fidelity_json: source.captureFidelity ? json(source.captureFidelity) : null,
  };
}

function eventToRow(event: TimelineEvent): EventRow {
  return {
    id: event.id,
    session_id: event.sessionId,
    project_id: event.projectId,
    start_at: event.start,
    end_at: event.end ?? null,
    type: event.type,
    title: event.title,
    summary: event.summary,
    source_refs_json: json(event.sourceRefs),
    linked_issue_ids_json: json(event.linkedIssueIds),
    linked_decision_ids_json: json(event.linkedDecisionIds),
    relationship_ids_json: json(event.relationshipIds),
    artifact_ids_json: json(event.artifactIds ?? []),
    trust_level: event.trustLevel,
    confidence: event.confidence,
    created_by: event.createdBy,
    user_modified: event.userModified ? 1 : 0,
    connector_event_id: event.connectorEventId ?? null,
  };
}

function issueToRow(issue: Issue): IssueRow {
  return {
    id: issue.id,
    project_id: issue.projectId,
    session_id: issue.sessionId,
    title: issue.title,
    description: issue.description,
    status: issue.status,
    priority: issue.priority,
    source_event_ids_json: json(issue.sourceEventIds),
    related_decision_ids_json: json(issue.relatedDecisionIds),
    related_file_ids_json: json(issue.relatedFileIds),
    suggested_next_action: issue.suggestedNextAction,
    assignee: issue.assignee ?? null,
    due_date: issue.dueDate ?? null,
    created_at: issue.createdAt,
    updated_at: issue.updatedAt,
    confidence: issue.confidence,
    trust_level: issue.trustLevel,
  };
}

function decisionToRow(decision: Decision): DecisionRow {
  return {
    id: decision.id,
    project_id: decision.projectId,
    session_id: decision.sessionId,
    title: decision.title,
    decision: decision.decision,
    rationale: decision.rationale,
    rejected_options_json: json(decision.rejectedOptions),
    impact_json: json(decision.impact),
    source_event_ids_json: json(decision.sourceEventIds),
    related_issue_ids_json: json(decision.relatedIssueIds),
    related_source_ids_json: json(decision.relatedSourceIds),
    created_at: decision.createdAt,
    importance: decision.importance,
    trust_level: decision.trustLevel,
    confirmed: decision.confirmed ? 1 : 0,
  };
}

function relationshipToRow(relationship: Relationship): RelationshipRow {
  return {
    id: relationship.id,
    from_id: relationship.fromId,
    from_type: relationship.fromType,
    to_id: relationship.toId,
    to_type: relationship.toType,
    type: relationship.type,
    confidence: relationship.confidence,
    reason: relationship.reason,
  };
}

function artifactToRow(artifact: Artifact): ArtifactRow {
  return {
    id: artifact.id,
    project_id: artifact.projectId,
    session_id: artifact.sessionId,
    title: artifact.title,
    kind: artifact.kind,
    path: artifact.path ?? null,
    source_event_ids_json: json(artifact.sourceEventIds),
    created_at: artifact.createdAt,
  };
}

function nextActionToRow(action: NextAction): NextActionRow {
  return {
    id: action.id,
    session_id: action.sessionId,
    title: action.title,
    priority: action.priority,
    related_issue_ids_json: json(action.relatedIssueIds),
    related_event_ids_json: json(action.relatedEventIds),
  };
}

function summaryToRow(summary: Summary): SummaryRow {
  return {
    id: summary.id,
    session_id: summary.sessionId,
    session_summary: summary.sessionSummary,
    resume_prompt: summary.resumePrompt,
    report_markdown: summary.reportMarkdown,
    next_action_ids_json: json(summary.nextActionIds),
    generated_at: summary.generatedAt,
  };
}

function json(value: unknown): string {
  return JSON.stringify(value);
}
