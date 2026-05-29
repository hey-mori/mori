import { Badge } from "../../components/ui/Badge";
import type { MockSession, Relationship } from "../../domain/types";
import { formatTime } from "../../lib/formatting/time";
import {
  describeRelationshipConfidence,
  getRelationshipDisplay,
} from "../../lib/relationships/relationshipDisplay";

export function TraceRelationshipList({
  title,
  emptyHint,
  relationships,
  session,
  direction,
}: {
  title: string;
  emptyHint: string;
  relationships: Relationship[];
  session: MockSession;
  direction: "upstream" | "downstream";
}) {
  if (!relationships.length) {
    return (
      <section className="panel-section">
        <h4>{title}</h4>
        <p className="muted">{emptyHint}</p>
      </section>
    );
  }
  return (
    <section className="panel-section">
      <h4>{title}</h4>
      <ul className="trace-stack">
        {relationships.map((relationship) => {
          const eventId = direction === "upstream" ? relationship.fromId : relationship.toId;
          const event = session.events.find((entry) => entry.id === eventId);
          const display = getRelationshipDisplay(relationship.type);
          const confidence = describeRelationshipConfidence(relationship.confidence);
          return (
            <li key={relationship.id}>
              <div>
                <span className="trace-time">{event ? formatTime(event.start) : "—"}</span>
                <strong>{event?.title ?? eventId}</strong>
              </div>
              <div className="trace-meta">
                <Badge tone={display.tone}>{display.label}</Badge>
                <Badge tone={confidence.tone}>{confidence.label}</Badge>
              </div>
              {relationship.reason ? <small>{relationship.reason}</small> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
