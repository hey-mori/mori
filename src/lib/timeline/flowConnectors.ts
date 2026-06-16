/**
 * Deterministic "activity flow" relationships for the swimlane.
 *
 * The timeline already renders a relationship line layer, but a freshly
 * imported session carries almost no analysis relationships, so no lines show.
 * This derives lines from the raw event order instead: within each request
 * (a user ask → the work it triggered) consecutive events that hand off to a
 * different lane (대화 → 명령 → 파일 …) are linked, so the eye can follow how
 * one activity led to the next.
 *
 * It is a deterministic parse of the event stream, not an AI proposal: the same
 * events always yield the same lines. Pure, no React, unit-testable.
 */
import type { Relationship, SourceRef, TimelineEvent } from "../../domain/types";
import { buildSourceIndex, getTimelineLaneForEvent } from "./activityModel";
import { buildRequestSpans } from "./requestSpans";

export function buildFlowRelationships(
  events: readonly TimelineEvent[],
  sources: readonly SourceRef[],
): Relationship[] {
  const sourceIndex = buildSourceIndex(sources);
  const byId = new Map(events.map((event) => [event.id, event]));
  const laneOf = (event: TimelineEvent) =>
    getTimelineLaneForEvent({ event, sources: sourceIndex });

  const relationships: Relationship[] = [];
  for (const span of buildRequestSpans(events)) {
    // span.eventIds run in time order (the opening ask first). Link each event
    // to the next one that hands off to a different lane, so a run of same-lane
    // events collapses to a single handoff line instead of a dense ladder.
    let previous: TimelineEvent | null = null;
    for (const id of span.eventIds) {
      const event = byId.get(id);
      if (!event) continue;
      if (previous && laneOf(previous) !== laneOf(event)) {
        relationships.push({
          id: `flow-${previous.id}-${event.id}`,
          fromId: previous.id,
          fromType: "event",
          toId: event.id,
          toType: "event",
          type: "ledTo",
          confidence: 1,
          reason: "같은 요청 안에서 이어진 활동",
        });
      }
      previous = event;
    }
  }

  return relationships;
}
