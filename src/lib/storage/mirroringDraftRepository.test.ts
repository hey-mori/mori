import { describe, expect, it } from "vitest";
import { DocumentMirror, type DocumentMirrorTarget } from "./documentMirror";
import { createMirroringDraftRepository } from "./mirroringDraftRepository";
import { BrowserDraftRepository } from "./localStorageAdapter";
import { MemoryKeyValueStorage } from "./memoryStorage";
import type { SqliteDurableDocumentRow } from "../sqlite/durableDocumentRows";
import type { AnalysisResult } from "../analysis";

function target() {
  const saved: SqliteDurableDocumentRow[] = [];
  const removed: Array<{ kind: string; ownerId: string }> = [];
  const mirrorTarget: DocumentMirrorTarget = {
    async saveDocuments(documents) {
      saved.push(...documents);
    },
    async deleteDocument(kind, ownerId) {
      removed.push({ kind, ownerId });
    },
  };
  return { mirrorTarget, saved, removed };
}

function setup() {
  const { mirrorTarget, saved, removed } = target();
  const mirror = new DocumentMirror(mirrorTarget);
  const inner = new BrowserDraftRepository(new MemoryKeyValueStorage());
  return { repository: createMirroringDraftRepository(inner, mirror), mirror, saved, removed, inner };
}

function analysis(runId: string): AnalysisResult {
  return {
    runId,
    providerName: "deterministic-quick-pass",
    providerLabel: "규칙 기반",
    generatedAt: "2026-08-18T09:00:00.000Z",
    durationMs: 5,
    confidence: 0.5,
    issues: [],
    decisions: [],
    nextActions: [],
    relationships: [],
    summary: { sessionSummary: "요약", resumePrompt: "이어가기" },
    notes: [],
  } as unknown as AnalysisResult;
}

describe("createMirroringDraftRepository", () => {
  it("mirrors a memory body and returns the inner result unchanged", async () => {
    const { repository, mirror, saved } = setup();

    const stored = repository.saveSessionMemoryBody("sess-1", {
      issues: [],
      decisions: [],
      nextActions: [],
    });
    await mirror.drain();

    expect(stored.sessionId).toBe("sess-1");
    expect(saved).toHaveLength(1);
    expect(saved[0].kind).toBe("memory_body");
    expect(saved[0].ownerId).toBe("sess-1");
    // Mirrors what was stored, so the copy carries the adapter's own fields
    // rather than the caller's argument.
    expect(JSON.parse(saved[0].bodyJson).savedAt).toBe(stored.savedAt);
  });

  // The reason the decorator reads back instead of rebuilding: the
  // append-versus-update rule for a re-analysis lives in the adapter, and a
  // second implementation here would be free to disagree with it.
  it("mirrors the run history the adapter actually maintained", async () => {
    const { repository, mirror, saved } = setup();

    repository.saveSessionAnalysis("sess-1", analysis("run-1"));
    repository.saveSessionAnalysis("sess-1", analysis("run-2"));
    await mirror.drain();

    const histories = saved.filter((row) => row.kind === "analysis_history");
    const latest = histories[histories.length - 1];
    const body = JSON.parse(latest.bodyJson);
    expect(body.history.runs.map((run: { runId: string }) => run.runId)).toEqual([
      "run-1",
      "run-2",
    ]);
  });

  it("mirrors both documents when the analysis is cleared", async () => {
    const { repository, mirror, removed } = setup();

    repository.saveSessionAnalysis("sess-1", analysis("run-1"));
    repository.clearSessionAnalysis("sess-1");
    await mirror.drain();

    // Dropping only one would leave the copy claiming a history for an
    // analysis that no longer exists.
    expect(removed).toEqual([
      { kind: "analysis", ownerId: "sess-1" },
      { kind: "analysis_history", ownerId: "sess-1" },
    ]);
  });

  it("leaves every unwrapped method reaching the inner repository", () => {
    const { repository, inner } = setup();

    repository.saveSessionMemoryBody("sess-1", { issues: [], decisions: [], nextActions: [] });

    // Reads are untouched in R2: localStorage stays the source of truth, so
    // the decorator must not shadow a loader.
    expect(inner.loadSessionMemoryBody("sess-1")?.sessionId).toBe("sess-1");
    expect(repository.loadSessionMemoryBody("sess-1")?.sessionId).toBe("sess-1");
  });
});
