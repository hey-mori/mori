/**
 * Live Intake Buffer · the T1 record shape.
 *
 * One row per request block observed in a followed agent session. This is the
 * tier that makes a project overview survive the live view being closed: the
 * feed itself (T0) is deliberately ephemeral and full-text, and the projection
 * (T2) keeps only current state, so T1 is the only place the shape of the work
 * is durable.
 *
 * Two decisions from `docs/design/live-project-intelligence-execution-plan.md`
 * govern this type:
 *
 * - **D1.** The agent's own JSONL is the durable raw trace and already lives on
 *   the user's disk, so a row may be lossy provided it carries a locator that
 *   re-derives the detail. Rows are `summaryOnly`, never `retained`; message
 *   bodies are dropped on purpose.
 * - **D8.** These rows are a derived index, NOT kernel records. A heavy session
 *   holds hundreds of requests, and putting machine-grained rows in the record
 *   space would swamp a ledger of human-authored notes. Nothing here registers a
 *   schema or enters `kernel_records`.
 */
import type { FileChangeKind } from "../../domain/types";
import type { SessionActivityStatus } from "../../features/live-session/liveFeed";

/**
 * Row shape version.
 *
 * Because T1 is a derived index whose every row is re-derivable from its
 * locator (D1), an incompatible shape change is handled by **dropping and
 * re-deriving**, never by writing migration code. `intakeStore` already reads an
 * unrecognised envelope as empty, so bumping this is the whole migration: the
 * next poll rewrites each followed session from scratch.
 *
 * v2 added `projectPath`, without which rows cannot be folded per project
 * safely.
 */
export const INTAKE_ROW_VERSION = 2 as const;

/**
 * Where the row came from, precisely enough to re-read it. The path plus the
 * follower's byte offset is what makes dropping the message bodies safe, and
 * therefore what makes T1 a reduction rather than a loss.
 */
export type IntakeLocator = {
  /** Absolute path of the agent's session file, as the reader recorded it. */
  path: string;
  /** Byte offset the follower had reached when this row was last observed. */
  offset: number;
};

/** One file a request touched, rolled up across every step that touched it. */
export type IntakeFileChange = {
  path: string;
  changeKind: FileChangeKind;
  additions: number;
  deletions: number;
  /** How many separate tool calls in this request touched the file. */
  touchCount: number;
};

export type IntakeRequestRow = {
  schemaVersion: typeof INTAKE_ROW_VERSION;
  /** Stable across re-observation: `${sessionPath}::${openingMessageId}`. */
  id: string;
  /** The session file path, which is also the follower's identity for it. */
  sessionKey: string;
  /**
   * The project's full path as the reader resolved it (`C:\dev\mori`), which is
   * the only safe key for folding rows into a per-project projection.
   *
   * `sessionLabel` cannot serve: it is the trailing segment, and
   * `projectConnection.ts` is explicit that a basename match must never be
   * auto-grouped, because `/work/api` and `/play/api` are different projects
   * that share a name. Empty when the reader could not resolve one, which the
   * projection must treat as unattributed rather than guess.
   */
  projectPath: string;
  sessionLabel: string;
  /**
   * The request text, capped. Not the full body: a long paste re-reads from the
   * locator rather than living here. See `INTAKE_TITLE_MAX`.
   */
  title: string;
  /** True when the title was capped, so a surface can offer "read the original". */
  titleTruncated: boolean;
  startedAt: string;
  endedAt: string;
  /** Steps in the request after boilerplate was dropped, as the feed counts them. */
  stepCount: number;
  /** Distinct tool names used, in first-use order. */
  tools: string[];
  files: IntakeFileChange[];
  hasError: boolean;
  status: SessionActivityStatus;
  locator: IntakeLocator;
  /** When Mori observed this row, not when the work happened. */
  observedAt: string;
};

/**
 * Title cap. Chosen to hold a normal request in full while keeping a pasted
 * stack trace or file dump out of the index; the locator re-derives the rest.
 */
export const INTAKE_TITLE_MAX = 280;
