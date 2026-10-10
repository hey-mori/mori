import { describe, expect, it } from "vitest";
import {
  discloseEventForView,
  HIDDEN_REQUEST_TITLE,
  isUserRequestEvent,
  projectEventRequestSummary,
} from "./eventDisclosure";

describe("isUserRequestEvent", () => {
  it("is true only for user-authored events", () => {
    expect(isUserRequestEvent({ actor: "user" })).toBe(true);
    expect(isUserRequestEvent({ actor: "assistant" })).toBe(false);
    expect(isUserRequestEvent({})).toBe(false);
  });
});

describe("projectEventRequestSummary", () => {
  it("passes non-user events through as raw, never withheld", () => {
    const projection = projectEventRequestSummary(
      { actor: "assistant", summary: "도구를 실행했습니다" },
      "hidden",
    );
    expect(projection.text).toBe("도구를 실행했습니다");
    expect(projection.isWithheld).toBe(false);
  });

  it("shows a user request raw at the raw level", () => {
    const projection = projectEventRequestSummary(
      { actor: "user", summary: "로그인 버그 고쳐줘" },
      "raw",
    );
    expect(projection.text).toBe("로그인 버그 고쳐줘");
    expect(projection.isWithheld).toBe(false);
  });

  it("withholds a user request and shows the intent line at the abstract level", () => {
    const projection = projectEventRequestSummary(
      { actor: "user", summary: "로그인 버그 고쳐줘" },
      "abstract",
    );
    expect(projection.text).toBe("사용자가 수정·디버깅을 요청함");
    expect(projection.isWithheld).toBe(true);
  });

  it("renders nothing for a user request at the hidden level", () => {
    const projection = projectEventRequestSummary(
      { actor: "user", summary: "민감한 요청 원문" },
      "hidden",
    );
    expect(projection.text).toBe("");
    expect(projection.isWithheld).toBe(true);
  });

  it("prefers a precomputed override abstract over the deterministic one", () => {
    const projection = projectEventRequestSummary(
      { actor: "user", summary: "로그인 버그 고쳐줘" },
      "abstract",
      { abstract: "사용자가 인증 흐름 개선을 요청함" },
    );
    expect(projection.text).toBe("사용자가 인증 흐름 개선을 요청함");
    expect(projection.isWithheld).toBe(true);
  });

  it("falls back to the deterministic abstract when the override field is blank", () => {
    const projection = projectEventRequestSummary(
      { actor: "user", summary: "로그인 버그 고쳐줘" },
      "abstract",
      { abstract: "   " },
    );
    expect(projection.text).toBe("사용자가 수정·디버깅을 요청함");
  });
});

describe("discloseEventForView", () => {
  const ask = { actor: "user" as const, openedByUser: true, title: "배포 스크립트 고쳐줘", summary: "배포 스크립트 고쳐줘, 토큰 abc123" };
  const paired = { actor: "assistant" as const, openedByUser: true, title: "배포 스크립트 고쳐줘", summary: "경로를 고쳤습니다." };
  const reply = { actor: "assistant" as const, title: "경로를 고쳤습니다", summary: "경로를 고쳤습니다." };
  const tool = { actor: "tool" as const, title: "Bash: npm test", summary: "ok" };

  it("hides a request's title, and a lone request's text, only at 숨김", () => {
    expect(discloseEventForView(ask, "hidden")).toMatchObject({ title: HIDDEN_REQUEST_TITLE, summary: "" });
    expect(discloseEventForView(paired, "hidden")).toMatchObject({ title: HIDDEN_REQUEST_TITLE, summary: "경로를 고쳤습니다." });
    for (const level of ["raw", "summary", "abstract"] as const) {
      expect(discloseEventForView(ask, level)).toBe(ask);
    }
  });

  it("hides a pasted transcript turn titled by its ask, keeping the reply", () => {
    const pasted = { actor: "assistant" as const, requestText: "로그인 고쳐줘", title: "로그인 고쳐줘", summary: "고쳤습니다." };
    expect(discloseEventForView(pasted, "hidden")).toMatchObject({ title: HIDDEN_REQUEST_TITLE, summary: "고쳤습니다." });
    const replyOnly = { actor: "assistant" as const, requestText: "  ", title: "고쳤습니다", summary: "고쳤습니다." };
    expect(discloseEventForView(replyOnly, "hidden")).toBe(replyOnly);
  });

  it("leaves titles the user did not write alone", () => {
    expect(discloseEventForView(reply, "hidden")).toBe(reply);
    expect(discloseEventForView(tool, "hidden")).toBe(tool);
  });
});
