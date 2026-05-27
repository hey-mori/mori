import { describe, expect, it } from "vitest";
import {
  createUserProject,
  deriveProjectName,
  projectDisplayName,
  removeUserProject,
  renameUserProject,
  type UserProject,
} from "./userProjects";

const NOW = "2026-05-27T00:00:00.000Z";

describe("deriveProjectName", () => {
  it("takes the trailing path segment", () => {
    expect(deriveProjectName("C:/dev/mori")).toBe("mori");
    expect(deriveProjectName("C:\\dev\\ng-gw")).toBe("ng-gw");
  });
  it("returns a single-segment key unchanged", () => {
    expect(deriveProjectName("내 프로젝트")).toBe("내 프로젝트");
  });
});

describe("createUserProject", () => {
  it("prepends a created record", () => {
    const { projects, created } = createUserProject([], { key: "C:/dev/foo", now: NOW });
    expect(created).not.toBeNull();
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ key: "C:/dev/foo", created: true });
  });
  it("no-ops on a duplicate key", () => {
    const seed: UserProject[] = [{ key: "foo", created: true, createdAt: NOW }];
    const { projects, created } = createUserProject(seed, { key: " foo ", now: NOW });
    expect(created).toBeNull();
    expect(projects).toHaveLength(1);
  });
  it("ignores an empty key", () => {
    const { created } = createUserProject([], { key: "   ", now: NOW });
    expect(created).toBeNull();
  });
});

describe("renameUserProject", () => {
  it("overrides the display name of an existing record", () => {
    const seed: UserProject[] = [{ key: "foo", created: true, createdAt: NOW }];
    const next = renameUserProject(seed, "foo", "Friendly Name");
    expect(projectDisplayName("foo", next)).toBe("Friendly Name");
  });
  it("adds an override record for a derived project", () => {
    const next = renameUserProject([], "C:/dev/bar", "Bar", NOW);
    expect(next[0]).toMatchObject({ key: "C:/dev/bar", name: "Bar", created: false });
    expect(projectDisplayName("C:/dev/bar", next)).toBe("Bar");
  });
  it("clears the override when given a blank name", () => {
    const seed: UserProject[] = [{ key: "foo", name: "X", created: true, createdAt: NOW }];
    const next = renameUserProject(seed, "foo", "   ");
    expect(projectDisplayName("foo", next)).toBe("foo");
  });
});

describe("removeUserProject", () => {
  it("removes a created project but keeps derived overrides", () => {
    const seed: UserProject[] = [
      { key: "made", created: true, createdAt: NOW },
      { key: "derived", name: "D", created: false, createdAt: NOW },
    ];
    const afterCreated = removeUserProject(seed, "made");
    expect(afterCreated.map((p) => p.key)).toEqual(["derived"]);
    const afterDerived = removeUserProject(seed, "derived");
    expect(afterDerived.map((p) => p.key)).toEqual(["made", "derived"]);
  });
});

describe("projectDisplayName", () => {
  it("falls back to the derived name without an override", () => {
    expect(projectDisplayName("C:/dev/mori", [])).toBe("mori");
  });
});
