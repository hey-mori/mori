/**
 * Weekly review model · the aggregate a week reads as, in sentences, not a
 * stats grid (docs/design/record-workspace/screen-specifications.md M8). Pure
 * over records + relations + entities so the view holds no derivation and it
 * stays testable. This is where the old 합계 panel's breakdown moved (audit
 * §4: 합계 → rail one-liner + weekly review).
 */
import type {
  KernelEntity,
  KernelRelation,
  MoriRecord,
} from "../../lib/record-kernel/kernelTypes";
import type { SchemaRegistry } from "../../lib/record-kernel/schemaRegistry";
import { aggregateTrackers, type TrackerGroup } from "./trackerAggregation";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const INSIGHT_SCHEMAS = new Set(["insight", "decision"]);

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
function isoDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function md(date: Date): string {
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/** The Sunday-Saturday week containing `anchor`, as dates and ISO bounds. */
export function weekRange(anchor: Date): { startDate: Date; start: string; end: string } {
  const startDate = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - anchor.getDay());
  const end = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 6);
  return { startDate, start: isoDay(startDate), end: isoDay(end) };
}

/** Shifts an anchor by whole weeks (negative = earlier). */
export function shiftWeeks(anchor: Date, weeks: number): Date {
  return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + weeks * 7);
}

export type DayBar = {
  date: string;
  weekday: string;
  total: number;
  kinds: Array<{ schemaId: string; name: string; count: number }>;
};

export type TrackerDelta = {
  group: TrackerGroup;
  /** This week's metric total minus last week's, when the schema has a metric. */
  deltaMetric: number | null;
};

export type WeeklyReview = {
  rangeLabel: string;
  total: number;
  days: DayBar[];
  trackers: TrackerDelta[];
  insights: MoriRecord[];
};

function inRange(records: MoriRecord[], start: string, end: string): MoriRecord[] {
  return records.filter((record) => {
    if (!record.occurredStart) return false;
    const day = record.occurredStart.slice(0, 10);
    return day >= start && day <= end;
  });
}

export function buildWeeklyReview(
  records: MoriRecord[],
  registry: SchemaRegistry,
  relations: KernelRelation[],
  entities: KernelEntity[],
  anchor: Date,
): WeeklyReview {
  const { startDate, start, end } = weekRange(anchor);
  const thisWeek = inRange(records, start, end);
  const prev = weekRange(shiftWeeks(anchor, -1));
  const lastWeek = inRange(records, prev.start, prev.end);

  const days: DayBar[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + offset);
    const iso = isoDay(date);
    const dayRecords = thisWeek.filter((record) => record.occurredStart?.slice(0, 10) === iso);
    const byKind = new Map<string, number>();
    for (const record of dayRecords) byKind.set(record.schemaId, (byKind.get(record.schemaId) ?? 0) + 1);
    days.push({
      date: iso,
      weekday: WEEKDAYS[date.getDay()],
      total: dayRecords.length,
      kinds: [...byKind.entries()].map(([schemaId, count]) => ({
        schemaId,
        name: registry.get(schemaId)?.name ?? schemaId,
        count,
      })),
    });
  }

  const trackers = aggregateTrackers(thisWeek, relations, entities, registry);
  const lastTrackers = aggregateTrackers(lastWeek, relations, entities, registry);
  const lastMetricBySchema = new Map(lastTrackers.map((group) => [group.schemaId, group.totalMetric]));
  const trackerDeltas: TrackerDelta[] = trackers.map((group) => ({
    group,
    deltaMetric: group.hasMetric ? group.totalMetric - (lastMetricBySchema.get(group.schemaId) ?? 0) : null,
  }));

  const insights = thisWeek.filter((record) => INSIGHT_SCHEMAS.has(record.schemaId));

  return {
    rangeLabel: `${md(startDate)} - ${md(new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 6))}`,
    total: thisWeek.length,
    days,
    trackers: trackerDeltas,
    insights,
  };
}
