/**
 * Agent transcript text as a person reads it in a title.
 *
 * Claude Code wraps pasted text in `<pasted_content id="…">…</pasted_content>`.
 * The wrapper is transport, not what the user wrote, so a title keeps the
 * pasted text and drops the tags (the Rust twin is `without_paste_markers`).
 * The message itself is never changed: this is for titles only.
 */
const PASTE_MARKER = /<\/?pasted_content\b[^>]*>/g;

export function withoutPasteMarkers(text: string): string {
  // Trailing blanks per line by splitting, not a `[ \t]+\n` regex, which
  // backtracks quadratically over a long run of spaces.
  return text
    .replace(PASTE_MARKER, " ")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

/** Wrappers the agent CLI puts around a slash command, its arguments and its
 *  output, and around shell input and output. Their content is kept. */
const KEPT_WRAPPER = /<\/?(?:command-name|command-args|local-command-stdout|local-command-stderr|bash-input|bash-stdout|bash-stderr)>/g;
/** Blocks the harness injects whose content is not what the user wrote (the
 *  repeated command message, the fixed caveat, injected reminders): dropped
 *  with their content. */
const DROPPED_BLOCK = /<(command-message|local-command-caveat|system-reminder)>[\s\S]*?<\/\1>/g;
/** Known wrapper or block tags that open the text (after whitespace). */
const LEADING_HARNESS_TAG = /^\s*<(?:command-name|command-message|command-args|local-command-stdout|local-command-stderr|local-command-caveat|bash-input|bash-stdout|bash-stderr|system-reminder)>/;

/**
 * Agent transcript text as a person reads it: paste markers dropped wherever
 * they are, and, only when the text itself is CLI transport (it opens with
 * one of its wrapper tags), the wrappers dropped and the injected blocks
 * removed with their content. Prose that merely mentions such a tag is left
 * as written, and so are line breaks and indentation. Display only: the
 * stored message is never changed.
 */
export function readableAgentText(text: string): string {
  const pasted = withoutPasteMarkers(text);
  if (!LEADING_HARNESS_TAG.test(pasted)) return pasted;
  return pasted
    .replace(DROPPED_BLOCK, " ")
    .replace(KEPT_WRAPPER, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/**
 * A label for agent text shown as a title: the readable text, or, when the
 * text is only CLI transport with nothing readable left (an empty shell
 * output, say), what it was, so a title is never blank.
 */
export function readableAgentLabel(text: string): string {
  const readable = readableAgentText(text);
  if (readable) return readable;
  if (/^\s*<bash-/.test(text)) return "셸 명령";
  if (/^\s*<(?:command-|local-command)/.test(text)) return "명령";
  return text.trim() ? "에이전트 안내" : "";
}

/** A tool row's text without the reader's leading tool glyph (the row or lane
 *  already names the kind of work); anything else is unchanged. */
export function labelText(title: string): string {
  return title.replace(/^\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*\s+/u, "");
}
