/**
 * Session source window · a read-only view of part of a long transcript.
 *
 * A Claude Code transcript larger than the detailed reader's cap cannot be
 * imported whole. Rather than open it empty, Mori reads it from the end in
 * bounded windows (`get_claude_code_session_window`) and shows the recent
 * conversation, with earlier history one request away.
 *
 * The window is transient UI state. It is never imported, never written to
 * the session's stored draft, and never fed to analysis or a report: those
 * would present a part of the session as the whole. Every count here is the
 * loaded part's own.
 */
import type { ClaudeCodeSessionWindow, ClaudeMessage } from "../claude/types";

/** Above this the detailed reader refuses the file (Rust `MAX_FILE_BYTES`). */
export const DETAIL_READ_LIMIT_BYTES = 8 * 1024 * 1024;

/** Windows read back automatically when a window holds nothing to show (a tail
 *  of metadata records). Bounded so a pathological file cannot read forever. */
export const MAX_EMPTY_WINDOW_SKIPS = 4;

export type SessionWindowErrorKind =
  /** The transcript file is gone or cannot be opened. */
  | "missing"
  /** The transcript was replaced or rewritten since its first window. */
  | "changed"
  /** The desktop reader is not available (browser build). */
  | "unavailable"
  /** The reader refused the path (outside the source root, not JSONL). */
  | "refused"
  /** Over the detailed reader's cap, for an agent with no window reader yet. */
  | "tooLarge"
  | "error";

export type SessionWindowError = { kind: SessionWindowErrorKind; message: string };

export type SessionWindowState =
  | { sessionId: string; status: "loading" }
  /** The transcript could not be read at all: say so, never show it empty. */
  | { sessionId: string; status: "error"; error: SessionWindowError }
  | {
      sessionId: string;
      /** `full` once the loaded windows reach the transcript's start. */
      status: "partial" | "full";
      sourcePath: string;
      sourceId: string;
      fileBytes: number;
      /** Bytes covered by the loaded windows, from `startOffset` to the end. */
      loadedBytes: number;
      startOffset: number;
      startAnchor: string;
      events: ClaudeMessage[];
      omittedRecords: number;
      omittedBytes: number;
      loadingEarlier: boolean;
      earlierError: SessionWindowError | null;
    };

export type LoadedSessionWindow = Extract<SessionWindowState, { status: "partial" | "full" }>;

export function isLoadedWindow(state: SessionWindowState | null): state is LoadedSessionWindow {
  return state?.status === "partial" || state?.status === "full";
}

/** Should this session open through bounded windows instead of a whole import? */
export function needsWindowedRead(importKind: string, fileBytes: number | undefined): boolean {
  return importKind === "claude-code" && (fileBytes ?? 0) > DETAIL_READ_LIMIT_BYTES;
}

/** The detailed reader's own refusal for an oversized file. */
export function isTooLargeError(error: unknown): boolean {
  return /too large/i.test(errorMessage(error));
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : String(error);
}

/** Map a reader error to the state the UI can explain. Prefixes come from the
 *  Rust reader (`SOURCE_MISSING:`, `SOURCE_CHANGED:`, `INVALID_CURSOR:`). */
export function classifyWindowError(error: unknown): SessionWindowError {
  const message = errorMessage(error);
  if (error instanceof Error && error.name === "ClaudeBridgeUnavailableError") {
    return { kind: "unavailable", message };
  }
  if (
    message.startsWith("SOURCE_MISSING") ||
    message.startsWith("SOURCE_UNREADABLE") ||
    /Failed to (resolve|stat|open)|No such file/i.test(message)
  ) {
    return { kind: "missing", message };
  }
  if (message.startsWith("SOURCE_CHANGED") || message.startsWith("INVALID_CURSOR")) {
    return { kind: "changed", message };
  }
  if (message.startsWith("Refused")) return { kind: "refused", message };
  if (isTooLargeError(error)) return { kind: "tooLarge", message };
  return { kind: "error", message };
}

/** The first loaded window, as the latest part of the transcript. */
export function windowStateFrom(sessionId: string, window: ClaudeCodeSessionWindow): LoadedSessionWindow {
  return {
    sessionId,
    status: window.reachedStart ? "full" : "partial",
    sourcePath: window.filePath,
    sourceId: window.sourceId,
    fileBytes: window.fileBytes,
    loadedBytes: window.endOffset - window.startOffset,
    startOffset: window.startOffset,
    startAnchor: window.startAnchor,
    events: window.events,
    omittedRecords: window.omittedRecords,
    omittedBytes: window.omittedBytes,
    loadingEarlier: false,
    earlierError: null,
  };
}

/**
 * Prepend an earlier window. It must end exactly where the loaded part begins;
 * anything else is a stale reply (a second click, a reopened session) and is
 * ignored rather than spliced in at the wrong place. Ids already shown are
 * dropped, so no record appears twice.
 */
export function prependEarlierWindow(
  state: LoadedSessionWindow,
  window: ClaudeCodeSessionWindow,
): LoadedSessionWindow {
  if (window.sourceId !== state.sourceId || window.endOffset !== state.startOffset) return state;
  const shown = new Set(state.events.map((event) => event.id));
  const earlier = window.events.filter((event) => !shown.has(event.id));
  return {
    ...state,
    status: window.reachedStart ? "full" : "partial",
    loadedBytes: state.loadedBytes + (window.endOffset - window.startOffset),
    startOffset: window.startOffset,
    startAnchor: window.startAnchor,
    events: [...earlier, ...state.events],
    omittedRecords: state.omittedRecords + window.omittedRecords,
    omittedBytes: state.omittedBytes + window.omittedBytes,
    loadingEarlier: false,
    earlierError: null,
  };
}

/**
 * How much of the transcript the loaded windows cover, as the coverage line
 * says it. A partial view never reads as 100%, and a small but real part never
 * reads as 0%: under one percent is "1% 미만". Null when the size is unknown,
 * so nothing is claimed.
 */
export function coverageLabel(state: Pick<LoadedSessionWindow, "status" | "loadedBytes" | "fileBytes">): string | null {
  if (state.status === "full") return "원본 전체";
  if (!(state.fileBytes > 0)) return null;
  if (state.loadedBytes <= 0) return "원본의 0%";
  const percent = (state.loadedBytes / state.fileBytes) * 100;
  if (percent < 1) return "원본의 1% 미만";
  return `원본의 약 ${Math.min(99, Math.floor(percent))}%`;
}
