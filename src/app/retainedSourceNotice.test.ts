import { describe, expect, it } from "vitest";
import {
  selectRetainedSourceLastEventAt,
  selectRetainedSourceNotice,
  type SessionState,
} from "./sessionStore";

const imp = (savedAt: string, eventTimes: string[]) =>
  ({ savedAt, events: eventTimes.map((start) => ({ start })) }) as unknown as SessionState["imports"][number];

function state(
  partial: Partial<Pick<SessionState, "sessionWindow" | "imports" | "divergedSourceSessionId">> & { draftId?: string },
): SessionState {
  return {
    draft: { session: { id: partial.draftId ?? "s1" } },
    sessionWindow: partial.sessionWindow ?? null,
    imports: partial.imports ?? [],
    divergedSourceSessionId: partial.divergedSourceSessionId ?? null,
  } as unknown as SessionState;
}

const failed = (kind: string) => ({ sessionId: "s1", status: "error" as const, error: { kind, message: kind } });

describe("saying a kept copy is on screen", () => {
  it("dates the copy by its newest event, not by when it was first stored", () => {
    // Stored three weeks ago, then grown by a reopen yesterday: savedAt stays old.
    const notice = selectRetainedSourceNotice(
      state({
        sessionWindow: failed("missing") as SessionState["sessionWindow"],
        imports: [imp("2026-09-18T00:00:00Z", ["2026-09-18T00:00:00Z", "2026-10-08T06:48:00Z"])],
      }),
    );
    expect(notice).toEqual({ kind: "missing", lastEventAt: "2026-10-08T06:48:00Z" });
  });

  it("says nothing for failures that are not a missing source", () => {
    for (const kind of ["tooLarge", "error", "unavailable", "changed", "refused"]) {
      expect(
        selectRetainedSourceNotice(
          state({ sessionWindow: failed(kind) as SessionState["sessionWindow"], imports: [imp("x", ["2026-10-08T06:48:00Z"])] }),
        ),
      ).toBeNull();
    }
  });

  it("says nothing when the source was read, or when there is no kept copy", () => {
    expect(selectRetainedSourceNotice(state({ imports: [imp("x", ["2026-10-08T06:48:00Z"])] }))).toBeNull();
    expect(selectRetainedSourceNotice(state({ sessionWindow: failed("missing") as SessionState["sessionWindow"] }))).toBeNull();
  });

  it("never attaches another session's failure", () => {
    expect(
      selectRetainedSourceNotice(
        state({ draftId: "s2", sessionWindow: failed("missing") as SessionState["sessionWindow"], imports: [imp("x", ["2026-10-08T06:48:00Z"])] }),
      ),
    ).toBeNull();
  });

  it("says the kept copy stands when the readable file no longer continues it", () => {
    const imports = [imp("x", ["2026-10-08T06:48:00Z"])];
    expect(selectRetainedSourceNotice(state({ divergedSourceSessionId: "s1", imports }))).toEqual({
      kind: "replaced",
      lastEventAt: "2026-10-08T06:48:00Z",
    });
    expect(selectRetainedSourceNotice(state({ divergedSourceSessionId: "other", imports }))).toBeNull();
  });

  it("gives a component a primitive, stable between renders", () => {
    const s = state({ sessionWindow: failed("missing") as SessionState["sessionWindow"], imports: [imp("x", ["2026-10-08T06:48:00Z"])] });
    expect(selectRetainedSourceLastEventAt(s)).toBe("2026-10-08T06:48:00Z");
    expect(selectRetainedSourceLastEventAt(s)).toBe(selectRetainedSourceLastEventAt(s));
  });
});
