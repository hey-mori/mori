import { describe, expect, it } from "vitest";
import {
  buildNarrative,
  momentKindForEvent,
  momentTier,
  narrativeMomentTone,
} from "./narrative";
import {
  labDecision,
  labEvent,
  labIssue,
  labNextAction,
  labRelationship,
  labSession,
} from "./labFixture";

describe("momentKindForEvent", () => {
  it("maps event types to narrative kinds", () => {
    expect(momentKindForEvent("aiConversation")).toBe("conversation");
    expect(momentKindForEvent("decision")).toBe("decision");
    expect(momentKindForEvent("issue")).toBe("issue");
    expect(momentKindForEvent("fileCode")).toBe("code");
    expect(momentKindForEvent("artifact")).toBe("code");
    expect(momentKindForEvent("webResearch")).toBe("research");
    expect(momentKindForEvent("documentNote")).toBe("note");
    expect(momentKindForEvent("other")).toBe("other");
  });
});

describe("narrativeMomentTone", () => {
  it("keeps the brand color contract", () => {
    expect(narrativeMomentTone("decision")).toBe("blue");
    expect(narrativeMomentTone("issue")).toBe("red");
    expect(narrativeMomentTone("conversation")).toBe("purple");
  });
});

describe("buildNarrative", () => {
  it("orders moments by start time regardless of input order", () => {
    const view = labSession({
      events: [
        labEvent({ id: "evt-c", start: "2026-05-22T11:00:00Z" }),
        labEvent({ id: "evt-a", start: "2026-05-22T09:00:00Z" }),
        labEvent({ id: "evt-b", start: "2026-05-22T10:00:00Z" }),
      ],
    });
    const { moments } = buildNarrative(view);
    expect(moments.map((m) => m.eventId)).toEqual(["evt-a", "evt-b", "evt-c"]);
  });

  it("emits an HH:MM time label per moment", () => {
    const { moments } = buildNarrative(
      labSession({ events: [labEvent({ id: "evt-1" })] }),
    );
    expect(moments[0]?.timeLabel).toMatch(/^\d{2}:\d{2}$/);
  });

  it("surfaces the incoming relationship reason as the moment's connection", () => {
    const view = labSession({
      events: [
        labEvent({ id: "evt-1", start: "2026-05-22T09:00:00Z" }),
        labEvent({ id: "evt-2", start: "2026-05-22T09:30:00Z" }),
      ],
      relationships: [
        labRelationship({
          fromId: "evt-1",
          toId: "evt-2",
          toType: "event",
          reason: "테스트가 실패해서",
        }),
      ],
    });
    const { moments } = buildNarrative(view);
    const second = moments.find((m) => m.eventId === "evt-2");
    expect(second?.connection).toBe("테스트가 실패해서");
    const first = moments.find((m) => m.eventId === "evt-1");
    expect(first?.connection).toBeNull();
  });

  it("ignores relationship reasons that do not target an event", () => {
    const view = labSession({
      events: [labEvent({ id: "evt-2" })],
      relationships: [
        labRelationship({
          fromId: "evt-1",
          toId: "evt-2",
          toType: "decision",
          reason: "결정으로 이어짐",
        }),
      ],
    });
    const { moments } = buildNarrative(view);
    expect(moments[0]?.connection).toBeNull();
  });

  it("resolves linked decisions and source-event decisions onto a moment", () => {
    const view = labSession({
      events: [labEvent({ id: "evt-1", linkedDecisionIds: ["dec-1"] })],
      decisions: [
        labDecision({ id: "dec-1", title: "직접 링크된 결정" }),
        labDecision({ id: "dec-2", title: "소스 이벤트 결정", sourceEventIds: ["evt-1"] }),
      ],
    });
    const { moments } = buildNarrative(view);
    const ids = moments[0]?.decisions.map((d) => d.id);
    expect(ids).toEqual(["dec-1", "dec-2"]);
  });

  it("does not duplicate a decision linked both ways", () => {
    const view = labSession({
      events: [labEvent({ id: "evt-1", linkedDecisionIds: ["dec-1"] })],
      decisions: [labDecision({ id: "dec-1", sourceEventIds: ["evt-1"] })],
    });
    const { moments } = buildNarrative(view);
    expect(moments[0]?.decisions).toHaveLength(1);
  });

  it("resolves issues onto a moment", () => {
    const view = labSession({
      events: [labEvent({ id: "evt-1", linkedIssueIds: ["iss-1"] })],
      issues: [labIssue({ id: "iss-1" })],
    });
    const { moments } = buildNarrative(view);
    expect(moments[0]?.issues.map((i) => i.id)).toEqual(["iss-1"]);
  });
});

describe("momentTier", () => {
  const tierOf = (view: ReturnType<typeof labSession>, eventId: string) => {
    const moment = buildNarrative(view).moments.find((m) => m.eventId === eventId);
    if (!moment) throw new Error(`moment not found: ${eventId}`);
    return momentTier(moment);
  };

  it("is pivotal when the moment carries a decision, even at low importance", () => {
    const view = labSession({
      events: [labEvent({ id: "evt-1" })],
      decisions: [labDecision({ id: "dec-1", sourceEventIds: ["evt-1"] })],
    });
    const moment = buildNarrative(view).moments.find((m) => m.eventId === "evt-1");
    expect(moment?.importance).toBe("low");
    expect(moment?.decisions).toHaveLength(1);
    expect(tierOf(view, "evt-1")).toBe("pivotal");
  });

  it("is pivotal when the moment carries an issue", () => {
    const view = labSession({
      events: [labEvent({ id: "evt-1" })],
      issues: [labIssue({ id: "iss-1", sourceEventIds: ["evt-1"] })],
    });
    expect(tierOf(view, "evt-1")).toBe("pivotal");
  });

  it("is pivotal for a high-importance plain moment", () => {
    const view = labSession({
      events: [labEvent({ id: "evt-1", type: "decision" })],
    });
    const moment = buildNarrative(view).moments.find((m) => m.eventId === "evt-1");
    expect(moment?.importance).toBe("high");
    expect(moment?.decisions).toHaveLength(0);
    expect(tierOf(view, "evt-1")).toBe("pivotal");
  });

  it("is notable for a medium-importance plain moment", () => {
    const view = labSession({
      events: [labEvent({ id: "evt-1", trustLevel: "inferred" })],
    });
    const moment = buildNarrative(view).moments.find((m) => m.eventId === "evt-1");
    expect(moment?.importance).toBe("medium");
    expect(moment?.decisions).toHaveLength(0);
    expect(moment?.issues).toHaveLength(0);
    expect(tierOf(view, "evt-1")).toBe("notable");
  });

  it("is notable when the moment only carries a causal connection", () => {
    const view = labSession({
      events: [
        labEvent({ id: "evt-1", start: "2026-05-22T09:00:00Z" }),
        labEvent({ id: "evt-2", start: "2026-05-22T09:30:00Z" }),
      ],
      relationships: [
        labRelationship({
          fromId: "evt-1",
          toId: "evt-2",
          toType: "event",
          reason: "테스트가 실패해서",
        }),
      ],
    });
    const moment = buildNarrative(view).moments.find((m) => m.eventId === "evt-2");
    expect(moment?.importance).toBe("low");
    expect(moment?.connection).toBe("테스트가 실패해서");
    expect(tierOf(view, "evt-2")).toBe("notable");
  });

  it("is routine for a low-importance moment with no decision, issue or connection", () => {
    const view = labSession({
      events: [labEvent({ id: "evt-1" })],
    });
    const moment = buildNarrative(view).moments.find((m) => m.eventId === "evt-1");
    expect(moment?.importance).toBe("low");
    expect(moment?.decisions).toHaveLength(0);
    expect(moment?.issues).toHaveLength(0);
    expect(moment?.connection).toBeNull();
    expect(tierOf(view, "evt-1")).toBe("routine");
  });
});

describe("buildNarrative continuation", () => {
  it("collects open issues, pending next actions and the resume prompt", () => {
    const view = labSession({
      issues: [
        labIssue({ id: "iss-open", status: "open" }),
        labIssue({ id: "iss-done", status: "resolved" }),
      ],
      nextActions: [
        labNextAction({ id: "na-pending", done: false }),
        labNextAction({ id: "na-done", done: true }),
      ],
      summary: {
        id: "sum",
        sessionId: "s1",
        sessionSummary: "",
        resumePrompt: "  여기서 이어서  ",
        reportMarkdown: "",
        nextActionIds: [],
        generatedAt: "",
      },
    });
    const { continuation } = buildNarrative(view);
    expect(continuation.openIssues.map((i) => i.id)).toEqual(["iss-open"]);
    expect(continuation.nextActions.map((a) => a.id)).toEqual(["na-pending"]);
    expect(continuation.resumePrompt).toBe("여기서 이어서");
  });

  it("returns a null resume prompt when blank", () => {
    const { continuation } = buildNarrative(labSession());
    expect(continuation.resumePrompt).toBeNull();
  });
});
