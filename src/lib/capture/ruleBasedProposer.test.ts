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

  it("never fabricates an activity time when the user gave no hint", () => {
    const [proposal] = proposeRecords(textInput("운동 러닝 10분"));
    expect(proposal.occurredStart).toBeUndefined();
    expect(proposal.timeBasis).toBe("unknown");
  });

  it("returns nothing for empty content", () => {
    expect(proposeRecords(textInput("   "))).toEqual([]);
  });
});
