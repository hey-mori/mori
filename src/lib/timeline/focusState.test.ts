import { describe, expect, it } from "vitest";
import { focusStateClassName, getEventFocusState } from "./focusState";

describe("getEventFocusState", () => {
  it("marks the selected event regardless of related set membership", () => {
    expect(
      getEventFocusState({
        itemId: "evt-1",
        selectedItemId: "evt-1",
        focusedSet: new Set(["evt-1", "evt-2"]),
      }),
    ).toBe("selected");
  });

  it("treats focusedSet membership as related", () => {
    expect(
      getEventFocusState({
        itemId: "evt-2",
        selectedItemId: "evt-1",
        focusedSet: new Set(["evt-1", "evt-2"]),
      }),
    ).toBe("related");
  });

  it("falls back to context for non-focused events", () => {
    expect(
      getEventFocusState({
        itemId: "evt-99",
        selectedItemId: "evt-1",
        focusedSet: new Set(["evt-1", "evt-2"]),
      }),
    ).toBe("context");
  });

  it("treats missing selection as context-only", () => {
    expect(
      getEventFocusState({
        itemId: "evt-1",
        selectedItemId: null,
        focusedSet: new Set(["evt-1"]),
      }),
    ).toBe("related");
  });

  it("treats bundle member matches as related", () => {
    expect(
      getEventFocusState({
        itemId: "bundle-1",
        itemEntityIds: ["evt-2", "evt-3"],
        selectedItemId: null,
        focusedSet: new Set(["evt-3"]),
      }),
    ).toBe("related");
  });
});

describe("focusStateClassName", () => {
  it("emits stable, predictable class names", () => {
    expect(focusStateClassName("selected")).toBe("focus-selected");
    expect(focusStateClassName("related")).toBe("focus-related");
    expect(focusStateClassName("context")).toBe("focus-context");
  });
});
