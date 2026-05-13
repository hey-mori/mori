import { ArrowRightLeft, ClipboardList } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { eventTypeLabels, eventTypeTone } from "../../domain/constants";
import type { MoriMockSession } from "../../domain/types";
import { formatTimeRange } from "../../lib/formatting/time";
import type { TimelineDisplayBundle } from "../../lib/timeline/displayItems";
import { describeTrustLevel } from "../../lib/relationships/relationshipDisplay";

export function TimelineBundleInspector({
  bundle,
  session,
  onTrace,
}: {
  bundle: TimelineDisplayBundle;
  session: MoriMockSession;
  onTrace: () => void;
}) {
  const trust = describeTrustLevel(bundle.trustLevel);
  const includedEvents = session.events.filter((event) => bundle.memberEventIds.includes(event.id));
  const sources = session.sources.filter((source) =>
    includedEvents.some((event) => event.sourceRefs.includes(source.id)),
  );
  const issues = session.issues.filter((issue) => bundle.representedIssueIds.includes(issue.id));
  const decisions = session.decisions.filter((decision) => bundle.representedDecisionIds.includes(decision.id));

  return (
    <aside className="inspector" aria-label="Bundle inspector">
      <header className="inspector-header">
        <div className="inspector-badges">
          <Badge tone={eventTypeTone[bundle.laneType]}>{eventTypeLabels[bundle.laneType]}</Badge>
          <Badge tone={trust.tone}>{trust.label}</Badge>
          <Badge tone="gray">{bundle.bundleKind}</Badge>
        </div>
        <h3 className="inspector-title">{bundle.title}</h3>
        <p className="inspector-time">{formatTimeRange(bundle.start, bundle.end)}</p>
      </header>

      <section className="inspector-section">
        <p className="inspector-summary">{bundle.summary}</p>
      </section>

      <section className="inspector-section">
        <SectionHeader title="왜 묶였는가" hint={`${bundle.count} events`} />
        <p className="inspector-summary">{bundle.reason.message}</p>
      </section>

      <section className="inspector-section">
        <SectionHeader title="포함된 이벤트" />
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
        <SectionHeader title="대표 항목" />
        <ul className="inspector-linked-rows">
          <li>
            <Badge tone="cyan">소스</Badge>
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

      <section className="inspector-section inspector-actions-row">
        <Button variant="primary" icon={ArrowRightLeft} onClick={onTrace}>
          Open Flow Focus
        </Button>
        <Button icon={ClipboardList} disabled title="Inline expansion is planned">
          Expand bundle inline (planned)
        </Button>
      </section>
    </aside>
  );
}
