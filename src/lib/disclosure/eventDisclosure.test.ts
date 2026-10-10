import { describe, expect, it } from "vitest";
import {
  discloseEventForView,
  HIDDEN_REQUEST_TITLE,
  HIDDEN_SESSION_TITLE,
  recordTitleForView,
  sessionTitleForView,
  requestTitleForView,
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

  it("hides a request's title, and a lone request's text, at 숨김", () => {
    expect(discloseEventForView(ask, "hidden")).toMatchObject({ title: HIDDEN_REQUEST_TITLE, summary: "" });
    expect(discloseEventForView(paired, "hidden")).toMatchObject({ title: HIDDEN_REQUEST_TITLE, summary: "경로를 고쳤습니다." });
    expect(discloseEventForView(ask, "raw")).toBe(ask);
  });

  it("at 요지 reads a request as its intent line, keeping the agent's reply", () => {
    expect(discloseEventForView(ask, "abstract")).toMatchObject({
      title: "사용자가 수정·디버깅을 요청함",
      summary: "사용자가 수정·디버깅을 요청함",
    });
    expect(discloseEventForView(paired, "abstract")).toMatchObject({
      title: "사용자가 수정·디버깅을 요청함",
      summary: "경로를 고쳤습니다.",
    });
  });

  it("at 요약 never shows more of a request than its first sentence, cut shorter than a raw title", () => {
    const long = {
      actor: "user" as const,
      title: "로그인 화면의 오류 메시지를 고쳐줘. 토큰 abc123을 쓰는 테스트 계정으로 재현돼.",
      summary: "로그인 화면의 오류 메시지를 고쳐줘. 토큰 abc123을 쓰는 테스트 계정으로 재현돼.",
    };
    const shown = discloseEventForView(long, "summary");
    expect(shown.title).toBe("로그인 화면의 오류 메시지를 고쳐줘.");
    expect(shown.summary).not.toContain("abc123");
    const runOn = { actor: "user" as const, title: "가".repeat(90), summary: "가".repeat(90) };
    expect(discloseEventForView(runOn, "summary").title.length).toBeLessThanOrEqual(61);
  });

  it("hides a pasted transcript turn titled by its ask, keeping the reply", () => {
    const pasted = { actor: "assistant" as const, requestText: "로그인 고쳐줘", responseText: "고쳤습니다.", title: "로그인 고쳐줘", summary: "고쳤습니다." };
    expect(discloseEventForView(pasted, "hidden")).toMatchObject({ title: HIDDEN_REQUEST_TITLE, summary: "고쳤습니다." });
    const replyOnly = { actor: "assistant" as const, requestText: "  ", title: "고쳤습니다", summary: "고쳤습니다." };
    expect(discloseEventForView(replyOnly, "hidden")).toBe(replyOnly);
  });

  it("blanks the summary of an unanswered pasted ask, which is the ask itself", () => {
    const unanswered = { actor: "assistant" as const, requestText: "배포 고쳐줘", title: "배포 고쳐줘", summary: "배포 고쳐줘" };
    expect(discloseEventForView(unanswered, "hidden")).toMatchObject({ title: HIDDEN_REQUEST_TITLE, summary: "" });
  });

  it("reads an agent notice imported as a user turn as its label below 원문, without its text", () => {
    const notice = { actor: "user" as const, title: "세션 이어가기", summary: "Caveat: The messages below were generated by the user while running local commands. <command-args>secret</command-args>" };
    const caveat = { actor: "user" as const, title: "Caveat: The messages below were generated by the user while running local commands.", summary: "<command-args>secret</command-args>" };
    for (const level of ["summary", "abstract"] as const) {
      expect(discloseEventForView(notice, level)).toMatchObject({ title: "로컬 명령 안내", summary: "" });
      expect(discloseEventForView(caveat, level).summary).toBe("");
      expect(discloseEventForView(caveat, level).title).not.toContain("secret");
    }
    // A real request the user titled "세션 이어가기" is still a request.
    const renamed = { actor: "user" as const, title: "세션 이어가기", summary: "배포 스크립트 고쳐줘" };
    expect(discloseEventForView(renamed, "abstract").summary).toBe("사용자가 수정·디버깅을 요청함");
  });

  it("leaves replies and tool runs alone at every level", () => {
    const replyOnly = { actor: "assistant" as const, title: "경로를 고쳤습니다", summary: "경로를 고쳤습니다." };
    const toolRun = { actor: "tool" as const, title: "Bash: npm test", summary: "ok" };
    for (const level of ["summary", "abstract", "hidden"] as const) {
      expect(discloseEventForView(replyOnly, level)).toBe(replyOnly);
      expect(discloseEventForView(toolRun, level)).toBe(toolRun);
    }
  });

  it("reads a live request title at each level", () => {
    expect(requestTitleForView("배포 스크립트 고쳐줘. 토큰은 abc123.", "raw")).toBe("배포 스크립트 고쳐줘. 토큰은 abc123.");
    expect(requestTitleForView("배포 스크립트 고쳐줘. 토큰은 abc123.", "summary")).toBe("배포 스크립트 고쳐줘.");
    expect(requestTitleForView("배포 스크립트 고쳐줘. 토큰은 abc123.", "abstract")).toBe("사용자가 수정·디버깅을 요청함");
    expect(requestTitleForView("배포 스크립트 고쳐줘.", "hidden")).toBe(HIDDEN_REQUEST_TITLE);
  });

  it("leaves titles the user did not write alone", () => {
    expect(discloseEventForView(reply, "hidden")).toBe(reply);
    expect(discloseEventForView(tool, "hidden")).toBe(tool);
  });
});

describe("sessionTitleForView", () => {
  it("follows the level only for a title known to be the user's first request", () => {
    const ask = "배포 스크립트 고쳐줘. 토큰은 abc123.";
    expect(sessionTitleForView(ask, true, "raw")).toBe(ask);
    expect(sessionTitleForView(ask, true, "summary")).toBe("배포 스크립트 고쳐줘.");
    expect(sessionTitleForView(ask, true, "abstract")).toBe("사용자가 수정·디버깅을 요청함");
    expect(sessionTitleForView(ask, true, "hidden")).toBe(HIDDEN_SESSION_TITLE);
    for (const level of ["summary", "abstract", "hidden"] as const) {
      expect(sessionTitleForView("Fix calendar time mismatch", false, level)).toBe("Fix calendar time mismatch");
      expect(sessionTitleForView("Fix calendar time mismatch", undefined, level)).toBe("Fix calendar time mismatch");
    }
  });

  it("reads a session record by its property", () => {
    expect(recordTitleForView({ title: "배포 고쳐줘", properties: { titleFromRequest: true } }, "hidden")).toBe(HIDDEN_SESSION_TITLE);
    expect(recordTitleForView({ title: "노트", properties: {} }, "hidden")).toBe("노트");
  });
});

