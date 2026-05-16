import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCAL_PROFILE,
  getProfileInitials,
  normalizeDisplayName,
  parseLocalProfile,
  serializeLocalProfile,
} from "./localProfile";

describe("normalizeDisplayName", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeDisplayName("  Kim Mori  ")).toBe("Kim Mori");
  });

  it("caps the length at 60 characters", () => {
    expect(normalizeDisplayName("x".repeat(100))).toHaveLength(60);
  });
});

describe("getProfileInitials", () => {
  it("takes the first letter of the first two words", () => {
    expect(getProfileInitials("Kim Mori")).toBe("KM");
  });

  it("takes the first two characters of a single word", () => {
    expect(getProfileInitials("mori")).toBe("MO");
  });

  it("returns a neutral dot for an empty name", () => {
    expect(getProfileInitials("   ")).toBe("·");
  });
});

describe("parseLocalProfile", () => {
  it("returns the default for null or empty input", () => {
    expect(parseLocalProfile(null)).toEqual(DEFAULT_LOCAL_PROFILE);
    expect(parseLocalProfile("")).toEqual(DEFAULT_LOCAL_PROFILE);
  });

  it("returns the default for malformed JSON", () => {
    expect(parseLocalProfile("{not json")).toEqual(DEFAULT_LOCAL_PROFILE);
  });

  it("falls back to the default on a schema-version mismatch", () => {
    expect(
      parseLocalProfile(JSON.stringify({ schemaVersion: 99, displayName: "X" })),
    ).toEqual(DEFAULT_LOCAL_PROFILE);
  });

  it("round-trips a valid profile and normalizes the name", () => {
    const stored = serializeLocalProfile({
      schemaVersion: 1,
      displayName: "  Jamie Park  ",
    });
    expect(parseLocalProfile(stored).displayName).toBe("Jamie Park");
  });

  it("falls back to the default name when the stored name is blank", () => {
    expect(
      parseLocalProfile(JSON.stringify({ schemaVersion: 1, displayName: "   " }))
        .displayName,
    ).toBe(DEFAULT_LOCAL_PROFILE.displayName);
  });
});
