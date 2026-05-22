import type { LlmProvider, Project, RecordingMode, Session, SourceOption } from "../../domain/types";

export type CreateSessionDraftInput = {
  sessionTitle: string;
  projectName: string;
  selectedSources: SourceOption[];
  recordingMode: RecordingMode;
  llmProvider: LlmProvider;
  llmModel: string;
  storageLocation: string;
  now?: string;
  /**
   * Explicit session timing. Optional — manual Start Session leaves these
   * undefined and the session inherits `now` for both. Import-created
   * sessions ("1 Claude conversation = 1 session") pass the conversation's
   * first / last message times so the session window reflects the real
   * conversation, not the moment of import.
   */
  startedAt?: string;
  endedAt?: string;
  /**
   * Optional grouping label carried onto `Session.sourceLabel` (e.g. the
   * Claude project path). Omitted for manual sessions.
   */
  sourceLabel?: string;
  /**
   * Initial session status. Defaults to `recording` (the manual flow). An
   * import-created session is a finished conversation, so the caller may
   * pass `complete` to skip the live-recording affordances.
   */
  status?: Session["status"];
};

export type CreatedSessionDraft = {
  project: Project;
  session: Session;
};

export function createSessionDraft(input: CreateSessionDraftInput): CreatedSessionDraft {
  const now = input.now ?? new Date().toISOString();
  const startedAt = input.startedAt ?? now;
  const endedAt = input.endedAt ?? now;
  const projectId = createStableId("proj", input.projectName, now);
  const sessionId = createStableId("sess", input.sessionTitle, now);
  const sourceLabel = input.sourceLabel?.trim();

  return {
    project: {
      id: projectId,
      name: input.projectName.trim() || "무제 프로젝트",
      description: "Local-first Mori work memory project.",
      createdAt: now,
      updatedAt: now,
    },
    session: {
      id: sessionId,
      projectId,
      title: input.sessionTitle.trim() || "무제 Mori 세션",
      startedAt,
      endedAt,
      recordingMode: input.recordingMode,
      llmProvider: input.llmProvider,
      llmModel: input.llmModel,
      storageLocation: input.storageLocation,
      selectedSourceIds: input.selectedSources.filter((source) => source.selected).map((source) => source.id),
      status: input.status ?? "recording",
      ...(sourceLabel ? { sourceLabel } : {}),
    },
  };
}

function createStableId(prefix: string, label: string, timestamp: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const suffix = timestamp.replace(/[^0-9]/g, "").slice(0, 14);
  return `${prefix}-${slug || "untitled"}-${suffix}`;
}
