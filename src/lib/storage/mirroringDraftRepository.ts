/**
 * Wraps a draft repository so its durable writes are mirrored into SQLite.
 *
 * R2 and R3 of `docs/design/sqlite-source-of-truth-promotion.md` §7: session
 * memory bodies, analysis results with their run history, the per-session
 * drafts that hold the sessions themselves, and `.mori` package drafts.
 *
 * ## What is deliberately not mirrored
 *
 * `mori.currentSessionDraft`, the pointer to the open session. The adapter
 * writes the identical body to it and to the per-session key, so the only
 * thing unique to it is *which* session is open, and that is a device-local
 * selection: a preference by the §0.3 classification, not durable content.
 * Mirroring it would copy the same session twice and make one desktop's choice
 * of open tab into stored data. `setCurrentSession` is left unwrapped for the
 * same reason, since it writes only that pointer.
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
import type { ImportReviewDraft, ReviewDraftMeta } from "../review";
import type {
  DraftRepository,
  StoredMoriPackageDraft,
  StoredPendingReview,
  StoredSessionAnalysis,
  StoredSessionDraft,
  StoredSessionMemoryBody,
} from "./storageTypes";
import type { MoriPackageV0 } from "../mori-package";

/** Body schema versions, mirrored from the stored records they wrap. */
const MEMORY_BODY_VERSION = 1;
const ANALYSIS_VERSION = 1;
const ANALYSIS_HISTORY_VERSION = 1;
const SESSION_DRAFT_VERSION = 1;
const PACKAGE_DRAFT_VERSION = 1;
const PENDING_REVIEW_VERSION = 1;

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

    saveCurrentSessionDraft(
      draft: Omit<StoredSessionDraft, "savedAt" | "adapter">,
    ): StoredSessionDraft {
      const stored = inner.saveCurrentSessionDraft(draft);
      // The per-session record only. The current-session pointer the adapter
      // also writes is a selection, not content, and its body is this same
      // draft.
      mirrorDraft(stored);
      return stored;
    },

    saveStoredSessionMetadata(
      sessionId: string,
      draft: StoredSessionDraft,
    ): StoredSessionDraft | null {
      const stored = inner.saveStoredSessionMetadata(sessionId, draft);
      // Null means no such session, so there is nothing to mirror. A rename of
      // a session that does not exist must not create one in SQLite.
      if (stored) mirrorDraft(stored);
      return stored;
    },

    putStoredSessionDraft(draft: StoredSessionDraft): StoredSessionDraft {
      const stored = inner.putStoredSessionDraft(draft);
      mirrorDraft(stored);
      return stored;
    },

    saveMoriPackageDraft(pkg: MoriPackageV0): StoredMoriPackageDraft {
      const stored = inner.saveMoriPackageDraft(pkg);
      mirror.write({
        kind: "package_draft",
        ownerId: stored.package.manifest.packageId,
        schemaVersion: PACKAGE_DRAFT_VERSION,
        body: stored,
        updatedAt: stored.savedAt,
      });
      return stored;
    },

    savePendingReview(
      sessionId: string,
      draft: ImportReviewDraft,
      meta?: ReviewDraftMeta,
    ): StoredPendingReview {
      const stored = inner.savePendingReview(sessionId, draft, meta);
      mirror.write({
        kind: "pending_review",
        ownerId: sessionId,
        schemaVersion: PENDING_REVIEW_VERSION,
        body: stored,
        updatedAt: stored.savedAt,
      });
      return stored;
    },

    clearPendingReview(sessionId: string): void {
      inner.clearPendingReview(sessionId);
      mirror.remove("pending_review", sessionId);
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
      mirror.remove("session_draft", sessionId);
      mirror.remove("pending_review", sessionId);
    },
  };

  function mirrorDraft(stored: StoredSessionDraft): void {
    mirror.write({
      kind: "session_draft",
      ownerId: stored.session.id,
      schemaVersion: SESSION_DRAFT_VERSION,
      body: stored,
      updatedAt: stored.savedAt,
    });
  }

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
