import { describe, expect, it } from "vitest";
import { buildWorkbenchDigest, digestTotal, type DigestSession } from "./digest";

const sessions: DigestSession[] = [
  {
    title: "JWT 인증 미들웨어 도입",
    source: "ng-gw",
    events: [
      { title: "인증 책임 위치 합의", summary: "게이트웨이로 모으기로 결정" },
      { title: "토큰 검증 단일화", summary: "" },
    ],
  },
  {
    title: "서킷 브레이커 폴백 정책 정의",
    source: "ng-gw",
    events: [{ title: "업스트림별 서킷 브레이커", summary: "에러율·지연 임계로 회로 차단" }],
  },
  { title: "빈 세션", source: null, events: [] },
];

describe("digestTotal", () => {
  it("sums matched events across sessions", () => {
    expect(digestTotal(sessions)).toBe(3);
  });
});

describe("buildWorkbenchDigest", () => {
  it("skips sessions with no matched events", () => {
    const md = buildWorkbenchDigest(sessions);
    expect(md).not.toContain("빈 세션");
  });

  it("counts only sessions that have events in the heading", () => {
    const md = buildWorkbenchDigest(sessions, { lensLabel: "결정" });
    expect(md.split("\n")[0]).toBe("# 워크벤치 · 결정  (2개 세션, 3건)");
  });

  it("names the lens and search in the heading", () => {
    const md = buildWorkbenchDigest(sessions, { lensLabel: "이슈", needle: "토큰" });
    expect(md.split("\n")[0]).toBe('# 워크벤치 · 이슈 · "토큰"  (2개 세션, 3건)');
  });

  it("omits the lens scope when the lens is 전체", () => {
    const md = buildWorkbenchDigest(sessions, { lensLabel: "전체" });
    expect(md.split("\n")[0]).toBe("# 워크벤치  (2개 세션, 3건)");
  });

  it("renders title: summary bullets, and title-only when summary is empty", () => {
    const md = buildWorkbenchDigest(sessions);
    expect(md).toContain("- 인증 책임 위치 합의: 게이트웨이로 모으기로 결정");
    expect(md).toContain("- 토큰 검증 단일화\n");
  });

  it("groups events under a session heading with its source", () => {
    const md = buildWorkbenchDigest(sessions);
    expect(md).toContain("## JWT 인증 미들웨어 도입 · ng-gw");
  });

  it("ends with a single trailing newline", () => {
    const md = buildWorkbenchDigest(sessions);
    expect(md.endsWith("\n")).toBe(true);
    expect(md.endsWith("\n\n")).toBe(false);
  });
});
