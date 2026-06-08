import type { AnalysisInput } from "./analysisTypes";
import type { TimelineEvent } from "../../domain/types";

export type QuickPassPromptParts = {
  systemPrompt: string;
  userPrompt: string;
};

export type QuickPassPromptChunk = QuickPassPromptParts & {
  index: number;
  total: number;
  eventCount: number;
};

const SYSTEM_PROMPT = `You are Mori's Quick Pass analyst. You receive imported work session data (sources, events, notes, AI conversations) and produce a strict JSON object describing:
- summary.sessionSummary: 1-2 sentence factual summary
- summary.resumePrompt: a prompt block another AI session could use to continue this work
- summary.highlights: array of short factual highlights
- issues: array of { title, description, status, priority, sourceEventIds, suggestedNextAction, confidence, trustLevel }
- decisions: array of { title, decision, rationale, sourceEventIds, importance, trustLevel, confirmed }
- relationships: array of { fromId, fromType, toId, toType, type, confidence, reason }
- nextActions: array of { title, priority, relatedIssueIds, relatedEventIds }

Allowed values (use these exact strings):
- priority and importance: "high" | "medium" | "low"
- status: "open" | "inProgress" | "resolved" | "watching"
- trustLevel: "verified" | "observed" | "inferred"
- confidence: a number between 0 and 1

Rules:
- Use only the supplied evidence. Do not invent files or events.
- Reference events by their provided id values when linking.
- Tool events (actor=tool) are machine output: tool calls, results, and errors. Use them as context only. Never output a tool line, an error message, a stack trace, or a log line as an issue or decision.
- An issue is a real unresolved problem the people discussed, not a raw warning/error string or tool output.
- A decision is a choice the people deliberately made, not a code comment, snippet, or configuration line.
- Every issue, decision, and nextAction MUST have a non-empty title. Omit an item rather than emit a blank or placeholder title. Do not repeat the same title.
- Prefer a few high-quality issues and decisions over many noisy ones. Returning empty arrays is correct when nothing substantive was discussed.
- Mark generated issues and decisions as trustLevel "inferred" and confirmed false unless the source explicitly confirms them.
- Write titles and summaries in the language the conversation uses (Korean stays Korean).
- Output a single JSON object with no markdown fences and no commentary.

Return exactly this shape (structure only, fill with real content or empty arrays):
{"summary":{"sessionSummary":"","resumePrompt":"","highlights":[]},"issues":[{"title":"","description":"","status":"open","priority":"medium","sourceEventIds":[],"suggestedNextAction":"","confidence":0.6,"trustLevel":"inferred"}],"decisions":[{"title":"","decision":"","rationale":"","sourceEventIds":[],"importance":"medium","trustLevel":"inferred","confirmed":false}],"relationships":[],"nextActions":[{"title":"","priority":"medium","relatedIssueIds":[],"relatedEventIds":[]}]}`;

/**
 * Cap on conversation events sent to the LLM. A long real session (500+
 * turns) is mostly tool calls; sending all of them produced a ~150KB prompt
 * that a small local model timed out on ("signal is aborted") or answered
 * with empty arrays. We extract from conversation turns only, capped to the
 * most recent N, and tell the model how much was omitted.
 */
export const MAX_LLM_CONVERSATION_EVENTS = 120;
export const DEFAULT_LLM_EVENT_DIGEST_BUDGET_CHARS = 10_000;
export const DEFAULT_LLM_SOURCE_DIGEST_BUDGET_CHARS = 1_600;

export type QuickPassPromptBuildOptions = {
  /**
   * Optional event subset. Ollama uses this for chunked local-model passes;
   * the default path still picks the most recent bounded conversation turns.
   */
  events?: readonly TimelineEvent[];
  maxConversationEvents?: number;
  eventDigestBudgetChars?: number;
  sourceDigestBudgetChars?: number;
  chunkLabel?: string;
  totalConversationEvents?: number;
  omittedToolEvents?: number;
};

export type QuickPassPromptChunkOptions = {
  maxEventsPerChunk: number;
  eventDigestBudgetChars: number;
  sourceDigestBudgetChars?: number;
};

export function buildQuickPassPrompt(
  input: AnalysisInput,
  options: QuickPassPromptBuildOptions = {},
): QuickPassPromptParts {
  // Tool events are machine output and dominate a long session by volume.
  // Drop them from the extraction prompt (the timeline still shows them) and
  // keep only substantive conversation / decision / file turns.
  const sourceEvents = options.events ?? input.events;
  const conversationEvents = sourceEvents.filter((event) => event.actor !== "tool");
  const toolCount =
    options.omittedToolEvents ?? sourceEvents.length - conversationEvents.length;
  const maxConversationEvents = options.maxConversationEvents ?? MAX_LLM_CONVERSATION_EVENTS;
  const recentEvents = conversationEvents.slice(-maxConversationEvents);
  const selected = selectRecentDigestLines(
    recentEvents,
    options.eventDigestBudgetChars ?? DEFAULT_LLM_EVENT_DIGEST_BUDGET_CHARS,
  );
  const omittedConversation =
    (options.totalConversationEvents ?? conversationEvents.length) - selected.keptCount;

  const eventDigest = selected.lines.join("\n");
  const sourceDigest = buildSourceDigest(
    input,
    options.sourceDigestBudgetChars ?? DEFAULT_LLM_SOURCE_DIGEST_BUDGET_CHARS,
  );

  const omissionNotes: string[] = [];
  if (toolCount > 0) {
    omissionNotes.push(`(${toolCount} tool events omitted — machine output, context only.)`);
  }
  if (omittedConversation > 0) {
    const omissionScope = options.chunkLabel ? "other turns omitted from this chunk" : "earlier turns omitted";
    omissionNotes.push(
      `(${omittedConversation} ${omissionScope}; showing ${selected.keptCount} focused turns.)`,
    );
  }

  const userPrompt = [
    `Session: ${input.session.title} (id=${input.session.id})`,
    `Project: ${input.project.name} (id=${input.project.id})`,
    ...(options.chunkLabel ? [`Scope: ${options.chunkLabel}`] : []),
    "",
    "Sources:",
    sourceDigest || "(none)",
    "",
    "Events (conversation turns only):",
    eventDigest || "(none)",
    ...(omissionNotes.length > 0 ? ["", omissionNotes.join("\n")] : []),
    "",
    "Return the JSON object specified by the system instructions.",
  ].join("\n");

  return { systemPrompt: SYSTEM_PROMPT, userPrompt };
}

export function buildQuickPassPromptChunks(
  input: AnalysisInput,
  options: QuickPassPromptChunkOptions,
): QuickPassPromptChunk[] {
  const conversationEvents = input.events.filter((event) => event.actor !== "tool");
  const omittedToolEvents = input.events.length - conversationEvents.length;
  const eventChunks = chunkConversationEvents(
    conversationEvents,
    options.maxEventsPerChunk,
    options.eventDigestBudgetChars,
  );

  return eventChunks.map((events, index) => ({
    ...buildQuickPassPrompt(input, {
      events,
      maxConversationEvents: events.length,
      eventDigestBudgetChars: options.eventDigestBudgetChars,
      sourceDigestBudgetChars:
        options.sourceDigestBudgetChars ?? DEFAULT_LLM_SOURCE_DIGEST_BUDGET_CHARS,
      chunkLabel: `chunk ${index + 1}/${eventChunks.length}`,
      totalConversationEvents: conversationEvents.length,
      omittedToolEvents,
    }),
    index,
    total: eventChunks.length,
    eventCount: events.length,
  }));
}

/**
 * One digest line per event. Tool events stay terse (no long machine output)
 * so the model is not flooded with tool results and the prompt stays small
 * enough for a local model — a 300-turn session is mostly tool noise by
 * volume. Conversation events keep a truncated summary.
 */
function eventDigestLine(event: TimelineEvent): string {
  const actor = event.actor ?? "?";
  if (actor === "tool") {
    const tool = event.toolName ? ` tool=${event.toolName}` : "";
    return `- id=${event.id} actor=tool${tool} ${truncate(event.title, 70)}`;
  }
  return `- id=${event.id} actor=${actor} type=${event.type} title=${truncate(event.title, 90)}\n  summary=${truncate(event.summary, 200)}`;
}

function chunkConversationEvents(
  events: TimelineEvent[],
  maxEventsPerChunk: number,
  eventDigestBudgetChars: number,
): TimelineEvent[][] {
  if (events.length === 0) return [[]];

  const chunks: TimelineEvent[][] = [];
  let current: TimelineEvent[] = [];
  let currentChars = 0;

  for (const event of events) {
    const lineLength = eventDigestLine(event).length + 1;
    const wouldOverflowByCount = current.length >= maxEventsPerChunk;
    const wouldOverflowByChars =
      current.length > 0 && currentChars + lineLength > eventDigestBudgetChars;

    if (wouldOverflowByCount || wouldOverflowByChars) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }

    current.push(event);
    currentChars += lineLength;
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

function selectRecentDigestLines(
  events: TimelineEvent[],
  budgetChars: number,
): { lines: string[]; keptCount: number } {
  const lines: string[] = [];
  let used = 0;

  for (let i = events.length - 1; i >= 0; i -= 1) {
    const line = eventDigestLine(events[i]!);
    const nextUsed = used + line.length + (lines.length > 0 ? 1 : 0);
    if (lines.length > 0 && nextUsed > budgetChars) break;
    lines.unshift(line);
    used = nextUsed;
  }

  return { lines, keptCount: lines.length };
}

function buildSourceDigest(input: AnalysisInput, budgetChars: number): string {
  const lines: string[] = [];
  let used = 0;
  for (const source of input.sources) {
    const line = `- id=${source.id} kind=${source.kind} title=${truncate(source.title, 80)} trust=${source.trustLevel}`;
    const nextUsed = used + line.length + (lines.length > 0 ? 1 : 0);
    if (lines.length > 0 && nextUsed > budgetChars) break;
    lines.push(line);
    used = nextUsed;
  }
  const omitted = input.sources.length - lines.length;
  if (omitted > 0) lines.push(`- (${omitted} sources omitted from this prompt.)`);
  return lines.join("\n");
}

function truncate(value: string, max: number): string {
  const compact = (value ?? "").replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}…`;
}
