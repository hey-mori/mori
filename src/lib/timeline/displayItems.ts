import type { EventType, TimelineEvent, TrustLevel } from "../../domain/types";

export type TimelineBundleKind =
  | "sequence"
  | "decisionBurst"
  | "issueBurst"
  | "researchBurst"
  | "codeBurst"
  | "evidenceBurst"
  | "workflowBurst";

export type TimelineBundleReasonCode =
  | "laneDensity"
  | "timeWindow"
  | "microSequence"
  | "preserveSingleRow";

export type TimelineBundleReason = {
  code: TimelineBundleReasonCode;
  message: string;
  timeWindowMinutes: number;
  laneType: EventType;
};

export type TimelineBundleMember = {
  eventId: string;
  type: EventType;
  title: string;
  start: string;
  end?: string;
  trustLevel: TrustLevel;
  sourceCount: number;
  decisionCount: number;
  issueCount: number;
  artifactCount: number;
};

export type TimelineDisplayEvent = {
  kind: "event";
  id: string;
  laneType: EventType;
  start: string;
  end?: string;
  event: TimelineEvent;
  memberEventIds: string[];
};

export type TimelineDisplayBundle = {
  kind: "bundle";
  id: string;
  laneType: EventType;
  start: string;
  end: string;
  title: string;
  summary: string;
  bundleKind: TimelineBundleKind;
  dominantType: EventType;
  memberEventIds: string[];
  members: TimelineBundleMember[];
  count: number;
  eventTypeCounts: Partial<Record<EventType, number>>;
  trustLevel: TrustLevel;
  evidenceCount: number;
  sourceCount: number;
  issueCount: number;
  decisionCount: number;
  artifactCount: number;
  representedIssueIds: string[];
  representedDecisionIds: string[];
  reason: TimelineBundleReason;
  anchorEventId: string;
};

export type TimelineDisplayItem = TimelineDisplayEvent | TimelineDisplayBundle;

export function isTimelineBundle(item: TimelineDisplayItem): item is TimelineDisplayBundle {
  return item.kind === "bundle";
}

export function isTimelineDisplayEvent(item: TimelineDisplayItem): item is TimelineDisplayEvent {
  return item.kind === "event";
}
