import { describe, expect, it } from "vitest";
import { detectNoteNature, natureFits } from "./noteNature";

describe("detectNoteNature", () => {
  it("reads a link-dominant note as a clipping", () => {
    expect(detectNoteNature("https://example.com/article 참고\n메모").nature).toBe("clipping");
    expect(
      detectNoteNature("https://a.com/x\nhttps://b.com/y 두 링크").nature,
    ).toBe("clipping");
  });

  it("reads attendee/agenda markers as a meeting", () => {
    expect(detectNoteNature("스프린트 회의\n안건: 배포 일정\n액션 아이템 정리").nature).toBe("meeting");
    expect(detectNoteNature("주간 미팅\n- 지혜: 백엔드 진행\n- 준영: 프론트 마감\n").nature).toBe("meeting");
  });

  it("does not claim ordinary prose that merely contains an overloaded word", () => {
    // Each of these used to be dragged out of 일지 by one overloaded token:
    // 정리했 (방/사진 정리), a short "장보기:" line posing as an attendee roster,
    // and `try` matching case-insensitively.
    expect(detectNoteNature("친구랑 카페 갔다. 사진 정리했다.").nature).toBe("journal");
    expect(detectNoteNature("장보기: 계란, 우유. 저녁에 러닝 5km").nature).toBe("journal");
    expect(detectNoteNature("Try the new deploy script. 러닝 5km 했다.").nature).toBe("journal");
  });

  it("still mis-labels a journal that genuinely mentions studying, which is why a detected nature may not hide anything", () => {
    // Documents a KNOWN limit rather than pretending it is fixed. 공부 really is
    // a study word, so a keyword floor cannot tell "a journal that mentions
    // studying" from "a study note"; only the LLM engine (v5 §3) can. The label
    // is one click to correct, and NoteEditorPane refuses to fold on a detected
    // nature, so being wrong here costs a glance instead of a lost record.
    expect(detectNoteNature("오늘 운동을 했다\n공부도 했다").nature).toBe("study");
  });

  it("reads retro / study markers", () => {
    expect(detectNoteNature("이번 주 회고. 잘한 점과 아쉬운 점을 정리했다.").nature).toBe("retro");
    expect(detectNoteNature("리액트 훅 개념을 공부하고 정리했다.").nature).toBe("study");
  });

  it("defaults ambiguous prose to a journal (essay is a manual correction)", () => {
    // Essay vs a prose journal is not reliably rule-separable, so the floor
    // does not auto-claim essay; the chip lets the user set it by hand.
    const prose =
      "요즘 도구를 만들면서 느낀 것은, 좋은 도구는 사용자가 그 존재를 잊게 만든다는 점이다. " +
      "복잡함을 감추되 통제를 빼앗지 않아야 한다.";
    expect(detectNoteNature(prose).nature).toBe("journal");
    expect(detectNoteNature("점심 먹고 러닝 30분 했다. 오후에 회의.").nature).toBe("journal");
  });
});

describe("natureFits", () => {
  it("a journal fits every kind; an essay fits only insight", () => {
    expect(natureFits("journal", "workout")).toBe(true);
    expect(natureFits("essay", "task")).toBe(false);
    expect(natureFits("essay", "insight")).toBe(true);
    expect(natureFits("meeting", "decision")).toBe(true);
    expect(natureFits("meeting", "workout")).toBe(false);
  });
});
