import { describe, expect, it } from "vitest";
import { expandSemanticTerms } from "./semanticTerms";

describe("expandSemanticTerms", () => {
  it("bridges a Korean term to its English synonyms", () => {
    const out = expandSemanticTerms(["인증"]);
    expect(out[0]).toBe("인증"); // original first
    expect(out).toContain("auth");
    expect(out).toContain("login");
  });

  it("bridges an English term to its Korean synonyms", () => {
    const out = expandSemanticTerms(["routing"]);
    expect(out).toContain("라우팅");
    expect(out).toContain("router");
  });

  it("passes unknown terms through untouched", () => {
    expect(expandSemanticTerms(["foobar"])).toEqual(["foobar"]);
  });

  it("preserves original order and dedupes", () => {
    const out = expandSemanticTerms(["라우팅", "라우팅", "결제"]);
    expect(out.slice(0, 2)).toEqual(["라우팅", "결제"]);
    // No duplicate entries.
    expect(new Set(out).size).toBe(out.length);
  });

  it("caps the number of added aliases", () => {
    const out = expandSemanticTerms(["인증", "라우팅", "결제", "배포"], { maxAliases: 3 });
    const originals = 4;
    expect(out.length).toBe(originals + 3);
  });

  it("does not re-add an alias already present as an original term", () => {
    const out = expandSemanticTerms(["인증", "auth"]);
    expect(out.filter((t) => t === "auth")).toHaveLength(1);
  });
});
