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
  return text.replace(PASTE_MARKER, " ").replace(/[ \t]+\n/g, "\n").trim();
}

/**
 * Wrappers the agent CLI puts around machine text: a slash command and its
 * arguments, the command's output, the caveat it prepends, shell input and
 * output, and pasted text. Display only, as for paste markers above.
 */
const HARNESS_TAG = /<\/?(?:pasted_content|command-name|command-message|command-args|local-command-stdout|local-command-stderr|local-command-caveat|bash-input|bash-stdout|bash-stderr|system-reminder)\b[^>]*>/g;

/**
 * Agent transcript text as a person reads it in a row, a preview or a
 * heading: the CLI's wrapper tags dropped, their content kept, a repeated
 * slash-command name said once. The stored message is never changed.
 */
export function readableAgentText(text: string): string {
  const named = text.match(/<command-name>\s*([^<]*?)\s*<\/command-name>/);
  let out = text;
  if (named) {
    // `<command-name>/model</command-name> <command-message>model</command-message>`
    // says the command twice; keep the name and any arguments.
    out = out.replace(/<command-message>[^<]*<\/command-message>/g, " ");
  }
  return out.replace(HARNESS_TAG, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}
