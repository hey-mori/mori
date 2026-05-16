import { describe, expect, it } from "vitest";
import {
  buildProjectMemoryConsolidationState,
  describeProposalKind,
  proposalKindTone,
} from "./projectMemoryConsolidationState";
import type { MemoryProposalKind } from "./consolidationProposals";
import {
  emptyProjectMemoryViewModel,
  type ProjectMemoryViewModel,
} from "./projectMemoryModel";
import type { StoredAcceptedProjectMemory } from "../storage/storageTypes";

function base(overrides: Partial<ProjectMemoryViewModel> = {}): ProjectMemoryViewModel {
  return {
    projectId: "p-1",
    projectName: "Mori Product",
    projectDescription: "",
    dataBasis: "activePlusSavedSessions",
    dataBasisLabel: "현재 + 저장 세션 집계",
    summaryStats: {
      sessionCount: 3,
      activeSessionCount: 1,
      timelineEventCount: 18,
      evidenceSourceCount: 5,
      issueCount: 4,
      openIssueCount: 3,
      decisionCount: 5,
      nextActionCount: 2,
      reportCount: 1,
      packageCount: 1,
      reimportCount: 0,
    },
    recentSessions: [
      {
        sessionId: "s-cur",
        title: "Current",
        projectName: "Mori",
        projectId: "p-1",
        startedAt: "2026-05-12T10:00:00Z",
        savedAt: null,
        durationLabel: null,
        eventCount: 12,
        evidenceCount: 3,
        issueCount: 3,
        decisionCount: 3,
        nextActionCount: 2,
        sourceCount: 3,
        reimportCount: 0,
        status: "recording",
        source: "current",
        dataSourceLabel: "Current · live",
        loadStatus: "loaded",
        isCurrent: true,
      },
      {
        sessionId: "s-old",
        title: "Previous",
        projectName: "Mori",
        projectId: "p-1",
        startedAt: "2026-04-01T09:00:00Z",
        savedAt: "2026-04-01T11:00:00Z",
        durationLabel: "2시간",
        eventCount: 6,
        evidenceCount: 2,
        issueCount: 1,
        decisionCount: 2,
        nextActionCount: 0,
        sourceCount: 2,
        reimportCount: 0,
        status: "complete",
        source: "browser-draft",
        dataSourceLabel: "Browser draft · 본문 로드됨",
        loadStatus: "loaded",
        isCurrent: false,
      },
    ],
    keyDecisions: [
      {
        decisionId: "d-sqlite",
        sessionId: "s-cur",
        sessionTitle: "Current",
        sessionIsActive: true,
        title: "Adopt SQLite for desktop persistence",
        detail: "Tauri + rusqlite.",
        importance: "high",
        confirmed: true,
        createdAt: "2026-05-10T10:00:00Z",
      },
    ],
    recurringIssues: [
      {
        issueId: "i-login",
        sessionId: "s-cur",
        sessionTitle: "Current",
        sessionIsActive: true,
        title: "Login fails on Safari",
        description: "Cookie SameSite issue.",
        signalScore: 8,
        affectedSessionCount: 2,
        affectedSessions: [
          { sessionId: "s-cur", sessionTitle: "Current", isActive: true },
          { sessionId: "s-old", sessionTitle: "Previous", isActive: false },
        ],
        status: "open",
        priority: "high",
        crossSession: true,
      },
    ],
    keyEvidence: [
      {
        source: {
          id: "src-a",
          sessionId: "s-cur",
          kind: "aiConversation",
          title: "Claude transcript",
          detail: "",
          trustLevel: "observed",
          redactionStatus: "notNeeded",
          rawRetention: "summaryOnly",
          capturedAt: "2026-05-10T09:00:00Z",
          relatedEventIds: [],
        },
        sessionId: "s-cur",
        sessionTitle: "Current",
        sessionIsActive: true,
        relatedEventCount: 4,
        relatedIssueCount: 1,
        relatedDecisionCount: 1,
      },
    ],
    reimportSummary: {
      totalReimports: 0,
      partialReimportCount: 0,
      duplicateOnlyCount: 0,
      historyUnavailableCount: 0,
      invalidOnlyCount: 0,
      newImportCount: 0,
      topMatchedSavedSessions: [],
      connectorIds: [],
      eventKinds: [],
      latestReimportAt: null,
      recentItems: [],
      importSummariesAvailable: false,
    },
    savedReports: [],
    moriPackages: [],
    unresolvedRisks: [
      {
        issueId: "i-login",
        title: "Login fails on Safari",
        priority: "high",
        status: "open",
        trustLevel: "observed",
        confidence: 0.85,
        reason: "High priority",
        sessionId: "s-cur",
        sessionTitle: "Current",
        sessionIsActive: true,
      },
    ],
    recommendedNextSession: "반복 이슈 해소: Login fails on Safari (2개 세션)",
    latestImportantDecision: null,
    warnings: [],
    privacyNotice: "local-only",
    ...overrides,
  };
}

describe("buildProjectMemoryConsolidationState", () => {
  it("returns ready state when proposals exist and basis is rich", () => {
    const state = buildProjectMemoryConsolidationState(base());
    expect(state.status).toBe("ready");
    expect(state.proposalCount).toBeGreaterThan(0);
    expect(state.preview).not.toBeNull();
    expect(state.emptyReason).toBeNull();
    expect(state.nextStepLabel).toMatch(/승인하기 전까지/);
  });

  it("returns empty state when basis is rich but no proposals derive", () => {
    const memory = base({
      keyDecisions: [],
      recurringIssues: [],
      keyEvidence: [],
      unresolvedRisks: [],
      recommendedNextSession: "현재 세션 메모리를 검토하고 다음 작업 범위를 결정", // generic fallback
      summaryStats: { ...base().summaryStats, decisionCount: 0, issueCount: 0 },
    });
    const state = buildProjectMemoryConsolidationState(memory);
    expect(state.status).toBe("empty");
    expect(state.proposalCount).toBe(0);
    expect(state.emptyReason).toMatch(/아직 기록된 결정이나 이슈가 없습니다/);
  });

  it("returns unavailable state for demo / no-storage view models", () => {
    const state = buildProjectMemoryConsolidationState(emptyProjectMemoryViewModel());
    expect(state.status).toBe("unavailable");
    expect(state.preview).toBeNull();
    expect(state.emptyReason).toBeTruthy();
    expect(state.proposalCount).toBe(0);
  });

  it("returns partial state when basis is narrow even if proposals exist", () => {
    const state = buildProjectMemoryConsolidationState(
      base({
        dataBasis: "savedSessionMetadataOnly",
        dataBasisLabel: "저장 세션은 메타데이터만",
        warnings: [{ kind: "saved-session-bodies-not-loaded", sessionCount: 2 }],
      }),
    );
    expect(state.status).toBe("partial");
    expect(state.nextStepLabel).toMatch(/집계 범위가 좁습니다/);
  });

  it("returns partial state for activeSessionOnly basis", () => {
    const state = buildProjectMemoryConsolidationState(
      base({ dataBasis: "activeSessionOnly", dataBasisLabel: "현재 세션만 집계" }),
    );
    expect(state.status).toBe("partial");
  });

  it("returns partial state for partialSavedSessionLoad basis", () => {
    const state = buildProjectMemoryConsolidationState(
      base({
        dataBasis: "partialSavedSessionLoad",
        dataBasisLabel: "저장 세션 일부만 본문 로드",
        warnings: [
          { kind: "saved-session-bodies-partial-load", loadedCount: 1, metadataOnlyCount: 1, failedCount: 0 },
        ],
      }),
    );
    expect(state.status).toBe("partial");
  });

  it("preserves proposalCounts from the underlying preview", () => {
    const state = buildProjectMemoryConsolidationState(base());
    expect(state.proposalCounts.promotedDecision).toBe(1);
    expect(state.proposalCounts.recurringIssue).toBe(1);
    expect(state.proposalCounts.keyEvidence).toBe(1);
    expect(state.proposalCounts.unresolvedRisk).toBe(1);
    expect(state.proposalCounts.nextSessionRecommendation).toBe(1);
  });

  it("never copies raw source content into the state object", () => {
    const state = buildProjectMemoryConsolidationState(base());
    // The state only surfaces structural fields. The preview's
    // proposals already enforce evidenceRef structure (covered by
    // consolidationProposals.test.ts); here we assert the state does
    // not introduce any free-text leakage on top.
    expect(state.nextStepLabel).not.toContain("Claude transcript");
    expect(state.nextStepLabel).not.toContain("Login fails");
    expect(state.emptyReason ?? "").not.toContain("Claude transcript");
  });

  it("derivation is deterministic — same input produces the same generatedAt", () => {
    const memory = base();
    const a = buildProjectMemoryConsolidationState(memory);
    const b = buildProjectMemoryConsolidationState(memory);
    expect(a.generatedAt).toBe(b.generatedAt);
  });

  it("generatedAt prefers latestReimportAt when available", () => {
    const state = buildProjectMemoryConsolidationState(
      base({
        reimportSummary: {
          ...base().reimportSummary,
          latestReimportAt: "2026-05-14T12:00:00Z",
        },
      }),
    );
    expect(state.generatedAt).toBe("2026-05-14T12:00:00Z");
  });

  it("generatedAt falls back to a stable epoch when no time-bearing field is present", () => {
    const state = buildProjectMemoryConsolidationState(emptyProjectMemoryViewModel());
    expect(state.generatedAt).toBe("1970-01-01T00:00:00.000Z");
  });

  it("topProposalKinds is ranked by count, then stable kind order", () => {
    const state = buildProjectMemoryConsolidationState(base());
    expect(state.topProposalKinds.length).toBeGreaterThan(0);
    // All emitted kinds in the fixture have a count of 1, so the
    // ordering falls back to the stable kind order. Promoted decision
    // must lead.
    expect(state.topProposalKinds[0]).toBe("promotedDecision");
  });

  it("merges Stale Memory Review proposals when accepted memories are supplied", () => {
    const withoutStale = buildProjectMemoryConsolidationState(base());
    const withStale = buildProjectMemoryConsolidationState(base(), {
      acceptedMemories: [acceptedMemory({ id: "mem-ret", status: "retired" })],
    });
    expect(withStale.proposalCounts.staleMemory).toBe(1);
    expect(withStale.proposalCount).toBe(withoutStale.proposalCount + 1);
    expect(withStale.preview?.proposals.some((p) => p.kind === "staleMemory")).toBe(true);
  });

  it("emits no stale proposals when no accepted memory shows a signal", () => {
    const state = buildProjectMemoryConsolidationState(base(), {
      acceptedMemories: [acceptedMemory()],
    });
    expect(state.proposalCounts.staleMemory).toBe(0);
  });

  it("merges Contradiction Review proposals when accepted decisions conflict", () => {
    const state = buildProjectMemoryConsolidationState(base(), {
      acceptedMemories: [
        acceptedMemory({ id: "a", title: "Storage backend", summary: "Use SQLite." }),
        acceptedMemory({ id: "b", title: "Storage backend", summary: "Use IndexedDB." }),
      ],
    });
    expect(state.proposalCounts.contradiction).toBe(1);
    expect(state.preview?.proposals.some((p) => p.kind === "contradiction")).toBe(true);
  });
});

function acceptedMemory(
  overrides: Partial<StoredAcceptedProjectMemory> = {},
): StoredAcceptedProjectMemory {
  return {
    id: "mem-1",
    projectId: "p-1",
    kind: "promotedDecision",
    title: "Accepted memory",
    summary: "Summary",
    status: "accepted",
    importance: "medium",
    confidence: { label: "medium" },
    evidenceRefs: [],
    sourceSessionIds: ["s-1"],
    originProposalIds: ["prop-1"],
    relatedIssueIds: [],
    relatedDecisionIds: [],
    proposedAction: "promote",
    sensitivity: "normal",
    resumeEligible: true,
    reportEligibility: "personal",
    createdAt: "2026-05-10T10:00:00Z",
    updatedAt: "2026-05-12T10:00:00Z",
    acceptedAt: "2026-05-12T10:00:00Z",
    acceptedBy: "local-user",
    reviewActionIds: [],
    schemaVersion: 1,
    adapter: "browser-local-storage",
    ...overrides,
  };
}

describe("describeProposalKind", () => {
  it("returns a stable human label for every supported kind", () => {
    expect(describeProposalKind("promotedDecision")).toBe("Decisions");
    expect(describeProposalKind("recurringIssue")).toBe("Recurring issues");
    expect(describeProposalKind("keyEvidence")).toBe("Key evidence");
    expect(describeProposalKind("unresolvedRisk")).toBe("Risks");
    expect(describeProposalKind("contradiction")).toBe("Contradictions");
    expect(describeProposalKind("staleMemory")).toBe("Stale memories");
    expect(describeProposalKind("nextSessionRecommendation")).toBe("Next session");
  });
});

describe("proposalKindTone", () => {
  const ALL_KINDS: MemoryProposalKind[] = [
    "promotedDecision",
    "recurringIssue",
    "keyEvidence",
    "unresolvedRisk",
    "contradiction",
    "staleMemory",
    "nextSessionRecommendation",
  ];

  it("draws every kind tone from the shared product-state vocabulary", () => {
    const vocabulary = [
      "success",
      "info",
      "warning",
      "danger",
      "accent",
      "neutral",
      "verified",
      "observed",
      "inferred",
    ];
    for (const kind of ALL_KINDS) {
      expect(vocabulary).toContain(proposalKindTone(kind));
    }
  });

  it("maps risk and contradiction to the most severe danger tone", () => {
    expect(proposalKindTone("unresolvedRisk")).toBe("danger");
    expect(proposalKindTone("contradiction")).toBe("danger");
  });

  it("maps a decision to success and a stale memory to neutral", () => {
    expect(proposalKindTone("promotedDecision")).toBe("success");
    expect(proposalKindTone("staleMemory")).toBe("neutral");
  });
});
