import { describe, expect, it } from "vitest";
import { moriMockSession } from "../../domain/mock-data";
import { sampleMoriPackageV0 } from "../mori-package/samplePackage";
import type {
  ConnectorSourceImportStatus,
  ConnectorSourceImportSummary,
} from "../connectors";
import type {
  StoredMoriPackageDraft,
  StoredSessionImport,
  StoredSessionSummary,
} from "../storage/storageTypes";
import type { SqliteSessionListEntry } from "../sqlite/repositoryContracts";
import { buildProjectMemoryViewModel } from "./projectMemoryViewModel";
import {
  emptyProjectMemoryViewModel,
  describeProjectMemoryDataBasis,
  getProjectMemoryDataBasisTone,
  getReimportStatusTone,
} from "./projectMemoryModel";

function importSummary(
  status: ConnectorSourceImportStatus,
  overrides: Partial<ConnectorSourceImportSummary> = {},
): ConnectorSourceImportSummary {
  return {
    status,
    totalValidEvents: 10,
    newEventCount: status === "duplicateOnly" ? 0 : 5,
    duplicateEventCount: status === "new" ? 0 : 5,
    currentSessionDuplicateCount: 0,
    savedSessionDuplicateCount: status === "duplicateOnly" || status === "partialReimport" ? 3 : 0,
    inBatchDuplicateCount: 0,
    invalidLineCount: status === "invalidOnly" ? 4 : 0,
    matchedSavedSessions: [],
    connectorIds: ["claude-code"],
    eventKinds: ["prompt_submitted"],
    timeRange: { earliestOccurredAt: null, latestOccurredAt: null },
    canImportNewEvents: status !== "duplicateOnly" && status !== "invalidOnly",
    savedSessionHistoryAvailable: status !== "historyUnavailable",
    defaultAction: "importNewEvents",
    userMessage: `summary-${status}`,
    detailMessage: `detail-${status}`,
    ...overrides,
  };
}

function browserSession(
  sessionId: string,
  title = `Saved ${sessionId}`,
  savedAt = "2026-05-12T10:00:00Z",
): StoredSessionSummary {
  return {
    sessionId,
    projectId: moriMockSession.project.id,
    title,
    projectName: moriMockSession.project.name,
    savedAt,
    status: "complete",
  };
}

function sqliteSession(sessionId: string, eventCount = 12, sourceCount = 3): SqliteSessionListEntry {
  return {
    sessionId,
    projectId: moriMockSession.project.id,
    title: `Desktop ${sessionId}`,
    projectName: moriMockSession.project.name,
    startedAt: "2026-05-10T09:00:00Z",
    endedAt: "2026-05-10T11:30:00Z",
    status: "complete",
    eventCount,
    sourceCount,
  };
}

function storedImport(
  id: string,
  sessionId: string,
  options: {
    summary?: ConnectorSourceImportSummary;
    savedAt?: string;
    eventCount?: number;
  } = {},
): StoredSessionImport {
  const savedAt = options.savedAt ?? "2026-05-12T10:00:00Z";
  return {
    id,
    sessionId,
    source: {
      id,
      sessionId,
      kind: "aiConversation",
      title: `Source ${id}`,
      detail: "",
      trustLevel: "observed",
      redactionStatus: "notNeeded",
      rawRetention: "summaryOnly",
      capturedAt: savedAt,
      relatedEventIds: [],
    },
    events: Array.from({ length: options.eventCount ?? 5 }, (_, i) => ({
      id: `${id}-evt-${i}`,
      sessionId,
      projectId: moriMockSession.project.id,
      start: savedAt,
      type: "aiConversation",
      title: `Event ${i}`,
      summary: "",
      sourceRefs: [],
      linkedIssueIds: [],
      linkedDecisionIds: [],
      relationshipIds: [],
      trustLevel: "observed",
      confidence: 0.8,
      createdBy: "import",
      userModified: false,
    })),
    savedAt,
    adapter: "browser-local-storage",
    ...(options.summary ? { importSummary: options.summary } : {}),
  };
}

function moriPackageDraft(
  packageId = "pkg-1",
  savedAt = "2026-05-10T15:00:00Z",
): StoredMoriPackageDraft {
  return {
    packageId,
    savedAt,
    adapter: "browser-local-storage",
    package: { ...sampleMoriPackageV0, manifest: { ...sampleMoriPackageV0.manifest, packageId } },
  };
}

describe("buildProjectMemoryViewModel", () => {
  it("returns active-session-only when no saved data is provided", () => {
    const vm = buildProjectMemoryViewModel({
      view: moriMockSession,
      mode: "draft",
      hasAnalysis: false,
    });
    expect(vm.dataBasis).toBe("activeSessionOnly");
    expect(vm.summaryStats.sessionCount).toBe(1);
    expect(vm.summaryStats.activeSessionCount).toBe(1);
    expect(vm.summaryStats.timelineEventCount).toBe(moriMockSession.events.length);
    expect(vm.reimportSummary.totalReimports).toBe(0);
    expect(vm.reimportSummary.importSummariesAvailable).toBe(false);
    expect(vm.warnings.find((w) => w.kind === "saved-session-bodies-not-loaded")).toBeUndefined();
  });

  it("returns unavailable state for demo mode regardless of saved data", () => {
    const vm = buildProjectMemoryViewModel({
      view: moriMockSession,
      mode: "demo",
      hasAnalysis: true,
      savedBrowserSessions: [browserSession("s-1")],
      importsBySessionId: { "s-1": [storedImport("imp-1", "s-1", { summary: importSummary("new") })] },
    });
    expect(vm.dataBasis).toBe("unavailable");
    expect(vm.reimportSummary.totalReimports).toBe(0);
    expect(vm.warnings.some((w) => w.kind === "demo-mode")).toBe(true);
  });

  it("aggregates active + browser-saved sessions with import summaries", () => {
    const vm = buildProjectMemoryViewModel({
      view: moriMockSession,
      mode: "draft",
      hasAnalysis: true,
      savedBrowserSessions: [browserSession("s-old", "Older session", "2026-04-01T10:00:00Z")],
      importsBySessionId: {
        "s-old": [
          storedImport("imp-a", "s-old", { summary: importSummary("partialReimport") }),
          storedImport("imp-b", "s-old", { summary: importSummary("duplicateOnly") }),
        ],
      },
    });
    expect(vm.dataBasis).toBe("activePlusSavedSessions");
    expect(vm.summaryStats.sessionCount).toBe(2);
    expect(vm.reimportSummary.totalReimports).toBe(2);
    expect(vm.reimportSummary.partialReimportCount).toBe(1);
    expect(vm.reimportSummary.duplicateOnlyCount).toBe(1);
    expect(vm.reimportSummary.importSummariesAvailable).toBe(true);
    expect(vm.warnings.some((w) => w.kind === "saved-session-bodies-not-loaded")).toBe(true);
  });

  it("classifies a SQLite-only saved-session world as metadata-only", () => {
    const vm = buildProjectMemoryViewModel({
      view: moriMockSession,
      mode: "draft",
      hasAnalysis: false,
      savedSqliteSessions: [sqliteSession("sq-1"), sqliteSession("sq-2", 4, 2)],
    });
    expect(vm.dataBasis).toBe("savedSessionMetadataOnly");
    expect(vm.summaryStats.sessionCount).toBe(3);
    expect(vm.reimportSummary.totalReimports).toBe(0);
    expect(vm.reimportSummary.importSummariesAvailable).toBe(false);
    expect(vm.warnings.some((w) => w.kind === "import-summaries-unavailable")).toBe(true);
  });

  it("does not feed re-import rollup from imports without an importSummary", () => {
    const vm = buildProjectMemoryViewModel({
      view: moriMockSession,
      mode: "draft",
      hasAnalysis: false,
      savedBrowserSessions: [browserSession("s-old")],
      importsBySessionId: {
        "s-old": [storedImport("imp-legacy", "s-old")],
      },
    });
    expect(vm.reimportSummary.totalReimports).toBe(0);
    expect(vm.reimportSummary.importSummariesAvailable).toBe(false);
    expect(
      vm.warnings.some(
        (w) => w.kind === "old-imports-without-identity" && w.importCount === 1,
      ),
    ).toBe(true);
    // Saved sessions exist but no summary — that's metadata-only territory.
    expect(vm.dataBasis).toBe("savedSessionMetadataOnly");
  });

  it("orders recent sessions with active first, then saved by savedAt desc", () => {
    const vm = buildProjectMemoryViewModel({
      view: moriMockSession,
      mode: "draft",
      hasAnalysis: false,
      savedBrowserSessions: [
        browserSession("s-old", "Old", "2025-12-01T10:00:00Z"),
        browserSession("s-new", "New", "2026-05-12T10:00:00Z"),
      ],
    });
    expect(vm.recentSessions[0].isCurrent).toBe(true);
    expect(vm.recentSessions[0].source).toBe("current");
    expect(vm.recentSessions.length).toBe(3);
    expect(vm.recentSessions.slice(1).map((row) => row.sessionId)).toEqual(["s-new", "s-old"]);
  });

  it("rolls up matched saved sessions across multiple imports", () => {
    const matched = [{ sessionId: "s-match-a", title: "Matched A", savedAt: "2026-04-01T10:00:00Z" }];
    const vm = buildProjectMemoryViewModel({
      view: moriMockSession,
      mode: "draft",
      hasAnalysis: false,
      savedBrowserSessions: [browserSession("s-a"), browserSession("s-b")],
      importsBySessionId: {
        "s-a": [
          storedImport("imp-a", "s-a", {
            summary: importSummary("partialReimport", { matchedSavedSessions: matched }),
          }),
        ],
        "s-b": [
          storedImport("imp-b", "s-b", {
            summary: importSummary("partialReimport", { matchedSavedSessions: matched }),
          }),
        ],
      },
    });
    expect(vm.reimportSummary.totalReimports).toBe(2);
    expect(vm.reimportSummary.topMatchedSavedSessions).toEqual([
      { sessionId: "s-match-a", title: "Matched A", savedAt: "2026-04-01T10:00:00Z", reimportCount: 2 },
    ]);
  });

  it("counts duplicateOnly / partialReimport / historyUnavailable / invalidOnly / new separately", () => {
    const vm = buildProjectMemoryViewModel({
      view: moriMockSession,
      mode: "draft",
      hasAnalysis: false,
      savedBrowserSessions: [browserSession("s-1"), browserSession("s-2")],
      importsBySessionId: {
        "s-1": [
          storedImport("a", "s-1", { summary: importSummary("partialReimport") }),
          storedImport("b", "s-1", { summary: importSummary("duplicateOnly") }),
          storedImport("c", "s-1", { summary: importSummary("historyUnavailable") }),
        ],
        "s-2": [
          storedImport("d", "s-2", { summary: importSummary("invalidOnly") }),
          storedImport("e", "s-2", { summary: importSummary("new") }),
        ],
      },
    });
    expect(vm.reimportSummary.partialReimportCount).toBe(1);
    expect(vm.reimportSummary.duplicateOnlyCount).toBe(1);
    expect(vm.reimportSummary.historyUnavailableCount).toBe(1);
    expect(vm.reimportSummary.invalidOnlyCount).toBe(1);
    expect(vm.reimportSummary.newImportCount).toBe(1);
    expect(vm.reimportSummary.totalReimports).toBe(5);
  });

  it("derives summary stats from the active session and rollup counters", () => {
    const vm = buildProjectMemoryViewModel({
      view: moriMockSession,
      mode: "draft",
      hasAnalysis: true,
      savedBrowserSessions: [browserSession("s-1")],
      importsBySessionId: {
        "s-1": [storedImport("imp-1", "s-1", { summary: importSummary("new") })],
      },
      moriPackages: [moriPackageDraft("pkg-a"), moriPackageDraft("pkg-b")],
    });
    expect(vm.summaryStats.timelineEventCount).toBe(moriMockSession.events.length);
    expect(vm.summaryStats.evidenceSourceCount).toBe(moriMockSession.sources.length);
    expect(vm.summaryStats.openIssueCount).toBe(
      moriMockSession.issues.filter((issue) => issue.status !== "resolved").length,
    );
    expect(vm.summaryStats.reportCount).toBe(2);
    expect(vm.summaryStats.packageCount).toBe(2);
    expect(vm.summaryStats.reimportCount).toBe(1);
  });

  it("falls back to the empty view model when storage is unavailable", () => {
    const vm = buildProjectMemoryViewModel({
      view: moriMockSession,
      mode: "draft",
      hasAnalysis: false,
      storageAvailable: false,
    });
    expect(vm.dataBasis).toBe("unavailable");
    expect(vm.recentSessions.length).toBe(0);
    expect(vm.warnings.some((w) => w.kind === "storage-unavailable")).toBe(true);
    // Still surfaces an active-session decision when one exists so the
    // right summary panel never collapses to nothing.
    if (moriMockSession.decisions.length > 0) {
      expect(vm.latestImportantDecision).not.toBeNull();
    }
  });

  it("emits no fake decision/issue counts for metadata-only sessions", () => {
    const vm = buildProjectMemoryViewModel({
      view: moriMockSession,
      mode: "draft",
      hasAnalysis: false,
      savedSqliteSessions: [sqliteSession("sq-1")],
    });
    const sqliteRow = vm.recentSessions.find((row) => row.sessionId === "sq-1");
    expect(sqliteRow?.issueCount).toBeNull();
    expect(sqliteRow?.decisionCount).toBeNull();
    expect(sqliteRow?.nextActionCount).toBeNull();
    expect(sqliteRow?.reimportCount).toBe(0);
  });

  it("emits a recommended next session topic anchored on open risks first", () => {
    const vm = buildProjectMemoryViewModel({
      view: moriMockSession,
      mode: "draft",
      hasAnalysis: false,
    });
    expect(vm.recommendedNextSession.length).toBeGreaterThan(0);
  });
});

describe("project memory model helpers", () => {
  it("empty view model has unavailable basis and storage-unavailable warning", () => {
    const empty = emptyProjectMemoryViewModel();
    expect(empty.dataBasis).toBe("unavailable");
    expect(empty.warnings).toEqual([{ kind: "storage-unavailable" }]);
  });

  it("describes every data basis with a stable label", () => {
    expect(describeProjectMemoryDataBasis("activeSessionOnly")).toMatch(/active session/i);
    expect(describeProjectMemoryDataBasis("activePlusSavedSessions")).toMatch(/saved/i);
    expect(describeProjectMemoryDataBasis("savedSessionMetadataOnly")).toMatch(/metadata/i);
    expect(describeProjectMemoryDataBasis("unavailable")).toMatch(/demo|unavailable/i);
  });

  it("maps data basis tones to the existing badge palette", () => {
    expect(getProjectMemoryDataBasisTone("activePlusSavedSessions")).toBe("green");
    expect(getProjectMemoryDataBasisTone("activeSessionOnly")).toBe("blue");
    expect(getProjectMemoryDataBasisTone("savedSessionMetadataOnly")).toBe("orange");
    expect(getProjectMemoryDataBasisTone("unavailable")).toBe("gray");
  });

  it("maps re-import statuses to a stable colour palette", () => {
    expect(getReimportStatusTone("new")).toBe("green");
    expect(getReimportStatusTone("partialReimport")).toBe("blue");
    expect(getReimportStatusTone("duplicateOnly")).toBe("orange");
    expect(getReimportStatusTone("invalidOnly")).toBe("red");
    expect(getReimportStatusTone("historyUnavailable")).toBe("gray");
  });
});
