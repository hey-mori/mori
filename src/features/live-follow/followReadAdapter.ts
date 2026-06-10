/**
 * Live Follow read adapter — re-read the connector inbox and return the
 * followed session's current candidate event ids.
 *
 * This is the IO the foreground shell injects into `runFollowPoll`. It re-reads
 * the same connector JSONL files the inbox already exposes (never writes, never
 * modifies — `read_connector_jsonl_file` is read-only), parses them through the
 * existing import path, and yields connector event identities. The driver's
 * `selectNewFollowEventIds` then scopes those to the followed session by source
 * key and keeps only the genuinely new ones. Desktop-only: the browser has no
 * inbox, so it returns nothing and Live Follow simply stays idle.
 */
import {
  isConnectorInboxAvailable,
  listConnectorJsonlInbox,
  readConnectorJsonlFile,
} from "../../lib/desktop/connectorInbox";
import { parseConnectorJsonl } from "../../lib/connectors/validation";
import { normalizeConnectorEventBatch } from "../../lib/connectors/normalizeConnectorEvents";

export type FollowCandidate = { id: string };

export async function readFollowCandidates(input: {
  projectId: string;
  sessionId: string;
}): Promise<FollowCandidate[]> {
  if (!isConnectorInboxAvailable()) return [];

  let listing;
  try {
    listing = await listConnectorJsonlInbox();
  } catch {
    return [];
  }
  if (!listing.rootExists || listing.files.length === 0) return [];

  const candidates: FollowCandidate[] = [];
  for (const file of listing.files) {
    let text: string;
    try {
      text = (await readConnectorJsonlFile(file.path)).text;
    } catch {
      continue;
    }
    const parsed = parseConnectorJsonl(text);
    if (parsed.events.length === 0) continue;
    const batch = normalizeConnectorEventBatch({
      projectId: input.projectId,
      sessionId: input.sessionId,
      events: parsed.events,
      applyRedaction: false,
    });
    for (const candidate of batch) {
      for (const event of candidate.events) {
        if (event.connectorEventId) candidates.push({ id: event.connectorEventId });
      }
    }
  }
  return candidates;
}
