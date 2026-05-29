import type { SourceKind } from "../../domain/types";
import type { AgentWorkSessionMeta } from "../agents/workSessions";
import type { ConnectorEvent, ConnectorId } from "../connectors/types";
import type { AssociationCandidate, AssociationSpine } from "./evidenceAssociation";

/**
 * Evidence auto-association adapters (P2).
 *
 * Pure mappers that turn real captured data into the decoupled shapes the P1
 * scorer (`buildEvidenceAssociationProposals`) consumes:
 *   - a discovered agent work session becomes an `AssociationSpine`,
 *   - already-captured connector events become `AssociationCandidate`s.
 *
 * These never capture, fetch, or write. They only reshape data the user has
 * already brought in. See docs/design/evidence-auto-association.md.
 */

/** Map a discovered agent work session (the conversation) into a scoring spine. */
export function agentWorkSessionToSpine(meta: AgentWorkSessionMeta): AssociationSpine {
  return {
    id: meta.id,
    projectPath: meta.projectPath || undefined,
    windowStart: meta.startedAt,
    windowEnd: meta.updatedAt,
    connectorId: meta.connectorId,
    externalSessionId: meta.sessionId || undefined,
  };
}

/** Coarse SourceKind for a connector, for display only; scoring ignores it. */
const CONNECTOR_KIND: Partial<Record<ConnectorId, SourceKind>> = {
  git: "gitDiff",
  gitCommand: "gitDiff",
  githubPrImport: "githubPrImport",
  terminal: "terminal",
  terminalShell: "terminalShell",
  desktopTranscriptImport: "desktopTranscriptImport",
};

function candidateKind(connectorId: ConnectorId): SourceKind {
  return CONNECTOR_KIND[connectorId] ?? "connectorJsonl";
}

/** Bucket key: events of one external session under one connector are one source. */
function bucketKey(event: ConnectorEvent): string {
  return `${event.connectorId}::${event.sessionId ?? "unscoped"}`;
}

function firstDefined<T>(values: (T | undefined)[]): T | undefined {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

/**
 * Group already-captured connector events into one evidence candidate per
 * (connector, external session). Each candidate carries the bucket's time span,
 * its project / repo path, and its connector identity, so the P1 scorer can
 * match it against a spine. The caller is responsible for excluding the spine's
 * own conversation session from the candidate set.
 */
export function connectorEventsToCandidates(
  events: ConnectorEvent[],
): AssociationCandidate[] {
  const buckets = new Map<string, ConnectorEvent[]>();
  for (const event of events) {
    const key = bucketKey(event);
    const list = buckets.get(key) ?? [];
    list.push(event);
    buckets.set(key, list);
  }

  const candidates: AssociationCandidate[] = [];
  for (const [key, bucket] of buckets) {
    const times = bucket
      .map((event) => Date.parse(event.occurredAt))
      .filter((ms) => Number.isFinite(ms));
    const lead = bucket[0]!;
    const projectPath = firstDefined(
      bucket.flatMap((event) => [event.projectPath, event.git?.repoPath]),
    );
    const candidate: AssociationCandidate = {
      id: key,
      kind: candidateKind(lead.connectorId),
      title: firstDefined(bucket.map((event) => event.sourceTitle ?? event.summary)),
      projectPath,
      connectorId: lead.connectorId,
      externalSessionId: lead.sessionId ?? undefined,
    };
    if (times.length > 0) {
      candidate.spanStart = new Date(Math.min(...times)).toISOString();
      candidate.spanEnd = new Date(Math.max(...times)).toISOString();
    }
    candidates.push(candidate);
  }
  // Stable order by bucket key so callers and tests get a deterministic list.
  return candidates.sort((a, b) => a.id.localeCompare(b.id));
}
