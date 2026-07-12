import type {
  Artifact,
  Decision,
  EventType,
  Issue,
  IssueStatus,
  MockSession,
  NextAction,
  Priority,
  Project,
  Relationship,
  Session,
  SourceRef,
  Summary,
  TimelineEvent,
  TrustLevel,
} from "../../domain/types";
import {
  DEMO_SESSION_SUMMARIES,
  isDemoSessionId,
} from "./demoSessionFixtures";
import type { StoredSessionSummary } from "../storage/storageTypes";

/**
 * Per-demo-session content.
 *
 * The demo summaries in `demoSessionFixtures.ts` only populate *list* surfaces
 * (sidebar, home recent, project workspace). Opening one used to fall through
 * to the single bundled `mockSession` ("Mori 앱 기획"), so every demo row
 * — ng-gw routing, jinga invoice, … — showed the exact same reconstructed
 * session. That made the demo read as broken: the lists were varied but the
 * detail was fixed.
 *
 * This module gives every demo summary its *own* reconstructed body. A compact
 * per-session **blueprint** (a handful of themed timeline beats plus the
 * session's decisions / issues / next actions) is expanded by a shared builder
 * into a full `MockSession` — events spread across the session window,
 * sources wired to the events that cite them, decisions / issues / next actions
 * linked back to their anchor events, a few relationships for Flow Focus, and a
 * resume prompt. The result is honest demo content: clicking a session opens
 * that session, not a stand-in.
 *
 * Everything here is deterministic and read-only — there is no persistence and
 * no analysis pipeline; the view is built fresh (and cached by id) the first
 * time a demo session is opened.
 */

// ─── Blueprint shape ──────────────────────────────────────────────────────────

type BeatType = Exclude<EventType, "other"> | "other";

type DemoBeat = {
  type: BeatType;
  title: string;
  summary: string;
  /** When set, the beat produced a concrete artifact (file / report / doc). */
  artifact?: { title: string; kind: Artifact["kind"]; path: string };
};

type DemoDecisionSpec = {
  title: string;
  decision: string;
  rationale: string;
  rejected: string[];
  impact: string[];
  importance?: Priority;
};

type DemoIssueSpec = {
  title: string;
  description: string;
  status: IssueStatus;
  priority: Priority;
  suggested: string;
};

type DemoNextActionSpec = {
  title: string;
  priority: Priority;
};

type DemoBlueprint = {
  /** One-line description of the project the session belongs to. */
  projectDescription: string;
  /** Honest one-line session summary (drives the 개요 + report headline). */
  summaryLine: string;
  beats: DemoBeat[];
  decisions: DemoDecisionSpec[];
  issues: DemoIssueSpec[];
  nextActions: DemoNextActionSpec[];
};

// ─── Public API ────────────────────────────────────────────────────────────────

const viewCache = new Map<string, MockSession>();

/**
 * Build the full reconstructed `MockSession` for a bundled demo session id,
 * or `null` when the id is not a demo session with authored content. Cached by
 * id so repeated opens return a stable reference (the session-view selector
 * relies on reference stability to avoid render loops).
 */
export function buildDemoSessionContent(sessionId: string): MockSession | null {
  if (!isDemoSessionId(sessionId)) return null;
  const cached = viewCache.get(sessionId);
  if (cached) return cached;

  const summary = DEMO_SESSION_SUMMARIES.find((s) => s.sessionId === sessionId);
  const blueprint = DEMO_BLUEPRINTS[sessionId];
  if (!summary || !blueprint) return null;

  const built = expandBlueprint(summary, blueprint);
  viewCache.set(sessionId, built);
  return built;
}

/** True when the demo session id has authored, openable content. */
export function hasDemoSessionContent(sessionId: string): boolean {
  return (
    isDemoSessionId(sessionId) &&
    Boolean(DEMO_BLUEPRINTS[sessionId]) &&
    DEMO_SESSION_SUMMARIES.some((s) => s.sessionId === sessionId)
  );
}

// ─── Expander ──────────────────────────────────────────────────────────────────

const HOUR_MS = 3_600_000;

function expandBlueprint(
  summary: StoredSessionSummary,
  blueprint: DemoBlueprint,
): MockSession {
  const sid = summary.sessionId;
  const projectId = summary.projectId;
  const startedAt = summary.startedAt || summary.savedAt;
  const endedAt = summary.savedAt;

  const project: Project = {
    id: projectId,
    name: summary.projectName,
    description: blueprint.projectDescription,
    createdAt: startedAt,
    updatedAt: endedAt,
  };

  const timestamps = spreadTimestamps(startedAt, endedAt, blueprint.beats.length);

  // ── Sources: only the kinds the beats actually cite, wired to those events.
  const usesCode = blueprint.beats.some((b) => b.type === "fileCode" || b.type === "artifact");
  const usesNote = blueprint.beats.some((b) => b.type === "documentNote");
  const usesWeb = blueprint.beats.some((b) => b.type === "webResearch");

  const claudeSrcId = `${sid}::src-claude`;
  const gitSrcId = `${sid}::src-git`;
  const noteSrcId = `${sid}::src-note`;
  const webSrcId = `${sid}::src-web`;

  const sourceFor = (type: BeatType): string => {
    if ((type === "fileCode" || type === "artifact") && usesCode) return gitSrcId;
    if (type === "documentNote" && usesNote) return noteSrcId;
    if (type === "webResearch" && usesWeb) return webSrcId;
    return claudeSrcId;
  };

  // ── Events.
  const events: TimelineEvent[] = blueprint.beats.map((beat, index) => {
    const inferred = beat.type === "aiConversation" || beat.type === "decision" || beat.type === "issue";
    const trustLevel: TrustLevel = inferred ? "inferred" : "verified";
    const artifactId = beat.artifact ? `${sid}::art-${index + 1}` : undefined;
    return {
      id: `${sid}::evt-${index + 1}`,
      sessionId: sid,
      projectId,
      start: timestamps[index]!,
      end: undefined,
      type: beat.type,
      title: beat.title,
      summary: beat.summary,
      sourceRefs: [sourceFor(beat.type)],
      linkedIssueIds: [],
      linkedDecisionIds: [],
      relationshipIds: [],
      artifactIds: artifactId ? [artifactId] : [],
      trustLevel,
      confidence: inferred ? 0.84 + (index % 3) * 0.03 : 0.93 + (index % 2) * 0.03,
      createdBy: inferred ? "ai" : "import",
      userModified: false,
    };
  });

  // Stamp a deterministic token figure on the last AI turn, mirroring how a
  // real Claude import attributes the session aggregate to the final assistant
  // event. Scaled by beat count so each demo session carries its own plausible
  // number, and the 개요 토큰 metric shows what real data looks like.
  const lastAiEvent = [...events].reverse().find((event) => event.type === "aiConversation");
  if (lastAiEvent) {
    const beats = blueprint.beats.length;
    const input = beats * 5_200;
    const output = beats * 1_450;
    lastAiEvent.tokenUsage = {
      input,
      output,
      total: input + output,
      model: "claude-opus-4-8",
    };
  }

  const eventAt = (i: number): TimelineEvent | undefined => events[Math.min(i, events.length - 1)];

  // ── Decisions (linked to a decision-beat when present, else spread).
  const decisions: Decision[] = blueprint.decisions.map((spec, index) => {
    const anchor = firstEventOfTypeUnused(events, "decision", index) ?? eventAt(index);
    const decisionId = `${sid}::dec-${index + 1}`;
    if (anchor) anchor.linkedDecisionIds = [...anchor.linkedDecisionIds, decisionId];
    return {
      id: decisionId,
      projectId,
      sessionId: sid,
      title: spec.title,
      decision: spec.decision,
      rationale: spec.rationale,
      rejectedOptions: spec.rejected,
      impact: spec.impact,
      sourceEventIds: anchor ? [anchor.id] : [],
      relatedIssueIds: [],
      relatedSourceIds: [claudeSrcId],
      createdAt: anchor?.start ?? startedAt,
      importance: spec.importance ?? (index === 0 ? "high" : "medium"),
      trustLevel: "inferred",
      confirmed: false,
    };
  });

  // ── Issues (linked to an issue-beat when present, else spread).
  const issues: Issue[] = blueprint.issues.map((spec, index) => {
    const anchor = firstEventOfTypeUnused(events, "issue", index) ?? eventAt(index + 1);
    const issueId = `${sid}::iss-${index + 1}`;
    if (anchor) anchor.linkedIssueIds = [...anchor.linkedIssueIds, issueId];
    return {
      id: issueId,
      projectId,
      sessionId: sid,
      title: spec.title,
      description: spec.description,
      status: spec.status,
      priority: spec.priority,
      sourceEventIds: anchor ? [anchor.id] : [],
      relatedDecisionIds: [],
      relatedFileIds: [],
      suggestedNextAction: spec.suggested,
      assignee: "Kim Mori",
      dueDate: spec.status === "resolved" ? undefined : addDaysIso(endedAt, 5),
      createdAt: anchor?.start ?? startedAt,
      updatedAt: endedAt,
      confidence: 0.82,
      trustLevel: spec.status === "resolved" ? "verified" : "inferred",
    };
  });

  // ── Artifacts from artifact-bearing beats.
  const artifacts: Artifact[] = [];
  blueprint.beats.forEach((beat, index) => {
    if (!beat.artifact) return;
    const event = events[index]!;
    artifacts.push({
      id: `${sid}::art-${index + 1}`,
      projectId,
      sessionId: sid,
      title: beat.artifact.title,
      kind: beat.artifact.kind,
      path: beat.artifact.path,
      sourceEventIds: [event.id],
      createdAt: event.start,
    });
  });

  // ── Relationships — inferred links that surface the reconstruction's
  //    *judgments* in Flow Focus: which discussion a decision came out of,
  //    which conversation surfaced an issue (one discussion can spawn several),
  //    which code change implements a decision, and which conversations are one
  //    continuing thread vs separate. Every endpoint references an id built
  //    above; self-links and duplicates are dropped.
  const relationships: Relationship[] = [];
  const relSeen = new Set<string>();
  const addRel = (
    fromId: string,
    fromType: Relationship["fromType"],
    toId: string,
    toType: Relationship["toType"],
    type: Relationship["type"],
    reason: string,
    confidence: number,
  ) => {
    if (fromId === toId) return;
    const key = `${fromId}->${toId}:${type}`;
    if (relSeen.has(key)) return;
    relSeen.add(key);
    const relId = `${sid}::rel-${relationships.length + 1}`;
    relationships.push({ id: relId, fromId, fromType, toId, toType, type, reason, confidence });
    const from = events.find((e) => e.id === fromId);
    if (from) from.relationshipIds = [...from.relationshipIds, relId];
    const to = events.find((e) => e.id === toId);
    if (to) to.relationshipIds = [...to.relationshipIds, relId];
  };

  const conversationEvents = events.filter((e) => e.type === "aiConversation");
  const latestBefore = (
    iso: string,
    predicate: (e: TimelineEvent) => boolean,
    excludeId?: string,
  ): TimelineEvent | undefined => {
    const t = Date.parse(iso);
    let best: TimelineEvent | undefined;
    for (const e of events) {
      if (e.id === excludeId) continue;
      if (!predicate(e)) continue;
      if (Date.parse(e.start) <= t) best = e;
    }
    return best;
  };

  // 1. Continuing thread: adjacent conversation beats are one discussion;
  //    non-adjacent conversations stay unlinked as separate threads.
  for (let i = 0; i < conversationEvents.length - 1; i += 1) {
    const a = conversationEvents[i]!;
    const b = conversationEvents[i + 1]!;
    if (events.indexOf(b) - events.indexOf(a) === 1) {
      addRel(a.id, "event", b.id, "event", "ledTo", "앞선 대화에서 이어진 논의입니다.", 0.8);
    }
  }

  // 2. Issues: linked to their own anchor event and to the conversation that
  //    surfaced them — so one discussion visibly spawns several issues, and the
  //    surfacing conversation becomes a hub (its `linkedIssueIds` grow too).
  issues.forEach((issue) => {
    const anchorId = issue.sourceEventIds[0];
    if (anchorId) {
      addRel(anchorId, "event", issue.id, "issue", "createdIssue", "이 단계에서 다룰 이슈가 드러났습니다.", 0.8);
    }
    const conv = latestBefore(issue.createdAt, (e) => e.type === "aiConversation", anchorId);
    if (conv) {
      addRel(conv.id, "event", issue.id, "issue", "createdIssue", "대화 중 이 이슈가 도출되었습니다.", 0.78);
      if (!conv.linkedIssueIds.includes(issue.id)) {
        conv.linkedIssueIds = [...conv.linkedIssueIds, issue.id];
      }
    }
  });

  // 3. Decisions: influenced by the most recent preceding discussion / research
  //    beat, and implemented by the next code change.
  decisions.forEach((decision) => {
    const anchorId = decision.sourceEventIds[0];
    const influencer = latestBefore(
      decision.createdAt,
      (e) => e.type === "aiConversation" || e.type === "webResearch",
      anchorId,
    );
    if (influencer) {
      addRel(
        influencer.id,
        "event",
        decision.id,
        "decision",
        "influencedDecision",
        `${trim(influencer.title)} 논의가 이 결정으로 이어졌습니다.`,
        0.83,
      );
    }
    const implementer = events.find(
      (e) => e.type === "fileCode" && Date.parse(e.start) >= Date.parse(decision.createdAt),
    );
    if (implementer) {
      addRel(implementer.id, "event", decision.id, "decision", "supported", "이 변경이 결정을 구현합니다.", 0.8);
    }
  });

  // 4. Artifacts produced by their originating event.
  artifacts.forEach((art) => {
    const evId = art.sourceEventIds[0];
    if (evId) {
      addRel(
        evId,
        "event",
        art.id,
        "artifact",
        "producedArtifact",
        `${trim(art.title)} 산출물을 만들었습니다.`,
        0.92,
      );
    }
  });

  // ── Next actions, linked back to issues / events.
  const nextActions: NextAction[] = blueprint.nextActions.map((spec, index) => {
    const issue = issues[index] ?? issues[issues.length - 1];
    return {
      id: `${sid}::act-${index + 1}`,
      sessionId: sid,
      title: spec.title,
      priority: spec.priority,
      relatedIssueIds: issue ? [issue.id] : [],
      relatedEventIds: issue?.sourceEventIds ?? (eventAt(index) ? [eventAt(index)!.id] : []),
    };
  });

  // ── Sources, each citing the events that referenced it.
  const sources: SourceRef[] = [];
  const eventsCiting = (srcId: string) =>
    events.filter((e) => e.sourceRefs.includes(srcId)).map((e) => e.id);

  sources.push({
    id: claudeSrcId,
    sessionId: sid,
    kind: "aiConversation",
    title: "Claude Code 작업 대화",
    detail: `${summary.title} 진행 과정을 정리한 대화 기록.`,
    trustLevel: "verified",
    redactionStatus: "redacted",
    rawRetention: "summaryOnly",
    capturedAt: startedAt,
    relatedEventIds: eventsCiting(claudeSrcId),
  });
  if (usesCode) {
    sources.push({
      id: gitSrcId,
      sessionId: sid,
      kind: "gitDiff",
      title: "Git diff 스냅샷",
      detail: "세션 중 변경된 파일과 코드 diff.",
      trustLevel: "verified",
      redactionStatus: "notNeeded",
      rawRetention: "retained",
      capturedAt: timestamps[Math.floor(timestamps.length / 2)] ?? startedAt,
      relatedEventIds: eventsCiting(gitSrcId),
    });
  }
  if (usesNote) {
    sources.push({
      id: noteSrcId,
      sessionId: sid,
      kind: "manualNote",
      title: "작업 메모",
      detail: "결정과 다음 작업을 정리한 수동 메모.",
      trustLevel: "verified",
      redactionStatus: "notNeeded",
      rawRetention: "retained",
      capturedAt: timestamps[Math.floor(timestamps.length / 2)] ?? startedAt,
      relatedEventIds: eventsCiting(noteSrcId),
    });
  }
  if (usesWeb) {
    sources.push({
      id: webSrcId,
      sessionId: sid,
      kind: "browser",
      title: "참고 자료 탭",
      detail: "구현에 참고한 문서와 레퍼런스.",
      trustLevel: "observed",
      redactionStatus: "notNeeded",
      rawRetention: "retained",
      capturedAt: timestamps[1] ?? startedAt,
      relatedEventIds: eventsCiting(webSrcId),
    });
  }

  const session: Session = {
    id: sid,
    projectId,
    title: summary.title,
    startedAt,
    endedAt,
    recordingMode: "summary",
    llmProvider: "ollama",
    llmModel: "llama3.1:8b",
    storageLocation: "browser:localStorage",
    selectedSourceIds: sources.map((s) => s.id),
    status: summary.status,
    sourceLabel: summary.sourceLabel,
  };

  const summaryRecord: Summary = {
    id: `${sid}::sum`,
    sessionId: sid,
    sessionSummary: blueprint.summaryLine,
    resumePrompt: buildResumePrompt(summary.title, blueprint),
    reportMarkdown: `# ${summary.title}\n\n${blueprint.summaryLine}`,
    nextActionIds: nextActions.map((a) => a.id),
    generatedAt: endedAt,
  };

  return {
    project,
    session,
    sources,
    events,
    issues,
    decisions,
    relationships,
    artifacts,
    nextActions,
    summary: summaryRecord,
  };
}

// ─── Expander helpers ───────────────────────────────────────────────────────────

/**
 * Find the nth unused event of a given type. Used so multiple decisions /
 * issues anchor to distinct beats of their kind rather than all piling onto
 * the first one. Falls back to `undefined` when there is no matching beat.
 */
function firstEventOfTypeUnused(
  events: TimelineEvent[],
  type: BeatType,
  ordinal: number,
): TimelineEvent | undefined {
  const matches = events.filter((e) => e.type === type);
  return matches[ordinal];
}

function spreadTimestamps(startIso: string, endIso: string, count: number): string[] {
  const startMs = Date.parse(startIso);
  const start = Number.isNaN(startMs) ? Date.now() - 2 * HOUR_MS : startMs;
  const endParsed = Date.parse(endIso);
  let end = Number.isNaN(endParsed) ? start + 2 * HOUR_MS : endParsed;
  if (end <= start) end = start + 2 * HOUR_MS;
  const span = end - start;
  const n = Math.max(count, 1);
  return Array.from({ length: count }, (_, i) =>
    new Date(start + span * ((i + 0.5) / n)).toISOString(),
  );
}

function addDaysIso(iso: string, days: number): string {
  const ms = Date.parse(iso);
  const base = Number.isNaN(ms) ? Date.now() : ms;
  return new Date(base + days * 24 * HOUR_MS).toISOString();
}

function trim(value: string, max = 28): string {
  const v = value.trim();
  return v.length <= max ? v : `${v.slice(0, max - 1)}…`;
}

function buildResumePrompt(title: string, blueprint: DemoBlueprint): string {
  const decisions = blueprint.decisions.map((d) => `- ${d.title}`).join("\n");
  const issues = blueprint.issues
    .filter((i) => i.status !== "resolved")
    .map((i) => `- ${i.title}`)
    .join("\n");
  const actions = blueprint.nextActions.map((a) => `- ${a.title}`).join("\n");
  return [
    `${title} 세션을 이어갑니다.`,
    "",
    blueprint.summaryLine,
    "",
    "주요 결정:",
    decisions || "- (없음)",
    "",
    "열린 이슈:",
    issues || "- (없음)",
    "",
    "다음 작업:",
    actions || "- (없음)",
  ].join("\n");
}

// ─── Blueprints ─────────────────────────────────────────────────────────────────
// Keyed by the full demo session id (DEMO_SESSION_ID_PREFIX + suffix). Every id
// in DEMO_SESSION_SUMMARIES must have an entry — the test suite enforces this so
// a new summary can never silently fall back to the generic demo.

const DEMO_BLUEPRINTS: Record<string, DemoBlueprint> = {
  // ── Mori Product ──────────────────────────────────────────────────────────
  "demo-auth-migration": {
    projectDescription: "로컬 우선 AI 작업 기억 앱 Mori의 제품 코드베이스.",
    summaryLine:
      "세션 인증을 미들웨어 기반으로 옮기고 토큰 갱신 경로를 단일화했습니다.",
    beats: [
      { type: "aiConversation", title: "인증 흐름 현황 점검", summary: "라우트마다 흩어진 인증 검사를 정리하고 문제를 진단." },
      { type: "decision", title: "미들웨어로 인증 일원화", summary: "라우트 핸들러에서 미들웨어 계층으로 인증 검사를 이동하기로 결정." },
      { type: "fileCode", title: "authMiddleware.ts 작성", summary: "토큰 검증·갱신·거부를 한 곳에서 처리하는 미들웨어 구현.", artifact: { title: "authMiddleware.ts", kind: "code", path: "src/server/authMiddleware.ts" } },
      { type: "issue", title: "리프레시 토큰 회전 미구현", summary: "갱신 시 이전 토큰 무효화가 빠져 재사용 위험이 남음." },
      { type: "fileCode", title: "라우트에서 인라인 검사 제거", summary: "중복된 인증 코드를 걷어내고 미들웨어로 위임." },
      { type: "documentNote", title: "마이그레이션 메모", summary: "남은 라우트 목록과 회귀 테스트 항목을 메모로 정리." },
    ],
    decisions: [
      { title: "미들웨어로 인증 일원화", decision: "모든 보호 라우트는 authMiddleware를 거친다.", rationale: "검사 누락과 중복을 없애고 한 곳에서 정책을 관리하기 위해.", rejected: ["라우트별 데코레이터", "게이트웨이에서만 검사"], impact: ["라우트 핸들러가 단순해짐", "인증 정책 변경 지점이 1곳으로"], importance: "high" },
      { title: "토큰 검증 실패는 401로 통일", decision: "만료·위조·누락을 모두 401로 응답한다.", rationale: "클라이언트 재시도 로직을 단순화.", rejected: ["케이스별 상이한 코드"], impact: ["에러 핸들링 단순화"] },
    ],
    issues: [
      { title: "리프레시 토큰 회전 미구현", description: "갱신 시 이전 리프레시 토큰을 무효화하지 않아 재사용될 수 있음.", status: "open", priority: "high", suggested: "갱신 시 이전 토큰을 폐기 목록에 추가한다." },
      { title: "회귀 테스트 부족", description: "미들웨어 전환에 대한 통합 테스트가 없음.", status: "inProgress", priority: "medium", suggested: "보호 라우트 접근에 대한 통합 테스트를 추가한다." },
    ],
    nextActions: [
      { title: "리프레시 토큰 회전 구현", priority: "high" },
      { title: "인증 통합 테스트 작성", priority: "medium" },
    ],
  },
  "demo-report-templates": {
    projectDescription: "로컬 우선 AI 작업 기억 앱 Mori의 제품 코드베이스.",
    summaryLine: "공유 대상별 리포트 템플릿을 정리하고 Markdown export를 우선 구현했습니다.",
    beats: [
      { type: "aiConversation", title: "리포트 종류 정리", summary: "개인 회고·팀 공유·고객 보고·standup 4종의 차이를 정리." },
      { type: "decision", title: "Markdown export 우선", summary: "PDF/HTML보다 Markdown을 먼저 구현하기로 결정." },
      { type: "fileCode", title: "reportTemplates.ts 구성", summary: "템플릿별 섹션 구성과 프라이버시 옵션을 코드로 정의.", artifact: { title: "reportTemplates.ts", kind: "code", path: "src/lib/report/reportTemplates.ts" } },
      { type: "issue", title: "고객 보고에서 민감 항목 제외 규칙", summary: "client-safe 필터가 어떤 항목을 가릴지 명세 필요." },
      { type: "documentNote", title: "템플릿 검토 메모", summary: "각 템플릿의 포함 항목을 표로 정리." },
    ],
    decisions: [
      { title: "Markdown export 우선", decision: "리포트 export는 Markdown을 먼저 제공한다.", rationale: "가장 빠르게 실제 공유 가치를 만든다.", rejected: ["PDF 우선", "HTML 우선"], impact: ["템플릿을 Markdown 기반으로 설계"], importance: "high" },
      { title: "프라이버시 옵션은 템플릿별 기본값", decision: "고객 보고는 기본 client-safe, 개인 회고는 전체 노출.", rationale: "오노출을 줄이고 합리적 기본값을 제공.", rejected: ["항상 수동 선택"], impact: ["내보내기 UX 단순화"] },
    ],
    issues: [
      { title: "client-safe 제외 규칙 미정", description: "고객 보고에서 가릴 민감 항목의 기준이 불명확.", status: "open", priority: "medium", suggested: "민감도 라벨별 포함/제외 매트릭스를 정의한다." },
      { title: "PDF export placeholder", description: "PDF는 자리만 있고 미구현.", status: "watching", priority: "low", suggested: "Markdown 안정화 후 PDF 변환을 검토한다." },
    ],
    nextActions: [
      { title: "client-safe 필터 매트릭스 작성", priority: "medium" },
      { title: "Markdown export 경로 마무리", priority: "high" },
    ],
  },
  "demo-invoice-flow": {
    projectDescription: "프리랜서 청구·정산을 돕는 Jinga 서비스.",
    summaryLine: "인보이스 발행부터 결제 확인까지의 상태 흐름을 재설계했습니다.",
    beats: [
      { type: "aiConversation", title: "인보이스 상태 흐름 검토", summary: "초안·발행·미납·완납·취소 상태 전이를 점검." },
      { type: "decision", title: "상태 머신으로 모델링", summary: "허용된 전이만 가능한 명시적 상태 머신을 도입." },
      { type: "fileCode", title: "invoiceStateMachine.ts", summary: "전이 규칙과 가드를 코드로 정의.", artifact: { title: "invoiceStateMachine.ts", kind: "code", path: "src/billing/invoiceStateMachine.ts" } },
      { type: "issue", title: "부분 결제 처리 미정", summary: "부분 납부 시 상태와 잔액 표시 규칙이 없음." },
      { type: "fileCode", title: "발행 시 PDF 첨부 연결", summary: "발행 이벤트에서 인보이스 PDF 생성을 트리거." },
      { type: "documentNote", title: "정산 규칙 메모", summary: "세금·수수료 계산 순서를 메모로 정리." },
    ],
    decisions: [
      { title: "상태 머신으로 모델링", decision: "인보이스는 명시적 상태 머신으로 전이를 강제한다.", rationale: "잘못된 상태 점프를 막고 감사 추적을 쉽게.", rejected: ["불리언 플래그 조합"], impact: ["전이 가드가 한 곳에 모임"], importance: "high" },
      { title: "취소는 발행 후에만 허용", decision: "초안 상태에서는 삭제, 발행 후에는 취소로 구분.", rationale: "회계 추적성을 유지.", rejected: ["언제나 삭제 허용"], impact: ["취소 사유 기록 필요"] },
    ],
    issues: [
      { title: "부분 결제 규칙 미정", description: "부분 납부 시 미납/완납 사이 상태와 잔액 표기가 필요.", status: "open", priority: "high", suggested: "'부분납' 상태와 잔액 필드를 도입한다." },
      { title: "환율 처리", description: "해외 고객 인보이스의 환율 고정 시점이 불명확.", status: "open", priority: "medium", suggested: "발행 시점 환율을 스냅샷한다." },
    ],
    nextActions: [
      { title: "부분 결제 상태 설계", priority: "high" },
      { title: "발행 시 환율 스냅샷 구현", priority: "medium" },
    ],
  },
  "demo-timeline-redesign": {
    projectDescription: "로컬 우선 AI 작업 기억 앱 Mori의 제품 코드베이스.",
    summaryLine: "타임라인을 대화 흐름 우선으로 재기획하고 카드 밀도를 낮췄습니다.",
    beats: [
      { type: "aiConversation", title: "현행 타임라인 문제 진단", summary: "이벤트 카드가 많아 흐름보다 노이즈가 강하다는 점을 확인." },
      { type: "webResearch", title: "대화형 타임라인 레퍼런스 조사", summary: "대화 스레드 중심 UI 사례를 비교." },
      { type: "decision", title: "대화-우선 타임라인 채택", summary: "턴 단위 대화 흐름을 1차로, 이벤트는 보조로 배치." },
      { type: "fileCode", title: "TimelineView 재구성", summary: "턴 그룹핑과 접힘 동작을 추가.", artifact: { title: "TimelineView.tsx", kind: "code", path: "src/features/timeline/TimelineView.tsx" } },
      { type: "issue", title: "이벤트 많을 때 렌더 비용", summary: "수백 개 카드에서 렌더 비용이 커질 수 있음." },
      { type: "documentNote", title: "재기획 메모", summary: "남은 UI 항목과 접근성 점검 사항을 정리." },
    ],
    decisions: [
      { title: "대화-우선 타임라인 채택", decision: "타임라인은 대화 흐름을 1차로 보여준다.", rationale: "작업의 맥락이 대화 순서에 담겨 있다.", rejected: ["이벤트 그래프 우선", "세로 로그만"], impact: ["턴 모델이 핵심이 됨"], importance: "high" },
      { title: "이벤트 카드는 접힘 기본", decision: "보조 이벤트 카드는 기본 접힘으로 노이즈를 줄인다.", rationale: "흐름을 먼저 읽게 하기 위해.", rejected: ["항상 펼침"], impact: ["펼침 상태 기억 필요"] },
    ],
    issues: [
      { title: "대량 이벤트 렌더 성능", description: "이벤트가 많아지면 DOM 카드 렌더 비용이 커짐.", status: "watching", priority: "low", suggested: "가상 스크롤 또는 청크 렌더를 검토한다." },
      { title: "접힘 상태 영속화", description: "새로고침 후 접힘 상태가 초기화됨.", status: "inProgress", priority: "medium", suggested: "접힘 상태를 로컬에 저장한다." },
    ],
    nextActions: [
      { title: "접힘 상태 로컬 저장", priority: "medium" },
      { title: "타임라인 가상 스크롤 PoC", priority: "low" },
    ],
  },
  "demo-consolidation-spec": {
    projectDescription: "로컬 우선 AI 작업 기억 앱 Mori의 제품 코드베이스.",
    summaryLine: "세션 간 메모리 통합 검토(Consolidation)의 첫 스펙 초안을 작성했습니다.",
    beats: [
      { type: "aiConversation", title: "통합 검토 목적 정의", summary: "여러 세션의 결정·이슈를 프로젝트 메모리로 승격하는 흐름을 논의." },
      { type: "decision", title: "제안-수락 모델 채택", summary: "AI가 통합 제안을 만들고 사용자가 수락/편집/보류하는 구조." },
      { type: "fileCode", title: "consolidationProposals.ts 스켈레톤", summary: "제안 종류와 증거 참조 타입을 정의.", artifact: { title: "consolidationProposals.ts", kind: "code", path: "src/lib/project-memory/consolidationProposals.ts" } },
      { type: "issue", title: "상충하는 결정 처리", summary: "세션 간 결정이 모순될 때의 표기·해소 규칙 필요." },
      { type: "documentNote", title: "스펙 초안 메모", summary: "제안 라이프사이클과 감사 로그 항목을 정리." },
    ],
    decisions: [
      { title: "제안-수락 모델 채택", decision: "통합은 AI 제안 → 사용자 수락의 검토 흐름으로 한다.", rationale: "자동 병합의 오류를 막고 사용자 통제권을 유지.", rejected: ["자동 병합", "수동 전용"], impact: ["감사 로그가 필요"], importance: "high" },
      { title: "비현행 메모리도 보존", decision: "stale·contradicted 메모리는 삭제하지 않고 표시만 바꾼다.", rationale: "기록의 정직성을 유지.", rejected: ["물리 삭제"], impact: ["상태 전이 모델 필요"] },
    ],
    issues: [
      { title: "상충 결정 해소 규칙", description: "세션 간 모순되는 결정의 표기와 해소 절차가 미정.", status: "open", priority: "medium", suggested: "contradiction 제안과 해소 액션을 정의한다." },
      { title: "증거 참조 일관성", description: "제안이 가리키는 증거(이벤트/소스) 식별 규칙이 필요.", status: "open", priority: "medium", suggested: "MemoryEvidenceRef 스키마를 확정한다." },
    ],
    nextActions: [
      { title: "contradiction 제안 흐름 설계", priority: "medium" },
      { title: "감사 로그 스키마 확정", priority: "medium" },
    ],
  },

  // ── NG Gateway ──────────────────────────────────────────────────────────────
  "demo-ng-gw-routing-redesign": {
    projectDescription: "마이크로서비스 앞단의 차세대 API 게이트웨이 ng-gw.",
    summaryLine: "경로 매칭 비용을 줄이기 위해 라우팅 테이블을 트라이 기반으로 재설계했습니다.",
    beats: [
      { type: "aiConversation", title: "라우팅 병목 진단", summary: "선형 경로 매칭이 경로 수에 비례해 느려지는 문제를 확인." },
      { type: "decision", title: "트라이 기반 매칭 도입", summary: "접두 트라이로 경로를 색인해 매칭을 O(path length)로." },
      { type: "fileCode", title: "routeTrie.ts 구현", summary: "정적·파라미터·와일드카드 세그먼트를 처리하는 트라이.", artifact: { title: "routeTrie.ts", kind: "code", path: "src/router/routeTrie.ts" } },
      { type: "issue", title: "와일드카드 우선순위 모호", summary: "정적/파라미터/와일드카드가 겹칠 때 우선순위 규칙 필요." },
      { type: "fileCode", title: "라우트 충돌 검사 추가", summary: "등록 시 충돌하는 경로를 거부하도록 검증." },
      { type: "documentNote", title: "마이그레이션 메모", summary: "기존 라우트 정의를 새 형식으로 옮기는 절차를 정리." },
    ],
    decisions: [
      { title: "트라이 기반 매칭 도입", decision: "라우팅 테이블을 접두 트라이로 색인한다.", rationale: "경로 수가 늘어도 매칭 비용을 일정하게 유지.", rejected: ["정규식 목록 순회", "해시맵 정확 매칭만"], impact: ["라우트 등록 시 트라이 구축 필요"], importance: "high" },
      { title: "우선순위는 정적>파라미터>와일드카드", decision: "겹치는 경로는 구체적인 쪽을 우선한다.", rationale: "직관적이고 예측 가능한 매칭.", rejected: ["등록 순서 우선"], impact: ["충돌 검사 규칙에 반영"] },
    ],
    issues: [
      { title: "와일드카드 우선순위 검증 부족", description: "정적/파라미터/와일드카드가 겹치는 경계 케이스 테스트가 부족.", status: "open", priority: "medium", suggested: "우선순위 매트릭스에 대한 테이블 테스트를 추가한다." },
      { title: "트라이 구축 비용", description: "라우트가 매우 많을 때 구축 시간이 시작 지연으로 이어질 수 있음.", status: "watching", priority: "low", suggested: "지연 구축 또는 캐시를 검토한다." },
    ],
    nextActions: [
      { title: "우선순위 테이블 테스트 작성", priority: "medium" },
      { title: "라우트 충돌 에러 메시지 개선", priority: "low" },
    ],
  },
  "demo-ng-gw-jwt-auth": {
    projectDescription: "마이크로서비스 앞단의 차세대 API 게이트웨이 ng-gw.",
    summaryLine:
      "게이트웨이 단에서 JWT를 검증하는 인증 미들웨어를 도입하고, 엣지 케이스 점검에서 키 회전·헤더 위조·알고리즘 혼동 이슈를 함께 끌어냈습니다.",
    beats: [
      { type: "aiConversation", title: "인증 책임 위치 논의", summary: "각 서비스가 따로 토큰을 검증하던 현황과 중복·누락 문제를 정리하며 시작." },
      { type: "aiConversation", title: "게이트웨이 검증으로 합의", summary: "검증 책임을 게이트웨이로 모으고 검증된 클레임만 업스트림으로 넘기기로 방향을 좁힘." },
      { type: "decision", title: "게이트웨이에서 JWT 검증", summary: "서명·만료·issuer를 게이트웨이가 검증하고 클레임을 신뢰 헤더로 전달하기로 결정." },
      { type: "webResearch", title: "JWKS 캐시 전략 조사", summary: "kid 미스 시 단일 비행으로 강제 갱신하는 패턴과 키 회전 대응 사례를 참고." },
      { type: "fileCode", title: "jwtMiddleware.ts 작성", summary: "JWKS 캐시·서명 검증·만료 확인·클레임 주입을 한 미들웨어로 구현.", artifact: { title: "jwtMiddleware.ts", kind: "code", path: "src/middleware/jwtMiddleware.ts" } },
      { type: "decision", title: "JWKS 캐시 후 kid 미스 시 단일 비행 갱신", summary: "JWKS를 캐시하고 모르는 kid가 오면 한 번만 강제 갱신해 갱신 폭주를 막기로 결정." },
      { type: "fileCode", title: "공개 경로 allowlist 추가", summary: "헬스체크·로그인 콜백 등 인증 예외 경로를 명시적으로 정의." },
      { type: "aiConversation", title: "엣지 케이스 점검", summary: "만료·clock skew·alg 혼동·신뢰 헤더 유입을 훑으며 후속 이슈를 한 번에 도출." },
      { type: "issue", title: "JWKS 키 회전 캐시 무효화", summary: "키 회전 시 stale 캐시로 검증이 실패할 수 있어 단일 비행 갱신이 필요." },
      { type: "issue", title: "신뢰 헤더 위조 방지", summary: "업스트림이 신뢰 헤더를 받으므로 외부에서 유입된 X-User-* 헤더를 게이트웨이가 제거해야 함." },
      { type: "issue", title: "alg=none·알고리즘 혼동 방어", summary: "허용 알고리즘을 강제하지 않으면 alg 혼동 공격에 노출될 수 있음." },
      { type: "fileCode", title: "토큰 검증 단위 테스트 추가", summary: "만료·위조·alg 케이스에 대한 검증 테스트를 작성.", artifact: { title: "jwtMiddleware.test.ts", kind: "code", path: "src/middleware/jwtMiddleware.test.ts" } },
      { type: "documentNote", title: "다음 작업 메모", summary: "단일 비행 갱신, 헤더 strip, alg allowlist, 통합 테스트를 다음 작업으로 정리." },
    ],
    decisions: [
      { title: "게이트웨이에서 JWT 검증", decision: "토큰 검증은 게이트웨이가 담당하고 검증된 클레임만 업스트림 신뢰 헤더로 넘긴다.", rationale: "서비스마다 검증을 중복하지 않고 한 곳에서 일관된 정책을 적용하기 위해.", rejected: ["서비스별 검증", "사이드카 검증"], impact: ["업스트림은 검증을 신뢰 헤더에 위임", "외부 유입 신뢰 헤더 제거 필요"], importance: "high" },
      { title: "JWKS 캐시 후 kid 미스 시 단일 비행 갱신", decision: "JWKS를 캐시하고 모르는 kid가 오면 단일 비행으로 한 번만 강제 갱신한다.", rationale: "키 회전 대응과 성능(매 요청 조회 회피)을 동시에 충족.", rejected: ["매 요청 JWKS 조회", "키 하드코딩"], impact: ["갱신 동시성 제어(single-flight) 필요"], importance: "high" },
    ],
    issues: [
      { title: "JWKS 키 회전 캐시 무효화", description: "키 회전 시 stale 캐시로 정상 토큰이 거부될 수 있음. kid 미스 갱신 경로가 아직 미구현.", status: "inProgress", priority: "high", suggested: "kid 미스 시 단일 비행(single-flight) 갱신을 구현한다." },
      { title: "신뢰 헤더 위조 방지", description: "업스트림이 X-User-* 신뢰 헤더를 받으므로, 외부에서 유입된 동일 헤더를 게이트웨이가 반드시 제거해야 함.", status: "open", priority: "high", suggested: "수신 요청의 X-User-* 헤더를 진입 시 strip한다." },
      { title: "alg=none·알고리즘 혼동 방어", description: "허용 알고리즘 allowlist가 없어 alg 혼동/none 공격 여지가 있음.", status: "open", priority: "medium", suggested: "검증 시 허용 alg를 명시적으로 강제한다." },
      { title: "만료·위조·누락 응답 401 통일", description: "검증 실패 케이스마다 응답 코드가 달라 클라이언트 재시도 로직이 복잡했음.", status: "resolved", priority: "medium", suggested: "만료·위조·누락을 모두 401로 통일했다." },
    ],
    nextActions: [
      { title: "JWKS single-flight 갱신 구현", priority: "high" },
      { title: "신뢰 헤더 strip 규칙 추가", priority: "high" },
      { title: "허용 alg allowlist 적용", priority: "medium" },
      { title: "인증 통합 테스트 작성", priority: "medium" },
    ],
  },
  "demo-ng-gw-rate-limiter": {
    projectDescription: "마이크로서비스 앞단의 차세대 API 게이트웨이 ng-gw.",
    summaryLine: "분산 환경에서 동작하는 토큰 버킷 레이트 리미터를 구현했습니다.",
    beats: [
      { type: "aiConversation", title: "제한 정책 정의", summary: "사용자·API 키·IP 단위의 제한 차원과 기본값을 논의." },
      { type: "decision", title: "토큰 버킷 + Redis", summary: "버스트 허용을 위해 토큰 버킷을 채택하고 Redis로 분산 카운팅." },
      { type: "fileCode", title: "tokenBucket.lua 작성", summary: "원자적 소비를 위한 Redis Lua 스크립트.", artifact: { title: "tokenBucket.lua", kind: "code", path: "src/ratelimit/tokenBucket.lua" } },
      { type: "fileCode", title: "rateLimiter.ts 연결", summary: "미들웨어에서 버킷을 소비하고 429와 헤더를 반환." },
      { type: "issue", title: "Redis 장애 시 폴백", summary: "Redis 불가 시 차단할지 허용할지 정책 필요." },
      { type: "documentNote", title: "제한 헤더 메모", summary: "RateLimit-* 응답 헤더 형식을 정리." },
    ],
    decisions: [
      { title: "토큰 버킷 + Redis 분산", decision: "버스트를 허용하는 토큰 버킷을 Redis Lua로 원자 처리한다.", rationale: "여러 인스턴스에서 일관된 제한과 짧은 버스트 허용.", rejected: ["고정 윈도우", "인메모리 카운터"], impact: ["Redis 의존성 추가"], importance: "high" },
      { title: "Redis 장애 시 fail-open", decision: "Redis 불가 시 제한을 일시 허용(fail-open)한다.", rationale: "가용성을 우선하되 경보를 울린다.", rejected: ["fail-close 차단"], impact: ["장애 알림 필요"] },
    ],
    issues: [
      { title: "Redis 장애 폴백 검증", description: "fail-open 동작과 복구 시 카운터 정합성 확인 필요.", status: "open", priority: "high", suggested: "Redis 차단 카오스 테스트를 추가한다." },
      { title: "제한 헤더 표준 준수", description: "RateLimit 헤더 형식이 draft 표준과 다를 수 있음.", status: "open", priority: "low", suggested: "IETF draft 형식에 맞춘다." },
    ],
    nextActions: [
      { title: "Redis 카오스 테스트 작성", priority: "high" },
      { title: "RateLimit 헤더 표준화", priority: "low" },
    ],
  },
  "demo-ng-gw-circuit-breaker": {
    projectDescription: "마이크로서비스 앞단의 차세대 API 게이트웨이 ng-gw.",
    summaryLine: "업스트림 장애 전파를 막기 위한 서킷 브레이커와 폴백 정책을 정의했습니다.",
    beats: [
      { type: "aiConversation", title: "장애 전파 사례 분석", summary: "느린 업스트림이 게이트웨이 스레드를 고갈시키는 패턴을 확인." },
      { type: "decision", title: "업스트림별 서킷 브레이커", summary: "에러율·지연 임계로 회로를 열고 반열림으로 복구를 탐색." },
      { type: "fileCode", title: "circuitBreaker.ts 구현", summary: "닫힘/열림/반열림 상태와 슬라이딩 윈도우 집계.", artifact: { title: "circuitBreaker.ts", kind: "code", path: "src/resilience/circuitBreaker.ts" } },
      { type: "issue", title: "폴백 응답 정책", summary: "회로가 열렸을 때 캐시·기본값·503 중 무엇을 줄지 미정." },
      { type: "documentNote", title: "임계값 메모", summary: "에러율·최소 표본·반열림 시도 수 기본값을 정리." },
    ],
    decisions: [
      { title: "업스트림별 서킷 브레이커", decision: "각 업스트림마다 독립 회로를 둔다.", rationale: "한 서비스 장애가 전체로 번지지 않게.", rejected: ["전역 단일 회로"], impact: ["업스트림별 메트릭 필요"], importance: "high" },
      { title: "열림 시 빠른 실패", decision: "회로가 열리면 대기 없이 즉시 폴백한다.", rationale: "스레드·커넥션 고갈을 방지.", rejected: ["타임아웃까지 대기"], impact: ["폴백 경로 필요"] },
    ],
    issues: [
      { title: "폴백 응답 정책 미정", description: "회로 열림 시 캐시/기본값/503 중 선택 기준이 없음.", status: "open", priority: "medium", suggested: "엔드포인트 분류별 폴백 매핑을 정의한다." },
      { title: "반열림 플랩 방지", description: "반열림에서 회로가 자주 열고 닫히는 플래핑 우려.", status: "watching", priority: "low", suggested: "쿨다운과 점진 복구를 적용한다." },
    ],
    nextActions: [
      { title: "엔드포인트별 폴백 매핑 정의", priority: "medium" },
      { title: "반열림 쿨다운 튜닝", priority: "low" },
    ],
  },
  "demo-ng-gw-otel-tracing": {
    projectDescription: "마이크로서비스 앞단의 차세대 API 게이트웨이 ng-gw.",
    summaryLine: "게이트웨이를 통과하는 요청에 OpenTelemetry 분산 트레이싱을 연동했습니다.",
    beats: [
      { type: "aiConversation", title: "관측성 공백 진단", summary: "요청이 어느 업스트림에서 느려지는지 추적이 어려운 문제를 확인." },
      { type: "decision", title: "W3C traceparent 전파", summary: "표준 trace context를 받아 이어가고 업스트림으로 전파." },
      { type: "fileCode", title: "tracing.ts 부트스트랩", summary: "OTel SDK 초기화와 게이트웨이 스팬 생성.", artifact: { title: "tracing.ts", kind: "code", path: "src/observability/tracing.ts" } },
      { type: "fileCode", title: "업스트림 호출 계측", summary: "프록시 호출마다 자식 스팬과 속성을 부여." },
      { type: "issue", title: "민감 속성 노출", summary: "헤더·쿼리에 민감 정보가 스팬 속성으로 새어나갈 수 있음." },
      { type: "webResearch", title: "샘플링 전략 조사", summary: "tail 기반 샘플링과 비용 균형을 참고." },
    ],
    decisions: [
      { title: "W3C traceparent 전파", decision: "표준 trace context를 수신·전파한다.", rationale: "이종 서비스 간 트레이스 연결성을 확보.", rejected: ["독자 헤더", "전파 없음"], impact: ["모든 업스트림 호출에 컨텍스트 주입"], importance: "high" },
      { title: "헤드 기반 확률 샘플링 시작", decision: "초기엔 10% 헤드 샘플링으로 시작한다.", rationale: "비용을 통제하면서 신호를 확보.", rejected: ["전량 수집"], impact: ["후속 tail 샘플링 검토"] },
    ],
    issues: [
      { title: "스팬 속성의 민감정보 누출", description: "헤더/쿼리 원문이 속성으로 들어가면 PII가 노출될 수 있음.", status: "open", priority: "high", suggested: "속성 화이트리스트와 스크러빙을 적용한다." },
      { title: "샘플링 비용 평가", description: "트래픽 증가 시 수집 비용이 빠르게 증가.", status: "watching", priority: "medium", suggested: "tail 샘플링 도입을 평가한다." },
    ],
    nextActions: [
      { title: "스팬 속성 스크러빙 규칙 추가", priority: "high" },
      { title: "tail 샘플링 PoC", priority: "medium" },
    ],
  },
  "demo-ng-gw-grpc-proxy": {
    projectDescription: "마이크로서비스 앞단의 차세대 API 게이트웨이 ng-gw.",
    summaryLine: "REST 진입을 유지하면서 내부 gRPC 업스트림으로 프록시하는 경로를 추가했습니다.",
    beats: [
      { type: "aiConversation", title: "REST↔gRPC 변환 범위 논의", summary: "외부는 REST, 내부는 gRPC로 두는 트랜스코딩 범위를 정의." },
      { type: "decision", title: "gRPC 트랜스코딩 도입", summary: "google.api.http 매핑으로 REST를 gRPC로 변환." },
      { type: "fileCode", title: "grpcTranscoder.ts", summary: "경로·바디 매핑과 상태 코드 변환 구현.", artifact: { title: "grpcTranscoder.ts", kind: "code", path: "src/proxy/grpcTranscoder.ts" } },
      { type: "issue", title: "스트리밍 변환 미지원", summary: "서버 스트리밍을 REST로 노출하는 방식이 미정." },
      { type: "fileCode", title: "gRPC 상태→HTTP 매핑", summary: "표준 코드 매핑 테이블을 적용." },
      { type: "documentNote", title: "변환 한계 메모", summary: "현재 지원/미지원 케이스를 정리." },
    ],
    decisions: [
      { title: "gRPC 트랜스코딩 도입", decision: "외부 REST를 내부 gRPC로 트랜스코딩한다.", rationale: "클라이언트 호환을 유지하며 내부 성능을 확보.", rejected: ["전면 gRPC 노출", "REST 백엔드 유지"], impact: ["proto의 http 매핑 필요"], importance: "high" },
      { title: "초기엔 단항 호출만 지원", decision: "스트리밍은 후속으로 미루고 단항부터 지원.", rationale: "범위를 좁혀 빠르게 안정화.", rejected: ["처음부터 스트리밍 포함"], impact: ["스트리밍 케이스는 직접 gRPC 안내"] },
    ],
    issues: [
      { title: "서버 스트리밍 노출 방식", description: "스트리밍 응답을 SSE/청크 중 무엇으로 변환할지 미정.", status: "open", priority: "medium", suggested: "SSE 매핑 PoC로 비교한다." },
      { title: "에러 디테일 전달", description: "gRPC error details가 REST 응답에서 손실됨.", status: "open", priority: "medium", suggested: "google.rpc.Status를 JSON으로 보존한다." },
    ],
    nextActions: [
      { title: "스트리밍 SSE 매핑 PoC", priority: "medium" },
      { title: "error details JSON 보존", priority: "medium" },
    ],
  },
  "demo-ng-gw-ws-proxy": {
    projectDescription: "마이크로서비스 앞단의 차세대 API 게이트웨이 ng-gw.",
    summaryLine: "업스트림으로의 WebSocket 업그레이드와 프록시 경로를 구현했습니다.",
    beats: [
      { type: "aiConversation", title: "업그레이드 처리 검토", summary: "HTTP Upgrade 핸드셰이크를 게이트웨이가 어떻게 중계할지 논의." },
      { type: "decision", title: "투명 WS 프록시", summary: "프레임을 해석하지 않고 양방향으로 중계하되 인증만 검사." },
      { type: "fileCode", title: "wsProxy.ts 구현", summary: "업그레이드 핸드셰이크 중계와 백프레셔 처리.", artifact: { title: "wsProxy.ts", kind: "code", path: "src/proxy/wsProxy.ts" } },
      { type: "issue", title: "유휴 연결 정리", summary: "오래 유휴인 소켓을 정리하는 핑/타임아웃 정책 필요." },
      { type: "fileCode", title: "연결 수 제한 추가", summary: "업스트림별 동시 연결 상한을 적용." },
      { type: "documentNote", title: "백프레셔 메모", summary: "느린 소비자 처리와 버퍼 한계를 정리." },
    ],
    decisions: [
      { title: "투명 WS 프록시", decision: "프레임을 파싱하지 않고 인증 후 양방향 중계한다.", rationale: "프로토콜 독립성과 성능을 확보.", rejected: ["프레임 단위 검사", "메시지 변환"], impact: ["인증은 핸드셰이크 단계에서만"], importance: "high" },
      { title: "핑으로 keepalive", decision: "주기적 핑으로 살아있는 연결만 유지한다.", rationale: "좀비 연결과 리소스 누수를 방지.", rejected: ["타임아웃 없음"], impact: ["핑 주기 설정 필요"] },
    ],
    issues: [
      { title: "유휴 연결 정리 정책", description: "장시간 무활동 소켓이 리소스를 점유.", status: "inProgress", priority: "medium", suggested: "핑 실패 N회 시 종료한다." },
      { title: "백프레셔 한계", description: "느린 소비자에서 버퍼가 무한 증가할 수 있음.", status: "open", priority: "high", suggested: "버퍼 상한 초과 시 연결을 끊는다." },
    ],
    nextActions: [
      { title: "핑/타임아웃 정책 구현", priority: "medium" },
      { title: "백프레셔 버퍼 상한 적용", priority: "high" },
    ],
  },
  "demo-ng-gw-canary-deploy": {
    projectDescription: "마이크로서비스 앞단의 차세대 API 게이트웨이 ng-gw.",
    summaryLine: "가중치 기반 트래픽 분할로 카나리 배포 파이프라인을 구성했습니다.",
    beats: [
      { type: "aiConversation", title: "점진 배포 전략 논의", summary: "블루-그린과 카나리를 비교하고 게이트웨이 역할을 정의." },
      { type: "decision", title: "가중치 라우팅 카나리", summary: "업스트림 버전에 가중치를 부여해 트래픽을 점진 이동." },
      { type: "fileCode", title: "weightedRouter.ts", summary: "버전별 가중치와 sticky 세션 처리.", artifact: { title: "weightedRouter.ts", kind: "code", path: "src/deploy/weightedRouter.ts" } },
      { type: "issue", title: "자동 롤백 신호", summary: "카나리 에러율 상승 시 자동 롤백 트리거가 필요." },
      { type: "fileCode", title: "배포 메트릭 노출", summary: "버전별 성공률/지연을 메트릭으로 분리." },
      { type: "documentNote", title: "롤아웃 단계 메모", summary: "5%→25%→50%→100% 단계와 관문 조건을 정리." },
    ],
    decisions: [
      { title: "가중치 라우팅 카나리", decision: "버전별 가중치로 트래픽을 점진 이동한다.", rationale: "위험을 작게 나누고 빠르게 되돌릴 수 있다.", rejected: ["전량 전환", "수동 스위치"], impact: ["버전별 메트릭 분리 필요"], importance: "high" },
      { title: "관문은 자동 평가", decision: "각 단계 승격은 에러율/지연 관문을 자동 평가한다.", rationale: "사람 개입을 줄이고 일관성을 확보.", rejected: ["전 단계 수동 승인"], impact: ["관문 임계 정의 필요"] },
    ],
    issues: [
      { title: "자동 롤백 트리거 미정", description: "카나리 악화 시 자동 롤백 신호와 임계가 없음.", status: "open", priority: "high", suggested: "에러율·p99 임계 초과 시 가중치를 0으로 되돌린다." },
      { title: "sticky 세션 일관성", description: "가중치 변경 시 기존 세션의 버전 고정 처리.", status: "open", priority: "medium", suggested: "세션 핀을 쿠키로 유지한다." },
    ],
    nextActions: [
      { title: "자동 롤백 관문 구현", priority: "high" },
      { title: "sticky 세션 핀 처리", priority: "medium" },
    ],
  },
  "demo-ng-gw-response-cache": {
    projectDescription: "마이크로서비스 앞단의 차세대 API 게이트웨이 ng-gw.",
    summaryLine: "안전한 GET 응답을 위한 게이트웨이 캐시 계층을 추가했습니다.",
    beats: [
      { type: "aiConversation", title: "캐시 대상 선정", summary: "캐시 가능한 메서드·상태코드·헤더 조건을 정의." },
      { type: "decision", title: "Cache-Control 준수 캐싱", summary: "표준 캐시 헤더를 존중하고 키에 Vary를 반영." },
      { type: "fileCode", title: "responseCache.ts", summary: "키 생성·TTL·stale-while-revalidate 처리.", artifact: { title: "responseCache.ts", kind: "code", path: "src/cache/responseCache.ts" } },
      { type: "issue", title: "캐시 무효화 경로", summary: "쓰기 후 관련 캐시를 비우는 무효화 전략이 필요." },
      { type: "fileCode", title: "조건부 요청 지원", summary: "ETag/If-None-Match로 304 처리." },
      { type: "documentNote", title: "캐시 키 메모", summary: "경로+쿼리+Vary 헤더 조합 규칙을 정리." },
    ],
    decisions: [
      { title: "Cache-Control 준수 캐싱", decision: "업스트림의 캐시 헤더를 존중해 캐싱한다.", rationale: "정합성 위험을 줄이고 예측 가능하게.", rejected: ["무조건 TTL", "캐시 안 함"], impact: ["Vary 처리 필요"], importance: "high" },
      { title: "stale-while-revalidate 허용", decision: "만료 직후엔 stale을 주고 백그라운드 갱신한다.", rationale: "지연을 줄이면서 신선도를 유지.", rejected: ["만료 시 즉시 차단"], impact: ["백그라운드 갱신 작업 필요"] },
    ],
    issues: [
      { title: "쓰기 후 캐시 무효화", description: "데이터 변경 시 관련 캐시를 비우는 경로가 없음.", status: "open", priority: "high", suggested: "태그 기반 무효화를 도입한다." },
      { title: "캐시 폭주(stampede)", description: "동시 만료 시 업스트림에 요청이 몰릴 수 있음.", status: "watching", priority: "medium", suggested: "single-flight 갱신으로 보호한다." },
    ],
    nextActions: [
      { title: "태그 기반 무효화 구현", priority: "high" },
      { title: "갱신 single-flight 적용", priority: "medium" },
    ],
  },
  "demo-ng-gw-load-test": {
    projectDescription: "마이크로서비스 앞단의 차세대 API 게이트웨이 ng-gw.",
    summaryLine: "부하 테스트로 병목을 찾아 p99 지연을 목표치 아래로 낮췄습니다.",
    beats: [
      { type: "aiConversation", title: "부하 시나리오 설계", summary: "정상·버스트·장애 주입 시나리오와 SLO를 정의." },
      { type: "fileCode", title: "k6 부하 스크립트", summary: "단계적 램프업과 임계 검증을 포함.", artifact: { title: "gateway-load.js", kind: "code", path: "loadtest/gateway-load.js" } },
      { type: "issue", title: "커넥션 풀 포화", summary: "업스트림 커넥션 풀이 작아 대기열이 길어짐." },
      { type: "decision", title: "Keep-Alive 풀 확대 + 타임아웃 분리", summary: "업스트림 커넥션 재사용을 늘리고 연결/응답 타임아웃을 분리." },
      { type: "fileCode", title: "풀·타임아웃 튜닝 반영", summary: "설정값을 환경별로 조정." },
      { type: "documentNote", title: "결과 요약 메모", summary: "튜닝 전후 p50/p95/p99 비교를 정리." },
    ],
    decisions: [
      { title: "Keep-Alive 풀 확대", decision: "업스트림 커넥션 재사용 풀을 키운다.", rationale: "핸드셰이크 비용과 대기열을 줄여 p99 개선.", rejected: ["요청마다 새 연결"], impact: ["풀 메트릭 모니터링 필요"], importance: "high" },
      { title: "연결/응답 타임아웃 분리", decision: "connect와 response 타임아웃을 별도로 둔다.", rationale: "느린 업스트림을 빠르게 격리.", rejected: ["단일 타임아웃"], impact: ["서킷 브레이커와 연동"] },
    ],
    issues: [
      { title: "커넥션 풀 사이징 자동화", description: "환경별 적정 풀 크기를 수동으로 맞추고 있음.", status: "inProgress", priority: "medium", suggested: "부하 기반 자동 사이징을 검토한다." },
      { title: "GC 일시정지로 인한 꼬리지연", description: "p99에서 GC 일시정지가 영향.", status: "open", priority: "medium", suggested: "GC 튜닝과 할당 감소를 시도한다." },
    ],
    nextActions: [
      { title: "풀 사이징 가이드 문서화", priority: "medium" },
      { title: "할당 핫패스 프로파일링", priority: "medium" },
    ],
  },
  "demo-ng-gw-cors-headers": {
    projectDescription: "마이크로서비스 앞단의 차세대 API 게이트웨이 ng-gw.",
    summaryLine: "CORS 처리를 중앙화하고 기본 보안 헤더를 일괄 적용했습니다.",
    beats: [
      { type: "aiConversation", title: "CORS 중복 처리 진단", summary: "서비스마다 제각각인 CORS 응답을 게이트웨이로 모으기로 검토." },
      { type: "decision", title: "게이트웨이 중앙 CORS", summary: "허용 오리진 목록과 프리플라이트 처리를 게이트웨이가 담당." },
      { type: "fileCode", title: "securityHeaders.ts", summary: "CORS·HSTS·X-Content-Type-Options 등 기본 헤더 적용.", artifact: { title: "securityHeaders.ts", kind: "code", path: "src/middleware/securityHeaders.ts" } },
      { type: "issue", title: "와일드카드 오리진 위험", summary: "credentialed 요청에 '*' 오리진을 쓰면 안 됨." },
      { type: "documentNote", title: "허용 오리진 메모", summary: "환경별 허용 오리진과 헤더 값을 정리." },
    ],
    decisions: [
      { title: "게이트웨이 중앙 CORS", decision: "CORS와 보안 헤더는 게이트웨이에서 일괄 처리한다.", rationale: "서비스별 불일치와 누락을 없앤다.", rejected: ["서비스별 CORS"], impact: ["업스트림은 CORS 신경 안 씀"], importance: "high" },
      { title: "credentialed는 명시 오리진만", decision: "쿠키 포함 요청은 와일드카드 오리진을 금지한다.", rationale: "자격 증명 탈취 위험을 차단.", rejected: ["'*' 허용"], impact: ["허용 목록 관리 필요"] },
    ],
    issues: [
      { title: "와일드카드 오리진 사용 위험", description: "credentialed 요청에서 '*'가 설정될 여지가 있음.", status: "resolved", priority: "high", suggested: "credentialed 시 오리진 echo + 허용목록 검증으로 대체했다." },
      { title: "프리플라이트 캐시 시간", description: "Access-Control-Max-Age 값이 환경마다 다름.", status: "open", priority: "low", suggested: "표준 값으로 통일한다." },
    ],
    nextActions: [
      { title: "허용 오리진 목록 환경 분리", priority: "medium" },
      { title: "프리플라이트 캐시 시간 통일", priority: "low" },
    ],
  },
  "demo-ng-gw-service-discovery": {
    projectDescription: "마이크로서비스 앞단의 차세대 API 게이트웨이 ng-gw.",
    summaryLine: "정적 업스트림 설정을 서비스 디스커버리 기반 동적 해석으로 전환했습니다.",
    beats: [
      { type: "aiConversation", title: "정적 설정의 한계 진단", summary: "스케일 변화 때마다 업스트림 목록을 수동 갱신하는 문제를 확인." },
      { type: "decision", title: "디스커버리 + 헬스 기반 풀", summary: "레지스트리에서 인스턴스를 받아 헬스한 노드만 풀에 둔다." },
      { type: "fileCode", title: "serviceRegistry.ts", summary: "레지스트리 구독과 인스턴스 캐시, 변경 반영.", artifact: { title: "serviceRegistry.ts", kind: "code", path: "src/discovery/serviceRegistry.ts" } },
      { type: "issue", title: "레지스트리 단절 시 동작", summary: "디스커버리 단절 시 마지막 known-good 목록 유지 여부." },
      { type: "fileCode", title: "헬스체크 연동", summary: "능동 헬스체크로 풀 멤버십을 갱신." },
      { type: "documentNote", title: "디스커버리 메모", summary: "TTL·갱신 주기·디바운스 값을 정리." },
    ],
    decisions: [
      { title: "디스커버리 + 헬스 기반 풀", decision: "업스트림 풀을 레지스트리와 헬스체크로 동적 구성한다.", rationale: "스케일 변화에 수동 개입 없이 적응.", rejected: ["정적 목록", "DNS만 의존"], impact: ["레지스트리 구독 필요"], importance: "high" },
      { title: "단절 시 last-known-good 유지", decision: "레지스트리 단절 시 마지막 정상 목록을 유지한다.", rationale: "일시 단절이 전체 장애로 번지지 않게.", rejected: ["단절 시 빈 풀"], impact: ["stale 기간 경보 필요"] },
    ],
    issues: [
      { title: "레지스트리 플래핑", description: "인스턴스 등록/해제가 잦을 때 풀이 흔들림.", status: "open", priority: "medium", suggested: "디바운스와 최소 안정 기간을 둔다." },
      { title: "존(zone) 인지 라우팅", description: "같은 가용 영역 우선 라우팅이 아직 없음.", status: "watching", priority: "low", suggested: "zone-aware 가중치를 도입한다." },
    ],
    nextActions: [
      { title: "디스커버리 디바운스 적용", priority: "medium" },
      { title: "zone-aware 라우팅 설계", priority: "low" },
    ],
  },
};
