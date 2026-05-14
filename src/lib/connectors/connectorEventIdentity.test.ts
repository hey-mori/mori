import { describe, expect, it } from "vitest";
import type { TimelineEvent } from "../../domain/types";
import {
  collectConnectorEventIdsFromCandidates,
  collectImportedConnectorEventIds,
  getConnectorEventIdentity,
  getConnectorEventIdentityFromSourceRef,
  getConnectorEventIdentityFromTimelineEvent,
  markConnectorEventsAsDuplicate,
  parseConnectorEventIdentity,
  partitionConnectorEventsByIdentity,
} from "./connectorEventIdentity";
import type { ConnectorEvent } from "./types";

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

describe("getConnectorEventIdentity", () => {
  it("encodes connectorId + sessionId + event.id", () => {
    const identity = getConnectorEventIdentity(buildConnectorEvent());
    expect(identity).toBe("claudeCodeHook::claude-2026-05-14::claude-001");
  });

  it("uses 'unscoped' when sessionId is missing", () => {
    const identity = getConnectorEventIdentity(buildConnectorEvent({ sessionId: undefined }));
    expect(identity).toBe("claudeCodeHook::unscoped::claude-001");
  });

  it("falls back to occurredAt when event.id is missing", () => {
    const identity = getConnectorEventIdentity(
      buildConnectorEvent({ id: "", occurredAt: "2026-05-14T10:00:00Z" }),
    );
    expect(identity).toContain("noid-2026-05-14T10:00:00Z");
  });

  it("treats the same id under different connectors as distinct", () => {
    const a = getConnectorEventIdentity(buildConnectorEvent({ connectorId: "claudeCodeHook" }));
    const b = getConnectorEventIdentity(buildConnectorEvent({ connectorId: "codexCliWrapper" }));
    expect(a).not.toBe(b);
  });

  it("treats the same id under different sessions as distinct", () => {
    const a = getConnectorEventIdentity(buildConnectorEvent({ sessionId: "s1" }));
    const b = getConnectorEventIdentity(buildConnectorEvent({ sessionId: "s2" }));
    expect(a).not.toBe(b);
  });
});

describe("getConnectorEventIdentityFromTimelineEvent", () => {
  it("returns the field when present", () => {
    const event = buildTimelineEvent({ connectorEventId: "abc::xyz::1" });
    expect(getConnectorEventIdentityFromTimelineEvent(event)).toBe("abc::xyz::1");
  });

  it("returns null for old events without the field", () => {
    expect(getConnectorEventIdentityFromTimelineEvent(buildTimelineEvent())).toBeNull();
  });
});

describe("getConnectorEventIdentityFromSourceRef", () => {
  it("returns null today (SourceRefs do not yet carry a per-event id)", () => {
    expect(
      getConnectorEventIdentityFromSourceRef({
        id: "src-1",
        sessionId: "sess-1",
        kind: "claudeTranscript",
        title: "Source",
        detail: "",
        trustLevel: "verified",
        redactionStatus: "notNeeded",
        rawRetention: "summaryOnly",
        capturedAt: "2026-05-14T10:00:00Z",
        relatedEventIds: [],
      }),
    ).toBeNull();
  });
});

describe("collectImportedConnectorEventIds", () => {
  it("only collects events that carry a connector identity", () => {
    const ids = collectImportedConnectorEventIds({
      events: [
        buildTimelineEvent({ id: "1" }),
        buildTimelineEvent({ id: "2", connectorEventId: "claudeCodeHook::s::a" }),
        buildTimelineEvent({ id: "3", connectorEventId: "codexCliWrapper::s::b" }),
      ],
    });
    expect(ids.size).toBe(2);
    expect(ids.has("claudeCodeHook::s::a")).toBe(true);
    expect(ids.has("codexCliWrapper::s::b")).toBe(true);
  });

  it("returns an empty set when the session is empty", () => {
    expect(collectImportedConnectorEventIds({ events: [] }).size).toBe(0);
  });
});

describe("collectConnectorEventIdsFromCandidates", () => {
  it("returns the identity set for every event in a batch", () => {
    const set = collectConnectorEventIdsFromCandidates([
      buildConnectorEvent({ id: "a" }),
      buildConnectorEvent({ id: "b" }),
    ]);
    expect(set.size).toBe(2);
  });
});

describe("markConnectorEventsAsDuplicate", () => {
  it("flags events whose identity is in the imported set", () => {
    const imported = new Set(["claudeCodeHook::claude-2026-05-14::claude-001"]);
    const events = [
      buildConnectorEvent({ id: "claude-001" }),
      buildConnectorEvent({ id: "claude-002" }),
    ];
    const marked = markConnectorEventsAsDuplicate(events, imported);
    expect(marked[0]!.isDuplicate).toBe(true);
    expect(marked[1]!.isDuplicate).toBe(false);
  });

  it("flags repeated events within the same batch (first occurrence wins)", () => {
    const imported = new Set<string>();
    const events = [
      buildConnectorEvent({ id: "claude-001" }),
      buildConnectorEvent({ id: "claude-001" }),
    ];
    const marked = markConnectorEventsAsDuplicate(events, imported);
    expect(marked[0]!.isDuplicate).toBe(false);
    expect(marked[1]!.isDuplicate).toBe(true);
  });
});

describe("partitionConnectorEventsByIdentity", () => {
  it("returns newEvents and duplicateEvents partitions", () => {
    const imported = new Set(["claudeCodeHook::claude-2026-05-14::claude-001"]);
    const events = [
      buildConnectorEvent({ id: "claude-001" }),
      buildConnectorEvent({ id: "claude-002" }),
      buildConnectorEvent({ id: "claude-003" }),
    ];
    const result = partitionConnectorEventsByIdentity(events, imported);
    expect(result.newEvents).toHaveLength(2);
    expect(result.duplicateEvents).toHaveLength(1);
    expect(result.duplicateIdentities).toHaveLength(1);
    expect(result.duplicateIdentities[0]).toBe("claudeCodeHook::claude-2026-05-14::claude-001");
  });

  it("handles all-new and all-duplicate batches", () => {
    const allNew = partitionConnectorEventsByIdentity([buildConnectorEvent()], new Set());
    expect(allNew.duplicateEvents).toEqual([]);

    const allDup = partitionConnectorEventsByIdentity(
      [buildConnectorEvent()],
      new Set([getConnectorEventIdentity(buildConnectorEvent())]),
    );
    expect(allDup.newEvents).toEqual([]);
    expect(allDup.duplicateEvents).toHaveLength(1);
  });
});

describe("parseConnectorEventIdentity", () => {
  it("round-trips a generated identity", () => {
    const original = getConnectorEventIdentity(buildConnectorEvent());
    const parsed = parseConnectorEventIdentity(original);
    expect(parsed).toEqual({
      connectorId: "claudeCodeHook",
      externalSessionId: "claude-2026-05-14",
      eventId: "claude-001",
    });
  });

  it("returns null for malformed identity strings", () => {
    expect(parseConnectorEventIdentity("nope")).toBeNull();
    expect(parseConnectorEventIdentity("a::b")).toBeNull();
    expect(parseConnectorEventIdentity("a::b::c::d")).toBeNull();
  });

  it("decodes 'unscoped' back to null externalSessionId", () => {
    const identity = getConnectorEventIdentity(buildConnectorEvent({ sessionId: undefined }));
    const parsed = parseConnectorEventIdentity(identity);
    expect(parsed?.externalSessionId).toBeNull();
  });
});
