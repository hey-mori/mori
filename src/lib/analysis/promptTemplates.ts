import type { AnalysisInput } from "./analysisTypes";
import type { TimelineEvent } from "../../domain/types";

export type QuickPassPromptParts = {
  systemPrompt: string;
  userPrompt: string;
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

export function buildQuickPassPrompt(input: AnalysisInput): QuickPassPromptParts {
  // Tool events are machine output and dominate a long session by volume.
  // Drop them from the extraction prompt (the timeline still shows them) and
  // keep only substantive conversation / decision / file turns.
  const conversationEvents = input.events.filter((event) => event.actor !== "tool");
  const toolCount = input.events.length - conversationEvents.length;
  const keptEvents = conversationEvents.slice(-MAX_LLM_CONVERSATION_EVENTS);
  const omittedConversation = conversationEvents.length - keptEvents.length;

  const eventDigest = keptEvents.map(eventDigestLine).join("\n");
  const sourceDigest = input.sources
    .map((source) => `- id=${source.id} kind=${source.kind} title=${source.title} trust=${source.trustLevel}`)
    .join("\n");

  const omissionNotes: string[] = [];
  if (toolCount > 0) {
    omissionNotes.push(`(${toolCount} tool events omitted — machine output, context only.)`);
  }
  if (omittedConversation > 0) {
    omissionNotes.push(
      `(${omittedConversation} earlier turns omitted; showing the most recent ${keptEvents.length}.)`,
    );
  }

  const userPrompt = [
    `Session: ${input.session.title} (id=${input.session.id})`,
    `Project: ${input.project.name} (id=${input.project.id})`,
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

function truncate(value: string, max: number): string {
  const compact = (value ?? "").replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}…`;
}
