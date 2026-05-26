import type { CaptureFidelity } from "../../domain/types";

/**
 * Stable reason codes emitted by {@link assessTranscriptFidelity}. UI and
 * report builders map these to locale copy; tests match on the code, never
 * on prose.
 */
export const TRANSCRIPT_FIDELITY_REASON = {
  /** Empty / whitespace-only input. */
  empty: "empty",
  /** No `User:` / `Assistant:` / `System:` style markers were found at all. */
  noRoleMarkers: "noRoleMarkers",
  /** The first recognised turn is an assistant reply — the paste began mid-stream. */
  startsMidConversation: "startsMidConversation",
  /** An explicit truncation marker (e.g. `[truncated]`) appears in the text. */
  truncationMarker: "truncationMarker",
  /** Only assistant turns were recognised — the user side is missing. */
  assistantOnly: "assistantOnly",
  /** Only user turns were recognised — no assistant responses were captured. */
  noAssistantResponses: "noAssistantResponses",
} as const;

/** Stable reason codes for git-diff capture fidelity. */
export const GIT_DIFF_FIDELITY_REASON = {
  /** The final hunk holds fewer lines than its `@@` header declared — the diff was cut off. */
  truncatedHunk: "truncatedHunk",
} as const;

/** Stable reason codes for URL capture fidelity. */
export const URL_FIDELITY_REASON = {
  /** Only a user-selected excerpt of the page was captured, not the page. */
  excerptOnly: "excerptOnly",
} as const;

const USER_MARKER = /^(User|Human|You|Me):\s*/i;
const ASSISTANT_MARKER = /^(Assistant|AI|Claude|ChatGPT|Codex|Bot):\s*/i;
const SYSTEM_MARKER = /^System:\s*/i;

// Conservative: only explicit, bracketed / parenthesised / angled truncation
// markers count, so an ordinary sentence using the word "truncated" does not
// flag a complete capture as partial.
const TRUNCATION_MARKER =
  /\[(?:truncated|trimmed|cut[\s-]?off|…|\.\.\.|생략|중략|이하\s*생략)\]|\((?:truncated|trimmed|생략)\)|<truncated>/i;

type RecognizedRole = "user" | "assistant" | "system";

function recognizeRole(line: string): RecognizedRole | null {
  if (USER_MARKER.test(line)) return "user";
  if (ASSISTANT_MARKER.test(line)) return "assistant";
  if (SYSTEM_MARKER.test(line)) return "system";
  return null;
}

/**
 * Assess how complete a pasted AI transcript looks. This judges the
 * *capture*, not the content: a transcript that begins on an assistant reply
 * or carries a truncation marker is reported as `partial`/`fragment` so
 * downstream memory never treats a snippet as a whole session. A paste with
 * no role markers is reported as `unknown` — Mori cannot assess the
 * completeness of text it cannot structure, and says so rather than guessing.
 *
 * Self-contained on `text` (it runs its own lightweight role scan) so both
 * the structured transcript normaliser and the legacy conversation
 * normaliser can call it.
 */
export function assessTranscriptFidelity(text: string): CaptureFidelity {
  if (!text.trim()) {
    return { level: "unknown", reasons: [TRANSCRIPT_FIDELITY_REASON.empty] };
  }

  const roles: RecognizedRole[] = [];
  for (const line of text.split("\n")) {
    const role = recognizeRole(line);
    if (role) roles.push(role);
  }

  const reasons: string[] = [];
  const truncated = TRUNCATION_MARKER.test(text);
  if (truncated) reasons.push(TRANSCRIPT_FIDELITY_REASON.truncationMarker);

  if (roles.length === 0) {
    reasons.unshift(TRANSCRIPT_FIDELITY_REASON.noRoleMarkers);
    return { level: "unknown", reasons };
  }

  const startsMid = roles[0] === "assistant";
  if (startsMid) reasons.push(TRANSCRIPT_FIDELITY_REASON.startsMidConversation);

  const userTurns = roles.filter((r) => r === "user").length;
  const assistantTurns = roles.filter((r) => r === "assistant").length;
  const assistantOnly = assistantTurns > 0 && userTurns === 0;
  const noAssistantResponses = userTurns > 0 && assistantTurns === 0;
  if (assistantOnly) reasons.push(TRANSCRIPT_FIDELITY_REASON.assistantOnly);
  if (noAssistantResponses) reasons.push(TRANSCRIPT_FIDELITY_REASON.noAssistantResponses);

  const partialSignal = startsMid || truncated || assistantOnly || noAssistantResponses;
  const bothEndsCut = startsMid && truncated;
  const level: CaptureFidelity["level"] = bothEndsCut ? "fragment" : partialSignal ? "partial" : "full";

  return { level, reasons };
}

// Captures the declared old/new line counts from a unified-diff hunk header,
// e.g. `@@ -12,7 +12,9 @@`. A missing count means 1 per the diff spec.
const HUNK_HEADER_COUNTS = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;

/**
 * Assess how complete a pasted git diff looks. The normaliser already rejects
 * input without `diff --git` file headers, so the remaining risk is a diff
 * copied off the top of a long terminal scroll and cut mid-hunk. We compare
 * the final hunk's actual line count against the count its `@@` header
 * declares; a short final hunk means the paste was truncated.
 *
 * Counting deliberately treats blank lines as context (a paste can strip the
 * leading space from a blank context line), which biases toward `full` and
 * avoids flagging complete diffs as truncated.
 */
export function assessGitDiffFidelity(diffText: string): CaptureFidelity {
  let sawHunk = false;
  let inHunk = false;
  let declaredOld = 0;
  let declaredNew = 0;
  let seenOld = 0;
  let seenNew = 0;

  for (const line of diffText.split(/\r?\n/)) {
    const hunk = HUNK_HEADER_COUNTS.exec(line);
    if (hunk) {
      sawHunk = true;
      inHunk = true;
      declaredOld = hunk[1] !== undefined ? Number(hunk[1]) : 1;
      declaredNew = hunk[2] !== undefined ? Number(hunk[2]) : 1;
      seenOld = 0;
      seenNew = 0;
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith("diff --git")) {
      inHunk = false;
      continue;
    }
    if (line.startsWith("\\")) continue; // "\ No newline at end of file"
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) {
      seenNew += 1;
      continue;
    }
    if (line.startsWith("-")) {
      seenOld += 1;
      continue;
    }
    if (line.startsWith(" ") || line === "") {
      seenOld += 1;
      seenNew += 1;
      continue;
    }
    inHunk = false; // a non-diff line ends the hunk body
  }

  if (!sawHunk) return { level: "full", reasons: [] };
  const truncated = seenOld < declaredOld || seenNew < declaredNew;
  return truncated
    ? { level: "partial", reasons: [GIT_DIFF_FIDELITY_REASON.truncatedHunk] }
    : { level: "full", reasons: [] };
}

/**
 * Assess URL-source fidelity. A bare URL is a complete *reference* (`full`).
 * A URL plus a user-selected excerpt holds only a slice of the page, so it is
 * reported as `partial` (`excerptOnly`) — downstream memory must not treat the
 * excerpt as if it were the whole page.
 */
export function assessUrlFidelity(selectedText?: string): CaptureFidelity {
  return selectedText?.trim()
    ? { level: "partial", reasons: [URL_FIDELITY_REASON.excerptOnly] }
    : { level: "full", reasons: [] };
}
