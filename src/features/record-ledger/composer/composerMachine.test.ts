import { describe, expect, it } from "vitest";
import { runCapturePipeline } from "../../../lib/capture";
import { createSchemaRegistry } from "../../../lib/record-kernel/schemaRegistry";
import {
  COMPOSER_IDLE,
  composerInitial,
  composerReduce,
  keptRecordIds,
  type ComposerEvent,
  type ComposerState,
} from "./composerMachine";

const registry = createSchemaRegistry();
const now = () => new Date("2026-07-15T09:00:00Z");

function outcomeFor(content: string) {
  return runCapturePipeline({ kind: "text", content }, registry, { now });
}

function run(state: ComposerState, ...events: ComposerEvent[]): ComposerState {
  return events.reduce(composerReduce, state);
}

describe("composerReduce · legal flow", () => {
  it("walks idle → typing → organizing → reviewing → saved", () => {
    const outcome = outcomeFor("어제 화면을 검토했고 오늘 러닝 1시간 했어");
    let state = run(COMPOSER_IDLE, { type: "TYPE", text: "어제 화면을 검토했고" });
    expect(state.phase).toBe("typing");
    state = run(state, { type: "ORGANIZE" });
    expect(state.phase).toBe("organizing");
    state = run(state, { type: "ORGANIZED", outcome });
    expect(state.phase).toBe("reviewing");
    state = run(state, { type: "SAVE_START" }, { type: "SAVED", savedRecordIds: ["r1"] });
    expect(state).toEqual({ phase: "saved", savedRecordIds: ["r1"], undone: false });
    state = run(state, { type: "DISMISS" });
    expect(state).toEqual(COMPOSER_IDLE);
  });

  it("routes an organize failure to failed, keeping the text for retry", () => {
    let state = run(
      COMPOSER_IDLE,
      { type: "TYPE", text: "메모" },
      { type: "ORGANIZE" },
      { type: "ORGANIZE_FAILED", error: { kind: "engine-missing", message: "x" } },
    );
    expect(state.phase).toBe("failed");
    state = run(state, { type: "RETRY" });
    expect(state).toEqual({ phase: "organizing", text: "메모" });
  });

  it("restores a recovered draft only on accept", () => {
    const idle = composerInitial("작성 중이던 글");
    expect(run(idle, { type: "RESTORE_DISMISS" })).toEqual(COMPOSER_IDLE);
    expect(run(idle, { type: "RESTORE_ACCEPT" })).toEqual({
      phase: "typing",
      text: "작성 중이던 글",
    });
  });

  it("returns to typing from reviewing without losing the original text", () => {
    const outcome = outcomeFor("오늘 러닝 30분");
    const state = run(
      COMPOSER_IDLE,
      { type: "TYPE", text: "오늘 러닝 30분" },
      { type: "ORGANIZE" },
      { type: "ORGANIZED", outcome },
      { type: "BACK_TO_TEXT" },
    );
    expect(state).toEqual({ phase: "typing", text: "오늘 러닝 30분" });
  });
});

describe("composerReduce · guards", () => {
  it("never organizes empty text", () => {
    const state = run(COMPOSER_IDLE, { type: "TYPE", text: "   " }, { type: "ORGANIZE" });
    expect(state.phase).not.toBe("organizing");
  });

  it("ignores a second ORGANIZE while organizing (no double run)", () => {
    const state = run(
      COMPOSER_IDLE,
      { type: "TYPE", text: "메모" },
      { type: "ORGANIZE" },
      { type: "ORGANIZE" },
    );
    expect(state).toEqual({ phase: "organizing", text: "메모" });
  });

  it("ignores a second SAVE_START while saving (no double submit)", () => {
    const outcome = outcomeFor("오늘 러닝 30분");
    const reviewing = run(
      COMPOSER_IDLE,
      { type: "TYPE", text: "오늘 러닝 30분" },
      { type: "ORGANIZE" },
      { type: "ORGANIZED", outcome },
      { type: "SAVE_START" },
    );
    expect(reviewing).toEqual(run(reviewing, { type: "SAVE_START" }));
    // Edits and exclusion are also frozen mid-save.
    expect(run(reviewing, { type: "TOGGLE_EXCLUDE", recordId: "any" })).toEqual(reviewing);
  });

  it("ignores ORGANIZED arriving outside organizing (stale async result)", () => {
    const outcome = outcomeFor("오늘 러닝 30분");
    expect(run(COMPOSER_IDLE, { type: "ORGANIZED", outcome })).toEqual(COMPOSER_IDLE);
  });

  it("allows undo exactly once", () => {
    const saved: ComposerState = { phase: "saved", savedRecordIds: ["r1"], undone: false };
    const undone = run(saved, { type: "UNDONE" });
    expect(undone).toEqual({ phase: "saved", savedRecordIds: ["r1"], undone: true });
    expect(run(undone, { type: "UNDONE" })).toEqual(undone);
  });
});

describe("composerReduce · review edits", () => {
  it("stages edits per candidate and merges successive edits", () => {
    const outcome = outcomeFor("어제 화면을 검토했고 오늘 러닝 1시간 했어");
    const recordId = outcome.records[0].created.record.id;
    const state = run(
      COMPOSER_IDLE,
      { type: "TYPE", text: "x" },
      { type: "ORGANIZE" },
      { type: "ORGANIZED", outcome },
      { type: "EDIT", recordId, edit: { title: "새 제목" } },
      { type: "EDIT", recordId, edit: { occurredStart: "2026-07-10" } },
    );
    if (state.phase !== "reviewing") throw new Error("expected reviewing");
    expect(state.edits[recordId]).toEqual({ title: "새 제목", occurredStart: "2026-07-10" });
  });

  it("keptRecordIds excludes toggled-out candidates", () => {
    const outcome = outcomeFor("어제 화면을 검토했고 오늘 러닝 1시간 했어");
    const [first] = outcome.records.map((item) => item.created.record.id);
    const state = run(
      COMPOSER_IDLE,
      { type: "TYPE", text: "x" },
      { type: "ORGANIZE" },
      { type: "ORGANIZED", outcome },
      { type: "TOGGLE_EXCLUDE", recordId: first },
    );
    if (state.phase !== "reviewing") throw new Error("expected reviewing");
    expect(keptRecordIds(state)).toHaveLength(outcome.records.length - 1);
    expect(keptRecordIds(state)).not.toContain(first);
    // Toggling back restores it.
    const restored = run(state, { type: "TOGGLE_EXCLUDE", recordId: first });
    if (restored.phase !== "reviewing") throw new Error("expected reviewing");
    expect(keptRecordIds(restored)).toContain(first);
  });
});
