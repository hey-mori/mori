import { useEffect, useState } from "react";

/**
 * A clock that stays honest across midnight.
 *
 * Screens that label records 오늘 / 어제, and the date inference that reads
 * "오늘" out of a note, both need the current day. Freezing it at mount (the
 * old `useMemo(() => new Date(), [])`) is stable but lies: leave 기록 open past
 * midnight and yesterday's rows still read 오늘, and a confirmed extraction
 * persists the wrong activity date.
 *
 * The identity only changes when the local day rolls over, so a day's worth of
 * memos keyed on `now` never thrash. A sleeping machine can miss the timer, so
 * waking the window re-checks the day too.
 */
function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    // Only adopt a new Date when the day actually changed, so the identity
    // stays stable for every consumer memo within a day.
    const refresh = () => {
      setNow((prev) => (localDayKey(prev) === localDayKey(new Date()) ? prev : new Date()));
    };

    const scheduleMidnight = () => {
      const current = new Date();
      const midnight = new Date(current);
      midnight.setHours(24, 0, 0, 0);
      timer = setTimeout(
        () => {
          refresh();
          scheduleMidnight();
        },
        Math.max(1_000, midnight.getTime() - current.getTime()),
      );
    };

    scheduleMidnight();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return now;
}
