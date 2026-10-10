/**
 * Whether a source conversation may disappear, and what Mori already keeps of
 * it: independent facts, never one status.
 *
 * - **presence**: is the original transcript there now (from the latest
 *   discovery), gone, or not known yet;
 * - **cleanup**: an *estimate* of when the agent's age-based cleanup may reach
 *   it (Claude Code `cleanupPeriodDays`, default 30): its file's last change
 *   plus the period. The agent's docs do not say exactly which age it uses or
 *   when the sweep runs, so this is "may be eligible", never a deadline;
 * - **kept**: what Mori holds regardless: saved passages, a whole-session
 *   archive (and whether it covers the transcript as it is now), an earlier
 *   import;
 *
 * Nothing here reads a transcript, decides importance, or keeps anything.
 */

export const DEFAULT_CLEANUP_DAYS = 30;
/** How far ahead of the estimate a source counts as approaching. */
export const APPROACHING_DAYS = 7;
const DAY_MS = 86_400_000;

export type CleanupPolicyInput = {
  /** Null when no checked settings file sets it: the default is assumed. */
  periodDays: number | null;
  /** "invalid": the deciding file sets a value Mori cannot read as a period,
   *  so no estimate is made at all. */
  source: "managed" | "user" | "unset" | "invalid";
};

export type RetentionSourceInput = {
  sessionId: string;
  title: string;
  /** The title is the first request's text, shown by the disclosure rule. */
  titleFromRequest?: boolean;
  /** The original transcript's last change (file time) when discovered. */
  modifiedAt?: string;
  bytes?: number;
  presence: "present" | "missing" | "unknown";
  excerpts: number;
  archive: { archivedAt: string; bytes: number } | null;
  /** An earlier import exists (it may be partial). */
  imported: boolean;
  /** Where the original was found, to check it is still there and to keep it. */
  sourcePath?: string;
  /** What helps decide whether to keep it, as observed: the agent's working
   *  folder, how many messages (only when counted whole) and PRs it names. */
  projectLabel?: string;
  messageCount?: number;
  prCount?: number;
};

export type CleanupEstimate =
  | { state: "unknown"; basis: "configured" | "default"; periodDays: number }
  | {
      state: "ok" | "approaching" | "mayBeEligible";
      basis: "configured" | "default";
      periodDays: number;
      /** Last change + period: the earliest the cleanup may take it. */
      eligibleAt: string;
      /** Whole days until then; 0 or less once reached. */
      daysLeft: number;
    };

export type RetentionAssessment = RetentionSourceInput & {
  cleanup: CleanupEstimate;
  /** The archive holds the transcript as it is now (nothing said since). */
  archiveCurrent: boolean;
  /** Present, cleanup approaching or reached, and not wholly kept. */
  needsAttention: boolean;
  /** Gone, with no archive: only what is listed under `kept` survives. */
  lost: boolean;
};

export function estimateCleanup(
  modifiedAt: string | undefined,
  policy: CleanupPolicyInput,
  now: number,
): CleanupEstimate {
  const periodDays = policy.periodDays ?? DEFAULT_CLEANUP_DAYS;
  const basis = policy.periodDays === null ? "default" : "configured";
  const changed = modifiedAt ? Date.parse(modifiedAt) : Number.NaN;
  if (policy.source === "invalid" || Number.isNaN(changed)) return { state: "unknown", basis, periodDays };
  const eligible = changed + periodDays * DAY_MS;
  const daysLeft = Math.ceil((eligible - now) / DAY_MS);
  const state = eligible <= now ? "mayBeEligible" : daysLeft <= APPROACHING_DAYS ? "approaching" : "ok";
  return { state, basis, periodDays, eligibleAt: new Date(eligible).toISOString(), daysLeft };
}

export function assessRetention(
  source: RetentionSourceInput,
  policy: CleanupPolicyInput,
  now: number,
): RetentionAssessment {
  const cleanup = estimateCleanup(source.modifiedAt, policy, now);
  // An archive smaller than the transcript is now misses what was said after
  // it was taken. An unknown current size establishes nothing either way.
  const archiveCurrent = Boolean(source.archive && (source.bytes === undefined || source.archive.bytes >= source.bytes));
  const atRisk = cleanup.state === "approaching" || cleanup.state === "mayBeEligible";
  return {
    ...source,
    cleanup,
    archiveCurrent,
    needsAttention: source.presence === "present" && atRisk && !archiveCurrent,
    lost: source.presence === "missing" && !source.archive,
  };
}

/** Sources worth the user's attention, most urgent first; everything else is quiet. */
export function retentionAttention(assessments: readonly RetentionAssessment[]): RetentionAssessment[] {
  const urgency = (a: RetentionAssessment) => (a.cleanup.state === "unknown" ? Number.POSITIVE_INFINITY : a.cleanup.daysLeft);
  return assessments.filter((a) => a.needsAttention).sort((a, b) => urgency(a) - urgency(b) || a.title.localeCompare(b.title));
}

/** One honest phrase for the cleanup estimate. */
export function cleanupPhrase(cleanup: CleanupEstimate): string {
  if (cleanup.state === "unknown") return "정리 시점을 알 수 없음";
  if (cleanup.state === "mayBeEligible") return "지금 정리 대상일 수 있음";
  if (cleanup.state === "approaching") return `약 ${Math.max(cleanup.daysLeft, 1)}일 뒤 정리 대상일 수 있음`;
  return `약 ${cleanup.daysLeft}일 뒤 정리 대상일 수 있음`;
}

/** What Mori keeps of a source, in one line. */
export function keptPhrase(a: Pick<RetentionAssessment, "excerpts" | "archive" | "archiveCurrent" | "imported">): string {
  const parts: string[] = [];
  if (a.archive) parts.push(a.archiveCurrent ? "원본 보관됨" : "보관 이후 대화 있음");
  if (a.excerpts > 0) parts.push(`저장한 구절 ${a.excerpts}개`);
  if (!a.archive && a.imported) parts.push("이전에 가져온 기록");
  return parts.length > 0 ? parts.join(" · ") : "Mori에 남긴 것 없음";
}
