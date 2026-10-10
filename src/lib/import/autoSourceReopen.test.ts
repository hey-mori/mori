import { describe, expect, it } from "vitest";
import type { TimelineEvent } from "../../domain/types";
import type { StoredSessionImport } from "../storage/storageTypes";
import type { NormalizedImportCandidate } from "./types";
import { logicalSourceKey, planSourceReopen, storedImportsOfSource } from "./autoSourceReopen";

const event = (id: string, extra: Partial<TimelineEvent> = {}): TimelineEvent =>
  ({ id, sessionId: "s", projectId: "p", start: "2026-10-08T09:00:00Z", type: "aiConversation", title: id, summary: id, sourceRefs: [], linkedIssueIds: [], linkedDecisionIds: [], relationshipIds: [], trustLevel: "observed", confidence: 0.9, createdBy: "import", userModified: false, ...extra }) as TimelineEvent;

function candidate(sourceId: string, ids: string[], title = "Claude Code · Same", kind = "claudeTranscript"): NormalizedImportCandidate {
  return {
    source: { id: sourceId, sessionId: "s", kind, title, detail: "", trustLevel: "observed", redactionStatus: "pending", rawRetention: "summaryOnly", capturedAt: "", relatedEventIds: ids },
    events: ids.map((id) => event(id, { sourceRefs: [sourceId] })),
  } as unknown as NormalizedImportCandidate;
}

function stored(c: NormalizedImportCandidate): StoredSessionImport {
  return { id: c.source.id, sessionId: "s", source: c.source, events: c.events, savedAt: "2026-10-08T00:00:00Z", adapter: "browser-local-storage" } as StoredSessionImport;
}

describe("logical source of an auto import", () => {
  it("is the source id without its capture time", () => {
    expect(logicalSourceKey("src-claude-code-38dd037d-06cd-20261008123837")).toBe("src-claude-code-38dd037d-06cd");
    expect(logicalSourceKey("src-manual-note")).toBeNull();
  });

  it("matches only the same conversation and kind, never a title", () => {
    const fresh = candidate("src-claude-code-aaa-20261009000000", ["e1"]);
    const sameTitleOtherConversation = stored(candidate("src-claude-code-bbb-20261008000000", ["x1"]));
    const otherKind = stored(candidate("src-claude-code-aaa-20261008000000", ["e1"], "Claude Code · Same", "manualNote"));
    expect(storedImportsOfSource([sameTitleOtherConversation, otherKind], fresh)).toEqual([]);
    expect(planSourceReopen([sameTitleOtherConversation, otherKind], fresh)).toEqual({ kind: "add" });
  });

  it("an id without a capture time is never taken for an auto import", () => {
    const fresh = candidate("src-manual", ["e1"]);
    expect(planSourceReopen([stored(candidate("src-manual", ["e1"]))], fresh)).toEqual({ kind: "add" });
  });

  it("several stored copies are left alone", () => {
    const fresh = candidate("src-claude-code-aaa-20261009000000", ["e1", "e2"]);
    const copies = ["20261001000000", "20261002000000"].map((time) => stored(candidate(`src-claude-code-aaa-${time}`, ["e1"])));
    expect(planSourceReopen(copies, fresh)).toMatchObject({ kind: "keep", reason: "ambiguous" });
  });

  it("an unchanged read is not a write", () => {
    const first = stored(candidate("src-claude-code-aaa-20261008000000", ["e1", "e2"]));
    expect(planSourceReopen([first], candidate("src-claude-code-aaa-20261009000000", ["e1", "e2"]))).toEqual({
      kind: "unchanged",
      importId: first.id,
    });
  });
});

describe("a turn whose id a citation holds (pinned)", () => {
  const SRC = "src-claude-code-aaa";
  /** Turn i of the session, as the reader builds it: its id carries its time. */
  const turn = (index: number, start: string, extra: Partial<TimelineEvent> = {}) =>
    event(`evt-claude-aaa-${index}-${start.replace(/\D/g, "").slice(0, 14)}`, {
      turnIndex: index,
      connectorEventId: `claude::code::aaa::${index}`,
      start,
      sourceRefs: [`${SRC}-20261008000000`],
      ...extra,
    });
  const read = (events: TimelineEvent[], time = "20261009000000") =>
    ({ ...candidate(`${SRC}-${time}`, events.map((e) => e.id)), events }) as NormalizedImportCandidate;
  const asStored = (events: TimelineEvent[]) => stored({ ...candidate(`${SRC}-20261008000000`, events.map((e) => e.id)), events } as NormalizedImportCandidate);

  const T0 = "2026-10-08T09:00:00.000Z";
  const PROMPT = "2026-10-08T09:02:00.000Z";
  const REPLY = "2026-10-08T09:04:00.000Z";
  const waiting = turn(1, PROMPT, { actor: "user", title: "q", summary: "q" });
  const cited = (id: string) => id === waiting.id;

  const LATER = "2026-10-08T09:06:00.000Z";
  function pin(reply: Partial<TimelineEvent>, withLater = false) {
    const fresh = [turn(0, T0), turn(1, REPLY, reply), ...(withLater ? [turn(2, LATER)] : [])];
    const first = planSourceReopen([asStored([turn(0, T0), waiting])], read(fresh), cited);
    expect(first.kind).toBe("update");
    if (first.kind !== "update") throw new Error("not updated");
    expect(first.next.events[1]!.id).toBe(waiting.id);
    expect(first.renamed).toEqual([]);
    return first.next;
  }

  it("keeps refreshing after more turns, even when its reply reads as a tool turn with no tool name", () => {
    const reply = { actor: "tool" as const, title: "q", summary: "raw model output" };
    // Pinned with a later turn after it, so it is no longer the last stored turn.
    const pinned = pin(reply, true);
    expect(pinned.events).toHaveLength(3);
    const grown = read([turn(0, T0), turn(1, REPLY, reply), turn(2, LATER), turn(3, "2026-10-08T09:08:00.000Z")], "20261010000000");
    const second = planSourceReopen([pinned], grown, cited);
    expect(second).toMatchObject({ kind: "update", added: 1 });
  });

  it("a later rewrite of the pinned turn's text is a rewrite, not a refresh", () => {
    const pinned = pin({ actor: "assistant", title: "q", summary: "answer" });
    const rewritten = read([turn(0, T0), turn(1, REPLY, { actor: "assistant", title: "q", summary: "another answer" })], "20261010000000");
    expect(planSourceReopen([pinned], rewritten, cited)).toMatchObject({ kind: "keep", reason: "diverged" });
  });

  it("an edited prompt left waiting is found again after later turns were added", () => {
    const edited = { ...waiting, userModified: true, title: "my words" };
    const first = planSourceReopen([asStored([turn(0, T0), edited])], read([turn(0, T0), turn(1, REPLY, { actor: "assistant" }), turn(2, "2026-10-08T09:06:00.000Z")]));
    expect(first).toMatchObject({ kind: "update", added: 1 });
    if (first.kind !== "update") throw new Error("not updated");
    expect(first.next.events[1]).toEqual(edited);
    const grown = read([turn(0, T0), turn(1, REPLY, { actor: "assistant" }), turn(2, "2026-10-08T09:06:00.000Z"), turn(3, "2026-10-08T09:08:00.000Z")], "20261010000000");
    expect(planSourceReopen([first.next], grown)).toMatchObject({ kind: "update", added: 1 });
  });
});

describe("a reader upgrade that renders a tool result differently", () => {
  const SRC = "src-claude-code-aaa";
  const toolTurn = (id: string, summary: string) => event(id, { actor: "tool", title: "도구 실행", summary, sourceRefs: [`${SRC}-20261008000000`] });
  const read = (events: TimelineEvent[]) =>
    ({ ...candidate(`${SRC}-20261009000000`, events.map((e) => e.id)), events }) as NormalizedImportCandidate;
  const asStored = (events: TimelineEvent[]) =>
    stored({ ...candidate(`${SRC}-20261008000000`, events.map((e) => e.id)), events } as NormalizedImportCandidate);

  it("refreshes a tool result's rendering and still appends new turns", () => {
    const before = asStored([event("e1"), toolTurn("e2", "↳ 도구 결과: \u001b[32m✓\u001b[39m built"), toolTurn("e3", "↳ (도구 결과 없음)")]);
    const plan = planSourceReopen(
      [before],
      read([event("e1"), toolTurn("e2", "↳ 도구 결과: ✓ built"), toolTurn("e3", "↳ 도구 결과: (이미지 1개)"), event("e4")]),
    );
    expect(plan).toMatchObject({ kind: "update", added: 1, refreshed: 2 });
    if (plan.kind !== "update") return;
    expect(plan.next.events.map((e) => e.summary)).toEqual(["e1", "↳ 도구 결과: ✓ built", "↳ 도구 결과: (이미지 1개)", "e4"]);
  });

  it("still treats changed words of a person or the agent as a rewrite", () => {
    const before = asStored([event("e1", { summary: "원래 질문" }), toolTurn("e2", "↳ 도구 결과: ok")]);
    expect(planSourceReopen([before], read([event("e1", { summary: "바뀐 질문" }), toolTurn("e2", "↳ 도구 결과: ok"), event("e3")]))).toMatchObject({
      kind: "keep",
      reason: "diverged",
    });
    // A tool turn whose text stopped being a tool result is not a rendering change either.
    expect(planSourceReopen([before], read([event("e1", { summary: "원래 질문" }), toolTurn("e2", "다른 글"), event("e3")]))).toMatchObject({
      kind: "keep",
      reason: "diverged",
    });
  });
});
