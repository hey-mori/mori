import { describe, expect, it } from "vitest";
import type { SourceRef, TimelineEvent } from "../../domain/types";
import { createSessionDraft } from "../session/createSessionDraft";
import { BrowserDraftRepository } from "./localStorageAdapter";
import { MemoryKeyValueStorage } from "./memoryStorage";
import { deriveSessionSummaryMetrics } from "./sessionSummaryMetrics";
import type { StoredSessionImport } from "./storageTypes";

function event(
  id: string,
  usage?: TimelineEvent["tokenUsage"],
): TimelineEvent {
  return {
    id,
    sessionId: "s-1",
    projectId: "p-1",
    start: "2026-05-22T09:00:00+09:00",
    type: "aiConversation",
    title: id,
    summary: "",
    sourceRefs: [],
    linkedIssueIds: [],
    linkedDecisionIds: [],
    relationshipIds: [],
    trustLevel: "observed",
    confidence: 0.9,
    createdBy: "import",
    userModified: false,
    ...(usage ? { tokenUsage: usage } : {}),
  };
}

function source(id: string): SourceRef {
  return {
    id,
    sessionId: "s-1",
    kind: "aiConversation",
    title: id,
    detail: "",
    trustLevel: "observed",
    redactionStatus: "notNeeded",
    rawRetention: "summaryOnly",
    capturedAt: "2026-05-22T09:00:00+09:00",
    relatedEventIds: [],
  };
}

function importRecord(events: TimelineEvent[], id = "imp-1"): StoredSessionImport {
  return {
    id,
    sessionId: "s-1",
    source: source(id),
    events,
    savedAt: "2026-05-22T09:00:00+09:00",
    adapter: "browser-local-storage",
  };
}

describe("deriveSessionSummaryMetrics", () => {
  it("returns an empty object for a session with no imports (no fake zero)", () => {
    expect(deriveSessionSummaryMetrics([])).toEqual({});
    expect(deriveSessionSummaryMetrics([importRecord([])])).toEqual({});
  });

  it("counts events but omits token fields when no event reported usage", () => {
    const metrics = deriveSessionSummaryMetrics([
      importRecord([event("a"), event("b"), event("c")]),
    ]);
    expect(metrics.eventCount).toBe(3);
    expect(metrics.tokenTotal).toBeUndefined();
    expect(metrics.tokenInput).toBeUndefined();
    expect(metrics.tokenOutput).toBeUndefined();
  });

  it("sums token usage across events when present", () => {
    const metrics = deriveSessionSummaryMetrics([
      importRecord([
        event("a", { input: 100, output: 40, total: 140, model: "claude" }),
        event("b"),
        event("c", { input: 60, output: 200, total: 260 }),
      ]),
    ]);
    expect(metrics.eventCount).toBe(3);
    expect(metrics.tokenTotal).toBe(400);
    expect(metrics.tokenInput).toBe(160);
    expect(metrics.tokenOutput).toBe(240);
  });

  it("sums usage across multiple imports in one session", () => {
    const metrics = deriveSessionSummaryMetrics([
      importRecord([event("a", { input: 10, output: 5, total: 15 })], "imp-1"),
      importRecord([event("b", { input: 20, output: 10, total: 30 })], "imp-2"),
    ]);
    expect(metrics.eventCount).toBe(2);
    expect(metrics.tokenTotal).toBe(45);
  });
});

describe("StoredSessionSummary metric round-trip", () => {
  function repoWithSession(storage: MemoryKeyValueStorage) {
    const repository = new BrowserDraftRepository(storage);
    const draft = repository.saveCurrentSessionDraft(
      createSessionDraft({
        sessionTitle: "토큰 세션",
        projectName: "Mori",
        selectedSources: [],
        recordingMode: "summary",
        llmProvider: "ollama",
        llmModel: "llama3.1:8b",
        storageLocation: "~/Mori/Records",
        now: "2026-05-22T08:00:00+09:00",
      }),
    );
    return { repository, draft };
  }

  it("derives eventCount + token totals onto the summary and reloads them", () => {
    const storage = new MemoryKeyValueStorage();
    const { repository, draft } = repoWithSession(storage);
    repository.putSessionImports(draft.session.id, [
      importRecord(
        [
          event("a", { input: 1_000, output: 200, total: 1_200 }),
          event("b", { input: 300, output: 900, total: 1_200 }),
        ],
        "imp-1",
      ),
    ]);

    const summary = repository
      .listStoredSessionsWithMetrics()
      .find((s) => s.sessionId === draft.session.id)!;
    expect(summary.eventCount).toBe(2);
    expect(summary.tokenTotal).toBe(2_400);
    expect(summary.tokenInput).toBe(1_300);
    expect(summary.tokenOutput).toBe(1_100);

    // A fresh repository over the same storage reloads identically.
    const reloaded = new BrowserDraftRepository(storage)
      .listStoredSessionsWithMetrics()
      .find((s) => s.sessionId === draft.session.id)!;
    expect(reloaded.tokenTotal).toBe(2_400);
  });

  it("omits token fields for a Claude Desktop session that carries no usage", () => {
    const storage = new MemoryKeyValueStorage();
    const { repository, draft } = repoWithSession(storage);
    repository.putSessionImports(draft.session.id, [
      importRecord([event("a"), event("b")], "imp-1"),
    ]);

    const summary = repository
      .listStoredSessionsWithMetrics()
      .find((s) => s.sessionId === draft.session.id)!;
    expect(summary.eventCount).toBe(2);
    expect("tokenTotal" in summary).toBe(false);
    expect("tokenInput" in summary).toBe(false);
    expect("tokenOutput" in summary).toBe(false);
  });

  it("omits all metric fields for a session with no imports", () => {
    const storage = new MemoryKeyValueStorage();
    const { repository, draft } = repoWithSession(storage);

    const summary = repository
      .listStoredSessions()
      .find((s) => s.sessionId === draft.session.id)!;
    expect("eventCount" in summary).toBe(false);
    expect("tokenTotal" in summary).toBe(false);
  });
});
