import { ClipboardCopy, Link as LinkIcon } from "lucide-react";
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

export function EventInspector({
  selectedEvent,
  session,
  onTrace,
}: {
  selectedEvent: TimelineEvent;
  session: MoriMockSession;
  onTrace: () => void;
}) {
  const trust = describeTrustLevel(selectedEvent.trustLevel);
  const sources = session.sources.filter((source) => selectedEvent.sourceRefs.includes(source.id));
  const issues = session.issues.filter((issue) => selectedEvent.linkedIssueIds.includes(issue.id));
  const decisions = session.decisions.filter((decision) =>
    selectedEvent.linkedDecisionIds.includes(decision.id),
  );
  const artifacts = session.artifacts.filter((artifact) =>
    selectedEvent.artifactIds?.includes(artifact.id),
  );
  const nextActions = session.nextActions.filter((action) =>
    action.relatedEventIds.includes(selectedEvent.id),
  );
  const confidencePct = Math.round(selectedEvent.confidence * 100);

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
            <Badge tone={confidenceTone(confidencePct)}>{confidencePct}%</Badge>
          ) : null}
        </div>
        <h3 className="inspector-title">{selectedEvent.title}</h3>
        <p className="inspector-time">{formatTimeRange(selectedEvent.start, selectedEvent.end)}</p>
      </header>

      <section className="inspector-section">
        <div className="inspector-summary-card">
          <span>Summary</span>
          <p>{selectedEvent.summary}</p>
        </div>
      </section>

      <section className="inspector-section">
        <SectionHeader title="Evidence / trust" hint={`${sources.length} source${sources.length === 1 ? "" : "s"}`} />
        <div className="inspector-trust-card">
          <strong>{trust.label}</strong>
          <span>{trustCopy(selectedEvent.trustLevel)}</span>
          <small>
            Created by {selectedEvent.createdBy}
            {selectedEvent.userModified ? " · user modified" : ""}
          </small>
        </div>
        <SourcesList sources={sources} />
      </section>

      <section className="inspector-section">
        <SectionHeader title="Linked items" />
        <LinkedRows
          issues={issues}
          decisions={decisions}
          artifacts={artifacts}
          nextActions={nextActions}
        />
      </section>

      {decisions.length > 0 ? (
        <section className="inspector-section">
          <SectionHeader title="Impact" />
          <ul className="inspector-impact-list">
            {decisions.flatMap((decision) => decision.impact).slice(0, 3).map((impact) => (
              <li key={impact}>{impact}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="inspector-section">
        <SectionHeader title="Actions" />
        <div className="inspector-actions-row">
          <Button variant="primary" icon={LinkIcon} onClick={onTrace}>
            Flow trace
          </Button>
          <Button icon={ClipboardCopy} onClick={handleCopy}>
            Copy summary
          </Button>
        </div>
      </section>

      <section className="inspector-section">
        <SectionHeader title="Memo / correction" hint="Planned" />
        <textarea
          placeholder="Corrections and notes will be saved in a future milestone."
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
      {sources.map((source) => (
        <li key={source.id}>
          <div>
            <strong>{source.title}</strong>
            <small>
              {source.kind} · {source.rawRetention}
            </small>
          </div>
          <Badge tone={describeTrustLevel(source.trustLevel).tone}>
            {describeTrustLevel(source.trustLevel).label}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function LinkedRows({
  issues,
  decisions,
  artifacts,
  nextActions,
}: {
  issues: Issue[];
  decisions: Decision[];
  artifacts: Artifact[];
  nextActions: NextAction[];
}) {
  const rows: Array<{ label: string; tone: string; items: string[] }> = [
    { label: "Issues", tone: "red", items: issues.map((issue) => issue.title) },
    { label: "Decisions", tone: "green", items: decisions.map((decision) => decision.title) },
    { label: "Files", tone: "blue", items: artifacts.map((artifact) => artifact.title) },
    { label: "Next actions", tone: "purple", items: nextActions.map((action) => action.title) },
  ];
  return (
    <ul className="inspector-linked-rows">
      {rows.map((row) => (
        <li key={row.label}>
          <Badge tone={row.tone}>{row.label}</Badge>
          <span className="inspector-linked-count">{row.items.length}</span>
          {row.items.length > 0 ? (
            <span className="inspector-linked-first" title={row.items.join(" · ")}>
              {row.items[0]}
              {row.items.length > 1 ? ` · +${row.items.length - 1}` : ""}
            </span>
          ) : (
            <span className="inspector-linked-empty">없음</span>
          )}
        </li>
      ))}
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
  if (trustLevel === "verified") return "This event is backed by captured source evidence.";
  if (trustLevel === "observed") return "This event is derived from observed work context.";
  return "This event was inferred by analysis and should remain correctable.";
}

export { formatTime };
