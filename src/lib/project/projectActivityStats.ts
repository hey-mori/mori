/**
 * Per-project activity stats — a compact, timestamp-only summary.
 *
 * Mirrors the Home dashboard's activity tiles for a single project: total
 * sessions, the current and longest consecutive-day streaks, and the most
 * recent activity. Like `buildProjectActivity`, it needs only the project's
 * session timestamps, so the project page can show streaks without loading any
 * session bodies.
 *
 * Days are counted in local time (Korea has no DST, so a day ordinal is a clean
 * floor of local-midnight epochs). The current streak counts back from today,
 * or from yesterday when today has no session yet, so it does not read 0 just
 * because nothing has landed today.
 */

const DAY_MS = 86_400_000;

export type ProjectActivityStats = {
  sessions: number;
  currentStreak: number;
  longestStreak: number;
  lastActive: string | null;
};

function dayOrdinal(epoch: number): number {
  const d = new Date(epoch);
  d.setHours(0, 0, 0, 0);
  return Math.round(d.getTime() / DAY_MS);
}

export function buildProjectActivityStats(
  timestamps: ReadonlyArray<string>,
  now: number = Date.now(),
): ProjectActivityStats {
  const epochs = timestamps
    .map((t) => new Date(t).getTime())
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  if (epochs.length === 0) {
    return { sessions: 0, currentStreak: 0, longestStreak: 0, lastActive: null };
  }

  const ordinals = new Set<number>();
  for (const epoch of epochs) ordinals.add(dayOrdinal(epoch));
  const sorted = [...ordinals].sort((a, b) => a - b);

  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    run = sorted[i] === sorted[i - 1]! + 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  const today = dayOrdinal(now);
  // Anchor the current streak at today, else yesterday — otherwise it is broken.
  let anchor = ordinals.has(today) ? today : ordinals.has(today - 1) ? today - 1 : null;
  let current = 0;
  while (anchor !== null && ordinals.has(anchor)) {
    current += 1;
    anchor -= 1;
  }

  return {
    sessions: epochs.length,
    currentStreak: current,
    longestStreak: longest,
    lastActive: new Date(epochs[epochs.length - 1]!).toISOString(),
  };
}
