import { describe, expect, it } from "vitest";
import { lookAlikeHints } from "./lookAlike";

describe("lookAlikeHints", () => {
  it("gives nothing to rows whose titles are unique", () => {
    const hints = lookAlikeHints([
      { id: "a", title: "배포 정리", startedAt: "2026-10-09T05:00:00Z" },
      { id: "b", title: "로그인 수정", startedAt: "2026-10-09T06:00:00Z" },
    ]);
    expect(hints.size).toBe(0);
  });

  it("distinguishes same-titled rows by their start time, on one day", () => {
    const hints = lookAlikeHints([
      { id: "a", title: "Nightly run", startedAt: "2026-10-09T05:02:00Z" },
      { id: "b", title: "  nightly   RUN ", startedAt: "2026-10-09T06:30:00Z" },
      { id: "c", title: "다른 일", startedAt: "2026-10-09T06:31:00Z" },
    ]);
    expect(hints.get("a")).toBe("14:02 시작");
    expect(hints.get("b")).toBe("15:30 시작");
    expect(hints.has("c")).toBe(false);
  });

  it("adds the date when the look-alikes span days, and seconds when a minute collides", () => {
    const days = lookAlikeHints([
      { id: "a", title: "같은 제목", startedAt: "2026-10-08T05:02:00Z" },
      { id: "b", title: "같은 제목", startedAt: "2026-10-09T05:02:00Z" },
    ]);
    expect(days.get("a")).toBe("10월 8일 14:02 시작");
    expect(days.get("b")).toBe("10월 9일 14:02 시작");
    const minute = lookAlikeHints([
      { id: "a", title: "같은 제목", startedAt: "2026-10-09T05:02:05Z" },
      { id: "b", title: "같은 제목", startedAt: "2026-10-09T05:02:40Z" },
    ]);
    expect(minute.get("a")).toBe("14:02:05 시작");
    expect(minute.get("b")).toBe("14:02:40 시작");
  });

  it("writes a start just after midnight as 00, not 24", () => {
    const hints = lookAlikeHints([
      { id: "a", title: "같은 제목", startedAt: "2026-10-08T15:05:00Z" },
      { id: "b", title: "같은 제목", startedAt: "2026-10-08T16:30:00Z" },
    ]);
    expect(hints.get("a")).toBe("00:05 시작");
    expect(hints.get("b")).toBe("01:30 시작");
  });

  it("leaves the date out for a surface that shows it already", () => {
    const hints = lookAlikeHints(
      [
        { id: "a", title: "같은 제목", startedAt: "2026-10-08T05:02:00Z" },
        { id: "b", title: "같은 제목", startedAt: "2026-10-09T05:02:00Z" },
      ],
      { omitDate: true },
    );
    expect(hints.get("a")).toBe("14:02 시작");
    expect(hints.get("b")).toBe("14:02 시작");
  });

  it("falls back to the other known moment without calling it a start", () => {
    const hints = lookAlikeHints([
      { id: "a", title: "같은 제목", at: "2026-10-09T05:02:00Z" },
      { id: "b", title: "같은 제목", startedAt: "2026-10-09T07:00:00Z" },
      { id: "c", title: "같은 제목" },
    ]);
    expect(hints.get("a")).toBe("14:02");
    expect(hints.get("b")).toBe("16:00 시작");
    expect(hints.has("c")).toBe(false);
  });
});
