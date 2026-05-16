import { describe, expect, it } from "vitest";
import {
  PRODUCT_AVAILABILITY_LABELS,
  PRODUCT_DATA_LABELS,
  PRODUCT_RUNTIME_LABELS,
  getProductAvailabilityDisplay,
  getProductAvailabilityLabel,
  getProductAvailabilityTone,
  getProductDataDisplay,
  getProductDataLabel,
  getProductRuntimeDisplay,
  getProductRuntimeLabel,
  productAvailabilityFromFeatureStatus,
  productAvailabilityFromIntegrationStatus,
  type ProductAvailabilityState,
} from "./productState";
import type { FeatureStatus } from "../../app/featureStatus";
import type { IntegrationStatus } from "../sources/sourceRegistry";

const HANGUL = /[가-힣]/;

describe("availability label derivation", () => {
  it("exposes the canonical English status labels", () => {
    expect(getProductAvailabilityLabel("available")).toBe("Available");
    expect(getProductAvailabilityLabel("partial")).toBe("Partial");
    expect(getProductAvailabilityLabel("planned")).toBe("Planned");
    expect(getProductAvailabilityLabel("unavailable")).toBe("Unavailable");
    expect(getProductAvailabilityLabel("requiresSetup")).toBe("Requires setup");
    expect(getProductAvailabilityLabel("demoOnly")).toBe("Demo only");
    expect(getProductAvailabilityLabel("browserOnly")).toBe("Browser only");
    expect(getProductAvailabilityLabel("desktopOnly")).toBe("Desktop only");
  });

  it("every availability state carries a Korean description", () => {
    for (const state of Object.keys(
      PRODUCT_AVAILABILITY_LABELS,
    ) as ProductAvailabilityState[]) {
      expect(HANGUL.test(getProductAvailabilityDisplay(state).description)).toBe(
        true,
      );
    }
  });
});

describe("availability tone derivation", () => {
  it("maps available to the success tone and partial to info", () => {
    expect(getProductAvailabilityTone("available")).toBe("success");
    expect(getProductAvailabilityTone("partial")).toBe("info");
  });

  it("never maps a not-ready state to the available (success) tone", () => {
    for (const state of [
      "planned",
      "unavailable",
      "requiresSetup",
    ] as ProductAvailabilityState[]) {
      expect(getProductAvailabilityTone(state)).not.toBe("success");
    }
  });

  it("uses the warning tone for planned and requiresSetup", () => {
    expect(getProductAvailabilityTone("planned")).toBe("warning");
    expect(getProductAvailabilityTone("requiresSetup")).toBe("warning");
  });
});

describe("runtime / storage label derivation", () => {
  it("derives runtime labels and tones", () => {
    expect(getProductRuntimeLabel("browserLocalStorage")).toBe(
      "브라우저 localStorage",
    );
    expect(getProductRuntimeLabel("desktopSQLite")).toBe("데스크톱 SQLite");
    expect(getProductRuntimeDisplay("desktopSQLite").tone).toBe("success");
    expect(getProductRuntimeDisplay("fallbackActive").tone).toBe("warning");
    expect(getProductRuntimeDisplay("localOnly").tone).toBe("neutral");
  });

  it("every runtime state carries a Korean description", () => {
    for (const display of Object.values(PRODUCT_RUNTIME_LABELS)) {
      expect(HANGUL.test(display.description)).toBe(true);
    }
  });
});

describe("data / provenance label derivation", () => {
  it("keeps the canonical trust terms and tones", () => {
    expect(getProductDataLabel("verified")).toBe("Verified");
    expect(getProductDataLabel("observed")).toBe("Observed");
    expect(getProductDataLabel("inferred")).toBe("Inferred");
    expect(getProductDataDisplay("verified").tone).toBe("verified");
    expect(getProductDataDisplay("observed").tone).toBe("observed");
    expect(getProductDataDisplay("inferred").tone).toBe("inferred");
  });

  it("uses Korean labels for the raw-data retention states", () => {
    expect(getProductDataLabel("summaryOnly")).toBe("요약만 보관");
    expect(getProductDataLabel("fullTextRetained")).toBe("원본 전체 보관");
    expect(HANGUL.test(getProductDataLabel("imported"))).toBe(true);
    expect(HANGUL.test(getProductDataLabel("userProvided"))).toBe(true);
  });

  it("every data state carries a Korean description", () => {
    for (const display of Object.values(PRODUCT_DATA_LABELS)) {
      expect(HANGUL.test(display.description)).toBe(true);
    }
  });
});

describe("productAvailabilityFromFeatureStatus", () => {
  it("maps the FeatureStatus vocabulary one-to-one", () => {
    const cases: Array<[FeatureStatus, ProductAvailabilityState]> = [
      ["implemented", "available"],
      ["partial", "partial"],
      ["planned", "planned"],
      ["unavailable", "unavailable"],
    ];
    for (const [status, expected] of cases) {
      expect(productAvailabilityFromFeatureStatus(status)).toBe(expected);
    }
  });

  it("keeps planned / unavailable feature status off the available tone", () => {
    for (const status of ["planned", "unavailable"] as FeatureStatus[]) {
      const tone = getProductAvailabilityTone(
        productAvailabilityFromFeatureStatus(status),
      );
      expect(tone).not.toBe("success");
    }
  });
});

describe("productAvailabilityFromIntegrationStatus", () => {
  it("maps the IntegrationStatus vocabulary, routing mockOnly to demoOnly", () => {
    const cases: Array<[IntegrationStatus, ProductAvailabilityState]> = [
      ["implemented", "available"],
      ["partial", "partial"],
      ["planned", "planned"],
      ["mockOnly", "demoOnly"],
      ["unavailable", "unavailable"],
    ];
    for (const [status, expected] of cases) {
      expect(productAvailabilityFromIntegrationStatus(status)).toBe(expected);
    }
  });

  it("never maps a planned integration to the available tone", () => {
    expect(
      getProductAvailabilityTone(
        productAvailabilityFromIntegrationStatus("planned"),
      ),
    ).not.toBe("success");
  });
});
