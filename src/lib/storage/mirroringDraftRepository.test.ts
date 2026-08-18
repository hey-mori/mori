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

  it("mirrors a session draft under the session id, not the pointer", async () => {
    const { repository, mirror, saved } = setup();

    const stored = repository.saveCurrentSessionDraft({
      session: { id: "sess-1", title: "세션", createdAt: "2026-08-18T09:00:00.000Z" },
    } as never);
    await mirror.drain();

    // The adapter writes the same body to the per-session key and to the
    // current-session pointer. Only the first is content; the second is a
    // device-local selection.
    expect(saved.map((row) => `${row.kind} ${row.ownerId}`)).toEqual(["session_draft sess-1"]);
    expect(stored.session.id).toBe("sess-1");
  });

  it("mirrors a background upsert without touching the pointer", async () => {
    const { repository, mirror, saved } = setup();

    repository.putStoredSessionDraft({
      session: { id: "sess-2", title: "배경", createdAt: "2026-08-18T09:00:00.000Z" },
      savedAt: "2026-08-18T09:00:00.000Z",
      adapter: "browser-local-storage",
    } as never);
    await mirror.drain();

    expect(saved.map((row) => row.ownerId)).toEqual(["sess-2"]);
  });

  // Renaming a session that does not exist returns null. Mirroring anyway
  // would create in SQLite a session localStorage does not have, which is the
  // wrong direction for a copy.
  it("does not mirror a metadata edit that found no session", async () => {
    const { repository, mirror, saved } = setup();

    const result = repository.saveStoredSessionMetadata("missing", {
      session: { id: "missing", title: "없음", createdAt: "2026-08-18T09:00:00.000Z" },
      savedAt: "2026-08-18T09:00:00.000Z",
      adapter: "browser-local-storage",
    } as never);
    await mirror.drain();

    expect(result).toBeNull();
    expect(saved).toEqual([]);
  });

  it("drops the session draft and its pending review when the session is cleared", async () => {
    const { repository, mirror, removed } = setup();

    repository.clearStoredSession("sess-1");
    await mirror.drain();

    expect(removed.map((entry) => entry.kind).sort()).toEqual([
      "analysis",
      "analysis_history",
      "memory_body",
      "pending_review",
      "session_draft",
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
