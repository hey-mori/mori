import type { AnalysisInput } from "./analysisTypes";

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

Rules:
- Use only the supplied evidence. Do not invent files or events.
- Reference events by their provided id values when linking.
- Mark generated issues and decisions as trustLevel "inferred" and confirmed false unless the source explicitly confirms them.
- Output a single JSON object with no markdown fences and no commentary.`;

export function buildQuickPassPrompt(input: AnalysisInput): QuickPassPromptParts {
  const eventDigest = input.events
    .map((event) => `- id=${event.id} type=${event.type} title=${event.title}\n  summary=${event.summary}`)
    .join("\n");
  const sourceDigest = input.sources
    .map((source) => `- id=${source.id} kind=${source.kind} title=${source.title} trust=${source.trustLevel}`)
    .join("\n");

  const userPrompt = [
    `Session: ${input.session.title} (id=${input.session.id})`,
    `Project: ${input.project.name} (id=${input.project.id})`,
    "",
    "Sources:",
    sourceDigest || "(none)",
    "",
    "Events:",
    eventDigest || "(none)",
    "",
    "Return the JSON object specified by the system instructions.",
  ].join("\n");

  return { systemPrompt: SYSTEM_PROMPT, userPrompt };
}
