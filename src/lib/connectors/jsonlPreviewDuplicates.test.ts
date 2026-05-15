import { describe, expect, it } from "vitest";
import type { TimelineEvent } from "../../domain/types";
import {
  applyDuplicateOverlay,
  applyHistoryOverlay,
  buildConnectorJsonlPreview,
  buildConnectorJsonlPreviewWithHistory,
  buildConnectorJsonlPreviewWithSession,
} from "./jsonlPreview";
import { getConnectorEventIdentity } from "./connectorEventIdentity";

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

const VALID_EVENT_LINE = JSON.stringify({
  id: "claude-001",
  connectorId: "claudeCodeHook",
  kind: "prompt_submitted",
  occurredAt: "2026-05-14T10:01:00Z",
  sessionId: "claude-2026-05-14",
  summary: "Prompt one",
  privacy: { captureMethod: "local_hook", rawDataPolicy: "summary_only" },
  provenance: { toolName: "mori-claude-hook.sh" },
});

const SECOND_EVENT_LINE = JSON.stringify({
  id: "claude-002",
  connectorId: "claudeCodeHook",
  kind: "prompt_submitted",
  occurredAt: "2026-05-14T10:02:00Z",
  sessionId: "claude-2026-05-14",
  summary: "Prompt two",
  privacy: { captureMethod: "local_hook", rawDataPolicy: "summary_only" },
  provenance: { toolName: "mori-claude-hook.sh" },
});

describe("buildConnectorJsonlPreviewWithSession", () => {
  it("treats every event as new when the session is empty", () => {
    const preview = buildConnectorJsonlPreviewWithSession(VALID_EVENT_LINE, { events: [] });
    expect(preview.kind).toBe("valid");
    expect(preview.newEventCount).toBe(1);
    expect(preview.duplicateEventCount).toBe(0);
    expect(preview.canImport).toBe(true);
  });

  it("treats every event as new when the session has no connectorEventId fields", () => {
    const preview = buildConnectorJsonlPreviewWithSession(VALID_EVENT_LINE, {
      events: [buildTimelineEvent()],
    });
    expect(preview.duplicateEventCount).toBe(0);
    expect(preview.newEventCount).toBe(1);
  });

  it("marks a single repeat as duplicate when its identity is in the session", () => {
    const identity = getConnectorEventIdentity({
      id: "claude-001",
      connectorId: "claudeCodeHook",
      sessionId: "claude-2026-05-14",
      occurredAt: "2026-05-14T10:01:00Z",
    });
    const session = {
      events: [buildTimelineEvent({ connectorEventId: identity })],
    };
    const preview = buildConnectorJsonlPreviewWithSession(VALID_EVENT_LINE, session);
    expect(preview.duplicateEventCount).toBe(1);
    expect(preview.newEventCount).toBe(0);
    expect(preview.canImport).toBe(false);
    expect(preview.warnings.some((warning) => warning.code === "all_duplicate")).toBe(true);
    expect(preview.headline).toMatch(/이미 가져온/);
  });

  it("flags mixed batches with partial_duplicate", () => {
    const identity = getConnectorEventIdentity({
      id: "claude-001",
      connectorId: "claudeCodeHook",
      sessionId: "claude-2026-05-14",
      occurredAt: "2026-05-14T10:01:00Z",
    });
    const session = {
      events: [buildTimelineEvent({ connectorEventId: identity })],
    };
    const preview = buildConnectorJsonlPreviewWithSession(
      [VALID_EVENT_LINE, SECOND_EVENT_LINE].join("\n"),
      session,
    );
    expect(preview.duplicateEventCount).toBe(1);
    expect(preview.newEventCount).toBe(1);
    expect(preview.canImport).toBe(true);
    expect(preview.warnings.some((warning) => warning.code === "partial_duplicate")).toBe(true);
  });

  it("preserves invalid line counts under duplicate handling", () => {
    const identity = getConnectorEventIdentity({
      id: "claude-001",
      connectorId: "claudeCodeHook",
      sessionId: "claude-2026-05-14",
      occurredAt: "2026-05-14T10:01:00Z",
    });
    const session = {
      events: [buildTimelineEvent({ connectorEventId: identity })],
    };
    const preview = buildConnectorJsonlPreviewWithSession(
      [VALID_EVENT_LINE, "{ broken", SECOND_EVENT_LINE].join("\n"),
      session,
    );
    expect(preview.kind).toBe("mixed");
    expect(preview.invalidLineCount).toBe(1);
    expect(preview.duplicateEventCount).toBe(1);
    expect(preview.newEventCount).toBe(1);
  });

  it("returns the empty-preview shape when the input is blank", () => {
    const preview = buildConnectorJsonlPreviewWithSession("", { events: [] });
    expect(preview.kind).toBe("empty");
    expect(preview.canImport).toBe(false);
    expect(preview.duplicateEventCount).toBe(0);
  });
});

describe("applyDuplicateOverlay", () => {
  it("returns errors-only previews unchanged", () => {
    const errorsOnly = buildConnectorJsonlPreview("not valid json");
    const overlaid = applyDuplicateOverlay(errorsOnly, {
      events: [buildTimelineEvent({ connectorEventId: "x::y::z" })],
    });
    expect(overlaid).toBe(errorsOnly);
  });

  it("accepts a null session and behaves like the no-session preview", () => {
    const base = buildConnectorJsonlPreview(VALID_EVENT_LINE);
    const overlaid = applyDuplicateOverlay(base, null);
    expect(overlaid.newEventCount).toBe(base.events.length);
    expect(overlaid.duplicateEventCount).toBe(0);
  });
});

describe("buildConnectorJsonlPreviewWithHistory", () => {
  const identity001 = getConnectorEventIdentity({
    id: "claude-001",
    connectorId: "claudeCodeHook",
    sessionId: "claude-2026-05-14",
    occurredAt: "2026-05-14T10:01:00Z",
  });
  const identity002 = getConnectorEventIdentity({
    id: "claude-002",
    connectorId: "claudeCodeHook",
    sessionId: "claude-2026-05-14",
    occurredAt: "2026-05-14T10:02:00Z",
  });

  it("classifies events as new when no saved sessions are supplied", () => {
    const preview = buildConnectorJsonlPreviewWithHistory(VALID_EVENT_LINE, {
      activeSession: { events: [] },
      savedSessions: [],
    });
    expect(preview.newEventCount).toBe(1);
    expect(preview.savedSessionDuplicateCount).toBe(0);
    expect(preview.savedSessionHistoryAvailable).toBe(false);
    // Caller passed an explicit empty array → honesty warning emitted.
    expect(
      preview.warnings.some((warning) => warning.code === "saved_session_history_unavailable"),
    ).toBe(true);
  });

  it("detects duplicates against the active session", () => {
    const preview = buildConnectorJsonlPreviewWithHistory(VALID_EVENT_LINE, {
      activeSession: {
        events: [buildTimelineEvent({ connectorEventId: identity001 })],
      },
      savedSessions: [],
    });
    expect(preview.currentSessionDuplicateCount).toBe(1);
    expect(preview.savedSessionDuplicateCount).toBe(0);
    expect(preview.canImport).toBe(false);
    expect(
      preview.warnings.some((warning) => warning.code === "all_duplicate"),
    ).toBe(true);
  });

  it("detects duplicates against saved sessions and surfaces matched sessions", () => {
    const preview = buildConnectorJsonlPreviewWithHistory(VALID_EVENT_LINE, {
      activeSession: { events: [] },
      savedSessions: [
        {
          sessionId: "saved-1",
          title: "Yesterday's session",
          events: [{ connectorEventId: identity001 }],
        },
      ],
    });
    expect(preview.savedSessionDuplicateCount).toBe(1);
    expect(preview.currentSessionDuplicateCount).toBe(0);
    expect(preview.matchedSavedSessions[0]?.sessionId).toBe("saved-1");
    expect(preview.savedSessionHistoryAvailable).toBe(true);
    expect(
      preview.warnings.some((warning) => warning.code === "saved_session_duplicate"),
    ).toBe(true);
  });

  it("mixes new + current + saved + in-batch in one classification pass", () => {
    const text = [
      VALID_EVENT_LINE,
      SECOND_EVENT_LINE,
      VALID_EVENT_LINE, // repeated inside this batch
      JSON.stringify({
        id: "claude-003",
        connectorId: "claudeCodeHook",
        kind: "prompt_submitted",
        occurredAt: "2026-05-14T10:03:00Z",
        sessionId: "claude-2026-05-14",
        summary: "Prompt three",
        privacy: { captureMethod: "local_hook", rawDataPolicy: "summary_only" },
        provenance: { toolName: "mori-claude-hook.sh" },
      }),
    ].join("\n");

    const preview = buildConnectorJsonlPreviewWithHistory(text, {
      activeSession: {
        events: [buildTimelineEvent({ connectorEventId: identity001 })],
      },
      savedSessions: [
        {
          sessionId: "saved-1",
          events: [{ connectorEventId: identity002 }],
        },
      ],
    });

    expect(preview.validEventCount).toBe(4);
    expect(preview.currentSessionDuplicateCount).toBe(2); // identity001 once, plus its in-batch repeat? No - the first is current, the second one of identity001 is also current
    expect(preview.savedSessionDuplicateCount).toBe(1);
    expect(preview.inBatchDuplicateCount).toBe(0);
    expect(preview.newEventCount).toBe(1);
    expect(preview.newEvents.map((event) => event.id)).toEqual(["claude-003"]);
  });

  it("preserves invalid line counts in the cross-session preview", () => {
    const preview = buildConnectorJsonlPreviewWithHistory(
      [VALID_EVENT_LINE, "{ broken", SECOND_EVENT_LINE].join("\n"),
      {
        activeSession: { events: [] },
        savedSessions: [
          {
            sessionId: "saved-1",
            events: [{ connectorEventId: identity001 }],
          },
        ],
      },
    );
    expect(preview.kind).toBe("mixed");
    expect(preview.invalidLineCount).toBe(1);
    expect(preview.savedSessionDuplicateCount).toBe(1);
    expect(preview.newEventCount).toBe(1);
  });

  it("returns empty preview for blank input even with history available", () => {
    const preview = buildConnectorJsonlPreviewWithHistory("", {
      activeSession: { events: [] },
      savedSessions: [
        {
          sessionId: "saved-1",
          events: [{ connectorEventId: identity001 }],
        },
      ],
    });
    expect(preview.kind).toBe("empty");
    expect(preview.savedSessionHistoryAvailable).toBe(false);
  });
});

describe("applyHistoryOverlay", () => {
  it("returns errors-only previews unchanged", () => {
    const errorsOnly = buildConnectorJsonlPreview("not valid json");
    const overlaid = applyHistoryOverlay(errorsOnly, {
      activeSession: { events: [] },
      savedSessions: [],
    });
    expect(overlaid).toBe(errorsOnly);
  });
});
