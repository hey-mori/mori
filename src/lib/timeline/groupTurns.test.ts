import { describe, expect, it } from "vitest";
import type { EventActor, TimelineEvent } from "../../domain/types";
import type { Turn } from "./buildTurns";
import { groupTurns, type TurnGroupBurst, type TurnGroupOverflow } from "./groupTurns";

let seq = 0;

function event(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  seq += 1;
  return {
    id: `evt-${seq}`,
    sessionId: "s1",
    projectId: "p1",
    start: "2026-05-22T09:00:00Z",
    type: "aiConversation",
    title: "",
    summary: "",
    sourceRefs: [],
    linkedIssueIds: [],
    linkedDecisionIds: [],
    relationshipIds: [],
    trustLevel: "observed",
    confidence: 0.9,
    createdBy: "import",
    userModified: false,
    ...overrides,
  };
}

/** A turn whose dominant member is `actor`, started at `start`. */
function turn(
  id: string,
  actor: EventActor,
  start: string,
  overrides: Partial<Turn> = {},
): Turn {
  const member = event({ id: `${id}-m`, actor, start });
  const base: Turn = {
    id,
    index: 0,
    ask: null,
    assistant: null,
    toolCalls: [],
    fileEdits: [],
    decisions: [],
    issues: [],
  };
  if (actor === "user") base.ask = member;
  else if (actor === "tool") base.toolCalls = [member];
  else if (actor === "decision") base.decisions = [member];
  else base.assistant = member;
  return { ...base, ...overrides };
}

const at = (minute: number) =>
  `2026-05-22T09:${String(minute).padStart(2, "0")}:00Z`;

describe("groupTurns — bursts", () => {
  it("collapses a tight run of tool turns into one burst with a visible criterion", () => {
    const turns: Turn[] = [
      turn("u1", "user", at(0)),
      turn("t1", "tool", at(1)),
      turn("t2", "tool", at(1)),
      turn("t3", "tool", at(2)),
      turn("t4", "tool", at(3)),
      turn("a1", "assistant", at(4)),
    ];

    const groups = groupTurns(turns, { burstWindowMinutes: 3, minBurstTurns: 3 });

    expect(groups.map((group) => group.kind)).toEqual(["turn", "burst", "turn"]);
    const burst = groups[1] as TurnGroupBurst;
    expect(burst.kind).toBe("burst");
    expect(burst.count).toBe(4);
    expect(burst.activity).toBe("tool");
    expect(burst.criterion).toContain("도구 호출");
    expect(burst.criterion).toContain("4회");
    // The criterion is the visible grouping rule, never hidden.
    expect(burst.criterion).toMatch(/\d+분 내 도구 호출 \d+회/);
  });

  it("counts the burst's window from its real span", () => {
    const turns: Turn[] = [
      turn("t1", "tool", at(0)),
      turn("t2", "tool", at(1)),
      turn("t3", "tool", at(2)),
    ];
    const burst = groupTurns(turns, { burstWindowMinutes: 5 })[0] as TurnGroupBurst;
    expect(burst.spanMinutes).toBe(2);
    expect(burst.criterion).toBe("2분 내 도구 호출 3회");
  });

  it("does not merge two tool runs separated by a lull", () => {
    const turns: Turn[] = [
      turn("t1", "tool", at(0)),
      turn("t2", "tool", at(1)),
      turn("t3", "tool", at(2)),
      // 30-minute gap breaks the window.
      turn("t4", "tool", at(32)),
      turn("t5", "tool", at(33)),
      turn("t6", "tool", at(34)),
    ];

    const groups = groupTurns(turns, { burstWindowMinutes: 3, minBurstTurns: 3 });
    const bursts = groups.filter((group): group is TurnGroupBurst => group.kind === "burst");
    expect(bursts).toHaveLength(2);
    expect(bursts[0]?.count).toBe(3);
    expect(bursts[1]?.count).toBe(3);
  });

  it("leaves a short run of tool turns as individual turns, never a 2-card group", () => {
    const turns: Turn[] = [turn("t1", "tool", at(0)), turn("t2", "tool", at(1))];
    const groups = groupTurns(turns, { burstWindowMinutes: 3, minBurstTurns: 3 });
    expect(groups.map((group) => group.kind)).toEqual(["turn", "turn"]);
  });

  it("treats a turn with a real assistant reply as conversation, not a burst member", () => {
    const turns: Turn[] = [
      turn("t1", "tool", at(0)),
      turn("a1", "assistant", at(1)),
      turn("t2", "tool", at(2)),
    ];
    const groups = groupTurns(turns, { burstWindowMinutes: 3, minBurstTurns: 3 });
    // The assistant turn splits the tool run, so neither side reaches 3.
    expect(groups.map((group) => group.kind)).toEqual(["turn", "turn", "turn"]);
  });

  it("sums multiple tool calls per turn into the headline count", () => {
    const multi = turn("t1", "tool", at(0));
    multi.toolCalls = [
      event({ id: "c1", actor: "tool", start: at(0) }),
      event({ id: "c2", actor: "tool", start: at(0) }),
      event({ id: "c3", actor: "tool", start: at(0) }),
    ];
    const turns: Turn[] = [multi, turn("t2", "tool", at(1)), turn("t3", "tool", at(2))];
    const burst = groupTurns(turns, { burstWindowMinutes: 3 })[0] as TurnGroupBurst;
    // 3 calls in the first turn + 1 each in the next two.
    expect(burst.toolCallCount).toBe(5);
    expect(burst.criterion).toContain("5회");
  });
});

describe("groupTurns — overflow", () => {
  it("folds the tail past maxVisibleGroups into one overflow disclosure", () => {
    const turns: Turn[] = Array.from({ length: 8 }, (_, index) =>
      turn(`a${index}`, "assistant", at(index * 10)),
    );

    const groups = groupTurns(turns, { maxVisibleGroups: 5 });

    expect(groups).toHaveLength(5);
    expect(groups.slice(0, 4).every((group) => group.kind === "turn")).toBe(true);
    const overflow = groups[4] as TurnGroupOverflow;
    expect(overflow.kind).toBe("overflow");
    // 8 total, 4 kept ahead of the overflow slot, so 4 hidden.
    expect(overflow.count).toBe(4);
    expect(overflow.label).toBe("이 아래 4개 더 보기");
  });

  it("never overflows when the list fits the limit", () => {
    const turns: Turn[] = Array.from({ length: 4 }, (_, index) =>
      turn(`a${index}`, "assistant", at(index * 10)),
    );
    const groups = groupTurns(turns, { maxVisibleGroups: 5 });
    expect(groups).toHaveLength(4);
    expect(groups.every((group) => group.kind === "turn")).toBe(true);
  });

  it("shows everything when maxVisibleGroups is unset", () => {
    const turns: Turn[] = Array.from({ length: 30 }, (_, index) =>
      turn(`a${index}`, "assistant", at(index * 10)),
    );
    const groups = groupTurns(turns);
    expect(groups).toHaveLength(30);
    expect(groups.some((group) => group.kind === "overflow")).toBe(false);
  });

  it("keeps a burst distinct from an overflow — they are different kinds", () => {
    const turns: Turn[] = [
      turn("t1", "tool", at(0)),
      turn("t2", "tool", at(1)),
      turn("t3", "tool", at(2)),
      ...Array.from({ length: 6 }, (_, index) =>
        turn(`a${index}`, "assistant", at(20 + index * 10)),
      ),
    ];

    const groups = groupTurns(turns, { burstWindowMinutes: 3, maxVisibleGroups: 4 });
    const kinds = new Set(groups.map((group) => group.kind));
    expect(kinds.has("burst")).toBe(true);
    expect(kinds.has("overflow")).toBe(true);
    // A burst carries a criterion; an overflow carries a disclosure label. They
    // are never the same shape.
    const burst = groups.find((group): group is TurnGroupBurst => group.kind === "burst");
    const overflow = groups.find(
      (group): group is TurnGroupOverflow => group.kind === "overflow",
    );
    expect(burst).toBeDefined();
    expect(overflow).toBeDefined();
    expect("criterion" in burst!).toBe(true);
    expect("criterion" in overflow!).toBe(false);
    expect("label" in overflow!).toBe(true);
  });
});

describe("groupTurns — preserved turns", () => {
  it("passes ordinary conversation turns through untouched", () => {
    const turns: Turn[] = [
      turn("u1", "user", at(0)),
      turn("a1", "assistant", at(1)),
      turn("u2", "user", at(40)),
      turn("a2", "assistant", at(41)),
    ];
    const groups = groupTurns(turns);
    expect(groups).toHaveLength(4);
    expect(groups.every((group) => group.kind === "turn")).toBe(true);
    expect(groups.map((group) => group.id)).toEqual(["u1", "a1", "u2", "a2"]);
  });

  it("never folds a decision turn into a burst", () => {
    const decisionTurn = turn("d1", "tool", at(1));
    decisionTurn.decisions = [event({ id: "dec", type: "decision", start: at(1) })];
    const turns: Turn[] = [
      turn("t1", "tool", at(0)),
      decisionTurn,
      turn("t2", "tool", at(2)),
    ];
    const groups = groupTurns(turns, { burstWindowMinutes: 3, minBurstTurns: 3 });
    // The decision turn breaks the tool run, so no burst forms.
    expect(groups.some((group) => group.kind === "burst")).toBe(false);
    expect(groups.map((group) => group.id)).toEqual(["t1", "d1", "t2"]);
  });
});
