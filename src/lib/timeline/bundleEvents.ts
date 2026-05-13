import { eventTypeLabels } from "../../domain/constants";
import type { Decision, EventType, Relationship, TimelineEvent, TrustLevel } from "../../domain/types";
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
  laneDensity?: "comfortable" | "compact";
  decisions?: Decision[];
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

  const grouped = new Map<EventType, TimelineEvent[]>();
  for (const event of [...events].sort(byStart)) {
    const bucket = grouped.get(event.type);
    if (bucket) {
      bucket.push(event);
    } else {
      grouped.set(event.type, [event]);
    }
  }

  const items: TimelineDisplayItem[] = [];

  for (const [, laneEvents] of grouped) {
    const laneItems = createLaneItems(laneEvents, relationships, preserve, decisionsById, options);
    items.push(...laneItems);
  }

  return items.sort((left, right) => {
    if (left.laneType !== right.laneType) return left.laneType.localeCompare(right.laneType);
    return new Date(left.start).getTime() - new Date(right.start).getTime();
  });
}

function createLaneItems(
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
      items.push(toDisplayEvent(event));
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
      items.push(createBundle(cluster, relationships, options));
    } else {
      items.push(...cluster.map(toDisplayEvent));
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

    const merged = createBundle([left.event, right.event], relationships, {
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
  const relatedRelationships = relationships.filter((relationship) =>
    cluster.some((event) => relationship.fromId === event.id || relationship.toId === event.id),
  );
  const dominantEventNames = cluster.slice(0, 3).map((event) => event.title.replace(/\s*조사$/, ""));

  return {
    kind: "bundle",
    id: `bundle-${first.type}-${first.id}-${last.id}`,
    laneType: first.type,
    start: first.start,
    end: last.end ?? last.start,
    title: buildBundleTitle(first.type, bundleKind, cluster),
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
      message: `${cluster.length}개의 ${eventTypeLabels[first.type]} 이벤트가 ${options.timeWindowMinutes}분 이내에 몰려 있어 single-row lane을 유지하기 위해 하나의 work-flow bundle로 표시합니다.`,
      timeWindowMinutes: options.timeWindowMinutes,
      laneType: first.type,
    },
    anchorEventId: cluster[Math.floor(cluster.length / 2)]?.id ?? first.id,
  };
}

function buildBundleTitle(
  laneType: EventType,
  bundleKind: TimelineBundleKind,
  cluster: TimelineEvent[],
): string {
  if (bundleKind === "researchBurst") return "경쟁 제품 조사 흐름";
  if (bundleKind === "issueBurst") return "이슈 생성 흐름";
  if (bundleKind === "decisionBurst") return "결정 정리 흐름";
  if (bundleKind === "codeBurst") {
    const documentation = cluster.some((event) =>
      /README|report|architecture|문서/i.test(event.title),
    );
    return documentation ? "문서/구조 작업 묶음" : "코드 변경 묶음";
  }
  if (laneType === "aiConversation") return "AI 작업 흐름 묶음";
  return `${eventTypeLabels[laneType]} work-flow bundle`;
}

function buildBundleSummary(
  laneType: EventType,
  eventNames: string[],
  cluster: TimelineEvent[],
  decisionCount: number,
  issueCount: number,
): string {
  const names = eventNames.join(", ");
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

function toDisplayEvent(event: TimelineEvent): TimelineDisplayEvent {
  return {
    kind: "event",
    id: event.id,
    laneType: event.type,
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
