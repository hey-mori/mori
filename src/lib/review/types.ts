import type {
  Decision,
  Issue,
  NextAction,
  SourceRef,
  TimelineEvent,
} from "../../domain/types";
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

export type ReviewItemKind = "event" | "issue" | "decision" | "nextAction";
