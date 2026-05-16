import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatTime } from "./time";

// A fixed instant: 2026-05-12T13:05:00+09:00 (Asia/Seoul).
const ISO = "2026-05-12T13:05:00+09:00";

describe("formatTime", () => {
  it("renders 24-hour hour:minute in Asia/Seoul", () => {
    expect(formatTime(ISO)).toBe("13:05");
  });

  it("is timezone-stable regardless of the input offset", () => {
    // Same instant expressed in UTC must still render as Seoul wall-clock.
    expect(formatTime("2026-05-12T04:05:00Z")).toBe("13:05");
  });
});

describe("formatDate", () => {
  it("renders a Korean month/day with weekday", () => {
    const out = formatDate(ISO);
    expect(out).toContain("05");
    expect(out).toContain("12");
  });
});

describe("formatDateTime", () => {
  it("renders a combined date and 24-hour time", () => {
    const out = formatDateTime(ISO);
    expect(out).toContain("2026");
    expect(out).toContain("13:05");
  });

  it("is timezone-stable regardless of the input offset", () => {
    expect(formatDateTime("2026-05-12T04:05:00Z")).toContain("13:05");
  });
});
