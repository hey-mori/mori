import { describe, expect, it } from "vitest";
import type { SourceOption } from "../../domain/types";
import {
  applySourceSelection,
  initialSelectedSourceIds,
  toggleSourceSelection,
} from "./sourceSelection";

function option(over: Partial<SourceOption>): SourceOption {
  return {
    id: "opt-x",
    name: "Source",
    detail: "detail",
    kind: "manualNote",
    enabled: true,
    selected: false,
    status: "available",
    icon: (() => null) as unknown as SourceOption["icon"],
    ...over,
  };
}

const OPTIONS: SourceOption[] = [
  option({ id: "a", status: "available", selected: true }),
  option({ id: "b", status: "available", selected: false }),
  option({ id: "c", status: "planned", selected: false }),
];

describe("initialSelectedSourceIds", () => {
  it("starts with the available, pre-selected sources", () => {
    expect([...initialSelectedSourceIds(OPTIONS)]).toEqual(["a"]);
  });

  it("never starts a planned source selected even if flagged", () => {
    const ids = initialSelectedSourceIds([
      option({ id: "p", status: "planned", selected: true }),
    ]);
    expect(ids.size).toBe(0);
  });
});

describe("toggleSourceSelection", () => {
  it("adds an unselected available source", () => {
    const next = toggleSourceSelection(new Set(["a"]), OPTIONS[1]);
    expect([...next].sort()).toEqual(["a", "b"]);
  });

  it("removes an already-selected source", () => {
    const next = toggleSourceSelection(new Set(["a", "b"]), OPTIONS[0]);
    expect([...next]).toEqual(["b"]);
  });

  it("ignores a planned source", () => {
    const next = toggleSourceSelection(new Set(["a"]), OPTIONS[2]);
    expect([...next]).toEqual(["a"]);
  });

  it("does not mutate the input set", () => {
    const input = new Set(["a"]);
    toggleSourceSelection(input, OPTIONS[1]);
    expect([...input]).toEqual(["a"]);
  });
});

describe("applySourceSelection", () => {
  it("marks selected available sources and clears the rest", () => {
    const applied = applySourceSelection(OPTIONS, new Set(["b"]));
    expect(applied.map((o) => o.selected)).toEqual([false, true, false]);
  });

  it("keeps a planned source unselected even if its id is in the set", () => {
    const applied = applySourceSelection(OPTIONS, new Set(["c"]));
    expect(applied.find((o) => o.id === "c")?.selected).toBe(false);
  });
});
