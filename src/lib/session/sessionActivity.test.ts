import { describe, expect, it } from "vitest";
import { sessionLastActiveAt } from "./sessionActivity";

describe("when a session was last active", () => {
  it("is the last write of a conversation that began long ago", () => {
    expect(
      sessionLastActiveAt({ startedAt: "2026-09-16T06:15:31Z", savedAt: "2026-10-09T03:37:14Z" }),
    ).toBe("2026-10-09T03:37:14Z");
  });

  it("is the start when nothing was written after it", () => {
    expect(
      sessionLastActiveAt({ startedAt: "2026-09-09T04:01:23Z", savedAt: "2026-09-09T04:01:18Z" }),
    ).toBe("2026-09-09T04:01:23Z");
  });

  it("falls back to whichever time is readable", () => {
    expect(sessionLastActiveAt({ savedAt: "2026-10-01T00:00:00Z" })).toBe("2026-10-01T00:00:00Z");
    expect(sessionLastActiveAt({ startedAt: "2026-10-01T00:00:00Z", savedAt: "" })).toBe("2026-10-01T00:00:00Z");
    expect(sessionLastActiveAt({ startedAt: "garbled", savedAt: "2026-10-02T00:00:00Z" })).toBe("2026-10-02T00:00:00Z");
    expect(sessionLastActiveAt({})).toBe("");
  });
});
