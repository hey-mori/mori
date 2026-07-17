import { describe, expect, it } from "vitest";
import { detectNoteNature } from "./noteNature";

describe("detectNoteNature", () => {
  it("reads a link-dominant note as 스크랩", () => {
    expect(detectNoteNature("https://example.com/article 참고\n메모")?.nature).toBe("clipping");
    expect(detectNoteNature("https://a.com/x\nhttps://b.com/y 두 링크")?.nature).toBe("clipping");
  });

  it("reads an agenda or a roster as 회의록", () => {
    expect(detectNoteNature("스프린트 회의\n안건: 배포 일정\n액션 아이템 정리")?.nature).toBe(
      "meeting",
    );
    expect(detectNoteNature("주간 미팅\n- 지혜: 백엔드 진행\n- 준영: 프론트 마감\n")?.nature).toBe(
      "meeting",
    );
  });

  it("needs two attendee-shaped lines, so one shopping line is not a roster", () => {
    expect(detectNoteNature("장보기: 계란, 우유. 저녁에 러닝 5km")).toBeNull();
  });

  it("claims NOTHING for ordinary prose instead of guessing", () => {
    // The old floor answered 일지 with 0.4 confidence here. That default was a
    // free guess dressed as a reading, and it would now outrank an engine that
    // actually read the text. No structure, no claim.
    expect(detectNoteNature("친구랑 카페 갔다. 사진 정리했다.")).toBeNull();
    expect(detectNoteNature("점심 먹고 러닝 30분 했다. 오후에 회의.")).toBeNull();
    expect(detectNoteNature("Try the new deploy script. 러닝 5km 했다.")).toBeNull();
  });

  it("no longer mistakes a journal that mentions studying for a study note", () => {
    // The failure the word list could not be tuned out of: a journal says 공부도
    // 했다 with the same word a study note uses. The old test asserted this as a
    // KNOWN mislabel. The same instinct, pointed at a Kotlin article, invented
    // four 활동 records. The words are gone, so the question is not answered
    // wrongly, it is left to the engine that read the document.
    expect(detectNoteNature("오늘 운동을 했다\n공부도 했다")).toBeNull();
    expect(detectNoteNature("리액트 훅 개념을 공부하고 정리했다.")).toBeNull();
    expect(detectNoteNature("이번 주 회고. 잘한 점과 아쉬운 점을 정리했다.")).toBeNull();
  });

  it("claims nothing for a fragment", () => {
    expect(detectNoteNature("메모")).toBeNull();
  });
});
