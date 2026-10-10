/**
 * A project's history as days: which sessions ran and which records were made
 * on each day, newest first, with the quiet stretches between them said once.
 *
 * Built only from what Mori already holds about each session: its first and
 * last recorded activity, its message count, the PRs and branches its
 * transcript mentions (an observation, never "created" or "merged"), and the
 * session it continued in. No transcript is read and no time is invented: a
 * session sits on the day of its last recorded activity (a session resumed
 * over weeks is listed where it last moved, with the day it began), and an
 * item without a time is listed apart. What happened on the days between a
 * session's first and last activity is not known here and is not claimed.
 */

export type ChronologySessionInput = {
  id: string;
  title: string;
  /** First and last recorded activity (ISO), when known. */
  start?: string;
  end?: string;
  /** Messages in the transcript, when counted completely. */
  messages?: number;
  /** PRs the transcript mentions (from the session record's evidence). */
  prs?: readonly { repository: string; number: number; url: string; firstObservedAt: string }[];
  /** The session this transcript continues in, when the source says so. */
  continuesIn?: string;
};

export type ChronologyRecordInput = {
  id: string;
  title: string;
  schemaId: string;
  /** When the record happened, else when it was captured: an instant, or a
   *  bare `YYYY-MM-DD` day (no time of day is then claimed). */
  at?: string;
};

export type ChronologySession = {
  kind: "session";
  id: string;
  title: string;
  start: string;
  end: string | null;
  /** Whole minutes between first and last activity; null without an end. */
  minutes: number | null;
  /** Calendar days the activity touches (1 when it starts and ends the same day). */
  days: number;
  messages: number | null;
  /** PRs the transcript mentions, most recently first seen first. */
  prs: { repository: string; number: number; url: string }[];
  continuesIn: string | null;
};

export type ChronologyRecord = {
  kind: "record";
  id: string;
  title: string;
  schemaId: string;
  at: string;
  /** The record has a day but no time of day. */
  dateOnly: boolean;
};

export type ChronologyItem = ChronologySession | ChronologyRecord;

export type ChronologyDay = {
  /** Local calendar date, `YYYY-MM-DD`. */
  date: string;
  /** Days with no activity between this day and the next newer active day. */
  quietDaysAfter: number;
  /** Newest first. */
  items: ChronologyItem[];
};

export type ProjectChronology = {
  days: ChronologyDay[];
  /** Items with no usable time, listed apart rather than placed on a guess. */
  undated: ChronologyItem[];
  span: { first: string; last: string } | null;
  activeDays: number;
  sessions: number;
  records: number;
  /** Distinct PRs mentioned across the project's sessions. */
  prs: number;
};

const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Milliseconds for ordering; a bare day counts as its local midnight. */
function timeOf(iso: string): number {
  if (DAY_ONLY.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y!, m! - 1, d!).getTime();
  }
  return Date.parse(iso);
}

const valid = (iso: string | undefined): iso is string => Boolean(iso) && !Number.isNaN(timeOf(iso!));

/** The local calendar date of an instant, `YYYY-MM-DD`; a bare day as it is. */
export function localDay(iso: string): string {
  if (DAY_ONLY.test(iso)) return iso;
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayNumber(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Math.round(Date.UTC(y!, m! - 1, d!) / 86_400_000);
}

export function buildProjectChronology(input: {
  sessions: readonly ChronologySessionInput[];
  records: readonly ChronologyRecordInput[];
  /** Calendar day of an instant; local time by default (tests pass UTC). */
  dayOf?: (iso: string) => string;
}): ProjectChronology {
  const dayOf = input.dayOf ?? localDay;
  const dated: { day: string; at: string; ms: number; item: ChronologyItem }[] = [];
  const undated: ChronologyItem[] = [];
  const prKeys = new Set<string>();

  for (const session of input.sessions) {
    const start = valid(session.start) ? session.start : null;
    const end = valid(session.end) && start && timeOf(session.end!) >= timeOf(start) ? session.end! : null;
    const prs = [...(session.prs ?? [])]
      .sort((a, b) => (timeOf(b.firstObservedAt) || 0) - (timeOf(a.firstObservedAt) || 0) || b.number - a.number)
      .map((pr) => ({ repository: pr.repository, number: pr.number, url: pr.url }));
    for (const pr of prs) prKeys.add(`${pr.repository}#${pr.number}`);
    const item: ChronologySession = {
      kind: "session",
      id: session.id,
      title: session.title,
      start: start ?? "",
      end,
      minutes: start && end ? Math.floor((timeOf(end) - timeOf(start)) / 60_000) : null,
      days: start && end ? dayNumber(dayOf(end)) - dayNumber(dayOf(start)) + 1 : 1,
      messages: typeof session.messages === "number" ? session.messages : null,
      prs,
      continuesIn: session.continuesIn ?? null,
    };
    const last = end ?? start;
    if (last) dated.push({ day: dayOf(last), at: last, ms: timeOf(last), item });
    else undated.push(item);
  }
  for (const record of input.records) {
    const at = record.at ?? "";
    const item: ChronologyRecord = { kind: "record", id: record.id, title: record.title, schemaId: record.schemaId, at, dateOnly: DAY_ONLY.test(at) };
    if (valid(record.at)) dated.push({ day: dayOf(at), at, ms: timeOf(at), item });
    else undated.push(item);
  }

  dated.sort((a, b) => b.ms - a.ms || a.item.id.localeCompare(b.item.id));
  const days: ChronologyDay[] = [];
  for (const entry of dated) {
    const last = days[days.length - 1];
    if (last && last.date === entry.day) last.items.push(entry.item);
    else days.push({ date: entry.day, quietDaysAfter: 0, items: [entry.item] });
  }
  for (let index = 1; index < days.length; index += 1) {
    days[index]!.quietDaysAfter = Math.max(0, dayNumber(days[index - 1]!.date) - dayNumber(days[index]!.date) - 1);
  }
  return {
    days,
    undated,
    span:
      dated.length > 0
        ? {
            // The earliest activity, which may be a session's start, not its last day.
            first: dated.reduce((earliest, entry) => {
              const from = entry.item.kind === "session" && entry.item.start ? entry.item.start : entry.at;
              return timeOf(from) < timeOf(earliest) ? from : earliest;
            }, dated[0]!.at),
            last: dated[0]!.at,
          }
        : null,
    activeDays: days.length,
    sessions: input.sessions.length,
    records: input.records.length,
    prs: prKeys.size,
  };
}
