import { describe, expect, it } from "vitest";
import {
  selectRetainedSourceCapturedAt,
  selectRetainedSourceKind,
  selectRetainedSourceNotice,
  type SessionState,
} from "./sessionStore";

const imp = (savedAt: string) => ({ savedAt }) as SessionState["imports"][number];

function state(partial: Partial<Pick<SessionState, "sessionWindow" | "imports">> & { draftId?: string }): SessionState {
  return {
    draft: partial.draftId === undefined ? { session: { id: "s1" } } : { session: { id: partial.draftId } },
    sessionWindow: partial.sessionWindow ?? null,
    imports: partial.imports ?? [],
  } as unknown as SessionState;
}

const missing = { sessionId: "s1", status: "error" as const, error: { kind: "missing" as const, message: "SOURCE_MISSING" } };

describe("saying a kept copy is on screen", () => {
  it("names the failure and the newest kept copy when the source read failed", () => {
    const notice = selectRetainedSourceNotice(
      state({ sessionWindow: missing, imports: [imp("2026-10-08T03:38:37Z"), imp("2026-10-08T04:43:48Z")] }),
    );
    expect(notice).toEqual({ kind: "missing", capturedAt: "2026-10-08T04:43:48Z" });
  });

  it("says nothing when the source was read", () => {
    expect(selectRetainedSourceNotice(state({ imports: [imp("2026-10-08T04:43:48Z")] }))).toBeNull();
  });

  it("says nothing when there is no kept copy: the failure screen shows instead", () => {
    expect(selectRetainedSourceNotice(state({ sessionWindow: missing }))).toBeNull();
  });

  it("never attaches another session's failure", () => {
    expect(
      selectRetainedSourceNotice(state({ draftId: "s2", sessionWindow: missing, imports: [imp("2026-10-08T04:43:48Z")] })),
    ).toBeNull();
  });
});

describe("what a component subscribes to", () => {
  it("is primitive, so the same state yields the same value (an object would re-render forever)", () => {
    const s = state({ sessionWindow: missing, imports: [imp("2026-10-08T04:43:48Z")] });
    expect(selectRetainedSourceKind(s)).toBe(selectRetainedSourceKind(s));
    expect(typeof selectRetainedSourceKind(s)).toBe("string");
    expect(selectRetainedSourceCapturedAt(s)).toBe("2026-10-08T04:43:48Z");
  });
});
