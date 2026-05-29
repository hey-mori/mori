import { describe, expect, it } from "vitest";
import { EMPTY_LAB_FILTER, filterSession, isLabFilterActive } from "./labFilter";
import {
  labDecision,
  labEvent,
  labIssue,
  labNextAction,
  labRelationship,
  labSession,
} from "./labFixture";

describe("isLabFilterActive", () => {
  it("is inactive for the empty filter", () => {
    expect(isLabFilterActive(EMPTY_LAB_FILTER)).toBe(false);
    expect(isLabFilterActive({ query: "   ", kinds: [] })).toBe(false);
  });

  it("is active with a query or any kind", () => {
    expect(isLabFilterActive({ query: "auth", kinds: [] })).toBe(true);
    expect(isLabFilterActive({ query: "", kinds: ["decision"] })).toBe(true);
  });
});

describe("filterSession passthrough", () => {
  it("returns the same reference when the filter is inactive", () => {
    const view = labSession({ events: [labEvent({ id: "e1" })] });
    expect(filterSession(view, EMPTY_LAB_FILTER)).toBe(view);
  });
});

describe("filterSession by kind", () => {
  it("keeps only events whose moment kind is selected", () => {
    const view = labSession({
      events: [
        labEvent({ id: "talk", type: "aiConversation" }),
        labEvent({ id: "dec", type: "decision" }),
        labEvent({ id: "code", type: "fileCode" }),
      ],
    });
    const out = filterSession(view, { query: "", kinds: ["decision"] });
    expect(out.events.map((e) => e.id)).toEqual(["dec"]);
  });

  it("treats fileCode and artifact events as the same code kind", () => {
    const view = labSession({
      events: [
        labEvent({ id: "file", type: "fileCode" }),
        labEvent({ id: "art", type: "artifact" }),
        labEvent({ id: "talk", type: "aiConversation" }),
      ],
    });
    const out = filterSession(view, { query: "", kinds: ["code"] });
    expect(out.events.map((e) => e.id).sort()).toEqual(["art", "file"]);
  });
});

describe("filterSession by query", () => {
  it("matches event title or summary case-insensitively", () => {
    const view = labSession({
      events: [
        labEvent({ id: "e1", title: "JWT 검증 도입", summary: "" }),
        labEvent({ id: "e2", title: "라우팅", summary: "jwt 캐시 전략" }),
        labEvent({ id: "e3", title: "캐시", summary: "무관" }),
      ],
    });
    const out = filterSession(view, { query: "jwt", kinds: [] });
    expect(out.events.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
  });

  it("combines query and kind as an AND", () => {
    const view = labSession({
      events: [
        labEvent({ id: "d1", type: "decision", title: "JWT 검증으로 합의" }),
        labEvent({ id: "d2", type: "decision", title: "캐시 정책 결정" }),
        labEvent({ id: "t1", type: "aiConversation", title: "JWT 논의" }),
      ],
    });
    const out = filterSession(view, { query: "jwt", kinds: ["decision"] });
    expect(out.events.map((e) => e.id)).toEqual(["d1"]);
  });
});

describe("filterSession referential pruning", () => {
  it("drops decisions, issues and artifacts whose source events are gone", () => {
    const view = labSession({
      events: [
        labEvent({ id: "keep", type: "decision", title: "유지" }),
        labEvent({ id: "drop", type: "aiConversation", title: "제거" }),
      ],
      decisions: [
        labDecision({ id: "dk", sourceEventIds: ["keep"] }),
        labDecision({ id: "dd", sourceEventIds: ["drop"] }),
      ],
      issues: [labIssue({ id: "id", sourceEventIds: ["drop"] })],
    });
    const out = filterSession(view, { query: "", kinds: ["decision"] });
    expect(out.decisions.map((d) => d.id)).toEqual(["dk"]);
    expect(out.issues).toEqual([]);
  });

  it("keeps a relationship only when both endpoints survive", () => {
    const view = labSession({
      events: [
        labEvent({ id: "a", title: "keep alpha" }),
        labEvent({ id: "b", title: "keep beta" }),
        labEvent({ id: "c", title: "drop gamma" }),
      ],
      relationships: [
        labRelationship({ id: "r-ab", fromId: "a", toId: "b" }),
        labRelationship({ id: "r-ac", fromId: "a", toId: "c" }),
      ],
    });
    const out = filterSession(view, { query: "keep", kinds: [] });
    expect(out.relationships.map((r) => r.id)).toEqual(["r-ab"]);
  });

  it("keeps next actions anchored to surviving events or issues, plus unanchored ones", () => {
    const view = labSession({
      events: [labEvent({ id: "keep", title: "keep" }), labEvent({ id: "drop", title: "drop" })],
      nextActions: [
        labNextAction({ id: "na-keep", relatedEventIds: ["keep"] }),
        labNextAction({ id: "na-drop", relatedEventIds: ["drop"] }),
        labNextAction({ id: "na-free", relatedEventIds: [], relatedIssueIds: [] }),
      ],
    });
    const out = filterSession(view, { query: "keep", kinds: [] });
    expect(out.nextActions.map((a) => a.id).sort()).toEqual(["na-free", "na-keep"]);
  });
});
