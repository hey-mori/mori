import { parseConnectorEventIdentity } from "../connectors";

/**
 * Pick which connector event identities in a freshly-read batch belong to
 * the followed session and are new.
 *
 * A session's "source key" is the set of `(connectorId, externalSessionId)`
 * pairs derived from the identities it has already imported. A candidate
 * identity is a new follow event when it shares one of those source keys
 * (so it is the same agent conversation, i.e. the same connector file's
 * session) but is not already known. This is how the foreground driver
 * decides what a poll discovered without importing another session's events.
 *
 * Pure: the driver reads the inbox file and parses it to connector
 * identities with the existing pipeline, then calls this. A session with no
 * known connector identities (not connector-sourced) yields nothing, so
 * only genuinely followable sessions react.
 */
export function selectNewFollowEventIds(
  knownConnectorEventIds: readonly string[],
  candidateConnectorEventIds: readonly string[],
): string[] {
  const sourceKeys = new Set<string>();
  for (const id of knownConnectorEventIds) {
    const key = toSourceKey(id);
    if (key) sourceKeys.add(key);
  }
  if (sourceKeys.size === 0) return [];

  const known = new Set(knownConnectorEventIds);
  const seen = new Set<string>();
  const fresh: string[] = [];
  for (const id of candidateConnectorEventIds) {
    if (known.has(id) || seen.has(id)) continue;
    const key = toSourceKey(id);
    if (key && sourceKeys.has(key)) {
      seen.add(id);
      fresh.push(id);
    }
  }
  return fresh;
}

function toSourceKey(id: string): string | null {
  const parsed = parseConnectorEventIdentity(id);
  if (!parsed) return null;
  return `${parsed.connectorId}::${parsed.externalSessionId ?? "unscoped"}`;
}
