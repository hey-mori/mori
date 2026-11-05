import { describe, expect, it } from "vitest";
import type { Issue, NextAction } from "../../domain/types";
import { comparable, nextActionsWorthShowing, restatesItsIssue, summaryBesideTitle } from "./reviewRepeats";

const QUESTION = "Open question: should the thumbnail size depend on screen density?";

function issue(id: string, title: string): Issue {
  return { id, title } as Issue;
}

function action(overrides: Partial<NextAction> & Pick<NextAction, "id" | "title">): NextAction {
  return {
    sessionId: "s",
    priority: "medium",
    relatedIssueIds: ["i1"],
    relatedEventIds: [],
    ...overrides,
  };
}

describe("summaryBesideTitle", () => {
  it("drops a summary that is the title again", () => {
    expect(summaryBesideTitle(QUESTION, QUESTION)).toBeUndefined();
  });

  it("drops it across spacing, case and a trailing full stop", () => {
    expect(summaryBesideTitle("Decision: ship at 320px", "decision:  ship at 320px.")).toBeUndefined();
  });

  it("drops the full sentence a shortened title was cut from", () => {
    const sentence = "Decision: thumbnails at 320px with lazy loading, and one cart total per render";
    expect(summaryBesideTitle("Decision: thumbnails at 320px with lazy…", sentence)).toBeUndefined();
  });

  it("keeps a summary that says something else", () => {
    expect(summaryBesideTitle("Checkout is slow", "Images load at full size on mobile.")).toBe(
      "Images load at full size on mobile.",
    );
  });

  it("has nothing to show for an empty summary", () => {
    expect(summaryBesideTitle("Title", "  ")).toBeUndefined();
  });
});

describe("restatesItsIssue", () => {
  const issues = new Map([["i1", issue("i1", QUESTION)]]);

  it("is true for the rule engine's derived action, prefix and all", () => {
    expect(restatesItsIssue(action({ id: "nact-1", title: `확인 또는 해결: ${QUESTION}` }), issues)).toBe(true);
  });

  it("is false once the action says what to do", () => {
    expect(restatesItsIssue(action({ id: "nact-1", title: "Measure thumbnails on a 2x display" }), issues)).toBe(false);
  });

  it("is false for anything the user promoted, edited or finished", () => {
    expect(restatesItsIssue(action({ id: "nact-user-i1", title: QUESTION }), issues)).toBe(false);
    expect(restatesItsIssue(action({ id: "nact-1", title: QUESTION, editedByUser: true }), issues)).toBe(false);
    expect(restatesItsIssue(action({ id: "nact-1", title: QUESTION, done: true }), issues)).toBe(false);
  });

  it("is false for an action tied to several issues or to none", () => {
    expect(restatesItsIssue(action({ id: "a", title: QUESTION, relatedIssueIds: [] }), issues)).toBe(false);
    expect(restatesItsIssue(action({ id: "a", title: QUESTION, relatedIssueIds: ["i1", "i2"] }), issues)).toBe(false);
  });
});

describe("nextActionsWorthShowing", () => {
  const issues = [issue("i1", QUESTION)];
  const repeat = action({ id: "nact-1", title: `확인 또는 해결: ${QUESTION}` });
  const real = action({ id: "nact-2", title: "Ask design for the density breakpoints", relatedIssueIds: [] });

  it("leaves out the repeat and keeps the rest in order", () => {
    expect(nextActionsWorthShowing([repeat, real], issues).map((a) => a.id)).toEqual(["nact-2"]);
  });

  it("keeps a selected repeat so the selection does not vanish", () => {
    expect(nextActionsWorthShowing([repeat, real], issues, "nact-1").map((a) => a.id)).toEqual(["nact-1", "nact-2"]);
  });
});

describe("comparable", () => {
  it("ignores markup and an ellipsis", () => {
    expect(comparable("**Ship** `it`...")).toBe("ship it");
  });
});
