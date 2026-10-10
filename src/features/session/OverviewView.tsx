import { useEffect, useMemo, useState } from "react";
import { discloseEventForView, resolveDisclosureLevel } from "../../lib/disclosure";
import { readableAgentText } from "../../lib/session/agentText";
import { ArrowRight, ListPlus, Sparkles } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { useRecordLedger } from "../record-ledger/useRecordLedger";
import { SessionEmptyPrompt } from "./SessionEmptyPrompt";
import { SessionFilesPanel } from "./SessionFilesPanel";
import {
  selectSessionMode,
  selectSessionView,
  useSessionStore,
} from "../../app/sessionStore";
import { useAppStore } from "../../app/store";
import { buildSessionWorkSummary } from "../../lib/session/sessionWorkSummary";
import { buildSessionTokenStats } from "../../lib/session/sessionTokenStats";
import { getActivityLaneVisuals } from "../../lib/timeline/activityModel";
import { formatSidebarRelative, shortProjectLabel } from "../../lib/sidebar/sessionList";
import type { ImportDigestLane } from "../../lib/import/importDigest";
import type { TimelineEvent } from "../../domain/types";
import {
  getUnresolvedItems,
  type UnresolvedItem,
} from "../../lib/review-workspace/reviewWorkspace";

/**
 * Session 개요 — the at-a-glance landing tab for one session.
 *
 * Pure orientation, no outputs: it answers "what is this session, where did I
 * leave off, and what still needs attention?" A one-line summary plus the work
 * shape sit up top, then the reopen anchor (마지막으로 진행한 작업 → 활동), a calm
 * scale-metric strip, the touched files, and the unresolved items. Handoff
 * artifacts (continue-context, report, .mori export) live in the 보고서 tab.
 */
export function OverviewView() {
  const hydrate = useSessionStore((state) => state.hydrate);
  const initialized = useSessionStore((state) => state.initialized);
  const view = useSessionStore(selectSessionView);
  const mode = useSessionStore(selectSessionMode);
  const imports = useSessionStore((state) => state.imports);
  const navigate = useAppStore((state) => state.navigate);
  const setSessionTab = useAppStore((state) => state.setSessionTab);
  const focusTimelineEvent = useAppStore((state) => state.focusTimelineEvent);
  const openReviewItem = useAppStore((state) => state.openReviewItem);
  const { captureAgentSession } = useRecordLedger();
  const [recordState, setRecordState] = useState<"idle" | "busy" | "done">("idle");

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const isDemo = mode === "demo";
  const sourceCount = isDemo ? view.sources.length : imports.length || view.sources.length;

  const workSummary = useMemo(
    () => buildSessionWorkSummary(view.events, view.sources),
    [view.events, view.sources],
  );
  const sessionEmpty = workSummary.isEmpty;
  const duration = useMemo(
    () => formatDuration(view.session.startedAt, view.session.endedAt),
    [view.session.startedAt, view.session.endedAt],
  );

  const issueCount = view.issues.length;
  const decisionCount = view.decisions.length;
  const nextActionCount = view.nextActions.length;
  const fileCount = useMemo(
    () =>
      new Set(
        view.sources.flatMap((source) => (source.fileTouches ?? []).map((touch) => touch.path)),
      ).size,
    [view.sources],
  );

  const unresolved = useMemo(
    () =>
      getUnresolvedItems({
        issues: view.issues,
        decisions: view.decisions,
        nextActions: view.nextActions,
      }),
    [view.issues, view.decisions, view.nextActions],
  );

  // Session token usage, rolled up from the imported assistant events. Absent
  // (not 0) when the session carries no usage records, so the metric hides.
  const tokenStats = useMemo(() => buildSessionTokenStats(view.events), [view.events]);

  // The single most useful thing on reopen: where the work was left off. The
  // last user request (a human prompt that kicked off a unit of work) is the
  // resume anchor; fall back to the latest event when no request is marked.
  const lastRequest = useMemo(() => {
    let latestRequest: TimelineEvent | null = null;
    let latestEvent: TimelineEvent | null = null;
    for (const event of view.events) {
      if (!latestEvent || event.start > latestEvent.start) latestEvent = event;
      if (event.openedByUser && (!latestRequest || event.start > latestRequest.start)) {
        latestRequest = event;
      }
    }
    return latestRequest ?? latestEvent;
  }, [view.events]);
  // The resume line is a request's title: it follows the disclosure level.
  const disclosureDefault = useSessionStore((state) => state.analysisSettings.requestDisclosureLevel);
  const disclosureOverride = useSessionStore((state) =>
    lastRequest ? state.requestDisclosureOverrides[lastRequest.id] : undefined,
  );
  const shownLastRequest = lastRequest
    ? discloseEventForView(lastRequest, resolveDisclosureLevel(disclosureOverride, disclosureDefault))
    : null;

  function resumeFromLastRequest() {
    if (!lastRequest) return;
    // Focus the event in the 원본 stream so reopening lands on the actual last
    // work, highlighted and scrolled to, not the AI 흐름 summary.
    focusTimelineEvent(lastRequest.id);
  }

  function openUnresolved(item: UnresolvedItem) {
    if (item.kind === "issue") openReviewItem({ kind: "issue", issueId: item.issue.id });
    else if (item.kind === "decision") openReviewItem({ kind: "decision", decisionId: item.decision.id });
    else openReviewItem({ kind: "nextAction", nextActionId: item.nextAction.id });
  }

  async function recordAsActivity() {
    if (recordState === "busy") return;
    setRecordState("busy");
    try {
      const projectKey = view.session.sourceLabel ?? view.session.projectId;
      await captureAgentSession({
        sessionId: view.session.id,
        title: view.session.title,
        titleFromRequest: view.session.titleFromRequest,
        agentId: view.session.llmProvider,
        projectKey,
        projectName: shortProjectLabel(view.session.sourceLabel) || projectKey,
        occurredStart: view.session.startedAt,
        occurredEnd: view.session.endedAt,
        summary: workSummary.headline,
        stepCount: view.events.length,
        decisions: view.decisions.map((decision) => ({
          title: decision.title,
          rationale: decision.rationale,
        })),
      });
      setRecordState("done");
    } catch {
      setRecordState("idle");
    }
  }

  return (
    <div className="session-tab-pane session-tab-overview">
      <div className="session-tab-split is-collapsed">
        <div className="session-tab-main overview-main">
          {sessionEmpty ? (
            <SessionEmptyPrompt
              title="세션에 가져온 소스 없음"
              hint="소스에서 대화를 가져오면 개요가 채워집니다."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  icon={ListPlus}
                  onClick={() => navigate("connections")}
                >
                  소스에서 가져오기
                </Button>
              }
            />
          ) : null}
          {!sessionEmpty ? (
            <section className="session-overview-hero" aria-label="세션 개요">
              <p className="session-overview-summary">{workSummary.headline}</p>
              <WorkShapeBar lanes={workSummary.digest.lanes} />
              <div className="session-overview-actions">
                {recordState === "done" ? (
                  <Button variant="secondary" size="sm" onClick={() => navigate("ledger")}>
                    기록에서 보기
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Sparkles}
                    disabled={recordState === "busy"}
                    onClick={() => void recordAsActivity()}
                  >
                    활동으로 기록
                  </Button>
                )}
              </div>
            </section>
          ) : null}

          {!sessionEmpty && lastRequest ? (
            <button
              type="button"
              className="overview-resume"
              onClick={resumeFromLastRequest}
              title="활동에서 이 지점 열기"
            >
              <span className="overview-resume-label">마지막으로 진행한 작업</span>
              <span className="overview-resume-title">{readableAgentText(shownLastRequest?.title ?? "")}</span>
              <span className="overview-resume-meta">
                {formatSidebarRelative(lastRequest.start)}
                <ArrowRight size={14} aria-hidden="true" />
              </span>
            </button>
          ) : null}

          <dl className="overview-metrics" aria-label="세션 규모">
            <OverviewMetric label="기간" value={duration} />
            <OverviewMetric label="자료" value={String(sourceCount)} />
            <OverviewMetric label="파일" value={String(fileCount)} />
            <OverviewMetric label="이슈" value={String(issueCount)} />
            <OverviewMetric label="결정" value={String(decisionCount)} />
            <OverviewMetric label="다음 액션" value={String(nextActionCount)} />
            {tokenStats ? (
              <OverviewMetric
                label="토큰"
                value={tokenStats.totalLabel}
                title={tokenStats.detailLabel}
              />
            ) : null}
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
                      <ArrowRight size={13} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              {unresolved.length > 4 ? (
                <button
                  type="button"
                  className="overview-attention-more"
                  onClick={() => setSessionTab("analysis")}
                >
                  정리에서 {unresolved.length - 4}건 더 보기
                </button>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function OverviewMetric({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  /** Optional hover detail (e.g. the token input/output/model breakdown). */
  title?: string;
}) {
  return (
    <div className="overview-metric" title={title}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
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
