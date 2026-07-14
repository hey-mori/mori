/**
 * Entity resolution · turns the entity mentions a proposer found into stable
 * `KernelEntity` records, so a record references an entity by id and a later
 * rename of that entity updates every reference at once (architecture doc §7,
 * the "달리기 → 러닝" scenario).
 *
 * Mentions arrive already alias-normalised by the personalization step, so
 * resolution is a canonical-name lookup against the known entities, creating
 * a new one only when none matches. Rename keeps the id (ID-stable) and emits
 * an alias rule so future captures of the old name resolve to the same entity.
 */
import { createKernelId } from "../record-kernel/recordFactory";
import type { KernelEntity, KernelRule } from "../record-kernel/kernelTypes";
import type { EntityMention } from "./captureTypes";
import { buildAliasRule } from "./personalization";

export type ResolvedEntity = {
  mention: EntityMention;
  entity: KernelEntity;
  isNew: boolean;
};

export type EntityResolution = {
  resolved: ResolvedEntity[];
  /** Entities that did not exist and must be persisted. */
  newEntities: KernelEntity[];
};

/** Resolves mentions to entities, matching on canonical name
 *  (case-insensitive) and creating a new entity when none matches. */
export function resolveEntities(
  mentions: EntityMention[],
  existing: KernelEntity[],
  now: () => Date = () => new Date(),
): EntityResolution {
  const byName = new Map(existing.map((entity) => [entity.canonicalName.toLowerCase(), entity]));
  const newEntities: KernelEntity[] = [];
  const resolved: ResolvedEntity[] = [];

  for (const mention of mentions) {
    const key = mention.canonicalName.toLowerCase();
    let entity = byName.get(key);
    let isNew = false;
    if (!entity) {
      entity = {
        id: createKernelId("ent"),
        type: mention.type,
        canonicalName: mention.canonicalName,
        createdAt: now().toISOString(),
      };
      byName.set(key, entity);
      newEntities.push(entity);
      isNew = true;
    }
    resolved.push({ mention, entity, isNew });
  }

  return { resolved, newEntities };
}

export type EntityRename = {
  /** The same entity id with the new canonical name. */
  entity: KernelEntity;
  /** old-name to new-name alias so future captures resolve to this entity. */
  aliasRule: KernelRule;
};

/** Renames an entity, keeping its id so every record that references it now
 *  reads the new name, and returns an alias rule mapping the old name to the
 *  new one. Display-only: past record bodies keep their raw text (rewriting
 *  past text is a separate, opt-in scope). */
export function renameEntity(
  entity: KernelEntity,
  newName: string,
  now: () => Date = () => new Date(),
): EntityRename {
  const trimmed = newName.trim();
  return {
    entity: { ...entity, canonicalName: trimmed },
    aliasRule: buildAliasRule(entity.canonicalName, trimmed, [], now),
  };
}
