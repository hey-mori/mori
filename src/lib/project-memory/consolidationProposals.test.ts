import { describe, expect, it } from "vitest";
import {
  buildProjectMemoryConsolidationPreview,
  type MemoryProposalKind,
} from "./consolidationProposals";
import {
  emptyProjectMemoryViewModel,
  type ProjectMemoryViewModel,
} from "./projectMemoryModel";

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
        startedAt: null,
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
    ],
    keyDecisions: [
      {
        decisionId: "d-sqlite",
        sessionId: "s-cur",
        sessionTitle: "Current",
        sessionIsActive: true,
        title: "Adopt SQLite for desktop persistence",
        detail: "Tauri + rusqlite chosen.",
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
          id: "src-claude",
          sessionId: "s-cur",
          kind: "aiConversation",
          title: "Claude transcript on auth",
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

describe("buildProjectMemoryConsolidationPreview", () => {
  it("derives a promoted-decision proposal from a keyDecision row", () => {
    const preview = buildProjectMemoryConsolidationPreview(base());
    const decision = preview.proposals.find((p) => p.kind === "promotedDecision");
    expect(decision).toBeDefined();
    expect(decision!.title).toBe("Adopt SQLite for desktop persistence");
    expect(decision!.proposedAction).toBe("promote");
    expect(decision!.sourceSessionIds).toEqual(["s-cur"]);
    expect(decision!.evidenceRefs[0]).toEqual({
      kind: "session",
      sessionId: "s-cur",
      sessionTitle: "Current",
    });
  });

  it("derives a recurring-issue proposal with affected-session evidence refs", () => {
    const preview = buildProjectMemoryConsolidationPreview(base());
    const issue = preview.proposals.find((p) => p.kind === "recurringIssue");
    expect(issue).toBeDefined();
    expect(issue!.evidenceRefs.length).toBe(2);
    expect(issue!.proposedAction).toBe("promote"); // crossSession === true → promote
    expect(issue!.sourceSessionIds.sort()).toEqual(["s-cur", "s-old"]);
  });

  it("single-session recurring issues are kept-watching, not promoted", () => {
    const preview = buildProjectMemoryConsolidationPreview(
      base({
        recurringIssues: [
          {
            issueId: "i-only",
            sessionId: "s-cur",
            sessionTitle: "Current",
            sessionIsActive: true,
            title: "Standalone issue",
            description: "",
            signalScore: 4,
            affectedSessionCount: 1,
            affectedSessions: [{ sessionId: "s-cur", sessionTitle: "Current", isActive: true }],
            status: "open",
            priority: "medium",
            crossSession: false,
          },
        ],
      }),
    );
    const issue = preview.proposals.find((p) => p.kind === "recurringIssue");
    expect(issue!.proposedAction).toBe("keepWatching");
  });

  it("does not derive key-evidence as a memory proposal (evidence is not memory)", () => {
    const preview = buildProjectMemoryConsolidationPreview(base());
    // A source/session pointer belongs to the Evidence layer, not memory, so
    // it is never surfaced as a memory proposal.
    expect(preview.proposals.some((p) => p.kind === "keyEvidence")).toBe(false);
    expect(preview.proposalCounts.keyEvidence).toBe(0);
  });

  it("derives an unresolved-risk proposal with keepWatching default", () => {
    const preview = buildProjectMemoryConsolidationPreview(base());
    const risk = preview.proposals.find((p) => p.kind === "unresolvedRisk");
    expect(risk).toBeDefined();
    expect(risk!.proposedAction).toBe("keepWatching");
  });

  it("derives a nextSessionRecommendation proposal when the topic is meaningful", () => {
    const preview = buildProjectMemoryConsolidationPreview(base());
    const next = preview.proposals.find((p) => p.kind === "nextSessionRecommendation");
    expect(next).toBeDefined();
    expect(next!.proposedAction).toBe("scheduleNextSession");
    expect(next!.title).toMatch(/반복 이슈 해소/);
  });

  it("suppresses the next-session proposal when the topic is the generic fallback", () => {
    const preview = buildProjectMemoryConsolidationPreview(
      base({ recommendedNextSession: "현재 세션 메모리를 검토하고 다음 작업 범위를 결정" }),
    );
    expect(preview.proposals.find((p) => p.kind === "nextSessionRecommendation")).toBeUndefined();
  });

  it("warns when basis is activeSessionOnly that consolidation reach is narrow", () => {
    const preview = buildProjectMemoryConsolidationPreview(
      base({ dataBasis: "activeSessionOnly", dataBasisLabel: "현재 세션만 집계" }),
    );
    expect(preview.warnings.some((w) => w.kind === "saved-session-bodies-not-loaded")).toBe(true);
  });

  it("echoes view-model warnings (e.g. partial saved-session load)", () => {
    const preview = buildProjectMemoryConsolidationPreview(
      base({
        warnings: [
          {
            kind: "saved-session-bodies-partial-load",
            loadedCount: 1,
            metadataOnlyCount: 1,
            failedCount: 1,
          },
        ],
      }),
    );
    expect(preview.warnings.some((w) => w.kind === "saved-session-bodies-partial-load")).toBe(true);
  });

  it("returns an empty preview for unavailable basis (demo mode / no storage)", () => {
    const preview = buildProjectMemoryConsolidationPreview(emptyProjectMemoryViewModel());
    expect(preview.proposals).toEqual([]);
    expect(preview.dataBasis).toBe("unavailable");
    expect(preview.warnings.some((w) => w.kind === "storage-unavailable")).toBe(true);
  });

  it("dedupes proposals with identical (kind, normalised title, source sessions)", () => {
    // Same evidence rendered twice with title variation → one proposal kept.
    const preview = buildProjectMemoryConsolidationPreview(
      base({
        keyDecisions: [
          {
            decisionId: "d-a",
            sessionId: "s-cur",
            sessionTitle: "Current",
            sessionIsActive: true,
            title: "Adopt SQLite for desktop persistence",
            detail: "",
            importance: "high",
            confirmed: true,
            createdAt: "2026-05-10T10:00:00Z",
          },
          {
            decisionId: "d-b",
            sessionId: "s-cur",
            sessionTitle: "Current",
            sessionIsActive: true,
            title: "Adopt SQLite for desktop persistence",
            detail: "Tauri + rusqlite.",
            importance: "medium",
            confirmed: false,
            createdAt: "2026-05-10T11:00:00Z",
          },
        ],
      }),
    );
    const promoted = preview.proposals.filter((p) => p.kind === "promotedDecision");
    expect(promoted.length).toBe(1);
    // Higher-confidence row wins the dedupe (the confirmed/high one).
    expect(promoted[0].confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("never copies raw connector content into proposals", () => {
    const preview = buildProjectMemoryConsolidationPreview(base());
    // Each proposal's `evidenceRefs` are typed citations — the helper
    // cannot emit free-text references. That's the structural
    // guarantee against raw-content leakage.
    for (const proposal of preview.proposals) {
      expect(proposal.evidenceRefs.length).toBeGreaterThan(0);
      for (const ref of proposal.evidenceRefs) {
        expect(["session", "event", "source"]).toContain(ref.kind);
        // Each ref must carry a sessionId; no free-text fallbacks.
        // The session-kind ref carries sessionTitle too, but that's
        // already user-curated session metadata.
        expect(typeof ref.sessionId).toBe("string");
        expect(ref.sessionId.length).toBeGreaterThan(0);
      }
    }
  });

  it("counts proposals by kind", () => {
    const preview = buildProjectMemoryConsolidationPreview(base());
    expect(preview.proposalCounts.promotedDecision).toBe(1);
    expect(preview.proposalCounts.recurringIssue).toBe(1);
    // Key evidence is no longer a memory proposal (it is evidence, not memory).
    expect(preview.proposalCounts.keyEvidence).toBe(0);
    expect(preview.proposalCounts.unresolvedRisk).toBe(1);
    expect(preview.proposalCounts.nextSessionRecommendation).toBe(1);
    // No contradictions / stale memories produced by Phase 2.0.
    expect(preview.proposalCounts.contradiction).toBe(0);
    expect(preview.proposalCounts.staleMemory).toBe(0);
  });

  it("ranks proposals so high-importance / high-confidence rows surface first", () => {
    const preview = buildProjectMemoryConsolidationPreview(base());
    const kinds: MemoryProposalKind[] = preview.proposals.map((p) => p.kind);
    // The high-importance promoted decision and recurring issue should land
    // before the medium-importance next-session row.
    const firstIndex = (kind: MemoryProposalKind) => kinds.indexOf(kind);
    expect(firstIndex("promotedDecision")).toBeLessThan(firstIndex("nextSessionRecommendation"));
    expect(firstIndex("recurringIssue")).toBeLessThan(firstIndex("nextSessionRecommendation"));
  });
});
