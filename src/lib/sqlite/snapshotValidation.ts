import type { SqlitePersistenceSnapshot } from "./records";

export type SqliteSnapshotValidationResult = {
  valid: boolean;
  issues: string[];
};

const jsonArrayColumns: Array<[keyof SqlitePersistenceSnapshot, string]> = [
  ["sessions", "selected_source_ids_json"],
  ["sources", "related_event_ids_json"],
  ["events", "source_refs_json"],
  ["events", "linked_issue_ids_json"],
  ["events", "linked_decision_ids_json"],
  ["events", "relationship_ids_json"],
  ["events", "artifact_ids_json"],
  ["issues", "source_event_ids_json"],
  ["issues", "related_decision_ids_json"],
  ["issues", "related_file_ids_json"],
  ["decisions", "rejected_options_json"],
  ["decisions", "impact_json"],
  ["decisions", "source_event_ids_json"],
  ["decisions", "related_issue_ids_json"],
  ["decisions", "related_source_ids_json"],
  ["artifacts", "source_event_ids_json"],
  ["nextActions", "related_issue_ids_json"],
  ["nextActions", "related_event_ids_json"],
  ["summaries", "next_action_ids_json"],
];

export function validateSqlitePersistenceSnapshot(snapshot: SqlitePersistenceSnapshot): SqliteSnapshotValidationResult {
  const issues: string[] = [];
  const projectIds = new Set(snapshot.projects.map((row) => row.id));
  const sessionIds = new Set(snapshot.sessions.map((row) => row.id));
  const eventIds = new Set(snapshot.events.map((row) => row.id));
  const issueIds = new Set(snapshot.issues.map((row) => row.id));
  const decisionIds = new Set(snapshot.decisions.map((row) => row.id));
  const sourceIds = new Set(snapshot.sources.map((row) => row.id));
  const artifactIds = new Set(snapshot.artifacts.map((row) => row.id));

  if (snapshot.projects.length === 0) issues.push("Snapshot must include at least one project row");
  if (snapshot.sessions.length === 0) issues.push("Snapshot must include at least one session row");

  snapshot.sessions.forEach((row) => {
    if (!projectIds.has(row.project_id)) {
      issues.push(`Session ${row.id} references missing project ${row.project_id}`);
    }
  });

  snapshot.sources.forEach((row) => {
    if (!sessionIds.has(row.session_id)) {
      issues.push(`Source ${row.id} references missing session ${row.session_id}`);
    }
    parseJsonArray(row.related_event_ids_json).forEach((eventId) => {
      if (!eventIds.has(eventId)) issues.push(`Source ${row.id} references missing event ${eventId}`);
    });
  });

  snapshot.events.forEach((row) => {
    if (!sessionIds.has(row.session_id)) {
      issues.push(`Event ${row.id} references missing session ${row.session_id}`);
    }
    if (!projectIds.has(row.project_id)) {
      issues.push(`Event ${row.id} references missing project ${row.project_id}`);
    }
    parseJsonArray(row.source_refs_json).forEach((sourceId) => {
      if (!sourceIds.has(sourceId)) issues.push(`Event ${row.id} references missing source ${sourceId}`);
    });
    parseJsonArray(row.linked_issue_ids_json).forEach((issueId) => {
      if (!issueIds.has(issueId)) issues.push(`Event ${row.id} references missing issue ${issueId}`);
    });
    parseJsonArray(row.linked_decision_ids_json).forEach((decisionId) => {
      if (!decisionIds.has(decisionId)) issues.push(`Event ${row.id} references missing decision ${decisionId}`);
    });
    parseJsonArray(row.artifact_ids_json).forEach((artifactId) => {
      if (!artifactIds.has(artifactId)) issues.push(`Event ${row.id} references missing artifact ${artifactId}`);
    });
  });

  snapshot.issues.forEach((row) => {
    if (!sessionIds.has(row.session_id)) issues.push(`Issue ${row.id} references missing session ${row.session_id}`);
    if (!projectIds.has(row.project_id)) issues.push(`Issue ${row.id} references missing project ${row.project_id}`);
    parseJsonArray(row.source_event_ids_json).forEach((eventId) => {
      if (!eventIds.has(eventId)) issues.push(`Issue ${row.id} references missing source event ${eventId}`);
    });
  });

  snapshot.decisions.forEach((row) => {
    if (!sessionIds.has(row.session_id)) issues.push(`Decision ${row.id} references missing session ${row.session_id}`);
    if (!projectIds.has(row.project_id)) issues.push(`Decision ${row.id} references missing project ${row.project_id}`);
    parseJsonArray(row.source_event_ids_json).forEach((eventId) => {
      if (!eventIds.has(eventId)) issues.push(`Decision ${row.id} references missing source event ${eventId}`);
    });
  });

  snapshot.artifacts.forEach((row) => {
    if (!sessionIds.has(row.session_id)) issues.push(`Artifact ${row.id} references missing session ${row.session_id}`);
    if (!projectIds.has(row.project_id)) issues.push(`Artifact ${row.id} references missing project ${row.project_id}`);
  });

  snapshot.nextActions.forEach((row) => {
    if (!sessionIds.has(row.session_id)) issues.push(`Next action ${row.id} references missing session ${row.session_id}`);
  });

  snapshot.summaries.forEach((row) => {
    if (!sessionIds.has(row.session_id)) issues.push(`Summary ${row.id} references missing session ${row.session_id}`);
  });

  jsonArrayColumns.forEach(([collectionName, columnName]) => {
    const rows = snapshot[collectionName] as Array<Record<string, unknown>>;
    rows.forEach((row) => {
      const value = row[columnName];
      if (typeof value !== "string" || !isJsonArray(value)) {
        issues.push(`${String(collectionName)} row has invalid JSON array column ${columnName}`);
      }
    });
  });

  return { valid: issues.length === 0, issues };
}

function isJsonArray(value: string): boolean {
  try {
    return Array.isArray(JSON.parse(value));
  } catch {
    return false;
  }
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}
