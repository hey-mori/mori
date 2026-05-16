/**
 * Day-scale Timeline stress fixture.
 *
 * The demo session is deliberately small and its events are mostly
 * instantaneous, so it never exercises the Timeline under realistic load.
 * This fixture builds a full working day of 36 events that covers the cases
 * day-scale usage has to survive:
 *
 *  - every lane populated (AI conversation / decision / issue / file-code /
 *    web research / document-note / artifact),
 *  - overlapping bursts — several events crammed into a < 12 minute window
 *    in the same lane (must cluster into a bundle, never explode the lane),
 *  - same-time clusters — events sharing a start minute,
 *  - short and long events — instantaneous events alongside 45 / 90 minute
 *    ranged events (must exercise duration-aware card width),
 *  - mixed trust — verified / observed / inferred.
 *
 * Pure and deterministic: no randomness, no clock reads, so layout and
 * clustering tests can assert exact behaviour.
 */
import type { EventType, TimelineEvent, TrustLevel } from "../../domain/types";

const SESSION_ID = "sess-timeline-stress";
const PROJECT_ID = "proj-timeline-stress";
const DAY = "2026-06-01";

/** Session range that comfortably contains every fixture event. */
export const TIMELINE_STRESS_RANGE = {
  start: `${DAY}T08:30:00Z`,
  end: `${DAY}T18:30:00Z`,
};

function at(hour: number, minute: number): string {
  return `${DAY}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`;
}

type EventSpec = {
  type: EventType;
  start: [number, number];
  /** Optional end as [hour, minute]; omitted = instantaneous event. */
  end?: [number, number];
  title: string;
  trust: TrustLevel;
  sources?: number;
  issues?: number;
  decisions?: number;
  /** Connector id — when set, the event carries a `connectorEventId`. */
  connector?: string;
};

// 36 events across a 09:00–18:00 working day.
const SPECS: EventSpec[] = [
  // AI conversation — a tight morning burst (6 events in 11 minutes) that
  // must collapse to a bundle. Every burst event is imported from the same
  // `claude-code` connector, so the bundle is a same-source rapid group.
  { type: "aiConversation", start: [9, 30], title: "Claude: 제품 방향 정리", trust: "verified", sources: 1, connector: "claude-code" },
  { type: "aiConversation", start: [9, 32], title: "Claude: 경쟁 제품 비교 질문", trust: "observed", connector: "claude-code" },
  { type: "aiConversation", start: [9, 34], title: "Claude: 메모리 모델 토론", trust: "observed", connector: "claude-code" },
  { type: "aiConversation", start: [9, 37], title: "Claude: 캡처 전략 검토", trust: "inferred", connector: "claude-code" },
  { type: "aiConversation", start: [9, 39], title: "Claude: 리뷰 게이트 토론", trust: "inferred", connector: "claude-code" },
  { type: "aiConversation", start: [9, 41], title: "Claude: 정리 요청", trust: "observed", connector: "claude-code" },
  { type: "aiConversation", start: [10, 0], end: [10, 45], title: "Codex: 타임라인 레이아웃 페어링", trust: "verified", sources: 2 },
  { type: "aiConversation", start: [11, 30], title: "Claude: 인스펙터 카피 점검", trust: "observed", sources: 1 },
  { type: "aiConversation", start: [14, 0], end: [15, 30], title: "Codex: 밀도 모드 구현 세션", trust: "verified", sources: 2 },
  { type: "aiConversation", start: [16, 20], title: "Claude: 회고 정리", trust: "inferred" },

  // Decision — always its own card (never bundled). One ranged.
  { type: "decision", start: [10, 50], end: [11, 5], title: "Timeline을 핵심 표면으로 승격", trust: "verified", decisions: 1 },
  { type: "decision", start: [13, 0], title: "밀도 모드를 3단계로 결정", trust: "verified", decisions: 1 },
  { type: "decision", start: [15, 40], title: "카드 폭은 지속시간 기반으로", trust: "observed", decisions: 1 },
  { type: "decision", start: [17, 10], title: "버스트는 번들로 묶기로", trust: "verified", decisions: 1 },

  // Issue — a 3-event burst plus two singles.
  { type: "issue", start: [11, 0], title: "좁은 폭에서 인스펙터 깨짐", trust: "inferred", issues: 1 },
  { type: "issue", start: [11, 4], title: "레인 높이가 과도하게 커짐", trust: "inferred", issues: 1 },
  { type: "issue", start: [11, 8], title: "동시간대 이벤트 충돌", trust: "observed", issues: 1 },
  { type: "issue", start: [12, 30], title: "데모 데이터가 지속시간 미반영", trust: "observed", issues: 1 },
  { type: "issue", start: [16, 45], title: "타블렛 폭 폴백 부재", trust: "inferred", issues: 1 },

  // File / code — a 4-event burst plus two ranged edits.
  { type: "fileCode", start: [10, 15], end: [10, 25], title: "collisionLayout.ts 수정", trust: "verified", sources: 1 },
  { type: "fileCode", start: [13, 30], title: "TimelineEventCard.tsx", trust: "verified" },
  { type: "fileCode", start: [13, 33], title: "TimelineBundleCard.tsx", trust: "verified" },
  { type: "fileCode", start: [13, 36], title: "TimelineHeader.tsx", trust: "observed" },
  { type: "fileCode", start: [13, 42], title: "styles.css 밀도 규칙", trust: "observed" },
  { type: "fileCode", start: [15, 0], end: [15, 20], title: "timelineViewModel.ts 튜닝", trust: "verified", sources: 1 },

  // Web research — a 4-event burst plus a single.
  { type: "webResearch", start: [9, 50], title: "Linear 타임라인 밀도 조사", trust: "observed" },
  { type: "webResearch", start: [9, 54], title: "Notion 타임라인 카드 조사", trust: "observed" },
  { type: "webResearch", start: [9, 58], title: "Figma 캔버스 스케일 조사", trust: "inferred" },
  { type: "webResearch", start: [10, 5], title: "간트 차트 폭 규칙 조사", trust: "inferred" },
  { type: "webResearch", start: [16, 0], title: "접근성 대비 가이드 확인", trust: "verified" },

  // Document / note.
  { type: "documentNote", start: [11, 45], title: "타임라인 성숙도 감사 메모", trust: "verified", sources: 1 },
  { type: "documentNote", start: [14, 30], end: [14, 40], title: "밀도 모드 결정 메모", trust: "observed" },
  { type: "documentNote", start: [17, 30], title: "다음 세션 인계 메모", trust: "verified" },

  // Artifact.
  { type: "artifact", start: [12, 0], title: "timeline-density.png", trust: "verified", sources: 1 },
  { type: "artifact", start: [14, 50], title: "stress-fixture.json", trust: "observed" },
  { type: "artifact", start: [16, 30], title: "card-width-spec.md", trust: "verified" },
];

/** Build the deterministic 36-event day-scale Timeline stress event set. */
export function buildTimelineStressEvents(): TimelineEvent[] {
  return SPECS.map((spec, index) => {
    const id = `stress-evt-${String(index + 1).padStart(2, "0")}`;
    return {
      id,
      sessionId: SESSION_ID,
      projectId: PROJECT_ID,
      start: at(spec.start[0], spec.start[1]),
      ...(spec.end ? { end: at(spec.end[0], spec.end[1]) } : {}),
      ...(spec.connector ? { connectorEventId: `${spec.connector}::stress::${id}` } : {}),
      type: spec.type,
      title: spec.title,
      summary: `${spec.title} — 작업 흐름 재구성용 stress 이벤트.`,
      sourceRefs: Array.from({ length: spec.sources ?? 0 }, (_, i) => `${id}-src-${i + 1}`),
      linkedIssueIds: Array.from({ length: spec.issues ?? 0 }, (_, i) => `${id}-iss-${i + 1}`),
      linkedDecisionIds: Array.from({ length: spec.decisions ?? 0 }, (_, i) => `${id}-dec-${i + 1}`),
      relationshipIds: [],
      trustLevel: spec.trust,
      confidence: spec.trust === "verified" ? 0.95 : spec.trust === "observed" ? 0.72 : 0.48,
      createdBy: "import",
      userModified: false,
    } satisfies TimelineEvent;
  });
}

/** Count of events in the stress fixture (kept in sync with `SPECS`). */
export const TIMELINE_STRESS_EVENT_COUNT = SPECS.length;
