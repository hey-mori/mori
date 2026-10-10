import { describe, expect, it } from "vitest";
import { hoverEventSummary, inspectorEventSummary, readableEventSummary, readableEventTitle, sameText } from "./timelineCards";

const ev = (title: string, summary: string) => ({ title, summary }) as never;

describe("an event as a person reads it", () => {
  it("names an injected notice, and older 세션 이어가기 titles from their summary without the command name", () => {
    expect(readableEventTitle(ev("<command-name>/model</command-name>", ""))).toBe("/model 명령");
    expect(readableEventTitle(ev("세션 이어가기", "<command-name>/deploy-acme</command-name>"))).toBe("명령");
    expect(readableEventTitle(ev("세션 이어가기", "This session is being continued from a previous conversation."))).toBe("세션 이어가기");
  });

  it("never falls back to raw tags", () => {
    expect(readableEventTitle(ev("<bash-stdout></bash-stdout>", ""))).toBe("에이전트 안내");
  });

  it("hides a summary that repeats its title, or completes a title cut short, and keeps one that adds", () => {
    expect(sameText("CI 실행 기록을 수집했습니다.", "CI 실행 기록을 수집했습니다.")).toBe(true);
    expect(sameText("CI 실행 기록 100건의 데이터를 수집했고 분석합니다", "CI 실행 기록 100건의 데이터를 수집했고 …")).toBe(true);
    expect(sameText("A longer title that is complete, then more detail here", "A longer title that is complete")).toBe(false);
    expect(readableEventSummary(ev("t", "<local-command-stdout>x</local-command-stdout>"), "t")).toBe("");
  });
});

describe("the inspector's summary", () => {
  const title = "CI 실행 기록 100건의 데이터를 수집했고 …";
  const full = "CI 실행 기록 100건의 데이터를 수집했고 대기시간과 실행시간을 나눠 분석합니다";

  it("is left out when it is exactly the heading", () => {
    expect(inspectorEventSummary(ev("같은 문장입니다.", "같은 문장입니다."), "같은 문장입니다.")).toBe("");
    expect(inspectorEventSummary(ev("같은 문장…", "같은 문장"), "같은 문장…")).toBe("");
  });

  it("keeps the full text behind a heading cut short, which the hover may drop", () => {
    expect(readableEventSummary(ev(title, full), title)).toBe("");
    expect(inspectorEventSummary(ev(title, full), title)).toBe(full);
  });
});

describe("the hover preview of a user's request", () => {
  // As imports build a lone ask: the title is the start of the same text.
  const ask = { title: "배포 스크립트 고쳐줘. 서버는 prod-7", summary: "배포 스크립트 고쳐줘. 서버는 prod-7 이고 비밀 토큰은 abc123 입니다.", actor: "user" } as never;
  const reply = { title: "고쳤습니다", summary: "배포 스크립트의 경로를 고쳤습니다.", actor: "assistant" } as never;

  it("shows the original only at 원문", () => {
    expect(hoverEventSummary(ask, "배포 스크립트 고쳐줘. 서버는 prod-7", "raw")).toContain("abc123");
  });

  it("never shows the original when the level withholds it", () => {
    for (const level of ["summary", "abstract", "hidden"] as const) {
      expect(hoverEventSummary(ask, "배포 스크립트 고쳐줘. 서버는 prod-7", level)).not.toContain("abc123");
    }
    expect(hoverEventSummary(ask, "배포 스크립트 고쳐줘. 서버는 prod-7", "hidden")).toBe("");
  });

  it("shows nothing for an injected notice that arrived as a user message", () => {
    const notices = [
      "<command-name>/clear</command-name>",
      "[Request interrupted by user for tool use]",
      "This session is being continued from a previous conversation that ran out of context.",
    ];
    for (const summary of notices) {
      for (const level of ["raw", "summary", "abstract"] as const) {
        expect(hoverEventSummary({ title: "명령", summary, actor: "user" } as never, "명령", level)).toBe("");
      }
    }
  });

  it("leaves other events as read", () => {
    expect(hoverEventSummary(reply, "고쳤습니다", "hidden")).toBe("배포 스크립트의 경로를 고쳤습니다.");
  });
});
