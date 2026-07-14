/**
 * Conversation parser · deterministic detection of a pasted AI dialog
 * (architecture doc §22.4). Recognises 사용자:/AI: style turn markers and
 * splits the text into question/answer turns, so pasting a whole ChatGPT or
 * Claude exchange becomes a `qa` record instead of an opaque note.
 *
 * Conservative by design: it only fires when both a user marker and an
 * assistant marker are present, so ordinary prose is never mistaken for a
 * dialog. Anything richer (implicit turn boundaries, multi-model comparison)
 * is an LLM-proposer concern.
 */

export type ConversationTurn = {
  role: "user" | "assistant";
  text: string;
};

export type ParsedConversation = {
  turns: ConversationTurn[];
  /** The assistant's name when a marker named it (ChatGPT / Claude / …). */
  assistant?: string;
  /** Q/A pairs derived from the turns, for a compact summary. */
  pairs: Array<{ question: string; answer: string }>;
};

/** Markers that open a user turn. Ordered longest-first so a compound label
 *  is matched before a shorter overlap. */
const USER_MARKERS = ["사용자", "질문", "나", "유저", "user", "me", "you", "q", "human"];
const ASSISTANT_MARKERS = [
  "chatgpt",
  "claude",
  "gemini",
  "gpt",
  "assistant",
  "ai",
  "답변",
  "응답",
  "a",
];

const NAMED_ASSISTANTS: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  gpt: "GPT",
};

const MARKER_RE = /^\s*([A-Za-z가-힣]{1,10})\s*[:：]\s*(.*)$/;

function classifyMarker(label: string): { role: "user" | "assistant"; name?: string } | null {
  const key = label.trim().toLowerCase();
  if (USER_MARKERS.includes(key)) return { role: "user" };
  if (ASSISTANT_MARKERS.includes(key)) return { role: "assistant", name: NAMED_ASSISTANTS[key] };
  return null;
}

/**
 * Parses `text` into a conversation, or returns null when it does not read as
 * a dialog (needs at least one user and one assistant turn).
 */
export function parseConversation(text: string): ParsedConversation | null {
  const lines = text.split(/\r?\n/);
  const turns: ConversationTurn[] = [];
  let assistant: string | undefined;
  let current: ConversationTurn | null = null;

  for (const line of lines) {
    const match = line.match(MARKER_RE);
    const marker = match ? classifyMarker(match[1]) : null;
    if (match && marker) {
      if (current && current.text.trim().length > 0) turns.push(current);
      if (marker.role === "assistant" && marker.name && !assistant) assistant = marker.name;
      current = { role: marker.role, text: match[2] };
    } else if (current) {
      current.text += (current.text.length > 0 ? "\n" : "") + line;
    }
  }
  if (current && current.text.trim().length > 0) turns.push(current);

  const trimmed = turns
    .map((turn) => ({ role: turn.role, text: turn.text.trim() }))
    .filter((turn) => turn.text.length > 0);

  const hasUser = trimmed.some((turn) => turn.role === "user");
  const hasAssistant = trimmed.some((turn) => turn.role === "assistant");
  if (!hasUser || !hasAssistant) return null;

  return { turns: trimmed, assistant, pairs: pairTurns(trimmed) };
}

/** Pairs each user turn with the assistant turn that follows it. */
function pairTurns(turns: ConversationTurn[]): Array<{ question: string; answer: string }> {
  const pairs: Array<{ question: string; answer: string }> = [];
  for (let index = 0; index < turns.length; index += 1) {
    if (turns[index].role !== "user") continue;
    const answer = turns[index + 1]?.role === "assistant" ? turns[index + 1].text : "";
    pairs.push({ question: turns[index].text, answer });
  }
  return pairs;
}
