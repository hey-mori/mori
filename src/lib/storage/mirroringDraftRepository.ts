/**
 * Wraps a draft repository so its durable writes are mirrored into SQLite.
 *
 * R2 of `docs/design/sqlite-source-of-truth-promotion.md` §7, covering the two
 * heavy classes that have no SQLite path at all today: session memory bodies,
 * and analysis results with their run history.
 *
 * A decorator rather than an edit inside `BrowserDraftRepository`, for two
 * reasons. The browser adapter is also the browser product's whole storage
 * layer, and teaching it about a desktop database would put a runtime branch
 * in the one place that should have none. And a decorator is removable: when
 * R7 retires dual-write, this file goes, and nothing it wrapped was touched.
 *
 * ## What gets mirrored
 *
 * **What the inner repository actually stored**, read back after the write,
 * never the argument that was passed in. `saveSessionAnalysis` also maintains
 * the append-only run history, and reconstructing that here would be a second
 * implementation of a rule that already exists, free to drift from it. Reading
 * it back means the mirror can only ever be a copy.
 *
 * ## Why a proxy and not a spread
 *
 * `{ ...inner, saveSessionMemoryBody }` looks like the obvious wrapper and is
 * wrong: the inner repository is a class instance, so its methods live on the
 * prototype and a spread copies none of them. The result passes the type check
 * and loses every read. A proxy forwards what it does not override, so adding
 * a method to `DraftRepository` later needs no edit here either.
 */
import type { AnalysisResult } from "../analysis";
import type { DocumentMirror } from "./documentMirror";
import type { DraftRepository, StoredSessionAnalysis, StoredSessionMemoryBody } from "./storageTypes";

/** Body schema versions, mirrored from the stored records they wrap. */
const MEMORY_BODY_VERSION = 1;
const ANALYSIS_VERSION = 1;
const ANALYSIS_HISTORY_VERSION = 1;

export function createMirroringDraftRepository(
  inner: DraftRepository,
  mirror: DocumentMirror,
): DraftRepository {
  const overrides: Partial<DraftRepository> = {
    saveSessionMemoryBody(
      sessionId: string,
      body: Omit<StoredSessionMemoryBody, "sessionId" | "savedAt" | "adapter" | "schemaVersion">,
    ): StoredSessionMemoryBody {
      const stored = inner.saveSessionMemoryBody(sessionId, body);
      mirror.write({
        kind: "memory_body",
        ownerId: sessionId,
        schemaVersion: MEMORY_BODY_VERSION,
        body: stored,
        updatedAt: stored.savedAt,
      });
      return stored;
    },

    saveSessionAnalysis(sessionId: string, result: AnalysisResult): StoredSessionAnalysis {
      const stored = inner.saveSessionAnalysis(sessionId, result);
      mirror.write({
        kind: "analysis",
        ownerId: sessionId,
        schemaVersion: ANALYSIS_VERSION,
        body: stored,
        updatedAt: stored.savedAt,
      });
      // Read back rather than rebuilt: the append-versus-update rule for a
      // re-analysis lives in the adapter, and a second copy of it here would
      // be free to disagree.
      const history = inner.loadSessionAnalysisHistory(sessionId);
      if (history) {
        mirror.write({
          kind: "analysis_history",
          ownerId: sessionId,
          schemaVersion: ANALYSIS_HISTORY_VERSION,
          body: history,
          updatedAt: history.savedAt,
        });
      }
      return stored;
    },

    clearSessionMemoryBody(sessionId: string): void {
      inner.clearSessionMemoryBody(sessionId);
      mirror.remove("memory_body", sessionId);
    },

    clearSessionAnalysis(sessionId: string): void {
      inner.clearSessionAnalysis(sessionId);
      // The adapter drops both keys, so the mirror drops both documents. A
      // delete that only reached one of them would leave the SQLite copy
      // claiming a history for an analysis that no longer exists.
      mirror.remove("analysis", sessionId);
      mirror.remove("analysis_history", sessionId);
    },

    clearStoredSession(sessionId: string): void {
      inner.clearStoredSession(sessionId);
      mirror.remove("memory_body", sessionId);
      mirror.remove("analysis", sessionId);
      mirror.remove("analysis_history", sessionId);
    },
  };

  return new Proxy(inner, {
    get(inner_, property, receiver) {
      const override = overrides[property as keyof DraftRepository];
      if (override) return override;
      const value = Reflect.get(inner_, property, receiver);
      // Bound to the instance, not the proxy: an inner method that calls
      // another inner method must not re-enter an override.
      return typeof value === "function" ? value.bind(inner_) : value;
    },
  }) as DraftRepository;
}
