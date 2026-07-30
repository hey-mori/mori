import { describe, expect, it } from "vitest";
import { classifySelection, countWords, selectionKindLabel } from "./selectionKind";

describe("countWords", () => {
  it("counts whitespace-delimited tokens for Latin script", () => {
    expect(countWords("trace the request flow")).toBe(4);
    expect(countWords("  spaced   out  ")).toBe(2);
  });

  it("does not collapse a spaceless CJK sentence into one word", () => {
    // A pure `split(" ")` would return 1 here and classify a whole sentence as
    // a word, which is the bug this estimator exists to prevent.
    expect(countWords("这是一个完整的句子")).toBeGreaterThan(1);
  });

  it("takes the larger of the spaced and dense estimates for Korean", () => {
    // Korean is spaced AND dense; undercounting either way misclassifies.
    expect(countWords("기존 구조를 먼저 확인해줘")).toBeGreaterThanOrEqual(4);
  });

  it("returns zero for empty input", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
  });
});

describe("classifySelection", () => {
  it("calls a double-clicked word a word", () => {
    expect(classifySelection("throttle")).toBe("word");
    expect(classifySelection("  idempotent  ")).toBe("word");
  });

  it("calls a short unterminated span a phrase", () => {
    expect(classifySelection("rate limiting")).toBe("phrase");
    expect(classifySelection("work your way through")).toBe("phrase");
  });

  it("calls a terminated clause a sentence", () => {
    expect(classifySelection("Please check the existing structure first.")).toBe("sentence");
  });

  it("calls a long unterminated clause a sentence rather than a phrase", () => {
    expect(
      classifySelection("we should probably trace the request flow before touching the handler"),
    ).toBe("sentence");
  });

  it("calls two or more sentences a paragraph", () => {
    expect(classifySelection("First this. Then that.")).toBe("paragraph");
    expect(classifySelection("One. Two. Three.")).toBe("paragraph");
  });

  it("treats an explicit blank-line break as a paragraph", () => {
    expect(classifySelection("A line\n\nAnother line")).toBe("paragraph");
  });

  it("treats sheer length as a paragraph even with no terminator", () => {
    expect(classifySelection("word ".repeat(80))).toBe("paragraph");
  });

  it("is stable across repeated calls with the same input", () => {
    // A `/g` regex shared between `test` calls carries `lastIndex` and would
    // alternate between answers; this pins that it does not.
    const text = "Please check the existing structure first.";
    const answers = new Set([
      classifySelection(text),
      classifySelection(text),
      classifySelection(text),
    ]);
    expect(answers.size).toBe(1);
  });

  it("never throws on empty input", () => {
    expect(classifySelection("")).toBe("word");
  });
});

describe("selectionKindLabel", () => {
  it("is Korean, per the UI copy rule", () => {
    expect(selectionKindLabel("word")).toBe("단어");
    expect(selectionKindLabel("phrase")).toBe("구문");
    expect(selectionKindLabel("sentence")).toBe("문장");
    expect(selectionKindLabel("paragraph")).toBe("문단");
  });
});
