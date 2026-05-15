import { describe, expect, it } from "vitest";
import {
  buildConnectorSourceImportSummary,
  describeConnectorSourceImportBadge,
  emptyConnectorSourceImportSummary,
  getConnectorSourceImportBadgeTone,
} from "./connectorImportSummary";
import type { ConnectorJsonlPreview } from "./jsonlPreview";

function buildPreview(overrides: Partial<ConnectorJsonlPreview> = {}): ConnectorJsonlPreview {
  return {
    kind: "valid",
    totalLines: 0,
    skippedBlankLines: 0,
    validEventCount: 0,
    invalidLineCount: 0,
    connectorIds: [],
    eventKinds: [],
    buckets: [],
    projectPaths: [],
    earliestOccurredAt: null,
    latestOccurredAt: null,
    redacted: false,
    containsLikelySecret: false,
    errors: [],
    warnings: [],
    canImport: false,
    headline: "",
    events: [],
    newEventCount: 0,
    duplicateEventCount: 0,
    newEvents: [],
    duplicateEvents: [],
    duplicateIdentities: [],
    currentSessionDuplicateCount: 0,
    savedSessionDuplicateCount: 0,
    inBatchDuplicateCount: 0,
    identityUnavailableCount: 0,
    savedSessionHistoryAvailable: false,
    matchedSavedSessions: [],
    ...overrides,
  };
}

describe("buildConnectorSourceImportSummary", () => {
  it("classifies a fresh import as 'new' when saved-session history is available", () => {
    const summary = buildConnectorSourceImportSummary(
      buildPreview({
        kind: "valid",
        validEventCount: 5,
        newEventCount: 5,
        duplicateEventCount: 0,
        canImport: true,
        savedSessionHistoryAvailable: true,
        connectorIds: ["claudeCodeHook"],
      }),
    );
    expect(summary.status).toBe("new");
    expect(summary.defaultAction).toBe("importNewEvents");
    expect(summary.canImportNewEvents).toBe(true);
    expect(summary.totalValidEvents).toBe(5);
    expect(summary.connectorIds).toEqual(["claudeCodeHook"]);
  });

  it("downgrades a fresh-looking import to 'historyUnavailable' when saved-session history is missing", () => {
    const summary = buildConnectorSourceImportSummary(
      buildPreview({
        kind: "valid",
        validEventCount: 3,
        newEventCount: 3,
        duplicateEventCount: 0,
        canImport: true,
        savedSessionHistoryAvailable: false,
      }),
    );
    expect(summary.status).toBe("historyUnavailable");
    expect(summary.defaultAction).toBe("historyUnavailableReview");
    expect(summary.detailMessage).toMatch(/저장 세션 기록을/);
  });

  it("classifies a mix of new + duplicates as 'partialReimport'", () => {
    const summary = buildConnectorSourceImportSummary(
      buildPreview({
        kind: "mixed",
        validEventCount: 6,
        newEventCount: 2,
        duplicateEventCount: 4,
        currentSessionDuplicateCount: 1,
        savedSessionDuplicateCount: 2,
        inBatchDuplicateCount: 1,
        canImport: true,
        savedSessionHistoryAvailable: true,
        matchedSavedSessions: [
          { sessionId: "saved-a", title: "Mori 앱 기획", events: [] },
        ],
      }),
    );
    expect(summary.status).toBe("partialReimport");
    expect(summary.defaultAction).toBe("importNewEvents");
    expect(summary.matchedSavedSessions[0]?.title).toBe("Mori 앱 기획");
    expect(summary.detailMessage).toMatch(/Mori 앱 기획/);
  });

  it("classifies an all-duplicate import as 'duplicateOnly'", () => {
    const summary = buildConnectorSourceImportSummary(
      buildPreview({
        kind: "valid",
        validEventCount: 12,
        newEventCount: 0,
        duplicateEventCount: 12,
        currentSessionDuplicateCount: 0,
        savedSessionDuplicateCount: 12,
        inBatchDuplicateCount: 0,
        canImport: false,
        savedSessionHistoryAvailable: true,
        matchedSavedSessions: [
          { sessionId: "saved-a", title: "Saved A", events: [] },
        ],
      }),
    );
    expect(summary.status).toBe("duplicateOnly");
    expect(summary.defaultAction).toBe("reviewDuplicatesOptional");
    expect(summary.canImportNewEvents).toBe(false);
  });

  it("classifies an errors-only preview as 'invalidOnly'", () => {
    const summary = buildConnectorSourceImportSummary(
      buildPreview({
        kind: "errors-only",
        validEventCount: 0,
        newEventCount: 0,
        duplicateEventCount: 0,
        invalidLineCount: 4,
      }),
    );
    expect(summary.status).toBe("invalidOnly");
    expect(summary.defaultAction).toBe("fixInvalidLines");
    expect(summary.detailMessage).toMatch(/4개 라인/);
  });

  it("classifies an empty preview as 'unknown'", () => {
    const summary = buildConnectorSourceImportSummary(
      buildPreview({ kind: "empty" }),
    );
    expect(summary.status).toBe("unknown");
    expect(summary.defaultAction).toBe("noNewEvents");
  });

  it("collapses matched saved sessions to lightweight references (no events array)", () => {
    const summary = buildConnectorSourceImportSummary(
      buildPreview({
        kind: "valid",
        validEventCount: 1,
        newEventCount: 0,
        duplicateEventCount: 1,
        savedSessionDuplicateCount: 1,
        savedSessionHistoryAvailable: true,
        matchedSavedSessions: [
          {
            sessionId: "saved-a",
            title: "Saved",
            savedAt: "2026-05-10T00:00:00Z",
            events: [{ connectorEventId: "x::y::z" }],
          },
        ],
      }),
    );
    expect(summary.matchedSavedSessions[0]).toEqual({
      sessionId: "saved-a",
      title: "Saved",
      savedAt: "2026-05-10T00:00:00Z",
    });
  });

  it("treats a preview with valid 0 and invalid > 0 as 'invalidOnly'", () => {
    const summary = buildConnectorSourceImportSummary(
      buildPreview({
        kind: "mixed",
        validEventCount: 0,
        newEventCount: 0,
        duplicateEventCount: 0,
        invalidLineCount: 2,
      }),
    );
    expect(summary.status).toBe("invalidOnly");
  });

  it("never reports duplicates for an old preview without cross-session fields", () => {
    const summary = buildConnectorSourceImportSummary(
      buildPreview({
        kind: "valid",
        validEventCount: 2,
        newEventCount: 2,
        duplicateEventCount: 0,
        canImport: true,
        // savedSessionHistoryAvailable defaults to false in this fixture,
        // so the helper downgrades to historyUnavailable rather than
        // claiming a clean "new" classification.
      }),
    );
    expect(summary.status).toBe("historyUnavailable");
    expect(summary.duplicateEventCount).toBe(0);
  });
});

describe("describeConnectorSourceImportBadge / getConnectorSourceImportBadgeTone", () => {
  it("returns Korean badge text and a tone for every status", () => {
    const cases: Array<{ status: "new" | "partialReimport" | "duplicateOnly" | "historyUnavailable" | "invalidOnly" | "unknown" }> = [
      { status: "new" },
      { status: "partialReimport" },
      { status: "duplicateOnly" },
      { status: "historyUnavailable" },
      { status: "invalidOnly" },
      { status: "unknown" },
    ];
    for (const c of cases) {
      const summary = { ...emptyConnectorSourceImportSummary(), status: c.status };
      const tone = getConnectorSourceImportBadgeTone(summary);
      const label = describeConnectorSourceImportBadge(summary);
      expect(tone).toMatch(/^(green|orange|blue|red|gray)$/);
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe("emptyConnectorSourceImportSummary", () => {
  it("returns an unknown-status summary safe to render", () => {
    const summary = emptyConnectorSourceImportSummary();
    expect(summary.status).toBe("unknown");
    expect(summary.canImportNewEvents).toBe(false);
    expect(summary.matchedSavedSessions).toEqual([]);
  });
});
