import { describe, expect, it, vi } from "vitest";
import { moriMockSession } from "../../domain/mock-data";
import type { SqliteSessionListEntry } from "../sqlite/repositoryContracts";
import type {
  MoriDraftRepository,
  StoredSessionAnalysis,
  StoredSessionImport,
  StoredSessionSummary,
} from "../storage/storageTypes";
import {
  loadProjectMemorySessions,
  type ProjectMemoryDesktopLoader,
} from "./loadProjectMemorySessions";

function stubRepository(overrides: Partial<MoriDraftRepository> = {}): MoriDraftRepository {
  const base: MoriDraftRepository = {
    saveCurrentSessionDraft: vi.fn() as unknown as MoriDraftRepository["saveCurrentSessionDraft"],
    loadCurrentSessionDraft: () => null,
    clearCurrentSessionDraft: vi.fn(),
    listStoredSessions: () => [],
    saveMoriPackageDraft: vi.fn() as unknown as MoriDraftRepository["saveMoriPackageDraft"],
    loadMoriPackageDraft: () => null,
    listMoriPackageDrafts: () => [],
    clearStoredSession: vi.fn(),
    addSessionImport: vi.fn() as unknown as MoriDraftRepository["addSessionImport"],
    listSessionImports: () => [],
    putSessionImports: vi.fn() as unknown as MoriDraftRepository["putSessionImports"],
    removeSessionImport: vi.fn(),
    clearSessionImports: vi.fn(),
    saveSessionAnalysis: vi.fn() as unknown as MoriDraftRepository["saveSessionAnalysis"],
    loadSessionAnalysis: () => null,
    clearSessionAnalysis: vi.fn(),
    saveSessionMemoryBody: vi.fn() as unknown as MoriDraftRepository["saveSessionMemoryBody"],
    loadSessionMemoryBody: () => null,
    clearSessionMemoryBody: vi.fn(),
    saveQuickPassSettings: vi.fn() as unknown as MoriDraftRepository["saveQuickPassSettings"],
    loadQuickPassSettings: () => ({} as any),
    saveRepositorySettings: vi.fn() as unknown as MoriDraftRepository["saveRepositorySettings"],
    loadRepositorySettings: () => ({} as any),
    listConnectorEventIdentitySnapshots: () => [],
    saveAcceptedProjectMemory: vi.fn() as unknown as MoriDraftRepository["saveAcceptedProjectMemory"],
    saveAcceptedProjectMemories: vi.fn() as unknown as MoriDraftRepository["saveAcceptedProjectMemories"],
    listAcceptedProjectMemories: () => [],
    getAcceptedProjectMemory: () => null,
    appendMemoryReviewAction: vi.fn() as unknown as MoriDraftRepository["appendMemoryReviewAction"],
    listMemoryReviewActions: () => [],
    ...overrides,
  };
  return base;
}

function browserSummary(sessionId: string, savedAt = "2026-05-10T10:00:00Z"): StoredSessionSummary {
  return {
    sessionId,
    projectId: "proj-1",
    title: `Browser ${sessionId}`,
    projectName: "Project",
    savedAt,
    status: "complete",
  };
}

function sqliteEntry(sessionId: string, endedAt = "2026-05-10T11:00:00Z"): SqliteSessionListEntry {
  return {
    sessionId,
    projectId: "proj-1",
    title: `SQLite ${sessionId}`,
    projectName: "Project",
    startedAt: "2026-05-10T09:00:00Z",
    endedAt,
    status: "complete",
    eventCount: 3,
    sourceCount: 1,
  };
}

function fakeImport(id: string, sessionId: string): StoredSessionImport {
  return {
    id,
    sessionId,
    source: {
      id,
      sessionId,
      kind: "aiConversation",
      title: `Import source ${id}`,
      detail: "",
      trustLevel: "observed",
      redactionStatus: "notNeeded",
      rawRetention: "summaryOnly",
      capturedAt: "2026-05-10T10:00:00Z",
      relatedEventIds: [],
    },
    events: [
      {
        id: `${id}-e1`,
        sessionId,
        projectId: "proj-1",
        start: "2026-05-10T10:00:00Z",
        type: "aiConversation",
        title: "evt",
        summary: "",
        sourceRefs: [],
        linkedIssueIds: [],
        linkedDecisionIds: [],
        relationshipIds: [],
        trustLevel: "observed",
        confidence: 0.8,
        createdBy: "import",
        userModified: false,
      },
    ],
    savedAt: "2026-05-10T10:00:00Z",
    adapter: "browser-local-storage",
  };
}

describe("loadProjectMemorySessions", () => {
  it("always includes the active session as loaded when live", async () => {
    const result = await loadProjectMemorySessions({
      activeSession: moriMockSession,
      activeIsLive: true,
    });
    expect(result.length).toBe(1);
    expect(result[0].isActive).toBe(true);
    expect(result[0].loadStatus).toBe("loaded");
    expect(result[0].decisions).toBe(moriMockSession.decisions);
  });

  it("marks the active demo session as metadataOnly", async () => {
    const result = await loadProjectMemorySessions({
      activeSession: moriMockSession,
      activeIsLive: false,
    });
    expect(result[0].loadStatus).toBe("metadataOnly");
    expect(result[0].decisions.length).toBe(0);
  });

  it("loads browser-saved sessions via the repository", async () => {
    const summaries = [browserSummary("s-old"), browserSummary("s-new", "2026-05-12T10:00:00Z")];
    const repository = stubRepository({
      listSessionImports: (sid: string) =>
        sid === "s-old" ? [fakeImport("imp-old", "s-old")] : [],
      loadSessionAnalysis: (_sid: string) => null as unknown as StoredSessionAnalysis | null,
    });
    const result = await loadProjectMemorySessions({
      activeSession: moriMockSession,
      activeIsLive: true,
      repository,
      savedBrowserSessions: summaries,
    });
    const browserRow = result.find((row) => row.sessionId === "s-old");
    expect(browserRow?.loadStatus).toBe("loaded");
    expect(browserRow?.events.length).toBe(1);
    const emptyRow = result.find((row) => row.sessionId === "s-new");
    // Browser session with no imports / analysis collapses to metadataOnly.
    expect(emptyRow?.loadStatus).toBe("metadataOnly");
  });

  it("surfaces browser memory body issues/decisions/next-actions when present", async () => {
    const summaries = [browserSummary("s-mem")];
    const repository = stubRepository({
      listSessionImports: () => [],
      loadSessionAnalysis: () => null as unknown as StoredSessionAnalysis | null,
      loadSessionMemoryBody: (sid: string) =>
        sid === "s-mem"
          ? {
              sessionId: "s-mem",
              savedAt: "2026-05-15T10:00:00Z",
              adapter: "browser-local-storage" as const,
              schemaVersion: 1 as const,
              issues: [
                {
                  id: "i1",
                  sessionId: "s-mem",
                  projectId: "p1",
                  title: "Recurring auth issue",
                  description: "",
                  status: "open" as const,
                  priority: "medium" as const,
                  sourceEventIds: [],
                  relatedDecisionIds: [],
                  relatedFileIds: [],
                  suggestedNextAction: "",
                  trustLevel: "observed" as const,
                  confidence: 0.8,
                  createdAt: "2026-05-15T10:00:00Z",
                  updatedAt: "2026-05-15T10:00:00Z",
                },
              ],
              decisions: [
                {
                  id: "d1",
                  sessionId: "s-mem",
                  projectId: "p1",
                  title: "Adopt SQLite",
                  decision: "rusqlite",
                  rationale: "",
                  rejectedOptions: [],
                  impact: [],
                  importance: "high" as const,
                  confirmed: true,
                  createdAt: "2026-05-15T11:00:00Z",
                  sourceEventIds: [],
                  relatedIssueIds: [],
                  relatedSourceIds: [],
                  trustLevel: "verified" as const,
                },
              ],
              nextActions: [],
            }
          : null,
    });
    const result = await loadProjectMemorySessions({
      activeSession: moriMockSession,
      activeIsLive: true,
      repository,
      savedBrowserSessions: summaries,
    });
    const row = result.find((r) => r.sessionId === "s-mem");
    expect(row?.loadStatus).toBe("loaded");
    expect(row?.issues.map((i) => i.title)).toContain("Recurring auth issue");
    expect(row?.decisions.map((d) => d.title)).toContain("Adopt SQLite");
  });

  it("falls back to analysis when memory body is missing", async () => {
    const summaries = [browserSummary("s-legacy")];
    const fakeAnalysis = {
      result: {
        runId: "run-1",
        generatedAt: "2026-05-12T11:00:00Z",
        providerLabel: "test",
        notes: [],
        issues: [
          {
            id: "i-legacy",
            sessionId: "s-legacy",
            projectId: "p1",
            title: "Legacy issue from analysis",
            description: "",
            status: "open" as const,
            priority: "high" as const,
            sourceEventIds: [],
            relatedDecisionIds: [],
            relatedFileIds: [],
            suggestedNextAction: "",
            trustLevel: "observed" as const,
            confidence: 0.8,
            createdAt: "2026-05-12T11:00:00Z",
            updatedAt: "2026-05-12T11:00:00Z",
          },
        ],
        decisions: [],
        nextActions: [],
        relationships: [],
        summary: { sessionSummary: "", resumePrompt: "", reportMarkdown: "", nextActionIds: [] },
      },
      sessionId: "s-legacy",
      savedAt: "2026-05-12T11:00:00Z",
      adapter: "browser-local-storage" as const,
    };
    const repository = stubRepository({
      listSessionImports: () => [],
      loadSessionAnalysis: (_sid: string) => fakeAnalysis as unknown as StoredSessionAnalysis,
      loadSessionMemoryBody: () => null,
    });
    const result = await loadProjectMemorySessions({
      activeSession: moriMockSession,
      activeIsLive: true,
      repository,
      savedBrowserSessions: summaries,
    });
    const row = result.find((r) => r.sessionId === "s-legacy");
    expect(row?.issues[0].title).toBe("Legacy issue from analysis");
  });

  it("does not fake issues/decisions when neither memory body nor analysis exists", async () => {
    const summaries = [browserSummary("s-bare")];
    const repository = stubRepository({
      listSessionImports: () => [fakeImport("imp-bare", "s-bare")],
      loadSessionAnalysis: () => null,
      loadSessionMemoryBody: () => null,
    });
    const result = await loadProjectMemorySessions({
      activeSession: moriMockSession,
      activeIsLive: true,
      repository,
      savedBrowserSessions: summaries,
    });
    const row = result.find((r) => r.sessionId === "s-bare");
    expect(row?.loadStatus).toBe("loaded");
    expect(row?.issues).toEqual([]);
    expect(row?.decisions).toEqual([]);
    expect(row?.nextActions).toEqual([]);
  });

  it("loads SQLite sessions via the desktop loader and parallelizes failures safely", async () => {
    const desktopLoader: ProjectMemoryDesktopLoader = {
      isDesktop: () => true,
      loadSessionFromDesktop: async (sessionId: string) => {
        if (sessionId === "sq-fail") {
          throw new Error("snapshot missing");
        }
        return { session: moriMockSession };
      },
    };
    const result = await loadProjectMemorySessions({
      activeSession: moriMockSession,
      activeIsLive: true,
      desktopLoader,
      savedSqliteSessions: [sqliteEntry("sq-ok"), sqliteEntry("sq-fail", "2026-05-09T11:00:00Z")],
    });
    const ok = result.find((row) => row.sessionId === "sq-ok");
    const fail = result.find((row) => row.sessionId === "sq-fail");
    expect(ok?.loadStatus).toBe("loaded");
    expect(fail?.loadStatus).toBe("failed");
    expect(fail?.failureReason).toContain("snapshot missing");
  });

  it("collapses SQLite sessions to metadataOnly when no desktop loader is available", async () => {
    const result = await loadProjectMemorySessions({
      activeSession: moriMockSession,
      activeIsLive: true,
      savedSqliteSessions: [sqliteEntry("sq-1")],
    });
    expect(result.find((row) => row.sessionId === "sq-1")?.loadStatus).toBe("metadataOnly");
  });

  it("caps total saved sessions at the configured limit (SQLite-first)", async () => {
    const desktopLoader: ProjectMemoryDesktopLoader = {
      isDesktop: () => true,
      loadSessionFromDesktop: async () => ({ session: moriMockSession }),
    };
    const sqlite = Array.from({ length: 25 }, (_, i) =>
      sqliteEntry(`sq-${i}`, `2026-05-${String(10 + (i % 20)).padStart(2, "0")}T10:00:00Z`),
    );
    const browser = Array.from({ length: 10 }, (_, i) => browserSummary(`b-${i}`));
    const repository = stubRepository();
    const result = await loadProjectMemorySessions({
      activeSession: moriMockSession,
      activeIsLive: true,
      desktopLoader,
      savedSqliteSessions: sqlite,
      savedBrowserSessions: browser,
      repository,
      cap: 5,
    });
    // 1 active + 5 SQLite (cap reached, browser skipped because budget exhausted).
    expect(result.length).toBe(1 + 5);
    expect(result.filter((row) => row.source === "browserLocalStorage").length).toBe(0);
  });

  it("never throws when one session loader rejects", async () => {
    const desktopLoader: ProjectMemoryDesktopLoader = {
      isDesktop: () => true,
      loadSessionFromDesktop: async () => {
        throw new Error("boom");
      },
    };
    await expect(
      loadProjectMemorySessions({
        activeSession: moriMockSession,
        activeIsLive: true,
        desktopLoader,
        savedSqliteSessions: [sqliteEntry("sq-1")],
      }),
    ).resolves.toBeDefined();
  });
});
