/**
 * Calendar grouping · buckets ledger records by the day the activity
 * happened (architecture doc §22, calendar keys on activity time). Records
 * whose activity time is unknown land in their own group rather than being
 * pinned to a fabricated day.
 */
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { displayTime } from "./recordPresentation";

export type CalendarDayGroup = {
  /** ISO date (YYYY-MM-DD), or null for the date-unknown group. */
  date: string | null;
  records: MoriRecord[];
};

/** Groups records by activity day, newest day first, with the date-unknown
 *  group always last. Within a day, newest first. */
export function groupByActivityDay(records: MoriRecord[]): CalendarDayGroup[] {
  const byDay = new Map<string, MoriRecord[]>();
  for (const record of records) {
    const key = record.occurredStart ? record.occurredStart.slice(0, 10) : "unknown";
    const bucket = byDay.get(key);
    if (bucket) bucket.push(record);
    else byDay.set(key, [record]);
  }

  const sortWithin = (group: MoriRecord[]) =>
    [...group].sort((a, b) => displayTime(b).iso.localeCompare(displayTime(a).iso));

  const dated: CalendarDayGroup[] = [...byDay.entries()]
    .filter(([key]) => key !== "unknown")
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, group]) => ({ date, records: sortWithin(group) }));

  const unknown = byDay.get("unknown");
  if (unknown) dated.push({ date: null, records: sortWithin(unknown) });

  return dated;
}

/** Human day label: "2026년 7월 14일 (오늘)", with 오늘 / 어제 markers. */
export function dayLabel(date: string, now: Date): string {
  const [year, month, day] = date.split("-").map(Number);
  const base = `${year}년 ${month}월 ${day}일`;
  const today = isoDay(now);
  const yesterday = isoDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  if (date === today) return `${base} (오늘)`;
  if (date === yesterday) return `${base} (어제)`;
  return base;
}

function isoDay(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
