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
