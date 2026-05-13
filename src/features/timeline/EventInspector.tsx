import {
  Archive,
  Bell,
  ClipboardCopy,
  FileText,
  Link as LinkIcon,
  MessageSquare,
  Scissors,
} from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { eventTypeLabels, eventTypeTone } from "../../domain/constants";
import type { Artifact, Decision, Issue, MoriMockSession, NextAction, SourceRef, TimelineEvent } from "../../domain/types";
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
  const rawAvailable = selectedEvent.sourceRefs.some((id) => {
    const source = session.sources.find((entry) => entry.id === id);
    return source?.rawRetention === "retained";
  });
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
        <div>
          <Badge tone={eventTypeTone[selectedEvent.type]}>{eventTypeLabels[selectedEvent.type]}</Badge>
          <Badge tone={trust.tone}>{trust.label}</Badge>
          {selectedEvent.trustLevel === "inferred" ? (
            <Badge tone={confidenceTone(confidencePct)}>{confidencePct}% confidence</Badge>
          ) : null}
        </div>
        <h3>{selectedEvent.title}</h3>
        <p className="time-range">{formatTimeRange(selectedEvent.start, selectedEvent.end)}</p>
      </header>
      <section className="panel-section">
        <SectionHeader title="Summary" />
        <p>{selectedEvent.summary}</p>
      </section>
      <section className="panel-section">
        <SectionHeader title="Trust" hint="How Mori knows this event happened." />
        <p className="muted">{describeTrustDetail(selectedEvent.trustLevel)}</p>
        <p>
          <strong>Created by:</strong> {selectedEvent.createdBy}
          {selectedEvent.userModified ? " (user-modified)" : ""}
        </p>
      </section>
      <SourceEvidenceSection sources={sources} rawAvailable={rawAvailable} />
      <LinkedItemsSection
        issues={issues}
        decisions={decisions}
        artifacts={artifacts}
        nextActions={nextActions}
      />
      <section className="panel-section">
        <SectionHeader
          title="Correction"
          hint="Mori's AI output may be wrong. Notes and edits land in a follow-up milestone."
        />
        <textarea
          placeholder="Leave a correction note — saving notes is a planned next milestone."
          disabled
        />
      </section>
      <section className="panel-section">
        <SectionHeader title="Actions" />
        <div className="inspector-actions">
          <Button variant="primary" icon={LinkIcon} onClick={onTrace}>
            Show flow trace
          </Button>
          <Button icon={ClipboardCopy} onClick={handleCopy}>
            Copy summary
          </Button>
          <Button icon={FileText} disabled title="Editing events is planned">
            Edit summary
          </Button>
          <Button icon={Bell} disabled title="Manual issue creation is planned">
            Create issue
          </Button>
          <Button icon={Scissors} disabled title="Splitting events is planned">
            Split event
          </Button>
          <Button icon={Archive} disabled title="Merging events is planned">
            Merge event
          </Button>
          <Button icon={MessageSquare} disabled title="Notes are planned">
            Add note
          </Button>
        </div>
      </section>
    </aside>
  );
}

function SourceEvidenceSection({
  sources,
  rawAvailable,
}: {
  sources: SourceRef[];
  rawAvailable: boolean;
}) {
  return (
    <section className="panel-section">
      <SectionHeader
        title={`Source evidence (${sources.length})`}
        hint={rawAvailable ? "Raw source retained for at least one input." : "No raw source retained."}
      />
      {sources.length === 0 ? (
        <p className="muted">No source is linked to this event yet.</p>
      ) : (
        <ul className="related-list">
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
      )}
    </section>
  );
}

function LinkedItemsSection({
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
  return (
    <section className="panel-section">
      <SectionHeader
        title="Linked items"
        hint="Records Quick Pass or imports linked to this event."
      />
      <div className="linked-grid">
        <LinkedCard tone="red" label="Issues" count={issues.length} items={issues.map((issue) => issue.title)} />
        <LinkedCard
          tone="green"
          label="Decisions"
          count={decisions.length}
          items={decisions.map((decision) => decision.title)}
        />
        <LinkedCard
          tone="blue"
          label="Files / Artifacts"
          count={artifacts.length}
          items={artifacts.map((artifact) => artifact.title)}
        />
        <LinkedCard
          tone="purple"
          label="Next actions"
          count={nextActions.length}
          items={nextActions.map((action) => action.title)}
        />
      </div>
    </section>
  );
}

function LinkedCard({
  label,
  tone,
  count,
  items,
}: {
  label: string;
  tone: string;
  count: number;
  items: string[];
}) {
  return (
    <div className="linked-card">
      <header>
        <Badge tone={tone}>{label}</Badge>
        <strong>{count}</strong>
      </header>
      {items.length === 0 ? (
        <small className="muted">None linked.</small>
      ) : (
        <ul>
          {items.slice(0, 3).map((title) => (
            <li key={title}>{title}</li>
          ))}
          {items.length > 3 ? <li className="muted">+{items.length - 3} more</li> : null}
        </ul>
      )}
    </div>
  );
}

function describeTrustDetail(level: TimelineEvent["trustLevel"]): string {
  if (level === "verified") return "Verified evidence — source is a real, captured input.";
  if (level === "observed") return "Observed event — saw it happen but the meaning is still inferred.";
  return "Inferred event — Mori derived this from one or more sources. Treat as a hypothesis.";
}

function confidenceTone(pct: number): string {
  if (pct >= 85) return "green";
  if (pct >= 60) return "blue";
  if (pct >= 40) return "orange";
  return "red";
}

// Helper for older callers that pass a clock-style label.
export { formatTime };
