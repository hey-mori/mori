/**
 * Ledger rail summary · pure derivations for the context rail's time mode
 * (docs/design/record-workspace/screen-specifications.md M1, M8).
 *
 * The old 합계 panel's job splits into the weekly review (R6) and this rail
 * one-liner: what happened this week, read as counts and one metric line,
 * plus the selected-day agenda. Pure over records so it stays testable and
 * the rail never holds its own state.
 */
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import type { SchemaRegistry } from "../../lib/record-kernel/schemaRegistry";

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function isoDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The Sunday-Saturday calendar week containing `now`, as inclusive ISO
 *  bounds. Matches the calendar's 일-토 weekday header. */
export function weekBounds(now: Date): { start: string; end: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return { start: isoDay(start), end: isoDay(end) };
}

export type KindCount = { schemaId: string; name: string; count: number };

export type WeekSummary = {
  total: number;
  kinds: KindCount[];
  /** One metric line ("러닝 누적 1시간 45분"-style), when a metric dominates. */
  metricLine: string | null;
};

/** Records whose activity day falls in the current week (unknown-date records
 *  are excluded: they have no day to place). */
export function recordsInWeek(records: MoriRecord[], now: Date): MoriRecord[] {
  const { start, end } = weekBounds(now);
  return records.filter((record) => {
    if (!record.occurredStart) return false;
    const day = record.occurredStart.slice(0, 10);
    return day >= start && day <= end;
  });
}

function minutesLine(records: MoriRecord[], registry: SchemaRegistry): string | null {
  // Sum the first duration-minutes metric across the week, if any schema has one.
  let totalMinutes = 0;
  let unitName: string | null = null;
  for (const record of records) {
    const schema = registry.get(record.schemaId);
    const metric = schema?.properties.find((property) => property.type === "duration-minutes");
    if (!metric) continue;
    const value = record.properties[metric.key];
    if (typeof value === "number" && Number.isFinite(value)) {
      totalMinutes += value;
      unitName = schema?.name ?? unitName;
    }
  }
  if (totalMinutes <= 0 || !unitName) return null;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const time = hours > 0 ? `${hours}시간${mins > 0 ? ` ${mins}분` : ""}` : `${mins}분`;
  return `${unitName} 누적 ${time}`;
}

export function buildWeekSummary(
  records: MoriRecord[],
  registry: SchemaRegistry,
  now: Date,
): WeekSummary {
  const inWeek = recordsInWeek(records, now);
  const counts = new Map<string, number>();
  for (const record of inWeek) {
    counts.set(record.schemaId, (counts.get(record.schemaId) ?? 0) + 1);
  }
  const kinds: KindCount[] = [...counts.entries()]
    .map(([schemaId, count]) => ({
      schemaId,
      name: registry.get(schemaId)?.name ?? schemaId,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return { total: inWeek.length, kinds, metricLine: minutesLine(inWeek, registry) };
}
