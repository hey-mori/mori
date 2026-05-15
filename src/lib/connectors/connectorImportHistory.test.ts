import { describe, expect, it } from "vitest";
import type { TimelineEvent } from "../../domain/types";
import type { ConnectorEvent } from "./types";
import { getConnectorEventIdentity } from "./connectorEventIdentity";
import {
  buildConnectorImportHistory,
  classifyConnectorImportBatch,
  collectConnectorEventIdsFromSession,
  collectConnectorEventIdsFromSessions,
  pickDuplicateEventsFromClassification,
  pickNewEventsFromClassification,
  summarizeConnectorImportOverlap,
} from "./connectorImportHistory";

function buildTimelineEvent(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: "evt-1",
    sessionId: "sess-1",
    projectId: "proj-1",
    start: "2026-05-14T10:00:00Z",
    type: "aiConversation",
    title: "Test",
    summary: "",
    sourceRefs: ["src-1"],
    linkedIssueIds: [],
    linkedDecisionIds: [],
    relationshipIds: [],
    trustLevel: "verified",
    confidence: 1,
    createdBy: "import",
    userModified: false,
    ...overrides,
  };
}

function buildConnectorEvent(overrides: Partial<ConnectorEvent> = {}): ConnectorEvent {
  return {
    id: "claude-001",
    connectorId: "claudeCodeHook",
    kind: "prompt_submitted",
    occurredAt: "2026-05-14T10:00:00Z",
    sessionId: "claude-2026-05-14",
    summary: "Test prompt",
    privacy: { captureMethod: "local_hook", rawDataPolicy: "summary_only" },
    provenance: { toolName: "mori-claude-hook.sh" },
    ...overrides,
  };
}

const IDENTITY_001 = getConnectorEventIdentity(buildConnectorEvent({ id: "claude-001" }));
const IDENTITY_002 = getConnectorEventIdentity(buildConnectorEvent({ id: "claude-002" }));
const IDENTITY_003 = getConnectorEventIdentity(buildConnectorEvent({ id: "claude-003" }));

describe("collectConnectorEventIdsFromSession", () => {
  it("collects ids from events that carry connectorEventId", () => {
    const ids = collectConnectorEventIdsFromSession({
      events: [
        buildTimelineEvent({ id: "a", connectorEventId: IDENTITY_001 }),
        buildTimelineEvent({ id: "b" }),
        buildTimelineEvent({ id: "c", connectorEventId: IDENTITY_002 }),
      ],
    });
    expect(ids.size).toBe(2);
    expect(ids.has(IDENTITY_001)).toBe(true);
    expect(ids.has(IDENTITY_002)).toBe(true);
  });

  it("returns an empty set when no events carry an identity", () => {
    const ids = collectConnectorEventIdsFromSession({
      events: [buildTimelineEvent(), buildTimelineEvent({ id: "x" })],
    });
    expect(ids.size).toBe(0);
  });
});

describe("collectConnectorEventIdsFromSessions", () => {
  it("aggregates identities from every saved session and tracks the owner", () => {
    const sessions = [
      {
        sessionId: "saved-a",
        title: "Saved A",
        events: [{ connectorEventId: IDENTITY_001 } as Pick<TimelineEvent, "connectorEventId">],
      },
      {
        sessionId: "saved-b",
        events: [{ connectorEventId: IDENTITY_002 } as Pick<TimelineEvent, "connectorEventId">],
      },
    ];
    const result = collectConnectorEventIdsFromSessions(sessions);
    expect(result.ids.size).toBe(2);
    expect(result.bySession.get(IDENTITY_001)?.sessionId).toBe("saved-a");
    expect(result.bySession.get(IDENTITY_002)?.sessionId).toBe("saved-b");
    expect(result.contributingCount).toBe(2);
    expect(result.legacyCount).toBe(0);
  });

  it("flags legacy sessions whose events lack any connectorEventId", () => {
    const sessions = [
      {
        sessionId: "legacy",
        events: [{} as Pick<TimelineEvent, "connectorEventId">],
      },
    ];
    const result = collectConnectorEventIdsFromSessions(sessions);
    expect(result.ids.size).toBe(0);
    expect(result.legacyCount).toBe(1);
  });
});

describe("classifyConnectorImportBatch", () => {
  it("partitions events into new / current-session / saved-session / in-batch", () => {
    const history = buildConnectorImportHistory({
      activeSession: {
        events: [buildTimelineEvent({ id: "a", connectorEventId: IDENTITY_001 })],
      },
      savedSessions: [
        {
          sessionId: "saved-a",
          title: "Saved A",
          events: [{ connectorEventId: IDENTITY_002 }],
        },
      ],
    });
    const events = [
      buildConnectorEvent({ id: "claude-001" }), // current-session duplicate
      buildConnectorEvent({ id: "claude-002" }), // saved-session duplicate
      buildConnectorEvent({ id: "claude-003" }), // new
      buildConnectorEvent({ id: "claude-003" }), // in-batch duplicate
    ];
    const classified = classifyConnectorImportBatch(events, history);
    expect(classified[0]!.classification).toBe("duplicate-current-session");
    expect(classified[1]!.classification).toBe("duplicate-saved-session");
    expect(classified[1]!.matchedSavedSession?.sessionId).toBe("saved-a");
    expect(classified[2]!.classification).toBe("new");
    expect(classified[3]!.classification).toBe("duplicate-in-batch");
  });

  it("prefers current-session classification when an identity is also in a saved session", () => {
    const history = buildConnectorImportHistory({
      activeSession: {
        events: [buildTimelineEvent({ connectorEventId: IDENTITY_001 })],
      },
      savedSessions: [
        {
          sessionId: "saved-a",
          events: [{ connectorEventId: IDENTITY_001 }],
        },
      ],
    });
    const classified = classifyConnectorImportBatch(
      [buildConnectorEvent({ id: "claude-001" })],
      history,
    );
    expect(classified[0]!.classification).toBe("duplicate-current-session");
  });

  it("ignores events on old sessions that have no connectorEventId at all", () => {
    const history = buildConnectorImportHistory({
      activeSession: { events: [buildTimelineEvent()] },
      savedSessions: [
        {
          sessionId: "saved-legacy",
          events: [{ id: "evt" } as Pick<TimelineEvent, "connectorEventId">],
        },
      ],
    });
    const classified = classifyConnectorImportBatch(
      [buildConnectorEvent({ id: "claude-001" })],
      history,
    );
    expect(classified[0]!.classification).toBe("new");
  });
});

describe("summarizeConnectorImportOverlap", () => {
  it("returns counts split by detection source", () => {
    const history = buildConnectorImportHistory({
      activeSession: {
        events: [buildTimelineEvent({ connectorEventId: IDENTITY_001 })],
      },
      savedSessions: [
        {
          sessionId: "saved-a",
          title: "Saved A",
          events: [{ connectorEventId: IDENTITY_002 }],
        },
      ],
    });
    const events = [
      buildConnectorEvent({ id: "claude-001" }),
      buildConnectorEvent({ id: "claude-002" }),
      buildConnectorEvent({ id: "claude-003" }),
      buildConnectorEvent({ id: "claude-003" }),
    ];
    const summary = summarizeConnectorImportOverlap(events, history);
    expect(summary.total).toBe(4);
    expect(summary.newCount).toBe(1);
    expect(summary.currentSessionDuplicates).toBe(1);
    expect(summary.savedSessionDuplicates).toBe(1);
    expect(summary.inBatchDuplicates).toBe(1);
    expect(summary.duplicateTotal).toBe(3);
    expect(summary.hasSavedSessionMatch).toBe(true);
    expect(summary.matchedSavedSessions[0]?.sessionId).toBe("saved-a");
  });

  it("yields zero counts when nothing matches", () => {
    const history = buildConnectorImportHistory({ activeSession: null, savedSessions: [] });
    const summary = summarizeConnectorImportOverlap([buildConnectorEvent()], history);
    expect(summary.newCount).toBe(1);
    expect(summary.duplicateTotal).toBe(0);
    expect(summary.hasSavedSessionMatch).toBe(false);
  });
});

describe("buildConnectorImportHistory backward compatibility", () => {
  it("does not mark anything as duplicate when no session carries connectorEventId", () => {
    const history = buildConnectorImportHistory({
      activeSession: { events: [buildTimelineEvent()] },
      savedSessions: [
        {
          sessionId: "legacy",
          events: [{} as Pick<TimelineEvent, "connectorEventId">],
        },
      ],
    });
    const classified = classifyConnectorImportBatch(
      [buildConnectorEvent({ id: "claude-001" })],
      history,
    );
    expect(classified[0]!.classification).toBe("new");
    expect(history.legacySavedSessionCount).toBe(1);
    expect(history.contributingSavedSessionCount).toBe(0);
  });

  it("preserves a session round-trip via collectConnectorEventIdsFromSessions", () => {
    const sessions = [
      {
        sessionId: "saved-a",
        events: [
          { connectorEventId: IDENTITY_001 },
          { connectorEventId: IDENTITY_002 },
        ],
      },
    ];
    const result = collectConnectorEventIdsFromSessions(sessions);
    expect(result.ids.size).toBe(2);
    expect(result.contributingCount).toBe(1);
  });
});

describe("pickNewEventsFromClassification / pickDuplicateEventsFromClassification", () => {
  it("partitions classified events into new vs duplicate buckets", () => {
    const history = buildConnectorImportHistory({
      activeSession: { events: [buildTimelineEvent({ connectorEventId: IDENTITY_001 })] },
    });
    const classified = classifyConnectorImportBatch(
      [
        buildConnectorEvent({ id: "claude-001" }),
        buildConnectorEvent({ id: "claude-002" }),
      ],
      history,
    );
    const news = pickNewEventsFromClassification(classified);
    const dups = pickDuplicateEventsFromClassification(classified);
    expect(news.map((event) => event.id)).toEqual(["claude-002"]);
    expect(dups.map((event) => event.id)).toEqual(["claude-001"]);
    // Sanity: IDENTITY_003 is unused here — keeps the identity constants
    // referenced in tests honest (vitest --strict catches dead identifiers).
    expect(IDENTITY_003).toMatch(/claude-003/);
  });
});
