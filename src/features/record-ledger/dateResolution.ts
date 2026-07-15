/**
 * Date resolution · turns a date-undecided record into a plain-language
 * situation with context-fit choices (docs/design/record-workspace/
 * time-and-placement-ux.md §2, screen M5).
 *
 * A record is "undecided" when its `timeBasis` is `unknown`: Mori found no
 * activity date and refused to fabricate one (three-time honesty). The user
 * resolves it in the 확인할 것 strip. "날짜 없이 유지" is a real answer, not a
 * dead end: it acknowledges the record has no activity date (kept dateless),
 * distinct from the still-undecided state.
 */
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";

/** A resolution the user can pick. `set` pins an activity date;
 *  `keep-none` acknowledges the record stays dateless; `pick` opens a date
 *  input for an arbitrary day. */
export type DateChoice =
  | { id: string; label: string; kind: "set"; date: string }
  | { id: string; label: string; kind: "keep-none" }
  | { id: string; label: string; kind: "pick" };

export type DateSituation = {
  /** The record needing a decision. */
  reason: string;
  choices: DateChoice[];
};

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
function isoDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function md(isoDate: string): string {
  const [, month, day] = isoDate.split("-").map(Number);
  return `${month}월 ${day}일`;
}

/** True when the record has not had its activity date decided (and so belongs
 *  in the 확인할 것 strip). */
export function isDateUndecided(record: MoriRecord): boolean {
  return record.timeBasis === "unknown";
}

/**
 * The resolution situation for a date-undecided record, or null if the record
 * already has a decided date. The choices adapt to context: a late-night
 * capture offers the previous day first (you likely meant yesterday); an
 * ordinary capture offers today / the capture day.
 */
export function dateSituation(record: MoriRecord, now: Date): DateSituation | null {
  if (!isDateUndecided(record)) return null;

  const captured = new Date(record.capturedAt);
  const captureDay = isoDay(captured);
  const today = isoDay(now);
  const hour = captured.getHours();
  const lateNight = hour >= 0 && hour < 5;

  const pick: DateChoice = { id: "pick", label: "날짜 선택", kind: "pick" };
  const keepNone: DateChoice = { id: "keep-none", label: "날짜 없이 유지", kind: "keep-none" };

  if (lateNight) {
    // The activity likely happened the day before a small-hours log.
    const previous = new Date(captured.getFullYear(), captured.getMonth(), captured.getDate() - 1);
    const previousDay = isoDay(previous);
    return {
      reason: `입력 시각이 ${md(captureDay)} 새벽이에요. 전날 활동일 수 있어요.`,
      choices: [
        { id: "prev", label: `${md(previousDay)} (전날)`, kind: "set", date: previousDay },
        { id: "capture", label: `${md(captureDay)} (입력일)`, kind: "set", date: captureDay },
        pick,
        keepNone,
      ],
    };
  }

  // No date in the text. Offer the capture day (with 오늘 when they coincide).
  if (captureDay === today) {
    return {
      reason: "원문에 날짜가 없어요. 오늘 있었던 일인가요?",
      choices: [
        { id: "today", label: `오늘 (${md(today)})`, kind: "set", date: today },
        pick,
        keepNone,
      ],
    };
  }
  return {
    reason: `원문에 날짜가 없어요. 입력한 날은 ${md(captureDay)}예요.`,
    choices: [
      { id: "capture", label: `입력일 ${md(captureDay)}로`, kind: "set", date: captureDay },
      { id: "today", label: `오늘 (${md(today)})`, kind: "set", date: today },
      pick,
      keepNone,
    ],
  };
}
