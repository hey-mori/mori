import type { MoriMockSession, SourceRef, Summary, TimelineEvent } from "../../domain/types";
import type { StoredSessionDraft, StoredSessionImport } from "../storage/storageTypes";

export type ComposedSessionView = MoriMockSession & {
  isDemo: boolean;
};

export function composeSessionView(input: {
  draft: StoredSessionDraft;
  imports: StoredSessionImport[];
}): ComposedSessionView {
  const sources: SourceRef[] = input.imports.map((entry) => entry.source);
  const events: TimelineEvent[] = input.imports.flatMap((entry) => entry.events);

  const earliestEvent = events.reduce<string | null>((acc, event) => {
    if (!acc) return event.start;
    return new Date(event.start).getTime() < new Date(acc).getTime() ? event.start : acc;
  }, null);
  const latestEvent = events.reduce<string | null>((acc, event) => {
    const candidate = event.end ?? event.start;
    if (!acc) return candidate;
    return new Date(candidate).getTime() > new Date(acc).getTime() ? candidate : acc;
  }, null);

  const startedAt = earliestEvent ?? input.draft.session.startedAt;
  const endedAt = latestEvent ?? input.draft.session.endedAt;

  const summary: Summary = {
    id: `summary-${input.draft.session.id}`,
    sessionId: input.draft.session.id,
    sessionSummary: events.length
      ? `${events.length} imported event${events.length === 1 ? "" : "s"} awaiting Quick Pass analysis.`
      : "No imports yet. Add a manual note, URL, or AI conversation to populate this session.",
    resumePrompt: "Run Quick Pass to generate a resume prompt for this session.",
    reportMarkdown: "",
    nextActionIds: [],
    generatedAt: input.draft.savedAt,
  };

  return {
    project: input.draft.project,
    session: {
      ...input.draft.session,
      startedAt,
      endedAt,
    },
    sources,
    events,
    issues: [],
    decisions: [],
    relationships: [],
    artifacts: [],
    nextActions: [],
    summary,
    isDemo: false,
  };
}
