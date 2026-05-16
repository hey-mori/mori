import { describe, expect, it } from "vitest";
import type { StoredAcceptedProjectMemoryStatus } from "../storage/storageTypes";
import {
  classifyMemoryLifecycle,
  describeMemoryLifecycleGroup,
  memoryLifecycleGroupTone,
  memoryLifecycleSortWeight,
  summarizeMemoryLifecycle,
} from "./memoryLifecycle";

const ALL_STATUSES: StoredAcceptedProjectMemoryStatus[] = [
  "accepted",
  "edited",
  "watching",
  "deferred",
  "stale",
  "contradicted",
  "superseded",
  "retired",
];

describe("classifyMemoryLifecycle", () => {
  it("groups guidance-bearing statuses as current", () => {
    expect(classifyMemoryLifecycle("accepted")).toBe("current");
    expect(classifyMemoryLifecycle("edited")).toBe("current");
  });

  it("groups advisory statuses", () => {
    expect(classifyMemoryLifecycle("watching")).toBe("advisory");
    expect(classifyMemoryLifecycle("deferred")).toBe("advisory");
  });

  it("groups review-outcome statuses as needing attention", () => {
    expect(classifyMemoryLifecycle("stale")).toBe("attention");
    expect(classifyMemoryLifecycle("contradicted")).toBe("attention");
  });

  it("groups transitioned statuses as archived", () => {
    expect(classifyMemoryLifecycle("superseded")).toBe("archived");
    expect(classifyMemoryLifecycle("retired")).toBe("archived");
  });

  it("classifies every known status", () => {
    for (const status of ALL_STATUSES) {
      expect(["current", "advisory", "attention", "archived"]).toContain(
        classifyMemoryLifecycle(status),
      );
    }
  });
});

describe("summarizeMemoryLifecycle", () => {
  it("counts statuses by group and totals them", () => {
    const summary = summarizeMemoryLifecycle([
      "accepted",
      "edited",
      "watching",
      "stale",
      "contradicted",
      "retired",
    ]);
    expect(summary).toEqual({
      current: 2,
      advisory: 1,
      attention: 2,
      archived: 1,
      total: 6,
    });
  });

  it("returns an all-zero summary for no memories", () => {
    expect(summarizeMemoryLifecycle([])).toEqual({
      current: 0,
      advisory: 0,
      attention: 0,
      archived: 0,
      total: 0,
    });
  });
});

describe("memoryLifecycleSortWeight", () => {
  it("orders current memory before archived memory", () => {
    expect(memoryLifecycleSortWeight("accepted")).toBeLessThan(
      memoryLifecycleSortWeight("retired"),
    );
    expect(memoryLifecycleSortWeight("contradicted")).toBeLessThan(
      memoryLifecycleSortWeight("superseded"),
    );
  });
});

describe("describeMemoryLifecycleGroup / memoryLifecycleGroupTone", () => {
  it("gives every group a label and a shared product-state tone", () => {
    for (const group of ["current", "advisory", "attention", "archived"] as const) {
      expect(describeMemoryLifecycleGroup(group).length).toBeGreaterThan(0);
      expect(["success", "info", "warning", "neutral"]).toContain(
        memoryLifecycleGroupTone(group),
      );
    }
  });

  it("maps current to success and never to a not-current tone", () => {
    expect(memoryLifecycleGroupTone("current")).toBe("success");
    expect(memoryLifecycleGroupTone("advisory")).toBe("info");
    expect(memoryLifecycleGroupTone("attention")).toBe("warning");
    expect(memoryLifecycleGroupTone("archived")).toBe("neutral");
    for (const group of ["advisory", "attention", "archived"] as const) {
      expect(memoryLifecycleGroupTone(group)).not.toBe("success");
    }
  });
});
