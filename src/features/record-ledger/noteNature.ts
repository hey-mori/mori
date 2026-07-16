/**
 * Note nature (기록 v5 · N1) · what KIND of note this is, before deciding what
 * to extract from it. A note is not always a task list — it may be an essay, a
 * meeting record, or a clipped article — so Mori guesses the nature and lets
 * the nature gate which extractions read as signal vs noise. Deterministic
 * floor; a wrong guess is one tap to correct and (later) teaches Mori.
 */
import { stripInlineMarkdown } from "./noteWorkspace";

export type NoteNature =
  | "journal"
  | "meeting"
  | "retro"
  | "study"
  | "essay"
  | "clipping";

export const NOTE_NATURES: readonly NoteNature[] = [
  "journal",
  "meeting",
  "retro",
  "study",
  "essay",
  "clipping",
] as const;

export const NOTE_NATURE_LABEL: Record<NoteNature, string> = {
  journal: "일지",
  meeting: "회의록",
  retro: "회고",
  study: "학습 노트",
  essay: "에세이",
  clipping: "스크랩",
};

/**
 * The extraction schema ids that fit each nature (shown expanded in the panel).
 * Extractions outside the set fold under a disclosure rather than vanish, so an
 * essay does not spam 할 일 rows while nothing is ever silently dropped.
 * `"all"` means every extraction fits (a daily log carries anything).
 */
export const NATURE_FIT_KINDS: Record<NoteNature, ReadonlySet<string> | "all"> = {
  journal: "all",
  meeting: new Set(["decision", "task", "activity", "event"]),
  retro: new Set(["insight", "decision", "task"]),
  study: new Set(["study-session", "knowledge", "insight"]),
  essay: new Set(["insight"]),
  clipping: new Set(["source-document", "knowledge", "insight"]),
};

export function natureFits(nature: NoteNature, schemaId: string): boolean {
  const fit = NATURE_FIT_KINDS[nature];
  return fit === "all" || fit.has(schemaId);
}

const MEETING_RE = /참석|안건|아젠다|회의록|회의\s|액션\s*아이템|attendees|agenda|minutes/i;
const ATTENDEE_LINE_RE = /^\s*[-*+]?\s*[^\n:]{1,14}:\s*\S/m;
const RETRO_RE = /회고|kpt|잘한\s?점|아쉬운\s?점|배운\s?점|다음엔|keep|problem|try|retrospective/i;
const STUDY_RE = /공부|학습|복습|예습|개념|요약|정리했|배웠|강의|인강|튜토리얼|문서를\s*읽/;
const URL_RE = /https?:\/\/\S+/g;

/**
 * Guess the note's nature from its text. Order encodes priority: a strong
 * structural signal (URL-dominant clipping, attendee/agenda meeting) beats a
 * softer topical one. Confidence is qualitative; the chip stays correctable.
 */
export function detectNoteNature(body: string): { nature: NoteNature; confidence: number } {
  const text = stripInlineMarkdown(body);
  const chars = text.replace(/\s/g, "").length;
  if (chars < 12) return { nature: "journal", confidence: 0.3 };

  const urls = text.match(URL_RE) ?? [];
  const nonUrlChars = text.replace(URL_RE, "").replace(/\s/g, "").length;
  // Clipping: a link is the point (several links, or a link with little prose).
  if (urls.length >= 1 && (urls.length >= 2 || nonUrlChars < 400)) {
    return { nature: "clipping", confidence: urls.length >= 2 ? 0.75 : 0.6 };
  }

  if (MEETING_RE.test(text) || ATTENDEE_LINE_RE.test(text)) {
    return { nature: "meeting", confidence: 0.65 };
  }
  if (RETRO_RE.test(text)) return { nature: "retro", confidence: 0.6 };
  if (STUDY_RE.test(text)) return { nature: "study", confidence: 0.55 };

  // Essay vs a prose daily log is not reliably separable by rule (both are
  // continuous prose), and mis-reading a journal as an essay would wrongly
  // suppress its 운동/할 일 extractions. So the deterministic floor only claims
  // the structurally-clear natures above and defaults to journal; the user can
  // still set 에세이 by hand on the chip when they want prose treatment. The
  // LLM engine (v5 §3) takes over nuanced nature later.
  return { nature: "journal", confidence: 0.4 };
}
