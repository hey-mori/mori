import { describe, expect, it } from "vitest";
import {
  convertMissingProjectContexts,
  projectContextId,
  projectToContext,
} from "./projectContextConverter";

const fixedNow = () => new Date("2026-07-14T09:00:00.000Z");

describe("projectToContext", () => {
  it("derives a deterministic context id so re-conversion is idempotent", () => {
    const first = projectToContext({ id: "proj-1", name: "mori" }, fixedNow);
    const second = projectToContext({ id: "proj-1", name: "mori" }, fixedNow);
    expect(first.id).toBe(projectContextId("proj-1"));
    expect(first).toEqual(second);
    expect(first.type).toBe("project");
  });
});

describe("convertMissingProjectContexts", () => {
  it("skips projects whose context already exists, preserving user edits", () => {
    const existing = [
      { ...projectToContext({ id: "proj-1", name: "mori" }, fixedNow), name: "사용자가 고친 이름" },
    ];
    const converted = convertMissingProjectContexts(
      [
        { id: "proj-1", name: "mori" },
        { id: "proj-2", name: "ng-gw" },
      ],
      existing,
      fixedNow,
    );
    expect(converted).toHaveLength(1);
    expect(converted[0]?.id).toBe(projectContextId("proj-2"));
  });

  it("converts everything when nothing exists yet", () => {
    const converted = convertMissingProjectContexts(
      [
        { id: "proj-1", name: "mori" },
        { id: "proj-2", name: "ng-gw" },
      ],
      [],
      fixedNow,
    );
    expect(converted.map((context) => context.name)).toEqual(["mori", "ng-gw"]);
  });
});
