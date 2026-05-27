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
 * A varied multi-session bundle across three projects, two storage labels, and
 * the full recency spectrum (today → ~14 weeks ago — inside the 17-week 잔디
 * window). `Mori Product` and `Jinga` stay small; `NG Gateway` (ng-gw) is the
 * heavily-populated project so the activity heatmap, the project workspace, and
 * the home project-spread panel read as a long-running real codebase rather
 * than a couple of dots. Counts are varied but plausible — events, tokens, and
 * recency all spread — so every presentational surface looks like a working
 * install.
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

  // ─── NG Gateway (ng-gw) ─────────────────────────────────────────────────
  // The deep, heavily-populated demo project: a dozen sessions of real-looking
  // API-gateway work, spread across the full ~14-week heatmap window so the
  // 잔디, the project workspace, and the project-spread panel all read as a
  // long-running codebase. Token splits always sum to `tokenTotal`.
  {
    sessionId: `${DEMO_SESSION_ID_PREFIX}ng-gw-routing-redesign`,
    projectId: `${DEMO_SESSION_ID_PREFIX}proj-ng-gw`,
    title: "게이트웨이 라우팅 테이블 재설계",
    projectName: "NG Gateway",
    sourceLabel: "C:/dev/ng-gw",
    savedAt: daysAgo(0, 9, 40),
    startedAt: daysAgo(0, 8, 15),
    status: "analyzing",
    eventCount: 38,
    tokenTotal: 112_300,
    tokenInput: 73_900,
    tokenOutput: 38_400,
  },
  {
    sessionId: `${DEMO_SESSION_ID_PREFIX}ng-gw-jwt-auth`,
    projectId: `${DEMO_SESSION_ID_PREFIX}proj-ng-gw`,
    title: "JWT 인증 미들웨어 도입",
    projectName: "NG Gateway",
    sourceLabel: "C:/dev/ng-gw",
    savedAt: daysAgo(0, 16, 12),
    startedAt: daysAgo(0, 14, 30),
    status: "complete",
    eventCount: 47,
    tokenTotal: 151_200,
    tokenInput: 98_400,
    tokenOutput: 52_800,
  },
  {
    sessionId: `${DEMO_SESSION_ID_PREFIX}ng-gw-rate-limiter`,
    projectId: `${DEMO_SESSION_ID_PREFIX}proj-ng-gw`,
    title: "레이트 리미터 토큰 버킷 구현",
    projectName: "NG Gateway",
    sourceLabel: "C:/dev/ng-gw",
    savedAt: daysAgo(1, 14, 30),
    startedAt: daysAgo(1, 11, 50),
    status: "complete",
    eventCount: 52,
    tokenTotal: 168_500,
    tokenInput: 109_300,
    tokenOutput: 59_200,
  },
  {
    sessionId: `${DEMO_SESSION_ID_PREFIX}ng-gw-circuit-breaker`,
    projectId: `${DEMO_SESSION_ID_PREFIX}proj-ng-gw`,
    title: "서킷 브레이커 폴백 정책 정의",
    projectName: "NG Gateway",
    sourceLabel: "C:/dev/ng-gw",
    savedAt: daysAgo(3, 11, 5),
    startedAt: daysAgo(3, 9, 40),
    status: "complete",
    eventCount: 29,
    tokenTotal: 84_600,
    tokenInput: 55_100,
    tokenOutput: 29_500,
  },
  {
    sessionId: `${DEMO_SESSION_ID_PREFIX}ng-gw-otel-tracing`,
    projectId: `${DEMO_SESSION_ID_PREFIX}proj-ng-gw`,
    title: "OpenTelemetry 분산 트레이싱 연동",
    projectName: "NG Gateway",
    sourceLabel: "C:/dev/ng-gw",
    savedAt: daysAgo(4, 20, 18),
    startedAt: daysAgo(4, 18, 10),
    status: "complete",
    eventCount: 41,
    tokenTotal: 126_700,
    tokenInput: 82_900,
    tokenOutput: 43_800,
  },
  {
    sessionId: `${DEMO_SESSION_ID_PREFIX}ng-gw-grpc-proxy`,
    projectId: `${DEMO_SESSION_ID_PREFIX}proj-ng-gw`,
    title: "gRPC 프록시 마이그레이션",
    projectName: "NG Gateway",
    sourceLabel: "C:/dev/ng-gw",
    savedAt: daysAgo(8, 15, 22),
    startedAt: daysAgo(8, 12, 5),
    status: "complete",
    eventCount: 63,
    tokenTotal: 204_800,
    tokenInput: 134_200,
    tokenOutput: 70_600,
  },
  {
    sessionId: `${DEMO_SESSION_ID_PREFIX}ng-gw-ws-proxy`,
    projectId: `${DEMO_SESSION_ID_PREFIX}proj-ng-gw`,
    title: "WebSocket 업스트림 프록시 구현",
    projectName: "NG Gateway",
    sourceLabel: "C:/dev/ng-gw",
    savedAt: daysAgo(15, 10, 48),
    startedAt: daysAgo(15, 9, 0),
    status: "complete",
    eventCount: 34,
    tokenTotal: 97_400,
    tokenInput: 63_500,
    tokenOutput: 33_900,
  },
  {
    sessionId: `${DEMO_SESSION_ID_PREFIX}ng-gw-canary-deploy`,
    projectId: `${DEMO_SESSION_ID_PREFIX}proj-ng-gw`,
    title: "카나리 배포 파이프라인 구성",
    projectName: "NG Gateway",
    sourceLabel: "C:/dev/ng-gw",
    savedAt: daysAgo(23, 17, 36),
    startedAt: daysAgo(23, 15, 12),
    status: "complete",
    eventCount: 45,
    tokenTotal: 138_900,
    tokenInput: 90_600,
    tokenOutput: 48_300,
  },
  {
    sessionId: `${DEMO_SESSION_ID_PREFIX}ng-gw-response-cache`,
    projectId: `${DEMO_SESSION_ID_PREFIX}proj-ng-gw`,
    title: "응답 캐시 계층 추가",
    projectName: "NG Gateway",
    sourceLabel: "C:/dev/ng-gw",
    savedAt: daysAgo(33, 13, 14),
    startedAt: daysAgo(33, 11, 30),
    status: "complete",
    eventCount: 27,
    tokenTotal: 79_200,
    tokenInput: 51_700,
    tokenOutput: 27_500,
  },
  {
    sessionId: `${DEMO_SESSION_ID_PREFIX}ng-gw-load-test`,
    projectId: `${DEMO_SESSION_ID_PREFIX}proj-ng-gw`,
    title: "부하 테스트와 p99 레이턴시 튜닝",
    projectName: "NG Gateway",
    sourceLabel: "C:/dev/ng-gw",
    savedAt: daysAgo(48, 19, 2),
    startedAt: daysAgo(48, 16, 20),
    status: "complete",
    eventCount: 58,
    tokenTotal: 187_300,
    tokenInput: 122_400,
    tokenOutput: 64_900,
  },
  {
    sessionId: `${DEMO_SESSION_ID_PREFIX}ng-gw-cors-headers`,
    projectId: `${DEMO_SESSION_ID_PREFIX}proj-ng-gw`,
    title: "CORS와 보안 헤더 정리",
    projectName: "NG Gateway",
    sourceLabel: "C:/dev/ng-gw",
    savedAt: daysAgo(67, 11, 50),
    startedAt: daysAgo(67, 10, 35),
    status: "complete",
    eventCount: 19,
    tokenTotal: 44_600,
    tokenInput: 29_800,
    tokenOutput: 14_800,
  },
  {
    sessionId: `${DEMO_SESSION_ID_PREFIX}ng-gw-service-discovery`,
    projectId: `${DEMO_SESSION_ID_PREFIX}proj-ng-gw`,
    title: "서비스 디스커버리 통합",
    projectName: "NG Gateway",
    sourceLabel: "C:/dev/ng-gw",
    savedAt: daysAgo(96, 14, 25),
    startedAt: daysAgo(96, 12, 0),
    status: "complete",
    eventCount: 31,
    tokenTotal: 91_500,
    tokenInput: 59_700,
    tokenOutput: 31_800,
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
