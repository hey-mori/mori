/**
 * Note nature · what KIND of note this is (기록 v7 §6).
 *
 * The user never picks the nature: there is no chip, no `<select>`. Nature is
 * inferred, and its only expression is which outputs 읽기 offers, so a wrong
 * guess costs a glance at an irrelevant region, never a hidden truth.
 *
 * This module is the free STRUCTURAL floor, and it claims nothing else. Every
 * topical keyword is deliberately gone: `공부|학습|복습|배웠…` read "오늘 운동을
 * 했다 / 공부도 했다" as a 학습 노트, and the same instinct pointed at a Kotlin
 * article produced four invented 활동 records. A word list cannot tell a journal
 * that mentions studying from a study note, and tuning it only moves the error
 * rate, never the error. What survives are the two signals that are structural
 * rather than topical, and therefore actually correct: a note that is mostly
 * links IS a 스크랩, and a note with a roster and an agenda IS a 회의록.
 *
 * Nuanced nature (일지 vs 에세이 vs 학습 노트) belongs to the engine that has
 * actually read the document.
 */
import { stripInlineMarkdown } from "./noteWorkspace";

export type NoteNature =
  | "journal"
  | "meeting"
  | "retro"
  | "study"
  | "essay"
  | "clipping";

export const NOTE_NATURE_LABEL: Record<NoteNature, string> = {
  journal: "일지",
  meeting: "회의록",
  retro: "회고",
  study: "학습 노트",
  essay: "에세이",
  clipping: "스크랩",
};

const MEETING_RE = /참석자|안건|아젠다|회의록|액션\s*아이템|attendees|agenda|minutes/i;
// Person-shaped attendee lines: at least two of them, so a single "장보기: 계란"
// shopping line cannot pass as a meeting roster.
const ATTENDEE_LINE_RE = /(^\s*[-*+]?\s*[^\s:]{1,10}:\s*\S.*\n){2,}/m;
const URL_RE = /https?:\/\/\S+/g;

/**
 * The nature this note's STRUCTURE proves, or null when the structure proves
 * nothing, which is the common case and an honest answer. Null means "ask the
 * engine", never "assume 일지": defaulting would let a free guess overrule a
 * reader that actually read the text.
 */
export function detectNoteNature(body: string): { nature: NoteNature; confidence: number } | null {
  const text = stripInlineMarkdown(body);
  if (text.replace(/\s/g, "").length < 12) return null;

  const urls = text.match(URL_RE) ?? [];
  const nonUrlChars = text.replace(URL_RE, "").replace(/\s/g, "").length;
  // 스크랩: the link is the point (several links, or one link with little prose).
  if (urls.length >= 1 && (urls.length >= 2 || nonUrlChars < 400)) {
    return { nature: "clipping", confidence: urls.length >= 2 ? 0.75 : 0.6 };
  }

  if (MEETING_RE.test(text) || ATTENDEE_LINE_RE.test(text)) {
    return { nature: "meeting", confidence: 0.65 };
  }

  return null;
}
