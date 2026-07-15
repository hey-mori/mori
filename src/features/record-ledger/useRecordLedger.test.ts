/**
 * Commit-path semantics of the two-phase capture API. The orchestration IO
 * (repository writes) is exercised end to end in the app; these tests pin the
 * pure decision: what patch a staged review edit becomes.
 */
import { describe, expect, it } from "vitest";
import { runCapturePipeline } from "../../lib/capture";
import { applyRecordPatch } from "../../lib/record-kernel/recordFactory";
import { createSchemaRegistry } from "../../lib/record-kernel/schemaRegistry";
import { buildCommitPatch } from "./useRecordLedger";

const registry = createSchemaRegistry();
const now = () => new Date("2026-07-15T09:00:00Z");

function itemFor(content: string, index = 0) {
  const outcome = runCapturePipeline({ kind: "text", content }, registry, { now });
  return outcome.records[index];
}

describe("buildCommitPatch", () => {
  it("returns null when nothing was edited on a non-confirm candidate", () => {
    const item = itemFor("오늘 러닝 1시간"); // workout → auto/provisional
    expect(buildCommitPatch(item, undefined, registry)).toBeNull();
  });

  it("turns a date edit into a user-provided activity date", () => {
    const item = itemFor("어제 러닝 1시간");
    const patch = buildCommitPatch(item, { occurredStart: "2026-07-10" }, registry);
    expect(patch).toMatchObject({
      occurredStart: "2026-07-10",
      timeBasis: "user-provided",
    });
  });

  it("clears a date to unknown without fabricating anything", () => {
    const item = itemFor("어제 러닝 1시간");
    const patch = buildCommitPatch(item, { occurredStart: null }, registry);
    expect(patch).toMatchObject({ timeBasis: "unknown" });
    expect(patch).toHaveProperty("occurredStart", undefined);
  });

  it("retypes a record and filters properties to the new schema", () => {
    const item = itemFor("어제 러닝 1시간"); // workout: durationMinutes + exercises
    const patch = buildCommitPatch(item, { schemaId: "activity" }, registry);
    expect(patch?.schemaId).toBe("activity");
    // activity defines durationMinutes but not exercises.
    expect(patch?.properties).toHaveProperty("durationMinutes", 60);
    expect(patch?.properties).not.toHaveProperty("exercises");
    // The resulting patch applies cleanly under the new schema.
    const updated = applyRecordPatch(item.created.record, patch!, "user", registry, now);
    expect(updated.record.schemaId).toBe("activity");
    expect(updated.revision.actor).toBe("user");
  });

  it("activates a kept confirm-candidate: the review was the confirmation", () => {
    // Force a confirm decision via the manual automation level.
    const outcome = runCapturePipeline({ kind: "text", content: "오늘 러닝 1시간" }, registry, {
      now,
      automationForSchema: () => "manual",
    });
    const item = outcome.records[0];
    expect(item.decision).toBe("confirm");
    const patch = buildCommitPatch(item, undefined, registry);
    expect(patch).toMatchObject({ status: "active" });
  });

  it("stages the user edit as a distinct revision on top of the AI create", () => {
    const item = itemFor("어제 러닝 1시간");
    const patch = buildCommitPatch(item, { title: "저녁 러닝" }, registry);
    const updated = applyRecordPatch(item.created.record, patch!, "user", registry, now);
    // Two acts, two actors: the machine interpretation, then the human fix.
    expect(item.created.revision.actor).toBe("ai");
    expect(updated.revision.actor).toBe("user");
    const before = updated.revision.before as { title: string };
    expect(before.title).toBe(item.created.record.title);
    expect(updated.record.title).toBe("저녁 러닝");
  });
});
