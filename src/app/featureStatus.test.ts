import { describe, expect, it } from "vitest";
import {
  FEATURE_REGISTRY,
  FEATURE_STATUS_LABEL,
  FEATURE_STATUS_TONE,
  countFeaturesByStatus,
  getFeature,
  getFeatureControlProps,
  listFeaturesByStatus,
  listFeaturesBySurfacePrefix,
} from "./featureStatus";

describe("FEATURE_REGISTRY", () => {
  it("registry id matches the row key", () => {
    for (const [key, row] of Object.entries(FEATURE_REGISTRY)) {
      expect(row.id).toBe(key);
    }
  });

  it("every planned row carries a disabledReason", () => {
    for (const row of Object.values(FEATURE_REGISTRY)) {
      if (row.status === "planned") {
        expect(row.disabledReason).toBeTruthy();
      }
    }
  });

  it("implemented + partial rows have actionEnabled true", () => {
    for (const row of Object.values(FEATURE_REGISTRY)) {
      if (row.status === "implemented" || row.status === "partial") {
        expect(row.actionEnabled).toBe(true);
      } else {
        expect(row.actionEnabled).toBe(false);
      }
    }
  });

  it("registry is immutable at runtime", () => {
    expect(Object.isFrozen(FEATURE_REGISTRY)).toBe(true);
  });
});

describe("getFeature", () => {
  it("returns the row when the id exists", () => {
    expect(getFeature("timeline.density").label).toBe("Comfortable / Compact density");
  });

  it("throws when the id is unknown", () => {
    // @ts-expect-error — intentional bad input
    expect(() => getFeature("does.not.exist")).toThrow(/Unknown feature id/);
  });
});

describe("getFeatureControlProps", () => {
  it("returns enabled props for an implemented capability", () => {
    const props = getFeatureControlProps("timeline.density");
    expect(props.enabled).toBe(true);
    expect(props.status).toBe("implemented");
    expect(props.statusLabel).toBe(FEATURE_STATUS_LABEL.implemented);
    expect(props.tone).toBe(FEATURE_STATUS_TONE.implemented);
    expect(props.title).toBeUndefined();
  });

  it("returns disabled props for a planned capability with a tooltip", () => {
    const props = getFeatureControlProps("timeline.range.day");
    expect(props.enabled).toBe(false);
    expect(props.status).toBe("planned");
    expect(props.tone).toBe(FEATURE_STATUS_TONE.planned);
    expect(props.title).toMatch(/planned/i);
  });

  it("honours userFacingStatus on partial rows", () => {
    const props = getFeatureControlProps("memory.savedSessions");
    expect(props.status).toBe("partial");
    expect(props.statusLabel).toMatch(/Partial/i);
  });

  it("marks shipped Timeline inspector correction actions as enabled", () => {
    const shippedInspectorActions = [
      "timeline.inspector.editEvent",
      "timeline.inspector.split",
      "timeline.inspector.merge",
      "timeline.inspector.createIssue",
      "timeline.inspector.addNote",
      "timeline.inspector.memoSave",
    ] as const;

    for (const id of shippedInspectorActions) {
      const props = getFeatureControlProps(id);
      expect(props.enabled).toBe(true);
      expect(props.status).toBe("implemented");
      expect(props.title).toBeUndefined();
    }
  });
});

describe("listFeaturesByStatus / listFeaturesBySurfacePrefix", () => {
  it("returns only rows with the matching status", () => {
    const planned = listFeaturesByStatus("planned");
    expect(planned.length).toBeGreaterThan(0);
    expect(planned.every((row) => row.status === "planned")).toBe(true);
  });

  it("filters by surface prefix", () => {
    const timeline = listFeaturesBySurfacePrefix("timeline");
    expect(timeline.length).toBeGreaterThan(0);
    expect(timeline.every((row) => row.id.startsWith("timeline."))).toBe(true);
  });
});

describe("countFeaturesByStatus", () => {
  it("sums to the total registry size", () => {
    const counts = countFeaturesByStatus();
    const total = counts.implemented + counts.partial + counts.planned + counts.unavailable;
    expect(total).toBe(Object.keys(FEATURE_REGISTRY).length);
  });
});
