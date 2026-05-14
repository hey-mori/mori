import { describe, expect, it } from "vitest";
import type { TimelineEvent } from "../../domain/types";
import {
  applyDuplicateOverlay,
  buildConnectorJsonlPreview,
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
