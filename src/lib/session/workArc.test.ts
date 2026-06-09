import { describe, expect, it } from "vitest";
import { buildWorkArc, buildWorkPhases } from "./workArc";

const at = (hour: number, minute: number) =>
  `2026-06-01T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`;

describe("buildWorkPhases", () => {
  it("splits the spine at a real break and labels each phase by its opening request", () => {
    const events = [
      { start: at(1, 0), title: "벡터스토어 확인해줘", actor: "user" },
      { start: at(1, 2), title: "확인했습니다", actor: "assistant" },
      { start: at(1, 5), title: "결정함", actor: "assistant" },
      { start: at(1, 7), title: "더 진행", actor: "assistant" },
      // a 40-minute break opens a new phase
      { start: at(1, 47), title: "이제 Wiki 삭제 기능 만들자", actor: "user" },
      { start: at(1, 49), title: "구현했습니다", actor: "assistant" },
      { start: at(1, 51), title: "테스트 통과", actor: "assistant" },
      { start: at(1, 53), title: "커밋", actor: "assistant" },
    ];
    const phases = buildWorkPhases(events);
    expect(phases).toHaveLength(2);
    expect(phases[0].label).toBe("벡터스토어 확인해줘");
    expect(phases[1].label).toBe("이제 Wiki 삭제 기능 만들자");
    expect(phases[0].eventCount).toBe(4);
    expect(phases[0].startIso).toBe(at(1, 0));
  });

  it("returns [] when the spine has no real break", () => {
    const events = Array.from({ length: 6 }, (_, i) => ({
      start: at(1, i),
      title: `turn ${i}`,
      actor: "assistant",
    }));
    expect(buildWorkPhases(events)).toEqual([]);
  });

  it("returns [] for a too-small session", () => {
    expect(buildWorkPhases([{ start: at(1, 0), title: "혼자", actor: "user" }])).toEqual([]);
  });
});

describe("buildWorkArc", () => {
  it("splits a multi-chunk summary on its ' / ' separators", () => {
    const summary =
      "RAG와 LLM Wiki 구조를 이해함 / 환경변수 설정을 간소화함 / 관리 페이지를 구축함 / 중복 작업을 폐기하기로 결정함";
    expect(buildWorkArc(summary)).toEqual([
      "RAG와 LLM Wiki 구조를 이해함",
      "환경변수 설정을 간소화함",
      "관리 페이지를 구축함",
      "중복 작업을 폐기하기로 결정함",
    ]);
  });

  it("falls back to sentence boundaries when there is no separator", () => {
    const summary = "스키마를 먼저 확정했다. 그다음 임베딩 provider를 구현했다. 마지막으로 검증을 돌렸다.";
    expect(buildWorkArc(summary)).toEqual([
      "스키마를 먼저 확정했다",
      "그다음 임베딩 provider를 구현했다",
      "마지막으로 검증을 돌렸다",
    ]);
  });

  it("returns [] for a single-step summary so the caller shows the paragraph", () => {
    expect(buildWorkArc("간단한 한 문장 요약입니다")).toEqual([]);
    expect(buildWorkArc("")).toEqual([]);
    expect(buildWorkArc(null)).toEqual([]);
  });

  it("caps the number of steps", () => {
    const summary = Array.from({ length: 10 }, (_, i) => `단계 ${i}`).join(" / ");
    expect(buildWorkArc(summary, 4)).toHaveLength(4);
  });

  it("strips leading separators / bullets from each step", () => {
    expect(buildWorkArc("· 첫 단계 / - 둘째 단계")).toEqual(["첫 단계", "둘째 단계"]);
  });
});
