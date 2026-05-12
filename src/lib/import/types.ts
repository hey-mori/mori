import type { SourceRef, TimelineEvent } from "../../domain/types";

export type NormalizedImportCandidate = {
  source: SourceRef;
  events: TimelineEvent[];
};

export type NormalizeBaseInput = {
  projectId: string;
  sessionId: string;
  capturedAt?: string;
};

export type NormalizeManualNoteInput = NormalizeBaseInput & {
  title?: string;
  note: string;
};

export type NormalizeUrlSourceInput = NormalizeBaseInput & {
  title: string;
  url: string;
  selectedText?: string;
};

export type NormalizeAiConversationTextInput = NormalizeBaseInput & {
  title?: string;
  text: string;
  provider?: string;
};
