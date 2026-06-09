import { Bell, CheckCircle2, Code2, FileText, MoreHorizontal, Sparkles, TreePine, type LucideIcon } from "lucide-react";
import type { EventActor, EventType, IssueStatus, Priority, RecordingMode, TrustLevel } from "./types";

export const eventTypeLabels: Record<EventType, string> = {
  aiConversation: "대화",
  decision: "결정",
  issue: "이슈",
  fileCode: "파일",
  webResearch: "조사",
  documentNote: "문서",
  artifact: "산출물",
  other: "기타",
};

/**
 * Actor labels for a timeline turn. Imported turns are all type
 * `aiConversation`, so the type label alone reads everything as "대화"; the
 * actor distinguishes a tool call or a bare user request from a real exchange.
 * `assistant` stays "대화" because such a turn is a full question+answer pair.
 */
export const eventActorLabels: Record<EventActor, string> = {
  user: "요청",
  assistant: "대화",
  tool: "도구",
  file: "파일",
  decision: "결정",
  system: "시스템",
};

/**
 * The honest label for a timeline event. Prefers the actor (so a tool call is
 * not mislabeled "대화"), naming the specific tool when known ("Grep"), and
 * falls back to the event-type label for events that carry no actor.
 */
export function eventDisplayLabel(event: {
  type: EventType;
  actor?: EventActor;
  toolName?: string;
}): string {
  if (event.actor) {
    if (event.actor === "tool" && event.toolName) return event.toolName;
    return eventActorLabels[event.actor];
  }
  return eventTypeLabels[event.type] ?? event.type;
}

export const laneOrder: EventType[] = [
  "aiConversation",
  "decision",
  "issue",
  "fileCode",
  "webResearch",
  "documentNote",
  "artifact",
  "other",
];

export const eventTypeTone: Record<EventType, string> = {
  aiConversation: "purple",
  decision: "green",
  issue: "red",
  fileCode: "blue",
  webResearch: "cyan",
  documentNote: "gray",
  artifact: "blue",
  other: "gray",
};

export const eventTypeIcons: Record<EventType, LucideIcon> = {
  aiConversation: Sparkles,
  decision: CheckCircle2,
  issue: Bell,
  fileCode: Code2,
  webResearch: TreePine,
  documentNote: FileText,
  artifact: FileText,
  other: MoreHorizontal,
};

export const trustLevelLabels: Record<TrustLevel, string> = {
  verified: "Verified",
  observed: "Observed",
  inferred: "Inferred",
};

export const recordingModeLabels: Record<RecordingMode, string> = {
  summary: "Summary Mode",
  full: "Full Mode",
  ephemeral: "Ephemeral Mode",
};

export const issueStatusLabels: Record<IssueStatus, string> = {
  open: "Open",
  inProgress: "In Progress",
  resolved: "Resolved",
  watching: "Watching",
};

export const priorityLabels: Record<Priority, string> = {
  high: "높음",
  medium: "중간",
  low: "낮음",
};
