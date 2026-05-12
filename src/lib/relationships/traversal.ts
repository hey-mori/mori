import type { Relationship, TimelineEvent } from "../../domain/types";

export function getDirectRelationshipIds(entityId: string, relationships: Relationship[]): Set<string> {
  const related = new Set<string>([entityId]);

  for (const relationship of relationships) {
    if (relationship.fromId === entityId) related.add(relationship.toId);
    if (relationship.toId === entityId) related.add(relationship.fromId);
  }

  return related;
}

export function getFocusedEntitySet(entityId: string | null, relationships: Relationship[], depth = 1): Set<string> {
  if (!entityId) return new Set();

  const focused = new Set<string>([entityId]);
  let frontier = new Set<string>([entityId]);

  for (let level = 0; level < depth; level += 1) {
    const next = new Set<string>();

    for (const id of frontier) {
      for (const relatedId of getDirectRelationshipIds(id, relationships)) {
        if (!focused.has(relatedId)) {
          focused.add(relatedId);
          next.add(relatedId);
        }
      }
    }

    frontier = next;
  }

  return focused;
}

export function getRelationshipsForEntity(entityId: string, relationships: Relationship[]): Relationship[] {
  return relationships.filter((relationship) => relationship.fromId === entityId || relationship.toId === entityId);
}

export function getCauseRelationships(entityId: string, relationships: Relationship[]): Relationship[] {
  return relationships.filter((relationship) => relationship.toId === entityId);
}

export function getResultRelationships(entityId: string, relationships: Relationship[]): Relationship[] {
  return relationships.filter((relationship) => relationship.fromId === entityId);
}

export function getRelatedEvents(entityId: string, events: TimelineEvent[], relationships: Relationship[]): TimelineEvent[] {
  const focused = getFocusedEntitySet(entityId, relationships, 1);
  return events.filter((event) => focused.has(event.id));
}
