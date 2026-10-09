/**
 * Search inside an open long transcript · transient UI state.
 *
 * The native search (`search_claude_code_session`) reads the session's source
 * file backward from its end in bounded steps and returns the messages whose
 * visible text contains the phrase, newest first. This module holds what those
 * steps found for the open session view and says honestly how much of the
 * transcript has been searched.
 *
 * Nothing here is stored: no query history, no copy of the text, no index. It
 * belongs to one open of one session (`sessionId` + `openToken`) and is
 * dropped when another session opens. A result is a pointer into the source
 * (`recordEnd` + `recordAnchor`), checked again when it is opened.
 */
import type { ClaudeCodeSearchBatch, ClaudeCodeSearchHit } from "../claude/types";
import type { SessionWindowError } from "./sessionWindow";

/** Matches one "찾기" or "더 찾기" gathers before it stops. */
export const SEARCH_PAGE_HITS = 20;
/** Matches held at most; past this the user is asked to narrow the phrase. */
export const SEARCH_MAX_HELD_HITS = 200;
/** The longest phrase the native search accepts (Rust `SEARCH_QUERY_MAX_CHARS`). */
export const SEARCH_QUERY_MAX_CHARS = 200;

export type SessionSearchStatus =
  /** Steps are running. */
  | "searching"
  /** Stopped with what it found: complete when `reachedStart`, else partial. */
  | "idle"
  /** Stopped by the user before it finished. */
  | "cancelled"
  /** The transcript was replaced or rewritten since the search began. */
  | "changed"
  /** The transcript is gone or unreadable. */
  | "missing"
  | "error";

export type SessionSearchState = {
  sessionId: string;
  openToken: number;
  sourcePath: string;
  query: string;
  /** Whole words (the default) or any substring ("부분 일치"). */
  wholeWords: boolean;
  status: SessionSearchStatus;
  /** Set by the first step; every later step and every jump must match it. */
  sourceId: string | null;
  fileBytes: number;
  /** The end of the range searched: the transcript's end when the search began. */
  scanEnd: number | null;
  /** Where the next step continues (the earliest byte searched so far). */
  cursor: { beforeOffset: number; anchor: string } | null;
  reachedStart: boolean;
  hits: ClaudeCodeSearchHit[];
  unsearchableRecords: number;
  unsearchableBytes: number;
  error: SessionWindowError | null;
  /** The result being opened, and a failure to open one. */
  opening: string | null;
  openError: { messageId: string; error: SessionWindowError } | null;
};

export function startedSearch(input: {
  sessionId: string;
  openToken: number;
  sourcePath: string;
  query: string;
  wholeWords: boolean;
}): SessionSearchState {
  return {
    ...input,
    status: "searching",
    sourceId: null,
    fileBytes: 0,
    scanEnd: null,
    cursor: null,
    reachedStart: false,
    hits: [],
    unsearchableRecords: 0,
    unsearchableBytes: 0,
    error: null,
    opening: null,
    openError: null,
  };
}

/** A query the native search would accept: trimmed, non-empty, bounded. */
export function normalizeQuery(query: string): string | null {
  const trimmed = query.trim();
  if (!trimmed || [...trimmed].length > SEARCH_QUERY_MAX_CHARS) return null;
  return trimmed;
}

/**
 * Fold one step into the state. A step must continue this search: same
 * source, and it must end exactly where the last one stopped. Anything else is
 * a stale or foreign reply and leaves the state alone. Ids already held are
 * not added twice.
 */
export function applySearchBatch(state: SessionSearchState, batch: ClaudeCodeSearchBatch): SessionSearchState {
  if (state.sourceId !== null && batch.sourceId !== state.sourceId) return state;
  if (state.cursor && batch.scanEnd !== state.cursor.beforeOffset) return state;
  if (!state.cursor && state.scanEnd !== null) return state;
  const held = new Set(state.hits.map((hit) => `${hit.recordStart}:${hit.messageId}`));
  const fresh = batch.hits.filter((hit) => !held.has(`${hit.recordStart}:${hit.messageId}`));
  return {
    ...state,
    sourceId: batch.sourceId,
    fileBytes: batch.fileBytes,
    scanEnd: state.scanEnd ?? batch.scanEnd,
    cursor: batch.reachedStart ? null : { beforeOffset: batch.scanStart, anchor: batch.scanStartAnchor },
    reachedStart: batch.reachedStart,
    hits: [...state.hits, ...fresh].slice(0, SEARCH_MAX_HELD_HITS),
    unsearchableRecords: state.unsearchableRecords + batch.unsearchableRecords,
    unsearchableBytes: state.unsearchableBytes + batch.unsearchableBytes,
  };
}

/** Has this search gathered what one page asks for, or everything there is? */
export function searchPageDone(state: SessionSearchState, target: number): boolean {
  return state.reachedStart || state.hits.length >= Math.min(target, SEARCH_MAX_HELD_HITS);
}

/** Can "더 찾기" continue? */
export function canSearchMore(state: SessionSearchState): boolean {
  return (
    !state.reachedStart &&
    state.cursor !== null &&
    state.hits.length < SEARCH_MAX_HELD_HITS &&
    (state.status === "idle" || state.status === "cancelled")
  );
}

/** How much of the transcript (as it stood when the search began) has been
 *  searched, from the end back. "전체" only when the start was reached. */
export function searchedShareLabel(state: SessionSearchState): string {
  if (state.reachedStart) return "원본 전체";
  if (state.scanEnd === null || !(state.scanEnd > 0) || !state.cursor) return "원본의 0%";
  const percent = ((state.scanEnd - state.cursor.beforeOffset) / state.scanEnd) * 100;
  if (percent < 1) return "최근 1% 미만";
  return `최근 약 ${Math.min(99, Math.floor(percent))}%`;
}

/**
 * The one-line status the search panel shows. A partial search never says
 * "없음" as if the whole transcript was searched, and a count is only called
 * complete when the start was reached.
 */
export function searchStatusLine(state: SessionSearchState): string {
  const share = searchedShareLabel(state);
  const found = state.hits.length;
  switch (state.status) {
    case "searching":
      return found > 0 ? `찾는 중… ${share}에서 ${found}개` : `찾는 중… ${share} 확인`;
    case "changed":
      return "원본 대화가 바뀌어 검색을 이어갈 수 없습니다";
    case "missing":
      return "원본 대화를 찾을 수 없습니다";
    case "error":
      return "검색하지 못했습니다";
    case "cancelled":
      return `검색을 멈췄습니다 · ${share}에서 ${found}개`;
    case "idle":
      if (state.reachedStart) {
        // Searched to the start, but a record the viewer cannot show was not
        // searched: say "readable", never "whole".
        if (state.unsearchableRecords > 0) {
          const skipped = `너무 큰 기록 ${state.unsearchableRecords}개는 찾지 못했습니다`;
          return found > 0 ? `읽을 수 있는 원본에서 ${found}개 메시지 · ${skipped}` : `읽을 수 있는 원본에서 찾지 못했습니다 · ${skipped}`;
        }
        return found > 0 ? `원본 전체에서 ${found}개 메시지` : "원본 전체에서 찾지 못했습니다";
      }
      if (found >= SEARCH_MAX_HELD_HITS) return `${SEARCH_MAX_HELD_HITS}개까지만 보여 줍니다 · 더 구체적으로 찾아 보세요`;
      return found > 0 ? `${share}에서 ${found}개 메시지 · 이전 부분은 아직 찾지 않았습니다` : `${share}에서 찾지 못했습니다`;
  }
}

/** ASCII letters, digits and `_` continue a word (Rust `is_word_char`).
 *  Hangul and other scripts never form a boundary: a Korean particle attaches
 *  to its noun. */
const isWordChar = (char: string | undefined) => char !== undefined && /[A-Za-z0-9_]/.test(char);

/**
 * Where `query` occurs in `text`, ignoring case, as [start, end) indices.
 * With `wholeWords`, an occurrence is skipped when its first character is a
 * word character preceded by one, or its last a word character followed by
 * one, the same rule the native search applies (`find_matches`). Null when
 * lowercasing changes the text's length (rare scripts), so positions cannot be
 * mapped back.
 */
export function findPhrase(text: string, query: string, wholeWords: boolean): [number, number][] | null {
  const lowered = text.toLocaleLowerCase();
  const needle = query.toLocaleLowerCase();
  if (!needle) return [];
  if (lowered.length !== text.length) return null;
  const firstWord = isWordChar(needle[0]);
  const lastWord = isWordChar(needle[needle.length - 1]);
  const found: [number, number][] = [];
  let from = 0;
  for (let at = lowered.indexOf(needle); at !== -1; at = lowered.indexOf(needle, from)) {
    const end = at + needle.length;
    const bounded =
      !wholeWords || ((!firstWord || !isWordChar(text[at - 1])) && (!lastWord || !isWordChar(text[end])));
    if (bounded) {
      found.push([at, end]);
      from = end;
    } else {
      from = at + 1;
    }
  }
  return found;
}

/**
 * Does `text` contain `query` under the search's matching rule? Used to
 * confirm, after a result is opened, that the message shown still holds the
 * phrase. Where positions cannot be mapped, plain containment decides, so a
 * match the native search found is never refused for a script quirk.
 */
export function containsPhrase(text: string, query: string, wholeWords = false): boolean {
  const found = findPhrase(text, query, wholeWords);
  return found === null ? text.toLocaleLowerCase().includes(query.toLocaleLowerCase()) : found.length > 0;
}

/**
 * `text` split into plain and matching parts for marking the phrase, under the
 * search's matching rule. Nothing is marked when positions cannot be mapped,
 * rather than the wrong span.
 */
export function splitOnPhrase(text: string, query: string, wholeWords = false): { text: string; match: boolean }[] {
  const found = findPhrase(text, query, wholeWords);
  if (!found || found.length === 0) return [{ text, match: false }];
  const parts: { text: string; match: boolean }[] = [];
  let from = 0;
  for (const [start, end] of found) {
    if (start > from) parts.push({ text: text.slice(from, start), match: false });
    parts.push({ text: text.slice(start, end), match: true });
    from = end;
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false });
  return parts;
}
