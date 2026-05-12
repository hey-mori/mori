import { Bell, CheckCircle2, Code2, FileText, MoreHorizontal, Sparkles, TreePine, type LucideIcon } from "lucide-react";
import type { EventType, IssueStatus, Priority, RecordingMode, TrustLevel } from "./types";

export const eventTypeLabels: Record<EventType, string> = {
  aiConversation: "AI 대화",
  decision: "결정",
  issue: "이슈",
  fileCode: "파일/코드",
  webResearch: "웹/조사",
  documentNote: "문서/메모",
  artifact: "산출물",
  other: "기타",
};

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
