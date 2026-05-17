import { describe, expect, it } from "vitest";
import type { NextAction } from "../../domain/types";
import {
  countNextActionCompletion,
  isNextActionCompleted,
  splitNextActionsByCompletion,
  withNextActionCompletion,
} from "./nextActionCompletion";

function action(id: string, over: Partial<NextAction> = {}): NextAction {
  return {
    id,
    sessionId: "sess-1",
    title: `Action ${id}`,
    priority: "medium",
    relatedIssueIds: [],
    relatedEventIds: [],
    ...over,
  };
}

describe("isNextActionCompleted", () => {
  it("treats an action without a done field as pending", () => {
    expect(isNextActionCompleted(action("a"))).toBe(false);
  });

  it("treats done: false as pending and done: true as completed", () => {
    expect(isNextActionCompleted(action("a", { done: false }))).toBe(false);
    expect(isNextActionCompleted(action("a", { done: true }))).toBe(true);
  });
});

describe("withNextActionCompletion", () => {
  it("stamps done and completedAt when completing", () => {
    const result = withNextActionCompletion(action("a"), true, "2026-05-18T09:00:00Z");
    expect(result.done).toBe(true);
    expect(result.completedAt).toBe("2026-05-18T09:00:00Z");
  });

  it("clears completedAt when reopening", () => {
    const completed = action("a", { done: true, completedAt: "2026-05-18T09:00:00Z" });
    const reopened = withNextActionCompletion(completed, false, "2026-05-19T09:00:00Z");
    expect(reopened.done).toBe(false);
    expect(reopened.completedAt).toBeUndefined();
  });

  it("does not mutate the input action", () => {
    const original = action("a");
    withNextActionCompletion(original, true, "2026-05-18T09:00:00Z");
    expect(original.done).toBeUndefined();
  });
});

describe("splitNextActionsByCompletion / countNextActionCompletion", () => {
  const actions = [
    action("a"),
    action("b", { done: true, completedAt: "2026-05-18T09:00:00Z" }),
    action("c", { done: false }),
  ];

  it("splits pending and completed while preserving order", () => {
    const { pending, completed } = splitNextActionsByCompletion(actions);
    expect(pending.map((entry) => entry.id)).toEqual(["a", "c"]);
    expect(completed.map((entry) => entry.id)).toEqual(["b"]);
  });

  it("counts totals", () => {
    expect(countNextActionCompletion(actions)).toEqual({
      total: 3,
      pending: 2,
      completed: 1,
    });
  });
});
