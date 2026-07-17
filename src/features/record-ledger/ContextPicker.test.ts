import { describe, expect, it } from "vitest";
import type { KernelContext, MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { recordProject, withProject } from "./ContextPicker";

const contexts: KernelContext[] = [
  { id: "ctx-a", type: "project", name: "mori", createdAt: "2026-07-01T00:00:00Z" },
  { id: "ctx-b", type: "project", name: "ng-gw", createdAt: "2026-07-01T00:00:00Z" },
  { id: "ctx-r", type: "routine", name: "아침 운동", createdAt: "2026-07-01T00:00:00Z" },
];

function note(contextIds: string[]): MoriRecord {
  return {
    id: "n1",
    schemaId: "note",
    title: "메모",
    body: "",
    capturedAt: "2026-07-17T09:00:00Z",
    timeBasis: "capture-fallback",
    status: "active",
    origin: "user",
    ownership: "db",
    contextIds,
    properties: {},
    createdAt: "2026-07-17T09:00:00Z",
    updatedAt: "2026-07-17T09:00:00Z",
  };
}

describe("recordProject", () => {
  it("reads the project a record is filed under, ignoring other memberships", () => {
    expect(recordProject(note(["ctx-r", "ctx-b"]), contexts)?.name).toBe("ng-gw");
  });

  it("is null for an unfiled note, which is how every note is born today", () => {
    expect(recordProject(note([]), contexts)).toBeNull();
    expect(recordProject(note(["ctx-r"]), contexts)).toBeNull();
  });
});

describe("withProject", () => {
  it("files an unfiled note", () => {
    expect(withProject(note([]), contexts, "ctx-a")).toEqual(["ctx-a"]);
  });

  it("replaces the old project rather than accumulating projects", () => {
    expect(withProject(note(["ctx-a"]), contexts, "ctx-b")).toEqual(["ctx-b"]);
  });

  it("never disturbs a non-project membership", () => {
    // A routine membership is written by the machine paths; re-filing a note
    // must not silently drop it.
    expect(withProject(note(["ctx-r", "ctx-a"]), contexts, "ctx-b")).toEqual(["ctx-r", "ctx-b"]);
    expect(withProject(note(["ctx-r", "ctx-a"]), contexts, null)).toEqual(["ctx-r"]);
  });
});
