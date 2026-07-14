import { describe, expect, it } from "vitest";
import { createSchemaRegistry } from "../../lib/record-kernel/schemaRegistry";
import type {
  KernelEntity,
  KernelRelation,
  MoriRecord,
} from "../../lib/record-kernel/kernelTypes";
import { aggregateTrackers } from "./trackerAggregation";

const registry = createSchemaRegistry();

function workout(id: string, minutes: number): MoriRecord {
  return {
    id,
    schemaId: "workout",
    title: id,
    body: "",
    capturedAt: "2026-07-14T09:00:00Z",
    timeBasis: "unknown",
    status: "active",
    origin: "derived",
    ownership: "db",
    contextIds: [],
    properties: { durationMinutes: minutes },
    createdAt: "2026-07-14T09:00:00Z",
    updatedAt: "2026-07-14T09:00:00Z",
  };
}

const running: KernelEntity = { id: "ent-run", type: "exercise", canonicalName: "러닝", createdAt: "x" };
const plank: KernelEntity = { id: "ent-plank", type: "exercise", canonicalName: "플랭크", createdAt: "x" };

function ref(recordId: string, entityId: string): KernelRelation {
  return { id: `rel-${recordId}-${entityId}`, fromRecordId: recordId, type: "references", toEntityId: entityId, createdAt: "x" };
}

describe("aggregateTrackers", () => {
  it("rolls up a schema's record count and metric total", () => {
    const groups = aggregateTrackers(
      [workout("a", 20), workout("b", 15), workout("c", 10)],
      [ref("a", "ent-run"), ref("b", "ent-run"), ref("c", "ent-run")],
      [running],
      registry,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("운동");
    expect(groups[0].recordCount).toBe(3);
    expect(groups[0].totalMetric).toBe(45);
    expect(groups[0].metricUnit).toBe("분");
  });

  it("breaks down by entity, newest-canonical-name and count-sorted", () => {
    const groups = aggregateTrackers(
      [workout("a", 20), workout("b", 15), workout("c", 3)],
      [ref("a", "ent-run"), ref("b", "ent-run"), ref("c", "ent-plank")],
      [running, plank],
      registry,
    );
    const rows = groups[0].entities;
    expect(rows[0].entity.canonicalName).toBe("러닝");
    expect(rows[0].count).toBe(2);
    expect(rows[0].totalMetric).toBe(35);
    expect(rows[1].entity.canonicalName).toBe("플랭크");
    expect(rows[1].count).toBe(1);
  });

  it("counts a record with no relation toward the total but no entity row", () => {
    const groups = aggregateTrackers(
      [workout("a", 20), workout("unrelated", 10)],
      [ref("a", "ent-run")],
      [running],
      registry,
    );
    expect(groups[0].recordCount).toBe(2);
    expect(groups[0].totalMetric).toBe(30);
    expect(groups[0].entities).toHaveLength(1);
    expect(groups[0].entities[0].totalMetric).toBe(20);
  });

  it("sorts groups by record count and marks non-metric schemas", () => {
    const note: MoriRecord = { ...workout("n", 0), id: "n", schemaId: "note", properties: {} };
    const groups = aggregateTrackers(
      [workout("a", 20), workout("b", 15), note],
      [],
      [],
      registry,
    );
    expect(groups.map((group) => group.schemaId)).toEqual(["workout", "note"]);
    expect(groups[1].hasMetric).toBe(false);
  });
});
