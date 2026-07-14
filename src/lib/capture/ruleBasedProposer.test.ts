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
