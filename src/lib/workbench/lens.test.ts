import { describe, expect, it } from "vitest";
import { emptyFilterLabel, filterEvents, lensMatches, type LensEvent } from "./lens";

const events: LensEvent[] = [
  { kind: "aiConversation", title: "인증 책임 위치 논의", summary: "토큰 검증 중복", actor: "AI" },
  { kind: "issue", title: "JWKS 키 회전", summary: "회전 매뉴 없음", actor: "이슈" },
  { kind: "decision", title: "게이트웨이 검증으로 합의", summary: "업스트림 신뢰", actor: "결정" },
  { kind: "fileCode", title: "verifyToken.ts", summary: "검증 로직", actor: "코드" },
  { kind: "artifact", title: "auth-flow.md", summary: "흐름 문서", actor: "산출물" },
  { kind: "documentNote", title: "임계값 메모", actor: "노트", summary: "" },
];

describe("lensMatches", () => {
  it("passes everything for the all lens", () => {
    expect(events.every((e) => lensMatches(e.kind, "all"))).toBe(true);
  });

  it("matches only the issue kind", () => {
    expect(events.filter((e) => lensMatches(e.kind, "issue")).map((e) => e.kind)).toEqual(["issue"]);
  });

  it("matches only the decision kind", () => {
    expect(events.filter((e) => lensMatches(e.kind, "decision")).map((e) => e.kind)).toEqual([
      "decision",
    ]);
  });

  it("folds fileCode and artifact into the code lens", () => {
    expect(events.filter((e) => lensMatches(e.kind, "code")).map((e) => e.kind)).toEqual([
      "fileCode",
      "artifact",
    ]);
  });
});

describe("filterEvents", () => {
  it("returns the input untouched for all + empty needle", () => {
    expect(filterEvents(events, "", "all")).toHaveLength(events.length);
  });

  it("applies the lens alone", () => {
    expect(filterEvents(events, "", "decision")).toHaveLength(1);
  });

  it("applies the needle alone over title, summary and actor", () => {
    expect(filterEvents(events, "검증", "all").map((e) => e.kind)).toEqual([
      "aiConversation",
      "decision",
      "fileCode",
    ]);
  });

  it("combines lens and needle (both must pass)", () => {
    expect(filterEvents(events, "검증", "code")).toHaveLength(1);
    expect(filterEvents(events, "검증", "issue")).toHaveLength(0);
  });

  it("is case-insensitive on the needle", () => {
    expect(filterEvents(events, "verifytoken", "all")).toHaveLength(1);
  });
});

describe("emptyFilterLabel", () => {
  it("names the lens type when only a lens is active", () => {
    expect(emptyFilterLabel("", "issue")).toBe("이슈 항목이 없습니다");
    expect(emptyFilterLabel("", "code")).toBe("코드 항목이 없습니다");
  });

  it("uses the combined wording when a needle is also set", () => {
    expect(emptyFilterLabel("토큰", "issue")).toBe("이 필터에 맞는 항목이 없습니다");
  });

  it("uses the generic wording for the all lens", () => {
    expect(emptyFilterLabel("토큰", "all")).toBe("일치하는 항목이 없습니다");
  });
});
