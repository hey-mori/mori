import type { NormalizedImportCandidate, NormalizeManualNoteInput } from "./types";
import { createImportId } from "./id";

export function normalizeManualNote(input: NormalizeManualNoteInput): NormalizedImportCandidate {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const title = input.title?.trim() || "Manual note";
  const sourceId = createImportId("src-note", title, capturedAt);
  const eventId = createImportId("evt-note", title, capturedAt);

  return {
    source: {
      id: sourceId,
      sessionId: input.sessionId,
      kind: "manualNote",
      title,
      detail: summarize(input.note),
      trustLevel: "verified",
      redactionStatus: "notNeeded",
      rawRetention: "retained",
      capturedAt,
      relatedEventIds: [eventId],
      // A typed note is a complete, deliberate artifact — it captures exactly
      // what the user meant, so there is no larger thing it is a slice of.
      captureFidelity: { level: "full", reasons: [] },
    },
    events: [
      {
        id: eventId,
        sessionId: input.sessionId,
        projectId: input.projectId,
        start: capturedAt,
        type: "documentNote",
        title,
        summary: summarize(input.note),
        sourceRefs: [sourceId],
        linkedIssueIds: [],
        linkedDecisionIds: [],
        relationshipIds: [],
        trustLevel: "verified",
        confidence: 0.98,
        createdBy: "user",
        userModified: false,
      },
    ],
  };
}

function summarize(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > 180 ? `${trimmed.slice(0, 177)}...` : trimmed;
}
