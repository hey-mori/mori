import { eventTypeLabels } from "../../domain/constants";
import type { Decision, EventType, Relationship, SourceRef, TimelineEvent, TrustLevel } from "../../domain/types";
import { formatTime } from "../formatting/time";
import {
  buildSourceIndex,
  getActivityLaneVisuals,
  getTimelineLaneForEvent,
  type ActivityLaneId,
} from "./activityModel";
import type {
  TimelineBundleKind,
  TimelineBundleMember,
  TimelineDisplayBundle,
  TimelineDisplayEvent,
  TimelineDisplayItem,
} from "./displayItems";

export type CreateTimelineBundlesOptions = {
  timeWindowMinutes: number;
  minEventsForBundle: number;
  preserveSelectedEventId?: string | null;
  preserveImportantEventIds?: string[];
  maxVisibleItemsPerLane?: number;
  laneDensity?: "comfortable" | "compact" | "dense";
  decisions?: Decision[];
  sources?: readonly SourceRef[];
  /**
   * Per-lane overrides for the bundle thresholds. A single Claude conversation
   * lands every turn in the `aiConversation` lane; clustering it with the same
   * window as a mixed research lane buries readable turns inside one giant
   * "AI 작업 흐름 묶음". The view model passes a looser override for that lane
   * so individual turns stay visible.
   */
  laneOverrides?: Partial<
    Record<ActivityLaneId, { timeWindowMinutes?: number; minEventsForBundle?: number; maxVisibleItemsPerLane?: number }>
  >;
};

export function createTimelineBundles(
  events: TimelineEvent[],
  relationships: Relationship[],
  options: CreateTimelineBundlesOptions,
): TimelineDisplayItem[] {
  const preserve = new Set<string>([
    ...(options.preserveImportantEventIds ?? []),
    ...(options.preserveSelectedEventId ? [options.preserveSelectedEventId] : []),
  ]);
  const decisionsById = new Map((options.decisions ?? []).map((decision) => [decision.id, decision]));

  const sourceIndex = buildSourceIndex(options.sources ?? []);
  const grouped = new Map<ActivityLaneId, TimelineEvent[]>();
  for (const event of [...events].sort(byStart)) {
    const lane = getTimelineLaneForEvent({ event, sources: sourceIndex });
    const bucket = grouped.get(lane);
    if (bucket) {
      bucket.push(event);
    } else {
      grouped.set(lane, [event]);
    }
  }

  const items: TimelineDisplayItem[] = [];

  for (const [laneType, laneEvents] of grouped) {
    const laneItems = createLaneItems(
      laneType,
      laneEvents,
      relationships,
      preserve,
      decisionsById,
      resolveLaneOptions(laneType, options),
    );
    items.push(...laneItems);
  }

  return items.sort((left, right) => {
    if (left.laneType !== right.laneType) return left.laneType.localeCompare(right.laneType);
    return new Date(left.start).getTime() - new Date(right.start).getTime();
  });
}

export function createTimelineDisplayItems(
  events: TimelineEvent[],
  relationships: Relationship[],
  options: CreateTimelineBundlesOptions,
): TimelineDisplayItem[] {
  return createTimelineBundles(events, relationships, options);
}

/** Fold a lane's threshold override (if any) into the base bundle options. */
function resolveLaneOptions(
  laneType: ActivityLaneId,
  options: CreateTimelineBundlesOptions,
): CreateTimelineBundlesOptions {
  const override = options.laneOverrides?.[laneType];
  if (!override) return options;
  return {
    ...options,
    timeWindowMinutes: override.timeWindowMinutes ?? options.timeWindowMinutes,
    minEventsForBundle: override.minEventsForBundle ?? options.minEventsForBundle,
    maxVisibleItemsPerLane: override.maxVisibleItemsPerLane ?? options.maxVisibleItemsPerLane,
  };
}

function createLaneItems(
  laneType: ActivityLaneId,
  laneEvents: TimelineEvent[],
  relationships: Relationship[],
  preserve: Set<string>,
  decisionsById: Map<string, Decision>,
  options: CreateTimelineBundlesOptions,
): TimelineDisplayItem[] {
  const items: TimelineDisplayItem[] = [];
  const clusters: TimelineEvent[][] = [];
  let currentCluster: TimelineEvent[] = [];

  const flushCluster = () => {
    if (currentCluster.length > 0) clusters.push(currentCluster);
    currentCluster = [];
  };

  for (const event of laneEvents) {
    if (preserve.has(event.id) || isImportantEvent(event, decisionsById)) {
      flushCluster();
      items.push(toDisplayEvent(event, laneType));
      continue;
    }

    if (currentCluster.length === 0) {
      currentCluster = [event];
      continue;
    }

    const previous = currentCluster[currentCluster.length - 1];
    if (minutesBetween(previous.start, event.start) <= options.timeWindowMinutes) {
      currentCluster.push(event);
    } else {
      flushCluster();
      currentCluster = [event];
    }
  }
  flushCluster();

  for (const cluster of clusters) {
    if (cluster.length >= options.minEventsForBundle) {
      items.push(createBundle(laneType, cluster, relationships, options));
    } else {
      items.push(...cluster.map((event) => toDisplayEvent(event, laneType)));
    }
  }

  const sortedItems = items.sort(byDisplayStart);
  if (sortedItems.length <= (options.maxVisibleItemsPerLane ?? Number.POSITIVE_INFINITY)) {
    return sortedItems;
  }

  return mergeLaneDensityOverflow(sortedItems, relationships, options, preserve, decisionsById);
}

function mergeLaneDensityOverflow(
  items: TimelineDisplayItem[],
  relationships: Relationship[],
  options: CreateTimelineBundlesOptions,
  preserve: Set<string>,
  decisionsById: Map<string, Decision>,
): TimelineDisplayItem[] {
  const mutable = [...items];

  while (mutable.length > (options.maxVisibleItemsPerLane ?? mutable.length)) {
    const candidateIndex = findBestMergeCandidate(mutable, preserve, decisionsById);
    if (candidateIndex < 0) break;

    const left = mutable[candidateIndex];
    const right = mutable[candidateIndex + 1];
    if (!left || !right || left.kind !== "event" || right.kind !== "event") break;

    const merged = createBundle(left.laneType, [left.event, right.event], relationships, {
      timeWindowMinutes: options.timeWindowMinutes,
    });

    mutable.splice(candidateIndex, 2, merged);
  }

  return mutable.sort(byDisplayStart);
}

function findBestMergeCandidate(
  items: TimelineDisplayItem[],
  preserve: Set<string>,
  decisionsById: Map<string, Decision>,
): number {
  let bestIndex = -1;
  let bestGap = Number.POSITIVE_INFINITY;

  for (let index = 0; index < items.length - 1; index += 1) {
    const left = items[index];
    const right = items[index + 1];
    if (!left || !right) continue;
    if (left.kind !== "event" || right.kind !== "event") continue;
    if (left.laneType !== right.laneType) continue;
    if (preserve.has(left.id) || preserve.has(right.id)) continue;
    if (isImportantEvent(left.event, decisionsById) || isImportantEvent(right.event, decisionsById)) continue;

    const gap = Math.abs(
      new Date(right.start).getTime() - new Date(left.start).getTime(),
    );
    if (gap < bestGap) {
      bestGap = gap;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function createBundle(
  laneType: ActivityLaneId,
  cluster: TimelineEvent[],
  relationships: Relationship[],
  options: Pick<CreateTimelineBundlesOptions, "timeWindowMinutes">,
): TimelineDisplayBundle {
  const first = cluster[0]!;
  const last = cluster[cluster.length - 1]!;
  const members = cluster.map(toBundleMember);
  const eventTypeCounts = countEventTypes(cluster);
  const representedIssueIds = unique(cluster.flatMap((event) => event.linkedIssueIds));
  const representedDecisionIds = unique(cluster.flatMap((event) => event.linkedDecisionIds));
  const bundleKind = inferBundleKind(first.type, representedIssueIds.length, representedDecisionIds.length);
  const trustLevel = inferBundleTrustLevel(cluster);
  const dominantEventNames = cluster.slice(0, 3).map((event) => event.title.replace(/\s*조사$/, ""));

  return {
    kind: "bundle",
    id: `bundle-${laneType}-${first.id}-${last.id}`,
    laneType,
    start: first.start,
    end: last.end ?? last.start,
    title: buildBundleTitle(laneType, first.type, bundleKind, cluster),
    summary: buildBundleSummary(first.type, dominantEventNames, cluster, representedDecisionIds.length, representedIssueIds.length),
    bundleKind,
    dominantType: first.type,
    memberEventIds: cluster.map((event) => event.id),
    members,
    count: cluster.length,
    eventTypeCounts,
    trustLevel,
    evidenceCount: unique(cluster.flatMap((event) => event.sourceRefs)).length,
    sourceCount: unique(cluster.flatMap((event) => event.sourceRefs)).length,
    issueCount: representedIssueIds.length,
    decisionCount: representedDecisionIds.length,
    artifactCount: unique(cluster.flatMap((event) => event.artifactIds ?? [])).length,
    representedIssueIds,
    representedDecisionIds,
    reason: {
      code: "preserveSingleRow",
      message:
        laneType === "conversation"
          ? `${cluster.length}개의 대화 턴이 ${options.timeWindowMinutes}분 이내로 가깝게 이어져, 한눈에 보이도록 하나로 묶었습니다. 펼치면 각 턴을 순서대로 읽을 수 있습니다.`
          : `${cluster.length}개의 ${eventTypeLabels[first.type]} 이벤트가 ${options.timeWindowMinutes}분 이내에 몰려 있어 single-row lane을 유지하기 위해 하나의 work-flow bundle로 표시합니다.`,
      timeWindowMinutes: options.timeWindowMinutes,
      laneType,
    },
    anchorEventId: cluster[Math.floor(cluster.length / 2)]?.id ?? first.id,
    sameConnectorSource: deriveBundleConnectorSource(cluster),
  };
}

/**
 * The connector id shared by every member event, or `null`. A cluster is a
 * "same-source rapid group" when every member carries a `connectorEventId`
 * (`<connectorId>::<session>::<eventId>`) with the same connector prefix —
 * i.e. the burst came from one connector import, not mixed sources.
 */
export function deriveBundleConnectorSource(events: TimelineEvent[]): string | null {
  if (events.length === 0) return null;
  const connectors = new Set<string>();
  for (const event of events) {
    const connectorEventId = event.connectorEventId;
    if (!connectorEventId) return null;
    const connectorId = connectorEventId.split("::")[0];
    if (!connectorId) return null;
    connectors.add(connectorId);
  }
  return connectors.size === 1 ? [...connectors][0]! : null;
}

function buildBundleTitle(
  laneType: ActivityLaneId,
  dominantType: EventType,
  bundleKind: TimelineBundleKind,
  cluster: TimelineEvent[],
): string {
  if (laneType === "conversation") return buildConversationBundleTitle(cluster);
  if (bundleKind === "researchBurst") return "경쟁 제품 조사 흐름";
  if (bundleKind === "issueBurst") return "이슈 생성 흐름";
  if (bundleKind === "decisionBurst") return "결정 정리 흐름";
  if (bundleKind === "codeBurst") {
    const documentation = cluster.some((event) =>
      /README|report|architecture|문서/i.test(event.title),
    );
    return documentation ? "문서/구조 작업 묶음" : "코드 변경 묶음";
  }
  return `${getActivityLaneVisuals(laneType).label || eventTypeLabels[dominantType]} work-flow bundle`;
}

/**
 * Title for a clustered run of conversation turns: count + time range, with a
 * topic hint drawn from the cluster's first turn when it is short enough to
 * read at a glance. The user asked "what is this bundling on?" — this answers
 * "N turns, this time range, about this", never the abstract "AI 작업 흐름".
 */
function buildConversationBundleTitle(cluster: TimelineEvent[]): string {
  const first = cluster[0]!;
  const last = cluster[cluster.length - 1]!;
  const range = `${formatTime(first.start)}–${formatTime(last.end ?? last.start)}`;
  const topic = conversationTopicHint(first);
  const base = `${cluster.length}개 대화 턴 · ${range}`;
  return topic ? `${topic} · ${base}` : base;
}

/**
 * A short topic phrase taken from a turn's user-ask title, when it is concise
 * enough to act as a label. Long asks return null so the bundle falls back to
 * the count + range form rather than truncating mid-sentence.
 */
function conversationTopicHint(event: TimelineEvent): string | null {
  const compact = event.title.replace(/\s+/g, " ").trim();
  if (!compact || compact === "(no response captured)") return null;
  if (compact.length > 24) return null;
  return compact;
}

function buildBundleSummary(
  laneType: EventType,
  eventNames: string[],
  cluster: TimelineEvent[],
  decisionCount: number,
  issueCount: number,
): string {
  const names = eventNames.join(", ");
  if (laneType === "aiConversation") {
    const first = cluster[0]!;
    const last = cluster[cluster.length - 1]!;
    return `${formatTime(first.start)}부터 ${formatTime(last.end ?? last.start)}까지 이어진 ${cluster.length}개의 대화 턴입니다. 카드를 펼치면 사용자 발화와 Claude 응답을 순서대로 읽을 수 있습니다.`;
  }
  if (laneType === "webResearch") {
    return `${names} 등 ${cluster.length}개의 조사 이벤트를 하나의 research burst로 묶어, 같은 탐색 모멘텀으로 읽히게 합니다.`;
  }
  if (laneType === "issue") {
    return `${cluster.length}개의 이슈 후보가 가까운 시간에 생성되어 하나의 issue burst로 정리됩니다.`;
  }
  if (laneType === "fileCode") {
    return `${cluster.length}개의 파일/코드 변경이 짧은 작업 스파이크 안에서 이어졌습니다.`;
  }
  if (decisionCount > 0 || issueCount > 0) {
    return `${cluster.length}개의 ${eventTypeLabels[laneType]} 이벤트가 결정 ${decisionCount}개, 이슈 ${issueCount}개와 맞물린 흐름입니다.`;
  }
  return `${cluster.length}개의 ${eventTypeLabels[laneType]} 이벤트가 짧은 시간 안에 이어져 하나의 흐름으로 묶입니다.`;
}

function inferBundleKind(
  laneType: EventType,
  issueCount: number,
  decisionCount: number,
): TimelineBundleKind {
  if (laneType === "aiConversation") return "conversationBurst";
  if (laneType === "webResearch") return "researchBurst";
  if (laneType === "issue") return "issueBurst";
  if (laneType === "decision" || decisionCount > 1) return "decisionBurst";
  if (laneType === "fileCode" || laneType === "artifact") return "codeBurst";
  if (issueCount > 1) return "issueBurst";
  return "sequence";
}

function inferBundleTrustLevel(events: TimelineEvent[]): TrustLevel {
  if (events.every((event) => event.trustLevel === "verified")) return "verified";
  if (events.some((event) => event.trustLevel === "inferred")) return "inferred";
  return "observed";
}

function toDisplayEvent(event: TimelineEvent, laneType: ActivityLaneId): TimelineDisplayEvent {
  return {
    kind: "event",
    id: event.id,
    laneType,
    start: event.start,
    end: event.end,
    event,
    memberEventIds: [event.id],
  };
}

function toBundleMember(event: TimelineEvent): TimelineBundleMember {
  return {
    eventId: event.id,
    type: event.type,
    title: event.title,
    start: event.start,
    end: event.end,
    trustLevel: event.trustLevel,
    sourceCount: event.sourceRefs.length,
    decisionCount: event.linkedDecisionIds.length,
    issueCount: event.linkedIssueIds.length,
    artifactCount: event.artifactIds?.length ?? 0,
  };
}

function countEventTypes(events: TimelineEvent[]): Partial<Record<EventType, number>> {
  const counts: Partial<Record<EventType, number>> = {};
  for (const event of events) {
    counts[event.type] = (counts[event.type] ?? 0) + 1;
  }
  return counts;
}

function isImportantEvent(event: TimelineEvent, decisionsById: Map<string, Decision>): boolean {
  // A user request is the anchor that opens a "request → work" unit, so it is
  // never folded into a bundle — it stays an individual row/chip in both the
  // stream (where it heads a request group) and the swimlane.
  if (event.openedByUser) return true;
  if (event.type === "decision") return true;
  if (event.linkedDecisionIds.some((decisionId) => decisionsById.get(decisionId)?.importance === "high")) {
    return true;
  }
  if (event.sourceRefs.length > 1) return true;
  if (event.linkedIssueIds.length >= 3) return true;
  return false;
}

function minutesBetween(start: string, end: string): number {
  return Math.abs(new Date(end).getTime() - new Date(start).getTime()) / 60000;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function byStart(left: TimelineEvent, right: TimelineEvent): number {
  return new Date(left.start).getTime() - new Date(right.start).getTime();
}

function byDisplayStart(left: TimelineDisplayItem, right: TimelineDisplayItem): number {
  return new Date(left.start).getTime() - new Date(right.start).getTime();
}
