import type { EventType, TimelineEvent, TrustLevel } from "../../domain/types";
import type { ActivityLaneId } from "./activityModel";

export type TimelineBundleKind =
  | "sequence"
  | "conversationBurst"
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
  laneType: ActivityLaneId;
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
  laneType: ActivityLaneId;
  start: string;
  end?: string;
  event: TimelineEvent;
  memberEventIds: string[];
};

export type TimelineDisplayBundle = {
  kind: "bundle";
  id: string;
  laneType: ActivityLaneId;
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
    case "conversationBurst":
      return "연속 대화 턴";
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

/**
 * Per-segment density profile for a bundle, derived from when its member
 * events occurred across the bundle's `[start, end]` span. Returns `segments`
 * normalized heights in `0..1` (the busiest segment is `1`). Pure — it reads
 * the bundle's own `members`, never the event store.
 *
 * The bundle card renders this as a calm, subordinate micro-bar so a dense
 * burst *looks* dense without the card having to expand or spill a count
 * list. A burst clustered at one moment leans left; a steady stream spreads
 * evenly; an instantaneous cluster collapses to a single full bar.
 */
export function buildBundleDensityProfile(
  bundle: Pick<TimelineDisplayBundle, "start" | "end" | "members">,
  segments = 7,
): number[] {
  const count = Math.max(1, Math.floor(segments));
  const buckets = new Array<number>(count).fill(0);
  const members = bundle.members ?? [];
  if (members.length === 0) return buckets;

  const startMs = new Date(bundle.start).getTime();
  const endMs = new Date(bundle.end).getTime();
  const span = endMs - startMs;
  if (!Number.isFinite(span) || span <= 0) {
    // Instantaneous cluster — show the whole burst as one full bar so the
    // card still reads as dense rather than empty.
    buckets[0] = 1;
    return buckets;
  }

  for (const member of members) {
    const t = new Date(member.start).getTime();
    if (!Number.isFinite(t)) continue;
    let idx = Math.floor(((t - startMs) / span) * count);
    if (idx < 0) idx = 0;
    if (idx >= count) idx = count - 1;
    buckets[idx] += 1;
  }

  const max = Math.max(...buckets, 1);
  return buckets.map((value) => value / max);
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
