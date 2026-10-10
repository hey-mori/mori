/**
 * Calendar grouping · buckets ledger records by the day the activity
 * happened (architecture doc §22, calendar keys on activity time). Records
 * whose activity time is unknown land in their own group rather than being
 * pinned to a fabricated day.
 */
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { displayTime } from "./recordPresentation";
import { isDateUndecided } from "./dateResolution";

export type CalendarDayGroup = {
  /** ISO date (YYYY-MM-DD), or null for the date-unknown group. */
  date: string | null;
  records: MoriRecord[];
};

/**
 * The LOCAL calendar day an activity time falls on.
 *
 * Slicing the ISO string was wrong in both directions and quietly so. A note has
 * no `occurredStart`, so its day comes from `capturedAt`, which the factory
 * writes with `toISOString()` (UTC). Every "today" on these surfaces is built
 * from local getters, so in KST (UTC+9) a note written before 09:00 keyed to the
 * PREVIOUS day: written this morning, filed under yesterday, and on the 1st it
 * fell out of the visible month entirely. Mori's whole claim is that it places
 * work on honest activity time, so being a day out is not a rounding error.
 *
 * A bare `YYYY-MM-DD` (what `setActivityDate` stores) is returned untouched: it
 * is already a calendar day, not an instant, and parsing it would drag it
 * through UTC midnight and shift it a day the other way in any negative offset.
 */
export function activityDay(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso.slice(0, 10) : isoDay(at);
}

/** Groups records by activity day, newest day first, with the date-unknown
 *  group always last. Within a day, newest first. */
export function groupByActivityDay(records: MoriRecord[]): CalendarDayGroup[] {
  const byDay = new Map<string, MoriRecord[]>();
  for (const record of records) {
    const key = record.occurredStart ? activityDay(record.occurredStart) : "unknown";
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

/**
 * The later day a multi-day agent session also sits on: its last-activity day,
 * when that is a later local day than its start (owner decision D4). A session
 * shows on its start day and this day only: every active day in between would
 * invent activity on quiet days. Null for anything else.
 */
export function lastActivityDay(record: MoriRecord): string | null {
  if (record.schemaId !== "agent-session" || !record.occurredStart || !record.occurredEnd) return null;
  if (isDateUndecided(record)) return null;
  const start = activityDay(record.occurredStart);
  const end = activityDay(record.occurredEnd);
  return end > start ? end : null;
}

/** The start day a record continues from when it sits on `day` as a multi-day
 *  session's last-activity day, else null. */
export function continuesFrom(record: MoriRecord, day: string): string | null {
  return record.occurredStart && lastActivityDay(record) === day ? activityDay(record.occurredStart) : null;
}

/** When a record happened on `day`, for ordering and the clock: a multi-day
 *  session's last activity on its later day, else its display time. */
export function timeOnDay(record: MoriRecord, day: string): string {
  return continuesFrom(record, day) && record.occurredEnd ? record.occurredEnd : displayTime(record).iso;
}

/** ISO-date (YYYY-MM-DD) → number of records whose activity day is that date.
 *  Powers the month-calendar's per-day markers. Unknown-date records are
 *  excluded (they have no day to sit on). */
export function recordCountByDate(records: MoriRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const record of records) {
    if (!record.occurredStart) continue;
    const day = activityDay(record.occurredStart);
    counts.set(day, (counts.get(day) ?? 0) + 1);
    const later = lastActivityDay(record);
    if (later) counts.set(later, (counts.get(later) ?? 0) + 1);
  }
  return counts;
}

/** ISO-date → the records whose day is that date, newest first. Only records
 *  with a genuinely undecided date are excluded (they get the 날짜 미정 tray).
 *
 *  Keyed by displayTime, the same rule the 기록 list groups by. Keying off a raw
 *  occurredStart looked equivalent but silently dropped every note: a note is
 *  written with timeBasis capture-fallback and NO occurredStart, which is a
 *  decided day (the day it was written), so the calendar showed agent sessions
 *  and nothing the user had actually typed.
 *
 *  A multi-day agent session also sits on its last-activity day (see
 *  `lastActivityDay`), ordered there by that activity. */
export function recordsByDate(records: MoriRecord[]): Map<string, MoriRecord[]> {
  const byDay = new Map<string, MoriRecord[]>();
  for (const record of records) {
    if (isDateUndecided(record)) continue;
    const days = [activityDay(displayTime(record).iso), lastActivityDay(record)];
    for (const day of days) {
      if (!day) continue;
      const bucket = byDay.get(day);
      if (bucket) bucket.push(record);
      else byDay.set(day, [record]);
    }
  }
  for (const [day, bucket] of byDay) {
    bucket.sort((a, b) => timeOnDay(b, day).localeCompare(timeOnDay(a, day)));
  }
  return byDay;
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
