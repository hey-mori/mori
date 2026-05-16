import {
  ClipboardCopy,
  Link as LinkIcon,
  Pencil,
  Split,
  Combine,
  PlusCircle,
  StickyNote,
} from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { eventTypeLabels, eventTypeTone } from "../../domain/constants";
import type {
  Artifact,
  Decision,
  Issue,
  MoriMockSession,
  NextAction,
  SourceRef,
  TimelineEvent,
} from "../../domain/types";
import { formatTime, formatTimeRange } from "../../lib/formatting/time";
import { describeTrustLevel } from "../../lib/relationships/relationshipDisplay";
import { getSourceDisplayStatus } from "../../lib/sources/traceability";
import type { ReviewSelection } from "../../lib/review-workspace/reviewWorkspace";
import {
  buildInspectorViewModel,
  type TimelineRenderModel,
} from "../../lib/timeline/timelineViewModel";
import {
  TIMELINE_CONTROLS,
  getPlannedHint,
} from "../../lib/timeline/timelineControls";
import { MoriPlannedAction } from "../../components/ui/MoriPlannedAction";

export function EventInspector({
  selectedEvent,
  session,
  model,
  onTrace,
  onOpenReviewItem,
}: {
  selectedEvent: TimelineEvent;
  session: MoriMockSession;
  model: TimelineRenderModel;
  onTrace: () => void;
  /** Deep-link a linked issue / decision / next action into the Review surface. */
  onOpenReviewItem?: (selection: ReviewSelection) => void;
}) {
  const inspector = buildInspectorViewModel({
    event: selectedEvent,
    view: session,
    model,
  });
  const trust = describeTrustLevel(selectedEvent.trustLevel);

  function handleCopy() {
    const text = `${formatTimeRange(selectedEvent.start, selectedEvent.end)}\n${selectedEvent.title}\n\n${selectedEvent.summary}`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
    }
  }

  return (
    <aside className="inspector" aria-label="Event inspector">
      <header className="inspector-header">
        <div className="inspector-badges">
          <Badge tone={eventTypeTone[selectedEvent.type]}>{eventTypeLabels[selectedEvent.type]}</Badge>
          <Badge tone={trust.tone}>{trust.label}</Badge>
          {selectedEvent.trustLevel === "inferred" ? (
            <Badge tone={confidenceTone(inspector.confidencePct)}>{inspector.confidencePct}%</Badge>
          ) : null}
          {selectedEvent.userModified ? <Badge tone="orange">사용자 수정</Badge> : null}
        </div>
        <h3 className="inspector-title">{selectedEvent.title}</h3>
        <p className="inspector-time">{formatTimeRange(selectedEvent.start, selectedEvent.end)}</p>
      </header>

      <section className="inspector-section">
        <div className="inspector-summary-card">
          <span>요약</span>
          <p>{selectedEvent.summary}</p>
        </div>
      </section>

      <section className="inspector-section">
        <SectionHeader
          title="근거 / 신뢰도"
          hint={`${inspector.sources.length}개 출처`}
        />
        <div className="inspector-trust-card">
          <strong>{trust.label}</strong>
          <span>{trustCopy(selectedEvent.trustLevel)}</span>
          <small>
            작성 주체: {selectedEvent.createdBy}
            {selectedEvent.userModified ? " · 사용자 수정함" : ""}
          </small>
        </div>
        <SourcesList sources={inspector.sources} />
      </section>

      <section className="inspector-section">
        <SectionHeader
          title="연결된 항목"
          hint={inspector.hiddenRelationshipCount > 0 ? `+${inspector.hiddenRelationshipCount}개 숨김` : undefined}
        />
        <LinkedRows
          issues={inspector.issues}
          decisions={inspector.decisions}
          artifacts={inspector.artifacts}
          nextActions={inspector.nextActions}
          onOpenReviewItem={onOpenReviewItem}
        />
        {inspector.hiddenRelationshipCount > 0 ? (
          <p className="inspector-hidden-note">
            연결된 이벤트 {inspector.hiddenRelationshipCount}건이 현재 포커스
            범위 밖에 있습니다. <strong>흐름 추적</strong>을 열면 전체
            관계 그래프를 볼 수 있습니다.
          </p>
        ) : null}
      </section>

      {inspector.decisions.length > 0 ? (
        <section className="inspector-section">
          <SectionHeader title="영향" />
          <ul className="inspector-impact-list">
            {inspector.decisions
              .flatMap((decision) => decision.impact)
              .slice(0, 3)
              .map((impact) => (
                <li key={impact}>{impact}</li>
              ))}
          </ul>
        </section>
      ) : null}

      <section className="inspector-section">
        <SectionHeader title="액션" hint="구현됨" />
        <div className="inspector-actions-row">
          <Button variant="primary" icon={LinkIcon} onClick={onTrace}>
            흐름 추적
          </Button>
          <Button icon={ClipboardCopy} onClick={handleCopy}>
            요약 복사
          </Button>
        </div>
      </section>

      <section className="inspector-section">
        <SectionHeader title="예정된 액션" hint="Planned" />
        <div className="inspector-actions-row inspector-actions-planned">
          <MoriPlannedAction
            feature="timeline.inspector.editEvent"
            label={TIMELINE_CONTROLS.inspectorEditEvent.label}
            icon={Pencil}
          />
          <MoriPlannedAction
            feature="timeline.inspector.split"
            label={TIMELINE_CONTROLS.inspectorSplitEvent.label}
            icon={Split}
          />
          <MoriPlannedAction
            feature="timeline.inspector.merge"
            label={TIMELINE_CONTROLS.inspectorMergeEvent.label}
            icon={Combine}
          />
          <MoriPlannedAction
            feature="timeline.inspector.createIssue"
            label={TIMELINE_CONTROLS.inspectorCreateIssue.label}
            icon={PlusCircle}
          />
          <MoriPlannedAction
            feature="timeline.inspector.addNote"
            label={TIMELINE_CONTROLS.inspectorAddNote.label}
            icon={StickyNote}
          />
        </div>
      </section>

      <section className="inspector-section">
        <SectionHeader title="메모 / 수정" hint="Planned" />
        <textarea
          placeholder={getPlannedHint("memoSave") ?? "수정과 메모 저장은 다음 마일스톤에서 제공됩니다."}
          disabled
          className="inspector-memo"
        />
      </section>
    </aside>
  );
}

function SourcesList({ sources }: { sources: SourceRef[] }) {
  if (sources.length === 0) {
    return <p className="inspector-empty">연결된 출처가 없습니다.</p>;
  }
  return (
    <ul className="inspector-source-list">
      {sources.map((source) => {
        const displayStatus = getSourceDisplayStatus(source);
        return (
          <li key={source.id}>
            <div>
              <strong>{source.title}</strong>
              <small>
                {displayStatus.integrationLabel} · {displayStatus.captureMethod} ·{" "}
                {displayStatus.rawDataLabel}
              </small>
            </div>
            <Badge tone={describeTrustLevel(source.trustLevel).tone}>
              {describeTrustLevel(source.trustLevel).label}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

function LinkedRows({
  issues,
  decisions,
  artifacts,
  nextActions,
  onOpenReviewItem,
}: {
  issues: Issue[];
  decisions: Decision[];
  artifacts: Artifact[];
  nextActions: NextAction[];
  onOpenReviewItem?: (selection: ReviewSelection) => void;
}) {
  const rows: Array<{
    label: string;
    tone: string;
    titles: string[];
    focus: ReviewSelection | null;
  }> = [
    {
      label: "이슈",
      tone: "red",
      titles: issues.map((issue) => issue.title),
      focus: issues[0] ? { kind: "issue", issueId: issues[0].id } : null,
    },
    {
      label: "결정",
      tone: "green",
      titles: decisions.map((decision) => decision.title),
      focus: decisions[0] ? { kind: "decision", decisionId: decisions[0].id } : null,
    },
    {
      label: "파일",
      tone: "blue",
      titles: artifacts.map((artifact) => artifact.title),
      focus: null,
    },
    {
      label: "다음 액션",
      tone: "purple",
      titles: nextActions.map((action) => action.title),
      focus: nextActions[0]
        ? { kind: "nextAction", nextActionId: nextActions[0].id }
        : null,
    },
  ];
  return (
    <ul className="inspector-linked-rows">
      {rows.map((row) => {
        const body = (
          <>
            <Badge tone={row.tone}>{row.label}</Badge>
            <span className="inspector-linked-count">{row.titles.length}</span>
            {row.titles.length > 0 ? (
              <span className="inspector-linked-first" title={row.titles.join(" · ")}>
                {row.titles[0]}
                {row.titles.length > 1 ? ` · +${row.titles.length - 1}` : ""}
              </span>
            ) : (
              <span className="inspector-linked-empty">없음</span>
            )}
          </>
        );
        const linkable =
          row.focus !== null && row.titles.length > 0 && Boolean(onOpenReviewItem);
        return (
          <li key={row.label}>
            {linkable ? (
              <button
                type="button"
                className="inspector-linked-row is-linkable"
                onClick={() => onOpenReviewItem?.(row.focus as ReviewSelection)}
                title="Review에서 이 항목 열기"
              >
                {body}
              </button>
            ) : (
              <div className="inspector-linked-row">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function confidenceTone(pct: number): string {
  if (pct >= 85) return "green";
  if (pct >= 60) return "blue";
  if (pct >= 40) return "orange";
  return "red";
}

function trustCopy(trustLevel: TimelineEvent["trustLevel"]): string {
  if (trustLevel === "verified") return "캡처된 원본 근거로 뒷받침되는 이벤트입니다.";
  if (trustLevel === "observed") return "관찰된 작업 맥락에서 도출된 이벤트입니다.";
  return "분석이 추론한 이벤트로, 사용자가 언제든 수정할 수 있습니다.";
}

export { formatTime };
