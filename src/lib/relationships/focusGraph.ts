import type { Relationship } from "../../domain/types";
import {
  getCauseRelationships,
  getDirectRelationshipIds,
  getResultRelationships,
} from "./traversal";

export type FocusGraph = {
  selectedId: string;
  causes: Relationship[];
  results: Relationship[];
  directNeighbors: string[];
};

export function buildFocusGraph(selectedId: string, relationships: Relationship[]): FocusGraph {
  const directSet = getDirectRelationshipIds(selectedId, relationships);
  directSet.delete(selectedId);
  return {
    selectedId,
    causes: getCauseRelationships(selectedId, relationships),
    results: getResultRelationships(selectedId, relationships),
    directNeighbors: Array.from(directSet),
  };
}
