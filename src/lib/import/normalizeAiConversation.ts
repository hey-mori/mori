import type { NormalizedImportCandidate, NormalizeAiConversationTextInput } from "./types";
import { createImportId } from "./id";

export function normalizeAiConversationText(input: NormalizeAiConversationTextInput): NormalizedImportCandidate {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const title = input.title?.trim() || `${input.provider ?? "AI"} conversation import`;
  const sourceId = createImportId("src-ai", title, capturedAt);
  const eventId = createImportId("evt-ai", title, capturedAt);
  const messages = extractMessages(input.text);

  return {
    source: {
      id: sourceId,
      sessionId: input.sessionId,
      kind: "aiConversation",
      title,
      detail: `${messages.length} message-like blocks imported${input.provider ? ` from ${input.provider}` : ""}.`,
      trustLevel: "verified",
      redactionStatus: "pending",
      rawRetention: "summaryOnly",
      capturedAt,
      relatedEventIds: [eventId],
    },
    events: [
      {
        id: eventId,
        sessionId: input.sessionId,
        projectId: input.projectId,
        start: capturedAt,
        type: "aiConversation",
        title,
        summary: summarizeConversation(messages, input.text),
        sourceRefs: [sourceId],
        linkedIssueIds: [],
        linkedDecisionIds: [],
        relationshipIds: [],
        trustLevel: "verified",
        confidence: 0.86,
        createdBy: "import",
        userModified: false,
      },
    ],
  };
}

function extractMessages(text: string): string[] {
  const blocks = text
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);
  return blocks.length ? blocks : [text.trim()].filter(Boolean);
}

function summarizeConversation(messages: string[], fallback: string): string {
  const first = messages[0] ?? fallback;
  const normalized = first.replace(/\s+/g, " ").trim();
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}
