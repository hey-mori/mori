import { describe, expect, it } from "vitest";
import { inferOccurredTime } from "./dateInference";

const now = new Date("2026-07-14T09:00:00.000Z");

describe("inferOccurredTime", () => {
  it("resolves 오늘 to the capture day", () => {
    expect(inferOccurredTime("오늘 운동 러닝 10분", now)).toEqual({
      occurredStart: "2026-07-14",
      confidence: 0.9,
    });
  });

  it("resolves 어제 and 그저께 to prior days", () => {
    expect(inferOccurredTime("어제 공부함", now)?.occurredStart).toBe("2026-07-13");
    expect(inferOccurredTime("그저께 있었던 일", now)?.occurredStart).toBe("2026-07-12");
  });

  it("resolves 내일 and 모레 to future days", () => {
    expect(inferOccurredTime("내일 회의", now)?.occurredStart).toBe("2026-07-15");
    expect(inferOccurredTime("모레 마감", now)?.occurredStart).toBe("2026-07-16");
  });

  it("parses an explicit ISO date with high confidence", () => {
    expect(inferOccurredTime("2026-07-08 커밋 작업", now)).toEqual({
      occurredStart: "2026-07-08",
      confidence: 0.95,
    });
  });

  it("parses a Korean month-day against the capture year", () => {
    expect(inferOccurredTime("7월 8일에 한 일", now)?.occurredStart).toBe("2026-07-08");
    expect(inferOccurredTime("12월 3일", now)?.occurredStart).toBe("2026-12-03");
  });

  it("rejects an out-of-range month-day", () => {
    expect(inferOccurredTime("13월 40일", now)).toBeNull();
  });

  it("returns null when no date word is present, never fabricating one", () => {
    expect(inferOccurredTime("그냥 떠오른 생각", now)).toBeNull();
  });
});
