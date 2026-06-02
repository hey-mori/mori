import { describe, expect, it } from "vitest";
import {
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
