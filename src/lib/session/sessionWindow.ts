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
 *
 * The view holds at most `MAX_RETAINED_WINDOWS` contiguous windows. Reading
 * further back lets the newest one go and remembers its cursor; "다음 대화
 * 보기" reads it back exactly (the record before a cursor never changes as the
 * transcript grows), letting the oldest go. So reading any distance back costs
 * a bounded amount of memory and DOM, and nothing read is unreachable.
 */
import type { ClaudeCodeSessionWindow, ClaudeMessage } from "../claude/types";

/** Above this the detailed reader refuses the file (Rust `MAX_FILE_BYTES`). */
export const DETAIL_READ_LIMIT_BYTES = 8 * 1024 * 1024;

/** Windows read back automatically when a window holds nothing to show (a tail
 *  of metadata records). Bounded so a pathological file cannot read forever. */
export const MAX_EMPTY_WINDOW_SKIPS = 4;

/** Windows the view keeps at once. Measured on a 143 MB transcript in the
 *  release build, each loaded window added about 15 MB to the web process
 *  while holding 115–325 messages; four keeps a long read near the cost of
 *  opening, and is enough context to read across a window boundary. */
export const MAX_RETAINED_WINDOWS = 4;

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

/** One window the view holds: its source range and how many of the view's
 *  events it contributed (after dropping ids already shown). */
export type WindowSpan = {
  startOffset: number;
  endOffset: number;
  startAnchor: string;
  endAnchor: string;
  count: number;
  omittedRecords: number;
  omittedBytes: number;
};

/** A newer window the view let go of: its cursor, to read it back exactly. */
export type ReleasedSpan = { startOffset: number; endOffset: number; endAnchor: string };

export type SessionWindowState =
  | { sessionId: string; status: "loading" }
  /** The transcript could not be read at all: say so, never show it empty. */
  | { sessionId: string; status: "error"; error: SessionWindowError }
  | {
      sessionId: string;
      /** Which open this view belongs to. A page requested for an earlier open
       *  of the same session is never applied to this one. */
      openToken: number;
      /** `full` when the view holds the transcript from its start to the end it
       *  was opened at, with nothing let go of. */
      status: "partial" | "full";
      sourcePath: string;
      sourceId: string;
      fileBytes: number;
      /** Oldest first, contiguous, at most `MAX_RETAINED_WINDOWS`. */
      spans: WindowSpan[];
      /** Newer windows let go of, the next one last. Empty: the view reaches
       *  the end the transcript had when it was opened. */
      released: ReleasedSpan[];
      /** Bytes the held windows cover. */
      loadedBytes: number;
      /** The held part's start (the earlier-page cursor). */
      startOffset: number;
      startAnchor: string;
      events: ClaudeMessage[];
      omittedRecords: number;
      omittedBytes: number;
      /** A page request in flight, and which way. */
      paging: "earlier" | "newer" | "latest" | null;
      pageError: { direction: "earlier" | "newer" | "latest"; error: SessionWindowError } | null;
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

function spanOf(window: ClaudeCodeSessionWindow, count: number): WindowSpan {
  return {
    startOffset: window.startOffset,
    endOffset: window.endOffset,
    startAnchor: window.startAnchor,
    endAnchor: window.endAnchor,
    count,
    omittedRecords: window.omittedRecords,
    omittedBytes: window.omittedBytes,
  };
}

/** Recompute everything derived from the held spans. */
function withSpans(
  state: LoadedSessionWindow,
  spans: WindowSpan[],
  released: ReleasedSpan[],
  events: ClaudeMessage[],
): LoadedSessionWindow {
  const first = spans[0]!;
  return {
    ...state,
    spans,
    released,
    events,
    status: first.startOffset === 0 && released.length === 0 ? "full" : "partial",
    startOffset: first.startOffset,
    startAnchor: first.startAnchor,
    loadedBytes: spans.reduce((sum, span) => sum + (span.endOffset - span.startOffset), 0),
    omittedRecords: spans.reduce((sum, span) => sum + span.omittedRecords, 0),
    omittedBytes: spans.reduce((sum, span) => sum + span.omittedBytes, 0),
    paging: null,
    pageError: null,
  };
}

/** The first loaded window, as the latest part of the transcript. */
export function windowStateFrom(sessionId: string, window: ClaudeCodeSessionWindow, openToken = 0): LoadedSessionWindow {
  const base: LoadedSessionWindow = {
    sessionId,
    openToken,
    status: "partial",
    sourcePath: window.filePath,
    sourceId: window.sourceId,
    fileBytes: window.fileBytes,
    spans: [],
    released: [],
    loadedBytes: 0,
    startOffset: window.startOffset,
    startAnchor: window.startAnchor,
    events: [],
    omittedRecords: 0,
    omittedBytes: 0,
    paging: null,
    pageError: null,
  };
  return withSpans(base, [spanOf(window, window.events.length)], [], window.events);
}

/** The end of the held part: where a newer window must start. */
export function heldEnd(state: LoadedSessionWindow): number {
  return state.spans[state.spans.length - 1]!.endOffset;
}

/**
 * Prepend an earlier window. It must end exactly where the held part begins;
 * anything else is a stale reply (a second click, a reopened session) and is
 * ignored rather than spliced in at the wrong place. Ids already shown are
 * dropped, so no record appears twice. Past `MAX_RETAINED_WINDOWS` the newest
 * window is let go of, and its cursor kept.
 */
export function prependEarlierWindow(
  state: LoadedSessionWindow,
  window: ClaudeCodeSessionWindow,
  maxWindows = MAX_RETAINED_WINDOWS,
): LoadedSessionWindow {
  if (window.sourceId !== state.sourceId || window.endOffset !== state.startOffset) return state;
  const shown = new Set(state.events.map((event) => event.id));
  const earlier = window.events.filter((event) => !shown.has(event.id));
  let spans = [spanOf(window, earlier.length), ...state.spans];
  let events = [...earlier, ...state.events];
  const released = [...state.released];
  while (spans.length > maxWindows) {
    const newest = spans[spans.length - 1]!;
    released.push({ startOffset: newest.startOffset, endOffset: newest.endOffset, endAnchor: newest.endAnchor });
    events = events.slice(0, events.length - newest.count);
    spans = spans.slice(0, -1);
  }
  return withSpans(state, spans, released, events);
}

/**
 * Append the newer window the view let go of last. It must be exactly that
 * window (same range) and continue the held part; anything else is ignored.
 * Past `MAX_RETAINED_WINDOWS` the oldest window is let go of; it stays one
 * "이전 대화 더 보기" away.
 */
export function appendNewerWindow(
  state: LoadedSessionWindow,
  window: ClaudeCodeSessionWindow,
  maxWindows = MAX_RETAINED_WINDOWS,
): LoadedSessionWindow {
  const next = state.released[state.released.length - 1];
  if (
    !next ||
    window.sourceId !== state.sourceId ||
    window.startOffset !== heldEnd(state) ||
    window.endOffset !== next.endOffset
  ) {
    return state;
  }
  const shown = new Set(state.events.map((event) => event.id));
  const newer = window.events.filter((event) => !shown.has(event.id));
  let spans = [...state.spans, spanOf(window, newer.length)];
  let events = [...state.events, ...newer];
  while (spans.length > maxWindows) {
    const oldest = spans[0]!;
    events = events.slice(oldest.count);
    spans = spans.slice(1);
  }
  return withSpans(state, spans, state.released.slice(0, -1), events);
}

/** The cursor for the window before the held part. */
export function earlierCursor(state: LoadedSessionWindow) {
  return { beforeOffset: state.startOffset, sourceId: state.sourceId, anchor: state.startAnchor };
}

/** The cursor that reads back the newer window let go of last, or null. */
export function newerCursor(state: LoadedSessionWindow) {
  const next = state.released[state.released.length - 1];
  return next ? { beforeOffset: next.endOffset, sourceId: state.sourceId, endAnchor: next.endAnchor } : null;
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
