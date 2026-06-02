import {
  buildProjectConnectionCandidates,
  projectMatchesWithAliases,
  type ConnectedProject,
  type ProjectConnectionCandidate,
} from "./projectConnection";

/**
 * Link discovered external AI sessions to a Mori project.
 *
 * The Live Project Intelligence thesis is "connect a project, and the AI
 * sessions that happen there surface against it." The discovery side (the
 * connectors / `AgentWorkSessionMeta` reads) is desktop and Tauri-bound; this
 * helper is the pure partition that decides, for one project, which discovered
 * sessions already belong to it and which only look like they might.
 *
 * It is deliberately decoupled from the Tauri discovery types: the desktop
 * layer maps `AgentWorkSessionMeta` (or any source) onto the minimal
 * `ExternalAgentSessionLink` shape, and this stays a pure, testable derivation
 * over the same canonical-identity / confirmed-alias rules in
 * `projectConnection`. It proposes only, it never imports — pulling an external
 * session into Mori still rides the normal Import Review gate.
 */

/** The minimal shape a discovered external session maps onto for linking. */
export type ExternalAgentSessionLink = {
  id: string;
  /** The session's own project label (`projectPath`). */
  projectPath: string | undefined | null;
  agentName?: string;
  title?: string;
  /** ISO timestamp of the session's last activity, for ordering. */
  updatedAt?: string;
};

export type ProjectExternalSessions = {
  /**
   * Discovered sessions that belong to this project now — an exact canonical
   * path match or a confirmed alias. Newest activity first.
   */
  connected: ExternalAgentSessionLink[];
  /**
   * Look-alike labels (basename near-matches) the user could confirm as an
   * alias. Each carries the count and source ids behind it.
   */
  candidates: ProjectConnectionCandidate[];
};

/** Map an external session onto a generic connection source. */
export function externalSessionToConnectionSource(session: ExternalAgentSessionLink): {
  id: string;
  label: string | undefined | null;
  title?: string;
} {
  return { id: session.id, label: session.projectPath, title: session.title };
}

/**
 * Partition discovered external sessions for one project into the ones that
 * already belong to it (exact / confirmed-alias match) and the look-alike
 * labels that could be connected. Pure and deterministic.
 */
export function buildProjectExternalSessions(args: {
  projectKey: string;
  sessions: ReadonlyArray<ExternalAgentSessionLink>;
  connections?: ReadonlyArray<ConnectedProject>;
}): ProjectExternalSessions {
  const connections = args.connections ?? [];

  const connected = args.sessions
    .filter((session) =>
      projectMatchesWithAliases(args.projectKey, session.projectPath, connections),
    )
    .slice()
    .sort((a, b) => activityTime(b.updatedAt) - activityTime(a.updatedAt));

  const candidates = buildProjectConnectionCandidates({
    projectKey: args.projectKey,
    sources: args.sessions.map(externalSessionToConnectionSource),
    connections,
  });

  return { connected, candidates };
}

function activityTime(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}
