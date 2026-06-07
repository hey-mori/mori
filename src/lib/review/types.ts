import type {
  Decision,
  Issue,
  NextAction,
  SourceRef,
  TimelineEvent,
} from "../../domain/types";
import type { ConnectorSourceImportSummary } from "../connectors";
import type { NormalizedImportCandidate } from "../import";

/**
 * Per-item review status. The Import Review screen flips items between these
 * states; only `accepted` items end up being applied to the session.
 */
export type ReviewItemStatus = "pending" | "accepted" | "discarded";

/**
 * Optional inline edits the user makes during review. The originals on the
 * underlying TimelineEvent / Issue / Decision remain untouched so the apply
 * step can record both the original normalizer output and the user override.
 */
export type ReviewEventEdits = {
  title?: string;
  summary?: string;
  type?: TimelineEvent["type"];
  correctionNote?: string;
};

export type ReviewItemEdits = {
  title?: string;
  summary?: string;
  correctionNote?: string;
};

export type ReviewEventItem = {
  /** Stable id (mirrors the event id so the store can patch by id). */
  id: string;
  event: TimelineEvent;
  status: ReviewItemStatus;
  edits?: ReviewEventEdits;
};

export type ReviewIssueItem = {
  id: string;
  issue: Issue;
  status: ReviewItemStatus;
  edits?: ReviewItemEdits;
};

export type ReviewDecisionItem = {
  id: string;
  decision: Decision;
  status: ReviewItemStatus;
  edits?: ReviewItemEdits;
};

export type ReviewNextActionItem = {
  id: string;
  nextAction: NextAction;
  status: ReviewItemStatus;
  edits?: ReviewItemEdits;
};

/**
 * Single in-flight import review. There is only one draft at a time today
 * (single-source paste flow); the model is shaped so a future "queue" of
 * pending reviews is a small extension, not a rewrite.
 */
export type ImportReviewDraft = {
  id: string;
  /** The normalized source that produced this draft. Kept verbatim so the
   *  left-side summary panel can render even after every item is discarded. */
  source: SourceRef;
  events: ReviewEventItem[];
  issues: ReviewIssueItem[];
  decisions: ReviewDecisionItem[];
  nextActions: ReviewNextActionItem[];
  /** The original candidate emitted by the normalizer. Used to reconstruct
   *  a filtered NormalizedImportCandidate on Apply. */
  candidate: NormalizedImportCandidate;
  createdAt: string;
  /** Tag describing where this draft came from (e.g. "ai-transcript", "git-diff"). */
  origin: ReviewOrigin;
};

export type ReviewOrigin =
  | "ai-transcript"
  | "git-diff"
  | "manual-note"
  | "url"
  | "connector-jsonl"
  | "other";

export type ReviewCounts = {
  pending: number;
  accepted: number;
  discarded: number;
  total: number;
};

/**
 * Optional meta the import boundary passes alongside a review draft so the
 * review surface can show "Skipped N duplicates" and re-import context next to
 * the source title. Today only the connector path produces non-zero values;
 * other import kinds pass nothing. Lives here (not in the store) so the storage
 * layer can persist it without an upward dependency on the app store.
 */
export type ReviewDraftMeta = {
  newEventCount?: number;
  duplicateSkippedCount?: number;
  duplicateIncludedCount?: number;
  invalidLineCount?: number;
  includeDuplicates?: boolean;
  /**
   * Split of the duplicate count across detection sources so the Import
   * Review meta strip can show "Saved-session N" alongside the legacy
   * "Skipped duplicates" cell. Filled by the cross-session preview path.
   */
  currentSessionDuplicateCount?: number;
  savedSessionDuplicateCount?: number;
  inBatchDuplicateCount?: number;
  /**
   * False when the preview ran without saved-session history (browser
   * fallback). The meta strip uses this to render an honesty note instead
   * of pretending cross-session detection happened.
   */
  savedSessionHistoryAvailable?: boolean;
  /**
   * Source-level re-import summary derived from the preview. The Import
   * Review meta strip renders this as a single status line ("Partial
   * re-import · 3 new / 8 already imported") so the user understands
   * what's about to be applied without re-deriving counts.
   */
  sourceImportSummary?: ConnectorSourceImportSummary;
};

export type ReviewItemKind = "event" | "issue" | "decision" | "nextAction";
