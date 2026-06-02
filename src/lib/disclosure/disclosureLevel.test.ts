import { describe, expect, it } from "vitest";
import {
  DEFAULT_DISCLOSURE_LEVEL,
  DISCLOSURE_DESCRIPTIONS,
  DISCLOSURE_LABELS,
  DISCLOSURE_LEVELS,
  disclosurePrivacyRank,
  isRawWithheld,
  projectDisclosure,
  resolveDisclosureLevel,
} from "./disclosureLevel";

const VARIANTS = { raw: "Please rotate the auth token", summary: "토큰 회전 요청", abstract: "인증 관련 작업 요청" };

describe("disclosure metadata", () => {
  it("has a Korean label and description for every level", () => {
    for (const level of DISCLOSURE_LEVELS) {
      expect(DISCLOSURE_LABELS[level]).toBeTruthy();
      expect(DISCLOSURE_DESCRIPTIONS[level]).toBeTruthy();
    }
  });

  it("orders levels from least to most private", () => {
    expect(DISCLOSURE_LEVELS).toEqual(["raw", "summary", "abstract", "hidden"]);
    expect(disclosurePrivacyRank("raw")).toBeLessThan(disclosurePrivacyRank("summary"));
    expect(disclosurePrivacyRank("abstract")).toBeLessThan(disclosurePrivacyRank("hidden"));
  });

  it("treats every non-raw level as withholding the original", () => {
    expect(isRawWithheld("raw")).toBe(false);
    expect(isRawWithheld("summary")).toBe(true);
    expect(isRawWithheld("abstract")).toBe(true);
    expect(isRawWithheld("hidden")).toBe(true);
  });
});

describe("resolveDisclosureLevel", () => {
  it("prefers an override, then the fallback, then the global default", () => {
    expect(resolveDisclosureLevel("abstract", "raw")).toBe("abstract");
    expect(resolveDisclosureLevel(null, "raw")).toBe("raw");
    expect(resolveDisclosureLevel(undefined)).toBe(DEFAULT_DISCLOSURE_LEVEL);
  });
});

describe("projectDisclosure", () => {
  it("shows the raw original at the raw level", () => {
    const projection = projectDisclosure(VARIANTS, "raw");
    expect(projection.text).toBe(VARIANTS.raw);
    expect(projection.isWithheld).toBe(false);
    expect(projection.fallbackUsed).toBe(false);
  });

  it("shows the summary and withholds the original at the summary level", () => {
    const projection = projectDisclosure(VARIANTS, "summary");
    expect(projection.text).toBe(VARIANTS.summary);
    expect(projection.isWithheld).toBe(true);
    expect(projection.fallbackUsed).toBe(false);
  });

  it("shows nothing at the hidden level", () => {
    const projection = projectDisclosure(VARIANTS, "hidden");
    expect(projection.text).toBe("");
    expect(projection.isWithheld).toBe(true);
  });

  it("falls back to a more-private variant when the requested one is missing", () => {
    const projection = projectDisclosure({ raw: "secret", abstract: "요지" }, "summary");
    expect(projection.text).toBe("요지");
    expect(projection.fallbackUsed).toBe(true);
    expect(projection.isWithheld).toBe(true);
  });

  it("NEVER falls back to a less-private variant (privacy-monotonic)", () => {
    // summary requested, only raw available: must not leak raw.
    const projection = projectDisclosure({ raw: "secret prompt text" }, "summary");
    expect(projection.text).toBe("");
    expect(projection.isWithheld).toBe(true);
    expect(projection.fallbackUsed).toBe(false);
  });

  it("at the raw level, falls back to summary when raw is absent and marks it withheld", () => {
    const projection = projectDisclosure({ summary: "요약본" }, "raw");
    expect(projection.text).toBe("요약본");
    expect(projection.isWithheld).toBe(true);
    expect(projection.fallbackUsed).toBe(true);
  });

  it("ignores blank variants", () => {
    const projection = projectDisclosure({ summary: "   ", abstract: "요지" }, "summary");
    expect(projection.text).toBe("요지");
    expect(projection.fallbackUsed).toBe(true);
  });
});
