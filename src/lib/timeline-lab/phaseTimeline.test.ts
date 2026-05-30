import { describe, expect, it } from "vitest";
import { buildPhaseTimeline } from "./phaseTimeline";
import { labDecision, labEvent, labIssue, labSession } from "./labFixture";

describe("buildPhaseTimeline", () => {
  it("gives the canonical single-moment-per-phase arc one chapter per phase", () => {
    const view = labSession({
      events: [
        labEvent({ id: "e1", type: "aiConversation", start: "2026-05-22T09:00:00Z" }),
        labEvent({ id: "e2", type: "decision", start: "2026-05-22T09:05:00Z" }),
        labEvent({ id: "e3", type: "fileCode", start: "2026-05-22T09:10:00Z" }),
        labEvent({ id: "e4", type: "issue", start: "2026-05-22T09:15:00Z" }),
        labEvent({ id: "e5", type: "documentNote", start: "2026-05-22T09:20:00Z" }),
      ],
    });
    const { chapters, mode } = buildPhaseTimeline(view);
    expect(mode).toBe("temporal");
    expect(chapters).toHaveLength(5);
    expect(chapters.map((c) => c.phaseId)).toEqual([
      "explore",
      "decide",
      "build",
      "verify",
      "wrapup",
    ]);
    expect(chapters.every((c) => c.moments.length === 1)).toBe(true);
  });

  it("re-founds 국면 as temporal chapters, letting a phase recur", () => {
    const view = labSession({
      events: [
        // explore run
        labEvent({ id: "e1", type: "aiConversation", start: "2026-05-22T09:00:00Z" }),
        labEvent({ id: "e2", type: "webResearch", start: "2026-05-22T09:05:00Z" }),
        // build run
        labEvent({ id: "e3", type: "fileCode", start: "2026-05-22T09:10:00Z" }),
        labEvent({ id: "e4", type: "fileCode", start: "2026-05-22T09:15:00Z" }),
        // explore again
        labEvent({ id: "e5", type: "aiConversation", start: "2026-05-22T09:20:00Z" }),
        labEvent({ id: "e6", type: "webResearch", start: "2026-05-22T09:25:00Z" }),
        // verify run
        labEvent({ id: "e7", type: "issue", start: "2026-05-22T09:30:00Z" }),
        labEvent({ id: "e8", type: "issue", start: "2026-05-22T09:35:00Z" }),
      ],
    });
    const { chapters, mode } = buildPhaseTimeline(view);
    expect(mode).toBe("temporal");
    expect(chapters.map((c) => c.phaseId)).toEqual(["explore", "build", "explore", "verify"]);
    expect(chapters.map((c) => c.id)).toEqual([
      "explore-0",
      "build-0",
      "explore-1",
      "verify-0",
    ]);
  });

  it("gives a lone phase between two like phases its own chapter, no absorption", () => {
    const view = labSession({
      events: [
        labEvent({ id: "e1", type: "aiConversation", start: "2026-05-22T09:00:00Z" }),
        labEvent({ id: "e2", type: "aiConversation", start: "2026-05-22T09:05:00Z" }),
        // a single build moment between two explore runs is its own chapter
        labEvent({ id: "e3", type: "fileCode", start: "2026-05-22T09:10:00Z" }),
        labEvent({ id: "e4", type: "aiConversation", start: "2026-05-22T09:15:00Z" }),
        labEvent({ id: "e5", type: "aiConversation", start: "2026-05-22T09:20:00Z" }),
      ],
    });
    const { chapters } = buildPhaseTimeline(view);
    expect(chapters).toHaveLength(3);
    expect(chapters.map((c) => c.phaseId)).toEqual(["explore", "build", "explore"]);
    expect(chapters.map((c) => c.moments.length)).toEqual([2, 1, 2]);
    expect(chapters.map((c) => c.id)).toEqual(["explore-0", "build-0", "explore-1"]);
  });

  it("computes spans from the first and last moment timestamps per chapter", () => {
    const view = labSession({
      events: [
        labEvent({ id: "e1", type: "fileCode", start: "2026-05-22T09:00:00Z" }),
        labEvent({ id: "e2", type: "fileCode", start: "2026-05-22T09:30:00Z" }),
        labEvent({ id: "e3", type: "issue", start: "2026-05-22T10:00:00Z" }),
        labEvent({ id: "e4", type: "issue", start: "2026-05-22T10:00:00Z" }),
      ],
    });
    const { chapters } = buildPhaseTimeline(view);
    const build = chapters.find((c) => c.phaseId === "build");
    const verify = chapters.find((c) => c.phaseId === "verify");
    expect(build?.startIso).toBe("2026-05-22T09:00:00Z");
    expect(build?.endIso).toBe("2026-05-22T09:30:00Z");
    expect(build?.spanLabel).toMatch(/^\d{2}:\d{2} – \d{2}:\d{2}$/);
    // identical first/last timestamps collapse to a single HH:MM
    expect(verify?.spanLabel).toMatch(/^\d{2}:\d{2}$/);
  });

  it("sums decisions and issues elevated onto a chapter's moments", () => {
    const view = labSession({
      events: [
        labEvent({
          id: "e1",
          type: "fileCode",
          start: "2026-05-22T09:00:00Z",
          linkedDecisionIds: ["dec-1"],
        }),
        labEvent({
          id: "e2",
          type: "fileCode",
          start: "2026-05-22T09:05:00Z",
          linkedIssueIds: ["iss-1"],
        }),
      ],
      decisions: [labDecision({ id: "dec-1" })],
      issues: [labIssue({ id: "iss-1" })],
    });
    const { chapters } = buildPhaseTimeline(view);
    expect(chapters).toHaveLength(1);
    expect(chapters[0]?.decisionCount).toBe(1);
    expect(chapters[0]?.issueCount).toBe(1);
  });

  it("falls back to grouped mode when fewer than two timestamps are parseable", () => {
    const view = labSession({
      events: [
        labEvent({ id: "e1", type: "aiConversation", start: "not-a-date" }),
        labEvent({ id: "e2", type: "fileCode", start: "also-bad" }),
        labEvent({ id: "e3", type: "issue", start: "2026-05-22T09:30:00Z" }),
      ],
    });
    const { chapters, mode } = buildPhaseTimeline(view);
    expect(mode).toBe("grouped");
    // one chapter per non-empty phase, in PHASE_ORDER, all ordinal 0
    expect(chapters.map((c) => c.phaseId)).toEqual(["explore", "build", "verify"]);
    expect(chapters.every((c) => c.id.endsWith("-0"))).toBe(true);
  });

  it("is deterministic across repeated builds", () => {
    const view = labSession({
      events: [
        labEvent({ id: "e1", type: "aiConversation", start: "2026-05-22T09:00:00Z" }),
        labEvent({ id: "e2", type: "fileCode", start: "2026-05-22T09:10:00Z" }),
        labEvent({ id: "e3", type: "fileCode", start: "2026-05-22T09:20:00Z" }),
        labEvent({ id: "e4", type: "issue", start: "2026-05-22T09:30:00Z" }),
        labEvent({ id: "e5", type: "issue", start: "2026-05-22T09:40:00Z" }),
      ],
    });
    expect(buildPhaseTimeline(view)).toEqual(buildPhaseTimeline(view));
  });

  it("returns empty chapters for an empty session", () => {
    const { chapters, mode } = buildPhaseTimeline(labSession());
    expect(chapters).toEqual([]);
    expect(mode).toBe("grouped");
  });
});
