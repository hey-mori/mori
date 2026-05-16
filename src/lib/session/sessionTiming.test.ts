import { describe, expect, it } from "vitest";
import {
  describeSessionCardAction,
  deriveSessionTiming,
  formatDuration,
  formatLongDuration,
} from "./sessionTiming";
import type { Session } from "../../domain/types";

function buildSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    projectId: "project-1",
    title: "Test session",
    startedAt: "2026-05-14T09:00:00Z",
    endedAt: "2026-05-14T10:00:00Z",
    recordingMode: "summary",
    llmProvider: "ollama",
    llmModel: "llama3.1:8b",
    storageLocation: "~/Mori/Records",
    selectedSourceIds: [],
    status: "complete",
    ...overrides,
  };
}

describe("formatDuration", () => {
  it("zero-pads HH:MM:SS", () => {
    expect(formatDuration(0)).toBe("00:00:00");
    expect(formatDuration(65)).toBe("00:01:05");
    expect(formatDuration(3600 + 60 + 5)).toBe("01:01:05");
  });

  it("clamps negative values", () => {
    expect(formatDuration(-42)).toBe("00:00:00");
  });
});

describe("formatLongDuration", () => {
  it("uses seconds under one minute", () => {
    expect(formatLongDuration(45)).toBe("45s");
  });

  it("uses minutes under one hour", () => {
    expect(formatLongDuration(60 * 17)).toBe("17m");
  });

  it("uses h + zero-padded m above one hour", () => {
    expect(formatLongDuration(3600 + 60 * 4)).toBe("1h 04m");
  });
});

describe("deriveSessionTiming", () => {
  const demo = buildSession({
    id: "demo",
    title: "Demo",
    startedAt: "2026-05-14T13:02:00Z",
    endedAt: "2026-05-14T17:34:19Z",
    status: "complete",
  });

  it("returns the demo lifecycle when no draft exists", () => {
    const snap = deriveSessionTiming({
      draft: null,
      demoSession: demo,
      analysisStatus: "idle",
      now: new Date("2026-05-14T17:35:00Z").getTime(),
    });
    expect(snap.state).toBe("demo");
    expect(snap.stateLabel).toBe("Demo");
    expect(snap.isLive).toBe(false);
    expect(snap.startTimeLabel).toMatch(/^\d{2}:\d{2}$/);
    expect(snap.durationSeconds).toBe(4 * 3600 + 32 * 60 + 19);
    expect(snap.longLabel).toMatch(/^Demo · /);
  });

  it("flags a recording draft as live with now-relative duration", () => {
    const draft = buildSession({
      startedAt: "2026-05-14T13:02:00Z",
      endedAt: "",
      status: "recording",
    });
    const now = new Date("2026-05-14T17:34:19Z").getTime();
    const snap = deriveSessionTiming({
      draft: { session: draft },
      demoSession: demo,
      analysisStatus: "idle",
      now,
    });
    expect(snap.state).toBe("active");
    expect(snap.stateLabel).toBe("Live");
    expect(snap.isLive).toBe(true);
    expect(snap.durationSeconds).toBe(4 * 3600 + 32 * 60 + 19);
    expect(snap.durationLabel).toBe("04:32:19");
    expect(snap.longLabel).toBe("Live · 04:32:19");
  });

  it("treats a just-started session (endedAt === startedAt placeholder) as live", () => {
    // `createSessionDraft` seeds `endedAt` with the creation timestamp.
    const draft = buildSession({
      startedAt: "2026-05-14T13:00:00Z",
      endedAt: "2026-05-14T13:00:00Z",
      status: "recording",
    });
    const snap = deriveSessionTiming({
      draft: { session: draft },
      demoSession: demo,
      analysisStatus: "idle",
      now: new Date("2026-05-14T13:25:30Z").getTime(),
    });
    expect(snap.state).toBe("active");
    expect(snap.stateLabel).toBe("Live");
    expect(snap.isLive).toBe(true);
    expect(snap.durationLabel).toBe("00:25:30");
  });

  it("treats a stored endedAt in the future as a still-live session", () => {
    const draft = buildSession({
      startedAt: "2026-05-14T13:00:00Z",
      endedAt: "2030-01-01T00:00:00Z",
      status: "recording",
    });
    const now = new Date("2026-05-14T13:10:00Z").getTime();
    const snap = deriveSessionTiming({
      draft: { session: draft },
      demoSession: demo,
      analysisStatus: "idle",
      now,
    });
    expect(snap.isLive).toBe(true);
    expect(snap.durationSeconds).toBe(600);
  });

  it("uses analyzing state when Quick Pass is running", () => {
    const draft = buildSession({
      startedAt: "2026-05-14T13:00:00Z",
      endedAt: "",
      status: "recording",
    });
    const snap = deriveSessionTiming({
      draft: { session: draft },
      demoSession: demo,
      analysisStatus: "running",
      now: new Date("2026-05-14T13:05:00Z").getTime(),
    });
    expect(snap.state).toBe("analyzing");
    expect(snap.isLive).toBe(false);
    expect(snap.stateTone).toBe("orange");
  });

  it("uses ended state for completed sessions", () => {
    const draft = buildSession({
      startedAt: "2026-05-14T13:00:00Z",
      endedAt: "2026-05-14T13:45:00Z",
      status: "complete",
    });
    const snap = deriveSessionTiming({
      draft: { session: draft },
      demoSession: demo,
      analysisStatus: "succeeded",
      now: new Date("2026-05-14T14:00:00Z").getTime(),
    });
    expect(snap.state).toBe("ended");
    expect(snap.stateLabel).toBe("Ended");
    expect(snap.isLive).toBe(false);
    expect(snap.durationSeconds).toBe(45 * 60);
  });

  it("returns zero duration when timestamps are missing", () => {
    const draft = buildSession({ startedAt: "", endedAt: "", status: "recording" });
    const snap = deriveSessionTiming({
      draft: { session: draft },
      demoSession: demo,
      analysisStatus: "idle",
      now: Date.now(),
    });
    expect(snap.durationSeconds).toBe(0);
    expect(snap.durationLabel).toBe("00:00:00");
  });
});

describe("describeSessionCardAction", () => {
  it("offers End Session for an ongoing session", () => {
    for (const state of ["active", "analyzing", "draft"] as const) {
      expect(describeSessionCardAction(state)).toEqual({
        kind: "endSession",
        label: "세션 종료",
      });
    }
  });

  it("offers View Report for a finished or demo session", () => {
    for (const state of ["ended", "demo"] as const) {
      expect(describeSessionCardAction(state)).toEqual({
        kind: "viewReport",
        label: "리포트 보기",
      });
    }
  });
});
