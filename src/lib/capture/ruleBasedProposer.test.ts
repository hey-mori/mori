import { describe, expect, it } from "vitest";
import { proposeRecords } from "./ruleBasedProposer";
import type { CaptureInput } from "./captureTypes";

const textInput = (content: string, occurredHint?: string): CaptureInput => ({
  kind: "text",
  content,
  occurredHint,
});

describe("proposeRecords · pilot schemas", () => {
  it("structures a workout memo, extracting duration and exercise entities", () => {
    const [proposal, ...rest] = proposeRecords(
      textInput("오늘 운동 러닝 10분, 팔굽혀펴기 5개 3세트", "2026-07-14"),
    );
    expect(rest).toHaveLength(0);
    expect(proposal.schemaId).toBe("workout");
    expect(proposal.properties.durationMinutes).toBe(10);
    expect(proposal.occurredStart).toBe("2026-07-14");
    expect(proposal.timeBasis).toBe("user-provided");
    expect(proposal.entityMentions.map((mention) => mention.canonicalName)).toEqual(
      expect.arrayContaining(["러닝", "팔굽혀펴기"]),
    );
  });

  it("flags a new exercise entity but not a known one", () => {
    const fresh = proposeRecords(textInput("스쿼트 20개 3세트"));
    expect(fresh[0].introducesNewEntity).toBe(true);
    const known = proposeRecords(textInput("스쿼트 20개 3세트"), {
      knownEntityNames: new Set(["스쿼트"]),
    });
    expect(known[0].introducesNewEntity).toBe(false);
  });

  it("recognises a study memo and captures the subject", () => {
    const [proposal] = proposeRecords(textInput("영어 표현 10개 복습"));
    expect(proposal.schemaId).toBe("study-session");
    expect(proposal.properties.subject).toBe("영어");
  });

  it("detects a pasted AI dialog as a 질의응답 record", () => {
    const [proposal, ...rest] = proposeRecords(
      textInput("사용자: 메모리 설계는?\nAI: Activity와 Memory를 분리하세요."),
    );
    expect(rest).toHaveLength(0);
    expect(proposal.schemaId).toBe("qa");
    expect(proposal.title).toBe("메모리 설계는?");
    expect(Array.isArray(proposal.properties.turns)).toBe(true);
  });

  it("reads a dialog as Q&A even when it mentions exercise", () => {
    const [proposal] = proposeRecords(
      textInput("사용자: 러닝 10분이면 충분해?\nAI: 목표에 따라 다릅니다."),
    );
    expect(proposal.schemaId).toBe("qa");
  });

  it("records a bare URL as a source document, not a note", () => {
    const [proposal] = proposeRecords({
      kind: "url",
      content: "https://example.com/article",
      url: "https://example.com/article",
    });
    expect(proposal.schemaId).toBe("source-document");
    expect(proposal.properties.url).toBe("https://example.com/article");
    expect(proposal.confidence).toBeGreaterThan(0.75);
  });

  it("detects a URL embedded in text captured as text", () => {
    const [proposal] = proposeRecords(textInput("이거 보기 https://example.com/x 나중에 읽기"));
    expect(proposal.schemaId).toBe("source-document");
  });

  it("falls back to a faithful note with full confidence when nothing matches", () => {
    const [proposal, ...rest] = proposeRecords(textInput("그냥 떠오른 생각 하나"));
    expect(rest).toHaveLength(0);
    expect(proposal.schemaId).toBe("note");
    expect(proposal.confidence).toBe(1);
    expect(proposal.body).toBe("그냥 떠오른 생각 하나");
    expect(proposal.timeBasis).toBe("unknown");
  });

  it("proposes nothing for a bare command · the source is kept, no record", () => {
    // A pasted shell command is machine noise. The pipeline still retains the
    // raw source; the proposer just declines to mint a garbage note record.
    expect(proposeRecords(textInput("npm run build"))).toHaveLength(0);
    expect(proposeRecords(textInput("PS C:\\dev\\mori> git status"))).toHaveLength(0);
    expect(proposeRecords(textInput("src/lib/capture/captureSignal.ts"))).toHaveLength(0);
  });

  it("never fabricates an activity time when no hint and no date word", () => {
    const [proposal] = proposeRecords(textInput("운동 러닝 10분"));
    expect(proposal.occurredStart).toBeUndefined();
    expect(proposal.timeBasis).toBe("unknown");
  });

  it("infers the activity date from a date word, marked ai-inferred", () => {
    const [proposal] = proposeRecords(textInput("오늘 러닝 10분"), {
      now: () => new Date("2026-07-14T09:00:00Z"),
    });
    expect(proposal.occurredStart).toBe("2026-07-14");
    expect(proposal.timeBasis).toBe("ai-inferred");
    expect(proposal.timeConfidence).toBe(0.9);
  });

  it("lets an explicit hint win over an inferred date word", () => {
    const [proposal] = proposeRecords(textInput("어제 러닝 10분", "2026-07-01"));
    expect(proposal.occurredStart).toBe("2026-07-01");
    expect(proposal.timeBasis).toBe("user-provided");
  });

  it("returns nothing for empty content", () => {
    expect(proposeRecords(textInput("   "))).toEqual([]);
  });
});

describe("proposeRecords · segmentation (record-workspace vertical slice)", () => {
  const now = () => new Date("2026-07-15T09:00:00Z");

  it("splits the approved success-scenario input into four typed records", () => {
    const proposals = proposeRecords(
      textInput(
        "어제 MORI 기록 화면을 검토했고 오늘 러닝 1시간 했어. " +
          "Activity와 Memory를 분리해야 한다는 생각도 들었고 다음에는 캘린더 날짜 추정 UX를 개선해야 해.",
      ),
      { now },
    );
    expect(proposals.map((proposal) => proposal.schemaId)).toEqual([
      "activity",
      "workout",
      "insight",
      "task",
    ]);

    const [activity, workout, insight, task] = proposals;
    // 업무: 어제 as an estimate with its evidence word.
    expect(activity.occurredStart).toBe("2026-07-14");
    expect(activity.timeBasis).toBe("ai-inferred");
    expect(activity.dateEvidence).toBe("어제");
    // 운동: 오늘 + "1시간" parsed to 60 minutes.
    expect(workout.occurredStart).toBe("2026-07-15");
    expect(workout.properties.durationMinutes).toBe(60);
    // 인사이트: no date is fabricated.
    expect(insight.occurredStart).toBeUndefined();
    expect(insight.timeBasis).toBe("unknown");
    // 할 일: no due, no activity date (예정일 없음).
    expect(task.occurredStart).toBeUndefined();
    expect(task.properties.done).toBe(false);
  });

  it("keeps a comma-joined workout list as ONE workout (guarded split)", () => {
    const proposals = proposeRecords(textInput("러닝 10분, 팔굽혀펴기 5개 3세트"), { now });
    expect(proposals).toHaveLength(1);
    expect(proposals[0].schemaId).toBe("workout");
  });

  it("merges same-kind unanchored sentences instead of fragmenting them", () => {
    const proposals = proposeRecords(textInput("러닝 45분. 팔굽혀펴기 3세트."), { now });
    expect(proposals).toHaveLength(1);
    expect(proposals[0].schemaId).toBe("workout");
  });

  it("keeps a connective sentence whole when one side cannot stand alone", () => {
    // "밥 먹" alone is a dateless note fragment, so no split happens; the
    // whole sentence still reads as the workout it contains.
    const proposals = proposeRecords(textInput("밥 먹고 러닝 30분 했다"), { now });
    expect(proposals).toHaveLength(1);
    expect(proposals[0].schemaId).toBe("workout");
    expect(proposals[0].properties.durationMinutes).toBe(30);
  });

  it("parses 시간+분 compound durations", () => {
    const [proposal] = proposeRecords(textInput("러닝 1시간 30분"), { now });
    expect(proposal.properties.durationMinutes).toBe(90);
  });

  it("collapses an all-note segmentation back to one faithful note", () => {
    const proposals = proposeRecords(
      textInput("오늘은 날씨가 좋았다. 산책하며 바람을 쐤다."),
      { now },
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0].schemaId).toBe("note");
    expect(proposals[0].body).toBe("오늘은 날씨가 좋았다. 산책하며 바람을 쐤다.");
  });
});
