import { describe, expect, it } from "vitest";
import type { ClaudeCodeSessionWindow } from "../claude/types";
import {
  classifyWindowError,
  isTooLargeError,
  loadedPercent,
  prependEarlierWindow,
  windowStateFrom,
} from "./sessionWindow";

function win(start: number, end: number, ids: string[], sourceId = "s"): ClaudeCodeSessionWindow {
  return {
    filePath: "/p.jsonl",
    sourceId,
    fileBytes: 1000,
    startOffset: start,
    startAnchor: `a${start}`,
    endOffset: end,
    reachedStart: start === 0,
    events: ids.map((id) => ({ id, role: "assistant", content: id, createdAt: "" })),
    fileTouches: [],
    stats: { rawLines: ids.length, parsed: ids.length, skipped: 0, unparseable: 0 },
    omittedRecords: 0,
    omittedBytes: 0,
  };
}

describe("session window model", () => {
  it("a stale earlier reply (wrong place or another file) is ignored, not spliced", () => {
    const state = windowStateFrom("x", win(600, 1000, ["c"]));
    expect(prependEarlierWindow(state, win(300, 500, ["b"]))).toBe(state);
    expect(prependEarlierWindow(state, win(300, 600, ["b"], "other"))).toBe(state);
  });

  it("never reports a partial view as 100%", () => {
    const state = windowStateFrom("x", win(1, 1000, ["c"]));
    expect(loadedPercent(state)).toBe(99);
    expect(loadedPercent(prependEarlierWindow(state, win(0, 1, [])))).toBe(100);
  });

  it("classifies reader errors so the UI can explain them", () => {
    expect(classifyWindowError(new Error("SOURCE_CHANGED: x")).kind).toBe("changed");
    expect(classifyWindowError(new Error("INVALID_CURSOR: x")).kind).toBe("changed");
    expect(classifyWindowError(new Error("SOURCE_MISSING: x")).kind).toBe("missing");
    expect(classifyWindowError(new Error("Refused: outside")).kind).toBe("refused");
    expect(classifyWindowError("boom").kind).toBe("error");
    const unavailable = Object.assign(new Error("no bridge"), { name: "ClaudeBridgeUnavailableError" });
    expect(classifyWindowError(unavailable).kind).toBe("unavailable");
    expect(isTooLargeError(new Error("Claude Code session is too large (9 bytes > 8 byte cap)."))).toBe(true);
  });
});
