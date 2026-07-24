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
    expect(props.title).toMatch(/예정/);
  });

  it("honours userFacingStatus on partial rows", () => {
    const props = getFeatureControlProps("memory.savedSessions");
    expect(props.status).toBe("partial");
    expect(props.statusLabel).toMatch(/부분/);
  });

  it("marks reachable Timeline inspector correction actions as enabled", () => {
    const reachableInspectorActions = [
      "timeline.inspector.editEvent",
      "timeline.inspector.createIssue",
      "timeline.inspector.addNote",
      "timeline.inspector.memoSave",
    ] as const;

    for (const id of reachableInspectorActions) {
      const props = getFeatureControlProps(id);
      expect(props.enabled).toBe(true);
      expect(props.status).toBe("implemented");
      expect(props.title).toBeUndefined();
    }
  });

  // Split and merge are implemented in sessionStore and have zero callers: the
  // inspector says they moved to the row context menu, and that menu never
  // built them. The registry has to say a user cannot reach them, or it is
  // advertising a control that does not exist.
  it("reports built-but-unreachable actions as unavailable, not implemented", () => {
    for (const id of ["timeline.inspector.split", "timeline.inspector.merge"] as const) {
      const props = getFeatureControlProps(id);
      expect(props.enabled).toBe(false);
      expect(props.status).toBe("unavailable");
      // Never "예정": that would read as coming soon, which is a second lie.
      expect(props.statusLabel).not.toMatch(/예정/);
      expect(props.statusLabel).toMatch(/사용 불가/);
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

// The registry exists so the codebase keeps one honest answer to "does this
// capability exist for a user today". Its failure mode is silent: a row keeps
// saying "implemented" long after the entry point that reached it was retired,
// and nothing breaks. These guards make that drift cost a red test.
describe("honesty contract", () => {
  it("gives every unreachable capability a reason the user can read", () => {
    for (const row of listFeaturesByStatus("unavailable")) {
      expect(
        row.disabledReason ?? row.userFacingStatus,
        `${row.id} is unavailable but explains nothing`,
      ).toBeTruthy();
    }
  });

  it("never labels an unavailable capability as upcoming", () => {
    for (const row of listFeaturesByStatus("unavailable")) {
      const label = row.userFacingStatus ?? FEATURE_STATUS_LABEL[row.status];
      expect(label, `${row.id} reads as coming soon`).not.toMatch(/예정/);
    }
  });

  it("keeps the capabilities audited as unreachable out of the implemented set", () => {
    // Verified by grep at the time of writing: split/merge have zero callers,
    // the add-source paths route to a consumer that does not exist, and the
    // memory hub has no navigation producer.
    const unreachable = [
      "timeline.inspector.split",
      "timeline.inspector.merge",
      "evidence.addSource.manualNote",
      "evidence.addSource.urlImport",
      "evidence.addSource.aiTranscriptPaste",
      "evidence.addSource.gitDiffPaste",
      "evidence.addSource.tauriGitDiff",
      "evidence.addSource.connectorJsonl",
      "memory.globalHub",
    ] as const;

    for (const id of unreachable) {
      expect(FEATURE_REGISTRY[id].status, `${id} claims to be reachable`).not.toBe("implemented");
    }
  });
});
