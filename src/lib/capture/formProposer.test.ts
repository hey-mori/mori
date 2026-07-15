import { describe, expect, it } from "vitest";
import { createSchemaRegistry } from "../record-kernel/schemaRegistry";
import { runCapturePipeline } from "./capturePipeline";
import { proposeFromForm } from "./formProposer";

const registry = createSchemaRegistry();
const workout = registry.get("workout")!;

describe("proposeFromForm", () => {
  it("builds a user-origin proposal from schema field values", () => {
    const proposal = proposeFromForm({
      schema: workout,
      values: { durationMinutes: 45 },
      text: "퇴근하고 러닝",
      occurredStart: "2026-07-14",
    });
    expect(proposal.schemaId).toBe("workout");
    expect(proposal.origin).toBe("user");
    expect(proposal.confidence).toBe(1);
    expect(proposal.properties.durationMinutes).toBe(45);
    expect(proposal.occurredStart).toBe("2026-07-14");
    expect(proposal.timeBasis).toBe("user-provided");
    expect(proposal.title).toBe("퇴근하고 러닝");
  });

  it("drops empty values and derives a body from filled fields", () => {
    const proposal = proposeFromForm({
      schema: workout,
      values: { durationMinutes: 30, exercises: undefined },
    });
    expect(proposal.properties).toEqual({ durationMinutes: 30 });
    expect(proposal.body).toContain("운동 시간 30분");
    expect(proposal.title).toBe(workout.name);
    expect(proposal.timeBasis).toBe("unknown");
  });

  it("keeps user origin through the pipeline (a form record is not derived)", () => {
    const proposal = proposeFromForm({
      schema: workout,
      values: { durationMinutes: 45 },
      text: "러닝",
    });
    const outcome = runCapturePipeline(
      { kind: "text", content: proposal.body },
      registry,
      { propose: () => [proposal], now: () => new Date("2026-07-15T09:00:00Z") },
    );
    expect(outcome.records[0].created.record.origin).toBe("user");
    expect(outcome.records[0].created.revision.actor).toBe("user");
  });
});
