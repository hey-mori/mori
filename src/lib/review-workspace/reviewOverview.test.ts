import { describe, expect, it } from "vitest";
import { buildReviewOverviewModel } from "./reviewOverview";
import type { IssuePriorityCounts, ReviewSummary } from "./reviewWorkspace";

function summary(overrides: Partial<ReviewSummary> = {}): ReviewSummary {
  return {
    issueCount: 0,
    decisionCount: 0,
    nextActionCount: 0,
    unresolvedIssueCount: 0,
    inProgressIssueCount: 0,
    resolvedIssueCount: 0,
    watchingIssueCount: 0,
    unconfirmedDecisionCount: 0,
    highPriorityIssueCount: 0,
    highImportanceDecisionCount: 0,
    lowConfidenceCount: 0,
    ...overrides,
  };
}

function priorities(overrides: Partial<IssuePriorityCounts> = {}): IssuePriorityCounts {
  return { high: 0, medium: 0, low: 0, ...overrides };
}

describe("buildReviewOverviewModel", () => {
  it("is not visible when there is nothing to summarize", () => {
    const model = buildReviewOverviewModel({ summary: summary(), priorities: priorities() });
    expect(model.visible).toBe(false);
  });

  it("is visible when any of issues / decisions / next actions exist", () => {
    expect(
      buildReviewOverviewModel({ summary: summary({ decisionCount: 2 }), priorities: priorities() })
        .visible,
    ).toBe(true);
    expect(
      buildReviewOverviewModel({ summary: summary({ nextActionCount: 1 }), priorities: priorities() })
        .visible,
    ).toBe(true);
  });

  it("rolls up attention from unresolved issues, unconfirmed decisions, and low-confidence items", () => {
    const model = buildReviewOverviewModel({
      summary: summary({
        issueCount: 4,
        unresolvedIssueCount: 3,
        unconfirmedDecisionCount: 1,
        lowConfidenceCount: 2,
      }),
      priorities: priorities({ high: 2, medium: 1, low: 1 }),
    });
    expect(model.attentionTotal).toBe(6);
    expect(model.allClear).toBe(false);
    // Only non-zero buckets, in stable display order.
    expect(model.attention).toEqual([
      { key: "unresolvedIssues", value: 3 },
      { key: "unconfirmedDecisions", value: 1 },
      { key: "lowConfidence", value: 2 },
    ]);
  });

  it("omits zero attention buckets but keeps display order", () => {
    const model = buildReviewOverviewModel({
      summary: summary({ issueCount: 1, unresolvedIssueCount: 0, lowConfidenceCount: 1 }),
      priorities: priorities({ high: 1 }),
    });
    expect(model.attention).toEqual([{ key: "lowConfidence", value: 1 }]);
  });

  it("reports all-clear when nothing needs attention", () => {
    const model = buildReviewOverviewModel({
      summary: summary({ issueCount: 2, resolvedIssueCount: 2 }),
      priorities: priorities({ medium: 2 }),
    });
    expect(model.attentionTotal).toBe(0);
    expect(model.allClear).toBe(true);
    expect(model.attention).toEqual([]);
  });

  it("mirrors the issue lifecycle counts", () => {
    const model = buildReviewOverviewModel({
      summary: summary({
        issueCount: 10,
        unresolvedIssueCount: 4,
        inProgressIssueCount: 3,
        resolvedIssueCount: 2,
        watchingIssueCount: 1,
      }),
      priorities: priorities({ high: 4, medium: 3, low: 3 }),
    });
    expect(model.issueStatus).toEqual({ open: 4, inProgress: 3, resolved: 2, watching: 1 });
  });

  it("computes priority percentages against the issue total", () => {
    const model = buildReviewOverviewModel({
      summary: summary({ issueCount: 4 }),
      priorities: priorities({ high: 1, medium: 1, low: 2 }),
    });
    expect(model.priority.total).toBe(4);
    expect(model.priority.highPct).toBe(25);
    expect(model.priority.mediumPct).toBe(25);
    expect(model.priority.lowPct).toBe(50);
  });

  it("keeps percentages at zero when there are no issues", () => {
    const model = buildReviewOverviewModel({
      summary: summary({ decisionCount: 1 }),
      priorities: priorities(),
    });
    expect(model.priority.total).toBe(0);
    expect(model.priority.highPct).toBe(0);
    expect(model.priority.mediumPct).toBe(0);
    expect(model.priority.lowPct).toBe(0);
  });
});
