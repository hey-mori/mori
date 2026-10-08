import { describe, expect, it } from "vitest";
import { claudeLastActivity } from "./workSessions";

describe("claudeLastActivity", () => {
  it("uses the transcript's modification time, not the first message, as the last activity", () => {
    expect(
      claudeLastActivity({ startedAt: "2026-10-07T13:48:42.613Z", modifiedAt: "2026-10-07T17:12:05Z" }),
    ).toBe("2026-10-07T17:12:05Z");
  });

  it("falls back to the start when the file time is missing, unparseable, or earlier than the start", () => {
    expect(claudeLastActivity({ startedAt: "2026-10-07T13:48:42Z" })).toBe("2026-10-07T13:48:42Z");
    expect(claudeLastActivity({ startedAt: "2026-10-07T13:48:42Z", modifiedAt: "not a time" })).toBe(
      "2026-10-07T13:48:42Z",
    );
    expect(
      claudeLastActivity({ startedAt: "2026-10-07T13:48:42Z", modifiedAt: "2026-10-07T13:00:00Z" }),
    ).toBe("2026-10-07T13:48:42Z");
  });
});

describe("explicit UTC timestamps", () => {
  it("name one instant whether read against UTC or KST", () => {
    // What the Rust reader now writes for a file time, and the same instant in KST.
    expect(Date.parse("2026-09-30T04:22:13Z")).toBe(Date.parse("2026-09-30T13:22:13+09:00"));
  });

  it("would not if the zone were missing: that form is read as local time", () => {
    // The pre-fix shape. ECMAScript treats an offset-less date-time as local, so
    // its meaning depends on the machine's zone; with Z it does not.
    const zoneless = Date.parse("2026-09-30T04:22:13");
    const explicit = Date.parse("2026-09-30T04:22:13Z");
    expect(zoneless - explicit).toBe(new Date(zoneless).getTimezoneOffset() * 60_000);
  });
});
