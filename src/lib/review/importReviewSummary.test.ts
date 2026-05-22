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
      statusLabel: "이벤트 없음",
    });
    expect(model.items.find((item) => item.id === "apply")).toMatchObject({
      status: "waiting",
      statusLabel: "비활성",
    });
  });

  it("shows pending review progress before any events are accepted", () => {
    const model = buildImportReviewSummary({
      ...base,
      eventCount: 3,
      pendingCount: 3,
    });

    expect(model.headline).toBe("3개 이벤트가 검토 대기 중입니다");
    expect(model.items.find((item) => item.id === "review")).toMatchObject({
      status: "attention",
      statusLabel: "대기 중",
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

    expect(model.headline).toBe("2개 이벤트가 적용 준비되었습니다");
    expect(model.items.find((item) => item.id === "apply")?.detail).toContain(
      "수락된 2개 이벤트가 세션 Timeline에 추가됩니다",
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
      statusLabel: "부분 재가져오기",
    });
    expect(model.items.find((item) => item.id === "duplicates")?.detail).toContain(
      "중복 이벤트",
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
      statusLabel: "포함됨",
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
      statusLabel: "제한적",
    });
  });
});
