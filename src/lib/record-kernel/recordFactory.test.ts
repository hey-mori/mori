import { describe, expect, it } from "vitest";
import { applyRecordPatch, createRecord } from "./recordFactory";
import { KernelValidationError, createSchemaRegistry } from "./schemaRegistry";

const registry = createSchemaRegistry();
const fixedNow = () => new Date("2026-07-14T09:00:00.000Z");

describe("createRecord · three-time honesty", () => {
  it("defaults to timeBasis unknown when no activity time is given, without fabricating one", () => {
    const { record } = createRecord(
      { schemaId: "note", title: "메모", origin: "user", now: fixedNow },
      registry,
    );
    expect(record.timeBasis).toBe("unknown");
    expect(record.occurredStart).toBeUndefined();
    expect(record.capturedAt).toBe("2026-07-14T09:00:00.000Z");
  });

  it("defaults a user-given activity time to basis user-provided", () => {
    const { record } = createRecord(
      {
        schemaId: "workout",
        title: "운동",
        origin: "user",
        occurredStart: "2026-07-14",
        properties: { durationMinutes: 10 },
        now: fixedNow,
      },
      registry,
    );
    expect(record.timeBasis).toBe("user-provided");
  });

  it("rejects an occurredStart on timeBasis unknown (never fabricate)", () => {
    expect(() =>
      createRecord(
        {
          schemaId: "note",
          title: "메모",
          origin: "user",
          occurredStart: "2026-07-14",
          timeBasis: "unknown",
        },
        registry,
      ),
    ).toThrow(/never fabricate/);
  });

  it("rejects a claimed basis without an activity time", () => {
    expect(() =>
      createRecord(
        { schemaId: "note", title: "메모", origin: "user", timeBasis: "source-exact" },
        registry,
      ),
    ).toThrow(/requires an occurredStart/);
  });

  it("rejects an occurredEnd before occurredStart", () => {
    expect(() =>
      createRecord(
        {
          schemaId: "event",
          title: "회의",
          origin: "user",
          occurredStart: "2026-07-14T10:00:00Z",
          occurredEnd: "2026-07-14T09:00:00Z",
        },
        registry,
      ),
    ).toThrow(/must not precede/);
  });
});

describe("createRecord · status, origin, revision", () => {
  it("lands user input active and machine output as a candidate", () => {
    const user = createRecord({ schemaId: "note", title: "메모", origin: "user" }, registry);
    const derived = createRecord(
      { schemaId: "insight", title: "해석", origin: "derived" },
      registry,
    );
    expect(user.record.status).toBe("active");
    expect(derived.record.status).toBe("candidate");
  });

  it("emits a create revision attributed by origin", () => {
    const user = createRecord({ schemaId: "note", title: "메모", origin: "user" }, registry);
    const auto = createRecord(
      { schemaId: "activity", title: "정리됨", origin: "automation" },
      registry,
    );
    expect(user.revision.operation).toBe("create");
    expect(user.revision.actor).toBe("user");
    expect(auto.revision.actor).toBe("rule");
    expect(user.revision.recordId).toBe(user.record.id);
  });

  it("rejects an unknown schema and a schema violation", () => {
    expect(() =>
      createRecord({ schemaId: "no-such-schema", title: "x", origin: "user" }, registry),
    ).toThrow(KernelValidationError);
    expect(() =>
      createRecord(
        {
          schemaId: "agent-session",
          title: "세션",
          origin: "import",
          properties: {},
        },
        registry,
      ),
    ).toThrow(/required property "agentId"/);
  });
});

describe("applyRecordPatch", () => {
  it("applies a valid patch and emits an update revision with before/after", () => {
    const { record } = createRecord(
      { schemaId: "note", title: "메모", origin: "user", now: fixedNow },
      registry,
    );
    const updated = applyRecordPatch(record, { title: "고친 메모" }, "user", registry, fixedNow);
    expect(updated.record.title).toBe("고친 메모");
    expect(updated.revision.operation).toBe("update");
    expect(updated.revision.before).toEqual(record);
  });

  it("marks a status transition as status-change", () => {
    const { record } = createRecord(
      { schemaId: "insight", title: "해석", origin: "derived" },
      registry,
    );
    const updated = applyRecordPatch(record, { status: "active" }, "user", registry);
    expect(updated.revision.operation).toBe("status-change");
  });

  it("rejects a patch that breaks time honesty", () => {
    const { record } = createRecord(
      { schemaId: "note", title: "메모", origin: "user" },
      registry,
    );
    expect(() =>
      applyRecordPatch(record, { occurredEnd: "2026-07-15" }, "user", registry),
    ).toThrow(/occurredEnd requires an occurredStart/);
  });
});
