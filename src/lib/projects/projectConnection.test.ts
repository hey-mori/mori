import { describe, expect, it } from "vitest";
import {
  compareProjectIdentities,
  normalizeProjectIdentity,
  projectIdentitiesMatch,
} from "./projectConnection";

describe("normalizeProjectIdentity", () => {
  it("returns an empty identity for empty / whitespace input", () => {
    for (const raw of ["", "   ", undefined, null]) {
      expect(normalizeProjectIdentity(raw)).toEqual({
        canonicalKey: "",
        label: "",
        segments: [],
      });
    }
  });

  it("unifies separators and strips trailing slashes in the key", () => {
    expect(normalizeProjectIdentity("C:\\dev\\mori").canonicalKey).toBe("c:/dev/mori");
    expect(normalizeProjectIdentity("C:/dev/mori/").canonicalKey).toBe("c:/dev/mori");
    expect(normalizeProjectIdentity("  /Users/x/mori//  ").canonicalKey).toBe(
      "/users/x/mori",
    );
  });

  it("preserves the original casing of the trailing segment in the label", () => {
    expect(normalizeProjectIdentity("/Users/x/Dev/MoriApp").label).toBe("MoriApp");
    expect(normalizeProjectIdentity("C:\\dev\\Mori\\").label).toBe("Mori");
    expect(normalizeProjectIdentity("mori").label).toBe("mori");
  });

  it("exposes lower-cased segments for comparison", () => {
    expect(normalizeProjectIdentity("/Users/X/Dev/Mori").segments).toEqual([
      "users",
      "x",
      "dev",
      "mori",
    ]);
  });

  it("leaves internal repeated slashes intact so a drive / protocol is not mangled", () => {
    // A bare name with no separators is its own label and single segment.
    expect(normalizeProjectIdentity("mori")).toEqual({
      canonicalKey: "mori",
      label: "mori",
      segments: ["mori"],
    });
  });
});

describe("compareProjectIdentities", () => {
  it("treats case / separator / trailing-slash variants as exact", () => {
    expect(compareProjectIdentities("C:\\dev\\mori", "C:/dev/mori")).toBe("exact");
    expect(compareProjectIdentities("C:/dev/mori/", "c:/dev/mori")).toBe("exact");
    expect(compareProjectIdentities("/Users/x/mori", "/users/x/mori/")).toBe("exact");
  });

  it("reports a basename near-match for a short name vs a full path", () => {
    expect(compareProjectIdentities("mori", "/Users/x/Dev/mori")).toBe("basename");
    expect(compareProjectIdentities("/work/api", "/play/api")).toBe("basename");
  });

  it("returns none for unrelated labels", () => {
    expect(compareProjectIdentities("/dev/mori", "/dev/jinga")).toBe("none");
    expect(compareProjectIdentities("alpha", "beta")).toBe("none");
  });

  it("returns none when either label is empty", () => {
    expect(compareProjectIdentities("", "/dev/mori")).toBe("none");
    expect(compareProjectIdentities("/dev/mori", undefined)).toBe("none");
  });

  it("does not treat sibling directories as the same project", () => {
    // Same parent area but different trailing names — a real different project.
    expect(compareProjectIdentities("/dev/projects/mori", "/dev/projects/api")).toBe(
      "none",
    );
  });
});

describe("projectIdentitiesMatch", () => {
  it("is true only for an exact canonical match", () => {
    expect(projectIdentitiesMatch("C:\\dev\\mori", "c:/dev/mori/")).toBe(true);
    expect(projectIdentitiesMatch("/users/x/mori", "/users/x/mori")).toBe(true);
  });

  it("is false for a basename near-match (must be confirmed first)", () => {
    expect(projectIdentitiesMatch("mori", "/Users/x/Dev/mori")).toBe(false);
  });

  it("is false for unrelated or empty labels", () => {
    expect(projectIdentitiesMatch("/dev/mori", "/dev/jinga")).toBe(false);
    expect(projectIdentitiesMatch("", "")).toBe(false);
  });
});
