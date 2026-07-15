import { describe, expect, it } from "vitest";
import { createSchemaRegistry } from "../record-kernel/schemaRegistry";
import type { KernelRule } from "../record-kernel/kernelTypes";
import { runCapturePipeline } from "./capturePipeline";
import type { CaptureInput } from "./captureTypes";

const registry = createSchemaRegistry();
const now = () => new Date("2026-07-14T09:00:00.000Z");
const text = (content: string, occurredHint?: string): CaptureInput => ({
  kind: "text",
  content,
  occurredHint,
});

describe("runCapturePipeline", () => {
  it("always preserves the raw source with retention, whatever the decision", () => {
    const outcome = runCapturePipeline(text("그냥 메모"), registry, { now });
    expect(outcome.source.rawBody).toBe("그냥 메모");
    expect(outcome.source.retention).toBe("retained");
    expect(outcome.source.kind).toBe("text");
  });

  it("auto-applies a confident workout and links the record to the source", () => {
    const outcome = runCapturePipeline(
      text("러닝 10분", "2026-07-14"),
      registry,
      { now, knownEntityNames: new Set(["러닝"]) },
    );
    expect(outcome.records).toHaveLength(1);
    const [record] = outcome.records;
    expect(record.decision).toBe("auto");
    expect(record.created.record.status).toBe("active");
    expect(record.created.record.schemaId).toBe("workout");
    expect(record.sourceLink.sourceId).toBe(outcome.source.id);
    expect(record.sourceLink.recordId).toBe(record.created.record.id);
    expect(record.created.revision.operation).toBe("create");
  });

  it("holds a workout that introduces a new exercise as provisional", () => {
    const outcome = runCapturePipeline(text("플랭크 3세트"), registry, { now });
    expect(outcome.records[0].decision).toBe("provisional");
    expect(outcome.records[0].created.record.status).toBe("provisional");
  });

  it("keeps a plain note as user-authored and active", () => {
    const outcome = runCapturePipeline(text("떠오른 생각"), registry, { now });
    const [note] = outcome.records;
    expect(note.created.record.schemaId).toBe("note");
    expect(note.created.record.origin).toBe("user");
    expect(note.decision).toBe("auto");
    expect(note.created.record.status).toBe("active");
  });

  it("confirms and flags sensitive content while still preserving the source", () => {
    const outcome = runCapturePipeline(
      text("배포 토큰 ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"),
      registry,
      { now },
    );
    expect(outcome.sensitive).toBe(true);
    expect(outcome.records[0].decision).toBe("confirm");
    expect(outcome.records[0].created.record.status).toBe("candidate");
    expect(outcome.source.rawBody).toContain("ghp_");
  });

  it("respects a manual automation level for a schema", () => {
    const outcome = runCapturePipeline(text("러닝 10분", "2026-07-14"), registry, {
      now,
      knownEntityNames: new Set(["러닝"]),
      automationForSchema: (schemaId) => (schemaId === "workout" ? "manual" : "auto"),
    });
    expect(outcome.records[0].decision).toBe("confirm");
  });

  it("applies an automation-level rule so a schema always confirms", () => {
    const rules: KernelRule[] = [
      {
        id: "auto-1",
        kind: "automation-level",
        condition: { schemaId: "workout" },
        effect: { level: "manual" },
        learnedFromRevisionIds: [],
        enabled: true,
        createdAt: "2026-07-14",
      },
    ];
    const outcome = runCapturePipeline(text("러닝 10분", "2026-07-14"), registry, {
      now,
      knownEntityNames: new Set(["러닝"]),
      rules,
    });
    expect(outcome.records[0].decision).toBe("confirm");
  });

  it("reclassifies via a classification rule and attaches a bound context", () => {
    const rules: KernelRule[] = [
      {
        id: "class-1",
        kind: "classification",
        condition: { keywords: ["회고"] },
        effect: { schemaId: "reflection" },
        learnedFromRevisionIds: [],
        enabled: true,
        createdAt: "2026-07-14",
      },
      {
        id: "bind-1",
        kind: "context-binding",
        condition: { keywords: ["회고"] },
        effect: { contextId: "ctx-journal" },
        learnedFromRevisionIds: [],
        enabled: true,
        createdAt: "2026-07-14",
      },
    ];
    const outcome = runCapturePipeline(text("오늘 하루 회고"), registry, { now, rules });
    expect(outcome.records[0].created.record.schemaId).toBe("reflection");
    expect(outcome.records[0].created.record.contextIds).toEqual(["ctx-journal"]);
  });

  it("resolves workout mentions to new entities and links the record to them", () => {
    const outcome = runCapturePipeline(text("러닝 10분, 플랭크 3세트"), registry, { now });
    expect(outcome.newEntities.map((entity) => entity.canonicalName)).toEqual(
      expect.arrayContaining(["러닝", "플랭크"]),
    );
    const relations = outcome.records[0].relations;
    expect(relations.length).toBe(outcome.newEntities.length);
    expect(relations.every((relation) => relation.type === "references")).toBe(true);
    expect(relations[0].fromRecordId).toBe(outcome.records[0].created.record.id);
  });

  it("applies a late-night date rule to place an undecided small-hours capture", () => {
    // Local-time constructor so the capture's local hour is deterministic
    // regardless of the test machine's timezone (the rule reads local hours).
    const smallHours = () => new Date(2026, 6, 15, 1, 30, 0);
    const rules: KernelRule[] = [
      {
        id: "rule-late",
        kind: "date-inference",
        condition: { capturedBeforeHour: 5 },
        effect: { offsetDays: -1 },
        learnedFromRevisionIds: [],
        enabled: true,
        createdAt: "2026-07-10T00:00:00.000Z",
      },
    ];
    const outcome = runCapturePipeline(text("그냥 메모"), registry, { now: smallHours, rules });
    const record = outcome.records[0].created.record;
    expect(record.occurredStart).toBe("2026-07-14");
    expect(record.timeBasis).toBe("ai-inferred");
  });

  it("does not apply the late-night rule when the capture already has a date", () => {
    const smallHours = () => new Date(2026, 6, 15, 1, 30, 0);
    const rules: KernelRule[] = [
      {
        id: "rule-late",
        kind: "date-inference",
        condition: { capturedBeforeHour: 5 },
        effect: { offsetDays: -1 },
        learnedFromRevisionIds: [],
        enabled: true,
        createdAt: "2026-07-10T00:00:00.000Z",
      },
    ];
    // "오늘" already infers a date, so the rule must not override it.
    const outcome = runCapturePipeline(text("오늘 그냥 메모"), registry, { now: smallHours, rules });
    const record = outcome.records[0].created.record;
    expect(record.occurredStart).toBe("2026-07-15");
  });

  it("reuses a known entity instead of creating a duplicate", () => {
    const known = [
      { id: "ent-run", type: "exercise", canonicalName: "러닝", createdAt: "2026-07-01" },
    ];
    const outcome = runCapturePipeline(text("러닝 10분"), registry, { now, entities: known });
    expect(outcome.newEntities).toHaveLength(0);
    expect(outcome.records[0].relations[0].toEntityId).toBe("ent-run");
  });

  it("accepts a swapped proposer without changing orchestration", () => {
    const outcome = runCapturePipeline(text("무엇이든"), registry, {
      now,
      propose: () => [
        {
          schemaId: "note",
          title: "대체 제안",
          body: "대체 본문",
          properties: {},
          timeBasis: "unknown",
          confidence: 1,
          rationale: "테스트",
          entityMentions: [],
        },
      ],
    });
    expect(outcome.records[0].created.record.title).toBe("대체 제안");
  });
});
