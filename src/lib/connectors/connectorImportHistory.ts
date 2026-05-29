/**
 * Connector import history.
 *
 * The active session can detect duplicates within itself by walking its
 * already-applied TimelineEvents. That works for the current paste / inbox
 * load, but it misses these cases:
 *
 *   1. The user imported the same JSONL file in an earlier session and now
 *      re-opens Mori with a fresh draft.
 *   2. The user has multiple saved sessions for the same project and the
 *      connector emits a successor file that overlaps with one of them.
 *   3. The user starts a brand-new session but re-imports the same Claude
 *      Code transcript that already lives on a saved session.
 *
 * This module is the durable connector-identity index. Callers pass an
 * "input" shape carrying the active session and zero-or-more saved sessions;
 * the module returns a typed history object that the JSONL preview overlays
 * to classify each incoming event as new / current-session duplicate /
 * saved-session duplicate / repeated-in-batch / identity-unavailable.
 *
 * The module is intentionally pure — no IO. The callers (sessionStore,
 * preview overlay) own where the saved sessions come from (localStorage in
 * browser mode, SQLite-loaded snapshots in desktop mode, or nothing at all
 * when no history surface is available).
 */
import type { TimelineEvent } from "../../domain/types";
import type { ConnectorEvent } from "./types";
import {
  getConnectorEventIdentity,
  getConnectorEventIdentityFromTimelineEvent,
  type ConnectorEventIdentity,
} from "./connectorEventIdentity";

/**
 * One saved session entry as seen by the history builder. The full
 * `MockSession` is intentionally NOT required — the history only needs
 * a session id (for the "where was this last imported" hint) and a list of
 * events. Adapters can provide either real `TimelineEvent`s or trimmed
 * shapes that only carry `connectorEventId`.
 */
export type ConnectorImportHistorySavedSession = {
  /** Stable session id for re-import attribution. */
  sessionId: string;
  /** Optional human label used by the UI ("Last imported in `<title>`"). */
  title?: string;
  /** Optional timestamp (ISO) used by the UI for the "last imported" hint. */
  savedAt?: string;
  /**
   * Events the session has already applied. Only `connectorEventId` is
   * actually required for duplicate detection; everything else is read by
   * UI surfaces that want to display source provenance.
   */
  events: Array<Pick<TimelineEvent, "connectorEventId"> & Partial<TimelineEvent>>;
};

/**
 * Input the history builder consumes. Both `activeSession` and
 * `savedSessions` are optional — when missing, the corresponding identity
 * set is simply empty.
 */
export type ConnectorImportHistoryInput = {
  activeSession?: { events: TimelineEvent[] } | null;
  savedSessions?: readonly ConnectorImportHistorySavedSession[];
};

/**
 * Compact identity index built from one active session plus zero-or-more
 * saved sessions. The maps are exposed so UI surfaces can answer "where
 * was this event last imported?" without re-walking the full session list.
 */
export type ConnectorImportHistory = {
  /** Identities present on the active session's events. */
  currentSessionIds: ReadonlySet<ConnectorEventIdentity>;
  /** Identities present on any saved session (excluding the active one). */
  savedSessionIds: ReadonlySet<ConnectorEventIdentity>;
  /**
   * `identity → first saved session that owns it`. Lets the UI say
   * "Already imported in <title>" without walking everything again.
   */
  savedSessionById: ReadonlyMap<ConnectorEventIdentity, ConnectorImportHistorySavedSession>;
  /**
   * Number of saved sessions that contributed at least one connector
   * identity. The UI uses this to render "Saved-session history · N
   * sessions" or to omit the chip when zero.
   */
  contributingSavedSessionCount: number;
  /**
   * Number of saved sessions that were inspected but contained no
   * `connectorEventId` field on any event (legacy / non-connector
   * sessions). Surfaced for the docs-promised honesty: we don't pretend
   * detection ran against them.
   */
  legacySavedSessionCount: number;
};

/** Classification of a single connector event against an import history. */
export type ConnectorImportEventClassification =
  | "new"
  | "duplicate-current-session"
  | "duplicate-saved-session"
  | "duplicate-in-batch"
  | "identity-unavailable";

/** Per-event classification row returned by `classifyConnectorImportBatch`. */
export type ConnectorImportClassifiedEvent = {
  event: ConnectorEvent;
  identity: ConnectorEventIdentity;
  classification: ConnectorImportEventClassification;
  /** Filled in when `classification === "duplicate-saved-session"`. */
  matchedSavedSession?: ConnectorImportHistorySavedSession;
};

/** Aggregated counts for the preview / Import Review meta strip. */
export type ConnectorImportOverlapSummary = {
  total: number;
  newCount: number;
  currentSessionDuplicates: number;
  savedSessionDuplicates: number;
  inBatchDuplicates: number;
  identityUnavailable: number;
  /** Convenience: every duplicate class summed. */
  duplicateTotal: number;
  /** Distinct saved sessions that contributed at least one duplicate. */
  matchedSavedSessions: ConnectorImportHistorySavedSession[];
  /** True when at least one event was a duplicate of a saved-session event. */
  hasSavedSessionMatch: boolean;
};

// ─── identity collection helpers ──────────────────────────────────────────

/**
 * Collect every `connectorEventId` already on a session view. Skips events
 * without the field — they cannot be matched and are reported separately
 * as "legacy" sessions by `buildConnectorImportHistory`.
 */
export function collectConnectorEventIdsFromSession(session: {
  events: ReadonlyArray<Pick<TimelineEvent, "connectorEventId">>;
}): Set<ConnectorEventIdentity> {
  const set = new Set<ConnectorEventIdentity>();
  for (const event of session.events) {
    const id = event.connectorEventId ?? null;
    if (id) set.add(id);
  }
  return set;
}

/**
 * Walk every saved session and return the union of their connector
 * identities along with the lookup map back to the owning session.
 */
export function collectConnectorEventIdsFromSessions(
  sessions: readonly ConnectorImportHistorySavedSession[],
): {
  ids: Set<ConnectorEventIdentity>;
  bySession: Map<ConnectorEventIdentity, ConnectorImportHistorySavedSession>;
  contributingCount: number;
  legacyCount: number;
} {
  const ids = new Set<ConnectorEventIdentity>();
  const bySession = new Map<ConnectorEventIdentity, ConnectorImportHistorySavedSession>();
  let contributingCount = 0;
  let legacyCount = 0;

  for (const session of sessions) {
    let contributed = false;
    for (const event of session.events) {
      const id = getConnectorEventIdentityFromTimelineEvent(event as TimelineEvent);
      if (!id) continue;
      ids.add(id);
      if (!bySession.has(id)) bySession.set(id, session);
      contributed = true;
    }
    if (contributed) contributingCount += 1;
    else legacyCount += 1;
  }

  return { ids, bySession, contributingCount, legacyCount };
}

/** Build the durable history index from active + saved sessions. */
export function buildConnectorImportHistory(
  input: ConnectorImportHistoryInput,
): ConnectorImportHistory {
  const activeIds = input.activeSession
    ? collectConnectorEventIdsFromSession(input.activeSession)
    : new Set<ConnectorEventIdentity>();

  const saved = collectConnectorEventIdsFromSessions(input.savedSessions ?? []);

  // Saved-session matches that also appear on the active session are
  // reported as "current-session" duplicates so the user is not pushed
  // toward a less-actionable bucket.
  const savedOnly = new Set<ConnectorEventIdentity>();
  for (const id of saved.ids) {
    if (!activeIds.has(id)) savedOnly.add(id);
  }

  return {
    currentSessionIds: activeIds,
    savedSessionIds: savedOnly,
    savedSessionById: saved.bySession,
    contributingSavedSessionCount: saved.contributingCount,
    legacySavedSessionCount: saved.legacyCount,
  };
}

// ─── classification ────────────────────────────────────────────────────────

/**
 * Classify each event in an incoming batch against the history. The walk
 * is order-stable so the first occurrence of a previously-unknown identity
 * in the same batch is "new" and subsequent repeats are "duplicate-in-batch".
 */
export function classifyConnectorImportBatch(
  events: readonly ConnectorEvent[],
  history: ConnectorImportHistory,
): ConnectorImportClassifiedEvent[] {
  const seenWithinBatch = new Set<ConnectorEventIdentity>();
  const out: ConnectorImportClassifiedEvent[] = [];

  for (const event of events) {
    const identity = getConnectorEventIdentity(event);

    // Identity-unavailable: only triggers when the event itself had no
    // usable id at parse time. `getConnectorEventIdentity` always returns
    // a string today (it has a `noid-<occurredAt>` fallback), so this
    // branch is reserved for when a future parser is allowed to return
    // an empty / sentinel identity.
    if (!identity) {
      out.push({ event, identity: "", classification: "identity-unavailable" });
      continue;
    }

    if (history.currentSessionIds.has(identity)) {
      out.push({ event, identity, classification: "duplicate-current-session" });
      continue;
    }

    if (history.savedSessionIds.has(identity)) {
      const matched = history.savedSessionById.get(identity);
      out.push({
        event,
        identity,
        classification: "duplicate-saved-session",
        matchedSavedSession: matched,
      });
      continue;
    }

    if (seenWithinBatch.has(identity)) {
      out.push({ event, identity, classification: "duplicate-in-batch" });
      continue;
    }

    seenWithinBatch.add(identity);
    out.push({ event, identity, classification: "new" });
  }

  return out;
}

/** Aggregate the per-event classifications into counts for the UI. */
export function summarizeConnectorImportOverlap(
  events: readonly ConnectorEvent[],
  history: ConnectorImportHistory,
): ConnectorImportOverlapSummary {
  const classified = classifyConnectorImportBatch(events, history);

  let newCount = 0;
  let currentSessionDuplicates = 0;
  let savedSessionDuplicates = 0;
  let inBatchDuplicates = 0;
  let identityUnavailable = 0;
  const matchedSavedSessions = new Map<string, ConnectorImportHistorySavedSession>();

  for (const row of classified) {
    switch (row.classification) {
      case "new":
        newCount += 1;
        break;
      case "duplicate-current-session":
        currentSessionDuplicates += 1;
        break;
      case "duplicate-saved-session":
        savedSessionDuplicates += 1;
        if (row.matchedSavedSession) {
          matchedSavedSessions.set(row.matchedSavedSession.sessionId, row.matchedSavedSession);
        }
        break;
      case "duplicate-in-batch":
        inBatchDuplicates += 1;
        break;
      case "identity-unavailable":
        identityUnavailable += 1;
        break;
    }
  }

  const duplicateTotal =
    currentSessionDuplicates + savedSessionDuplicates + inBatchDuplicates;

  return {
    total: classified.length,
    newCount,
    currentSessionDuplicates,
    savedSessionDuplicates,
    inBatchDuplicates,
    identityUnavailable,
    duplicateTotal,
    matchedSavedSessions: [...matchedSavedSessions.values()],
    hasSavedSessionMatch: savedSessionDuplicates > 0,
  };
}

/** Pick out only the events the user should actually import (the "new" class). */
export function pickNewEventsFromClassification(
  classified: readonly ConnectorImportClassifiedEvent[],
): ConnectorEvent[] {
  return classified.filter((row) => row.classification === "new").map((row) => row.event);
}

/**
 * Pick out every duplicate event regardless of class (current, saved, or
 * in-batch). Used by the "Include duplicates" override path.
 */
export function pickDuplicateEventsFromClassification(
  classified: readonly ConnectorImportClassifiedEvent[],
): ConnectorEvent[] {
  return classified
    .filter(
      (row) =>
        row.classification === "duplicate-current-session" ||
        row.classification === "duplicate-saved-session" ||
        row.classification === "duplicate-in-batch",
    )
    .map((row) => row.event);
}
