import { describe, expect, it } from "vitest";
import { hashBody, parseUnderstanding } from "./understandingParse";
import { SUMMARY_MIN_CHARS } from "./understandingTypes";

const KNOWN = ["workout", "task", "activity", "study-session", "knowledge", "insight", "note"];

/** A body long enough to clear the summary floor. */
const long = (seed: string) => seed + "가".repeat(SUMMARY_MIN_CHARS);

const parse = (raw: unknown, body: string) =>
  parseUnderstanding({ raw, body, now: "2026-07-17T09:00:00.000Z", knownSchemaIds: KNOWN });

describe("parseUnderstanding · provenance by construction", () => {
  it("keeps an insight that quotes the document", () => {
    const body = long("코틀린은 null을 허용하지 않아서 NPE 가능성이 줄었습니다. ");
    const out = parse(
      {
        nature: "study",
        insights: [{ text: "널 안전성이 핵심 이점이다", quote: "null을 허용하지 않아서" }],
      },
      body,
    );
    expect(out?.insights).toHaveLength(1);
    expect(body.slice(out!.insights[0].span.start, out!.insights[0].span.end)).toBe(
      "null을 허용하지 않아서",
    );
  });

  it("DROPS an insight whose quote is not in the document", () => {
    // The anti-hallucination mechanic: an output that cannot name a real span
    // does not survive, no matter how plausible it reads.
    const out = parse(
      {
        nature: "study",
        insights: [{ text: "사용자는 코틀린을 싫어한다", quote: "코틀린이 싫다고 적었다" }],
      },
      long("코틀린은 좋은 언어입니다. "),
    );
    expect(out?.insights).toEqual([]);
  });

  it("tolerates reflowed whitespace, which is not a hallucination", () => {
    const body = long("코틀린은 정적\n타입   언어입니다. ");
    const out = parse(
      { nature: "study", insights: [{ text: "정적 타입", quote: "정적 타입 언어입니다" }] },
      body,
    );
    expect(out?.insights).toHaveLength(1);
  });

  it("drops a term the document never uses", () => {
    const body = long("코틀린의 널 안전성. ");
    const out = parse(
      {
        nature: "study",
        terms: [
          { term: "널 안전성", gloss: "null을 허용하지 않는 성질" },
          { term: "모나드", gloss: "함수형 개념" },
        ],
      },
      body,
    );
    expect(out?.terms.map((t) => t.term)).toEqual(["널 안전성"]);
  });
});

describe("parseUnderstanding · 남길 기록 only for a log", () => {
  const items = [{ schemaId: "workout", title: "러닝 30분", quote: "러닝 30분" }];

  it("keeps items for a journal", () => {
    const out = parse({ nature: "journal", items }, long("오늘 러닝 30분 했다. "));
    expect(out?.items).toHaveLength(1);
  });

  it("discards items for a study note, where the true answer is none", () => {
    // The Kotlin article's failure mode: a reading document has no log.
    const out = parse({ nature: "study", items }, long("러닝 30분 이라는 예시. "));
    expect(out?.items).toEqual([]);
  });

  it("never lets a model mint a schema the registry does not know", () => {
    const out = parse(
      { nature: "journal", items: [{ schemaId: "명상", title: "명상", quote: "명상" }] },
      long("오늘 명상 했다. "),
    );
    expect(out?.items).toEqual([]);
  });
});

describe("parseUnderstanding · the length floor is ours to enforce", () => {
  it("drops a summary the model volunteers for a short note", () => {
    // Summarizing a three-line journal strips its stance; length is observable
    // where nature is guessed, so this gate cannot hide a true record.
    const out = parse({ nature: "journal", summary: "오늘 하루" }, "오늘 러닝했다");
    expect(out?.summary).toBeUndefined();
  });

  it("keeps it once the document is long enough to need one", () => {
    const out = parse({ nature: "study", summary: "코틀린 소개" }, long("코틀린. "));
    expect(out?.summary).toBe("코틀린 소개");
  });
});

describe("parseUnderstanding · unusable replies", () => {
  it("returns null without a nature, rather than guessing one", () => {
    expect(parse({ summary: "..." }, long("본문. "))).toBeNull();
    expect(parse({ nature: "농담" }, long("본문. "))).toBeNull();
    expect(parse("not json", long("본문. "))).toBeNull();
  });

  it("clamps confidence and defaults it without inventing certainty", () => {
    expect(parse({ nature: "essay", natureConfidence: 9 }, long("x"))?.natureConfidence).toBe(1);
    expect(parse({ nature: "essay" }, long("x"))?.natureConfidence).toBe(0.5);
  });

  it("survives a reply whose lists are junk, keeping what verified", () => {
    const out = parse(
      { nature: "study", summary: "요약", terms: "nope", insights: [null, 3], items: {} },
      long("본문. "),
    );
    expect(out?.summary).toBe("요약");
    expect(out?.terms).toEqual([]);
    expect(out?.insights).toEqual([]);
  });
});

describe("hashBody", () => {
  it("changes when the body does, so a stale reading is detectable", () => {
    expect(hashBody("가나다")).toBe(hashBody("가나다"));
    expect(hashBody("가나다")).not.toBe(hashBody("가나라"));
  });
});
