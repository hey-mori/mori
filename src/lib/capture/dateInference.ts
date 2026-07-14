/**
 * Date inference · resolves an activity date from natural-language date words
 * in a capture ("오늘", "어제", "7월 8일"). The result is always marked
 * `ai-inferred` with a confidence: Mori computed the absolute date, so it is
 * honest about that and never presents it as a date the source stated
 * exactly (three-time model, architecture §3.3). No word found returns null,
 * and the record stays `unknown` rather than being pinned to a fabricated day.
 */

export type InferredTime = {
  /** ISO date (YYYY-MM-DD), no time-of-day. */
  occurredStart: string;
  confidence: number;
};

/** Relative day words, offset from the capture day. Longer words are listed
 *  first so a compound like 그저께 is matched before any shorter overlap. */
const RELATIVE_DAYS: Array<{ word: string; delta: number }> = [
  { word: "그저께", delta: -2 },
  { word: "그제", delta: -2 },
  { word: "어제", delta: -1 },
  { word: "오늘", delta: 0 },
  { word: "내일", delta: 1 },
  { word: "모레", delta: 2 },
];

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function inferOccurredTime(text: string, now: Date): InferredTime | null {
  for (const { word, delta } of RELATIVE_DAYS) {
    if (text.includes(word)) {
      const target = new Date(now.getTime());
      target.setDate(target.getDate() + delta);
      return { occurredStart: toIsoDate(target), confidence: 0.9 };
    }
  }

  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return { occurredStart: iso[0], confidence: 0.95 };
  }

  const monthDay = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (monthDay) {
    const month = Number(monthDay[1]);
    const day = Number(monthDay[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { occurredStart: `${now.getFullYear()}-${pad(month)}-${pad(day)}`, confidence: 0.8 };
    }
  }

  return null;
}
