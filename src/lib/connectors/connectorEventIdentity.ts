/**
 * Connector event identity.
 *
 * Every connector event Mori imports gets a stable identity string built
 * from `(connectorId, externalSessionId|unscoped, event.id)`. We store
 * that identity on the resulting `TimelineEvent.connectorEventId` so the
 * Evidence Hub can detect "I've already imported this event" on subsequent
 * imports (paste, inbox refresh, or successor file from the same Claude /
 * Codex session).
 *
 * Identity rules:
 *   - `connectorId` namespaces the id so two tools that happen to emit the
 *     same event id (unlikely, but possible) cannot collide.
 *   - `externalSessionId` separates sessions that share an event id space
 *     (e.g. Claude Code restarts the counter per `sessionId`). Missing
 *     external session ids fall back to `unscoped`.
 *   - `event.id` is the connector tool's stable id. We use it verbatim.
 *
 * The fallback path (`occurredAt`) only kicks in when the connector event
 * has no `id` at all — invalid by schema, but we still want a non-throwing
 * helper so the preview can label the row as "missing id" instead of
 * crashing.
 *
 * Old TimelineEvents imported before this milestone don't carry
 * `connectorEventId`. `collectImportedConnectorEventIds` therefore skips
 * any event without the field, and `markConnectorEventsAsDuplicate`
 * treats those rows as "unknown" rather than "duplicate" — exactly the
 * behavior the brief asks for.
 */
import type { SourceRef, TimelineEvent } from "../../domain/types";
import type {
  ConnectorEvent,
  ConnectorEventKind,
  ConnectorId,
} from "./types";

export type ConnectorEventIdentity = string;

/** Stable identity for a single parsed connector event. */
export function getConnectorEventIdentity(event: {
  id?: string | null;
  connectorId: ConnectorId;
  sessionId?: string | null;
  occurredAt?: string | null;
}): ConnectorEventIdentity {
  const session = event.sessionId && event.sessionId.length > 0 ? event.sessionId : "unscoped";
  const id = event.id && event.id.length > 0
    ? event.id
    // Fallback path — missing id. We use the occurredAt timestamp so two
    // events that share the same `(connectorId, session, occurredAt)` triple
    // still collide. Tests assert this behavior so future contributors don't
    // accidentally inline an array-index fallback (which would re-introduce
    // the "double-import shows duplicates" bug).
    : `noid-${event.occurredAt ?? "unknown"}`;
  return `${event.connectorId}::${session}::${id}`;
}

/**
 * Identity for an already-applied TimelineEvent. Returns `null` for
 * events imported before the connector-id field landed.
 */
export function getConnectorEventIdentityFromTimelineEvent(
  event: TimelineEvent,
): ConnectorEventIdentity | null {
  return event.connectorEventId ?? null;
}

/**
 * SourceRefs do not currently carry per-event ids — they only carry the
 * source-level id plus a `relatedEventIds[]` list. We expose this helper
 * so future surfaces can plug a SourceRef directly into the identity
 * pipeline once / if SourceRefs gain an external-id field. Until then, it
 * always returns `null`, which is documented in the type signature.
 */
export function getConnectorEventIdentityFromSourceRef(
  _source: SourceRef,
): ConnectorEventIdentity | null {
  return null;
}

/**
 * Collect every `connectorEventId` already on the active session view.
 * Events without the field are skipped — old imports are not considered
 * duplicates.
 */
export function collectImportedConnectorEventIds(session: {
  events: TimelineEvent[];
}): Set<ConnectorEventIdentity> {
  const set = new Set<ConnectorEventIdentity>();
  for (const event of session.events) {
    const id = getConnectorEventIdentityFromTimelineEvent(event);
    if (id) set.add(id);
  }
  return set;
}

/**
 * Collect identities from an in-memory connector batch. Used to detect
 * duplicates within the SAME paste / load (e.g. a JSONL file that lists
 * the same event twice).
 */
export function collectConnectorEventIdsFromCandidates(
  events: ConnectorEvent[],
): Set<ConnectorEventIdentity> {
  const set = new Set<ConnectorEventIdentity>();
  for (const event of events) {
    set.add(getConnectorEventIdentity(event));
  }
  return set;
}

export type MarkedConnectorEvent = {
  event: ConnectorEvent;
  identity: ConnectorEventIdentity;
  /** True when the identity is in the imported set (or appears twice in this batch). */
  isDuplicate: boolean;
};

/**
 * Mark each event in a batch as new / duplicate, given a set of already
 * imported ids. The walk is order-stable so the first occurrence in the
 * batch is treated as new and the rest as duplicates — matching what the
 * user expects when they paste a file that lists the same event twice.
 */
export function markConnectorEventsAsDuplicate(
  events: ConnectorEvent[],
  importedIds: ReadonlySet<ConnectorEventIdentity>,
): MarkedConnectorEvent[] {
  const seenWithinBatch = new Set<ConnectorEventIdentity>();
  const out: MarkedConnectorEvent[] = [];
  for (const event of events) {
    const identity = getConnectorEventIdentity(event);
    const isDuplicate = importedIds.has(identity) || seenWithinBatch.has(identity);
    if (!isDuplicate) seenWithinBatch.add(identity);
    out.push({ event, identity, isDuplicate });
  }
  return out;
}

/**
 * Partition the batch into `newEvents` and `duplicateEvents`. Mirrors the
 * shape callers (preview helper, ImportPanel) need without re-walking the
 * marked list.
 */
export function partitionConnectorEventsByIdentity(
  events: ConnectorEvent[],
  importedIds: ReadonlySet<ConnectorEventIdentity>,
): {
  newEvents: ConnectorEvent[];
  duplicateEvents: ConnectorEvent[];
  duplicateIdentities: ConnectorEventIdentity[];
} {
  const marked = markConnectorEventsAsDuplicate(events, importedIds);
  const newEvents: ConnectorEvent[] = [];
  const duplicateEvents: ConnectorEvent[] = [];
  const duplicateIdentities = new Set<ConnectorEventIdentity>();
  for (const row of marked) {
    if (row.isDuplicate) {
      duplicateEvents.push(row.event);
      duplicateIdentities.add(row.identity);
    } else {
      newEvents.push(row.event);
    }
  }
  return {
    newEvents,
    duplicateEvents,
    duplicateIdentities: [...duplicateIdentities],
  };
}

/**
 * Map a duplicate identity back to its `(connectorId, externalSessionId,
 * eventId)` triple for UI grouping. Returns `null` if the identity wasn't
 * produced by `getConnectorEventIdentity`.
 */
export function parseConnectorEventIdentity(identity: ConnectorEventIdentity): {
  connectorId: ConnectorId;
  externalSessionId: string | null;
  eventId: string;
} | null {
  const parts = identity.split("::");
  if (parts.length !== 3) return null;
  const [connectorId, session, eventId] = parts as [string, string, string];
  return {
    connectorId: connectorId as ConnectorId,
    externalSessionId: session === "unscoped" ? null : session,
    eventId,
  };
}

/** Re-exported for callers that just want the event-kind enum nearby. */
export type { ConnectorEvent, ConnectorEventKind, ConnectorId };
