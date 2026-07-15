/**
 * Date-rule memory · a small persisted counter for how many times the user
 * has resolved a small-hours capture to the previous day. When it reaches the
 * threshold, the workspace offers to make the correction durable as a rule
 * (see `dateRuleLearning`). Local-only, like the composer draft; it never
 * leaves the device and holds no record content.
 */
const KEY = "mori.dateRule.lateNightPrev.v1";

/** Corrections before Mori offers the rule. */
export const LATE_NIGHT_PREV_THRESHOLD = 3;

function read(): number {
  try {
    return Number(localStorage.getItem(KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function lateNightPrevCount(): number {
  return read();
}

export function bumpLateNightPrev(): number {
  const next = read() + 1;
  try {
    localStorage.setItem(KEY, String(next));
  } catch {
    /* storage unavailable: the offer just will not trigger this session */
  }
  return next;
}

export function resetLateNightPrev(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
