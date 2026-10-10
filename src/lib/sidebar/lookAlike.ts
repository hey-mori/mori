/**
 * Telling look-alike sessions apart in a list.
 *
 * Several real sessions share one title (scripted runs, a repeated ask), and a
 * list of identical rows cannot be read. Rows whose titles read the same get a
 * factual distinguisher: when the session started, with the date only when the
 * look-alikes do not all fall on one day, and seconds only when two started in
 * the same minute. Rows with a unique title get nothing. It is never a guessed
 * label and never request text, so it is safe at every disclosure level.
 */

export type LookAlikeRow = {
  id: string;
  title: string;
  /** When the session started, if known. */
  startedAt?: string;
  /** Any other moment the row is known by (last activity), used only when
   *  the start is unknown. */
  at?: string;
};

const SEOUL = "Asia/Seoul";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: SEOUL, year: "numeric", month: "2-digit", day: "2-digit" });
const dayLabel = new Intl.DateTimeFormat("ko-KR", { timeZone: SEOUL, month: "long", day: "numeric" });
const minuteLabel = new Intl.DateTimeFormat("ko-KR", { timeZone: SEOUL, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const secondLabel = new Intl.DateTimeFormat("ko-KR", {
  timeZone: SEOUL,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function sameTitleKey(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

function validDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Hints by row id, only for rows that share their title with another row.
 *  `omitDate` is for a surface that already shows each row's date: the hint
 *  is then the time alone (two rows are still told apart by their dates). */
export function lookAlikeHints(
  rows: readonly LookAlikeRow[],
  { omitDate = false }: { omitDate?: boolean } = {},
): Map<string, string> {
  const groups = new Map<string, LookAlikeRow[]>();
  for (const row of rows) {
    const key = sameTitleKey(row.title);
    if (!key) continue;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  const hints = new Map<string, string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const dated = group
      .map((row) => {
        const started = validDate(row.startedAt);
        const date = started ?? validDate(row.at);
        return date ? { row, date, isStart: started !== null } : null;
      })
      .filter((entry): entry is { row: LookAlikeRow; date: Date; isStart: boolean } => entry !== null);
    if (dated.length === 0) continue;
    const oneDay = new Set(dated.map((entry) => dayKey.format(entry.date))).size === 1;
    const showDate = !oneDay && !omitDate;
    const label = (date: Date, clock: Intl.DateTimeFormat) =>
      showDate ? `${dayLabel.format(date)} ${clock.format(date)}` : clock.format(date);
    // Collisions are judged with the day, shown or not.
    const byMinute = dated.map((entry) => `${dayKey.format(entry.date)} ${minuteLabel.format(entry.date)}`);
    const perMinute = new Map<string, number>();
    for (const when of byMinute) perMinute.set(when, (perMinute.get(when) ?? 0) + 1);
    for (const [index, entry] of dated.entries()) {
      const collides = (perMinute.get(byMinute[index]) ?? 0) > 1;
      const when = label(entry.date, collides ? secondLabel : minuteLabel);
      hints.set(entry.row.id, entry.isStart ? `${when} 시작` : when);
    }
  }
  return hints;
}
