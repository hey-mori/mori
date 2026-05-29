import { describe, expect, it } from "vitest";
import { buildPhases } from "./phases";
import { labDecision, labEvent, labIssue, labSession } from "./labFixture";

describe("buildPhases", () => {
  it("groups moments into the canonical work arc, skipping empty phases", () => {
    const view = labSession({
      events: [
        labEvent({ id: "e-conv", type: "aiConversation", start: "2026-05-22T09:00:00Z" }),
        labEvent({ id: "e-dec", type: "decision", start: "2026-05-22T09:10:00Z" }),
        labEvent({ id: "e-code", type: "fileCode", start: "2026-05-22T09:20:00Z" }),
        labEvent({ id: "e-issue", type: "issue", start: "2026-05-22T09:30:00Z" }),
        labEvent({ id: "e-note", type: "documentNote", start: "2026-05-22T09:40:00Z" }),
      ],
    });
    const phases = buildPhases(view);
    expect(phases.map((p) => p.id)).toEqual([
      "explore",
      "decide",
      "build",
      "verify",
      "wrapup",
    ]);
    expect(phases.every((p) => p.count === 1)).toBe(true);
  });

  it("omits phases that have no moments", () => {
    const view = labSession({
      events: [
        labEvent({ id: "e-conv", type: "aiConversation" }),
        labEvent({ id: "e-code", type: "fileCode", start: "2026-05-22T09:20:00Z" }),
      ],
    });
    const phases = buildPhases(view);
    expect(phases.map((p) => p.id)).toEqual(["explore", "build"]);
  });

  it("routes research and other events into the explore phase", () => {
    const view = labSession({
      events: [
        labEvent({ id: "e-research", type: "webResearch" }),
        labEvent({ id: "e-other", type: "other", start: "2026-05-22T09:05:00Z" }),
      ],
    });
    const phases = buildPhases(view);
    expect(phases).toHaveLength(1);
    expect(phases[0]?.id).toBe("explore");
    expect(phases[0]?.count).toBe(2);
  });

  it("counts decisions and issues elevated onto a phase's moments", () => {
    const view = labSession({
      events: [labEvent({ id: "e-code", type: "fileCode", linkedDecisionIds: ["dec-1"], linkedIssueIds: ["iss-1"] })],
      decisions: [labDecision({ id: "dec-1" })],
      issues: [labIssue({ id: "iss-1" })],
    });
    const phases = buildPhases(view);
    const build = phases.find((p) => p.id === "build");
    expect(build?.decisionCount).toBe(1);
    expect(build?.issueCount).toBe(1);
  });

  it("derives start and end labels across a multi-moment phase", () => {
    const view = labSession({
      events: [
        labEvent({ id: "e1", type: "fileCode", start: "2026-05-22T09:00:00Z" }),
        labEvent({ id: "e2", type: "fileCode", start: "2026-05-22T09:30:00Z" }),
      ],
    });
    const build = buildPhases(view).find((p) => p.id === "build");
    expect(build?.startLabel).toMatch(/^\d{2}:\d{2}$/);
    expect(build?.endLabel).toMatch(/^\d{2}:\d{2}$/);
    expect(build?.startLabel).not.toBe(build?.endLabel);
  });

  it("leaves endLabel null for a single-moment phase", () => {
    const view = labSession({
      events: [labEvent({ id: "e1", type: "fileCode" })],
    });
    const build = buildPhases(view).find((p) => p.id === "build");
    expect(build?.endLabel).toBeNull();
  });

  it("returns no phases for an empty session", () => {
    expect(buildPhases(labSession())).toEqual([]);
  });
});
