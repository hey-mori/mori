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
  /**
   * Connector id shared by every member event, when the whole cluster was
   * imported rapidly from one connector source (`connectorEventId` prefix).
   * `null` when members come from mixed sources or lack connector identity.
   */
  sameConnectorSource: string | null;
};

export type TimelineDisplayItem = TimelineDisplayEvent | TimelineDisplayBundle;

export function isTimelineBundle(item: TimelineDisplayItem): item is TimelineDisplayBundle {
  return item.kind === "bundle";
}

export function isTimelineDisplayEvent(item: TimelineDisplayItem): item is TimelineDisplayEvent {
  return item.kind === "event";
}

/**
 * Sort display items purely by start time. The swimlane layout groups items
 * by lane; the narrow-width chronological list needs a single flat timeline,
 * so this is the shared, tested ordering helper for that view.
 */
export function sortDisplayItemsChronologically(
  items: readonly TimelineDisplayItem[],
): TimelineDisplayItem[] {
  return [...items].sort(
    (left, right) => new Date(left.start).getTime() - new Date(right.start).getTime(),
  );
}

/**
 * Korean label for a bundle kind. The raw `TimelineBundleKind` enum must
 * never reach the UI — the bundle inspector reads this instead.
 */
export function describeBundleKind(kind: TimelineBundleKind): string {
  switch (kind) {
    case "sequence":
      return "연속 작업 흐름";
    case "decisionBurst":
      return "결정 정리 흐름";
    case "issueBurst":
      return "이슈 생성 흐름";
    case "researchBurst":
      return "조사 흐름";
    case "codeBurst":
      return "코드 변경 묶음";
    case "evidenceBurst":
      return "근거 수집 흐름";
    case "workflowBurst":
      return "워크플로 묶음";
    default:
      return "작업 묶음";
  }
}

/** Korean label for why a cluster of events was bundled. */
export function describeBundleReason(code: TimelineBundleReasonCode): string {
  switch (code) {
    case "laneDensity":
      return "레인 밀도";
    case "timeWindow":
      return "근접 작업 모멘트";
    case "microSequence":
      return "마이크로 시퀀스";
    case "preserveSingleRow":
      return "단일 행 유지";
    default:
      return "작업 묶음";
  }
}
