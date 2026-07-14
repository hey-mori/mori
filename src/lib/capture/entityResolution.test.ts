import { describe, expect, it } from "vitest";
import type { KernelEntity } from "../record-kernel/kernelTypes";
import { renameEntity, resolveEntities } from "./entityResolution";

const now = () => new Date("2026-07-14T09:00:00.000Z");
const mention = (canonicalName: string) => ({ type: "exercise", canonicalName });

describe("resolveEntities", () => {
  it("creates a new entity for an unknown mention", () => {
    const { resolved, newEntities } = resolveEntities([mention("러닝")], [], now);
    expect(newEntities).toHaveLength(1);
    expect(resolved[0].isNew).toBe(true);
    expect(resolved[0].entity.canonicalName).toBe("러닝");
    expect(resolved[0].entity.type).toBe("exercise");
  });

  it("reuses an existing entity by canonical name, case-insensitively", () => {
    const existing: KernelEntity = {
      id: "ent-run",
      type: "exercise",
      canonicalName: "러닝",
      createdAt: "2026-07-01",
    };
    const { resolved, newEntities } = resolveEntities([mention("러닝")], [existing], now);
    expect(newEntities).toHaveLength(0);
    expect(resolved[0].isNew).toBe(false);
    expect(resolved[0].entity.id).toBe("ent-run");
  });

  it("shares one new entity across repeated mentions in the same batch", () => {
    const { newEntities } = resolveEntities([mention("플랭크"), mention("플랭크")], [], now);
    expect(newEntities).toHaveLength(1);
  });
});

describe("renameEntity", () => {
  it("keeps the id, changes the canonical name, and emits an old-to-new alias", () => {
    const entity: KernelEntity = {
      id: "ent-run",
      type: "exercise",
      canonicalName: "달리기",
      createdAt: "2026-07-01",
    };
    const { entity: renamed, aliasRule } = renameEntity(entity, "러닝", now);
    expect(renamed.id).toBe("ent-run");
    expect(renamed.canonicalName).toBe("러닝");
    expect(aliasRule.kind).toBe("alias");
    expect(aliasRule.condition.alias).toBe("달리기");
    expect(aliasRule.effect.canonicalName).toBe("러닝");
  });
});
