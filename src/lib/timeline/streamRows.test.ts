import { describe, expect, it } from "vitest";
import { foldStreamRows, type StreamRow } from "./streamRows";
import type { TimelineDisplayItem } from "./displayItems";

function toolEvent(id: string, toolName: string): TimelineDisplayItem {
  return {
    kind: "event",
    id,
    laneType: "command",
    start: "2026-06-01T00:00:00Z",
    event: { id, start: "2026-06-01T00:00:00Z", title: `🔧 ${toolName}`, actor: "tool", toolName } as never,
    memberEventIds: [id],
  };
}

function turnEvent(id: string): TimelineDisplayItem {
  return {
    kind: "event",
    id,
    laneType: "conversation",
    start: "2026-06-01T00:00:00Z",
    event: { id, start: "2026-06-01T00:00:00Z", title: "대화", actor: "assistant" } as never,
    memberEventIds: [id],
  };
}

const isToolRun = (row: StreamRow): row is Extract<StreamRow, { kind: "toolRun" }> =>
  row.kind === "toolRun";

describe("foldStreamRows", () => {
  it("folds a run of consecutive tool calls into one tool-run row", () => {
    const rows = foldStreamRows([
      turnEvent("u1"),
      toolEvent("t1", "Grep"),
      toolEvent("t2", "Bash"),
      toolEvent("t3", "Read"),
      turnEvent("a1"),
    ]);
    expect(rows.map((row) => row.kind)).toEqual(["item", "toolRun", "item"]);
    const run = rows.find(isToolRun)!;
    expect(run.events).toHaveLength(3);
    expect(run.tools).toEqual(["Grep", "Bash", "Read"]);
  });

  it("dedupes tool names and keeps separate runs separate", () => {
    const rows = foldStreamRows([
      toolEvent("t1", "Grep"),
      toolEvent("t2", "Grep"),
      turnEvent("a1"),
      toolEvent("t3", "Bash"),
    ]);
    expect(rows.map((row) => row.kind)).toEqual(["toolRun", "item", "toolRun"]);
    expect(rows.filter(isToolRun)[0].tools).toEqual(["Grep"]);
    expect(rows.filter(isToolRun)[1].tools).toEqual(["Bash"]);
  });

  it("leaves a stream with no tool calls untouched", () => {
    const rows = foldStreamRows([turnEvent("u1"), turnEvent("a1")]);
    expect(rows.every((row) => row.kind === "item")).toBe(true);
  });
});
