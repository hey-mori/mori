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
};

export type CreatedSessionDraft = {
  project: Project;
  session: Session;
};

export function createSessionDraft(input: CreateSessionDraftInput): CreatedSessionDraft {
  const now = input.now ?? new Date().toISOString();
  const projectId = createStableId("proj", input.projectName, now);
  const sessionId = createStableId("sess", input.sessionTitle, now);

  return {
    project: {
      id: projectId,
      name: input.projectName.trim() || "Untitled Project",
      description: "Local-first Mori work memory project.",
      createdAt: now,
      updatedAt: now,
    },
    session: {
      id: sessionId,
      projectId,
      title: input.sessionTitle.trim() || "Untitled Mori Session",
      startedAt: now,
      endedAt: now,
      recordingMode: input.recordingMode,
      llmProvider: input.llmProvider,
      llmModel: input.llmModel,
      storageLocation: input.storageLocation,
      selectedSourceIds: input.selectedSources.filter((source) => source.selected).map((source) => source.id),
      status: "recording",
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
