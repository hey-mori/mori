import { describe, expect, it } from "vitest";
import type { ClaudeCodeSessionWindow } from "../claude/types";
import {
  classifyWindowError,
  isTooLargeError,
  coverageLabel,
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
    endAnchor: `e${end}`,
    endOffset: end,
    reachedStart: start === 0,
    reachedEnd: end === 1000,
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

  it("labels coverage honestly at every size", () => {
    const at = (loadedBytes: number, fileBytes: number, status: "partial" | "full" = "partial") =>
      coverageLabel({ status, loadedBytes, fileBytes });
    // The real case: 1 MiB of a 143 MB transcript is part of it, not 0%.
    expect(at(1_048_576, 143_506_983)).toBe("원본의 1% 미만");
    expect(at(0, 1000)).toBe("원본의 0%");
    expect(at(10, 1000)).toBe("원본의 약 1%");
    expect(at(456, 1000)).toBe("원본의 약 45%");
    expect(at(999, 1000)).toBe("원본의 약 99%");
    expect(at(1000, 1000, "full")).toBe("원본 전체");
    expect(at(10, 0)).toBeNull();
    expect(at(10, Number.NaN)).toBeNull();
    const state = windowStateFrom("x", win(1, 1000, ["c"]));
    expect(coverageLabel(prependEarlierWindow(state, win(0, 1, [])))).toBe("원본 전체");
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
    // An agent without a window reader says so plainly, not "try again later".
    expect(classifyWindowError(new Error("Codex session is too large (9 bytes > 8 byte cap).")).kind).toBe("tooLarge");
  });
});
