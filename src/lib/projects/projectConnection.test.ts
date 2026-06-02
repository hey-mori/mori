import { describe, expect, it } from "vitest";
import {
  addProjectAlias,
  buildProjectConnectionCandidates,
  compareProjectIdentities,
  type ConnectedProject,
  getProjectAliases,
  normalizeProjectIdentity,
  projectIdentitiesMatch,
  projectMatchesWithAliases,
  removeProjectAlias,
} from "./projectConnection";

function connection(partial: Partial<ConnectedProject>): ConnectedProject {
  return {
    projectKey: partial.projectKey ?? "/Users/x/dev/mori",
    aliases: partial.aliases ?? [],
    createdAt: partial.createdAt ?? "2026-06-01T00:00:00.000Z",
    updatedAt: partial.updatedAt ?? "2026-06-01T00:00:00.000Z",
  };
}

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

describe("getProjectAliases", () => {
  it("returns a project's confirmed aliases, matching the key canonically", () => {
    const connections = [connection({ projectKey: "C:/dev/mori", aliases: ["mori"] })];
    expect(getProjectAliases(connections, "C:\\dev\\mori")).toEqual(["mori"]);
    expect(getProjectAliases(connections, "/other")).toEqual([]);
  });
});

describe("projectMatchesWithAliases", () => {
  const connections = [
    connection({ projectKey: "/Users/x/dev/mori", aliases: ["mori"] }),
  ];

  it("matches on exact canonical identity", () => {
    expect(projectMatchesWithAliases("/Users/x/dev/mori", "/users/x/dev/mori/", connections)).toBe(
      true,
    );
  });

  it("matches a label that a confirmed alias covers", () => {
    expect(projectMatchesWithAliases("/Users/x/dev/mori", "mori", connections)).toBe(true);
  });

  it("does not match an unconfirmed basename near-match", () => {
    expect(projectMatchesWithAliases("/Users/x/dev/mori", "mori", [])).toBe(false);
    expect(projectMatchesWithAliases("/Users/x/dev/mori", "/play/mori", connections)).toBe(
      false,
    );
  });
});

describe("buildProjectConnectionCandidates", () => {
  it("proposes basename near-matches, grouped by canonical label and counted", () => {
    const candidates = buildProjectConnectionCandidates({
      projectKey: "/Users/x/dev/mori",
      sources: [
        { id: "a", label: "mori", title: "리팩터링 세션" },
        { id: "b", label: "Mori" },
        { id: "c", label: "/Users/x/dev/mori" }, // exact — already grouped
        { id: "d", label: "/Users/x/dev/jinga" }, // unrelated
      ],
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      canonicalKey: "mori",
      displayLabel: "mori",
      strength: "basename",
      confidence: "low",
      count: 2,
      sampleTitle: "리팩터링 세션",
    });
    expect(candidates[0]!.sourceIds.sort()).toEqual(["a", "b"]);
  });

  it("excludes labels already confirmed as an alias", () => {
    const candidates = buildProjectConnectionCandidates({
      projectKey: "/Users/x/dev/mori",
      sources: [{ id: "a", label: "mori" }],
      connections: [connection({ projectKey: "/Users/x/dev/mori", aliases: ["mori"] })],
    });
    expect(candidates).toEqual([]);
  });

  it("keeps distinct paths as separate candidates, sorted by count descending", () => {
    const candidates = buildProjectConnectionCandidates({
      projectKey: "/dev/app",
      sources: [
        { id: "1", label: "/a/app" },
        { id: "2", label: "/a/App" }, // same canonical as #1 → count 2
        { id: "3", label: "/b/app" }, // distinct path → its own candidate
      ],
    });
    // Distinct parent paths are distinct candidates (each is its own label to
    // confirm), even though they share the project's "app" basename.
    expect(candidates.map((c) => [c.canonicalKey, c.count])).toEqual([
      ["/a/app", 2],
      ["/b/app", 1],
    ]);
  });
});

describe("addProjectAlias", () => {
  it("creates a new connection record for the first alias", () => {
    const next = addProjectAlias([], "/dev/mori", "mori", "2026-06-03T00:00:00.000Z");
    expect(next).toEqual([
      {
        projectKey: "/dev/mori",
        aliases: ["mori"],
        createdAt: "2026-06-03T00:00:00.000Z",
        updatedAt: "2026-06-03T00:00:00.000Z",
      },
    ]);
  });

  it("appends to an existing record and bumps updatedAt", () => {
    const base = [connection({ projectKey: "/dev/mori", aliases: ["mori"] })];
    const next = addProjectAlias(base, "/dev/mori", "mor713", "2026-06-03T09:00:00.000Z");
    expect(next[0]!.aliases).toEqual(["mori", "mor713"]);
    expect(next[0]!.updatedAt).toBe("2026-06-03T09:00:00.000Z");
  });

  it("is a no-op for an exact match or a duplicate alias", () => {
    const base = [connection({ projectKey: "/dev/mori", aliases: ["mori"] })];
    expect(addProjectAlias(base, "/dev/mori", "/dev/mori/")).toEqual(base);
    expect(addProjectAlias(base, "/dev/mori", "MORI")[0]!.aliases).toEqual(["mori"]);
  });

  it("ignores empty keys or aliases", () => {
    expect(addProjectAlias([], "", "mori")).toEqual([]);
    expect(addProjectAlias([], "/dev/mori", "   ")).toEqual([]);
  });
});

describe("removeProjectAlias", () => {
  it("removes one alias and keeps the record when others remain", () => {
    const base = [connection({ projectKey: "/dev/mori", aliases: ["mori", "mor713"] })];
    const next = removeProjectAlias(base, "/dev/mori", "MORI");
    expect(next[0]!.aliases).toEqual(["mor713"]);
  });

  it("drops the record when its last alias is removed", () => {
    const base = [connection({ projectKey: "/dev/mori", aliases: ["mori"] })];
    expect(removeProjectAlias(base, "/dev/mori", "mori")).toEqual([]);
  });

  it("is a no-op when the alias is not present", () => {
    const base = [connection({ projectKey: "/dev/mori", aliases: ["mori"] })];
    expect(removeProjectAlias(base, "/dev/mori", "ghost")).toEqual(base);
  });
});
