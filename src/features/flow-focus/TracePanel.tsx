import { Bell, Link, MessageSquare, Plus, Sparkles } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { SectionHeader } from "../../components/ui/SectionHeader";
import type { MoriMockSession, TimelineEvent } from "../../domain/types";
import { buildFocusGraph } from "../../lib/relationships/focusGraph";
import {
  describeRelationshipConfidence,
  getRelationshipDisplay,
} from "../../lib/relationships/relationshipDisplay";
import { FocusPathSummary } from "./FocusPathSummary";
import { TraceRelationshipList } from "./TraceRelationshipList";

export function TracePanel({
  selectedEvent,
  session,
  onClearFocus,
}: {
  selectedEvent: TimelineEvent;
  session: MoriMockSession;
  onClearFocus?: () => void;
}) {
  const graph = buildFocusGraph(selectedEvent.id, session.relationships);

  return (
    <aside className="inspector trace">
      <SectionHeader
        title="Flow trace"
        hint="Hover events to preview related flow. Click to pin focus."
      />
      <FocusPathSummary
        selectedEvent={selectedEvent}
        causeCount={graph.causes.length}
        resultCount={graph.results.length}
        onClearFocus={onClearFocus}
      />
      <TraceRelationshipList
        title={`Upstream causes (${graph.causes.length})`}
        emptyHint="No direct causes were inferred for this event."
        relationships={graph.causes}
        session={session}
        direction="upstream"
      />
      <TraceRelationshipList
        title={`Downstream results (${graph.results.length})`}
        emptyHint="No downstream results from this event yet."
        relationships={graph.results}
        session={session}
        direction="downstream"
      />
      <section className="panel-section">
        <SectionHeader title="All linked relationships" hint="Includes both upstream and downstream links." />
        {graph.causes.length + graph.results.length === 0 ? (
          <p className="muted">This event has no inferred relationships.</p>
        ) : (
          <ul className="trace-stack">
            {[...graph.causes, ...graph.results].map((relationship) => {
              const display = getRelationshipDisplay(relationship.type);
              const confidence = describeRelationshipConfidence(relationship.confidence);
              return (
                <li key={`${relationship.id}-confidence`}>
                  <div>
                    <Badge tone={display.tone}>{display.label}</Badge>
                    <Badge tone={confidence.tone}>{confidence.label}</Badge>
                  </div>
                  {relationship.reason ? <small>{relationship.reason}</small> : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="panel-section">
        <SectionHeader title="Actions" hint="Placeholders. Editing flow lands in a future milestone." />
        <div className="trace-actions">
          <Button icon={Link} disabled title="Editing relationships is not implemented yet">Edit link</Button>
          <Button icon={Plus} disabled title="Adding relationships is not implemented yet">Add link</Button>
          <Button icon={MessageSquare} disabled title="Notes are planned">Add note</Button>
          <Button icon={Bell} disabled title="Manual issue creation is planned">Create issue</Button>
          <Button icon={Sparkles} disabled title="Re-running analysis from Flow Focus is planned">Re-analyze</Button>
        </div>
      </section>
    </aside>
  );
}
