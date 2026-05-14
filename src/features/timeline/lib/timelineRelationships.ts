/**
 * Feature-local re-export of the relationship visibility policy.
 *
 * The policy itself (`buildVisibleConnectors`, `chooseRelationshipVisibility`,
 * `defaultConnectorCap`) lives in `src/lib/timeline/relationshipPolicy.ts`.
 */
import type { Relationship, TimelineEvent } from "../../../domain/types";
import {
  buildVisibleConnectors,
  chooseRelationshipVisibility,
  defaultConnectorCap,
  type VisibleConnector,
  type RelationshipVisibility,
} from "../../../lib/timeline/relationshipPolicy";
import { getRelationshipDisplay } from "../../../lib/relationships/relationshipDisplay";

export {
  buildVisibleConnectors,
  chooseRelationshipVisibility,
  defaultConnectorCap,
  type VisibleConnector,
  type RelationshipVisibility,
};

export type TimelineRelationshipViewModel = {
  relationship: Relationship;
  label: string;
  tone: string;
  description: string;
  /** Whether this relationship's other endpoint is currently focused. */
  focused: boolean;
};

/**
 * Build a list of relationship view-models for the inspector / trace panel.
 * The renderer just consumes `label / tone / focused` rather than re-running
 * the lookup tables in `relationshipDisplay`.
 */
export function buildTimelineRelationshipViewModels(args: {
  selectedEvent: TimelineEvent;
  relationships: Relationship[];
  focusedSet?: Set<string>;
}): TimelineRelationshipViewModel[] {
  const focusedSet = args.focusedSet ?? new Set<string>();
  return args.relationships
    .filter((relationship) => relationship.fromId === args.selectedEvent.id || relationship.toId === args.selectedEvent.id)
    .map((relationship) => {
      const display = getRelationshipDisplay(relationship.type);
      const otherEndpoint = relationship.fromId === args.selectedEvent.id ? relationship.toId : relationship.fromId;
      return {
        relationship,
        label: display.label,
        tone: display.tone,
        description: display.description,
        focused: focusedSet.has(otherEndpoint),
      };
    });
}
