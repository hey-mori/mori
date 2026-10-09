import { describe, expect, it } from "vitest";
import type { ClaudeCodeSearchBatch, ClaudeCodeSearchHit } from "../claude/types";
import {
  applySearchBatch,
  canSearchMore,
  normalizeQuery,
  SEARCH_MAX_HELD_HITS,
  searchStatusLine,
  splitOnPhrase,
  startedSearch,
  type SessionSearchState,
} from "./sessionSearch";

const hit = (id: string, start: number): ClaudeCodeSearchHit => ({
  messageId: id,
  role: "assistant",
  subkind: "",
  createdAt: "",
  recordStart: start,
  recordEnd: start + 10,
  recordAnchor: `a${start}`,
  snippetBefore: "",
  snippetMatch: "needle",
  snippetAfter: "",
  matchesInMessage: 1,
});

const batch = (scanEnd: number, scanStart: number, hits: ClaudeCodeSearchHit[], sourceId = "s"): ClaudeCodeSearchBatch => ({
  sourceId,
  fileBytes: 1000,
  scanEnd,
  scanStart,
  scanStartAnchor: `a${scanStart}`,
  reachedStart: scanStart === 0,
  hits,
  hitLimit: false,
  searchedRecords: 1,
  unsearchableRecords: 0,
  unsearchableBytes: 0,
});

const fresh = (): SessionSearchState => startedSearch({ sessionId: "x", openToken: 1, sourcePath: "/p.jsonl", query: "needle" });

describe("search state", () => {
  it("folds steps that continue each other and ignores stale or foreign ones", () => {
    let state = applySearchBatch(fresh(), batch(1000, 600, [hit("m9", 900)]));
    expect(state.cursor).toEqual({ beforeOffset: 600, anchor: "a600" });
    // A step that does not end where the last one stopped is stale.
    expect(applySearchBatch(state, batch(1000, 600, [hit("m9", 900)]))).toBe(state);
    // A step from a replaced file is foreign.
    expect(applySearchBatch(state, batch(600, 200, [hit("z", 300)], "other"))).toBe(state);
    state = applySearchBatch(state, batch(600, 0, [hit("m2", 300)]));
    expect(state.hits.map((entry) => entry.messageId)).toEqual(["m9", "m2"]);
    expect(state.reachedStart).toBe(true);
    // Nothing continues a search that reached the start.
    expect(applySearchBatch(state, batch(600, 0, [hit("m1", 100)]))).toBe(state);
  });

  it("keeps a bounded number of results", () => {
    const many = Array.from({ length: SEARCH_MAX_HELD_HITS + 30 }, (_, index) => hit(`m${index}`, index));
    const state = applySearchBatch(fresh(), batch(1000, 500, many));
    expect(state.hits).toHaveLength(SEARCH_MAX_HELD_HITS);
    expect(canSearchMore({ ...state, status: "idle" })).toBe(false);
  });

  it("never calls a partial search complete", () => {
    const partial = { ...applySearchBatch(fresh(), batch(1000, 600, [])), status: "idle" as const };
    expect(searchStatusLine(partial)).toBe("최근 약 40%에서 찾지 못했습니다");
    expect(searchStatusLine({ ...partial, status: "cancelled" })).toBe("검색을 멈췄습니다 · 최근 약 40%에서 0개");
    expect(canSearchMore(partial)).toBe(true);
    const complete = { ...applySearchBatch(partial, batch(600, 0, [])), status: "idle" as const };
    expect(searchStatusLine(complete)).toBe("원본 전체에서 찾지 못했습니다");
    expect(canSearchMore(complete)).toBe(false);
    const found = { ...applySearchBatch(fresh(), batch(1000, 995, [hit("m1", 996)])), status: "idle" as const };
    expect(searchStatusLine(found)).toBe("최근 1% 미만에서 1개 메시지 · 이전 부분은 아직 찾지 않았습니다");
  });

  it("does not call a search whole when a record was too large to search", () => {
    const complete = { ...applySearchBatch(fresh(), { ...batch(1000, 0, []), unsearchableRecords: 2, unsearchableBytes: 5 }), status: "idle" as const };
    expect(searchStatusLine(complete)).not.toContain("원본 전체에서 찾지 못했습니다");
    expect(searchStatusLine(complete)).toContain("너무 큰 기록 2개");
  });

  it("accepts only a bounded, non-empty phrase", () => {
    expect(normalizeQuery("  firewall parser ")).toBe("firewall parser");
    expect(normalizeQuery("   ")).toBeNull();
    expect(normalizeQuery("가".repeat(201))).toBeNull();
    expect(normalizeQuery("가".repeat(200))).toBe("가".repeat(200));
  });

  it("marks every match as text, ignoring case", () => {
    expect(splitOnPhrase("The Parser and the parser", "PARSER")).toEqual([
      { text: "The ", match: false },
      { text: "Parser", match: true },
      { text: " and the ", match: false },
      { text: "parser", match: true },
    ]);
    expect(splitOnPhrase("방화벽 파서", "파서")).toEqual([
      { text: "방화벽 ", match: false },
      { text: "파서", match: true },
    ]);
    expect(splitOnPhrase("<b>needle</b>", "needle")[1]).toEqual({ text: "needle", match: true });
  });
});
