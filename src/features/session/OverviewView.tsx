import { useEffect, useMemo, type ComponentType } from "react";
import {
  ArrowRight,
  ClipboardCheck,
  FileText,
  GanttChartSquare,
  ListPlus,
  ScrollText,
  type LucideProps,
} from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { SessionEmptyPrompt } from "./SessionEmptyPrompt";
import { SessionFilesPanel } from "./SessionFilesPanel";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  selectSessionView,
  useSessionStore,
} from "../../app/sessionStore";
import { useAppStore } from "../../app/store";
import { buildSessionOriginSummary } from "../../lib/session/sessionOrigin";
import { buildSessionWorkSummary } from "../../lib/session/sessionWorkSummary";
import { buildWorkArc, buildWorkPhases } from "../../lib/session/workArc";
import { getActivityLaneVisuals } from "../../lib/timeline/activityModel";
import type { ImportDigestLane } from "../../lib/import/importDigest";
import { deriveProjectIdentityHint } from "../../lib/session/projectIdentity";
import { isNextActionCompleted } from "../../lib/session/nextActionCompletion";
import {
  getUnresolvedItems,
  UNRESOLVED_REASON_LABEL,
  type UnresolvedItem,
} from "../../lib/review-workspace/reviewWorkspace";

/**
 * Session 개요 — the at-a-glance landing tab for one session.
 *
 * Pure orientation, no outputs: it answers "what is this session, how big is
 * it, and where do I go next?" The work-unit identity + a one-line summary sit
 * up top, a calm metric strip gives scale, and a row of navigation cards jumps
 * into 흐름 / 증거 / 검토 / 보고서. Handoff artifacts (continue-context, report,
 * .mori export) live in the 보고서 tab, not here.
 */
export function OverviewView() {
  const hydrate = useSessionStore((state) => state.hydrate);
  const initialized = useSessionStore((state) => state.initialized);
  const view = useSessionStore(selectSessionView);
  const mode = useSessionStore(selectSessionMode);
  const hasAnalysis = useSessionStore(selectHasRealAnalysis);
  const analysis = useSessionStore((state) => state.analysis);
  const imports = useSessionStore((state) => state.imports);
  const setSessionTab = useAppStore((state) => state.setSessionTab);
  const openReviewItem = useAppStore((state) => state.openReviewItem);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const isDemo = mode === "demo";
  const sourceCount = isDemo ? view.sources.length : imports.length || view.sources.length;

  const originSummary = useMemo(
    () =>
      buildSessionOriginSummary({
        session: view.session,
        sources: view.sources,
        events: view.events,
        importCount: isDemo ? 0 : imports.length,
        isDemo,
      }),
    [view.session, view.sources, view.events, imports.length, isDemo],
  );
  const projectHint = useMemo(
    () =>
      deriveProjectIdentityHint({
        session: view.session,
        sources: view.sources,
        events: view.events,
      }),
    [view.session, view.sources, view.events],
  );

  const workSummary = useMemo(
    () => buildSessionWorkSummary(view.events, view.sources),
    [view.events, view.sources],
  );
  // The LLM narrative, only when a real analysis exists. The factual work
  // summary below always shows, with no LLM, so 개요 is legible the moment it
  // loads. We never surface the pre-analysis placeholder as an "AI 요약".
  const summaryText = hasAnalysis && analysis ? analysis.summary.sessionSummary : null;
  // The work-flow arc, preferring time-grounded phases reconstructed from the
  // real event timeline (with "when" + the opening request per phase); falling
  // back to the AI summary reshaped into ordered steps when the session has no
  // clear breaks.
  const workArc = useMemo<{ caption: string; steps: WorkArcStep[] }>(() => {
    const phases = buildWorkPhases(view.events, view.decisions);
    if (phases.length >= 2) {
      return {
        caption: `작업 세션 ${phases.length}개`,
        steps: phases.map((phase) => ({
          label: phase.label,
          timeLabel: formatPhaseStart(phase.startIso),
          decisions: phase.decisions,
          changedFiles: phase.changedFiles,
        })),
      };
    }
    return {
      caption: "AI가 복원한 단계",
      steps: buildWorkArc(summaryText).map((label) => ({ label })),
    };
  }, [view.events, view.decisions, summaryText]);
  const sessionEmpty = workSummary.isEmpty;
  const duration = useMemo(
    () => formatDuration(view.session.startedAt, view.session.endedAt),
    [view.session.startedAt, view.session.endedAt],
  );

  const issueCount = view.issues.length;
  const decisionCount = view.decisions.length;
  const nextActionCount = view.nextActions.length;
  const reviewAttention =
    view.issues.filter((issue) => issue.status !== "resolved").length +
    view.decisions.filter((decision) => !decision.confirmed).length +
    view.nextActions.filter((action) => !isNextActionCompleted(action)).length;

  const unresolved = useMemo(
    () =>
      getUnresolvedItems({
        issues: view.issues,
        decisions: view.decisions,
        nextActions: view.nextActions,
      }),
    [view.issues, view.decisions, view.nextActions],
  );

  function openUnresolved(item: UnresolvedItem) {
    if (item.kind === "issue") openReviewItem({ kind: "issue", issueId: item.issue.id });
    else if (item.kind === "decision") openReviewItem({ kind: "decision", decisionId: item.decision.id });
    else openReviewItem({ kind: "nextAction", nextActionId: item.nextAction.id });
  }

  return (
    <div className="session-tab-pane session-tab-overview">
      <div className="session-tab-split is-collapsed">
        <div className="session-tab-main overview-main">
          {sessionEmpty ? (
            <SessionEmptyPrompt
              title="세션에 가져온 자료 없음"
              hint="자료 탭에서 대화를 가져오면 개요가 채워집니다."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  icon={ListPlus}
                  onClick={() => setSessionTab("evidence")}
                >
                  자료 가져오기
                </Button>
              }
            />
          ) : null}
          <section className="session-overview-hero" aria-label="세션 개요">
            <div className="session-overview-origin">
              <Badge tone="purple">{originSummary.boundaryLabel}</Badge>
              <span className="session-overview-mix">{originSummary.sourceMixLabel}</span>
              {projectHint.projectLabel ? (
                <span className="session-overview-context">맥락 · {projectHint.projectLabel}</span>
              ) : null}
            </div>
            {!sessionEmpty ? (
              <p className="session-overview-summary">{workSummary.headline}</p>
            ) : null}
            {workArc.steps.length >= 2 ? (
              <WorkArc caption={workArc.caption} steps={workArc.steps} />
            ) : summaryText ? (
              <p className="session-overview-ai-summary">
                <Badge tone="purple">AI 요약</Badge> {summaryText}
              </p>
            ) : null}
            <WorkShapeBar lanes={workSummary.digest.lanes} />
          </section>

          <dl className="overview-metrics" aria-label="세션 규모">
            <OverviewMetric label="기간" value={duration} />
            <OverviewMetric label="자료" value={String(sourceCount)} />
            <OverviewMetric label="이슈" value={String(issueCount)} />
            <OverviewMetric label="결정" value={String(decisionCount)} />
            <OverviewMetric label="다음 액션" value={String(nextActionCount)} />
          </dl>

          <SessionFilesPanel sources={view.sources} />

          {unresolved.length > 0 ? (
            <section className="overview-attention" aria-label="확인이 필요한 항목">
              <header className="overview-attention-head">
                <h2>확인이 필요한 항목</h2>
                <Badge tone="orange">{unresolved.length}</Badge>
              </header>
              <ul className="overview-attention-list">
                {unresolved.slice(0, 4).map((item) => (
                  <li key={`${item.kind}:${unresolvedItemId(item)}`}>
                    <button type="button" onClick={() => openUnresolved(item)}>
                      <span className="overview-attention-kind">{unresolvedKindLabel(item)}</span>
                      <span className="overview-attention-title">{unresolvedItemTitle(item)}</span>
                      <span className="overview-attention-reason">
                        {UNRESOLVED_REASON_LABEL[item.reason]}
                      </span>
                      <ArrowRight size={13} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              {unresolved.length > 4 ? (
                <button
                  type="button"
                  className="overview-attention-more"
                  onClick={() => setSessionTab("insights")}
                >
                  검토에서 {unresolved.length - 4}건 더 보기
                </button>
              ) : null}
            </section>
          ) : null}

          <nav className="overview-nav-cards" aria-label="세션 탭 바로가기">
            <OverviewNavCard
              icon={GanttChartSquare}
              label="흐름"
              description="시간순으로 복원한 작업 타임라인"
              onOpen={() => setSessionTab("flow")}
            />
            <OverviewNavCard
              icon={FileText}
              label="자료"
              description="이 세션을 구성한 자료와 분석"
              onOpen={() => setSessionTab("evidence")}
            />
            <OverviewNavCard
              icon={ClipboardCheck}
              label="검토"
              count={reviewAttention > 0 ? reviewAttention : undefined}
              countTone="orange"
              countLabel="확인 필요"
              description="추출된 이슈 · 결정 · 다음 액션 검토"
              onOpen={() => setSessionTab("insights")}
            />
            <OverviewNavCard
              icon={ScrollText}
              label="공유"
              description="이어가기 컨텍스트 · 보고서 · .mori 내보내기"
              onOpen={() => setSessionTab("report")}
            />
          </nav>
        </div>
      </div>
    </div>
  );
}

function OverviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="overview-metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

type WorkArcStep = {
  label: string;
  timeLabel?: string;
  decisions?: string[];
  changedFiles?: number;
};

/**
 * The session's work-flow arc: an ordered "how the work progressed" sequence —
 * the first slice of the AI work-flow view. Time-grounded phases carry a "when"
 * per step (the work session that opened it); the summary fallback carries just
 * the narrative steps. Only rendered with two or more steps.
 */
function WorkArc({ caption, steps }: { caption: string; steps: WorkArcStep[] }) {
  return (
    <div className="work-arc" aria-label="작업 흐름">
      <div className="work-arc-head">
        <Badge tone="purple">작업 흐름</Badge>
        <span className="work-arc-caption">{caption}</span>
      </div>
      <ol className="work-arc-steps">
        {steps.map((step, index) => (
          <li key={index} className="work-arc-step">
            <span className="work-arc-marker" aria-hidden="true">
              {index + 1}
            </span>
            <span className="work-arc-body">
              {step.timeLabel ? <span className="work-arc-time">{step.timeLabel}</span> : null}
              <span className="work-arc-text">{step.label}</span>
              <WorkArcEvidence decisions={step.decisions} changedFiles={step.changedFiles} />
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * What a work phase produced: the key decision made in its window plus the
 * count of files it changed — tied to the phase by time, so the arc answers
 * "what came out of this work session", not just "when".
 */
function WorkArcEvidence({
  decisions,
  changedFiles,
}: {
  decisions?: string[];
  changedFiles?: number;
}) {
  const hasDecisions = Boolean(decisions && decisions.length > 0);
  const hasFiles = typeof changedFiles === "number" && changedFiles > 0;
  if (!hasDecisions && !hasFiles) return null;
  return (
    <span className="work-arc-evidence">
      {hasDecisions ? (
        <span className="work-arc-ev work-arc-ev-decision">
          결정 {truncateLabel(decisions![0], 30)}
          {decisions!.length > 1 ? ` 외 ${decisions!.length - 1}건` : ""}
        </span>
      ) : null}
      {hasFiles ? <span className="work-arc-ev work-arc-ev-files">파일 {changedFiles}개</span> : null}
    </span>
  );
}

function truncateLabel(text: string, max: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact;
}

/** "06-01 01:17" — a compact phase-start stamp for the work arc. */
function formatPhaseStart(iso: string): string {
  const date = new Date(iso);
  const time = date.getTime();
  if (!Number.isFinite(time)) return "";
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${min}`;
}

/**
 * The session's work composition as a calm proportional bar plus a legend,
 * coloured by the same lane tones the timeline uses. Reads at a glance: this
 * was mostly conversation, with a chunk of file changes and some builds.
 */
function WorkShapeBar({ lanes }: { lanes: ImportDigestLane[] }) {
  const total = lanes.reduce((sum, lane) => sum + lane.count, 0);
  if (total === 0) return null;
  return (
    <div className="work-shape" aria-label="작업 형태">
      <div className="work-shape-bar">
        {lanes.map((lane) => (
          <span
            key={lane.lane}
            className={`work-shape-seg tone-${getActivityLaneVisuals(lane.lane).tone}`}
            style={{ width: `${(lane.count / total) * 100}%` }}
            title={`${lane.label} ${lane.count}`}
          />
        ))}
      </div>
      <div className="work-shape-legend">
        {lanes.map((lane) => (
          <span key={lane.lane} className="work-shape-legend-item">
            <i
              className={`work-shape-dot tone-${getActivityLaneVisuals(lane.lane).tone}`}
              aria-hidden="true"
            />
            {lane.label} {lane.count}
          </span>
        ))}
      </div>
    </div>
  );
}

function OverviewNavCard({
  icon: Icon,
  label,
  count,
  countTone = "gray",
  countLabel,
  description,
  onOpen,
}: {
  icon: ComponentType<LucideProps>;
  label: string;
  count?: number;
  countTone?: "gray" | "orange" | "green" | "purple";
  countLabel?: string;
  description: string;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="overview-nav-card" onClick={onOpen}>
      <span className="overview-nav-card-head">
        <span className="overview-nav-card-icon" aria-hidden="true">
          <Icon size={16} />
        </span>
        <strong>{label}</strong>
        {typeof count === "number" ? (
          <Badge tone={countTone}>{countLabel ? `${countLabel} ${count}` : count}</Badge>
        ) : null}
      </span>
      <span className="overview-nav-card-desc">{description}</span>
    </button>
  );
}

function unresolvedItemId(item: UnresolvedItem): string {
  if (item.kind === "issue") return item.issue.id;
  if (item.kind === "decision") return item.decision.id;
  return item.nextAction.id;
}

function unresolvedItemTitle(item: UnresolvedItem): string {
  if (item.kind === "issue") return item.issue.title;
  if (item.kind === "decision") return item.decision.title;
  return item.nextAction.title;
}

function unresolvedKindLabel(item: UnresolvedItem): string {
  if (item.kind === "issue") return "이슈";
  if (item.kind === "decision") return "결정";
  return "다음 액션";
}

function formatDuration(start: string, end: string): string {
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    return "-";
  }
  const minutes = Math.floor((endTime - startTime) / 60000);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes - hours * 60;
  if (hours < 24) return remMin ? `${hours}시간 ${remMin}분` : `${hours}시간`;
  const days = Math.floor(hours / 24);
  const remHours = hours - days * 24;
  return remHours ? `${days}일 ${remHours}시간` : `${days}일`;
}
