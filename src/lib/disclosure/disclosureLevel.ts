/**
 * Per-element disclosure level: the projection layer for Mori's
 * "store everything, show by setting" direction. Storage always retains
 * the full element under its retention policy; a disclosure level only
 * decides how much of it a surface renders. Changing a level is a
 * non-destructive view change, never an edit to the stored data.
 *
 * Pure module: types + Korean labels + a projection function. No IO, no
 * storage, no UI. See
 * `docs/design/local-llm-understanding-and-live-follow.md` (slice 4).
 *
 * Levels in privacy order (least to most private):
 *   raw      original text
 *   summary  condensed, original withheld
 *   abstract intent only ("requested X"), original withheld
 *   hidden   nothing rendered (still stored, still audited)
 */
export type DisclosureLevel = "raw" | "summary" | "abstract" | "hidden";

/** Levels ordered from least private (raw) to most private (hidden). */
export const DISCLOSURE_LEVELS: readonly DisclosureLevel[] = [
  "raw",
  "summary",
  "abstract",
  "hidden",
];

export const DISCLOSURE_LABELS: Record<DisclosureLevel, string> = {
  raw: "원문",
  summary: "요약",
  abstract: "요지",
  hidden: "숨김",
};

export const DISCLOSURE_DESCRIPTIONS: Record<DisclosureLevel, string> = {
  raw: "가져온 원문을 그대로 표시합니다.",
  summary: "핵심만 요약해 표시하고 원문은 감춥니다.",
  abstract: "무엇을 요청하거나 수행했는지 요지만 표시하고 원문은 감춥니다.",
  hidden: "화면에 표시하지 않습니다. 데이터는 그대로 저장됩니다.",
};

/**
 * Default when no per-element override and no project default is set.
 * Summary-leaning: it matches today's behaviour (surfaces already show
 * condensed event text, not raw transcripts) and never leaks raw text by
 * default.
 */
export const DEFAULT_DISCLOSURE_LEVEL: DisclosureLevel = "summary";

/** Privacy rank: higher means more private. */
export function disclosurePrivacyRank(level: DisclosureLevel): number {
  return DISCLOSURE_LEVELS.indexOf(level);
}

/** True when the level hides the raw original from view. */
export function isRawWithheld(level: DisclosureLevel): boolean {
  return level !== "raw";
}

/**
 * Resolve the effective level: a per-element override wins over the
 * project default, which wins over the global default.
 */
export function resolveDisclosureLevel(
  override: DisclosureLevel | null | undefined,
  fallback: DisclosureLevel = DEFAULT_DISCLOSURE_LEVEL,
): DisclosureLevel {
  return override ?? fallback;
}

/** The text variants an element can offer at each non-hidden level. */
export type DisclosureVariants = {
  raw?: string;
  summary?: string;
  abstract?: string;
};

export type DisclosureProjection = {
  level: DisclosureLevel;
  /** The text to render. Empty when hidden or no eligible variant exists. */
  text: string;
  /** True when the rendered text is not the raw original (privacy applied). */
  isWithheld: boolean;
  /**
   * True when the requested level had no variant and a more-private one
   * was substituted. A missing variant NEVER falls back to a less-private
   * one, so a projection can never leak more than the requested level.
   */
  fallbackUsed: boolean;
};

/**
 * Project an element's variants at a disclosure level. The fallback is
 * privacy-monotonic: if the requested level's variant is absent, the
 * next more-private available variant is used (never a less-private one),
 * and if none exists the text is empty. This guarantees that a missing
 * summary or abstract can never expose the raw original.
 */
export function projectDisclosure(
  variants: DisclosureVariants,
  level: DisclosureLevel,
): DisclosureProjection {
  if (level === "hidden") {
    return { level, text: "", isWithheld: true, fallbackUsed: false };
  }

  // Candidate keys from the requested level toward more-private variants.
  const order: Array<keyof DisclosureVariants> =
    level === "raw"
      ? ["raw", "summary", "abstract"]
      : level === "summary"
        ? ["summary", "abstract"]
        : ["abstract"];

  let chosenKey: keyof DisclosureVariants | null = null;
  let text = "";
  for (const key of order) {
    const value = variants[key];
    if (typeof value === "string" && value.trim().length > 0) {
      chosenKey = key;
      text = value;
      break;
    }
  }

  // `raw` | `summary` | `abstract` map 1:1 onto the variant keys.
  const requestedKey = level as keyof DisclosureVariants;
  return {
    level,
    text,
    isWithheld: level !== "raw" || chosenKey !== "raw",
    fallbackUsed: chosenKey !== null && chosenKey !== requestedKey,
  };
}
