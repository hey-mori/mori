import { describe, expect, it } from "vitest";
import {
  buildProjectMemoryResumePrompt,
  isMemoryFlaggedForReview,
  isResumeGuidanceMemory,
  type ProjectMemoryResumePromptInput,
} from "./projectMemoryResumePrompt";
import { emptyProjectMemoryViewModel } from "./projectMemoryModel";
import type { ProjectMemoryViewModel } from "./projectMemoryModel";
import type { StoredAcceptedProjectMemory } from "../storage/storageTypes";

function baseViewModel(overrides: Partial<ProjectMemoryViewModel> = {}): ProjectMemoryViewModel {
  return {
    projectId: "p-1",
    projectName: "Mori Product",
    projectDescription: "Local-first AI work memory app",
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
        title: "Current sprint",
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
      {
        sessionId: "s-old",
        title: "Previous sprint",
        projectName: "Mori",
        projectId: "p-1",
        startedAt: "2026-04-01T10:00:00Z",
        savedAt: "2026-04-01T11:00:00Z",
        durationLabel: "1시간",
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
        decisionId: "d-1",
        sessionId: "s-cur",
        sessionTitle: "Current sprint",
        sessionIsActive: true,
        title: "Adopt SQLite for desktop persistence",
        detail: "Tauri + rusqlite chosen over IndexedDB; gives single-file portability.",
        importance: "high",
        confirmed: true,
        createdAt: "2026-05-10T10:00:00Z",
      },
    ],
    recurringIssues: [
      {
        issueId: "i-1",
        sessionId: "s-cur",
        sessionTitle: "Current sprint",
        sessionIsActive: true,
        title: "Login fails on Safari",
        description: "Cookie SameSite issue.",
        signalScore: 6,
        affectedSessionCount: 2,
        affectedSessions: [
          { sessionId: "s-cur", sessionTitle: "Current sprint", isActive: true },
          { sessionId: "s-old", sessionTitle: "Previous sprint", isActive: false },
        ],
        status: "open",
        priority: "high",
        crossSession: true,
      },
    ],
    keyEvidence: [
      {
        source: {
          id: "src-1",
          sessionId: "s-cur",
          kind: "aiConversation",
          title: "Claude transcript on auth",
          detail: "",
          uri: "/Users/admin/Downloads/transcript.txt",
          trustLevel: "observed",
          redactionStatus: "notNeeded",
          rawRetention: "summaryOnly",
          capturedAt: "2026-05-10T09:00:00Z",
          relatedEventIds: [],
        },
        sessionId: "s-cur",
        sessionTitle: "Current sprint",
        sessionIsActive: true,
        relatedEventCount: 4,
        relatedIssueCount: 1,
        relatedDecisionCount: 1,
      },
    ],
    reimportSummary: {
      totalReimports: 2,
      partialReimportCount: 1,
      duplicateOnlyCount: 1,
      historyUnavailableCount: 0,
      invalidOnlyCount: 0,
      newImportCount: 0,
      topMatchedSavedSessions: [
        { sessionId: "s-old", title: "Previous sprint", reimportCount: 2 },
      ],
      connectorIds: ["claude-code"],
      eventKinds: ["prompt_submitted"],
      latestReimportAt: "2026-05-10T12:00:00Z",
      recentItems: [],
      importSummariesAvailable: true,
    },
    savedReports: [],
    moriPackages: [],
    unresolvedRisks: [
      {
        issueId: "i-1",
        title: "Login fails on Safari",
        priority: "high",
        status: "open",
        trustLevel: "observed",
        confidence: 0.85,
        reason: "High priority",
        sessionId: "s-cur",
        sessionTitle: "Current sprint",
        sessionIsActive: true,
      },
    ],
    recommendedNextSession: "반복 이슈 해소: Login fails on Safari (2개 세션)",
    latestImportantDecision: null,
    warnings: [],
    privacyNotice: "Project Memory는 로컬에 저장된 Mori 세션만 참고합니다.",
    ...overrides,
  };
}

function build(input: Partial<ProjectMemoryResumePromptInput> & { audience: ProjectMemoryResumePromptInput["audience"] }) {
  return buildProjectMemoryResumePrompt({
    memory: input.memory ?? baseViewModel(),
    audience: input.audience,
    includeSections: input.includeSections,
    maxItems: input.maxItems,
    privacyMode: input.privacyMode,
    acceptedMemories: input.acceptedMemories,
  });
}

describe("buildProjectMemoryResumePrompt — self audience", () => {
  const result = build({ audience: "self" });

  it("includes project name, latest decision context, recurring issue, recommended next session", () => {
    expect(result.body).toContain("Mori Product");
    expect(result.body).toContain("Adopt SQLite for desktop persistence");
    expect(result.body).toContain("Login fails on Safari");
    expect(result.body).toContain("반복 이슈 해소");
  });

  it("uses a concise self-oriented preamble", () => {
    expect(result.body).toMatch(/Quick continuation context|read the sections below/i);
  });

  it("emits structured sections", () => {
    const keys = result.sections.map((section) => section.key);
    expect(keys).toContain("summary");
    expect(keys).toContain("decisions");
    expect(keys).toContain("issues");
    expect(keys).toContain("limitations");
  });
});

describe("buildProjectMemoryResumePrompt — audience variants", () => {
  it("claude prompt includes coding-agent continuation instructions", () => {
    const result = build({ audience: "claude" });
    expect(result.body).toMatch(/Mori work session|continuing a Mori/i);
    expect(result.body).toMatch(/Do not start unrelated milestones|confirm priorities/i);
  });

  it("codex prompt includes validation / commit guidance", () => {
    const result = build({ audience: "codex" });
    expect(result.body).toMatch(/check:full|check:release|validation/i);
    expect(result.body).toMatch(/commit/i);
  });

  it("chatgpt prompt asks for reasoning and alternatives", () => {
    const result = build({ audience: "chatgpt" });
    expect(result.body).toMatch(/reasoning|alternative|options/i);
  });

  it("handoff prompt avoids tool-specific instruction language", () => {
    const result = build({ audience: "handoff" });
    // Handoff strips audience-specific instructions but does NOT redact
    // factual content (e.g. an evidence source whose title happens to
    // mention a tool name stays). The check is on instruction copy, not
    // on substring presence.
    expect(result.body).not.toMatch(/npm run|check:full|check:release|coding-agent/i);
    expect(result.body).not.toMatch(/Confirm priorities with the user|run `npm/i);
    // Should look like a neutral team update preamble.
    expect(result.body).toMatch(/handoff|continuation note|memory snapshot/i);
  });
});

describe("buildProjectMemoryResumePrompt — privacy modes", () => {
  it("clientSafe strips local paths and connector identity refs from preamble + sections", () => {
    const memory = baseViewModel({
      keyDecisions: [
        {
          decisionId: "d-1",
          sessionId: "s-cur",
          sessionTitle: "Current sprint",
          sessionIsActive: true,
          title: "Path-sensitive decision",
          detail: "We chose /Users/admin/projects/foo over D:\\backup\\foo for clarity.",
          importance: "high",
          confirmed: true,
          createdAt: "2026-05-10T10:00:00Z",
        },
      ],
    });
    const normal = build({ audience: "claude", privacyMode: "normal", memory });
    const safe = build({ audience: "claude", privacyMode: "clientSafe", memory });
    expect(normal.body).toContain("/Users/admin");
    expect(safe.body).not.toContain("/Users/admin");
    expect(safe.body).not.toContain("D:\\backup");
    expect(safe.body).toContain("(local path)");
  });

  it("clientSafe removes evidence source titles and URLs", () => {
    const result = build({ audience: "claude", privacyMode: "clientSafe" });
    // The default fixture has an evidence row with a /Users/... uri — never appears in clientSafe.
    expect(result.body).not.toContain("/Users/admin");
    // Source title gets replaced with a generic label in clientSafe.
    expect(result.body).toContain("(source title omitted)");
  });

  it("summaryOnly omits detailed decision text but keeps the title", () => {
    const result = build({ audience: "self", privacyMode: "summaryOnly" });
    expect(result.body).toContain("Adopt SQLite for desktop persistence");
    expect(result.body).not.toContain("Tauri + rusqlite chosen over IndexedDB");
  });
});

describe("buildProjectMemoryResumePrompt — partial / metadata-only state", () => {
  it("includes the partial-load warning in the limitations section", () => {
    const memory = baseViewModel({
      dataBasis: "partialSavedSessionLoad",
      dataBasisLabel: "저장 세션 일부만 본문 로드",
      warnings: [
        { kind: "saved-session-bodies-partial-load", loadedCount: 2, metadataOnlyCount: 1, failedCount: 1 },
        { kind: "saved-session-load-failed", sessionCount: 1, reasons: ["snapshot missing"] },
      ],
    });
    const result = build({ audience: "self", memory });
    const limitations = result.sections.find((section) => section.key === "limitations");
    expect(limitations).toBeDefined();
    const text = limitations!.lines.join("\n");
    expect(text).toMatch(/Partial saved-session load/i);
    expect(text).toMatch(/1 saved sessions failed to load/i);
  });

  it("does not claim 'all sessions' when only the active session is aggregated", () => {
    const memory = baseViewModel({
      dataBasis: "activeSessionOnly",
      dataBasisLabel: "현재 세션만 집계",
    });
    const result = build({ audience: "claude", memory });
    expect(result.body).not.toMatch(/across all sessions|every saved session/i);
    expect(result.body).toMatch(/active session only/i);
  });

  it("does not produce a re-import section when the rollup is empty", () => {
    const memory = baseViewModel({
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
    });
    const result = build({ audience: "self", memory });
    expect(result.sections.find((section) => section.key === "reimports")).toBeUndefined();
  });
});

describe("buildProjectMemoryResumePrompt — empty memory fallback", () => {
  it("still renders a usable prompt from the empty view model", () => {
    const result = build({ audience: "self", memory: emptyProjectMemoryViewModel() });
    expect(result.body.length).toBeGreaterThan(20);
    expect(result.body).toMatch(/Limitations|Data basis|local-only/i);
  });
});

describe("buildProjectMemoryResumePrompt — section inclusion", () => {
  it("honours includeSections filter", () => {
    const result = build({ audience: "self", includeSections: ["summary", "limitations"] });
    expect(result.sections.map((section) => section.key)).toEqual(["summary", "limitations"]);
  });

  it("respects maxItems cap on decisions and issues", () => {
    const memory = baseViewModel({
      keyDecisions: Array.from({ length: 10 }, (_, i) => ({
        decisionId: `d-${i}`,
        sessionId: "s-cur",
        sessionTitle: "Current",
        sessionIsActive: true,
        title: `Decision ${i}`,
        detail: "",
        importance: "medium" as const,
        confirmed: true,
        createdAt: "2026-05-10T10:00:00Z",
      })),
    });
    const result = build({ audience: "self", memory, maxItems: 3 });
    const decisions = result.sections.find((section) => section.key === "decisions");
    expect(decisions?.lines.length).toBe(3);
  });
});

// ─── accepted-memory integration ──────────────────────────────────────

function acceptedMemory(
  overrides: Partial<StoredAcceptedProjectMemory> = {},
): StoredAcceptedProjectMemory {
  return {
    id: "mem-1",
    projectId: "p-1",
    kind: "promotedDecision",
    title: "Keep Import Review as a non-bypassable gate",
    summary: "Every captured event must pass through Import Review before it reaches a session.",
    status: "accepted",
    importance: "high",
    confidence: { label: "high", score: 0.9 },
    evidenceRefs: [{ kind: "session", sessionId: "s-cur", sessionTitle: "Current sprint" }],
    sourceSessionIds: ["s-cur", "s-old"],
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
    reviewActionIds: ["act-1"],
    schemaVersion: 1,
    adapter: "browser-local-storage",
    ...overrides,
  };
}

describe("buildProjectMemoryResumePrompt — accepted memory integration", () => {
  it("omits the consolidated-memory section when no accepted memories are passed", () => {
    const result = build({ audience: "claude" });
    expect(result.sections.map((section) => section.key)).not.toContain("consolidatedMemory");
  });

  it("surfaces an accepted memory as reviewed guidance above the live aggregation", () => {
    const result = build({ audience: "claude", acceptedMemories: [acceptedMemory()] });
    const section = result.sections.find((s) => s.key === "consolidatedMemory");
    expect(section).toBeDefined();
    expect(section?.heading).toMatch(/Accepted project memory/i);
    expect(result.body).toContain("Keep Import Review as a non-bypassable gate");
    expect(result.body).toContain("Accepted project memory: 1 used as guidance (of 1 reviewed)");
    // The consolidated section is placed before the live key-decisions section.
    const keys = result.sections.map((s) => s.key);
    expect(keys.indexOf("consolidatedMemory")).toBeLessThan(keys.indexOf("decisions"));
  });

  it("excludes watching-status memories from guidance and flags them under limitations", () => {
    const result = build({
      audience: "self",
      acceptedMemories: [acceptedMemory({ id: "mem-w", status: "watching" })],
    });
    const section = result.sections.find((s) => s.key === "consolidatedMemory");
    expect(section?.lines.join("\n")).toContain("no accepted project memory");
    const limitations = result.sections.find((s) => s.key === "limitations");
    expect(limitations?.lines.join("\n")).toMatch(/1 accepted memory flagged for re-review/);
  });

  it("excludes staleMemory / contradiction kinds from guidance but flags them", () => {
    const result = build({
      audience: "self",
      acceptedMemories: [
        acceptedMemory({ id: "mem-stale", kind: "staleMemory" }),
        acceptedMemory({ id: "mem-conflict", kind: "contradiction" }),
      ],
    });
    const section = result.sections.find((s) => s.key === "consolidatedMemory");
    expect(section?.lines.join("\n")).toContain("no accepted project memory");
    const limitations = result.sections.find((s) => s.key === "limitations");
    expect(limitations?.lines.join("\n")).toMatch(/2 accepted memories flagged for re-review/);
  });

  it("excludes superseded / retired memories entirely — not guidance, not flagged", () => {
    const result = build({
      audience: "self",
      acceptedMemories: [
        acceptedMemory({ id: "mem-sup", status: "superseded" }),
        acceptedMemory({ id: "mem-ret", status: "retired" }),
      ],
    });
    const limitations = result.sections.find((s) => s.key === "limitations");
    expect(limitations?.lines.join("\n")).not.toMatch(/flagged for re-review/);
  });

  it("drops non-normal sensitivity memories in clientSafe mode", () => {
    const sensitive = acceptedMemory({ id: "mem-priv", sensitivity: "sensitive" });
    const normalResult = build({ audience: "handoff", acceptedMemories: [sensitive] });
    expect(normalResult.body).toContain("Keep Import Review as a non-bypassable gate");

    const clientSafe = build({
      audience: "handoff",
      privacyMode: "clientSafe",
      acceptedMemories: [sensitive],
    });
    const section = clientSafe.sections.find((s) => s.key === "consolidatedMemory");
    expect(section?.lines.join("\n")).toContain("no accepted project memory");
  });

  it("drops the per-memory summary detail in summaryOnly mode", () => {
    const result = build({
      audience: "self",
      privacyMode: "summaryOnly",
      acceptedMemories: [acceptedMemory()],
    });
    const section = result.sections.find((s) => s.key === "consolidatedMemory");
    const text = section?.lines.join("\n") ?? "";
    expect(text).toContain("Keep Import Review as a non-bypassable gate");
    expect(text).not.toContain("Every captured event must pass through Import Review");
  });

  it("isResumeGuidanceMemory enforces the inclusion policy", () => {
    expect(isResumeGuidanceMemory(acceptedMemory(), "normal")).toBe(true);
    expect(isResumeGuidanceMemory(acceptedMemory({ status: "edited" }), "normal")).toBe(true);
    expect(isResumeGuidanceMemory(acceptedMemory({ status: "watching" }), "normal")).toBe(false);
    expect(isResumeGuidanceMemory(acceptedMemory({ status: "deferred" }), "normal")).toBe(false);
    expect(isResumeGuidanceMemory(acceptedMemory({ status: "stale" }), "normal")).toBe(false);
    expect(isResumeGuidanceMemory(acceptedMemory({ status: "contradicted" }), "normal")).toBe(false);
    expect(isResumeGuidanceMemory(acceptedMemory({ resumeEligible: false }), "normal")).toBe(false);
    expect(isResumeGuidanceMemory(acceptedMemory({ kind: "staleMemory" }), "normal")).toBe(false);
    expect(
      isResumeGuidanceMemory(acceptedMemory({ sensitivity: "sensitive" }), "clientSafe"),
    ).toBe(false);
    expect(
      isResumeGuidanceMemory(acceptedMemory({ sensitivity: "sensitive" }), "normal"),
    ).toBe(true);
  });

  it("isMemoryFlaggedForReview marks unresolved memory but skips history", () => {
    expect(isMemoryFlaggedForReview(acceptedMemory({ kind: "staleMemory" }))).toBe(true);
    expect(isMemoryFlaggedForReview(acceptedMemory({ kind: "contradiction" }))).toBe(true);
    expect(isMemoryFlaggedForReview(acceptedMemory({ status: "watching" }))).toBe(true);
    expect(isMemoryFlaggedForReview(acceptedMemory({ status: "stale" }))).toBe(true);
    expect(isMemoryFlaggedForReview(acceptedMemory({ status: "contradicted" }))).toBe(true);
    expect(isMemoryFlaggedForReview(acceptedMemory())).toBe(false);
    expect(isMemoryFlaggedForReview(acceptedMemory({ status: "superseded" }))).toBe(false);
    expect(isMemoryFlaggedForReview(acceptedMemory({ status: "retired" }))).toBe(false);
  });
});
