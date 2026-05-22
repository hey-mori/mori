import type { StoredSessionSummary } from "../storage/storageTypes";

/**
 * Bundled demo session summaries.
 *
 * When the user opens Mori with no real captured sessions, the sidebar and
 * the home recent-list look bare and the new chrome reads as broken. The
 * fixtures below give the demo experience a populated, varied multi-session
 * feel — different titles, different Claude project paths, spread across
 * recency buckets — so the user can see what a working install looks like
 * before they import their own work.
 *
 * These are SUMMARY records only. They drive presentational surfaces
 * (sidebar list, home recent, activity heatmap weighting) and are explicitly
 * marked with the `demo-` id prefix so any caller that wants to filter them
 * out can do so cheaply.
 */

/** Anchor — keeps the fixtures' relative timing stable across days. */
const TODAY_ANCHOR = new Date();

function daysAgo(days: number, hour = 14, minute = 0): string {
  const base = new Date(TODAY_ANCHOR);
  base.setDate(base.getDate() - days);
  base.setHours(hour, minute, 0, 0);
  return base.toISOString();
}

/** Stable prefix so callers can distinguish bundled demos from real sessions. */
export const DEMO_SESSION_ID_PREFIX = "demo-";

/** True when the id was minted by the demo fixtures (never a real session). */
export function isDemoSessionId(sessionId: string): boolean {
  return sessionId.startsWith(DEMO_SESSION_ID_PREFIX);
}

/**
 * Five varied demo sessions across two projects, two storage labels, and the
 * full recency spectrum (today → 12 days ago). Counts are small but honest —
 * a few events, a couple of decisions per session — so the heatmap and the
 * home metrics read as a working install rather than a single dot.
 */
export const DEMO_SESSION_SUMMARIES: StoredSessionSummary[] = [
  {
    sessionId: `${DEMO_SESSION_ID_PREFIX}auth-migration`,
    projectId: `${DEMO_SESSION_ID_PREFIX}proj-mori`,
    title: "Auth 미들웨어 마이그레이션",
    projectName: "Mori Product",
    sourceLabel: "C:/dev/mori",
    savedAt: daysAgo(0, 11, 24),
    startedAt: daysAgo(0, 10, 12),
    status: "complete",
    eventCount: 42,
    tokenTotal: 128_400,
    tokenInput: 84_200,
    tokenOutput: 44_200,
  },
  {
    sessionId: `${DEMO_SESSION_ID_PREFIX}report-templates`,
    projectId: `${DEMO_SESSION_ID_PREFIX}proj-mori`,
    title: "리포트 템플릿 정리",
    projectName: "Mori Product",
    sourceLabel: "C:/dev/mori",
    savedAt: daysAgo(1, 18, 5),
    startedAt: daysAgo(1, 17, 30),
    status: "complete",
    eventCount: 18,
    tokenTotal: 41_900,
    tokenInput: 28_600,
    tokenOutput: 13_300,
  },
  {
    sessionId: `${DEMO_SESSION_ID_PREFIX}invoice-flow`,
    projectId: `${DEMO_SESSION_ID_PREFIX}proj-jinga`,
    title: "인보이스 발행 흐름",
    projectName: "Jinga",
    sourceLabel: "C:/dev/jinga",
    savedAt: daysAgo(2, 22, 14),
    startedAt: daysAgo(2, 20, 0),
    status: "complete",
    eventCount: 31,
    tokenTotal: 96_750,
    tokenInput: 62_300,
    tokenOutput: 34_450,
  },
  {
    sessionId: `${DEMO_SESSION_ID_PREFIX}timeline-redesign`,
    projectId: `${DEMO_SESSION_ID_PREFIX}proj-mori`,
    title: "타임라인 대화-우선 재기획",
    projectName: "Mori Product",
    sourceLabel: "C:/dev/mori",
    savedAt: daysAgo(5, 15, 47),
    startedAt: daysAgo(5, 13, 5),
    status: "complete",
    eventCount: 56,
    tokenTotal: 184_200,
    tokenInput: 121_800,
    tokenOutput: 62_400,
  },
  {
    sessionId: `${DEMO_SESSION_ID_PREFIX}consolidation-spec`,
    projectId: `${DEMO_SESSION_ID_PREFIX}proj-mori`,
    title: "통합 검토 스펙 초안",
    projectName: "Mori Product",
    sourceLabel: "C:/dev/mori",
    savedAt: daysAgo(12, 16, 22),
    startedAt: daysAgo(12, 14, 0),
    status: "complete",
    eventCount: 23,
    tokenTotal: 58_900,
    tokenInput: 39_200,
    tokenOutput: 19_700,
  },
];

/**
 * Merge bundled demo summaries with the real session list. Demos are only
 * surfaced when there are zero real sessions — once the user imports their
 * own work, the sidebar is theirs. Callers that always want the demos (e.g.
 * a "샘플 다시 보기" affordance later) can pass `mode: "always"`.
 */
export function mergeDemoSessionSummaries(
  realSessions: StoredSessionSummary[],
  mode: "fallback" | "always" = "fallback",
): StoredSessionSummary[] {
  if (mode === "fallback" && realSessions.length > 0) return realSessions;
  // Always sort most-recent-first so the merged list matches the real list's
  // ordering contract.
  return [...realSessions, ...DEMO_SESSION_SUMMARIES].sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
  );
}
