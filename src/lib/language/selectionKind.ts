/**
 * Selection shape · WHAT SIZE of language the user picked.
 *
 * The fourth thing the loop separates, after capture (where), action (what the
 * user wants), and provider (who answers). It exists because one fixed answer
 * shape is wrong at both ends: a double-clicked word does not need a clause-by
 * -clause structure breakdown, and a paragraph does not need an IPA transcription.
 *
 * Rules this file exists to enforce:
 *  - Shape NEVER changes the user's action. `understand` stays `understand`;
 *    only which sections are asked for moves. Detection proposes, the user decides.
 *  - Classification is script-aware. A Korean sentence has no spaces between
 *    every word and a Chinese one may have none at all, so a pure
 *    `split(" ").length` heuristic would call them all "word".
 *  - Coarse on purpose. The cost of a wrong guess is a slightly off section list,
 *    so the boundaries are readable constants rather than a tuned model.
 */

/** How much language was selected. Ordered smallest to largest. */
export type SelectionKind = "word" | "phrase" | "sentence" | "paragraph";

/** Above this many words a single clause is really a sentence. */
const PHRASE_WORD_LIMIT = 7;
/** Above this many words one sentence is really a passage. */
const PARAGRAPH_WORD_LIMIT = 60;

/** Sentence-ending punctuation, Latin and CJK full-width. Two forms because a
 *  `/g` regex carries `lastIndex` between `test` calls; keeping the stateful one
 *  for counting only means classification can never alternate on repeat calls. */
const TERMINAL_PUNCTUATION_ALL = /[.!?。！？]/g;
const HAS_TERMINAL_PUNCTUATION = /[.!?。！？]/;

/**
 * Count words in a way that survives a script with no inter-word spaces.
 *
 * Whitespace-delimited tokens are counted first. CJK ideographs and Hangul
 * syllables are then counted as roughly two characters per word, because a
 * space-split of "이 문장은 길다" undercounts and of "这是一个句子" returns 1.
 */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;

  const spaced = trimmed.split(/\s+/).filter(Boolean).length;
  // Hangul syllables plus CJK unified ideographs, which carry more meaning per
  // character than a Latin letter does.
  const dense = (trimmed.match(/[가-힣一-鿿]/g) ?? []).length;
  if (dense === 0) return spaced;

  const denseWords = Math.ceil(dense / 2);
  // A Korean sentence is both spaced and dense; take the larger estimate so a
  // spaced Korean clause is not mistaken for a single word.
  return Math.max(spaced, denseWords);
}

/** How many sentences the selection appears to contain. */
export function countSentences(text: string): number {
  const matches = text.match(TERMINAL_PUNCTUATION_ALL);
  // Trailing punctuation on a single sentence still counts as one sentence, and
  // text with no terminator at all is still one thing the user selected.
  return Math.max(1, matches?.length ?? 0);
}

/**
 * Classify a selection by shape.
 *
 * The order of the checks is the policy: a hard paragraph signal (a blank line,
 * several sentences, sheer length) outranks everything, and only then does word
 * count separate a word from a phrase from a sentence.
 */
export function classifySelection(text: string): SelectionKind {
  const trimmed = text.trim();
  if (!trimmed) return "word";

  const words = countWords(trimmed);
  const sentences = countSentences(trimmed);
  // A blank line is an explicit paragraph break the user selected across.
  const hasParagraphBreak = /\n\s*\n/.test(trimmed);

  if (hasParagraphBreak || sentences >= 3 || words > PARAGRAPH_WORD_LIMIT) {
    return "paragraph";
  }
  if (sentences === 2) {
    // Two sentences is a short passage, not one sentence.
    return "paragraph";
  }
  if (words <= 1) return "word";
  if (words <= PHRASE_WORD_LIMIT && !HAS_TERMINAL_PUNCTUATION.test(trimmed)) {
    return "phrase";
  }
  return "sentence";
}

/** Korean label for a shape, for the panel's "무엇을 읽었는지" line. */
export function selectionKindLabel(kind: SelectionKind): string {
  switch (kind) {
    case "word":
      return "단어";
    case "phrase":
      return "구문";
    case "sentence":
      return "문장";
    default:
      return "문단";
  }
}
