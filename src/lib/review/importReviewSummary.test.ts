import { describe, expect, it } from "vitest";
import type { ConnectorSourceImportSummary } from "../connectors";
import { buildImportReviewSummary } from "./importReviewSummary";

const base = {
  eventCount: 0,
  acceptedCount: 0,
  discardedCount: 0,
  pendingCount: 0,
  meta: null,
};

function connectorSummary(
  overrides: Partial<ConnectorSourceImportSummary> = {},
): ConnectorSourceImportSummary {
  return {
    status: "new",
    totalValidEvents: 3,
    newEventCount: 3,
    duplicateEventCount: 0,
    currentSessionDuplicateCount: 0,
    savedSessionDuplicateCount: 0,
    inBatchDuplicateCount: 0,
    invalidLineCount: 0,
    matchedSavedSessions: [],
    connectorIds: ["codex-cli"],
    eventKinds: ["assistant_message"],
    timeRange: { earliestOccurredAt: null, latestOccurredAt: null },
    canImportNewEvents: true,
    savedSessionHistoryAvailable: true,
    defaultAction: "importNewEvents",
    userMessage: "New import",
    detailMessage: "New import",
    ...overrides,
  };
}

describe("buildImportReviewSummary", () => {
  it("marks an empty import as blocked and apply as waiting", () => {
    const model = buildImportReviewSummary(base);

    expect(model.items.find((item) => item.id === "source")).toMatchObject({
      status: "blocked",
      statusLabel: "No events",
    });
    expect(model.items.find((item) => item.id === "apply")).toMatchObject({
      status: "waiting",
      statusLabel: "Disabled",
    });
  });

  it("shows pending review progress before any events are accepted", () => {
    const model = buildImportReviewSummary({
      ...base,
      eventCount: 3,
      pendingCount: 3,
    });

    expect(model.headline).toBe("3 events still need review");
    expect(model.items.find((item) => item.id === "review")).toMatchObject({
      status: "attention",
      statusLabel: "Pending",
    });
  });

  it("shows apply effect once events are accepted", () => {
    const model = buildImportReviewSummary({
      ...base,
      eventCount: 3,
      acceptedCount: 2,
      discardedCount: 1,
      pendingCount: 0,
    });

    expect(model.headline).toBe("2 events ready to apply");
    expect(model.items.find((item) => item.id === "apply")?.detail).toContain(
      "2 accepted events will be added",
    );
  });

  it("summarises partial re-imports from connector metadata", () => {
    const model = buildImportReviewSummary({
      ...base,
      eventCount: 2,
      acceptedCount: 1,
      pendingCount: 1,
      meta: {
        sourceImportSummary: connectorSummary({
          status: "partialReimport",
          newEventCount: 2,
          duplicateEventCount: 5,
          currentSessionDuplicateCount: 1,
          savedSessionDuplicateCount: 3,
          inBatchDuplicateCount: 1,
        }),
      },
    });

    expect(model.items.find((item) => item.id === "source")).toMatchObject({
      status: "attention",
      statusLabel: "Partial re-import",
    });
    expect(model.items.find((item) => item.id === "duplicates")?.detail).toContain(
      "5 duplicate events",
    );
  });

  it("distinguishes explicitly included duplicate imports", () => {
    const model = buildImportReviewSummary({
      ...base,
      eventCount: 3,
      pendingCount: 3,
      meta: {
        duplicateIncludedCount: 3,
        includeDuplicates: true,
      },
    });

    expect(model.items.find((item) => item.id === "duplicates")).toMatchObject({
      status: "attention",
      statusLabel: "Included",
    });
  });

  it("does not claim full duplicate history when saved-session history was unavailable", () => {
    const model = buildImportReviewSummary({
      ...base,
      eventCount: 3,
      pendingCount: 3,
      meta: {
        savedSessionHistoryAvailable: false,
      },
    });

    expect(model.items.find((item) => item.id === "duplicates")).toMatchObject({
      status: "attention",
      statusLabel: "Limited",
    });
  });
});
