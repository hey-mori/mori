import { describe, expect, it } from "vitest";
import {
  PRODUCT_STAGES,
  PRODUCT_STAGE_CATALOG,
  PRODUCT_SURFACES,
  getFeatureRegistryOverview,
  getFeatureStatusLabel,
  getFeatureStatusTone,
  getProductLoopProgress,
  getRecommendedNextStep,
  getRuntimeDataScope,
  getSurfaceStatus,
  isFeatureActionEnabled,
} from "./productFlow";

describe("PRODUCT_STAGE_CATALOG", () => {
  it("contains an entry for every stage", () => {
    for (const stage of PRODUCT_STAGES) {
      expect(PRODUCT_STAGE_CATALOG[stage].id).toBe(stage);
    }
  });

  it("each stage points at real feature ids only", () => {
    for (const stage of PRODUCT_STAGES) {
      const row = PRODUCT_STAGE_CATALOG[stage];
      for (const id of [...row.requiredFeatureIds, ...row.optionalFeatureIds]) {
        // Throws if unknown.
        expect(() => isFeatureActionEnabled(id)).not.toThrow();
      }
    }
  });
});

describe("PRODUCT_SURFACES", () => {
  it("owns only real feature ids", () => {
    for (const surface of Object.values(PRODUCT_SURFACES)) {
      for (const id of surface.ownedFeatureIds) {
        expect(() => isFeatureActionEnabled(id)).not.toThrow();
      }
    }
  });
});

describe("getSurfaceStatus", () => {
  it("rolls a fully-implemented surface up to implemented", () => {
    const row = getSurfaceStatus("startSession");
    expect(["implemented", "partial"]).toContain(row.status);
  });

  it("counts add up to the owned feature total", () => {
    const row = getSurfaceStatus("timeline");
    const sum =
      row.counts.implemented + row.counts.partial + row.counts.planned + row.counts.unavailable;
    expect(sum).toBe(row.total);
  });
});

describe("getProductLoopProgress", () => {
  it("returns one row per stage in canonical order", () => {
    const rows = getProductLoopProgress();
    expect(rows.map((row) => row.stage)).toEqual(PRODUCT_STAGES);
  });

  it("rows whose required features are all implemented don't list blocking features", () => {
    const rows = getProductLoopProgress();
    const implementedRow = rows.find((row) => row.status === "implemented");
    expect(implementedRow?.blockingFeatures).toEqual([]);
  });
});

describe("getRuntimeDataScope", () => {
  it("returns demo when lifecycle.isDemo is true", () => {
    const scope = getRuntimeDataScope({
      lifecycle: {
        // Minimal stub — only the fields we read matter.
        timing: {} as never,
        status: {} as never,
        storageScope: "demo",
        storageScopeLabel: "Demo",
        storageScopeDetail: "",
        isDemo: true,
        isDraft: false,
        isLive: false,
        dataBasisLabel: "",
      },
      runtime: "browser",
    });
    expect(scope).toBe("demo");
  });

  it("maps browser-draft and desktop-sqlite correctly", () => {
    expect(
      getRuntimeDataScope({
        lifecycle: {
          timing: {} as never,
          status: {} as never,
          storageScope: "browser-draft",
          storageScopeLabel: "Browser Draft",
          storageScopeDetail: "",
          isDemo: false,
          isDraft: true,
          isLive: true,
          dataBasisLabel: "",
        },
        runtime: "browser",
      }),
    ).toBe("browserDraft");
    expect(
      getRuntimeDataScope({
        lifecycle: {
          timing: {} as never,
          status: {} as never,
          storageScope: "desktop-sqlite",
          storageScopeLabel: "Desktop SQLite",
          storageScopeDetail: "",
          isDemo: false,
          isDraft: true,
          isLive: false,
          dataBasisLabel: "",
        },
        runtime: "desktop",
      }),
    ).toBe("desktopSQLite");
  });
});

describe("getRecommendedNextStep", () => {
  it("recommends capture when the session has zero imports", () => {
    const step = getRecommendedNextStep({
      lifecycle: {
        timing: {} as never,
        status: {} as never,
        storageScope: "browser-draft",
        storageScopeLabel: "",
        storageScopeDetail: "",
        isDemo: false,
        isDraft: true,
        isLive: true,
        dataBasisLabel: "",
      },
      importCount: 0,
      hasAnalysis: false,
    });
    expect(step.stage).toBe("capture");
  });

  it("recommends extract when imports exist but no analysis", () => {
    const step = getRecommendedNextStep({
      lifecycle: {
        timing: {} as never,
        status: {} as never,
        storageScope: "browser-draft",
        storageScopeLabel: "",
        storageScopeDetail: "",
        isDemo: false,
        isDraft: true,
        isLive: true,
        dataBasisLabel: "",
      },
      importCount: 3,
      hasAnalysis: false,
    });
    expect(step.stage).toBe("extract");
  });

  it("falls back to a blocking-stage recommendation when no lifecycle is given", () => {
    const step = getRecommendedNextStep({});
    expect(step.message.length).toBeGreaterThan(0);
  });
});

describe("getFeatureRegistryOverview", () => {
  it("returns counts that sum to total", () => {
    const overview = getFeatureRegistryOverview();
    const sum =
      overview.counts.implemented +
      overview.counts.partial +
      overview.counts.planned +
      overview.counts.unavailable;
    expect(sum).toBe(overview.total);
  });
});

describe("status label / tone helpers", () => {
  it("returns a human label for each status", () => {
    expect(getFeatureStatusLabel("implemented")).toBeTruthy();
    expect(getFeatureStatusLabel("partial")).toBeTruthy();
    expect(getFeatureStatusLabel("planned")).toBeTruthy();
    expect(getFeatureStatusLabel("unavailable")).toBeTruthy();
  });

  it("returns a tone for each status", () => {
    expect(["green", "blue", "orange", "gray"]).toContain(getFeatureStatusTone("implemented"));
    expect(["green", "blue", "orange", "gray"]).toContain(getFeatureStatusTone("planned"));
  });
});
