import type { NormalizedImportCandidate, NormalizeUrlSourceInput } from "./types";
import { createImportId } from "./id";
import { assessUrlFidelity } from "./captureFidelity";

export function normalizeUrlSource(input: NormalizeUrlSourceInput): NormalizedImportCandidate {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const sourceId = createImportId("src-url", input.url, capturedAt);
  const eventId = createImportId("evt-url", input.title, capturedAt);

  return {
    source: {
      id: sourceId,
      sessionId: input.sessionId,
      kind: "browser",
      title: input.title,
      detail: input.selectedText?.trim() || input.url,
      uri: input.url,
      trustLevel: "verified",
      redactionStatus: "notNeeded",
      rawRetention: "retained",
      capturedAt,
      relatedEventIds: [eventId],
      captureFidelity: assessUrlFidelity(input.selectedText),
    },
    events: [
      {
        id: eventId,
        sessionId: input.sessionId,
        projectId: input.projectId,
        start: capturedAt,
        type: "webResearch",
        title: `${input.title} 조사`,
        summary: input.selectedText?.trim() || `Added browser source: ${input.url}`,
        sourceRefs: [sourceId],
        linkedIssueIds: [],
        linkedDecisionIds: [],
        relationshipIds: [],
        trustLevel: "verified",
        confidence: 0.9,
        createdBy: "import",
        userModified: false,
      },
    ],
  };
}
