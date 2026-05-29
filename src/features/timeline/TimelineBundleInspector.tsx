import { ArrowRightLeft, ClipboardList, X } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { BasePlannedAction } from "../../components/ui/BasePlannedAction";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { eventTypeLabels, eventTypeTone } from "../../domain/constants";
import type { MockSession } from "../../domain/types";
import { formatTimeRange } from "../../lib/formatting/time";
import { getActivityLaneVisuals } from "../../lib/timeline/activityModel";
import {
  buildBundleDensityProfile,
  describeBundleKind,
  describeBundleReason,
  type TimelineDisplayBundle,
} from "../../lib/timeline/displayItems";
import { describeTrustLevel } from "../../lib/relationships/relationshipDisplay";

export function TimelineBundleInspector({
  bundle,
  session,
  onTrace,
  onClose,
}: {
  bundle: TimelineDisplayBundle;
  session: MockSession;
  onTrace: () => void;
  /** Close the inspector from within the panel. Absent ⇒ the X is hidden. */
  onClose?: () => void;
}) {
  const trust = describeTrustLevel(bundle.trustLevel);
  const laneVisuals = getActivityLaneVisuals(bundle.laneType);
  const densityProfile = buildBundleDensityProfile(bundle);
  const hasDensity = densityProfile.some((value) => value > 0);
  const includedEvents = session.events.filter((event) => bundle.memberEventIds.includes(event.id));
  const sources = session.sources.filter((source) =>
    includedEvents.some((event) => event.sourceRefs.includes(source.id)),
  );
  const issues = session.issues.filter((issue) => bundle.representedIssueIds.includes(issue.id));
  const decisions = session.decisions.filter((decision) => bundle.representedDecisionIds.includes(decision.id));

  return (
    <aside className="inspector" aria-label="Bundle inspector">
      <header className="inspector-header">
        {onClose ? (
          <button
            type="button"
            className="inspector-close"
            onClick={onClose}
            aria-label="인스펙터 닫기"
            title="인스펙터 닫기"
          >
            <X size={15} aria-hidden="true" />
          </button>
        ) : null}
        <div className="inspector-badges">
          <Badge tone={laneVisuals.tone}>{laneVisuals.label}</Badge>
          <Badge tone={trust.tone}>{trust.label}</Badge>
          <Badge tone="gray">{describeBundleKind(bundle.bundleKind)}</Badge>
        </div>
        <h3 className="inspector-title">{bundle.title}</h3>
        <p className="inspector-time">{formatTimeRange(bundle.start, bundle.end)}</p>
      </header>

      <section className="inspector-section">
        <div className="inspector-summary-card">
          <span>워크플로 묶음</span>
          <p>{bundle.summary}</p>
        </div>
      </section>

      <section className="inspector-section">
        <SectionHeader title="묶인 이유" hint={`이벤트 ${bundle.count}개`} />
        <div className="inspector-trust-card">
          <strong>{describeBundleReason(bundle.reason.code)}</strong>
          <span>{bundle.reason.message}</span>
          {bundle.sameConnectorSource ? (
            <span>
              이 묶음의 이벤트는 모두 같은 커넥터 소스(
              <code>{bundle.sameConnectorSource}</code>)에서 연속으로
              가져온 동일 소스 작업 흐름입니다.
            </span>
          ) : null}
          <small>
            출처 {bundle.sourceCount} · 결정 {bundle.decisionCount} · 이슈 {bundle.issueCount}
          </small>
        </div>
      </section>

      {hasDensity ? (
        <section className="inspector-section">
          <SectionHeader title="활동 밀도" hint={formatTimeRange(bundle.start, bundle.end)} />
          <div className="inspector-trust-card">
            <span
              className={`timeline-bundle-density tone-${laneVisuals.tone}`}
              style={{ height: 22, opacity: 0.7, marginLeft: 0, gap: 2.5 }}
              aria-hidden="true"
            >
              {densityProfile.map((value, index) => (
                <span key={index} style={{ height: `${Math.max(16, Math.round(value * 100))}%`, width: 3 }} />
              ))}
            </span>
            <small>묶음 구간을 따라 이벤트가 언제 몰렸는지 보여줍니다.</small>
          </div>
        </section>
      ) : null}

      <section className="inspector-section">
        <SectionHeader title="유형 구성" />
        <div className="inspector-mix-row">
          {Object.entries(bundle.eventTypeCounts).map(([type, count]) => (
            <Badge key={type} tone={eventTypeTone[type as keyof typeof eventTypeTone]}>
              {eventTypeLabels[type as keyof typeof eventTypeLabels]} {count}
            </Badge>
          ))}
        </div>
      </section>

      <section className="inspector-section">
        <SectionHeader title="포함된 이벤트" hint={`${includedEvents.length}건`} />
        <ul className="inspector-source-list">
          {includedEvents.map((event) => (
            <li key={event.id}>
              <div>
                <strong>{event.title}</strong>
                <small>
                  {eventTypeLabels[event.type]} · {formatTimeRange(event.start, event.end)}
                </small>
              </div>
              <Badge tone={eventTypeTone[event.type]}>{eventTypeLabels[event.type]}</Badge>
            </li>
          ))}
        </ul>
      </section>

      <section className="inspector-section">
        <SectionHeader title="대표 근거" />
        <ul className="inspector-linked-rows">
          <li>
            <Badge tone="cyan">출처</Badge>
            <span className="inspector-linked-count">{sources.length}</span>
            <span className="inspector-linked-first">{sources[0]?.title ?? "없음"}</span>
          </li>
          <li>
            <Badge tone="green">결정</Badge>
            <span className="inspector-linked-count">{decisions.length}</span>
            <span className="inspector-linked-first">{decisions[0]?.title ?? "없음"}</span>
          </li>
          <li>
            <Badge tone="red">이슈</Badge>
            <span className="inspector-linked-count">{issues.length}</span>
            <span className="inspector-linked-first">{issues[0]?.title ?? "없음"}</span>
          </li>
        </ul>
      </section>

      <section className="inspector-section">
        <SectionHeader title="액션" />
        <div className="inspector-actions-row">
          <Button variant="primary" icon={ArrowRightLeft} onClick={onTrace}>
            Flow Focus 열기
          </Button>
          <BasePlannedAction
            icon={ClipboardList}
            label="인라인 펼치기"
            title="인라인 펼치기는 예정된 기능입니다."
          />
        </div>
      </section>
    </aside>
  );
}
