import { describe, expect, it } from "vitest";
import { buildWorkContext, spanLabel } from "./workContext";
import type { Session } from "../../domain/types";

function makeSession(partial: Partial<Session>): Session {
  return {
    id: "sess-1",
    projectId: "proj-1",
    title: "Untitled",
    startedAt: "2026-05-21T09:00:00Z",
    endedAt: "2026-05-21T09:00:00Z",
    recordingMode: "summary",
    llmProvider: "ollama",
    llmModel: "llama3.1:8b",
    storageLocation: "browser",
    selectedSourceIds: [],
    status: "complete",
    ...partial,
  };
}

const demoSession = makeSession({
  id: "demo",
  title: "데모 세션",
  startedAt: "2026-05-20T10:00:00Z",
  endedAt: "2026-05-20T12:30:00Z",
});

describe("buildWorkContext", () => {
  it("treats the no-draft case as a calm demo context, never live", () => {
    const ctx = buildWorkContext({ draft: null, demoSession, analysisStatus: "idle" });
    expect(ctx.origin).toBe("demo");
    expect(ctx.isLive).toBe(false);
    expect(ctx.timeDescriptor).toBe("2시간 30분");
  });

  it("keeps a demo session's sourceLabel for the session breadcrumb", () => {
    const ctx = buildWorkContext({
      draft: null,
      demoSession: makeSession({ ...demoSession, sourceLabel: "C:/dev/ng-gw" }),
      analysisStatus: "idle",
    });
    expect(ctx.projectLabel).toBe("C:/dev/ng-gw");
  });

  it("classifies a session with a sourceLabel as imported with an evidence span", () => {
    const session = makeSession({
      title: "충돌 해결하고 머지해줘",
      sourceLabel: "C:/dev/mori",
      startedAt: "2026-05-21T07:22:00Z",
      endedAt: "2026-05-21T10:07:00Z",
      status: "complete",
    });
    const ctx = buildWorkContext({ draft: { session }, demoSession, analysisStatus: "idle" });
    expect(ctx.origin).toBe("imported");
    expect(ctx.originLabel).toBe("가져온 세션");
    expect(ctx.projectLabel).toBe("C:/dev/mori");
    expect(ctx.sessionTitle).toBe("충돌 해결하고 머지해줘");
    expect(ctx.timeDescriptor).toBe("2시간 45분");
    // Critical: an imported session never ticks a live clock.
    expect(ctx.isLive).toBe(false);
  });

  it("does NOT tick for a freshly started manual session (no fake recording)", () => {
    // status "recording" + no genuine end would have made the old timer
    // tick; the work context must stay calm because Mori isn't recording.
    const session = makeSession({
      title: "새 작업",
      status: "recording",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    });
    const ctx = buildWorkContext({ draft: { session }, demoSession, analysisStatus: "idle" });
    expect(ctx.origin).toBe("manual");
    expect(ctx.isLive).toBe(false);
  });

  it("surfaces an analyzing manual session honestly", () => {
    const session = makeSession({ title: "분석 대상", status: "analyzing" });
    const ctx = buildWorkContext({ draft: { session }, demoSession, analysisStatus: "running" });
    expect(ctx.origin).toBe("manual");
    expect(ctx.originLabel).toBe("분석 중");
    expect(ctx.tone).toBe("orange");
    expect(ctx.isLive).toBe(false);
  });

  it("prefers imported framing even while the session is recording-flagged", () => {
    const session = makeSession({
      title: "가져온 대화",
      sourceLabel: "C:/dev/buywise",
      status: "recording",
      startedAt: "2026-05-21T07:00:00Z",
      endedAt: "2026-05-21T07:00:00Z",
    });
    const ctx = buildWorkContext({ draft: { session }, demoSession, analysisStatus: "idle" });
    expect(ctx.origin).toBe("imported");
    expect(ctx.isLive).toBe(false);
  });
});

describe("spanLabel", () => {
  it("formats sub-hour, hour, and multi-day spans", () => {
    expect(spanLabel("2026-05-21T09:00:00Z", "2026-05-21T09:45:00Z")).toBe("45분");
    expect(spanLabel("2026-05-21T09:00:00Z", "2026-05-21T11:00:00Z")).toBe("2시간");
    expect(spanLabel("2026-05-21T09:00:00Z", "2026-05-21T11:30:00Z")).toBe("2시간 30분");
    expect(spanLabel("2026-05-21T09:00:00Z", "2026-05-24T14:00:00Z")).toBe("3일 5시간");
  });

  it("returns a date label when start and end collapse to a point", () => {
    expect(spanLabel("2026-05-21T09:00:00Z", "2026-05-21T09:00:00Z")).toBe("5월 21일");
  });

  it("returns under-a-minute and null for missing start", () => {
    expect(spanLabel("2026-05-21T09:00:00Z", "2026-05-21T09:00:30Z")).toBe("1분 미만");
    expect(spanLabel(undefined, "2026-05-21T09:00:00Z")).toBeNull();
  });
});
